/* AddAll 2.0: ИИ в конструкторе и в работе с регистром.
   1. Регистр из описания (AIBuild): врач пишет простым языком, что хочет вести (можно приложить Excel отдела качества);
      ИИ собирает структуру, AddAll проверяет её тем же разбором, что и импорт структуры (SchemaTransfer.parse),
      формулы приходят черновиками на ручную проверку, регистр создаётся черновиком. Можно уточнять описание и пересобирать.
   2. Вопрос к регистру (#ask): вопрос обычным языком превращается в видимые условия (поле, оператор, значение) и особые отборы;
      список и число пациентов считает AddAll. Условия можно убрать по одному и сохранить как список регистра.
   3. Точность автозаполнения (#aiquality): какие поля ИИ заполнил и какие врач исправил (ev.aiReview, пишется при сохранении формы).
   4. Черновик разбора к M&M: хронология случая и вопросы для обсуждения по формам и документам, цитаты проверяются по тексту.
   Подключается после aiassist.js, до net.js. */
'use strict';

/* ---------- 1. регистр из описания ---------- */
const AIBuild = {
  spec: `Формат ответа: только JSON структуры регистра AddAll.
{"name":"название","description":"цель и критерии включения, 1-3 предложения",
 "patientFields":[поле],
 "eventTypes":[{"id":"латинский_код","name":"название формы","dateLabel":"подпись даты (Дата операции)","single":true если форма один раз на пациента,
   "expect":{"days":число дней от начала эпизода,"every":повтор в днях или 0,"mode":"at" (оценка на срок) или "by" (нужна к сроку)} только для форм наблюдения и исходов,
   "sections":[{"title":"раздел","fields":[поле]}]}],
 "indicators":[{"id":"латинский_код","name":"показатель качества","et":"id формы","num":{"key":"поле","op":"eq","value":"да"},"denom":null,"lowerBetter":true}],
 "keyDates":{"start":"id формы, с которой начинается случай"}}
Поле: {"key":"латинский_snake_case","label":"подпись по-русски","type":тип,"options":["вариант"],"unit":"ед.","required":true/false,"min":число,"max":число,
 "def":"определение поля, как заполнять","showIf":{"key":"другое поле этой формы","op":"eq","value":"да"},"formula":"только для calc"}
Типы: text, textarea, number, date, select, multiselect, yesno (значения да/нет), calc (формула JavaScript по кодам полей, например bmi(height, weight), age, ifelse(a > 5, 'да', 'нет')), complist (осложнения Clavien-Dindo с CCI), user (врач, хирург), icd10 (диагноз МКБ-10).
Операторы условий: eq, ne, gt, lt, in, filled, empty.
Правила: коды полей уникальны во всём регистре; первая форма открывает случай (включение, операция, госпитализация); последняя форма наблюдение с полем статуса (жив, умер, потерян для наблюдения) и сроками expect;
используй общепринятые классификации (TNM, ASA, ECOG, Clavien-Dindo, МКБ-10) где уместно; у важных полей пиши def; обязательными делай только ключевые поля; не больше 8 форм и 120 полей;
показатели качества только вида «доля событий» по полям yesno или select; ничего не выдумывай про конкретных пациентов.`,
  async tableHint(file) {
    if (!file) return '';
    const rows = await Recon.readTable(file);
    if (!rows?.length) return '';
    const head = rows[0].map(x => String(x || '').trim());
    const sample = rows.slice(1, 6);
    const cols = head.map((h, i) => `${h || 'столбец ' + (i + 1)}: ${[...new Set(sample.map(r => String(r[i] ?? '').trim()).filter(Boolean))].slice(0, 4).join(' | ')}`);
    return `\nДействующая таблица отдела качества (заголовки и примеры значений, без ФИО). Каждый столбец должен стать полем; сопоставь их с формами:\n${cols.join('\n').slice(0, 8000)}`;
  },
  async build(text, tableHint, previous) {
    const prompt = previous
      ? `Ты методист клинических регистров. Вот текущая структура регистра в JSON:\n${JSON.stringify(previous).slice(0, 60000)}\nИзмени её по просьбе врача: «${text}». Сохрани остальное.\n${AIBuild.spec}`
      : `Ты методист клинических регистров. Врач описал регистр, который хочет вести: «${text}».${tableHint}\nСобери структуру регистра.\n${AIBuild.spec}`;
    const raw = AI.parse(await AI.call(prompt, { text: '' }));
    raw.format = undefined;
    const { schema, count, formulas } = SchemaTransfer.parse(raw);
    return { schema, count, formulas, raw };
  },
  preview(schema) {
    const ft = t => FIELD_TYPES[t] || t;
    return `<p><b>${esc(schema.name)}</b></p><p class="muted">${esc(schema.description || '')}</p>
      ${schema.patientFields.length ? `<details><summary>Поля пациента: ${schema.patientFields.length}</summary><ul>${schema.patientFields.map(f => `<li>${esc(f.label)} <span class="muted small">${esc(ft(f.type))}</span></li>`).join('')}</ul></details>` : ''}
      ${schema.eventTypes.map(et => `<details><summary><b>${esc(et.name)}</b> · ${formFields(et).length} полей${et.expect ? ` · срок ${et.expect.days} дн.${et.expect.every ? `, повтор каждые ${et.expect.every} дн.` : ''}` : ''}</summary>
        ${et.sections.map(s => `<p class="small"><b>${esc(s.title)}</b></p><ul>${s.fields.map(f => `<li>${esc(f.label)}${f.unit ? ', ' + esc(f.unit) : ''} <span class="muted small">${esc(ft(f.type))}${f.options.length ? ': ' + esc(f.options.slice(0, 6).join(', ')) + (f.options.length > 6 ? '…' : '') : ''}${f.required ? ' · обязательное' : ''}</span></li>`).join('')}</ul>`).join('')}</details>`).join('')}
      ${schema.indicators.length ? `<p><b>Показатели качества:</b> ${schema.indicators.map(i => esc(i.name)).join('; ')}</p>` : ''}`;
  },
  dialog() {
    const m = modal(`<h3>✦ Регистр из описания</h3>
      ${AI.ready() ? '' : AIAssist.readyBox()}
      <div class="fld"><label class="flab" for="abText">Опишите простым языком, что хотите вести</label>
        <textarea class="inp" id="abText" rows="5" placeholder="Например: регистр пациентов после TNT при раке прямой кишки. Нужны МРТ до и после, курс химиолучевой терапии с токсичностью, эндоскопическая оценка ответа, тактика watch and wait или операция, патоморфология и наблюдение каждые 3 месяца два года с рецидивами."></textarea></div>
      <div class="fld"><label class="flab" for="abFile">Таблица, которую ведёте сейчас (необязательно): Excel или CSV</label><input type="file" id="abFile" accept=".xlsx,.csv,.txt"><p class="muted small">ИИ получает только заголовки столбцов и несколько примеров значений. Уберите ФИО и ИИН из файла перед загрузкой.</p></div>
      <div class="row"><button class="btn primary" id="abGo" ${AI.ready() ? '' : 'disabled'}>Собрать структуру</button><span class="muted" id="abSt" role="status"></span></div>
      <div id="abOut"></div>`, { wide: true });
    let current = null;
    const run = async (previous) => {
      const text = $('#abText', m).value.trim();
      if (text.length < 15) return toast('Опишите регистр подробнее: какие пациенты, какие этапы, что важно учитывать', 'err');
      $('#abSt', m).textContent = 'собираю структуру… (до минуты)'; $('#abGo', m).disabled = true;
      try {
        const hint = previous ? '' : await AIBuild.tableHint($('#abFile', m).files[0]);
        current = await AIBuild.build(text, hint, previous);
        $('#abOut', m).innerHTML = `<div class="card"><p>Форм ${current.schema.eventTypes.length}, полей ${current.count}, показателей ${current.schema.indicators.length}.${current.formulas ? ` Расчётных полей ${current.formulas}: формулы придут черновиками, откройте и проверьте каждую в конструкторе.` : ''}</p>${AIBuild.preview(current.schema)}</div>
          <div class="fld"><label class="flab" for="abName">Название</label><input class="inp" id="abName" value="${esc(current.schema.name)}"></div>
          <div class="row"><button class="btn" id="abMore">Изменить по новому описанию</button><button class="btn primary" id="abSave">Создать черновик регистра</button></div>
          <p class="muted small">Регистр создаётся черновиком: проверьте формы в конструкторе, допишите определения и только потом начинайте ввод. Описание выше можно дополнить («добавь ASA и шкалу LARS», «убери химиотерапию») и нажать «Изменить».</p>`;
        $('#abMore', m).onclick = () => run(current.raw);
        $('#abSave', m).onclick = async () => {
          const name = $('#abName', m).value.trim() || current.schema.name;
          const r = { ...current.schema, name, dept: Auth.user.dept || '', center: Auth.user.center || '', builtByAI: true };
          if (!can('design')) { r.status = 'на одобрении'; r.proposedBy = Auth.user.id; }
          const saved = await DB.put('registries', r, can('design') ? 'создание регистра по описанию (ИИ)' : 'заявка на регистр (ИИ)');
          m.close(); toast(can('design') ? 'Черновик регистра создан' : 'Заявка отправлена администратору');
          go(can('design') ? 'registry/' + saved.id : 'registries');
        };
      } catch (error) { $('#abOut', m).innerHTML = `<p class="bad">Не получилось: ${esc(error.message)}. Попробуйте описать иначе или ещё раз.</p>`; }
      finally { const s = $('#abSt', m); if (s) s.textContent = ''; const g = $('#abGo', m); if (g) g.disabled = !AI.ready(); }
    };
    $('#abGo', m).onclick = () => run(null);
  }
};
{
  const previous = newRegDialog;
  newRegDialog = function () {
    previous();
    const box = [...document.querySelectorAll('.modal-wrap')].pop();
    const head = box && $('h3', box);
    if (head && !$('#nrAI', box)) head.insertAdjacentHTML('afterend', `<div class="card ai"><p>Можно не выбирать шаблон: опишите регистр своими словами, и ИИ соберёт формы, поля и показатели.</p><button class="btn ai" id="nrAI">✦ Собрать по описанию</button></div>`);
    if ($('#nrAI', box)) $('#nrAI', box).onclick = () => { box.close ? box.close() : box.remove(); AIBuild.dialog(); };
  };
}

/* ---------- 2. вопрос к регистру ---------- */
const AIAsk = {
  SPECIAL: { followup_missing: 'срок наблюдения наступил, форма не внесена', drafts: 'есть черновики', open_queries: 'есть открытые запросы по данным', dead: 'умершие', alive: 'живые' },
  catalog(reg) {
    const out = [{ et: '_p', name: 'Карточка пациента', fields: fieldsOf(reg, '_p') }, ...reg.eventTypes.map(et => ({ et: et.id, name: et.name, fields: formFields(et) }))];
    return out.map(x => ({ ...x, fields: x.fields.filter(f => !['group', 'file', 'image', 'diagram'].includes(f.type) && !f.sensitive) }));
  },
  prompt(reg, q) {
    const cat = AIAsk.catalog(reg).map(x => ({ form: x.et, name: x.name, fields: x.fields.map(f => [f.key, f.label, f.type, (f.options || []).slice(0, 15)]) }));
    return `Переведи вопрос врача к клиническому регистру «${reg.name}» в фильтры. Используй только формы и поля из списка.
Вопрос: «${q}»
Сегодня ${today()}.
Формы и поля (код, подпись, тип, варианты): ${JSON.stringify(cat)}
Операторы: eq, ne, gt, lt, in (значения через ;), filled, empty. Для yesno значения «да» или «нет». Для select значение строго из вариантов.
Особые отборы (special): ${Object.entries(AIAsk.SPECIAL).map(([k, v]) => k + ' = ' + v).join('; ')}.
Период (from, to) относится к дате первого события случая.
Ответ только JSON: {"conds":[{"et":"код формы или _p","key":"код поля","op":"eq","value":"..."}],"special":["..."],"from":"YYYY-MM-DD или null","to":"YYYY-MM-DD или null","explain":"как понят вопрос, одно предложение","unsupported":"что из вопроса нельзя выразить фильтрами, или пусто"}`;
  },
  clean(reg, raw) {
    const cat = AIAsk.catalog(reg);
    const conds = (raw.conds || []).filter(c => { const form = cat.find(x => x.et === c.et); const f = form?.fields.find(y => y.key === c.key); return f && Object.hasOwn(OPS, c.op); })
      .map(c => ({ et: c.et, key: c.key, op: c.op, value: ['filled', 'empty'].includes(c.op) ? '' : String(c.value ?? '') }));
    const day = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : '';
    return { conds, special: (raw.special || []).filter(s => Object.hasOwn(AIAsk.SPECIAL, s)), from: day(raw.from), to: day(raw.to), explain: String(raw.explain || '').slice(0, 300), unsupported: String(raw.unsupported || '').slice(0, 300) };
  },
  async run(reg, f) {
    const ds = await loadReg(reg.id);
    ds.patients = ds.patients.filter(p => typeof visibleP !== 'function' || visibleP(p));
    let list = cohortPatients(ds, { conds: f.conds, from: f.from, to: f.to });
    if (f.special.length) {
      const ids = new Set(list.map(p => p.id));
      if (f.special.includes('followup_missing')) {
        const miss = new Set(FollowQ.build(reg, ds.events, ds.patients, await DB.all('tasks')).filter(x => ['overdue', 'open', 'died', 'partial'].includes(x.state)).map(x => x.ep.patientId));
        for (const id of [...ids]) if (!miss.has(id)) ids.delete(id);
      }
      if (f.special.includes('drafts')) { const d = new Set(ds.events.filter(e => e.status === 'черновик').map(e => e.patientId)); for (const id of [...ids]) if (!d.has(id)) ids.delete(id); }
      if (f.special.includes('open_queries')) { const q = new Set((await DB.all('queries')).filter(x => x.registryId === reg.id && x.status !== 'закрыт').map(x => x.patientId)); for (const id of [...ids]) if (!q.has(id)) ids.delete(id); }
      if (f.special.includes('dead')) list = list.filter(p => p.vital === 'умер');
      if (f.special.includes('alive')) list = list.filter(p => p.vital !== 'умер');
      list = list.filter(p => ids.has(p.id));
    }
    return list;
  },
  text(reg, f) {
    const parts = (f.conds || []).map(c => { const form = c.et === '_p' ? 'Пациент' : etById(reg, c.et)?.name; const fl = fieldsOf(reg, c.et).find(x => x.key === c.key); return `${form}: ${fl?.label || c.key} ${OPS[c.op]}${['filled', 'empty'].includes(c.op) ? '' : ' ' + c.value}`; });
    return [...parts, ...f.special.map(s => AIAsk.SPECIAL[s]), f.from ? 'случай с ' + fmtDate(f.from) : '', f.to ? 'по ' + fmtDate(f.to) : ''].filter(Boolean);
  }
};
Routes.ask = async (main, regId = '') => {
  const regs = (await Data.registries()).filter(r => !r.archivedAt);
  if (!regs.length) { main.innerHTML = '<div class="head"><h1>Вопрос к регистру</h1></div><p>Нет доступных регистров.</p>'; return; }
  const reg = regs.find(r => r.id === regId) || regs[0];
  main.innerHTML = `<div class="head"><h1>Вопрос к регистру</h1><div class="row">${regSelect(regs, reg.id, 'akReg', false)}</div></div>
    <div class="card"><p>Спросите обычным языком. ИИ превращает вопрос в условия, которые видны ниже и которые можно убрать; пациентов отбирает и считает AddAll. ИИ получает только вопрос и список полей, без данных пациентов.</p>
      ${AI.ready() ? '' : AIAssist.readyBox()}
      <div class="row"><input class="inp" id="akQ" style="flex:1;min-width:240px" placeholder="Например: у кого срок наблюдения наступил, а исход ещё не внесён"><button class="btn primary" id="akGo" ${AI.ready() ? '' : 'disabled'}>Найти</button></div></div>
    <div id="akOut"></div>`;
  $('#akReg', main).onchange = e => go('ask/' + e.target.value);
  let f = null;
  const draw = async () => {
    const box = $('#akOut', main); if (!box || !f) return;
    const list = await AIAsk.run(reg, f);
    const chips = AIAsk.text(reg, f);
    box.innerHTML = `<div class="card"><p class="muted">${esc(f.explain)}</p>${f.unsupported ? `<p class="warnt small">Не учтено: ${esc(f.unsupported)}</p>` : ''}
      <div class="chips" id="akChips">${chips.length ? chips.map((c, i) => `<span class="chip">${esc(c)} <button class="linkbtn" data-rm="${i}" aria-label="Убрать условие">×</button></span>`).join('') : '<span class="muted">Без условий: все пациенты регистра</span>'}</div>
      <p><b id="akN">Пациентов: ${list.length}</b></p>
      ${can('design') && !f.special.length && f.conds.length ? '<div class="row"><button class="btn" id="akSave">Сохранить как список регистра</button></div>' : ''}</div>
      ${list.length ? `<table class="tbl"><thead><tr><th>Пациент</th><th>ID</th><th>Дата рождения</th></tr></thead><tbody>${list.slice(0, 300).map(p => `<tr><td><a href="#patient/${esc(p.id)}">${esc(pname(p))}</a></td><td class="mono">${esc(PID.show(p))}</td><td>${fmtDate(p.birthDate)}</td></tr>`).join('')}</tbody></table>${list.length > 300 ? '<p class="muted">Показаны первые 300.</p>' : ''}` : ''}`;
    $$('[data-rm]', box).forEach(b => b.onclick = () => {
      const i = Number(b.dataset.rm), nc = f.conds.length, ns = f.special.length;
      if (i < nc) f.conds.splice(i, 1); else if (i < nc + ns) f.special.splice(i - nc, 1); else if (f.from && i === nc + ns) f.from = ''; else f.to = '';
      draw();
    });
    if ($('#akSave', box)) $('#akSave', box).onclick = async () => {
      const name = await promptBox('Название списка', $('#akQ', main).value.slice(0, 60)); if (!name) return;
      const r = await DB.get('registries', reg.id); r.lists = r.lists || []; r.lists.push({ id: uid('ls'), name, conds: clone(f.conds), manual: null });
      await DB.put('registries', r, 'список из вопроса к регистру'); toast('Список сохранён');
    };
  };
  const ask = async () => {
    const q = $('#akQ', main).value.trim(); if (!q) return;
    $('#akGo', main).disabled = true;
    try { f = AIAsk.clean(reg, AI.parse(await AI.call(AIAsk.prompt(reg, q), { text: '' }))); await draw(); }
    catch (error) { toast(error.message, 'err'); }
    finally { const b = $('#akGo', main); if (b) b.disabled = false; }
  };
  $('#akGo', main).onclick = ask;
  $('#akQ', main).onkeydown = e => { if (e.key === 'Enter') ask(); };
};

/* ---------- 3. точность автозаполнения ---------- */
const AIQuality = {
  /* вызывается из формы события при сохранении: сравнивает предложенное ИИ с сохранённым */
  review(record, data, aiDraft) {
    const proposed = { ...Object.fromEntries(Object.entries(aiDraft.evidence || {}).map(([k, v]) => [k, v?.value])), ...(aiDraft.proposed || {}) };
    if (!Object.keys(proposed).length) return;
    const out = { ...(record.aiReview || {}) };
    for (const [key, ai] of Object.entries(proposed)) {
      if (ai === undefined) continue;
      const final = data[key];
      out[key] = { ai, final: final ?? null, ok: JSON.stringify(ai) === JSON.stringify(final ?? null), by: Auth.user?.id || '', at: nowISO() };
    }
    record.aiReview = out;
  }
};
Routes.aiquality = async (main, regId = '') => {
  const regs = (await Data.registries()).filter(r => !r.archivedAt);
  if (!regs.length) { main.innerHTML = '<div class="head"><h1>Точность автозаполнения</h1></div><p>Нет доступных регистров.</p>'; return; }
  const reg = regs.find(r => r.id === regId) || regs[0];
  const events = (await Data.events(reg.id)).filter(e => e.aiReview);
  const stats = new Map();
  for (const e of events) {
    const et = etById(reg, e.type);
    for (const [key, x] of Object.entries(e.aiReview)) {
      const f = et && formFields(et).find(y => y.key === key);
      const k = e.type + '.' + key;
      if (!stats.has(k)) stats.set(k, { form: et?.name || e.type, label: f?.label || key, n: 0, ok: 0, examples: [] });
      const s = stats.get(k); s.n++; if (x.ok) s.ok++; else if (s.examples.length < 3) s.examples.push(`${Array.isArray(x.ai) ? x.ai.join(', ') : x.ai} → ${x.final == null ? 'пусто' : Array.isArray(x.final) ? x.final.join(', ') : x.final}`);
    }
  }
  const rows = [...stats.values()].sort((a, b) => (a.ok / a.n) - (b.ok / b.n) || b.n - a.n);
  const tot = rows.reduce((s, r) => s + r.n, 0), ok = rows.reduce((s, r) => s + r.ok, 0);
  main.innerHTML = `<div class="head"><h1>Точность автозаполнения</h1><div class="row">${regSelect(regs, reg.id, 'aqReg', false)}</div></div>
    <div class="card"><p>Какие поля ИИ заполнил из документов и сколько из них врач оставил без изменений. Поля сверху чаще всего требуют ручной правки: на них стоит проверять новую модель перед включением и уточнять определения в форме.</p>
      <p><b>Предложено значений: ${tot}, принято без правки: ${ok}${tot ? ` (${Math.round(ok / tot * 100)}%)` : ''}.</b> Учитываются формы, сохранённые после обновления 25.11.2026.</p></div>
    ${rows.length ? `<table class="tbl" id="aqTable"><thead><tr><th>Форма</th><th>Поле</th><th>Предложено</th><th>Принято</th><th>Доля</th><th>Примеры правок (ИИ → врач)</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.form)}</td><td>${esc(r.label)}</td><td>${r.n}</td><td>${r.ok}</td><td class="${r.ok / r.n < 0.8 ? 'bad' : ''}">${Math.round(r.ok / r.n * 100)}%</td><td class="small">${esc(r.examples.join('; '))}</td></tr>`).join('')}</tbody></table>` : '<p class="muted" id="aqTable">Пока нет форм, заполненных ИИ и сохранённых врачом.</p>'}`;
  $('#aqReg', main).onchange = e => go('aiquality/' + e.target.value);
};

/* ---------- 4. черновик разбора к M&M ---------- */
const MMDraft = {
  async open(eventId) {
    const ev = await DB.get('events', eventId); if (!ev) return;
    const [reg, p] = await Promise.all([DB.get('registries', ev.registryId), DB.get('patients', ev.patientId)]);
    const m = modal(`<h3>✦ Черновик разбора к M&M</h3><p class="muted">${esc(PID.show(p))} · ${esc(etById(reg, ev.type)?.name || '')} от ${fmtDate(ev.date)}</p><div id="mdOut"><p class="muted">Собираю хронологию…</p></div>`, { wide: true });
    if (!AI.ready()) { $('#mdOut', m).innerHTML = AIAssist.readyBox(); return; }
    const events = (await Data.events(reg.id)).filter(e => e.patientId === p.id).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const forms = events.map(e => { const et = etById(reg, e.type); if (!et) return null; const v = computeValues(reg, p, et, e.data || {}, e.date);
      return { form: et.name, date: e.date, values: Object.fromEntries(formFields(et).filter(f => !isEmpty(v[f.key]) && !['file', 'image', 'diagram', 'user'].includes(f.type) && !f.sensitive).map(f => [f.label, f.type === 'complist' ? (v[f.key] || []).map(c => `${c.name} (CD ${c.grade})`).join('; ') : Array.isArray(v[f.key]) ? v[f.key].join('; ') : v[f.key]])) }; }).filter(Boolean);
    const docs = await AIAssist.docsFor(p.id, new Map());
    if (docs.length && !await AIAssist.consentExternal('Документы пациента')) { m.close?.(); return; }
    const text = docs.map(d => `=== Файл: ${d.name} ===\n${d.text}`).join('\n\n').slice(0, 90000);
    try {
      const raw = AI.parse(await AI.call(`Ты готовишь черновик разбора случая для конференции по осложнениям и летальности (M&M) хирургического отделения.
Данные регистра по пациенту (формы по датам): ${JSON.stringify(forms).slice(0, 30000)}
${docs.length ? 'Ниже документы пациента.' : 'Документов нет, используй только данные регистра.'}
Составь: 1) хронологию ключевых событий (дата, что произошло, источник: форма регистра или файл, дословная цитата из документа до 25 слов, если есть);
2) кратко, что произошло (2-4 предложения, без оценок и обвинений);
3) вопросы для обсуждения на M&M (5-7): моменты принятия решений, сроки распознавания осложнения, профилактика; формулируй как вопросы, не как выводы о вине.
Не выдумывай фактов, которых нет в данных. Ответ только JSON: {"timeline":[{"date":"YYYY-MM-DD","what":"...","source":"...","quote":"..."}],"summary":"...","questions":["..."]}`, { text }));
      const all = AIAssist.norm(text);
      const tl = (raw.timeline || []).map(x => ({ ...x, ok: !x.quote || all.includes(AIAssist.norm(x.quote)) }));
      const html = `<h4>Хронология</h4><table class="tbl"><tbody>${tl.map(x => `<tr><td class="nowrap">${fmtDate(x.date) || esc(x.date || '')}</td><td>${esc(x.what || '')}${x.quote ? `<div class="muted small">«${esc(x.quote)}»${x.ok ? '' : ' <span class="bad">цитата не найдена в документах</span>'}</div>` : ''}</td><td class="muted small">${esc(x.source || '')}</td></tr>`).join('')}</tbody></table>
        <h4>Что произошло</h4><p>${esc(raw.summary || '')}</p><h4>Вопросы для обсуждения</h4><ol>${(raw.questions || []).map(q => `<li>${esc(q)}</li>`).join('')}</ol>
        <p class="muted small">Черновик ИИ: проверьте каждую строку по истории болезни. Цитаты, которых нет в документах дословно, отмечены красным.</p>`;
      $('#mdOut', m).innerHTML = html + '<div class="row"><button class="btn" id="mdSave">Сохранить (HTML)</button></div>';
      $('#mdSave', m).onclick = () => download(`M&M ${PID.show(p)} ${ev.date || ''}.html`, `<!doctype html><meta charset="utf-8"><title>Разбор M&M</title><style>body{font-family:Arial;margin:24px}td{border-bottom:1px solid #ddd;padding:4px 6px;vertical-align:top}.muted{color:#667}.bad{color:#b42318}</style><h2>Разбор M&M: ${esc(PID.show(p))}</h2>${html}`, 'text/html');
      try { await Audit.log('черновик разбора M&M (ИИ)', 'events', ev.id); } catch (e) { }
    } catch (error) { $('#mdOut', m).innerHTML = `<p class="bad">${esc(error.message)}</p>`; }
  }
};
{
  const previous = Routes.mm;
  Routes.mm = async function (main, ...rest) {
    await previous(main, ...rest);
    $$('[data-pk]', main).forEach(cb => {
      const row = cb.closest('tr'); if (!row || $('[data-mmai]', row)) return;
      row.insertAdjacentHTML('beforeend', `<td><button class="btn xs ai" data-mmai="${esc(cb.dataset.pk)}">✦ Черновик разбора</button></td>`);
    });
    $$('[data-mmai]', main).forEach(b => b.onclick = () => MMDraft.open(b.dataset.mmai));
  };
}

Object.assign(ROUTE_GROUP, { ask: 'Работа', aiquality: 'Работа' });
{
  const previous = navGroups;
  navGroups = async function () {
    const groups = await previous();
    const work = groups.find(g => g.id === 'work');
    if (work?.items && can('view') && !routeOff('ask') && !work.items.some(x => x && x.r === 'ask')) {
      const at = work.items.findIndex(x => x && x.r === 'regsummary');
      work.items.splice(at < 0 ? 0 : at + 1, 0, { r: 'ask', t: 'Вопрос к регистру', i: '?' });
    }
    if (work?.items && (can('query') || can('design')) && !routeOff('aiquality') && !work.items.some(x => x && x.r === 'aiquality')) work.items.push({ r: 'aiquality', t: 'Точность автозаполнения', i: '◎' });
    return groups;
  };
}
{
  const previous = Routes.registries;
  Routes.registries = async function (main, ...rest) {
    await previous(main, ...rest);
    const head = $('.head', main);
    if (head && !$('#newRegAI', main)) head.insertAdjacentHTML('beforeend', '<button class="btn ai" id="newRegAI">✦ Регистр из описания</button>');
    $('#newRegAI', main).onclick = () => AIBuild.dialog();
  };
}
if (typeof TRAINING_CHAPTERS !== 'undefined' && typeof TrainingGuide === 'object') {
  const add = (anchor, chapter) => { const at = TRAINING_CHAPTERS.findIndex(c => c.id === anchor); TRAINING_CHAPTERS.splice(at < 0 ? TRAINING_CHAPTERS.length - 1 : at + 1, 0, chapter); };
  add('regsummary', { id: 'ask', name: 'Вопрос к регистру', page: 'ask', go: 'ask', steps: [
    { t: '#akQ', title: 'Спросите обычным языком', text: 'Например: «пациенты после TNT с полным клиническим ответом» или «у кого срок наблюдения наступил, а исход не внесён». ИИ превращает вопрос в условия, они видны и убираются по одному; пациентов считает AddAll. Условия можно сохранить как список регистра.' }] });
  add('registries', { id: 'aibuild', name: 'Регистр из описания', page: 'registries', go: 'registries', steps: [
    { t: '#newRegAI', title: 'Новый регистр своими словами', text: 'Опишите, что хотите вести: каких пациентов, какие этапы, что важно. Можно приложить таблицу, которую ведёте сейчас. ИИ соберёт формы, поля, сроки наблюдения и показатели; AddAll проверит структуру и создаст черновик. Описание можно дополнить и пересобрать.' }] });
  add('aicheck', { id: 'aiquality', name: 'Точность автозаполнения', page: 'aiquality', go: 'aiquality', steps: [
    { t: '#aqTable', title: 'Где ИИ ошибается', text: 'По каждому полю: сколько значений ИИ предложил и сколько врач оставил без правки, с примерами исправлений. Поля с низкой долей проверяйте внимательнее и уточняйте их определения.' }] });
  TrainingGuide.steps = TRAINING_CHAPTERS.flatMap((chapter, c) => chapter.steps.map((step, i) => ({ ...step, chapter, c, i })));
}
