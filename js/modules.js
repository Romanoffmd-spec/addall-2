/* AddAll 2.0: аналитика, МДК, опросники, годовой отчёт, импорт/экспорт */
'use strict';

/* ---------- набор данных регистра ---------- */
async function loadReg(regId) {
  const [reg, patients, events, users] = await Promise.all([DB.get('registries', regId), Data.patients(regId), Data.events(regId), Data.users()]);
  return { reg, patients, events, users };
}
function rowsFor(ds, etId) {
  const et = etById(ds.reg, etId); if (!et) return [];
  return ds.events.filter(e => e.type === etId).map(e => { const p = ds.patients.find(x => x.id === e.patientId); return { p, e, v: computeValues(ds.reg, p, et, e.data, e.date) }; }).filter(r => r.p);
}
function cohortPatients(ds, cohort) {
  return ds.patients.filter(p => (cohort.conds || []).every(c => {
    if (c.et === '_p') return condOK({ key: c.key, op: c.op, value: c.value }, { ...p.data, sex: p.sex, birthDate: p.birthDate });
    const et = etById(ds.reg, c.et);
    return ds.events.some(e => e.patientId === p.id && e.type === c.et && condOK({ key: c.key, op: c.op, value: c.value }, computeValues(ds.reg, p, et, e.data, e.date)));
  }) && (!cohort.from && !cohort.to || (() => {
    const st = ds.events.filter(e => e.patientId === p.id && e.type === (ds.reg.keyDates?.start || ds.reg.eventTypes[0].id)).map(e => e.date).sort()[0];
    return st && (!cohort.from || st >= cohort.from) && (!cohort.to || st <= cohort.to);
  })()));
}
const fieldsOf = (reg, etId) => etId === '_p' ? [F('sex', 'Пол', 'select', { options: ['М', 'Ж'] }), ...(reg.patientFields || [])] : formFields(etById(reg, etId));
const valStr = (f, v, users) => f?.type === 'user' ? (users.find(u => u.id === v)?.name || v) : Array.isArray(v) ? v.join(', ') : v;

/* ---------- АНАЛИТИКА ---------- */
const ANALYSES = { dist: 'Распределение', cross: 'Кросс-таблица (χ²)', run: 'Динамика по месяцам', km: 'Выживаемость (Каплан-Майер)', cusum: 'RA-CUSUM / VLAD по хирургу', funnel: 'Funnel plot (сравнение)', ind: 'Показатели качества по годам' };

Routes.analytics = async (main, regId = '') => {
  const regs = await Data.registries();
  const reg0 = regs.find(r => r.id === regId) || regs[0];
  if (!reg0) { main.innerHTML = '<div class="head"><h1>Аналитика</h1></div>' + emptyState('Нет регистров.'); return; }
  const ds = await loadReg(reg0.id); const reg = ds.reg;
  const saved = (await DB.all('saved')).filter(s => s.registryId === reg.id);
  const st = Routes.analytics.st && Routes.analytics.st.reg === reg.id ? Routes.analytics.st : (Routes.analytics.st = { reg: reg.id, type: 'dist', cohort: { conds: [], from: '', to: '' }, cfg: {} });
  const etOpts = (sel, withP = false) => `${withP ? `<option value="_p" ${sel === '_p' ? 'selected' : ''}>Карточка пациента</option>` : ''}${reg.eventTypes.map(e => `<option value="${e.id}" ${sel === e.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}`;
  const fOpts = (etId, sel, types) => fieldsOf(reg, etId).filter(f => !types || types.includes(f.type)).map(f => `<option value="${f.key}" ${sel === f.key ? 'selected' : ''}>${esc(f.label)}</option>`).join('');
  const dateFields = reg.eventTypes.flatMap(e => formFields(e).filter(f => f.type === 'date').map(f => ({ ...f, etName: e.name })));

  main.innerHTML = `<div class="head"><h1>Аналитика</h1><div class="row">${regSelect(regs, reg.id, 'regSel', false)}</div></div>
    <div class="an"><div class="an-cfg card">
      <label class="flab">Когорта</label><div id="coh"></div>
      <div class="row"><button class="btn xs" id="cohAdd">+ условие</button></div>
      <div class="row"><div class="fld"><label class="flab">Начало (с)</label><input class="inp" type="date" id="cFrom" value="${esc(st.cohort.from)}"></div><div class="fld"><label class="flab">по</label><input class="inp" type="date" id="cTo" value="${esc(st.cohort.to)}"></div></div>
      <hr><label class="flab">Анализ</label><select class="inp" id="aType">${Object.entries(ANALYSES).map(([k, v]) => `<option value="${k}" ${st.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <div id="aCfg"></div>
      <div class="row"><button class="btn primary" id="aRun">Построить</button><button class="btn" id="aSave">Сохранить</button></div>
      ${saved.length ? `<hr><label class="flab">Сохранённые</label>${saved.map(s => `<div class="row between"><a href="javascript:void 0" data-load="${s.id}">${esc(s.name)}</a><button class="btn xs" data-sdel="${s.id}">×</button></div>`).join('')}` : ''}
    </div><div class="an-out" id="aOut"><div class="card muted">Задайте когорту и анализ, затем нажмите «Построить».</div></div></div>`;

  const drawCoh = () => {
    $('#coh').innerHTML = (st.cohort.conds || []).map((c, i) => `<div class="cond" data-i="${i}"><select class="inp" data-c="et">${etOpts(c.et, true)}</select><select class="inp" data-c="key">${fOpts(c.et, c.key)}</select><select class="inp" data-c="op">${Object.entries(OPS).map(([k, v]) => `<option value="${k}" ${c.op === k ? 'selected' : ''}>${v}</option>`).join('')}</select><input class="inp" data-c="value" value="${esc(c.value || '')}" placeholder="значение"><button class="btn xs" data-cpick="${i}" title="Выбрать несколько значений">☰ выбрать</button><button class="btn xs" data-cx="${i}">×</button></div>`).join('') || '<div class="muted">Все пациенты регистра</div>';
  };
  drawCoh();
  $('#coh').onchange = (e) => { const d = e.target.closest('.cond'); if (!d) return; const c = st.cohort.conds[d.dataset.i]; c[e.target.dataset.c] = e.target.value; if (e.target.dataset.c === 'et') { c.key = fieldsOf(reg, c.et)[0]?.key; drawCoh(); } };
  $('#coh').oninput = $('#coh').onchange;
  $('#coh').onclick = async e => {
    if (e.target.dataset.cx) { st.cohort.conds.splice(e.target.dataset.cx, 1); drawCoh(); }
    if (e.target.dataset.cpick) { const cd = st.cohort.conds[e.target.dataset.cpick]; const f = fieldsOf(reg, cd.et).find(x => x.key === cd.key); if (!f) return;
      const seen = cd.et === '_p' ? ds.patients.map(p => f.key === 'sex' ? p.sex : p.data?.[f.key]) : rowsFor(ds, cd.et).map(r => r.v[f.key]);
      const v = await pickValues(f.label, valueOptions(f, ds.users, seen), String(cd.value || '').split(';').filter(Boolean)); if (v == null) return;
      cd.op = 'in'; cd.value = v.join(';'); drawCoh(); }
  };
  $('#cohAdd').onclick = () => { const et = reg.eventTypes[0].id; st.cohort.conds.push({ et, key: formFields(reg.eventTypes[0])[0]?.key || '', op: 'eq', value: '' }); drawCoh(); };
  $('#cFrom').onchange = e => st.cohort.from = e.target.value; $('#cTo').onchange = e => st.cohort.to = e.target.value;

  const c = st.cfg; const defEt = reg.keyDates?.start || reg.eventTypes[0].id;
  const outcomeUI = (pref) => `<label class="flab">Исход («случай»)</label><div class="row"><select class="inp" data-k="${pref}key">${fOpts(c.et || defEt, c[pref + 'key'])}</select><select class="inp" data-k="${pref}op">${Object.entries(OPS).map(([k, v]) => `<option value="${k}" ${c[pref + 'op'] === k ? 'selected' : ''}>${v}</option>`).join('')}</select><input class="inp" data-k="${pref}value" value="${esc(c[pref + 'value'] || '')}" placeholder="значение"></div>`;
  const riskUnits = () => `<label class="flab">Единица поля риска</label><select class="inp" data-k="riskUnit">
    <option value="">Как в словаре</option><option value="percent" ${c.riskUnit === 'percent' ? 'selected' : ''}>%</option>
    <option value="fraction" ${c.riskUnit === 'fraction' ? 'selected' : ''}>доля 0–1</option></select>`;
  const drawCfg = () => {
    const t = st.type; c.et = c.et || defEt; let h = '';
    if (t === 'dist') h = `<label class="flab">Форма</label><select class="inp" data-k="et">${etOpts(c.et, true)}</select><label class="flab">Поле</label><select class="inp" data-k="field">${fOpts(c.et, c.field)}</select>`;
    if (t === 'cross') h = `<label class="flab">Форма</label><select class="inp" data-k="et">${etOpts(c.et)}</select><label class="flab">Строки</label><select class="inp" data-k="row">${fOpts(c.et, c.row, ['select', 'yesno', 'user', 'calc', 'text'])}</select><label class="flab">Столбцы</label><select class="inp" data-k="col"><option value="_sex">Пол пациента</option>${fOpts(c.et, c.col, ['select', 'yesno', 'user', 'calc', 'text'])}</select>`;
    if (t === 'run') h = `<label class="flab">Форма</label><select class="inp" data-k="et">${etOpts(c.et)}</select><label class="flab">Показывать</label><select class="inp" data-k="mode"><option value="n">число событий</option><option value="rate" ${c.mode === 'rate' ? 'selected' : ''}>долю исхода, %</option></select>${outcomeUI('o')}<label class="flab">Период</label><select class="inp" data-k="per"><option value="m">месяц</option><option value="q" ${c.per === 'q' ? 'selected' : ''}>квартал</option><option value="y" ${c.per === 'y' ? 'selected' : ''}>год</option></select>`;
    if (t === 'km') h = `<label class="flab">Точка отсчёта</label><select class="inp" data-k="et">${etOpts(c.et)}</select><label class="flab">Конечная точка (дата события)</label><select class="inp" data-k="end">${dateFields.map(f => `<option value="${f.key}" ${c.end === f.key ? 'selected' : ''}>${esc(f.etName)} › ${esc(f.label)}</option>`).join('') || '<option value="">нет полей-дат</option>'}</select><label class="flab">Сравнить группы по</label><select class="inp" data-k="grp"><option value="">без групп</option><option value="_sex" ${c.grp === '_sex' ? 'selected' : ''}>Пол</option>${centers().length ? `<option value="_center" ${c.grp === '_center' ? 'selected' : ''}>Центр</option>` : ''}${fOpts(c.et, c.grp, ['select', 'yesno', 'user', 'calc'])}</select><div class="help">Цензурирование по дате последнего события пациента в регистре.</div>`;
    if (t === 'cusum') h = `<label class="flab">Форма</label><select class="inp" data-k="et">${etOpts(c.et)}</select>${outcomeUI('o')}<label class="flab">Ожидаемый риск (поле, % или 0–1)</label><select class="inp" data-k="risk"><option value="">нет: средняя частота когорты</option>${fOpts(c.et, c.risk, ['number', 'calc'])}</select><label class="flab">Хирург / группа</label><select class="inp" data-k="grp"><option value="">все вместе</option>${centers().length ? `<option value="_center" ${c.grp === '_center' ? 'selected' : ''}>Центр</option>` : ''}${fOpts(c.et, c.grp, ['user', 'select', 'text'])}</select><label class="flab">Значение группы</label><input class="inp" data-k="gval" value="${esc(c.gval || '')}" placeholder="пусто = все; для хирурга выберите после «Построить»"><div class="row"><div class="fld"><label class="flab">OR тревоги</label><input class="inp" type="number" step="0.1" data-k="or" value="${esc(c.or || 2)}"></div><div class="fld"><label class="flab">Порог h</label><input class="inp" type="number" step="0.1" data-k="h" value="${esc(c.h || 4.5)}"></div></div>`;
    if (t === 'funnel') h = `<label class="flab">Форма</label><select class="inp" data-k="et">${etOpts(c.et)}</select>${outcomeUI('o')}<label class="flab">Сравнивать по</label><select class="inp" data-k="grp">${centers().length ? `<option value="_center" ${c.grp === '_center' ? 'selected' : ''}>Центр</option>` : ''}${fOpts(c.et, c.grp, ['user', 'select', 'text'])}</select><label class="flab">Поправка на риск (поле ожидаемого риска)</label><select class="inp" data-k="risk"><option value="">без поправки</option>${fOpts(c.et, c.risk, ['number', 'calc'])}</select>`;
    if (['cusum', 'funnel'].includes(t)) h += riskUnits();
    if (t === 'ind') h = `<p class="muted">Все показатели качества регистра по годам точки отсчёта.</p>`;
    if (t === 'compare') h = `<label class="flab">Форма</label><select class="inp" data-k="et">${etOpts(c.et)}</select><label class="flab">Числовой показатель</label><select class="inp" data-k="num">${fOpts(c.et, c.num, ['number', 'calc'])}</select><label class="flab">Группы</label><select class="inp" data-k="grp"><option value="_sex" ${c.grp === '_sex' ? 'selected' : ''}>Пол</option>${centers().length ? `<option value="_center" ${c.grp === '_center' ? 'selected' : ''}>Центр</option>` : ''}${fOpts(c.et, c.grp, ['select', 'yesno', 'user', 'calc'])}</select><div class="help">2 группы: критерий Манна-Уитни, 3 и более: Краскела-Уоллиса с попарными сравнениями (поправка Холма).</div>`;
    if (t !== 'ind') {
      const ff = fieldsOf(reg, c.et).filter(f => ['select', 'multiselect', 'yesno', 'user'].includes(f.type));
      if (c.efEt !== c.et) { c.efEt = c.et; c.efvals = []; const et = etById(reg, c.et); c.efkey = (ff.find(f => et && f.label.toLowerCase() === et.name.toLowerCase()) || ff.find(f => f.type === 'select') || {}).key || ''; }
      const f = ff.find(x => x.key === c.efkey);
      const lbl = (c.efvals || []).map(v => f?.type === 'user' ? (ds.users.find(u => u.id === v)?.name || v) : v);
      h += `<div class="efbox"><label class="flab">Отбор: какие события «${esc(etById(reg, c.et)?.name || 'пациенты')}» учитывать</label><div class="row"><select class="inp" data-k="efkey"><option value="">все без отбора</option>${ff.map(x => `<option value="${x.key}" ${c.efkey === x.key ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select>${c.efkey ? `<button class="btn sm" id="efPick">☰ ${c.efvals?.length ? 'выбрано ' + c.efvals.length : 'выбрать'}</button>` : ''}</div>${lbl.length ? `<div class="help"><b>${esc(lbl.join(', '))}</b></div>` : c.efkey ? '<div class="help">Сейчас учитываются все значения</div>' : ''}</div>`;
    }
    $('#aCfg').innerHTML = h;
    const efb = $('#efPick'); if (efb) efb.onclick = async () => {
      const f = fieldsOf(reg, c.et).find(x => x.key === c.efkey); if (!f) return;
      const seen = c.et === '_p' ? ds.patients.map(p => f.key === 'sex' ? p.sex : p.data?.[f.key]) : rowsFor(ds, c.et).map(r => r.v[f.key]);
      const v = await pickValues(`${f.label}: выберите одно или несколько значений`, valueOptions(f, ds.users, seen), c.efvals || []); if (v == null) return;
      c.efvals = v; drawCfg();
    };
  };
  drawCfg();
  $('#aCfg').onchange = e => { const k = e.target.dataset.k; if (!k) return; c[k] = e.target.value; if (k === 'et') drawCfg(); if (k === 'efkey') { c.efvals = []; drawCfg(); if (c.efkey) $('#efPick')?.click(); } };
  $('#aCfg').oninput = e => { const k = e.target.dataset.k; if (k && e.target.tagName === 'INPUT') c[k] = e.target.value; };
  $('#aType').onchange = e => { st.type = e.target.value; drawCfg(); };
  $('#regSel').onchange = e => go('analytics/' + e.target.value);
  $('#aRun').onclick = () => { $$('#aCfg [data-k]').forEach(el => c[el.dataset.k] = el.value); runAnalysis(ds, st, $('#aOut')); };
  $('#aSave').onclick = async () => { const n = await promptBox('Название анализа', ANALYSES[st.type]); if (!n) return; await DB.put('saved', { registryId: reg.id, name: n, st: clone(st) }); toast('Сохранено'); App.route(); };
  main.onclick = async e => {
    if (e.target.dataset.load) { const s = saved.find(x => x.id === e.target.dataset.load); Routes.analytics.st = clone(s.st); App.route(); }
    if (e.target.dataset.sdel) { await DB.del('saved', e.target.dataset.sdel); App.route(); }
  };
};

function chartBox(title, svg, csvRows, csvCols) {
  const id = uid('c');
  setTimeout(() => {
    const b = document.getElementById(id); if (!b) return;
    $('[data-svg]', b).onclick = () => download(slug(title) + '.svg', svg, 'image/svg+xml');
    $('[data-png]', b).onclick = () => Chart.toPNG(svg, slug(title) + '.png');
    if (csvRows) $('[data-csv]', b).onclick = () => download(slug(title) + '.csv', toCSV(csvRows, csvCols), 'text/csv');
  }, 0);
  return `<div class="card chartbox" id="${id}">${svg}<div class="row end"><button class="btn xs" data-svg>SVG</button><button class="btn xs" data-png>PNG</button>${csvRows ? '<button class="btn xs" data-csv>Данные CSV</button>' : ''}</div></div>`;
}

function runAnalysis(ds, st, out) {
  const { reg, users } = ds, c = st.cfg;
  const pts = new Set(cohortPatients(ds, st.cohort).map(p => p.id));
  const fld = (et, k) => fieldsOf(reg, et).find(f => f.key === k);
  const efOK = (v) => !c.efkey || !(c.efvals || []).length || [].concat(v ?? []).some(x => c.efvals.includes(String(x)));
  const rows = (et) => rowsFor(ds, et).filter(r => pts.has(r.p.id) && (et !== c.et || efOK(r.v[c.efkey])));
  const efTxt = c.efkey && (c.efvals || []).length ? ` · отбор: ${esc(fld(c.et, c.efkey)?.label || c.efkey)} = ${esc(c.efvals.map(v => fld(c.et, c.efkey)?.type === 'user' ? (users.find(u => u.id === v)?.name || v) : v).join(', '))}` : '';
  const cohTxt = `<p class="muted">Когорта: ${pts.size} пациентов${(st.cohort.conds || []).length ? ` · условий: ${st.cohort.conds.length}` : ''}${st.cohort.from || st.cohort.to ? ` · период ${st.cohort.from || '…'} – ${st.cohort.to || '…'}` : ''}${efTxt}</p>`;
  const outc = (pref) => ({ key: c[pref + 'key'], op: c[pref + 'op'] || 'eq', value: c[pref + 'value'] || '' });
  let h = '';
  try {
    if (st.type === 'dist') {
      const f = fld(c.et, c.field); if (!f) throw new Error('Выберите поле');
      let vals;
      if (c.et === '_p') vals = ds.patients.filter(p => pts.has(p.id) && efOK(c.efkey === 'sex' ? p.sex : p.data?.[c.efkey])).map(p => f.key === 'sex' ? p.sex : p.data?.[f.key]);
      else vals = rows(c.et).map(r => r.v[f.key]);
      const filled = vals.filter(v => !isEmpty(v));
      if (f.type === 'number' || (f.type === 'calc' && filled.every(v => !isNaN(Number(v))))) {
        const s = Stats.summary(filled);
        h = chartBox(f.label, Chart.hist(f.label, Stats.nums(filled), f.unit || ''), filled.map(v => ({ v })), [{ key: 'v', label: f.label }]) +
          `<div class="card"><table class="tbl"><tbody><tr><td>n (заполнено / всего)</td><td><b>${s.n} / ${vals.length}</b></td></tr><tr><td>Среднее ± SD</td><td><b>${s.mean} ± ${s.sd}</b></td></tr><tr><td>Медиана [IQR]</td><td><b>${s.median} [${s.q1}; ${s.q3}]</b></td></tr><tr><td>Мин – макс</td><td><b>${s.min} – ${s.max}</b></td></tr></tbody></table></div>`;
      } else {
        const flat = filled.flatMap(v => Array.isArray(v) ? v.map(x => typeof x === 'object' ? x.name : x) : [valStr(f, v, users)]);
        const cnt = {}; flat.forEach(v => cnt[v] = (cnt[v] || 0) + 1);
        const ent = Object.entries(cnt).sort((a, b) => b[1] - a[1]); const N = filled.length;
        h = chartBox(f.label, Chart.bar(f.label, ent.map(e => e[0]), ent.map(e => e[1]), { pct: ent.map(e => Math.round(e[1] / N * 1000) / 10) }), ent.map(e => ({ k: e[0], n: e[1], p: Math.round(e[1] / N * 1000) / 10 })), [{ key: 'k', label: f.label }, { key: 'n', label: 'n' }, { key: 'p', label: '%' }]) +
          `<div class="card"><table class="tbl"><thead><tr><th>${esc(f.label)}</th><th>n</th><th>%</th></tr></thead><tbody>${ent.map(e => `<tr><td><b>${esc(e[0])}</b></td><td>${e[1]}</td><td>${Math.round(e[1] / N * 1000) / 10}</td></tr>`).join('')}<tr><td class="muted">не заполнено</td><td>${vals.length - N}</td><td></td></tr></tbody></table></div>`;
      }
    }
    if (st.type === 'cross') {
      const fr = fld(c.et, c.row), fc = c.col === '_sex' ? { key: '_sex', label: 'Пол' } : fld(c.et, c.col); if (!fr || !fc) throw new Error('Выберите поля');
      const data = rows(c.et).map(r => ({ r: valStr(fr, r.v[fr.key], users), c: c.col === '_sex' ? r.p.sex : valStr(fc, r.v[fc.key], users) })).filter(x => !isEmpty(x.r) && !isEmpty(x.c));
      const t = Stats.crosstab(data);
      h = `<div class="card"><h3>${esc(fr.label)} × ${esc(fc.label)}</h3><table class="tbl"><thead><tr><th></th>${t.C.map(x => `<th>${esc(x)}</th>`).join('')}<th>Всего</th></tr></thead><tbody>${t.R.map((r, i) => `<tr><td><b>${esc(r)}</b></td>${t.m[i].map((v, j) => `<td>${v} <span class="muted">(${t.ct[j] ? Math.round(v / t.ct[j] * 1000) / 10 : 0}%)</span></td>`).join('')}<td><b>${t.rt[i]}</b></td></tr>`).join('')}<tr><td><b>Всего</b></td>${t.ct.map(v => `<td><b>${v}</b></td>`).join('')}<td><b>${t.N}</b></td></tr></tbody></table>
        <p>χ² Пирсона = <b>${t.chi}</b>, df = ${t.df}, p = <b>${Stats.pFmt(t.p)}</b>${t.R.length === 2 && t.C.length === 2 ? ` · точный критерий Фишера: p = <b>${Stats.pFmt(Stats.fisher2x2(t.m[0][0], t.m[0][1], t.m[1][0], t.m[1][1]).p)}</b>` : ''}${t.lowExp > 0.2 ? ` <span class="bad">· более 20% ячеек с ожидаемой частотой меньше 5 (правило Кокрена): ${t.R.length === 2 && t.C.length === 2 ? 'опирайтесь на критерий Фишера' : 'χ² ненадёжен, объедините категории'}</span>` : ''}</p><p class="muted">Проценты по столбцам.</p></div>`;
    }
    if (st.type === 'run') {
      const per = (d) => c.per === 'y' ? d.slice(0, 4) : c.per === 'q' ? d.slice(0, 4) + '-Q' + (Math.floor((Number(d.slice(5, 7)) - 1) / 3) + 1) : d.slice(0, 7);
      const rr = rows(c.et).filter(r => r.e.date); const o = outc('o');
      const g = {}; rr.forEach(r => { const k = per(r.e.date); g[k] = g[k] || { n: 0, y: 0 }; g[k].n++; if (o.key && condOK(o, r.v)) g[k].y++; });
      const keys = Object.keys(g).sort(); const rate = c.mode === 'rate';
      const vals = keys.map(k => rate ? (g[k].n ? Math.round(g[k].y / g[k].n * 1000) / 10 : 0) : g[k].n);
      const med = Stats.q(vals, .5);
      /* контрольная карта Шухарта: p-карта для долей, c-карта для числа событий */
      const totN = keys.reduce((s, k) => s + g[k].n, 0), totY = keys.reduce((s, k) => s + g[k].y, 0);
      const pbar = totN ? totY / totN : 0, cbar = keys.length ? totN / keys.length : 0;
      const lim = keys.map(k => rate ? { u: Math.min(100, (pbar + 3 * Math.sqrt(pbar * (1 - pbar) / g[k].n)) * 100), l: Math.max(0, (pbar - 3 * Math.sqrt(pbar * (1 - pbar) / g[k].n)) * 100) } : { u: cbar + 3 * Math.sqrt(cbar), l: Math.max(0, cbar - 3 * Math.sqrt(cbar)) });
      const outIdx = vals.map((v, i) => v > lim[i].u || v < lim[i].l);
      const svg = Chart.line(rate ? 'p-карта Шухарта: доля исхода, %' : 'c-карта Шухарта: число событий', [
        { n: rate ? 'доля, %' : 'число', pts: keys.map((k, i) => ({ x: i, y: vals[i], mark: outIdx[i] })) },
        { n: 'верхняя граница (3σ)', pts: keys.map((k, i) => ({ x: i, y: Math.round(lim[i].u * 10) / 10 })), c: '#d9534f', dash: true },
        { n: 'нижняя граница (3σ)', pts: keys.map((k, i) => ({ x: i, y: Math.round(lim[i].l * 10) / 10 })), c: '#d9534f', dash: true }
      ], { xl: 'Период', yl: rate ? '%' : 'n', fmtX: v => keys[v] || '', ymin: 0, hlines: [{ y: rate ? pbar * 100 : cbar, label: 'среднее', c: '#333' }].concat(med != null ? [{ y: med, label: 'медиана', c: '#999' }] : []) });
      h = `<div class="card"><p>Среднее: <b>${rate ? Math.round(pbar * 1000) / 10 + '%' : Math.round(cbar * 10) / 10}</b>. Периодов вне контрольных границ: ${outIdx.filter(Boolean).length ? `<b class="bad">${keys.filter((k, i) => outIdx[i]).join(', ')}</b> (особая причина, нужен разбор)` : '<b>нет</b> (процесс стабилен)'}.</p></div>` + chartBox('run_chart', svg, keys.map((k, i) => ({ k, n: g[k].n, y: g[k].y, v: vals[i] })), [{ key: 'k', label: 'Период' }, { key: 'n', label: 'Событий' }, { key: 'y', label: 'Случаев' }, { key: 'v', label: rate ? '%' : 'n' }]);
    }
    if (st.type === 'km') {
      if (!c.end) throw new Error('Нет поля с датой конечной точки');
      const groups = {};
      ds.patients.filter(p => pts.has(p.id)).forEach(p => {
        const pe = ds.events.filter(e => e.patientId === p.id);
        const start = pe.filter(e => e.type === c.et && e.date && efOK(computeValues(reg, p, etById(reg, c.et), e.data, e.date)[c.efkey])).sort((a, b) => a.date.localeCompare(b.date))[0]; if (!start) return;
        let endDate = null; pe.forEach(e => { const d = e.data?.[c.end]; if (d && (!endDate || d < endDate)) endDate = d; });
        const last = pe.map(e => e.date).concat(pe.flatMap(e => Object.values(e.data || {}).filter(v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)))).sort().pop();
        const t = endDate ? daysBetween(start.date, endDate) : daysBetween(start.date, last || start.date);
        let gk = 'Все';
        if (c.grp === '_sex') gk = p.sex || '?'; else if (c.grp === '_center') gk = p.center || 'не указан'; else if (c.grp) { const et = etById(reg, c.et); const v = computeValues(reg, p, et, start.data, start.date)[c.grp]; gk = isEmpty(v) ? 'не указано' : valStr(fld(c.et, c.grp), v, users); }
        (groups[gk] = groups[gk] || []).push({ t: Math.max(0, t) / 30.4375, e: endDate ? 1 : 0 });
      });
      const names = Object.keys(groups).sort(); if (!names.length) throw new Error('Нет пациентов с точкой отсчёта');
      const kms = names.map(n => ({ n, km: Stats.km(groups[n]) }));
      const lr = names.length > 1 ? Stats.logrank(names.map(n => groups[n])) : null;
      const maxT = Math.max(...kms.map(k => k.km.maxT));
      const svg = Chart.line('Каплан-Майер', kms.map((k, i) => ({ n: names.length > 1 ? `${k.n} (n=${k.km.n})` : '', step: true, pts: k.km.pts.map(p => ({ x: p.t, y: p.s * 100 })), extendTo: k.km.maxT, ticks: k.km.censored.map(x => ({ x: x.t, y: x.s * 100 })), c: PAL[i] })), { step: true, xl: 'Месяцы', yl: '%', ymin: 0, ymax: 100, xmin: 0, xmax: maxT || 1 });
      const at = (km, m) => { if (m > km.maxT) return 'нет наблюдения'; const c = Stats.kmCI(km, m); return QI.n1(c.s * 100) + '%' + (c.lo != null ? `<div class="muted small">ДИ ${QI.n1(c.lo * 100)}-${QI.n1(c.hi * 100)}</div>` : ''); };
      h = chartBox('kaplan_meier', svg) + `<div class="card"><table class="tbl"><thead><tr><th>Группа</th><th>n</th><th>События</th><th>Медиана, мес</th><th>12 мес</th><th>36 мес</th><th>60 мес</th></tr></thead><tbody>${kms.map(k => `<tr><td><b>${esc(k.n)}</b></td><td>${k.km.n}</td><td>${k.km.events}</td><td>${k.km.median == null ? 'не достигнута' : Math.round(k.km.median * 10) / 10}</td><td>${at(k.km, 12)}</td><td>${at(k.km, 36)}</td><td>${at(k.km, 60)}</td></tr>`).join('')}</tbody></table>${lr ? `<p>Лог-ранговый критерий: χ² = <b>${lr.chi}</b>, df = ${lr.df}, p = <b>${Stats.pFmt(lr.p)}</b></p>` : ''}<p class="muted">Засечки на кривых: цензурированные наблюдения.</p></div>`;
    }
    if (st.type === 'cusum') {
      const o = outc('o'); if (!o.key) throw new Error('Задайте исход');
      let rr = rows(c.et).filter(r => r.e.date && (['empty', 'filled'].includes(o.op) || (!isEmpty(r.v[o.key]) && r.v[o.key] !== 'неизвестно')))
        .sort((a, b) => a.e.date.localeCompare(b.e.date));
      const p0 = rr.length ? rr.filter(r => condOK(o, r.v)).length / rr.length : 0;
      const groupsAvail = c.grp ? [...new Set(rr.map(r => r.v[c.grp]).filter(v => !isEmpty(v)))] : [];
      if (c.grp && c.gval) rr = rr.filter(r => String(r.v[c.grp]) === String(c.gval) || valStr(fld(c.et, c.grp), r.v[c.grp], users) === c.gval);
      const unit = c.riskUnit || (fld(c.et, c.risk)?.unit === '%' ? 'percent' : 'fraction');
      const cases = rr.flatMap(r => {
        const p = c.risk ? Stats.riskProbability(r.v[c.risk], unit) : p0;
        return p == null ? [] : [{ y: condOK(o, r.v) ? 1 : 0, p, date: r.e.date, pid: r.p.id }];
      });
      if (!cases.length) throw new Error('Нет записей с известными исходом и риском');
      const excludedRisk = rr.length - cases.length;
      const cs = Stats.racusum(cases, Number(c.or || 2), Number(c.h || 4.5)), vl = Stats.vlad(cases);
      const svg1 = Chart.line('RA-CUSUM (сигнал при превышении порога)', [{ pts: cs.pts.map(p => ({ x: p.i, y: p.S, mark: p.sig })) }], { xl: 'Номер случая', yl: 'S', hlines: [{ y: Number(c.h || 4.5), label: 'порог h' }], ymin: 0 });
      const svg2 = Chart.line('VLAD (ожидаемые минус наблюдаемые исходы)', [{ pts: vl.map(p => ({ x: p.i, y: p.v })) }], { xl: 'Номер случая', yl: 'E − O', hlines: [{ y: 0, c: '#888' }] });
      h = (groupsAvail.length ? `<div class="card"><b>Выберите группу:</b> ${groupsAvail.map(g => `<button class="btn xs" data-gsel="${esc(g)}">${esc(valStr(fld(c.et, c.grp), g, users))}</button>`).join(' ')} <button class="btn xs" data-gsel="">все</button></div>` : '') +
        `<div class="card"><p>Случаев: <b>${cases.length}</b>, наблюдаемых исходов: <b>${cases.filter(x => x.y).length}</b>, ожидаемых: <b>${Math.round(cases.reduce((s, x) => s + x.p, 0) * 10) / 10}</b>. ${c.risk ? 'Ожидаемый риск из поля.' + (excludedRisk ? ' Исключено без достоверного значения риска: ' + excludedRisk + '.' : '') : `Риск не задан: используется средняя частота когорты ${Math.round(p0 * 1000) / 10}% (без поправки на риск).`} Сигналы: ${cs.signals.length ? `<b class="bad">на случаях ${cs.signals.join(', ')}</b>` : 'нет'}.</p></div>` +
        chartBox('ra_cusum', svg1, cases.map((x, i) => ({ i: i + 1, date: x.date, y: x.y, p: Math.round(x.p * 1000) / 1000, S: Math.round(cs.pts[i].S * 1000) / 1000, vlad: Math.round(vl[i].v * 1000) / 1000 })), [{ key: 'i', label: '№' }, { key: 'date', label: 'Дата' }, { key: 'y', label: 'Исход' }, { key: 'p', label: 'Ожидаемый риск' }, { key: 'S', label: 'CUSUM' }, { key: 'vlad', label: 'VLAD' }]) + chartBox('vlad', svg2);
      setTimeout(() => $$('[data-gsel]', out).forEach(b => b.onclick = () => { c.gval = b.dataset.gsel; const inp = $('[data-k=gval]'); if (inp) inp.value = c.gval; runAnalysis(ds, st, out); }), 0);
    }
    if (st.type === 'funnel') {
      const o = outc('o'); if (!o.key || !c.grp) throw new Error('Задайте исход и группировку');
      const rr = rows(c.et); const g = Object.create(null); let noRisk = 0, noOutcome = 0, brier = 0;
      const unit = c.riskUnit || (fld(c.et, c.risk)?.unit === '%' ? 'percent' : 'fraction');
      rr.forEach(r => {
        const k = c.grp === '_center' ? r.e.episodeCenter ?? r.v[c.grp] : r.v[c.grp];
        if (isEmpty(k)) return;
        if (!['empty', 'filled'].includes(o.op) && (isEmpty(r.v[o.key]) || r.v[o.key] === 'неизвестно')) { noOutcome++; return; }
        const p = c.risk ? Stats.riskProbability(r.v[c.risk], unit) : null;
        if (c.risk && p == null) { noRisk++; return; }
        const observed = Number(condOK(o, r.v));
        const group = g[k] ||= { n: 0, y: 0, e: 0 };
        group.n++;
        group.y += observed;
        if (p != null) { group.e += p; brier += (p - observed) ** 2; }
      });
      const mode = c.risk ? 'r' : 'p';
      const N = Object.values(g).reduce((s, x) => s + x.n, 0), Y = Object.values(g).reduce((s, x) => s + x.y, 0), p0 = N ? Y / N : 0, target = mode === 'r' ? 1 : p0;
      const f = fld(c.et, c.grp); const anon = Settings.data.anonCodes !== false && (f?.type === 'user' || c.grp === '_center');
      const cl = centers(); const ccode = (k) => k === Auth.user.center ? 'Мой центр' : 'Ц' + (cl.indexOf(k) + 1 || '?');
      let pts_ = Object.entries(g).filter(([k, v]) => mode === 'p' || v.e > 0).map(([k, v]) => { const u = users.find(x => x.id === k);
        const label = !anon ? valStr(f, k, users) : c.grp === '_center' ? ccode(k) : (u?.id === Auth.user.id ? 'Я' : (u?.code || '?'));
        return { label, n: v.n, y: v.y, e: v.e, ci: mode === 'r' ? Stats.oeInterval(v.y, v.e) : null }; });
      const zs = pts_.map(p => mode === 'r' ? (p.y / p.e - 1) / Math.sqrt(1 / p.e) : (p0 > 0 && p0 < 1 ? (p.y / p.n - p0) / Math.sqrt(p0 * (1 - p0) / p.n) : 0));
      const od = Stats.overdispersion(zs), phi = od.inflate ? od.phi : 1;
      pts_ = pts_.map(p => ({ ...p, ...Stats.funnelFlag(p, target, mode, phi) }));
      const fl = (p) => p.n < QI.MIN_N ? 'мало случаев для сравнения' : p.flag === 'alarm' ? (p.side === 'hi' ? 'тревога: выше 99,8%' : 'ниже 99,8% (лучше ожидаемого)') : p.flag === 'alert' ? (p.side === 'hi' ? 'предупреждение: выше 95%' : 'ниже 95% (лучше ожидаемого)') : 'в пределах';
      h = chartBox('funnel', Chart.funnel(mode === 'r' ? 'Funnel plot: O/E с поправкой на риск' : 'Funnel plot: доля без поправки на риск', pts_, target, { mode, phi }),
          pts_.map(p => ({ g: p.label, n: p.n, y: p.y, e: Math.round(p.e * 10) / 10, r: mode === 'r' ? Math.round(p.y / p.e * 100) / 100 : Math.round(p.y / p.n * 1000) / 10, f: fl(p) })),
          [{ key: 'g', label: 'Группа' }, { key: 'n', label: 'n' }, { key: 'y', label: 'Наблюдаемые (O)' }].concat(mode === 'r' ? [{ key: 'e', label: 'Ожидаемые (E)' }, { key: 'r', label: 'O/E' }] : [{ key: 'r', label: '%' }]).concat([{ key: 'f', label: 'Вывод' }])) +
        `<div class="card"><table class="tbl"><thead><tr><th>Группа</th><th>n</th><th>O</th>${mode === 'r' ? '<th>E</th><th>O/E</th>' : '<th>%</th>'}<th>Вывод</th></tr></thead><tbody>${pts_.map(p => `<tr><td><b>${esc(p.label)}</b></td><td>${p.n}</td><td>${p.y}</td>${mode === 'r' ? `<td>${QI.n1(p.e)}</td><td>${(p.y / p.e).toLocaleString('ru-RU', { maximumFractionDigits: 2 })}${p.ci ? '<div class="muted small">95% ДИ ' + p.ci.map(value => value.toLocaleString('ru-RU', { maximumFractionDigits: 2 })).join('–') + '</div>' : ''}</td>` : `<td>${QI.n1(p.y / p.n * 100)}</td>`}<td class="${p.flag && p.side === 'hi' ? 'bad' : p.flag ? 'good' : ''}">${fl(p)}</td></tr>`).join('')}</tbody></table>
        <p class="muted">${mode === 'r' ? `С поправкой на риск: для каждой группы O/E, где E это сумма ожидаемых рисков из поля. Границы по распределению Пуассона. Оценка Брайера на этой выборке: ${N ? (brier / N).toFixed(3) : 'нет данных'}.${noRisk ? ` Исключено случаев без значения риска: ${noRisk}.` : ''}` : 'Без поправки на риск: доли групп против общей доли регистра. Границы по биномиальному распределению.'} ${noOutcome ? 'Неизвестный исход у ' + noOutcome + ' записей, они не учтены. ' : ''}Точные границы с интерполяцией по Spiegelhalter (2005). За 95% (2 SD) предупреждение, за 99,8% (3 SD) тревога, как в руководстве HQIP по выбросам.
        ${od.test ? (od.inflate ? ` Обнаружена избыточная дисперсия (φ = ${QI.n1(od.phi)}, p = ${Stats.pFmt(od.p)}): границы расширены в √φ раз по мультипликативной модели Spiegelhalter.` : ` Избыточной дисперсии нет (φ = ${QI.n1(od.phi)}, p = ${Stats.pFmt(od.p)}).`) : ' Групп меньше 10: избыточная дисперсия не оценивается.'}${anon ? ' Хирурги показаны под кодами, себя вы видите как «Я».' : ''}</p></div>`;
    }
    if (st.type === 'compare') {
      const fN = fld(c.et, c.num); if (!fN) throw new Error('Выберите числовой показатель');
      const gOf = (r) => c.grp === '_sex' ? r.p.sex : c.grp === '_center' ? r.p.center : valStr(fld(c.et, c.grp), r.v[c.grp], users);
      const G = {}; rows(c.et).forEach(r => { const x = Number(r.v[c.num]), g = gOf(r); if (r.v[c.num] === '' || r.v[c.num] == null || isNaN(x) || isEmpty(g)) return; (G[g] = G[g] || []).push(x); });
      const names = Object.keys(G).sort(); if (names.length < 2) throw new Error('Нужно минимум 2 группы с данными');
      const test = names.length === 2 ? Stats.mannWhitney(G[names[0]], G[names[1]]) : Stats.kruskal(names.map(n => G[n]));
      let post = '';
      if (names.length > 2) { const pairs = []; for (let i = 0; i < names.length; i++) for (let k = i + 1; k < names.length; k++) pairs.push([names[i], names[k], Stats.mannWhitney(G[names[i]], G[names[k]])]); const adj = Stats.holm(pairs.map(p => p[2].p)); post = `<h4>Попарно (Манн-Уитни, поправка Холма)</h4><table class="tbl small"><tbody>${pairs.map((p, i) => `<tr><td>${esc(p[0])} vs ${esc(p[1])}</td><td>p = ${Stats.pFmt(p[2].p)}</td><td>p (Холм) = <b>${Stats.pFmt(adj[i])}</b></td></tr>`).join('')}</tbody></table>`; }
      const series = names.map((n, i) => { const s = Stats.summary(G[n]); return { n, s }; });
      h = `<div class="card"><h3>${esc(fN.label)} по группам</h3><table class="tbl"><thead><tr><th>Группа</th><th>n</th><th>Медиана [IQR]</th><th>Среднее ± SD</th><th>Мин–макс</th></tr></thead><tbody>${series.map(x => `<tr><td><b>${esc(x.n)}</b></td><td>${x.s.n}</td><td><b>${x.s.median}</b> [${x.s.q1}; ${x.s.q3}]</td><td>${x.s.mean} ± ${x.s.sd}</td><td>${x.s.min}–${x.s.max}</td></tr>`).join('')}</tbody></table>
        <p>${names.length === 2 ? `Критерий Манна-Уитни: U = <b>${test.U}</b>, z = ${test.z}, p = <b>${Stats.pFmt(test.p)}</b>` : `Критерий Краскела-Уоллиса: H = <b>${test.H}</b>, df = ${test.df}, p = <b>${Stats.pFmt(test.p)}</b>`}</p>${post}</div>` +
        chartBox('compare', Chart.bar(fN.label + ': медиана по группам', names, series.map(x => Number(x.s.median) || 0), { yl: fN.unit || '' }), names.flatMap(n => G[n].map(v => ({ g: n, v }))), [{ key: 'g', label: 'Группа' }, { key: 'v', label: fN.label }]);
    }
    if (st.type === 'ind') {
      const startEt = reg.keyDates?.start || reg.eventTypes[0].id;
      const years = [...new Set(ds.events.filter(e => e.type === startEt && e.date).map(e => e.date.slice(0, 4)))].sort();
      h = `<div class="card"><table class="tbl"><thead><tr><th>Показатель</th>${years.map(y => `<th>${y}</th>`).join('')}<th>Всего</th></tr></thead><tbody>${(reg.indicators || []).map(i => {
        const cells = years.map(y => { const ev = ds.events.filter(e => pts.has(e.patientId) && (e.date || '').startsWith(y)); const x = evalIndicator(i, ev, ds.patients, reg); return QI.cell(reg, i, x, ev, ds.patients); });
        const allEv = ds.events.filter(e => pts.has(e.patientId)); const x = evalIndicator(i, allEv, ds.patients, reg);
        return `<tr><td><b>${esc(i.name)}</b><div class="muted small">${esc(QI.tgtTxt(i))}</div></td>${cells.join('')}${QI.cell(reg, i, x, allEv, ds.patients)}</tr>`;
      }).join('') || '<tr><td class="muted">Показатели не настроены</td></tr>'}</tbody></table><p class="muted">Год считается по дате самого события. ДИ: 95% интервал Уилсона. Нажмите на процент, чтобы увидеть пациентов.</p></div>`;
    }
  } catch (e) { h = `<div class="card err">${esc(e.message)}</div>`; }
  out.innerHTML = cohTxt + h;
}

/* ---------- МДК ---------- */
const DECISIONS = ['Хирургическое лечение', 'Неоадъювантная терапия', 'Адъювантная терапия', 'Watch and wait', 'Дообследование', 'Системная терапия', 'Паллиативная помощь', 'Динамическое наблюдение', 'Другое'];
Routes.mdt = async (main, id) => {
  if (id) return mdtMeeting(main, id);
  const [list, patients] = await Promise.all([DB.all('mdt'), Data.patients()]);
  list.sort((a, b) => b.date.localeCompare(a.date));
  main.innerHTML = `<div class="head"><h1>МДК</h1><button class="btn primary" id="mNew">+ Заседание</button></div>
    ${list.length ? `<table class="tbl hover"><thead><tr><th>Дата</th><th>Название</th><th>Пациентов</th><th>С решением</th><th>Статус</th></tr></thead><tbody>${list.map(m => `<tr data-id="${m.id}"><td><b>${fmtDate(m.date)}</b></td><td>${esc(m.title || '')}</td><td>${(m.cases || []).length}</td><td>${(m.cases || []).filter(c => c.decisionType).length}</td><td>${m.date >= today() && m.status !== 'проведено' ? '<span class="tag">запланировано</span>' : `<span class="tag ${m.status === 'проведено' ? 'okt' : 'warnt'}">${esc(m.status || 'не закрыто')}</span>`}</td></tr>`).join('')}</tbody></table>` : emptyState('Заседаний пока нет.')}`;
  $$('tr[data-id]', main).forEach(tr => tr.onclick = () => go('mdt/' + tr.dataset.id));
  $('#mNew').onclick = async () => { const m = await DB.put('mdt', { date: today(), title: 'Онкологический консилиум', attendees: [Auth.user.id], cases: [], status: 'запланировано' }); go('mdt/' + m.id); };
};
async function mdtMeeting(main, id) {
  const m = await DB.get('mdt', id); if (!m) return go('mdt');
  const [patients, users, regs, events] = await Promise.all([Data.patients(), Data.users(), Data.registries(), Data.events()]);
  const summary = (p) => {
    const reg = regs.find(r => r.id === p.registryId); if (!reg) return '';
    return events.filter(e => e.patientId === p.id).sort((a, b) => (a.date || '').localeCompare(b.date || '')).map(e => { const et = etById(reg, e.type); if (!et) return ''; const v = computeValues(reg, p, et, e.data, e.date); return `${et.name} (${fmtDate(e.date)}): ` + formFields(et).filter(f => (f.required || f.key_) && !isEmpty(v[f.key]) && f.type !== 'complist').slice(0, 8).map(f => `${f.label}: ${valStr(f, v[f.key], users)}`).join('; '); }).filter(Boolean).join('\n');
  };
  main.innerHTML = `<div class="head"><div><a href="#mdt" class="muted">← Все заседания</a><h1>МДК ${fmtDate(m.date)}</h1></div><div class="row"><button class="btn" id="mAgenda">Повестка</button><button class="btn" id="mProto">Протокол</button><button class="btn primary" id="mSave">Сохранить</button>${can('delete') ? '<button class="btn danger" id="mDel">Удалить</button>' : ''}</div></div>
    <div class="card"><div class="grid"><div class="fld"><label class="flab">Дата</label><input class="inp" type="date" id="m_d" value="${esc(m.date)}"></div><div class="fld"><label class="flab">Название</label><input class="inp" id="m_t" value="${esc(m.title || '')}"></div>
      <div class="fld"><label class="flab">Статус</label><select class="inp" id="m_s">${['запланировано', 'проведено', 'отменено'].map(s => `<option ${m.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      <div class="fld wide"><label class="flab">Участники</label><div class="chips">${users.filter(u => u.active !== false).map(u => `<label class="chip"><input type="checkbox" value="${u.id}" data-att ${(m.attendees || []).includes(u.id) ? 'checked' : ''}>${esc(u.name)}</label>`).join('')}</div><input class="inp" id="m_ext" placeholder="Приглашённые извне (через запятую)" value="${esc(m.external || '')}"></div></div></div>
    <div class="card"><div class="row"><input class="inp" id="m_q" placeholder="Добавить пациента: ФИО или № ИБ" list="m_pl"><datalist id="m_pl">${patients.map(p => `<option value="${esc(p.localId)} · ${esc(pname(p))}">`).join('')}</datalist><button class="btn" id="m_add">+ В повестку</button></div></div>
    <div id="m_cases">${(m.cases || []).map((c, i) => { const p = patients.find(x => x.id === c.patientId); return `<div class="card mcase" data-i="${i}"><div class="row between"><h3>${i + 1}. <a href="#patient/${c.patientId}">${esc(p ? pname(p) : '?')}</a> <small class="muted">№ ИБ ${esc(p?.localId || '')}, ${FX.age(p?.birthDate) ?? '?'} лет</small></h3><button class="btn xs danger" data-crm="${i}">Убрать</button></div>
      <div class="grid"><div class="fld wide"><label class="flab">Клинические данные</label><textarea class="inp" rows="4" data-f="summary">${esc(c.summary || '')}</textarea></div>
      <div class="fld wide"><label class="flab">Вопрос к МДК</label><input class="inp" data-f="question" value="${esc(c.question || '')}"></div>
      <div class="fld"><label class="flab">Решение (тип)</label><select class="inp" data-f="decisionType"><option></option>${DECISIONS.map(d => `<option ${c.decisionType === d ? 'selected' : ''}>${d}</option>`).join('')}</select></div>
      <div class="fld"><label class="flab">Ответственный</label><select class="inp" data-f="resp"><option></option>${users.map(u => `<option value="${u.id}" ${c.resp === u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></div>
      <div class="fld wide"><label class="flab">Решение (текст)</label><textarea class="inp" rows="3" data-f="decision">${esc(c.decision || '')}</textarea></div></div></div>`; }).join('') || emptyState('В повестке пока нет пациентов.')}</div>`;
  const collect = () => {
    m.date = $('#m_d').value; m.title = $('#m_t').value; m.status = $('#m_s').value; m.external = $('#m_ext').value;
    m.attendees = $$('[data-att]:checked').map(x => x.value);
    $$('.mcase').forEach(el => { const c = m.cases[el.dataset.i]; $$('[data-f]', el).forEach(i => c[i.dataset.f] = i.value); });
  };
  $('#m_add').onclick = () => {
    const q = $('#m_q').value.trim(); const id_ = q.split(' · ')[0];
    const p = patients.find(x => x.localId === id_) || patients.find(x => pname(x).toLowerCase().includes(q.toLowerCase()));
    if (!p) return toast('Пациент не найден', 'err'); if ((m.cases || []).some(c => c.patientId === p.id)) return toast('Уже в повестке', 'err');
    collect(); m.cases.push({ patientId: p.id, summary: summary(p), question: '', decisionType: '', decision: '' }); DB.put('mdt', m).then(() => App.route());
  };
  $('#m_cases').onclick = async e => { if (e.target.dataset.crm) { collect(); m.cases.splice(e.target.dataset.crm, 1); await DB.put('mdt', m); App.route(); } };
  $('#mSave').onclick = async () => { collect(); await DB.put('mdt', m); toast('Сохранено'); };
  if ($('#mDel')) $('#mDel').onclick = async () => { if (await confirmBox('Удалить заседание?')) { await DB.del('mdt', m.id); go('mdt'); } };
  const printDoc = (title, body) => { const w = window.open('', '_blank'); w.document.write(`<html><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font-family:Times New Roman,serif;font-size:13pt;margin:2cm;line-height:1.4}h1{font-size:16pt;text-align:center}h2{font-size:13pt;margin-top:18px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #000;padding:4px 6px;vertical-align:top;text-align:left}.sig{margin-top:40px}pre{white-space:pre-wrap;font-family:inherit;margin:0}</style></head><body>${body}<script>setTimeout(()=>print(),300)<\/script></body></html>`); w.document.close(); };
  const header = () => `<div style="text-align:center">${esc(Settings.data.center || '')}<br>${esc(Settings.data.department || '')}</div>`;
  $('#mAgenda').onclick = () => { collect(); printDoc('Повестка МДК', `${header()}<h1>Повестка заседания МДК<br>${fmtDate(m.date)}</h1><table><tr><th>№</th><th>Пациент</th><th>№ ИБ</th><th>Вопрос</th></tr>${m.cases.map((c, i) => { const p = patients.find(x => x.id === c.patientId); return `<tr><td>${i + 1}</td><td>${esc(p ? pname(p) : '')}</td><td>${esc(p?.localId || '')}</td><td>${esc(c.question || '')}</td></tr>`; }).join('')}</table>`); };
  const protoHTML = () => { const att = users.filter(u => m.attendees.includes(u.id)); return `${header()}<h1>Протокол заседания мультидисциплинарной группы<br>от ${fmtDate(m.date)}</h1><p><b>Присутствовали:</b> ${att.map(u => esc(u.name) + (u.position ? ', ' + esc(u.position) : '')).join('; ')}${m.external ? '; ' + esc(m.external) : ''}</p>${m.cases.map((c, i) => { const p = patients.find(x => x.id === c.patientId); return `<h2>${i + 1}. ${esc(p ? pname(p) : '')}, ${FX.age(p?.birthDate) ?? ''} лет, № ИБ ${esc(p?.localId || '')}</h2><p><b>Клинические данные:</b></p><pre>${esc(c.summary || '')}</pre><p><b>Вопрос:</b> ${esc(c.question || '')}</p><p><b>Решение:</b> ${esc(c.decisionType || '')}. ${esc(c.decision || '')}</p><p><b>Ответственный:</b> ${esc(users.find(u => u.id === c.resp)?.name || '')}</p>`; }).join('')}<div class="sig">${att.map(u => `<p>${esc(u.name)} ____________________</p>`).join('')}</div>`; };
  $('#mProto').onclick = () => { collect(); printDoc('Протокол МДК', protoHTML()); };
  $('#mProto').insertAdjacentHTML('afterend', '<button class="btn" id="mWord">Word (.docx)</button>');
  $('#mWord').onclick = () => { collect(); Office.docx('protokol_mdk_' + m.date + '.docx', protoHTML().replace(/<pre>([\s\S]*?)<\/pre>/g, (x, t) => '<p>' + t.replace(/\n/g, '<br>') + '</p>')); Audit.log('протокол МДК в Word', 'mdt', m.id, null, null); };
}

/* ---------- ОПРОСНИКИ ---------- */
function PromsAdmin(reg, body, ro, mark) {
  reg.instruments = reg.instruments || []; reg.schedules = reg.schedules || [];
  const draw = () => {
    body.innerHTML = `<div class="card"><h3>Опросники регистра</h3><table class="tbl"><tbody>${reg.instruments.map((ins, i) => `<tr><td><b>${esc(ins.name)}</b><div class="muted">${esc(ins.note || '')}</div></td><td>${ins.items.length} вопросов</td>${ro ? '' : `<td class="nowrap"><button class="btn xs" data-ie="${i}">✎</button><button class="btn xs danger" data-ix="${i}">×</button></td>`}</tr>`).join('') || '<tr><td class="muted">Нет опросников</td></tr>'}</tbody></table>
      ${ro ? '' : `<div class="row"><button class="btn sm" id="insNew">+ Свой опросник</button><button class="btn sm" id="insLars">+ LARS</button><button class="btn sm" id="insWex">+ Wexner</button></div><p class="muted">Лицензируемые опросники (EORTC QLQ-C30, CR29 и др.) добавляйте сами после получения разрешения правообладателя.</p>`}</div>
      <div class="card"><h3>Расписание (автоматическое назначение)</h3><table class="tbl"><thead><tr><th>Опросник</th><th>От события</th><th>Через (дней)</th><th>Условие</th><th></th></tr></thead><tbody>${reg.schedules.map((s, i) => `<tr><td><b>${esc(reg.instruments.find(x => x.id === s.instrument)?.name || '?')}</b></td><td>${esc(etById(reg, s.anchorEt)?.name || '?')}</td><td>${s.offsets.join(', ')}</td><td class="muted">${s.condition?.key ? `${esc(s.condition.key)} ${OPS[s.condition.op]} ${esc(s.condition.value || '')}` : 'всем'}</td>${ro ? '<td></td>' : `<td><button class="btn xs" data-se="${i}">✎</button><button class="btn xs danger" data-sx="${i}">×</button></td>`}</tr>`).join('') || '<tr><td colspan="5" class="muted">Расписаний нет</td></tr>'}</tbody></table>${ro ? '' : '<button class="btn sm" id="schNew">+ Расписание</button>'}</div>`;
    if (ro) return;
    $('#insNew').onclick = () => instrumentDialog(null, ins => { reg.instruments.push(ins); mark(); draw(); });
    $('#insLars').onclick = () => { reg.instruments.push(INSTRUMENTS.lars()); mark(); draw(); };
    $('#insWex').onclick = () => { reg.instruments.push(INSTRUMENTS.wexner()); mark(); draw(); };
    $('#schNew').onclick = () => scheduleDialog(reg, null, s => { reg.schedules.push(s); mark(); draw(); });
    body.onclick = async e => { const d = e.target.dataset;
      if (d.ie) instrumentDialog(reg.instruments[d.ie], ins => { reg.instruments[d.ie] = ins; mark(); draw(); });
      if (d.ix && await confirmBox('Удалить опросник?')) { const id = reg.instruments[d.ix].id; reg.instruments.splice(d.ix, 1); reg.schedules = reg.schedules.filter(s => s.instrument !== id); mark(); draw(); }
      if (d.se) scheduleDialog(reg, reg.schedules[d.se], s => { reg.schedules[d.se] = s; mark(); draw(); });
      if (d.sx && await confirmBox('Удалить расписание?')) { reg.schedules.splice(d.sx, 1); mark(); draw(); } };
  };
  draw();
}
function instrumentDialog(ins, done) {
  const i = ins ? clone(ins) : { id: uid('in'), name: '', note: '', items: [], bands: [] };
  const text = i.items.map(it => `${it.label}\n${it.options.map(o => `- ${o.l} = ${o.s}`).join('\n')}`).join('\n\n');
  const m = modal(`<h3>Опросник</h3><div class="grid"><div class="fld"><label class="flab">Название</label><input class="inp" id="in_n" value="${esc(i.name)}"></div><div class="fld"><label class="flab">Описание / интерпретация</label><input class="inp" id="in_d" value="${esc(i.note || '')}"></div>
    <div class="fld wide"><label class="flab">Вопросы</label><textarea class="inp mono" id="in_t" rows="14" placeholder="Текст вопроса&#10;- вариант ответа = баллы&#10;- вариант ответа = баллы&#10;&#10;Следующий вопрос&#10;- ...">${esc(text)}</textarea><div class="help">Вопрос с новой строки, варианты ниже через «- текст = баллы», вопросы разделяются пустой строкой. Итог считается суммой баллов.</div></div>
    <div class="fld wide"><label class="flab">Интерпретация суммы (по строке: от-до = текст)</label><textarea class="inp mono" id="in_b" rows="3" placeholder="0-20 = нет&#10;21-29 = минорный">${esc((i.bands || []).map(b => `${b.min}-${b.max} = ${b.l}`).join('\n'))}</textarea></div></div>
    <div class="row end"><button class="btn primary" id="in_ok">Готово</button></div>`, { wide: true });
  $('#in_ok', m).onclick = () => {
    const blocks = $('#in_t', m).value.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
    const items = blocks.map((b, k) => { const lines = b.split('\n'); const label = lines[0].trim(); const options = lines.slice(1).filter(l => l.trim().startsWith('-')).map(l => { const [a, s] = l.replace(/^\s*-\s*/, '').split(/=(?=[^=]*$)/); return { l: a.trim(), s: Number(s) || 0 }; }); return { key: i.items[k]?.key || 'q' + (k + 1), label, options }; }).filter(x => x.options.length);
    if (!$('#in_n', m).value.trim() || !items.length) return toast('Нужно название и хотя бы один вопрос с вариантами', 'err');
    const bands = $('#in_b', m).value.split('\n').map(l => { const mm = l.match(/^\s*(-?\d+)\s*-\s*(-?\d+)\s*=\s*(.+)$/); return mm ? { min: Number(mm[1]), max: Number(mm[2]), l: mm[3].trim() } : null; }).filter(Boolean);
    m.close(); done({ ...i, name: $('#in_n', m).value.trim(), note: $('#in_d', m).value.trim(), items, bands });
  };
}
function scheduleDialog(reg, s, done) {
  const x = s ? clone(s) : { id: uid('sc'), instrument: reg.instruments[0]?.id, anchorEt: reg.eventTypes[0]?.id, offsets: [30, 90, 180, 365], condition: null };
  if (!reg.instruments.length) return toast('Сначала добавьте опросник', 'err');
  const m = modal(`<h3>Расписание</h3><div class="grid"><div class="fld"><label class="flab">Опросник</label><select class="inp" id="sc_i">${reg.instruments.map(i => `<option value="${i.id}" ${x.instrument === i.id ? 'selected' : ''}>${esc(i.name)}</option>`).join('')}</select></div>
    <div class="fld"><label class="flab">Отсчёт от события</label><select class="inp" id="sc_e">${reg.eventTypes.map(e => `<option value="${e.id}" ${x.anchorEt === e.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select></div>
    <div class="fld"><label class="flab">Через сколько дней (через запятую, 0 = исходно)</label><input class="inp" id="sc_o" value="${esc(x.offsets.join(', '))}"></div>
    <div class="fld wide"><label class="flab">Только если в этом событии</label><div class="row" id="sc_c"></div></div></div><div class="row end"><button class="btn primary" id="sc_ok">Готово</button></div>`, { wide: true });
  const dc = () => { const et = etById(reg, $('#sc_e', m).value); $('#sc_c', m).innerHTML = `<select class="inp" data-c="k"><option value="">всем пациентам</option>${formFields(et).map(f => `<option value="${f.key}" ${x.condition?.key === f.key ? 'selected' : ''}>${esc(f.label)}</option>`).join('')}</select><select class="inp" data-c="o">${Object.entries(OPS).map(([k, v]) => `<option value="${k}" ${x.condition?.op === k ? 'selected' : ''}>${v}</option>`).join('')}</select><input class="inp" data-c="v" value="${esc(x.condition?.value || '')}">`; };
  dc(); $('#sc_e', m).onchange = () => { x.condition = null; dc(); };
  $('#sc_ok', m).onclick = () => { const k = $('[data-c=k]', m).value; m.close(); done({ ...x, instrument: $('#sc_i', m).value, anchorEt: $('#sc_e', m).value, offsets: $('#sc_o', m).value.split(/[,; ]+/).map(Number).filter(n => !isNaN(n)), condition: k ? { key: k, op: $('[data-c=o]', m).value, value: $('[data-c=v]', m).value } : null }); };
}

const Proms = {
  async autoSchedule(p, reg) {
    if (!reg?.schedules?.length) return;
    if (p.promsConsent === 'нет' || p.vital === 'умер') return;
    const [events, proms] = await Promise.all([Data.events(reg.id), DB.all('proms')]);
    for (const s of reg.schedules) {
      const ins = reg.instruments.find(i => i.id === s.instrument); if (!ins) continue;
      const et = etById(reg, s.anchorEt);
      const anchor = events.filter(e => e.patientId === p.id && e.type === s.anchorEt && e.date).sort((a, b) => a.date.localeCompare(b.date))[0];
      if (!anchor) continue;
      if (s.condition?.key && !condOK(s.condition, computeValues(reg, p, et, anchor.data, anchor.date))) continue;
      /* ретроспективный ввод (как в UKNFR): из прошедших точек отправляется только самая поздняя и сразу, будущие по графику */
      const past = s.offsets.filter(o => addDays(anchor.date, o) < today()); const lastPast = past.length ? Math.max(...past.map(Number)) : null;
      for (const off of s.offsets) {
        const key = s.id + ':' + off; let due = addDays(anchor.date, off);
        const ex = proms.find(x => x.patientId === p.id && x.scheduleKey === key);
        if (!ex && due < today() && Number(off) !== lastPast) continue;
        if (!ex && due < today()) due = today();
        if (!ex) await DB.put('proms', { patientId: p.id, registryId: reg.id, instrumentId: ins.id, instrumentName: ins.name, scheduleKey: key, offset: off, due, retro: due === today() && addDays(anchor.date, off) < today() }, 'назначение опросника');
        else if (!ex.doneAt && !ex.retro && ex.due !== due) { ex.due = due; await DB.put('proms', ex); }
      }
    }
  },
  async assignManual(p, reg) {
    const m = modal(`<h3>Назначить опросник</h3><div class="fld"><label class="flab">Опросник</label><select class="inp" id="am_i">${reg.instruments.map(i => `<option value="${i.id}">${esc(i.name)}</option>`).join('')}</select></div><div class="fld"><label class="flab">Срок</label><input class="inp" type="date" id="am_d" value="${today()}"></div><div class="row end"><button class="btn primary" id="am_ok">Назначить</button></div>`);
    $('#am_ok', m).onclick = async () => { const ins = reg.instruments.find(i => i.id === $('#am_i', m).value); await DB.put('proms', { patientId: p.id, registryId: reg.id, instrumentId: ins.id, instrumentName: ins.name, scheduleKey: 'manual:' + uid(), due: $('#am_d', m).value }, 'назначение опросника'); m.close(); App.route(); };
  },
  fill(pr, reg) {
    const ins = reg.instruments.find(i => i.id === pr.instrumentId); if (!ins) return toast('Опросник удалён из регистра', 'err');
    const m = modal(`<div class="patient-mode"><h2>${esc(ins.name)}</h2><p class="muted">${esc(ins.note || '')}</p>
      ${ins.items.map((it, k) => `<div class="pq"><div class="pq-t">${k + 1}. ${esc(it.label)}</div>${it.options.map(o => `<label class="pq-o"><input type="radio" name="${it.key}" value="${o.s}" ${pr.answers?.[it.key] != null && String(pr.answers[it.key]) === String(o.s) && pr.answersText?.[it.key] === o.l ? 'checked' : ''} data-l="${esc(o.l)}"><span>${esc(o.l)}</span></label>`).join('')}</div>`).join('')}
      <div class="row between"><div class="fld"><label class="flab">Как заполнен</label><select class="inp" id="pf_m"><option>пациентом в клинике</option><option>по телефону</option><option>через WhatsApp (ответы перенесены)</option><option>на бумаге (перенесено)</option></select></div><div class="row"><b id="pf_s"></b><button class="btn primary" id="pf_ok">Сохранить</button></div></div></div>`, { full: true });
    const calc = () => { const a = {}; ins.items.forEach(it => { const c = $(`input[name="${it.key}"]:checked`, m); if (c) a[it.key] = Number(c.value); }); const r = scoreInstrument(ins, a); $('#pf_s', m).textContent = r.score == null ? '' : `Сумма: ${r.score} ${r.band ? '· ' + r.band : ''}${r.complete ? '' : ' (не все ответы)'}`; return { a, r }; };
    m.onchange = calc; calc();
    $('#pf_ok', m).onclick = async () => {
      const { a, r } = calc(); if (!r.complete && !(await confirmBox('Отвечены не все вопросы. Сохранить как есть?'))) return;
      const at = {}; ins.items.forEach(it => { const c = $(`input[name="${it.key}"]:checked`, m); if (c) at[it.key] = c.dataset.l; });
      Object.assign(pr, { answers: a, answersText: at, score: r.score, band: r.band, doneAt: nowISO(), mode: $('#pf_m', m).value });
      await DB.put('proms', pr, 'заполнение опросника'); m.close(); toast('Сохранено'); App.route();
    };
  },
  mailLink(p, ins) {
    const txt = `Здравствуйте!\n\n${Settings.data.center || 'Ваша клиника'} просит ответить на опросник «${ins.name}». Укажите номер варианта для каждого вопроса в ответном письме.\n\n` + ins.items.map((it, k) => `${k + 1}. ${it.label}\n` + it.options.map((o, j) => `   ${j + 1}) ${o.l}`).join('\n')).join('\n\n');
    return `mailto:${encodeURIComponent(p.email)}?subject=${encodeURIComponent('Опросник: ' + ins.name)}&body=${encodeURIComponent(txt)}`;
  },
  waLink(p, ins) {
    const digits = String(p.phone || '').replace(/\D/g, '').replace(/^8(?=7\d{9}$)/, '7');
    const txt = `Здравствуйте! ${Settings.data.center || 'Ваша клиника'} просит ответить на короткий опросник «${ins.name}». Ответьте номером варианта на каждый вопрос.\n\n` + ins.items.map((it, k) => `${k + 1}. ${it.label}\n` + it.options.map((o, j) => `   ${j + 1}) ${o.l}`).join('\n')).join('\n\n');
    return `https://wa.me/${digits}?text=${encodeURIComponent(txt)}`;
  }
};

Routes.proms = async (main, tab = 'due') => {
  const [proms, patients, regs] = await Promise.all([DB.all('proms'), Data.patients(), Data.registries()]);
  const list = proms.filter(x => tab === 'done' ? x.doneAt : tab === 'all' ? true : !x.doneAt && x.due <= addDays(today(), 14)).sort((a, b) => tab === 'done' ? (b.doneAt || '').localeCompare(a.doneAt || '') : a.due.localeCompare(b.due));
  const insOf = (x) => regs.find(r => r.id === x.registryId)?.instruments?.find(i => i.id === x.instrumentId);
  /* сводка по точкам */
  const sum = {}; proms.filter(x => x.doneAt && x.score != null).forEach(x => { const k = x.instrumentName + '|' + (x.offset ?? 'вручную'); (sum[k] = sum[k] || []).push(x.score); });
  main.innerHTML = `<div class="head"><h1>Опросники (PROMs)</h1></div>
    <div class="tabs"><a href="#proms/due" class="${tab === 'due' ? 'on' : ''}">К заполнению (14 дней)</a><a href="#proms/done" class="${tab === 'done' ? 'on' : ''}">Заполненные</a><a href="#proms/all" class="${tab === 'all' ? 'on' : ''}">Все</a><a href="#proms/summary" class="${tab === 'summary' ? 'on' : ''}">Сводка</a></div>
    ${tab === 'summary' ? `<div class="card"><table class="tbl"><thead><tr><th>Опросник</th><th>Точка (дней)</th><th>n</th><th>Медиана [IQR]</th><th>Среднее ± SD</th><th>vs первая точка (Уилкоксон, парные)</th></tr></thead><tbody>${Object.entries(sum).sort((a, b) => a[0].split('|')[0].localeCompare(b[0].split('|')[0]) || Number(a[0].split('|')[1]) - Number(b[0].split('|')[1])).map(([k, v]) => { const [n, o] = k.split('|'); const s = Stats.summary(v);
      const offs = [...new Set(proms.filter(x => x.instrumentName === n && x.doneAt && x.offset != null).map(x => x.offset))].sort((a, b) => a - b); let w = '';
      if (offs.length > 1 && String(offs[0]) !== o && o !== 'вручную') { const pairs = []; const by = {}; proms.filter(x => x.instrumentName === n && x.doneAt && x.score != null).forEach(x => { (by[x.patientId] = by[x.patientId] || {})[x.offset] = x.score; }); Object.values(by).forEach(b => { if (b[offs[0]] != null && b[o] != null) pairs.push([b[offs[0]], b[o]]); }); const t = pairs.length > 1 ? Stats.wilcoxon(pairs) : null; w = t ? `n пар = ${pairs.length}, z = ${t.z}, p = <b>${Stats.pFmt(t.p)}</b>` : `пар: ${pairs.length}`; }
      return `<tr><td><b>${esc(n)}</b></td><td>${esc(o)}</td><td>${s.n}</td><td>${s.median} [${s.q1}; ${s.q3}]</td><td>${s.mean} ± ${s.sd}</td><td class="small">${w}</td></tr>`; }).join('') || '<tr><td class="muted">Нет заполненных опросников</td></tr>'}</tbody></table></div>` :
    list.length ? `<table class="tbl"><thead><tr><th>Пациент</th><th>Опросник</th><th>Срок</th><th>Результат</th><th></th></tr></thead><tbody>${list.map(x => { const p = patients.find(y => y.id === x.patientId); const ins = insOf(x); return `<tr><td><a href="#patient/${x.patientId}"><b>${esc(p ? pname(p) : '?')}</b></a><div class="muted">${esc(p?.phone || 'нет телефона')}</div></td><td>${esc(x.instrumentName)}${x.offset != null ? ` <span class="muted">· ${x.offset} дн</span>` : ''}</td><td class="${!x.doneAt && x.due < today() ? 'bad' : ''}">${fmtDate(x.due)}</td><td>${x.doneAt ? `<b>${x.score ?? ''}</b> ${esc(x.band || '')}<div class="muted">${fmtDate(x.doneAt)} · ${esc(x.mode || '')}</div>` : ''}</td>
      <td class="nowrap">${!x.doneAt && ins ? `${p?.phone ? `<a class="btn xs" target="_blank" href="${Proms.waLink(p, ins)}">WhatsApp</a>` : ''}${p?.email ? `<a class="btn xs" href="${Proms.mailLink(p, ins)}">Email</a>` : ''}<button class="btn xs" data-pf="${x.id}">Заполнить</button>${typeof NET !== 'undefined' && NET.on && can('enter') && p?.promsConsent === 'да'
        ? `<button class="btn xs" data-survey-link="${esc(x.id)}">Одноразовая ссылка</button>` : ''}` : ''}</td></tr>`; }).join('')}</tbody></table>` : emptyState('Список пуст.')}`;
  main.onclick = async event => {
    const id = event.target.dataset.pf;
    if (id) {
      const entry = proms.find(item => item.id === id);
      Proms.fill(entry, regs.find(reg => reg.id === entry.registryId));
    }
    const surveyId = event.target.dataset.surveyLink;
    if (!surveyId) return;
    event.target.disabled = true;
    try {
      const { token, expiresAt } = await NET.call('POST', 'survey/issue/' + encodeURIComponent(surveyId), {});
      const url = new URL('answer.html', location.href);
      url.hash = token;
      const m = modal(`<h3>Ссылка на опросник</h3><p>Действительна до ${fmtDate(expiresAt)} или до первого заполнения. Предыдущая ссылка отключена.</p>
        <input class="inp" id="surveyLink" aria-label="Ссылка на опросник" readonly value="${esc(url.href)}"><div class="row"><button class="btn" id="copySurvey">Скопировать</button></div>`);
      $('#copySurvey', m).onclick = async () => {
        const field = $('#surveyLink', m);
        field.select();
        try { await navigator.clipboard.writeText(field.value); toast('Ссылка скопирована'); }
        catch (error) { toast('Скопируйте выделенную ссылку', 'err'); }
      };
    } catch (error) { toast(error.message, 'err'); }
    finally { event.target.disabled = false; }
  };
};

/* ---------- ГОДОВОЙ ОТЧЁТ ---------- */
Routes.report = async (main, regId = '') => {
  const regs = await Data.registries(); const reg0 = regs.find(r => r.id === regId) || regs[0];
  if (!reg0) { main.innerHTML = '<div class="head"><h1>Годовой отчёт</h1></div>' + emptyState('Нет регистров.'); return; }
  const ds = await loadReg(reg0.id); const reg = ds.reg;
  const startEt = reg.keyDates?.start || reg.eventTypes[0].id;
  const years = [...new Set(ds.events.map(e => (e.date || '').slice(0, 4)).filter(Boolean))].sort().reverse();
  const st = Routes.report.st || (Routes.report.st = { year: years[0] || String(new Date().getFullYear()), fields: null });
  const cand = reg.eventTypes.flatMap(et => formFields(et).filter(f => ['select', 'yesno', 'user', 'calc', 'multiselect'].includes(f.type) && f.type !== 'complist').map(f => ({ id: et.id + '.' + f.key, et, f })));
  if (!st.fields) st.fields = cand.filter(c => c.et.id === startEt && c.f.type !== 'user').slice(0, 6).map(c => c.id);
  main.innerHTML = `<div class="head noprint"><h1>Годовой отчёт</h1><div class="row">${regSelect(regs, reg.id, 'regSel', false)}<select class="inp" id="rYear">${(years.length ? years : [st.year]).map(y => `<option ${y === st.year ? 'selected' : ''}>${y}</option>`).join('')}<option value="all" ${st.year === 'all' ? 'selected' : ''}>за всё время</option></select><button class="btn" id="rFields">Разделы</button><button class="btn primary" onclick="window.print()">Печать / PDF</button></div></div><div id="rep" class="report"></div>`;
  $('#regSel').onchange = e => { Routes.report.st = null; go('report/' + e.target.value); };
  $('#rYear').onchange = e => { st.year = e.target.value; draw(); };
  $('#rFields').onclick = () => { const m = modal(`<h3>Что включить в отчёт</h3><div class="chips col">${cand.map(c => `<label class="chip"><input type="checkbox" value="${c.id}" ${st.fields.includes(c.id) ? 'checked' : ''}>${esc(c.et.name)} › ${esc(c.f.label)}</label>`).join('')}</div><div class="row end"><button class="btn primary" id="rf_ok">Готово</button></div>`, { wide: true }); $('#rf_ok', m).onclick = () => { st.fields = $$('input:checked', m).map(i => i.value); m.close(); draw(); }; };
  const draw = () => {
    const inY = (d) => st.year === 'all' || (d || '').startsWith(st.year);
    const ev = ds.events.filter(e => inY(e.date));
    const startEv = ev.filter(e => e.type === startEt);
    const pIds = new Set(startEv.map(e => e.patientId)); const pts = ds.patients.filter(p => pIds.has(p.id));
    const ages = startEv.map(e => FX.age(ds.patients.find(p => p.id === e.patientId)?.birthDate, e.date)).filter(x => x != null);
    const sa = Stats.summary(ages); const men = pts.filter(p => p.sex === 'М').length;
    const byMonth = {}; startEv.forEach(e => { const k = e.date.slice(0, 7); byMonth[k] = (byMonth[k] || 0) + 1; }); const mk = Object.keys(byMonth).sort();
    const users = ds.users;
    let html = `<div class="rep-title"><div>${esc(Settings.data.center || '')} ${esc(Settings.data.department ? '· ' + Settings.data.department : '')}</div><h1>${esc(reg.name)}</h1><h2>Отчёт регистра ${st.year === 'all' ? 'за всё время' : 'за ' + st.year + ' год'}</h2><div class="muted">Сформирован ${fmtDate(today())} · версия схемы v${reg.version}</div></div>
      <h2>1. Объём</h2><div class="tiles"><div class="tile"><b>${pts.length}</b><span>пациентов (${esc(etById(reg, startEt)?.name || '')})</span></div><div class="tile"><b>${ev.length}</b><span>событий всех типов</span></div><div class="tile"><b>${ages.length ? sa.median : 'нет данных'}</b><span>${ages.length ? `медиана возраста, лет [Q1 ${sa.q1}; Q3 ${sa.q3}]` : 'медиана возраста'}</span></div><div class="tile"><b>${pts.length ? QI.n1(men / pts.length * 100) + '%' : 'нет данных'}</b><span>${pts.length ? `мужчин (${men} из ${pts.length})` : 'мужчин'}</span></div></div>
      ${mk.length > 1 ? Chart.line('Пациенты по месяцам', [{ pts: mk.map((k, i) => ({ x: i, y: byMonth[k] })) }], { xl: 'Месяц', yl: 'n', fmtX: v => mk[v] || '' }) : ''}
      <table class="tbl"><thead><tr><th>Тип события</th><th>Количество</th></tr></thead><tbody>${reg.eventTypes.map(et => `<tr><td>${esc(et.name)}</td><td><b>${ev.filter(e => e.type === et.id).length}</b></td></tr>`).join('')}</tbody></table>
      <h2>2. Показатели качества</h2><table class="tbl"><thead><tr><th>Показатель</th><th>Результат</th><th>Цель</th><th>Вывод</th></tr></thead><tbody>${(reg.indicators || []).map(i => { const x = evalIndicator(i, ev, ds.patients, reg); return `<tr><td><b>${esc(i.name)}</b></td>${QI.cell(reg, i, x, ev, ds.patients)}<td>${esc(QI.tgtTxt(i).replace('цель ', ''))}</td><td>${esc(QI.verdict(i, x).txt)}</td></tr>`; }).join('') || '<tr><td class="muted">не настроены</td></tr>'}</tbody></table><p class="muted small">Без поправки на риск. 95% интервал Уилсона; при знаменателе меньше ${QI.MIN_N} вывод не делается.</p>
      <h2>3. Характеристики</h2>`;
    st.fields.forEach(fid => {
      const c = cand.find(x => x.id === fid); if (!c) return;
      const vals = ev.filter(e => e.type === c.et.id).map(e => computeValues(reg, ds.patients.find(p => p.id === e.patientId), c.et, e.data, e.date)[c.f.key]).filter(v => !isEmpty(v));
      const cnt = {}; vals.flatMap(v => Array.isArray(v) ? v : [valStr(c.f, v, users)]).forEach(v => cnt[v] = (cnt[v] || 0) + 1);
      const ent = Object.entries(cnt).sort((a, b) => b[1] - a[1]);
      html += `<div class="rep-block"><h3>${esc(c.et.name)}: ${esc(c.f.label)}</h3>${ent.length ? `<table class="tbl small"><tbody>${ent.map(e => `<tr><td>${esc(e[0])}</td><td><b>${e[1]}</b></td><td>${Math.round(e[1] / vals.length * 1000) / 10}%</td></tr>`).join('')}</tbody></table>` : '<p class="muted">нет данных</p>'}</div>`;
    });
    /* полнота */
    let ct = 0, cf = 0; ev.forEach(e => { const et = etById(reg, e.type); if (!et) return; const cc = completeness(et, computeValues(reg, ds.patients.find(p => p.id === e.patientId), et, e.data, e.date)); ct += cc.total; cf += cc.filled; });
    /* результаты по хирургам (портал результатов, под кодами) */
    const inds = (reg.indicators || []).map(i => ({ i, uf: formFields(etById(reg, i.et) || {}).find(f => f.type === 'user') })).filter(x => x.uf);
    if (inds.length) {
      const surg = [...new Set(inds.flatMap(x => ev.filter(e => e.type === x.i.et).map(e => e.data?.[x.uf.key]).filter(Boolean)))];
      const anon = Settings.data.anonCodes !== false;
      html += `<h2>Результаты по хирургам</h2><p class="muted">${anon ? 'Хирурги указаны под кодами бенчмаркинга.' : ''} Без поправки на риск.</p><table class="tbl small"><thead><tr><th>Хирург</th>${inds.map(x => `<th>${esc(x.i.name)}</th>`).join('')}</tr></thead><tbody>${surg.map(sid => { const u = users.find(x => x.id === sid);
        return `<tr><td><b>${esc(anon ? (u?.code || '?') : (u?.name || '?'))}</b></td>${inds.map(x => { const sev = ev.filter(e => e.type === x.i.et && e.data?.[x.uf.key] === sid); const r = evalIndicator(x.i, sev, ds.patients, reg); return QI.cell(reg, x.i, r, sev, ds.patients); }).join('')}</tr>`; }).join('')}</tbody></table>`;
    }
    html += `<h2>4. Качество данных</h2><p>Полнота ключевых полей: <b>${ct ? Math.round(cf / ct * 100) : 100}%</b> (${cf} из ${ct}). Черновиков: <b>${ev.filter(e => e.status === 'черновик').length}</b>.</p>
      <h2>5. Методология</h2><p>Данные собраны проспективно в платформе AddAll 2.0 по единому словарю данных регистра «${esc(reg.name)}» (версия схемы v${reg.version}). Показатели качества рассчитаны по событиям отчётного периода. Определения переменных приведены в словаре данных регистра.</p>`;
    $('#rep').innerHTML = html;
  };
  draw();
};

/* ---------- ИМПОРТ / ЭКСПОРТ ---------- */
const IO = {
  async key(pass, salt) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  },
  b64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); },
  unb64(s) { return Uint8Array.from(atob(s), c => c.charCodeAt(0)); },
  async backup() {
    if (!can('users')) return toast('Резервное копирование доступно администратору', 'err');
    if (NET.on) return toast('Для данных регистра используйте выгрузку. Для резервной копии SQLite используйте копирование на сервере.', 'err');
    const m = modal(`<h3>Резервная копия</h3><p class="muted">Файл содержит персональные данные пациентов. Рекомендуется зашифровать его паролем (AES-256). Без пароля восстановить зашифрованную копию невозможно.</p>
      <div class="fld"><label class="flab">Пароль шифрования (пусто = без шифрования)</label><input class="inp" type="password" id="bk_p"></div><div class="fld"><label class="flab">Пароль ещё раз</label><input class="inp" type="password" id="bk_p2"></div>
      <div class="row end"><button class="btn primary" id="bk_ok">Скачать</button></div>`);
    $('#bk_ok', m).onclick = async () => {
      const pass = $('#bk_p', m).value; if (pass !== $('#bk_p2', m).value) return toast('Пароли не совпадают', 'err'); if (pass && pass.length < 8) return toast('Пароль от 8 символов', 'err');
      const out = { app: 'AddAll 2.0', exportedAt: nowISO(), by: Auth.user?.name };
      for (const s of STORES) out[s] = await DB.all(s);
      let file = JSON.stringify(out);
      if (pass) { const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)); const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await this.key(pass, salt), new TextEncoder().encode(file))); file = JSON.stringify({ app: 'AddAll 2.0', enc: true, exportedAt: out.exportedAt, salt: this.b64(salt), iv: this.b64(iv), data: this.b64(ct) }); }
      download(`addall2_backup_${today()}${pass ? '_encrypted' : ''}.json`, file, 'application/json'); m.close();
      await Audit.log('резервная копия' + (pass ? ' (зашифрована)' : ''), 'all', '-', null, null);
    };
  },
  restorePicker() {
    if (!can('users')) return toast('Восстановление доступно администратору', 'err');
    if (NET.on) return toast('Восстановление SQLite выполняется на сервере', 'err');
    const i = document.createElement('input'); i.type = 'file'; i.accept = '.json';
    i.onchange = async () => {
      try {
        let d = JSON.parse(await i.files[0].text()); if (d.app !== 'AddAll 2.0') throw new Error('Это не резервная копия AddAll 2.0');
        if (d.enc) { const pass = await promptBox('Пароль резервной копии'); if (!pass) return; try { const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: IO.unb64(d.iv) }, await IO.key(pass, IO.unb64(d.salt)), IO.unb64(d.data)); d = JSON.parse(new TextDecoder().decode(pt)); } catch (e) { throw new Error('Неверный пароль или файл повреждён'); } }
        if (!(await confirmBox(`Восстановить копию от ${fmtDT(d.exportedAt)}? Все текущие данные в этом браузере будут заменены.`))) return;
        for (const s of STORES) { await DB.clear(s); for (const o of d[s] || []) await DB.rawPut(s, o); }
        sessionStorage.clear(); toast('Восстановлено'); setTimeout(() => location.reload(), 600);
      } catch (e) { toast('Ошибка: ' + e.message, 'err'); }
    };
    i.click();
  }
};

Routes.io = async (main) => {
  if (!can('export')) { main.innerHTML = '<div class="head"><h1>Импорт и экспорт</h1></div><p>Доступ ограничен вашей ролью.</p>'; return; }
  const regs = await Data.registries();
  main.innerHTML = `<div class="head"><h1>Импорт и экспорт</h1><a class="btn primary" href="#registry-export">Комплект регистра · Excel, CSV и JSON</a></div>
    <div class="cols"><div class="card"><h3>Экспорт данных</h3>${regSelect(regs, '', 'exReg', false)}
      <div class="fld"><label class="flab">Формат</label><select class="inp" id="exFmt"><option value="wide">Широкая таблица: 1 пациент = 1 строка (повторяемые события: последнее)</option><option value="long">Длинная таблица: 1 событие = 1 строка (по типу события)</option></select></div>
      <div class="fld" id="exEtW" style="display:none"><label class="flab">Тип события</label><select class="inp" id="exEt"></select></div>
      <div class="fld"><label class="flab">Персональные данные</label><select class="inp" id="exPd"><option value="0">без прямых идентификаторов</option>${can('users') ? '<option value="1">с идентификаторами пациентов</option>' : ''}</select></div>
      <div class="row"><button class="btn primary" id="exGo">Скачать CSV</button><button class="btn primary" id="exGoX">Скачать Excel</button></div><p class="muted">CSV открывается в Excel (разделитель «;», UTF-8) и читается в R, SPSS, Stata, Python.</p></div>
    <div class="card"><h3>Импорт из CSV / Excel</h3><p class="muted">Принимаются CSV и XLSX. Пациенты сопоставляются по № ИБ внутри учреждения: существующим добавляется событие, новые создаются.</p>
      ${regSelect(regs, '', 'imReg', false)}<div class="fld"><label class="flab">Тип события для данных</label><select class="inp" id="imEt"></select></div>
      <input type="file" id="imFile" accept=".csv,.txt,.xlsx"><div id="imMap"></div></div></div>
    ${can('users') && !NET.on ? '<div class="card"><h3>Резервная копия браузерной базы</h3><div class="row"><button class="btn" onclick="IO.backup()">Скачать (JSON)</button><button class="btn" onclick="IO.restorePicker()">Восстановить</button></div></div>' : ''}`;
  if (!regs.length) return;
  const fillEt = (sel, regSelId) => { const r = regs.find(x => x.id === $('#' + regSelId).value); $(sel).innerHTML = r.eventTypes.map(e => `<option value="${e.id}">${esc(e.name)}</option>`).join(''); };
  fillEt('#exEt', 'exReg'); fillEt('#imEt', 'imReg');
  $('#exReg').onchange = () => fillEt('#exEt', 'exReg'); $('#imReg').onchange = () => fillEt('#imEt', 'imReg');
  $('#exFmt').onchange = e => $('#exEtW').style.display = e.target.value === 'long' ? '' : 'none';
  $('#exGo').onclick = async () => {
    const ds = await loadReg($('#exReg').value); const reg = ds.reg, pd = can('users') && $('#exPd').value === '1';
    if (pd && !await confirmBox('Включить идентификаторы пациентов для внутренней работы?')) { IO.asX = false; return; }
    ds.patients = ds.patients.filter(visibleP);
    const people = new Map(ds.patients.map(p => [p.id, p]));
    ds.events = ds.events.filter(event => people.has(event.patientId));
    const ids = new Map(ds.patients.map((p, index) => [p.id, pd ? p.id : 'P' + (index + 1)]));
    const eventIds = new Map(ds.events.map((e, index) => [e.id, pd ? e.id : 'EV' + (index + 1)]));
    const byPerson = new Map();
    for (const event of [...ds.events].sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
      if (!byPerson.has(event.patientId) && calendarDay(event.date)) byPerson.set(event.patientId, event.date);
    }
    const getDate = e => pd ? e.date : (byPerson.has(e.patientId) && calendarDay(e.date) ? daysBetween(byPerson.get(e.patientId), e.date) : '');
    const fields = list => list.filter(f => pd || RegistryExport.safeField(f) && f.type !== 'group');
    const base = [{ key: 'pid', label: 'record_id' },
      ...(pd ? [{ key: 'localId', label: 'local_id' }, { key: 'name', label: 'fio' }, { key: 'phone', label: 'phone' }, { key: 'birthDate', label: 'birth_date' }] : []),
      { key: 'sex', label: 'sex' }, ...fields(reg.patientFields || []).map(f => ({ key: 'p_' + f.key, label: 'participant_' + f.key }))];
    const flat = (f, v, personId) => {
      if (!pd) return RegistryExport.sanitized(f, v, byPerson.get(personId), false);
      if (f.type === 'complist') return (v || []).map(c => c.name + ' (CD ' + c.grade + ')').join('; ');
      if (f.type === 'user') return valStr(f, v, ds.users);
      return v && typeof v === 'object' && !Array.isArray(v) ? JSON.stringify(v) : v;
    };
    const pRow = p => {
      const r = { pid: ids.get(p.id), ...(pd ? { localId: p.localId, name: pname(p), phone: p.phone, birthDate: p.birthDate } : {}), sex: p.sex };
      fields(reg.patientFields || []).forEach(f => r['p_' + f.key] = flat(f, p.data?.[f.key], p.id));
      return r;
    };
    let rows = [], cols = [];
    if ($('#exFmt').value === 'wide') {
      cols = [...base]; reg.eventTypes.forEach(et => { cols.push({ key: et.id + '__date', label: et.id + (pd ? '_date' : '_day') }); fields(formFields(et)).forEach(f => cols.push({ key: et.id + '__' + f.key, label: et.id + '_' + f.key })); });
      rows = ds.patients.map(p => { const r = pRow(p); reg.eventTypes.forEach(et => { const e = ds.events.filter(x => x.patientId === p.id && x.type === et.id).sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0]; if (!e) return; const v = computeValues(reg, p, et, e.data, e.date); r[et.id + '__date'] = getDate(e); fields(formFields(et)).forEach(f => r[et.id + '__' + f.key] = flat(f, v[f.key], e.patientId)); }); return r; });
    } else {
      const et = etById(reg, $('#exEt').value);
      cols = [...base, { key: 'event_id', label: 'event_id' }, { key: 'date', label: pd ? 'event_date' : 'day_from_first_event' }, { key: 'status', label: 'status' },
        ...fields(formFields(et)).map(f => ({ key: 'field_' + f.key, label: f.key }))];
      rows = ds.events.filter(e => e.type === et.id).map(e => { const p = ds.patients.find(x => x.id === e.patientId); const v = computeValues(reg, p, et, e.data, e.date); const r = { ...pRow(p), event_id: eventIds.get(e.id), date: getDate(e), status: e.status }; fields(formFields(et)).forEach(f => r['field_' + f.key] = flat(f, v[f.key], e.patientId)); return r; });
    }
    if (IO.asX) Office.xlsx(`${slug(reg.name)}_${$('#exFmt').value}_${today()}.xlsx`, reg.name, [cols.map(c => c.label), ...rows.map(r => cols.map(c => r[c.key]))]);
    else download(`${slug(reg.name)}_${$('#exFmt').value}_${today()}.csv`, toCSV(rows, cols), 'text/csv');
    IO.asX = false;
    await Audit.log('экспорт данных' + (pd ? ' (с ПДн)' : ''), 'registries', reg.id, null, null);
  };
  $('#exGoX').onclick = () => { IO.asX = true; $('#exGo').click(); };
  if (!can('enter')) {
    $('#imFile').disabled = true;
    $('#imMap').textContent = 'Для импорта нужна роль с правом ввода';
    return;
  }
  $('#imFile').onchange = async (e) => {
    if (!e.target.files[0]) return;
    let rows;
    try { rows = await Recon.readTable(e.target.files[0]); }
    catch (error) { return toast(error.message, 'err'); }
    if (rows.length < 2) return toast('Пустой файл', 'err');
    const head = rows[0], reg = regs.find(x => x.id === $('#imReg').value), et = etById(reg, $('#imEt').value);
    const targets = [['', '— пропустить —'], ['localId', '№ ИБ (обязательно)'], ['lastName', 'Фамилия'], ['firstName', 'Имя'], ['middleName', 'Отчество'], ['fio', 'ФИО одной строкой'], ['birthDate', 'Дата рождения'], ['sex', 'Пол'], ['phone', 'Телефон'], ['_date', 'Дата события'], ...formFields(et).filter(f => f.type !== 'calc' && f.type !== 'complist').map(f => ['f:' + f.key, f.label])];
    const guess = (h) => { const x = h.toLowerCase(); const t = targets.find(([k, l]) => k && (l.toLowerCase() === x || k.replace('f:', '').toLowerCase() === x)); return t ? t[0] : /ИБ|история|local/i.test(h) ? 'localId' : /фио/i.test(h) ? 'fio' : /рожд/i.test(h) ? 'birthDate' : /пол$/i.test(h) ? 'sex' : ''; };
    $('#imMap').innerHTML = `<h4>Сопоставление столбцов (${rows.length - 1} строк)</h4><table class="tbl small"><tbody>${head.map((h, i) => `<tr><td><b>${esc(h)}</b><div class="muted">${esc(rows[1][i] || '')}</div></td><td><select class="inp" data-col="${i}">${targets.map(([k, l]) => `<option value="${k}" ${guess(h) === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table>
      <div class="grid"><div class="fld"><label class="flab">Если у пациента уже есть такое событие на эту дату</label><select class="inp" id="imMode"><option value="new">создать ещё одно</option><option value="fill" selected>дополнить пустые поля (слияние)</option><option value="over">перезаписать значениями из файла</option></select></div>
      <div class="fld"><label class="flab">Данные пациента в карточке</label><select class="inp" id="imPt"><option value="keep">не трогать существующие</option><option value="fill">дополнить пустые (ФИО, дата рождения, пол, телефон)</option></select></div>
      <div class="fld"><label class="flab">Режим</label><label class="chk"><input type="checkbox" id="imDry"> <span>Только проверить, ничего не сохранять</span></label></div></div>
      <button class="btn primary" id="imGo">Импортировать</button><div id="imRes"></div>`;
    $('#imGo').onclick = async () => {
      const map = $$('[data-col]').map(s => s.value);
      if (!map.includes('localId')) return toast('Нужен столбец № ИБ', 'err');
      const fieldsBy = new Map(formFields(et).map(f => [f.key, f]));
      let created = 0, events = 0, merged = 0, ptUpd = 0;
      const errs = [];
      const mode = $('#imMode').value, dry = $('#imDry').checked, ptMode = $('#imPt').value;
      const [allEv, existing] = await Promise.all([Data.events(reg.id), Data.patients(reg.id)]);
      const center = Auth.user.center || reg.center || '';
      const put = dry ? async (store, record) => ({ ...record, id: record.id || uid('dry') }) : DB.put.bind(DB);
      const button = $('#imGo');
      button.disabled = true;
      try {
        for (let r = 1; r < rows.length; r++) {
          const row = rows[r];
          const get = key => String(row[map.indexOf(key)] ?? '').trim();
          const error = msg => errs.push('Строка ' + (r + 1) + ': ' + msg);
          const lid = get('localId');
          if (!lid) { error('нет № ИБ'); continue; }
          const matches = existing.filter(p => p.localId === lid && (p.center || '') === center);
          if (matches.length > 1) { error('по № ИБ найдено несколько карточек'); continue; }
          const rawDate = get('_date');
          const eventData = {};
          for (const [index, key] of map.entries()) {
            const field = fieldsBy.get(key.slice(2));
            if (!key.startsWith('f:') || !field) continue;
            const value = String(row[index] ?? '').trim();
            if (value) eventData[field.key] = field.type === 'multiselect' ? value.split(/[;,]/).map(item => item.trim()).filter(Boolean)
              : field.type === 'date' ? Recon.day(value) || value : value;
          }
          const hasEvent = rawDate || Object.keys(eventData).length;
          const date = Recon.day(rawDate);
          if (hasEvent && !date) { error('укажите действительную дату события'); continue; }
          const validated = AI.normalize(formFields(et).filter(f => f.type !== 'user'), [], eventData);
          if (validated.skipped.length) { validated.skipped.forEach(error); continue; }
          const data = { ...Object.fromEntries(Object.entries(eventData).filter(([key]) => fieldsBy.get(key)?.type === 'user')), ...validated.out };
          const birthDate = Recon.day(get('birthDate'));
          if (get('birthDate') && !birthDate) { error('некорректная дата рождения'); continue; }
          const rawSex = get('sex');
          const sex = /^(ж|f|female|женский)$/i.test(rawSex) ? 'Ж' : /^(м|m|male|мужской)$/i.test(rawSex) ? 'М' : '';
          let [lastName, firstName, middleName] = [get('lastName'), get('firstName'), get('middleName')];
          if (!lastName && get('fio')) [lastName, firstName, middleName] = get('fio').split(/\s+/);
          const demographics = { lastName, firstName, middleName, birthDate, sex, phone: get('phone') };
          let patient = matches[0];
          const sameType = patient ? allEv.filter(item => item.patientId === patient.id && item.type === et.id) : [];
          const sameDay = sameType.filter(item => item.date === date);
          if (hasEvent && mode !== 'new' && sameDay.length > 1) { error('найдено несколько событий на эту дату'); continue; }
          const same = mode !== 'new' && sameDay[0];
          if (hasEvent && same?.locked) { error('событие заблокировано'); continue; }
          if (hasEvent && !same && et.single && sameType.length) { error('у пациента уже есть «' + et.name + '»'); continue; }
          if (!patient) {
            patient = await put('patients', { registryId: reg.id, localId: lid, center, ...demographics, data: {}, consent: '' }, 'импорт пациента');
            existing.push(patient);
            created++;
          } else if (ptMode === 'fill') {
            const updates = Object.fromEntries(Object.entries(demographics).filter(([key, value]) => value && !patient[key]));
            if (Object.keys(updates).length) {
              const saved = await put('patients', { ...patient, ...updates }, 'импорт: дополнение карточки');
              Object.assign(patient, saved);
              ptUpd++;
            }
          }
          if (!hasEvent) continue;
          if (same) {
            const accepted = Object.fromEntries(Object.entries(data).filter(([key]) => mode === 'over' || isEmpty(same.data?.[key])));
            if (!Object.keys(accepted).length) continue;
            const values = { ...same.data, ...accepted };
            const status = validateEvent(et, computeValues(reg, patient, et, values, date)).length ? 'черновик' : 'завершено';
            const saved = await put('events', { ...same, data: values, status, aiEvidence: AI.matchingEvidence(values, same.aiEvidence) }, 'импорт: слияние');
            Object.assign(same, saved);
            merged++;
          } else {
            const status = validateEvent(et, computeValues(reg, patient, et, data, date)).length ? 'черновик' : 'завершено';
            const saved = await put('events', { patientId: patient.id, registryId: reg.id, type: et.id, date, data, status, schemaVersion: reg.version }, 'импорт события');
            allEv.push(saved);
            events++;
          }
        }
      } catch (error) {
        errs.push('Импорт остановлен: ' + error.message);
      } finally {
        button.disabled = false;
      }
      $('#imRes').innerHTML = `<p><b>${dry ? 'Проверка (ничего не сохранено)' : 'Готово'}:</b> новых пациентов ${created}, новых событий ${events}, слито с существующими ${merged}, дополнено карточек ${ptUpd}.</p>${errs.length ? `<details open><summary class="bad">Замечания: ${errs.length}</summary><div class="small">${errs.slice(0, 200).map(esc).join('<br>')}</div></details>` : ''}`;
    };
  };
};
