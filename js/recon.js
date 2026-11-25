/* AddAll: поштучная сверка с внешним списком и отчётный период.
   Сверка: загружается список случаев из независимого журнала (CSV или Excel),
   каждый случай сопоставляется с эпизодами регистра по центру, № ИБ и внешнему номеру или дате. Видно, кто совпал, кого нет в регистре,
   кто есть в регистре, но нет в списке, и возможные дубли. По каждому расхождению сохраняется решение.
   Хранится в разделе recon (ФИО из файла не сохраняются).
   Отчётный период: проверка готовности (охват, полнота наблюдения, черновики, открытые запросы), приём периода
   и выпуск отчёта снимком в раздел releases. Снимок не меняется; исправление выпускается новой версией с объяснением.
   Подключается после followup.js, до net.js. */
'use strict';

const Recon = {
  TOL: 3,
  rendering: new WeakMap(),
  MISSING: { excluded: 'не подходит под критерии', listerr: 'ошибка в списке', pending: 'будет внесён в регистр' },
  EXTRA: { ok: 'подходит, в списке пропущен', wrong: 'внесён ошибочно, исправить регистр' },
  /* № ИБ сравниваются без пробелов, дефисов и знаков; кириллические буквы, похожие на латинские, приводятся к латинице */
  norm: v => String(v ?? '').toUpperCase().replace(/[АВЕКМНОРСТХУ]/g, ch => 'ABEKMHOPCTXY'['АВЕКМНОРСТХУ'.indexOf(ch)]).replace(/[^0-9A-ZА-ЯЁ]/g, ''),
  day(v) {
    if (v == null || v === '') return '';
    const s = String(v).trim();
    if (/^\d{5}(\.\d+)?$/.test(s)) {
      const n = Number(s);
      if (n > 20000 && n < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000).toISOString().slice(0, 10);
    }
    const day = clinicalDay(s);
    if (day) return day;
    const iso = s.match(/^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})$/);
    if (iso) return calendarDay(iso[1] + '-' + iso[2].padStart(2, '0') + '-' + iso[3].padStart(2, '0'));
    const short = s.match(/^([0-9]{1,2})[./-]([0-9]{1,2})[./-]([0-9]{2})$/);
    return short ? clinicalDay(short[1] + '.' + short[2] + '.20' + short[3]) : '';
  },
  async readTable(file) {
    if (/\.xlsx$/i.test(file.name)) return this.xlsx(file);
    return parseCSV(await file.text());
  },
  /* XLSX без библиотек: ZIP, общие строки и первый лист */
  async xlsx(file) {
    const buf = new Uint8Array(await file.arrayBuffer()), dv = new DataView(buf.buffer);
    let eocd = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 70000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('Файл Excel повреждён');
    const files = {};
    let p = dv.getUint32(eocd + 16, true);
    const n = dv.getUint16(eocd + 10, true);
    for (let k = 0; k < n; k++) {
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), loc = dv.getUint32(p + 42, true);
      const name = new TextDecoder().decode(buf.slice(p + 46, p + 46 + nlen));
      if (/^xl\/(sharedStrings|worksheets\/sheet\d+)\.xml$/.test(name)) {
        const start = loc + 30 + dv.getUint16(loc + 26, true) + dv.getUint16(loc + 28, true);
        let data = buf.slice(start, start + csize);
        if (method === 8) data = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
        files[name] = new TextDecoder().decode(data);
      }
      p += 46 + nlen + elen + clen;
    }
    const sheetName = Object.keys(files).filter(x => x.includes('worksheets')).sort()[0];
    if (!sheetName) throw new Error('В файле Excel нет листа');
    const xml = s => new DOMParser().parseFromString(s, 'application/xml');
    const shared = files['xl/sharedStrings.xml'] ? [...xml(files['xl/sharedStrings.xml']).getElementsByTagName('si')].map(si => [...si.getElementsByTagName('t')].map(t => t.textContent).join('')) : [];
    const col = ref => { let c = 0; for (const ch of ref.replace(/\d+/g, '')) c = c * 26 + (ch.charCodeAt(0) - 64); return c - 1; };
    const rows = [];
    for (const row of xml(files[sheetName]).getElementsByTagName('row')) {
      const out = [];
      for (const c of row.getElementsByTagName('c')) {
        const t = c.getAttribute('t'), v = c.getElementsByTagName('v')[0]?.textContent ?? '';
        const value = t === 's' ? shared[Number(v)] ?? '' : t === 'inlineStr' ? [...c.getElementsByTagName('t')].map(x => x.textContent).join('') : v;
        out[col(c.getAttribute('r') || 'A')] = value;
      }
      rows.push([...out].map(x => x ?? ''));
    }
    return rows.filter(r => r.some(x => String(x).trim() !== ''));
  },
  guess(header) {
    const find = re => header.findIndex(h => re.test(String(h)));
    const encounter = find(/(?:№|номер|id)\s*(?:эпизода|случая)|^эпизод$|^encounter(?:[ _-]?id)?$|^case[ _-]?id$/i);
    const id = header.findIndex((h, i) => i !== encounter && /(№|номер|n).*(иб|истор|карт)|^иб$|ид|id|history/i.test(String(h)));
    return { id: Math.max(0, id), date: find(/дат|date/i), center: find(/центр|учрежден|больниц|center|facility/i), encounter };
  },
  key: row => row.encounter ? 'ep:' + JSON.stringify([row.id, row.center || '', row.encounter])
    : row.id + '|' + (row.date || '') + (row.center ? '|' + row.center : ''),
  /* сопоставление строк списка с эпизодами периода */
  match(run, episodes, patients) {
    const pById = new Map(patients.map(p => [p.id, p]));
    const byLocal = new Map();
    const ownCenter = ep => ep.episodeCenter ?? pById.get(ep.patientId)?.center ?? '';
    const centers = new Set([...patients.map(p => p.center || ''), ...episodes.map(ownCenter)]);
    const soleCenter = centers.size === 1 ? [...centers][0] : null;
    for (const ep of episodes) {
      const local = this.norm(pById.get(ep.patientId)?.localId);
      if (!local) continue;
      if (!byLocal.has(local)) byLocal.set(local, []);
      byLocal.get(local).push(ep);
    }
    const patientsByLocal = new Map();
    for (const p of patients) {
      const local = this.norm(p.localId);
      if (!local) continue;
      if (!patientsByLocal.has(local)) patientsByLocal.set(local, []);
      patientsByLocal.get(local).push(p);
    }
    const used = new Set(), matched = [], missing = [], out = [];
    for (const row of [...run.rows.filter(row => row.encounter), ...run.rows.filter(row => !row.encounter)]) {
      if (row.date && (row.date < run.from || row.date > run.to)) { out.push(row); continue; }
      const center = row.center || run.center || soleCenter;
      const scoped = center == null ? [] : (byLocal.get(row.id) || []).filter(ep => ownCenter(ep) === center);
      const ranked = row.encounter
        ? scoped.filter(ep => ep.externalEncounterId === row.encounter).map(ep => ({ ep, offset: 0 }))
        : scoped.filter(ep => !used.has(ep.id)).map(ep => ({ ep, offset: row.date ? Math.abs(daysBetween(ep.date, row.date)) : 0 }))
          .filter(candidate => candidate.offset <= this.TOL).sort((a, b) => a.offset - b.offset);
      const unique = ranked.length && !used.has(ranked[0].ep.id) && (ranked.length === 1 || ranked[0].offset < ranked[1].offset);
      if (unique) {
        const pick = ranked[0].ep;
        used.add(pick.id);
        matched.push({ row, ep: pick });
      } else {
        const sameCenter = (patientsByLocal.get(row.id) || []).filter(p => (p.center || '') === center);
        missing.push({ row, patient: sameCenter.length === 1 ? sameCenter[0] : null, ambiguous: center == null || ranked.length > 1 });
      }
    }
    const extra = episodes.filter(ep => !used.has(ep.id));
    /* возможные дубли в регистре: один № ИБ у разных карточек; одни ФИО и дата рождения при разных № ИБ */
    const dups = [];
    for (const [local, list] of patientsByLocal) {
      for (const center of new Set(list.map(p => p.center || ''))) {
        const duplicates = list.filter(p => (p.center || '') === center);
        if (duplicates.length > 1) dups.push({ why: 'один № ИБ ' + local + ' в учреждении ' + (center || 'без названия'), patients: duplicates });
      }
    }
    const byPerson = new Map();
    for (const p of patients) {
      const k = [p.lastName, p.firstName, p.birthDate].map(x => String(x || '').trim().toLowerCase()).join('|');
      if (k.split('|').some(x => !x)) continue;
      if (!byPerson.has(k)) byPerson.set(k, []);
      byPerson.get(k).push(p);
    }
    for (const list of byPerson.values()) if (new Set(list.map(p => this.norm(p.localId))).size > 1) dups.push({ why: 'одинаковые ФИО и дата рождения, разные № ИБ', patients: list });
    const dec = run.decisions || {};
    const d = (k) => dec[k]?.d || '';
    const missKey = x => 'm:' + this.key(x.row), extraKey = ep => 'e:' + ep.id;
    const excluded = missing.filter(x => ['excluded', 'listerr'].includes(d(missKey(x)))).length;
    const okExtra = extra.filter(ep => d(extraKey(ep)) === 'ok').length;
    const expected = matched.length + missing.length - excluded + okExtra;
    const found = matched.length + okExtra;
    const unresolved = missing.filter(x => !d(missKey(x))).length + extra.filter(ep => !d(extraKey(ep))).length;
    return { matched, missing, extra, out, dups, listDups: run.listDups || 0, expected, found, unresolved, missKey, extraKey,
      pct: expected ? Math.round(1000 * found / expected) / 10 : null };
  },
  async runFor(reg, filter) {
    return (await DB.all('recon')).find(r => r.registryId === reg.id && r.from === filter.from && r.to === filter.to && r.eventType === filter.eventType && (r.center || '') === (filter.center || '')) || null;
  },
  /* карточка поштучной сверки на экране охвата */
  async render(box, reg, patients, events, filter, canSave) {
    if (!box) return;
    const request = {};
    this.rendering.set(box, request);
    const episodes = Coverage.episodes(reg, patients, events, filter);
    const run = await this.runFor(reg, filter);
    if (!box.isConnected || this.rendering.get(box) !== request) return;
    const head = `<h2>Поштучная сверка со списком</h2>
      <p class="muted">Загрузите CSV или Excel из независимого журнала за тот же период. Нужен № ИБ. Для общего списка укажите учреждение. Внешний номер эпизода или дата помогают различать повторные случаи. ФИО из файла не сохраняются.</p>`;
    const upload = canSave ? `<div class="grid"><div class="fld"><label class="flab" for="rcFile">Файл списка</label><input class="inp" type="file" id="rcFile" accept=".csv,.txt,.xlsx"></div>
      <div class="fld"><label class="flab" for="rcSource">Источник и критерии отбора</label><input class="inp" id="rcSource" maxlength="250" value="${esc(run?.source || '')}" placeholder="Например, журнал госпитализаций"></div></div>
      <button class="btn xs" id="rcTemplate" type="button">Скачать шаблон CSV</button><div id="rcMap"></div>` : '';
    if (!run) { box.innerHTML = head + (canSave ? upload : '<p class="muted">Сверка за этот период ещё не проводилась.</p>'); this.bindUpload(box, reg, patients, events, filter, null); return; }
    const m = this.match(run, episodes, patients);
    const pById = new Map(patients.map(p => [p.id, p]));
    const sel = (key, opts, cur) => canSave ? `<select class="inp sm" data-rc="${esc(key)}"><option value="">решение не принято</option>${Object.entries(opts).map(([k, t]) => `<option value="${k}" ${cur === k ? 'selected' : ''}>${t}</option>`).join('')}</select>` : esc(opts[cur] || 'решение не принято');
    const note = key => canSave ? `<input class="inp sm" data-rcn="${esc(key)}" maxlength="200" placeholder="комментарий" value="${esc(run.decisions?.[key]?.note || '')}">` : esc(run.decisions?.[key]?.note || '');
    box.innerHTML = head + `
      <p><b>Список:</b> ${run.rows.length} случаев${m.out.length ? ` (${m.out.length} вне периода, не учитываются)` : ''}${m.listDups ? `, повторов в файле убрано: ${m.listDups}` : ''}. Источник: ${esc(run.source)}. Обновлён ${fmtDT(run.updatedAt || run.createdAt)}.</p>
      ${run.invalidRows ? '<p class="warnt">Строк с ошибками: ' + run.invalidRows + '. Исправьте источник и замените список перед официальным выпуском.</p>' : ''}
      <div class="tiles"><div class="tile"><b>${m.matched.length}</b><span>совпали</span></div>
        <div class="tile ${m.missing.length ? 'warn' : ''}"><b>${m.missing.length}</b><span>нет в регистре</span></div>
        <div class="tile ${m.extra.length ? 'warn' : ''}"><b>${m.extra.length}</b><span>есть в регистре, нет в списке</span></div>
        <div class="tile"><b>${m.pct == null ? 'нет' : m.pct + '%'}</b><span>охват по списку (${m.found} из ${m.expected})</span></div>
        <div class="tile ${m.unresolved ? 'warn' : ''}"><b>${m.unresolved}</b><span>расхождений без решения</span></div></div>
      ${m.missing.length ? `<h3>Нет в регистре</h3><table class="tbl small"><thead><tr><th>№ ИБ</th><th>Дата</th><th>В регистре</th><th>Решение</th><th>Комментарий</th></tr></thead><tbody>
        ${m.missing.map(x => `<tr><td>${esc(x.row.id)}${x.row.encounter ? '<div class="muted">Эпизод ' + esc(x.row.encounter) + '</div>' : ''}${x.row.center ? '<div class="muted">' + esc(x.row.center) + '</div>' : ''}</td><td>${x.row.date ? fmtDate(x.row.date) : 'нет'}</td><td>${x.ambiguous ? 'нужно уточнить учреждение или эпизод' : x.patient ? `<a href="#patient/${esc(x.patient.id)}">${x.row.encounter ? 'пациент есть, эпизода с этим номером нет' : 'пациент есть, случая на эту дату нет'}</a>` : 'пациента нет'}</td><td>${sel(m.missKey(x), this.MISSING, run.decisions?.[m.missKey(x)]?.d)}</td><td>${note(m.missKey(x))}</td></tr>`).join('')}</tbody></table>` : ''}
      ${m.extra.length ? `<h3>Есть в регистре, нет в списке</h3><table class="tbl small"><thead><tr><th>Пациент</th><th>№ ИБ</th><th>Дата</th><th>Решение</th><th>Комментарий</th></tr></thead><tbody>
        ${m.extra.map(ep => { const p = pById.get(ep.patientId); return `<tr><td><a href="#patient/${esc(ep.patientId)}">${esc(p ? pname(p) : '?')}</a></td><td>${esc(p?.localId || '')}${ep.externalEncounterId ? '<div class="muted">Эпизод ' + esc(ep.externalEncounterId) + '</div>' : ''}</td><td>${fmtDate(ep.date)}</td><td>${sel(m.extraKey(ep), this.EXTRA, run.decisions?.[m.extraKey(ep)]?.d)}</td><td>${note(m.extraKey(ep))}</td></tr>`; }).join('')}</tbody></table>` : ''}
      ${m.dups.length ? `<h3>Возможные дубли в регистре</h3><ul>${m.dups.map(x => `<li>${esc(x.why)}: ${x.patients.map(p => `<a href="#patient/${esc(p.id)}">${esc(pname(p))}</a>`).join(', ')}</li>`).join('')}</ul>` : ''}
      <p class="muted small">При наличии внешнего номера совпадение требует того же учреждения, № ИБ и точного номера эпизода. Для строк без внешнего номера используется ближайшая дата в пределах ${this.TOL} дней. «Не подходит под критерии» и «ошибка в списке» убирают случай из знаменателя. «Подходит, в списке пропущен» добавляет случай в знаменатель и числитель.</p>
      ${canSave ? `<h3>Добавить или обновить список</h3>${upload}` : ''}`;
    if (canSave) {
      const save = async () => { try { await DB.put('recon', run, 'решение по сверке со списком'); } catch (error) { toast(error.message, 'err'); } this.render(box, reg, patients, events, filter, canSave); };
      $$('[data-rc]', box).forEach(s => s.onchange = () => { run.decisions ||= {}; const k = s.dataset.rc; run.decisions[k] = { ...(run.decisions[k] || {}), d: s.value }; if (!s.value && !run.decisions[k].note) delete run.decisions[k]; save(); });
      $$('[data-rcn]', box).forEach(s => s.onchange = () => { run.decisions ||= {}; const k = s.dataset.rcn; run.decisions[k] = { ...(run.decisions[k] || {}), note: s.value.trim() }; save(); });
    }
    this.bindUpload(box, reg, patients, events, filter, run);
  },
  bindUpload(box, reg, patients, events, filter, run) {
    const file = $('#rcFile', box);
    if (!file) return;
    $('#rcTemplate', box).onclick = () => download('AddAll_шаблон_сверки.csv', toCSV([], [
      { label: '№ ИБ' }, { label: 'Дата' }, { label: 'Учреждение' }, { label: 'Внешний номер эпизода' }
    ]), 'text/csv;charset=utf-8');
    file.onchange = async () => {
      if (!file.files.length) return;
      let table;
      try { table = await this.readTable(file.files[0]); } catch (error) { return toast(error.message, 'err'); }
      if (table.length < 2) return toast('В файле нет строк', 'err');
      const header = table[0].map(String), g = this.guess(header);
      const opt = (cur, none) => `${none ? '<option value="-1">нет</option>' : ''}${header.map((h, i) => `<option value="${i}" ${i === cur ? 'selected' : ''}>${esc(h || 'столбец ' + (i + 1))}</option>`).join('')}`;
      $('#rcMap', box).innerHTML = `<div class="grid"><div class="fld"><label class="flab" for="rcId">Столбец № ИБ</label><select class="inp" id="rcId">${opt(g.id)}</select></div>
        <div class="fld"><label class="flab" for="rcDate">Столбец даты</label><select class="inp" id="rcDate">${opt(g.date, true)}</select></div>
        <div class="fld"><label class="flab" for="rcCenter">Столбец учреждения</label><select class="inp" id="rcCenter">${opt(g.center, true)}</select></div>
        <div class="fld"><label class="flab" for="rcEpisode">Столбец внешнего номера эпизода</label><select class="inp" id="rcEpisode">${opt(g.encounter, true)}</select></div>
        ${run ? '<div class="fld"><label class="flab" for="rcMode">Как обновить список</label><select class="inp" id="rcMode"><option value="append">Добавить строки к прежнему списку</option><option value="replace">Заменить исправленным списком за период</option></select></div>' : ''}
        <div class="row"><button class="btn primary" id="rcGo">Сверить (строк: ${table.length - 1})</button></div></div>`;
      $('#rcGo', box).onclick = async () => {
        const source = $('#rcSource', box).value.trim();
        if (!source) return toast('Укажите источник и критерии отбора', 'err');
        const ci = +$('#rcId', box).value, di = +$('#rcDate', box).value, oi = +$('#rcCenter', box).value, ei = +$('#rcEpisode', box).value;
        const columns = [ci, di, oi, ei].filter(index => index >= 0);
        if (new Set(columns).size !== columns.length) return toast('Выберите отдельный столбец для каждого значения', 'err');
        const activeCenters = [...new Set([...patients.map(p => p.center), ...events.map(e => e.episodeCenter)].filter(Boolean))];
        const known = [...new Set([...(Settings.data.centers || []), filter.center, ...activeCenters].filter(Boolean))];
        if (!filter.center && (activeCenters.length || known.length) > 1 && oi < 0) return toast('Для общего списка выберите столбец учреждения', 'err');
        const replace = $('#rcMode', box)?.value === 'replace';
        const seen = new Map((replace ? [] : run?.rows || []).map(row => [this.key(row), row]));
        let dupInFile = 0, bad = 0;
        const fresh = new Set();
        for (const line of table.slice(1)) {
          const rawCenter = oi >= 0 ? String(line[oi] ?? '').trim() : '';
          const center = rawCenter && known.find(name => name.toLowerCase() === rawCenter.toLowerCase());
          const encounter = ei >= 0 ? String(line[ei] ?? '').trim() : '';
          const row = { id: this.norm(line[ci]), date: di >= 0 ? this.day(line[di]) : '', ...(center ? { center } : {}), ...(encounter ? { encounter } : {}) };
          if (!row.id || row.id.length > 60 || encounter.length > 120 || /[\u0000-\u001f\u007f]/.test(encounter)
            || (di >= 0 && String(line[di] ?? '').trim() && !row.date)
            || (oi >= 0 && !center) || (filter.center && center && center !== filter.center)) { bad++; continue; }
          const k = this.key(row);
          if (fresh.has(k)) { dupInFile++; continue; }
          fresh.add(k); seen.set(k, row);
        }
        if (!fresh.size) return toast('В файле нет пригодных строк. Проверьте номер карты, дату, учреждение и внешний номер эпизода', 'err');
        const missingKeys = new Set([...seen.keys()].map(key => 'm:' + key));
        const decisions = replace ? Object.fromEntries(Object.entries(run?.decisions || {})
          .filter(([key]) => key.startsWith('e:') || missingKeys.has(key))) : run?.decisions || {};
        const record = { ...(run || {}), registryId: reg.id, from: filter.from, to: filter.to, eventType: filter.eventType, center: filter.center || '', source,
          rows: [...seen.values()], decisions, listDups: (replace ? 0 : run?.listDups || 0) + dupInFile,
          invalidRows: (replace ? 0 : run?.invalidRows || 0) + bad, updatedAt: nowISO() };
        try { await DB.put('recon', record, run ? 'обновление списка для сверки' : 'сверка со списком'); } catch (error) { return toast(error.message, 'err'); }
        toast(`Сверено. ${bad ? `Строк с ошибками пропущено: ${bad}. ` : ''}${dupInFile ? `Повторов в файле: ${dupInFile}.` : ''}`);
        this.render(box, reg, patients, events, filter, true);
      };
    };
  }
};

/* ---------- Отчётный период: готовность, приём, выпуск отчёта ---------- */
const Period = {
  async collect(reg, filter) {
    const [patients, events, queries, tasks] = await Promise.all([Data.patients(reg.id), Data.events(reg.id), DB.all('queries'), DB.all('tasks')]);
    const visible = patients.filter(p => typeof visibleP !== 'function' || visibleP(p));
    const episodes = Coverage.episodes(reg, visible, events, filter);
    const epIds = new Set(episodes.map(e => e.id));
    const link = Episodes.link(reg, events);
    const cohortEvents = events.filter(e => epIds.has(link.get(e.id)) || epIds.has(e.id));
    const pids = new Set(episodes.map(e => e.patientId));
    const cohortPatients = visible.filter(patient => pids.has(patient.id));
    const cohortTasks = tasks.filter(task => epIds.has(task.episodeId));
    const cohortQueries = queries.filter(q => q.registryId === reg.id && pids.has(q.patientId));
    const asOf = today();
    const run = await Recon.runFor(reg, filter);
    const recon = run ? Recon.match(run, episodes, visible) : null;
    const follow = FollowQ.summary(FollowQ.build(reg, events, visible, tasks, { episodes, today: asOf }));
    const drafts = cohortEvents.filter(e => e.status === 'черновик').length;
    const orphans = Episodes.orphans(reg, events).filter(e => visible.some(p => p.id === e.patientId));
    const openQ = queries.filter(q => q.registryId === reg.id && pids.has(q.patientId) && q.status !== 'закрыт').length;
    const results = (reg.indicators || []).map(ind => {
      const x = evalIndicator(ind, cohortEvents, cohortPatients, reg, { episodes, tasks: cohortTasks, today: asOf });
      const ci = !x.kind && x.den && typeof QI === 'object' ? QI.wilson(x.num, x.den) : null;
      return { id: ind.id, name: ind.name, kind: x.kind, value: x.value, unit: x.unit, inputs: x.inputs, included: x.denIds, outcomes: x.numIds, missing: x.missIds, reasons: x.reasonIds, excluded: x.naIds, den: x.den, num: x.num, miss: x.miss, reason: x.reason || 0, na: x.na, pct: x.pct, lo: ci ? Math.round(ci[0] * 10) / 10 : null, hi: ci ? Math.round(ci[1] * 10) / 10 : null };
    });
    const checks = [
      { ok: !!recon && !recon.unresolved && !run.invalidRows, text: recon ? `Сверка со списком: охват ${recon.pct == null ? 'нет' : recon.pct + '%'} (${recon.found} из ${recon.expected}), расхождений без решения ${recon.unresolved}${run.invalidRows ? ', строк с ошибками ' + run.invalidRows : ''}` : 'Сверка со списком за этот период не проведена' },
      { ok: follow.every(s => !s.missing && !s.partial), text: follow.length ? 'Полнота наблюдения: ' + follow.map(s => `${s.et.name} ${s.done} из ${s.due}${s.missing + s.partial ? `, нет ${s.missing + s.partial}` : ''}${s.reason ? `, с причиной ${s.reason}` : ''}`).join('; ') : 'Ожидаемые формы не настроены' },
      { ok: !drafts, text: `Черновиков в случаях периода: ${drafts}` },
      { ok: !openQ, text: `Открытых запросов по данным: ${openQ}` },
      { ok: !orphans.length, text: `Записей с номером эпизода, которого нет в регистре: ${orphans.length}${orphans.length ? ' (в расчёт не входят; исправьте номер или внесите эпизод)' : ''}` }
    ];
    /* двойной ввод: проверка появляется, только если он включён хотя бы для одной формы */
    const deForms = new Set((reg.eventTypes || []).filter(et => et.doubleEntry).map(et => et.id));
    if (deForms.size) {
      const done = new Set((await DB.all('secondEntries')).filter(x => x.registryId === reg.id && x.status === 'сверено').map(x => x.eventId));
      const open = cohortEvents.filter(e => deForms.has(e.type) && e.status !== 'черновик' && !done.has(e.id)).length;
      checks.push({ ok: !open, text: `Двойной ввод не завершён (нет второго ввода или не сверены расхождения): ${open}` });
    }
    return { patients: cohortPatients, episodes, cohortEvents, cohortTasks, cohortQueries, run, recon, follow, drafts, openQ, orphans, results, checks, asOf };
  },
  fingerprint(reg, data) {
    const revisions = rows => rows.map(row => [row.id, row.rev || 0, row.updatedAt || row.createdAt || '']).sort((a, b) => a[0].localeCompare(b[0]));
    return JSON.stringify([reg.version || 1, revisions(data.patients), revisions(data.cohortEvents), revisions(data.cohortTasks),
      revisions(data.cohortQueries), data.run?.id || '', data.run?.updatedAt || '',
      data.results.map(({ id, num, den, miss, na }) => [id, num, den, miss, na]), data.checks.map(check => check.ok)]);
  },
  snapshot(reg, data) {
    const patients = new Map(data.patients.map(patient => [patient.id, patient]));
    const measurements = new Map();
    for (const ind of reg.indicators || []) {
      if (!measurements.has(ind.et)) measurements.set(ind.et, new Set());
      for (const condition of [ind.num, ind.denom]) if (condition?.key) measurements.get(ind.et).add(condition.key);
      for (const key of [ind.measure?.field, ind.measure?.exposure, ind.measure?.count]) if (key) measurements.get(ind.et).add(key);
    }
    return { asOf: data.asOf, episodes: data.episodes.map(event => ({ id: event.id, patientId: event.patientId, date: event.date,
        center: event.episodeCenter ?? patients.get(event.patientId)?.center ?? '' })),
      events: data.cohortEvents.map(event => {
        const values = computeValues(reg, patients.get(event.patientId), etById(reg, event.type), event.data, event.date);
        const keys = measurements.get(event.type) || [];
        return { id: event.id, patientId: event.patientId, type: event.type, date: event.date, status: event.status, rev: event.rev,
          updatedAt: event.updatedAt, schemaVersion: event.schemaVersion, anchorEventId: event.anchorEventId, followDue: event.followDue,
          values: Object.fromEntries([...keys].map(key => [key, values[key] ?? null])),
          missing: Object.fromEntries([...keys].filter(key => values._na?.[key]).map(key => [key, values._na[key]])) };
      }),
      decisions: Object.entries(data.run?.decisions || {}).map(([id, decision]) => ({ id, status: decision.d })),
      tasks: data.cohortTasks.map(task => ({ episodeId: task.episodeId, typeId: task.typeId, due: task.due, status: task.status }))
    };
  },
  /* определение показателя словами: форма, условие числителя и знаменателя, цель */
  defText(reg, ind) {
    const et = etById(reg, ind.et), fields = formFields(et || {});
    const ops = { eq: '=', ne: '≠', gt: '>', lt: '<', in: 'одно из', filled: 'заполнено', empty: 'не заполнено' };
    const cond = c => { if (!c?.key) return ''; const f = fields.find(x => x.key === c.key); return `«${f?.label || c.key}» ${ops[c.op] || c.op}${['filled', 'empty'].includes(c.op) ? '' : ' ' + (c.value ?? '')}`; };
    return `форма «${et?.name || ind.et}»; числитель: ${cond(ind.num) || 'все случаи'}${ind.denom?.key ? `; знаменатель: ${cond(ind.denom)}` : ''}${ind.target !== '' && ind.target != null ? `; цель ${ind.target}` : ''}${ind.ref ? `; источник цели: ${ind.ref}` : ''}`;
  },
  table(results, prev) {
    const f = v => v == null ? 'нет' : String(v).replace('.', ',');
    return `<table class="tbl"><thead><tr><th>Показатель</th><th>Результат</th><th>95% ДИ</th><th>В расчёте</th><th>Неизвестен исход</th>${prev ? '<th>Прошлая версия</th>' : ''}</tr></thead><tbody>
      ${results.map(r => { const p = prev?.find(x => x.id === r.id); return `<tr><td>${esc(r.name)}</td><td><b>${r.kind ? esc(RegistryMeasure.summary(r, f)) : r.pct == null ? 'нет данных' : f(r.pct) + '%'}</b> <span class="muted">${r.num}/${r.den}</span></td><td>${r.lo == null ? '' : f(r.lo) + '-' + f(r.hi) + '%'}</td><td>${r.den}</td><td>${r.miss}${r.reason ? ` (с причиной ${r.reason})` : ''}</td>${prev ? `<td>${p ? (p.kind ? esc(RegistryMeasure.summary(p, f)) : p.pct == null ? 'нет данных' : f(p.pct) + '%') + ` <span class="muted">${p.num}/${p.den}</span>` : 'нет'}</td>` : ''}</tr>`; }).join('')}</tbody></table>`;
  }
};

Routes.period = async (main, regId = '') => {
  const regs = await Data.registries();
  const reg = regs.find(r => r.id === regId) || regs[0];
  if (!reg) { main.innerHTML = '<div class="head"><h1>Отчётный период</h1></div>' + emptyState('Нет регистров.'); return; }
  const st = (Routes.period.filters ||= {});
  const y = String(Number(today().slice(0, 4)) - 1);
  const filter = st[reg.id] ||= { from: y + '-01-01', to: y + '-12-31', eventType: Episodes.opener(reg), center: '' };
  filter.eventType = Episodes.opener(reg);
  const canRelease = can('users') || (can('design') && regManage(reg));
  const [all, approvals] = await Promise.all(['releases', 'periodApprovals'].map(store => DB.all(store).then(rows => rows.filter(row => row.registryId === reg.id))));
  const orgs = [...new Set([...(Settings.data.centers || []), ...(await Data.patients(reg.id)).map(p => p.center),
    ...(await Data.events(reg.id)).map(event => event.episodeCenter)].filter(Boolean))].sort();
  main.innerHTML = `<div class="head"><h1>Отчётный период</h1>${regSelect(regs, reg.id, 'prReg', false)}</div>
    <div class="card"><p>Перед выпуском отчёта проверьте, что за период найдены все случаи, наблюдение собрано, черновики закрыты, а вопросы по данным разобраны. Принятый отчёт сохраняется снимком: состав случаев, определения показателей и результаты на дату выпуска. Его можно открыть позже без изменений; исправление выпускается новой версией с объяснением.</p>
      <div class="grid"><div class="fld"><label class="flab" for="prFrom">Начало периода</label><input class="inp" type="date" id="prFrom" value="${esc(filter.from)}"></div>
        <div class="fld"><label class="flab" for="prTo">Конец периода</label><input class="inp" type="date" id="prTo" value="${esc(filter.to)}"></div>
        <div class="fld"><label class="flab" for="prOrg">Учреждение</label><select class="inp" id="prOrg"><option value="">Все учреждения</option>${orgs.map(o => `<option ${o === filter.center ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></div></div></div>
    <div class="card" id="prReady"></div>
    <div class="card"><h2>Выпущенные версии</h2><div id="prHistory"></div></div>`;
  $('#prReg', main).onchange = e => go('period/' + e.target.value);
  const same = r => r.from === filter.from && r.to === filter.to && (r.center || '') === (filter.center || '');
  let drawSeq = 0;
  const draw = async () => {
    const seq = ++drawSeq;
    const box = $('#prReady', main);
    if (!box) return;
    /* страница могла смениться, пока шёл расчёт: тогда ничего не рисуем */
    const stale = () => seq !== drawSeq || !box.isConnected;
    if (!filter.from || !filter.to || filter.from > filter.to) { box.innerHTML = '<p class="bad">Проверьте границы периода.</p>'; return; }
    box.innerHTML = '<p class="muted">Считаю…</p>';
    const selected = { ...filter };
    const d = await Period.collect(reg, selected);
    if (stale() || selected.from !== filter.from || selected.to !== filter.to || selected.center !== filter.center) return;
    const snapshot = Period.snapshot(reg, d);
    const required = [...new Set(snapshot.episodes.map(ep => ep.center).filter(Boolean))];
    if (selected.center && !required.includes(selected.center)) required.push(selected.center);
    const perCenter = await Promise.all(required.map(async center => {
      const data = center === selected.center ? d : await Period.collect(reg, { ...selected, center });
      const fingerprint = Period.fingerprint(reg, data);
      const approval = approvals.find(row => row.center === center && row.from === selected.from && row.to === selected.to && row.fingerprint === fingerprint);
      return { center, fingerprint, approval, ready: data.checks.every(check => check.ok),
        results: data.results.map(({ id, name, kind, num, den, miss, na, pct }) => ({ id, name, kind, num, den, miss, na, pct })) };
    }));
    if (stale() || selected.from !== filter.from || selected.to !== filter.to || selected.center !== filter.center) return;
    const canSign = !!selected.center && (Auth.user.role === 'admin' || ['lead', 'manager'].includes(Auth.user.role) && Auth.user.center === selected.center);
    const versions = all.filter(same).sort((a, b) => a.version - b.version);
    const last = versions[versions.length - 1];
    box.innerHTML = `<h2>Готовность периода</h2><p>Случаев (${esc(Episodes.openerName(reg).toLowerCase())}) за период: <b>${d.episodes.length}</b>.</p>
      <ul class="pr-checks">${d.checks.map(c => `<li class="${c.ok ? 'okt' : 'warnt'}">${c.ok ? '✓' : '!'} ${esc(c.text)}</li>`).join('')}</ul>
      <p class="muted small">Сверка проводится на экране «Охват регистра», недостающие формы закрываются в «Очереди наблюдения», вопросы в «Запросах по данным». Внутренний отчёт можно выпустить с замечаниями. Для официального нужны проверки и подтверждения учреждений.</p>
      <h3>Показатели за период (до выпуска)</h3>${d.results.length ? Period.table(d.results, last?.results) : '<p class="muted">Показатели не заданы.</p>'}
      ${perCenter.length ? `<p>Подтверждения: ${perCenter.map(row => esc(row.center) + ' · ' + (row.approval ? 'подтверждено' : 'ожидается')).join(', ')}</p>` : ''}
      ${canSign && perCenter.some(row => !row.approval && row.ready) ? '<button class="btn" id="prSign">Подтвердить данные учреждения</button>' : ''}
      ${canRelease ? `<div class="fld"><label class="flab" for="prKind">Вид отчёта</label><select class="inp" id="prKind"><option value="internal">Внутренний</option><option value="official">Официальный</option></select></div>
        <div class="fld"><label class="flab" for="prNote">${last ? 'Что изменилось по сравнению с версией ' + last.version + ' (обязательно)' : 'Комментарий к выпуску'}</label><textarea class="inp" id="prNote" rows="2" maxlength="1000"></textarea></div>
        <div class="row end"><button class="btn primary" id="prGo">${last ? 'Выпустить исправленную версию ' + (last.version + 1) : 'Принять период и выпустить отчёт'}</button></div>` : '<p class="muted">Выпуск отчёта доступен руководителю регистра и администратору.</p>'}`;
    const sign = $('#prSign', box);
    if (sign) sign.onclick = async () => {
      const row = perCenter[0];
      sign.disabled = true;
      try {
        const approval = await DB.put('periodApprovals', { registryId: reg.id, center: row.center, from: selected.from,
          to: selected.to, fingerprint: row.fingerprint, approvedBy: Auth.user.name, approvedAt: nowISO() }, 'подтверждение данных учреждения');
        approvals.push(approval);
        draw();
      } catch (error) { toast(error.message, 'err'); sign.disabled = false; }
    };
    const goBtn = $('#prGo', box);
    if (goBtn) goBtn.onclick = async () => {
      const note = $('#prNote', box).value.trim();
      if (last && !note) return toast('Опишите, что изменилось по сравнению с прошлой версией', 'err');
      const warn = d.checks.filter(c => !c.ok).map(c => c.text);
      const kind = $('#prKind', box).value;
      let exception = '';
      if (kind === 'official' && (warn.length || !perCenter.length || perCenter.some(row => !row.approval))) {
        if (!can('users')) return toast('Устраните замечания и получите подтверждения учреждений', 'err');
        exception = (await promptBox('Обоснуйте исключение для официального выпуска'))?.trim() || '';
        if (exception.length < 8) return toast('Укажите причину исключения', 'err');
      } else if (warn.length && !(await confirmBox('Есть замечания: ' + warn.join(', ') + '. Выпустить внутренний отчёт?'))) return;
      const record = { registryId: reg.id, registryName: reg.name, from: filter.from, to: filter.to, center: filter.center || '', version: (last?.version || 0) + 1,
        schemaVersion: reg.version || 1, unit: Episodes.opener(reg), unitName: Episodes.openerName(reg),
        definitions: clone(reg.indicators || []).map(ind => ({ ...ind, text: Period.defText(reg, ind) })), expected: Episodes.expected(reg).map(et => ({ id: et.id, name: et.name, rule: Episodes.rule(et) })),
        cohort: d.episodes.map(e => e.id), patients: [...new Set(d.episodes.map(e => e.patientId))],
        results: d.results, checks: d.checks, follow: d.follow.map(s => ({ name: s.et.name, done: s.done, due: s.due, missing: s.missing + s.partial, reason: s.reason, wait: s.wait })),
        recon: d.recon ? { found: d.recon.found, expected: d.recon.expected, pct: d.recon.pct, unresolved: d.recon.unresolved, source: (await Recon.runFor(reg, filter))?.source || '' } : null,
        kind, snapshot, exception, approvalIds: perCenter.map(row => row.approval?.id).filter(Boolean),
        approvalFingerprints: Object.fromEntries(perCenter.map(row => [row.center, row.fingerprint])),
        byCenter: perCenter.map(row => ({ center: row.center, results: row.results })),
        note, acceptedBy: Auth.user.name, acceptedAt: nowISO() };
      try { const saved = await DB.put('releases', record, 'выпуск отчёта за период'); all.push(saved); } catch (error) { return toast(error.message, 'err'); }
      toast('Отчёт выпущен, версия ' + record.version);
      draw();
    };
    if (stale() || !$('#prHistory', main)) return;
    const hist = all.filter(same).sort((a, b) => b.version - a.version);
    $('#prHistory', main).innerHTML = hist.length ? `<table class="tbl"><thead><tr><th>Версия</th><th>Выпущен</th><th>Кем</th><th>Случаев</th><th>Комментарий</th><th></th></tr></thead><tbody>
      ${hist.map(r => `<tr><td><b>${r.version}</b></td><td>${fmtDT(r.acceptedAt)}</td><td>${esc(r.acceptedBy || '')}</td><td>${r.cohort.length}</td><td>${esc(r.note || '')}</td><td class="row end"><button class="btn xs" data-prv="${esc(r.id)}">Открыть</button></td></tr>`).join('')}</tbody></table>`
      : '<p class="muted">За этот период отчёт ещё не выпускался.</p>';
    $$('[data-prv]', main).forEach(b => b.onclick = () => {
      const r = all.find(x => x.id === b.dataset.prv), prev = all.filter(same).find(x => x.version === r.version - 1);
      const m = modal(`<h2>${esc(r.registryName || reg.name)}: отчёт за ${fmtDate(r.from)} - ${fmtDate(r.to)}${r.center ? ', ' + esc(r.center) : ''}</h2>
        <p class="muted">Версия ${r.version} · выпущен ${fmtDT(r.acceptedAt)} · ${esc(r.acceptedBy || '')} · версия схемы регистра v${r.schemaVersion} · единица учёта: ${esc(r.unitName || '')} · случаев ${r.cohort.length}</p>
        ${r.note ? `<p><b>${r.version > 1 ? 'Что изменилось' : 'Комментарий'}:</b> ${esc(r.note)}</p>` : ''}
        <p>${r.kind === 'official' ? 'Официальный отчёт' : 'Внутренний отчёт'}</p>
        ${r.exception ? '<p class="warnt">Исключение при выпуске: ' + esc(r.exception) + '</p>' : ''}
        <h3>Показатели</h3>${Period.table(r.results, prev?.results)}
        <h3>Состояние на дату выпуска</h3><ul>${r.checks.map(c => `<li>${c.ok ? '✓' : '!'} ${esc(c.text)}</li>`).join('')}</ul>
        <h3>Определения</h3><ul>${(r.definitions || []).map(i => `<li><b>${esc(i.name)}</b>: ${esc(i.text || Period.defText(reg, i))}</li>`).join('') || '<li>нет</li>'}</ul>
        <p class="muted small">Снимок не меняется после выпуска. Интервал Уилсона 95%. Неизвестный исход в расчёт не входит и показан отдельно.</p>
        <div class="row end"><button class="btn" id="prCsv">Скачать CSV</button><button class="btn" id="prJson">Скачать JSON</button></div>`, { wide: true });
      $('#prCsv', m).onclick = () => download(`${slug(r.registryName || reg.name)}_${r.from}_${r.to}_v${r.version}.csv`, toCSV(r.results, [{ key: 'name', label: 'Показатель' }, { key: 'num', label: 'Числитель' }, { key: 'den', label: 'Знаменатель' }, { key: 'pct', label: '%' }, { key: 'value', label: 'Значение' }, { key: 'unit', label: 'Единица' }, { key: 'lo', label: 'ДИ нижн.' }, { key: 'hi', label: 'ДИ верхн.' }, { key: 'miss', label: 'Исход неизвестен' }, { key: 'reason', label: 'С причиной' }]), 'text/csv');
      $('#prJson', m).onclick = () => download(`${slug(r.registryName || reg.name)}_${r.from}_${r.to}_v${r.version}.json`, JSON.stringify(r, null, 2), 'application/json');
    });
  };
  for (const [id, k] of [['prFrom', 'from'], ['prTo', 'to'], ['prOrg', 'center']]) $('#' + id, main).onchange = e => { filter[k] = e.target.value; draw(); };
  draw();
};

ROUTE_GROUP.period = 'Работа';
NAV_ICONS.period = NAV_ICONS.me;
{
  const previous = navGroups;
  navGroups = async function () {
    const groups = await previous();
    const work = groups.find(group => group.id === 'work');
    if (work?.items && !work.items.some(item => item.r === 'period')) {
      const index = work.items.findIndex(item => item.r === 'coverage');
      work.items.splice(index < 0 ? work.items.length : index + 1, 0, { r: 'period', t: 'Отчётный период', i: '✓' });
    }
    return groups;
  };
}
if (typeof EN === 'object') Object.assign(EN, { 'Отчётный период': 'Reporting period', 'Поштучная сверка со списком': 'Case-level reconciliation' });
