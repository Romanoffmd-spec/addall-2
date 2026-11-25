/* AddAll 2.0: ИИ-помощники регистра.
   1. ИИ-сверка с первичными документами (#aicheck): значения сохранённых форм сравниваются с файлами пациента;
      показывается расхождение или отсутствие подтверждения с цитатой. Цитата, которой нет в тексте документа, не считается подтверждением.
      Решение принимает проверяющий: «Верно» или запрос врачу по полю.
   2. Сводка регистра (#regsummary): числа считает AddAll по правилам отчётного периода (Period.collect), три главные задачи
      выбираются по правилам; ИИ по желанию пересказывает сводку простым языком, получая только агрегированные числа.
   3. Идеи для исследований (#ideas): AddAll считает заполненность полей; ИИ (или правило без ИИ) предлагает вопросы только из реальных полей;
      число подходящих случаев AddAll считает сам. Идею можно сохранить черновиком рукописи.
   Подключается после feedback.js, до net.js. */
'use strict';

const AIAssist = {
  norm: s => String(s ?? '').normalize('NFKC').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim(),
  readyBox() {
    return `<div class="card warnt"><p>ИИ не подключён. Администратор подключает его в «Пользователи и настройки» → «ИИ-ассистент»: локальная модель (данные не покидают учреждение) или внешний сервис.</p></div>`;
  },
  async consentExternal(what) {
    if (AI.local()) return true;
    return confirmBox(`${what} будут отправлены во внешний ИИ-сервис (${AI.cfg().provider}). Для реальных пациентов используйте локальную модель или убедитесь, что это разрешено правилами учреждения. Продолжить?`);
  },
  json(txt) { return AI.parse(txt); },

  /* ---------- 1. ИИ-сверка с документами ---------- */
  readable: f => !f.drawing && f.blob && /\.(pdf|docx|txt|md|csv)$/i.test(f.name || ''),
  async docsFor(patientId, cache) {
    if (cache.has(patientId)) return cache.get(patientId);
    const files = (await DB.all('files')).filter(f => f.patientId === patientId && AIAssist.readable(f));
    const docs = [];
    for (const f of files.slice(0, 8)) {
      try {
        const d = await AI.readFile(new File([f.blob], f.name, { type: f.type || '' }));
        if (d.text && d.text.trim()) docs.push({ id: f.id, name: f.name, text: d.text.slice(0, 40000) });
      } catch (e) { /* файл не читается: пропускаем */ }
    }
    cache.set(patientId, docs);
    return docs;
  },
  checkPrompt(reg, et, ev, rows) {
    return `Ты проверяющий клинического регистра. Сверь значения формы «${et.name}» (регистр «${reg.name}», дата события ${ev.date || 'не указана'}) с медицинскими документами пациента.
Для КАЖДОГО поля из списка определи:
- "подтверждено": документ прямо говорит то же значение;
- "расхождение": документ говорит другое значение (укажи doc_value);
- "нет_в_документах": в документах нет сведений по этому полю.
Учитывай, что документы могут относиться к другим датам и эпизодам: если сведения явно о другом эпизоде, это не расхождение, а "нет_в_документах" с пояснением в note.
Для "подтверждено" и "расхождение" дай точную цитату из документа (до 25 слов, дословно) и имя файла.
Не выдумывай. Ответ только JSON:
{"items":[{"field":"код","status":"подтверждено|расхождение|нет_в_документах","doc_value":"...","quote":"...","file":"...","note":"..."}]}
Поля формы:
${JSON.stringify(rows.map(r => ({ field: r.key, label: r.label, value: r.shown, unit: r.unit || undefined })))}`;
  },
  async checkEvent(reg, ev, patient, docs) {
    const et = etById(reg, ev.type); if (!et) return [];
    const values = computeValues(reg, patient, et, ev.data || {}, ev.date);
    const rows = formFields(et).filter(f => !['calc', 'group', 'complist', 'file', 'image', 'user', 'diagram'].includes(f.type) && !isEmpty(values[f.key]))
      .map(f => ({ key: f.key, label: f.label, unit: f.unit, value: values[f.key], shown: Array.isArray(values[f.key]) ? values[f.key].join('; ') : String(values[f.key]) }));
    if (!rows.length || !docs.length) return [];
    const text = docs.map(d => `=== Файл: ${d.name} ===\n${d.text}`).join('\n\n').slice(0, 90000);
    const raw = AIAssist.json(await AI.call(AIAssist.checkPrompt(reg, et, ev, rows), { text }));
    const all = AIAssist.norm(text);
    return (raw.items || []).map(it => {
      const row = rows.find(r => r.key === it.field); if (!row) return null;
      let status = ['подтверждено', 'расхождение', 'нет_в_документах'].includes(it.status) ? it.status : 'нет_в_документах';
      const quote = String(it.quote || '').trim();
      const found = quote && all.includes(AIAssist.norm(quote));
      /* цитата должна дословно быть в документе, иначе вывод ИИ не принимается как подтверждение или расхождение */
      if (status !== 'нет_в_документах' && !found) status = 'не_проверено';
      return { ev, patient, et, field: row, status, docValue: String(it.doc_value ?? ''), quote: found ? quote : '', file: it.file || '', note: String(it.note || '').slice(0, 300) };
    }).filter(Boolean);
  },
  label: { 'подтверждено': 'подтверждено', 'расхождение': 'расхождение', 'нет_в_документах': 'нет в документах', 'не_проверено': 'цитата не найдена в документе' },
  async raiseQuery(r) {
    const text = r.status === 'расхождение'
      ? `ИИ-сверка: в документе «${r.file}» указано «${r.docValue}», в регистре «${r.field.shown}». Цитата: «${r.quote}». Проверьте значение.`
      : `ИИ-сверка: значение «${r.field.shown}» не нашлось в документах пациента. Приложите документ или проверьте значение.`;
    await DB.put('queries', { eventId: r.ev.id, patientId: r.ev.patientId, registryId: r.ev.registryId, fieldKey: r.field.key, fieldLabel: r.field.label, valueAtRaise: r.ev.data?.[r.field.key] ?? null,
      status: 'открыт', to: r.ev.createdBy || null, source: 'ИИ-сверка', thread: [{ by: Auth.user.id, name: Auth.user.name, ts: nowISO(), text }] }, 'запрос по данным (ИИ-сверка)');
  },

  /* ---------- 2. Сводка регистра ---------- */
  quarterNow() {
    const t = today(), y = Number(t.slice(0, 4)), q = Math.floor((Number(t.slice(5, 7)) - 1) / 3);
    return { from: `${y}-${String(q * 3 + 1).padStart(2, '0')}-01`, to: t, name: `${['I', 'II', 'III', 'IV'][q]} квартал ${y} (по сегодня)` };
  },
  tasks(d, reg) {
    const out = [];
    if (d.recon && (d.recon.unresolved || d.recon.pct < 95)) out.push({ w: 100, t: `Внести пропущенные случаи: охват ${d.recon.pct ?? 'нет'}%, без решения ${d.recon.unresolved || 0}`, r: 'coverage' });
    else if (!d.recon) out.push({ w: 40, t: 'Сверить регистр с независимым списком (журнал операций, статистика), иначе неизвестно, все ли случаи внесены', r: 'coverage' });
    const miss = d.follow.reduce((s, x) => s + x.missing + x.partial, 0);
    if (miss) out.push({ w: 90 + Math.min(miss, 50) / 10, t: `Уточнить исходы: не внесено ожидаемых форм ${miss} (${d.follow.filter(x => x.missing + x.partial).map(x => x.et.name).join(', ')})`, r: 'followup' });
    if (d.orphans.length) out.push({ w: 80, t: `Исправить записи с несуществующим эпизодом: ${d.orphans.length}`, r: 'period' });
    if (d.drafts) out.push({ w: 70 + Math.min(d.drafts, 50) / 10, t: `Завершить черновики: ${d.drafts}`, r: 'patients' });
    if (d.openQ) out.push({ w: 60 + Math.min(d.openQ, 50) / 10, t: `Ответить на открытые запросы по данным: ${d.openQ}`, r: 'quality' });
    const missInd = d.results.filter(x => x.miss).sort((a, b) => b.miss - a.miss)[0];
    if (missInd) out.push({ w: 50, t: `Заполнить данные для показателя «${missInd.name}»: неизвестно у ${missInd.miss}`, r: 'period' });
    return out.sort((a, b) => b.w - a.w).slice(0, 3);
  },

  /* ---------- 3. Идеи для исследований ---------- */
  SAFE: ['number', 'integer', 'yesno', 'select', 'multiselect', 'icd10', 'icdo', 'date', 'calc'],
  async profile(reg) {
    const [patients, events] = await Promise.all([Data.patients(reg.id), Data.events(reg.id)]);
    const vis = patients.filter(p => typeof visibleP !== 'function' || visibleP(p));
    const ids = new Set(vis.map(p => p.id));
    const evs = events.filter(e => ids.has(e.patientId) && e.status !== 'черновик');
    const byPatient = new Map();
    const fields = [];
    for (const et of reg.eventTypes || []) {
      const list = evs.filter(e => e.type === et.id);
      for (const f of formFields(et)) {
        if (!AIAssist.SAFE.includes(f.type) || f.sensitive) continue;
        const key = et.id + '.' + f.key;
        const vals = [];
        for (const e of list) {
          const v = f.type === 'calc' ? computeValues(reg, vis.find(p => p.id === e.patientId), et, e.data || {}, e.date)[f.key] : e.data?.[f.key];
          if (isEmpty(v)) continue;
          vals.push(v);
          if (!byPatient.has(e.patientId)) byPatient.set(e.patientId, new Set());
          byPatient.get(e.patientId).add(key);
        }
        if (!vals.length) continue;
        const top = {}; vals.flat().forEach(v => { if (typeof v !== 'number') top[v] = (top[v] || 0) + 1; });
        fields.push({ key, form: et.name, label: f.label, type: f.type, unit: f.unit || '', filled: byPatientCount(byPatient, key),
          values: Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([v, n]) => `${v} (${n})`).join(', ') });
      }
    }
    function byPatientCount(map, key) { let n = 0; for (const s of map.values()) if (s.has(key)) n++; return n; }
    return { patients: vis.length, fields, byPatient };
  },
  eligible(prof, keys) { let n = 0; for (const s of prof.byPatient.values()) if (keys.every(k => s.has(k))) n++; return n; },
  /* без ИИ: пары «фактор и исход» с наибольшим числом полных случаев */
  ruleIdeas(prof) {
    const outcome = prof.fields.filter(f => f.type === 'yesno' || /осложн|летал|смерт|рецид|несостоят|исход|повторн|реадмис|ответ/i.test(f.label));
    const factor = prof.fields.filter(f => ['select', 'number', 'yesno'].includes(f.type) && !outcome.includes(f));
    const pairs = [];
    for (const o of outcome) for (const x of factor) pairs.push({ o, x, n: AIAssist.eligible(prof, [o.key, x.key]) });
    return pairs.filter(p => p.n >= 10).sort((a, b) => b.n - a.n).slice(0, 6).map(p => ({
      title: `${p.x.label} и ${p.o.label.charAt(0).toLowerCase() + p.o.label.slice(1)}: ретроспективный анализ данных регистра`,
      question: `Связан ли показатель «${p.x.label}» с исходом «${p.o.label}»?`, design: 'ретроспективное когортное исследование по данным регистра',
      fields: [p.x.key, p.o.key], outcome: p.o.key, why: 'Подобрано по правилу: исход и фактор с наибольшим числом полных случаев.' }));
  },
  ideaPrompt(reg, prof) {
    return `Ты научный руководитель клинического регистра «${reg.name}». По описанию накопленных данных предложи 5-7 реалистичных тем для научных статей.
Правила: используй ТОЛЬКО поля из списка (коды key). Не придумывай данных, которых нет. Учитывай число заполненных случаев. Темы на русском, конкретные, как рабочие названия статей.
Пациентов в регистре: ${prof.patients}.
Поля (key, форма, название, тип, заполнено у пациентов, частые значения):
${JSON.stringify(prof.fields.map(f => [f.key, f.form, f.label, f.type, f.filled, f.values]))}
Ответ только JSON: {"ideas":[{"title":"рабочее название статьи","question":"исследовательский вопрос","design":"дизайн","fields":["key", "..."],"outcome":"key главного исхода","why":"почему тема интересна, 1-2 предложения","limits":"главные ограничения"}]}`;
  },
  async saveIdea(reg, idea, prof) {
    const kinds = typeof MS_KINDS === 'object' ? Object.keys(MS_KINDS) : [];
    const kind = kinds.find(k => /art|orig|stat/i.test(k)) || kinds[0];
    const fl = idea.fields.map(k => prof.fields.find(f => f.key === k)).filter(Boolean);
    const secs = (kind ? MS_KINDS[kind].secs : ['Введение', 'Материалы и методы', 'Результаты', 'Обсуждение']).map(t => ({ id: uid('sc'), title: t, html: '' }));
    const intro = secs.find(s => /введ|intro/i.test(s.title)) || secs[0];
    const meth = secs.find(s => /метод|method/i.test(s.title)) || secs[1] || secs[0];
    intro.html = `<p><b>Вопрос исследования.</b> ${esc(idea.question || '')}</p><p>${esc(idea.why || '')}</p>`;
    meth.html = `<p><b>Дизайн:</b> ${esc(idea.design || '')}. Источник данных: регистр «${esc(reg.name)}» (AddAll).</p><p><b>Переменные:</b></p><ul>${fl.map(f => `<li>${esc(f.form)}: ${esc(f.label)} (${esc(f.key)}), заполнено у ${f.filled}</li>`).join('')}</ul><p>Подходит пациентов (все переменные заполнены): ${idea.n} на ${fmtDate(today())}.</p>${idea.limits ? `<p><b>Ограничения:</b> ${esc(idea.limits)}</p>` : ''}`;
    return DB.put('docs', { title: idea.title, kind, style: 'vancouver', authors: Auth.user.name, registryId: reg.id, sections: secs, fromIdea: true }, 'тема исследования из идей');
  }
};

/* ================= маршруты ================= */
Routes.aicheck = async (main) => {
  const regs = (await Data.registries()).filter(r => !r.archivedAt);
  const qn = AIAssist.quarterNow();
  main.innerHTML = `<div class="head"><h1>ИИ-сверка с документами</h1></div>
    <div class="card"><p>Перед сдачей отчёта ИИ сравнивает сохранённые формы с документами пациента (выписки, протоколы, гистология во вкладке «Файлы» карточки). Показываются расхождения и значения без подтверждения, с цитатой и файлом. Решение принимает проверяющий: «Верно» или запрос врачу по полю. Если цитаты нет в тексте документа дословно, вывод ИИ не принимается.</p></div>
    ${AI.ready() ? '' : AIAssist.readyBox()}
    <div class="card"><div class="grid">${regSelect(regs, '', 'acReg', false)}
      <div class="fld"><label class="flab" for="acEt">Форма</label><select class="inp" id="acEt"></select></div>
      <div class="fld"><label class="flab" for="acFrom">С даты</label><input type="date" class="inp" id="acFrom" value="${qn.from}"></div>
      <div class="fld"><label class="flab" for="acTo">По дату</label><input type="date" class="inp" id="acTo" value="${qn.to}"></div>
      <div class="fld"><label class="flab" for="acN">Сколько событий проверить</label><input type="number" class="inp" id="acN" value="20" min="1" max="500"></div></div>
      <label class="chk"><input type="checkbox" id="acRand"> случайная выборка (для контроля того, что ИИ мог пропустить, проверяйте вручную ещё несколько случаев)</label>
      <div class="row"><button class="btn primary" id="acGo" ${AI.ready() ? '' : 'disabled'}>Проверить</button><span id="acSt" class="muted" role="status"></span></div></div>
    <div id="acOut"></div>`;
  if (!regs.length) return;
  const fillEt = () => { const r = regs.find(x => x.id === $('#acReg', main).value); $('#acEt', main).innerHTML = '<option value="">все формы</option>' + (r?.eventTypes || []).map(e => `<option value="${esc(e.id)}">${esc(e.name)}</option>`).join(''); };
  fillEt(); $('#acReg', main).onchange = fillEt;
  $('#acGo', main).onclick = async () => {
    const reg = regs.find(x => x.id === $('#acReg', main).value), et = $('#acEt', main).value, from = $('#acFrom', main).value, to = $('#acTo', main).value, n = Math.max(1, Number($('#acN', main).value) || 20);
    const [patients, events, files] = await Promise.all([Data.patients(reg.id), Data.events(reg.id), DB.all('files')]);
    const withDocs = new Set(files.filter(AIAssist.readable).map(f => f.patientId));
    const people = new Map(patients.filter(p => typeof visibleP !== 'function' || visibleP(p)).map(p => [p.id, p]));
    let list = events.filter(e => e.status !== 'черновик' && people.has(e.patientId) && withDocs.has(e.patientId) && (!et || e.type === et) && (!from || (e.date || '') >= from) && (!to || (e.date || '') <= to));
    if ($('#acRand', main).checked) list = list.map(e => [Math.random(), e]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
    else list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const noDocs = events.filter(e => e.status !== 'черновик' && people.has(e.patientId) && !withDocs.has(e.patientId) && (!et || e.type === et) && (!from || (e.date || '') >= from) && (!to || (e.date || '') <= to)).length;
    list = list.slice(0, n);
    if (!list.length) { $('#acOut', main).innerHTML = `<p class="muted">Нет сохранённых событий с документами за выбранный период.${noDocs ? ` Событий без документов: ${noDocs}.` : ''}</p>`; return; }
    if (!await AIAssist.consentExternal('Документы пациентов и значения форм')) return;
    const btn = $('#acGo', main); btn.disabled = true;
    const cache = new Map(), results = [], errors = [];
    for (let i = 0; i < list.length; i++) {
      const st = $('#acSt', main); if (st) st.textContent = `проверяю ${i + 1} из ${list.length}…`;
      const ev = list[i], p = people.get(ev.patientId);
      try { results.push(...await AIAssist.checkEvent(reg, ev, p, await AIAssist.docsFor(p.id, cache))); }
      catch (error) { errors.push(`${PID.show(p) || pname(p)}: ${error.message}`); }
    }
    btn.disabled = false;
    try { await Audit.log(`ИИ-сверка с документами: событий ${list.length}, полей ${results.length}`, 'registries', reg.id); } catch (e) { }
    const bad = results.filter(r => r.status !== 'подтверждено');
    const cnt = s => results.filter(r => r.status === s).length;
    const box = $('#acOut', main); if (!box) return;
    $('#acSt', main).textContent = '';
    box.innerHTML = `<div class="card"><p><b>Проверено событий ${list.length}, полей ${results.length}.</b> Подтверждено ${cnt('подтверждено')}, расхождений ${cnt('расхождение')}, нет в документах ${cnt('нет_в_документах')}, цитата не найдена ${cnt('не_проверено')}.${noDocs ? ` Событий без документов (не проверялись): ${noDocs}.` : ''}</p>
      ${errors.length ? `<p class="bad small">Не удалось проверить: ${esc(errors.slice(0, 5).join('; '))}</p>` : ''}
      <div class="row"><button class="btn" id="acCsv">Сохранить отчёт (CSV)</button></div></div>
      ${bad.length ? `<table class="tbl"><thead><tr><th>Пациент</th><th>Форма и дата</th><th>Поле</th><th>В регистре</th><th>В документе</th><th>Вывод</th><th></th></tr></thead><tbody>${bad.sort((a, b) => ['расхождение', 'не_проверено', 'нет_в_документах'].indexOf(a.status) - ['расхождение', 'не_проверено', 'нет_в_документах'].indexOf(b.status)).map((r, i) => `<tr data-ac="${i}">
        <td><a href="#patient/${esc(r.patient.id)}">${esc(pname(r.patient))}</a></td><td>${esc(r.et.name)}<div class="muted small">${fmtDate(r.ev.date)}</div></td><td>${esc(r.field.label)}</td><td>${esc(r.field.shown)}</td>
        <td>${esc(r.docValue)}${r.quote ? `<div class="muted small">«${esc(r.quote)}»${r.file ? ' · ' + esc(r.file) : ''}</div>` : ''}${r.note ? `<div class="muted small">${esc(r.note)}</div>` : ''}</td>
        <td class="${r.status === 'расхождение' ? 'bad' : 'warnt'}">${esc(AIAssist.label[r.status])}</td>
        <td><div class="row"><button class="btn xs" data-ok="${i}">Верно</button><button class="btn xs" data-q="${i}">Запрос врачу</button></div></td></tr>`).join('')}</tbody></table>` : '<p class="ok">Расхождений и значений без подтверждения нет.</p>'}`;
    $$('[data-ok]', box).forEach(b => b.onclick = () => b.closest('tr').remove());
    $$('[data-q]', box).forEach(b => b.onclick = async () => { await AIAssist.raiseQuery(bad[Number(b.dataset.q)]); toast('Запрос создан'); b.closest('tr').remove(); });
    $('#acCsv', box).onclick = () => download(`ИИ-сверка ${reg.name} ${today()}.csv`, toCSV(results.map(r => ({ patient: PID.show(r.patient) || r.patient.localId, form: r.et.name, date: r.ev.date, field: r.field.label, value: r.field.shown, status: AIAssist.label[r.status], doc: r.docValue, quote: r.quote, file: r.file, note: r.note })),
      ['patient', 'form', 'date', 'field', 'value', 'status', 'doc', 'quote', 'file', 'note'].map(k => ({ key: k, label: k }))), 'text/csv');
  };
};

Routes.regsummary = async (main, regId = '') => {
  const regs = (await Data.registries()).filter(r => !r.archivedAt);
  if (!regs.length) { main.innerHTML = '<div class="head"><h1>Сводка регистра</h1></div><p>Нет доступных регистров.</p>'; return; }
  const reg = regs.find(r => r.id === regId) || regs[0];
  const qn = AIAssist.quarterNow();
  main.innerHTML = `<div class="head"><h1>Сводка регистра</h1><div class="row">${regSelect(regs, reg.id, 'rsReg', false)}</div></div><div id="rsBody"><p class="muted">Считаю…</p></div>`;
  $('#rsReg', main).onchange = e => go('regsummary/' + e.target.value);
  const base = { eventType: Episodes.opener(reg) };
  const prevQ = (typeof Feedback === 'object' ? Feedback.quarters(1)[0] : null);
  const [d, p] = await Promise.all([Period.collect(reg, { ...base, from: qn.from, to: qn.to }), prevQ ? Period.collect(reg, { ...base, from: prevQ.from, to: prevQ.to }) : null]);
  const box = $('#rsBody', main); if (!box) return;
  const fmt = x => x.value == null ? 'нет данных' : (x.kind ? String(x.value) + (x.unit ? ' ' + x.unit : '') : `${Math.round(x.value * 1000) / 10}% (${x.num} из ${x.den})`);
  const tasks = AIAssist.tasks(d, reg);
  const facts = { registry: reg.name, period: qn.name, cases: d.episodes.length, previous: p ? { period: prevQ.name, cases: p.episodes.length } : null,
    checks: d.checks.map(c => ({ ok: c.ok, text: c.text })), indicators: d.results.map(x => ({ name: x.name, now: fmt(x), before: p ? fmt(p.results.find(y => y.id === x.id) || {}) : null, unknown: x.miss })), tasks: tasks.map(t => t.t) };
  box.innerHTML = `<div class="card"><h3>${esc(qn.name)}</h3><p>Случаев за период: <b>${d.episodes.length}</b>${p ? `; за ${esc(prevQ.name)}: ${p.episodes.length}` : ''}.</p>
      <h3>Три главные задачи перед сдачей отчёта</h3>${tasks.length ? `<ol id="rsTasks">${tasks.map(t => `<li><a href="#${t.r}">${esc(t.t)}</a></li>`).join('')}</ol>` : '<p class="ok" id="rsTasks">Срочных задач нет: проверки периода пройдены.</p>'}</div>
    <div class="card"><h3>Проверки периода</h3><ul class="pr-checks">${d.checks.map(c => `<li class="${c.ok ? 'okt' : 'warnt'}">${c.ok ? '✓' : '!'} ${esc(c.text)}</li>`).join('')}</ul></div>
    ${d.results.length ? `<div class="card"><h3>Что изменилось</h3><table class="tbl"><thead><tr><th>Показатель</th><th>Сейчас</th><th>${p ? esc(prevQ.name) : 'Прошлый квартал'}</th><th>Неизвестно</th></tr></thead><tbody>${facts.indicators.map(x => `<tr><td>${esc(x.name)}</td><td>${esc(x.now)}</td><td>${esc(x.before || '')}</td><td>${x.unknown || ''}</td></tr>`).join('')}</tbody></table><p class="muted small">Квартал ещё идёт: доли за неполный период менее точны. Числа считаются по тем же правилам, что и отчётный период.</p></div>` : ''}
    <div class="card"><h3>Простым языком</h3><p class="muted small">ИИ пересказывает только числа этой сводки, без данных пациентов.</p><div class="row"><button class="btn" id="rsAI" ${AI.ready() ? '' : 'disabled'}>Пересказать (ИИ)</button></div><div id="rsText"></div></div>`;
  $('#rsAI', box).onclick = async () => {
    $('#rsText', box).innerHTML = '<p class="muted">Пишу…</p>';
    try {
      const raw = AIAssist.json(await AI.call(`Ты помогаешь врачу, ведущему клинический регистр. Перескажи сводку ниже простым языком в 4-6 предложениях: сколько случаев, что не внесено или не уточнено, что изменилось и что сделать в первую очередь. Используй только эти числа, ничего не добавляй. Ответ JSON: {"text":"..."}\n${JSON.stringify(facts)}`, { text: '' }));
      $('#rsText', box).innerHTML = `<p>${esc(raw.text || '')}</p>`;
    } catch (error) { $('#rsText', box).innerHTML = `<p class="bad">${esc(error.message)}</p>`; }
  };
};

Routes.ideas = async (main, regId = '') => {
  const regs = (await Data.registries()).filter(r => !r.archivedAt);
  if (!regs.length) { main.innerHTML = '<div class="head"><h1>Идеи для исследований</h1></div><p>Нет доступных регистров.</p>'; return; }
  const reg = regs.find(r => r.id === regId) || regs[0];
  main.innerHTML = `<div class="head"><h1>Идеи для исследований</h1><div class="row">${regSelect(regs, reg.id, 'idReg', false)}</div></div>
    <div class="card"><p>Темы для статей по тому, что реально накоплено в регистре. Число подходящих пациентов AddAll считает сам: это пациенты, у которых заполнены все нужные поля. ИИ получает только описание полей и числа заполненности, без данных пациентов. Без ИИ темы подбираются по правилу: исход и фактор с наибольшим числом полных случаев.</p>
      <div class="row"><button class="btn primary" id="idAI" ${AI.ready() ? '' : 'disabled'}>Предложить темы (ИИ)</button><button class="btn" id="idRule">Подобрать без ИИ</button><span class="muted" id="idSt" role="status"></span></div></div>
    <div id="idOut"></div>`;
  $('#idReg', main).onchange = e => go('ideas/' + e.target.value);
  const prof = await AIAssist.profile(reg);
  const show = ideas => {
    const box = $('#idOut', main); if (!box) return;
    const known = new Map(prof.fields.map(f => [f.key, f]));
    const list = ideas.map(x => ({ ...x, fields: [...new Set((x.fields || []).concat(x.outcome ? [x.outcome] : []))].filter(k => known.has(k)) })).filter(x => x.title && x.fields.length);
    list.forEach(x => { x.n = AIAssist.eligible(prof, x.fields); x.weak = x.fields.map(k => known.get(k)).filter(f => f.filled < prof.patients / 2); });
    box.innerHTML = list.length ? list.map((x, i) => `<div class="card idea"><h3>${esc(x.title)}</h3><p>${esc(x.question || '')}</p>
      <p class="muted small">${esc(x.design || '')}${x.why ? ' · ' + esc(x.why) : ''}</p>
      <p><b>Подходит пациентов: ${x.n}</b> из ${prof.patients}. Нужные поля: ${x.fields.map(k => esc(known.get(k).label)).join(', ')}.</p>
      ${x.weak.length ? `<p class="warnt small">Не хватает данных: ${x.weak.map(f => `${esc(f.label)} заполнено у ${f.filled}`).join('; ')}.</p>` : ''}
      ${x.limits ? `<p class="muted small">Ограничения: ${esc(x.limits)}</p>` : ''}
      <div class="row"><button class="btn" data-save="${i}">Сохранить как проект статьи</button></div></div>`).join('')
      : '<p class="muted">Недостаточно данных для тем: нужны заполненные поля исхода и фактора хотя бы у 10 пациентов.</p>';
    $$('[data-save]', box).forEach(b => b.onclick = async () => { const d = await AIAssist.saveIdea(reg, list[Number(b.dataset.save)], prof); toast('Сохранено в «Рукописи»'); go('writing/' + d.id); });
  };
  $('#idRule', main).onclick = () => show(AIAssist.ruleIdeas(prof));
  $('#idAI', main).onclick = async () => {
    if (!prof.fields.length) return show([]);
    $('#idSt', main).textContent = 'думаю…';
    try { show(AIAssist.json(await AI.call(AIAssist.ideaPrompt(reg, prof), { text: '' })).ideas || []); }
    catch (error) { toast(error.message, 'err'); }
    finally { const s = $('#idSt', main); if (s) s.textContent = ''; }
  };
};

Object.assign(ROUTE_GROUP, { aicheck: 'Работа', regsummary: 'Работа', ideas: 'Наука' });
{
  const previous = navGroups;
  navGroups = async function () {
    const groups = await previous();
    const work = groups.find(g => g.id === 'work'), sci = groups.find(g => g.id === 'sci');
    if (work?.items && can('enter') && !work.items.some(x => x && x.r === 'regsummary')) work.items.unshift({ r: 'regsummary', t: 'Сводка регистра', i: '◉' });
    if (work?.items && (can('query') || can('edit')) && !routeOff('aicheck') && !work.items.some(x => x && x.r === 'aicheck')) work.items.push({ r: 'aicheck', t: 'ИИ-сверка с документами', i: '✓' });
    if (sci?.items && can('analyse') && !sci.items.some(x => x && x.r === 'ideas')) sci.items.push({ r: 'ideas', t: 'Идеи для исследований', i: '✦' });
    return groups;
  };
}
if (typeof TRAINING_CHAPTERS !== 'undefined' && typeof TrainingGuide === 'object') {
  const add = (anchor, chapter) => { const at = TRAINING_CHAPTERS.findIndex(c => c.id === anchor); TRAINING_CHAPTERS.splice(at < 0 ? TRAINING_CHAPTERS.length - 1 : at + 1, 0, chapter); };
  add('home', { id: 'regsummary', name: 'Сводка регистра', page: 'regsummary', go: 'regsummary', steps: [
    { t: '#rsTasks', title: 'Три главные задачи', text: 'Сводка показывает, сколько случаев за текущий квартал, что не внесено или не уточнено и какие три задачи важнее всего перед сдачей отчёта. Задачи кликабельны и ведут в нужный раздел. Числа считает AddAll по правилам отчётного периода.' },
    { t: '#rsAI', title: 'Простым языком', text: 'Если ИИ подключён, он перескажет сводку в нескольких предложениях. В ИИ уходят только числа сводки, без данных пациентов.' }] });
  add('quality', { id: 'aicheck', name: 'ИИ-сверка с документами', page: 'aicheck', go: 'aicheck', steps: [
    { t: '#acGo', title: 'Проверка перед отправкой', text: 'ИИ сравнивает сохранённые формы с документами пациента и показывает конкретные расхождения или поля без подтверждения, с цитатой и файлом. Цитата, которой нет в документе дословно, не принимается. Проверяющий отмечает «Верно» или отправляет запрос врачу по полю.' }] });
  add('analytics', { id: 'ideas', name: 'Идеи для исследований', page: 'ideas', go: 'ideas', steps: [
    { t: '#idRule', title: 'Темы по накопленным данным', text: 'AddAll предлагает темы статей только из реально заполненных полей и сам считает, сколько пациентов подходит. Тему можно сохранить как черновик рукописи с вопросом, дизайном и списком переменных.' }] });
  TrainingGuide.steps = TRAINING_CHAPTERS.flatMap((chapter, c) => chapter.steps.map((step, i) => ({ ...step, chapter, c, i })));
}
