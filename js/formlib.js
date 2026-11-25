/* AddAll: библиотека форм, перетаскивание в конструкторе и двойной ввод.
   FormLib: копирование формы или раздела из любого доступного регистра или шаблона; коды полей при конфликте
   переименовываются, ссылки в формулах и условиях показа внутри копии исправляются.
   DoubleEntry: независимый второй ввод формы другим сотрудником, сравнение и сверка расхождений.
   Подключается после national.js, до net.js. */
'use strict';

const FormLib = {
  reEsc: s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  usedKeys: reg => new Set([...(reg.eventTypes || []).flatMap(formFields).map(f => f.key), ...(reg.patientFields || []).map(f => f.key)]),
  /* новые коды для полей, которые уже есть в регистре; ссылки внутри копии переписываются */
  remap(reg, fields) {
    const used = FormLib.usedKeys(reg), map = {};
    for (const f of fields) {
      if (!used.has(f.key)) { used.add(f.key); continue; }
      let n = 2, k = f.key + '_' + n;
      while (used.has(k)) k = f.key + '_' + ++n;
      map[f.key] = k; used.add(k);
    }
    if (!Object.keys(map).length) return map;
    const tok = Object.keys(map).sort((a, b) => b.length - a.length);
    const fix = s => tok.reduce((acc, k) => acc.replace(new RegExp('(^|[^\\wЀ-ӿ])' + FormLib.reEsc(k) + '(?![\\wЀ-ӿ])', 'g'), '$1' + map[k]), String(s));
    for (const f of fields) {
      if (map[f.key]) f.key = map[f.key];
      if (f.showIf?.key && map[f.showIf.key]) f.showIf = { ...f.showIf, key: map[f.showIf.key] };
      if (f.formula) f.formula = fix(f.formula);
    }
    return map;
  },
  cloneSection(reg, sec) {
    const s = clone(sec); s.id = uid('s');
    FormLib.remap(reg, s.fields || []);
    return s;
  },
  cloneForm(reg, et, sameRegistry) {
    const c = clone(et); c.id = uid('et');
    c.name = sameRegistry ? c.name + ' (копия)' : c.name;
    delete c.doubleEntry;
    c.sections = (c.sections || []).map(s => ({ ...s, id: uid('s') }));
    FormLib.remap(reg, c.sections.flatMap(s => s.fields || []));
    return c;
  },
  /* источники: доступные регистры и встроенные шаблоны */
  async sources(reg) {
    const regs = (await Data.registries()).map(r => ({ id: 'r:' + r.id, name: r.id === reg.id ? r.name + ' (этот регистр)' : r.name, forms: r.eventTypes || [] }));
    const tpls = Object.entries(TEMPLATES).map(([k, t]) => { try { return { id: 't:' + k, name: 'Шаблон: ' + t.name, forms: t.make().eventTypes || [] }; } catch (e) { return null; } }).filter(Boolean);
    return [...regs, ...tpls].filter(s => s.forms.length);
  },
  /* окно выбора: mode 'form' добавляет форму целиком, 'section' добавляет раздел в форму target */
  async pick(reg, mode, done) {
    const src = await FormLib.sources(reg);
    const m = modal(`<h3>${mode === 'form' ? 'Форма из библиотеки' : 'Раздел из библиотеки'}</h3>
      <p class="muted">Берите готовые формы и разделы из своих регистров и шаблонов. Копия не связана с оригиналом. Если код поля уже занят в этом регистре, он получит окончание «_2», ссылки в формулах исправятся.</p>
      <div class="fld"><label class="flab" for="flSrc">Откуда</label><select class="inp" id="flSrc">${src.map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</select></div>
      <div class="fld"><label class="flab" for="flQ">Поиск по названию формы, раздела или поля</label><input class="inp" id="flQ"></div>
      <div id="flList"></div>`, { wide: true });
    const list = () => {
      const s = src.find(x => x.id === $('#flSrc', m).value), q = $('#flQ', m).value.trim().toLowerCase();
      const hit = t => !q || String(t || '').toLowerCase().includes(q);
      const forms = (s?.forms || []).filter(et => hit(et.name) || (et.sections || []).some(sec => hit(sec.title) || (sec.fields || []).some(f => hit(f.label))));
      $('#flList', m).innerHTML = forms.map((et, i) => `<div class="card"><div class="row between"><b>${esc(et.name)}</b>${mode === 'form' ? `<button class="btn sm primary" data-flf="${i}">Добавить форму</button>` : ''}</div>
        ${(et.sections || []).map((sec, j) => `<div class="row between"><span>${esc(sec.title)} <span class="muted small">· полей: ${(sec.fields || []).length}${(sec.fields || []).length ? ': ' + esc((sec.fields || []).slice(0, 5).map(f => f.label).join(', ')) + ((sec.fields || []).length > 5 ? '…' : '') : ''}</span></span>${mode === 'section' ? `<button class="btn xs" data-fls="${i}:${j}">Добавить раздел</button>` : ''}</div>`).join('')}</div>`).join('') || '<p class="muted">Ничего не найдено.</p>';
      $$('[data-flf]', m).forEach(b => b.onclick = () => { m.close(); done(forms[b.dataset.flf], s.id === 'r:' + reg.id); });
      $$('[data-fls]', m).forEach(b => b.onclick = () => { const [i, j] = b.dataset.fls.split(':').map(Number); m.close(); done(forms[i].sections[j]); });
    };
    $('#flSrc', m).onchange = list; $('#flQ', m).oninput = list; list();
  },
  /* перетаскивание: f:форма:раздел:поле, s:форма:раздел, e:форма */
  target(el, src) {
    const kind = src[0];
    if (kind === 'f') return el.closest?.('tr[data-dg^="f:"]') || el.closest?.('.sec-b[data-dg]');
    if (kind === 's') return el.closest?.('.sec-b[data-dg]');
    if (kind === 'e') return el.closest?.('.et[data-dg]');
    return null;
  },
  drop(reg, src, dst) {
    const a = src.split(':'), b = dst.split(':');
    const n = x => x.slice(1).map(Number);
    if (a[0] === 'e') {
      const [i] = n(a), [j] = n(b); if (i === j) return {};
      const L = reg.eventTypes, [x] = L.splice(i, 1); L.splice(j > i ? j - 1 : j, 0, x); return { moved: true };
    }
    const [ei, si, fi] = n(a), [ej, sj, fj] = n(b);
    if (ei !== ej) return { err: a[0] === 'f' ? 'Поле переносится только внутри своей формы: иначе уже внесённые значения потеряют связь с формой. Для другой формы используйте «Раздел из библиотеки».' : 'Раздел переносится только внутри своей формы.' };
    const secs = reg.eventTypes[ei].sections;
    if (a[0] === 's') {
      if (si === sj) return {};
      const [x] = secs.splice(si, 1); secs.splice(sj > si ? sj - 1 : sj, 0, x); return { moved: true };
    }
    const from = secs[si].fields, to = secs[sj].fields;
    if (b[0] === 'f') {
      if (si === sj && (fi === fj || fi + 1 === fj)) return {};
      const [x] = from.splice(fi, 1); to.splice(si === sj && fj > fi ? fj - 1 : fj, 0, x);
    } else {
      if (si === sj) return {};
      const [x] = from.splice(fi, 1); to.push(x);
    }
    return { moved: true };
  },
  /* подключение перетаскивания к телу вкладки «Формы событий» */
  bind(body, reg, ro, after) {
    if (ro) return;
    let src = null, over = null;
    const clear = () => { over?.classList.remove('dg-over'); over = null; };
    body.ondragstart = e => { const el = e.target.closest?.('[data-dg]'); if (!el) return; src = el.dataset.dg; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', src); } catch (x) { } el.classList.add('dg-src'); };
    body.ondragover = e => { if (!src) return; const t = FormLib.target(e.target, src); if (!t) return; e.preventDefault(); if (t !== over) { clear(); over = t; t.classList.add('dg-over'); } };
    body.ondragleave = e => { if (over && !over.contains(e.relatedTarget)) clear(); };
    body.ondragend = () => { src = null; clear(); $$('.dg-src', body).forEach(x => x.classList.remove('dg-src')); };
    body.ondrop = e => {
      if (!src) return; const t = FormLib.target(e.target, src); if (!t) return; e.preventDefault();
      const r = FormLib.drop(reg, src, t.dataset.dg); src = null; clear();
      if (r.err) toast(r.err, 'err'); else if (r.moved) after();
    };
  }
};

/* ---------- двойной ввод ----------
   Форма с отметкой «двойной ввод» после обычного (первого) ввода ждёт второго, независимого ввода другим сотрудником.
   AddAll сравнивает оба ввода по каждому полю; расхождения сверяет сотрудник с правом исправления, выбирая верное значение.
   Второй ввод хранится отдельно (store secondEntries), исправления события проходят обычный журнал аудита. */
const DoubleEntry = {
  norm(v) {
    if (isEmpty(v)) return '';
    if (Array.isArray(v)) return v.map(x => typeof x === 'object' ? JSON.stringify(x) : String(x).trim()).sort().join('|');
    if (typeof v === 'object') return JSON.stringify(v);
    const s = String(v).trim();
    return /^-?\d+([.,]\d+)?$/.test(s) ? String(Number(s.replace(',', '.'))) : s.replace(/\s+/g, ' ');
  },
  fields: et => formFields(et).filter(f => f.type !== 'calc'),
  diff(et, a, b) { return DoubleEntry.fields(et).filter(f => DoubleEntry.norm(a?.[f.key]) !== DoubleEntry.norm(b?.[f.key])).map(f => f.key); },
  forms: reg => (reg.eventTypes || []).filter(et => et.doubleEntry),
  /* состояние каждого события формы с двойным вводом */
  async items(reg) {
    const forms = new Set(DoubleEntry.forms(reg).map(et => et.id));
    if (!forms.size) return [];
    const [events, patients, seconds] = await Promise.all([Data.events(reg.id), Data.patients(reg.id), DB.all('secondEntries')]);
    const vis = new Map(patients.filter(p => typeof visibleP !== 'function' || visibleP(p)).map(p => [p.id, p]));
    const byEvent = new Map(seconds.filter(s => s.registryId === reg.id).map(s => [s.eventId, s]));
    return events.filter(e => forms.has(e.type) && e.status !== 'черновик' && vis.has(e.patientId)).map(e => {
      const s = byEvent.get(e.id);
      return { ev: e, p: vis.get(e.patientId), et: etById(reg, e.type), second: s, state: !s ? 'wait' : s.status === 'сверено' ? 'done' : 'diff' };
    }).sort((a, b) => String(b.ev.date).localeCompare(String(a.ev.date)));
  },
  pending: async reg => (await DoubleEntry.items(reg)).filter(x => x.state !== 'done').length,
  async enter(reg, x, after) {
    if (x.ev.createdBy && x.ev.createdBy === Auth.user.id) return toast('Второй ввод делает другой сотрудник, не тот, кто вносил форму первым', 'err');
    const users = await Data.users();
    const m = modal(`<h3>Второй ввод: ${esc(x.et.name)}</h3>
      <p>${esc(pname(x.p))} · № ИБ ${esc(x.p.localId || '')} · дата ${fmtDate(x.ev.date)}</p>
      <p class="muted">Внесите данные заново по первичному документу. Первый ввод не показывается, чтобы ввод был независимым. После сохранения AddAll сравнит оба ввода.</p>
      <div id="deForm"></div><div class="row end"><button class="btn primary" id="deSave">Сохранить второй ввод</button></div>`, { wide: true });
    const read = renderEventForm($('#deForm', m), reg, x.p, x.et, {}, x.ev.date, users);
    $('#deSave', m).onclick = async () => {
      const { data } = read();
      const diffs = DoubleEntry.diff(x.et, x.ev.data || {}, data);
      try {
        await DB.put('secondEntries', { registryId: reg.id, patientId: x.p.id, eventId: x.ev.id, eventType: x.et.id, values: data, firstValues: clone(x.ev.data || {}),
          firstRev: x.ev.rev || 0, enteredBy: Auth.user.id, enteredByName: Auth.user.name, enteredAt: nowISO(), diffs,
          status: diffs.length ? 'расхождения' : 'сверено', resolvedBy: diffs.length ? '' : 'совпало при сравнении', resolvedAt: diffs.length ? '' : nowISO() }, 'второй ввод');
      } catch (e) { return toast(e.message, 'err'); }
      m.close();
      toast(diffs.length ? 'Найдено расхождений: ' + diffs.length : 'Оба ввода совпали');
      after();
    };
  },
  async resolve(reg, x, after) {
    if (!can('edit')) return toast('Сверку делает сотрудник с правом исправления данных', 'err');
    if (x.ev.locked) return toast('Запись заблокирована после верификации. Снимите блокировку, чтобы сверить расхождения.', 'err');
    const users = await Data.users(), s = x.second;
    const keys = DoubleEntry.diff(x.et, x.ev.data || {}, s.values || {});
    const changed = DoubleEntry.diff(x.et, s.firstValues || {}, x.ev.data || {}).length > 0;
    const fields = keys.map(k => formFields(x.et).find(f => f.key === k)).filter(Boolean);
    const m = modal(`<h3>Сверка двойного ввода: ${esc(x.et.name)}</h3>
      <p>${esc(pname(x.p))} · № ИБ ${esc(x.p.localId || '')} · дата ${fmtDate(x.ev.date)} · второй ввод: ${esc(s.enteredByName || '')}, ${fmtDT(s.enteredAt)}</p>
      ${changed ? '<p class="warnt">Первый ввод изменён после второго ввода. Ниже показаны текущие значения.</p>' : ''}
      ${fields.length ? `<p class="muted">Сверьте с первичным документом и выберите верное значение в каждой строке.</p>
      <table class="tbl"><thead><tr><th>Поле</th><th>Первый ввод</th><th>Второй ввод</th></tr></thead><tbody>
      ${fields.map(f => `<tr><td><b>${esc(f.label)}</b></td><td><label><input type="radio" name="de_${esc(f.key)}" value="1"> ${showVal(f, x.ev.data?.[f.key], users)}</label></td><td><label><input type="radio" name="de_${esc(f.key)}" value="2"> ${showVal(f, s.values?.[f.key], users)}</label></td></tr>`).join('')}</tbody></table>`
        : '<p>Сейчас расхождений нет: первый ввод уже совпадает со вторым.</p>'}
      <div class="row end"><button class="btn primary" id="deOk">Сверено</button></div>`, { wide: true });
    $('#deOk', m).onclick = async () => {
      const choice = {};
      for (const f of fields) { const r = $(`input[name="de_${CSS.escape(f.key)}"]:checked`, m); if (!r) return toast('Выберите значение для поля «' + f.label + '»', 'err'); choice[f.key] = r.value; }
      try {
        const ev = await DB.get('events', x.ev.id);
        const pick2 = fields.filter(f => choice[f.key] === '2');
        if (pick2.length) {
          ev.data = { ...(ev.data || {}) };
          for (const f of pick2) { if (isEmpty(s.values?.[f.key])) delete ev.data[f.key]; else ev.data[f.key] = clone(s.values[f.key]); }
          await DB.put('events', ev, 'сверка двойного ввода');
        }
        await DB.put('secondEntries', { ...s, status: 'сверено', choices: choice, resolvedBy: Auth.user.name, resolvedById: Auth.user.id, resolvedAt: nowISO() }, 'сверка двойного ввода');
      } catch (e) { return toast(e.message, 'err'); }
      m.close(); toast('Сверено'); after();
    };
  }
};

Routes.double = async (main, regId = '') => {
  const regs = await Data.registries();
  const withDE = regs.filter(r => DoubleEntry.forms(r).length);
  const reg = withDE.find(r => r.id === regId) || withDE[0];
  if (!reg) {
    main.innerHTML = '<div class="head"><h1>Двойной ввод</h1></div>' + emptyState('Ни в одном регистре двойной ввод не включён. Включите его для нужной формы: «Регистры и конструктор» → регистр → «Формы событий» → кнопка «Двойной ввод» у формы.');
    return;
  }
  const st = (Routes.double.st ||= { tab: 'wait' });
  const items = await DoubleEntry.items(reg);
  const users = await Data.users(), uname = id => users.find(u => u.id === id)?.name || '';
  const cnt = s => items.filter(x => x.state === s).length;
  const rows = items.filter(x => x.state === st.tab);
  main.innerHTML = `<div class="head"><h1>Двойной ввод</h1>${regSelect(withDE, reg.id, 'deReg', false)}</div>
    <div class="card"><p>Формы <b>${esc(DoubleEntry.forms(reg).map(et => et.name).join(', '))}</b> вносятся дважды разными сотрудниками независимо друг от друга. AddAll сравнивает оба ввода и показывает расхождения: так находятся опечатки при переносе с бумаги. Пока ввод не сверен, официальный отчёт за период выпускается только с замечанием.</p></div>
    <div class="tabs" id="deTabs">${[['wait', 'Ждут второго ввода'], ['diff', 'Есть расхождения'], ['done', 'Сверено']].map(([k, t]) => `<a href="javascript:void 0" data-det="${k}" class="${st.tab === k ? 'on' : ''}">${t} <span class="cnt">${cnt(k)}</span></a>`).join('')}</div>
    <div class="card" id="deList">${rows.length ? `<table class="tbl"><thead><tr><th>Пациент</th><th>Форма</th><th>Дата</th><th>Первый ввод</th>${st.tab === 'wait' ? '' : '<th>Второй ввод</th><th>Расхождений</th>'}<th></th></tr></thead><tbody>
      ${rows.map((x, i) => `<tr><td><a href="#patient/${esc(x.p.id)}"><b>${esc(pname(x.p))}</b></a><div class="muted small">№ ИБ ${esc(x.p.localId || '')}</div></td><td>${esc(x.et.name)}</td><td>${fmtDate(x.ev.date)}</td><td>${esc(uname(x.ev.createdBy))}</td>
        ${st.tab === 'wait' ? '' : `<td>${esc(x.second.enteredByName || '')}</td><td>${(x.second.diffs || []).length}</td>`}
        <td class="row end">${st.tab === 'wait' ? (x.ev.createdBy === Auth.user.id ? '<span class="muted small">вы вносили первым</span>' : can('enter') ? `<button class="btn sm primary" data-dei="${i}">Внести второй раз</button>` : '') : st.tab === 'diff' ? `<button class="btn sm primary" data-der="${i}">Сверить</button>` : `<span class="muted small">${esc(x.second.resolvedBy || '')}</span>`}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Здесь пусто.</p>'}</div>`;
  $('#deReg', main).onchange = e => go('double/' + e.target.value);
  $$('[data-det]', main).forEach(a => a.onclick = () => { st.tab = a.dataset.det; App.route(); });
  const again = () => App.route();
  $$('[data-dei]', main).forEach(b => b.onclick = () => DoubleEntry.enter(reg, rows[b.dataset.dei], again));
  $$('[data-der]', main).forEach(b => b.onclick = () => DoubleEntry.resolve(reg, rows[b.dataset.der], again));
};

ROUTE_GROUP.double = 'Работа';
NAV_ICONS.double = NAV_ICONS.double || NAV_ICONS.me;
{
  const previous = navGroups;
  navGroups = async function () {
    const groups = await previous();
    const work = groups.find(group => group.id === 'work');
    if (work?.items && can('enter') && !work.items.some(x => x.r === 'double')) {
      /* реестр регистров уже загружен предыдущим шагом меню: без лишних запросов к серверу */
      const regs = [...REGS.values()].filter(r => regAllowed(r) && DoubleEntry.forms(r).length);
      let n = 0;
      try { for (const r of regs) n += await DoubleEntry.pending(r); } catch (e) { n = 0; }
      if (regs.length) {
        const at = work.items.findIndex(item => item.r === 'queries');
        work.items.splice(at < 0 ? work.items.length : at, 0, { r: 'double', t: 'Двойной ввод', badge: n || undefined });
      }
    }
    return groups;
  };
}
if (typeof TRAINING_CHAPTERS !== 'undefined' && typeof TrainingGuide === 'object') {
  const end = TRAINING_CHAPTERS.findIndex(c => c.id === 'end');
  TRAINING_CHAPTERS.splice(end < 0 ? TRAINING_CHAPTERS.length : end, 0,
    { id: 'double', name: 'Двойной ввод', page: 'double', go: 'double', steps: [
      { t: '#main .head', title: 'Двойной ввод', text: 'Для выбранных форм данные вносят двое сотрудников независимо. «Ждут второго ввода»: первый ввод сделан, нужен второй, причём другим сотрудником. «Есть расхождения»: оба ввода сделаны, но значения где-то различаются. «Сверено»: расхождений нет или они разобраны.' },
      { t: '#deList, #main .empty', title: 'Второй ввод и сверка', text: '«Внести второй раз» открывает пустую форму: первый ввод не показывается, чтобы второй был независимым. «Сверить» показывает только различающиеся поля: выберите верное значение по первичному документу. Исправление попадает в журнал аудита.' }
    ] });
  const rc = TRAINING_CHAPTERS.find(c => c.id === 'registry');
  if (rc && !rc.steps.some(x => x.title === 'Формы событий: библиотека и перетаскивание')) rc.steps.splice(1, 0, { t: '#main .tabs', title: 'Формы событий: библиотека и перетаскивание', text: 'На вкладке «Формы событий» формы, разделы и поля перетаскиваются мышкой (стрелки тоже работают). «+ Форма из библиотеки» и «+ Раздел из библиотеки» копируют готовые формы и разделы из ваших регистров и шаблонов; занятые коды полей получают окончание «_2», формулы исправляются. «Копировать» создаёт копию формы в этом регистре. «Двойной ввод» включает независимый второй ввод формы другим сотрудником со сверкой расхождений.' });
  TrainingGuide.steps = TRAINING_CHAPTERS.flatMap((chapter, c) => chapter.steps.map((step, i) => ({ ...step, chapter, c, i })));
}
