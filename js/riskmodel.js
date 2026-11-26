/* AddAll: своя модель риска на данных регистра и проверка готовой модели.
   Методы (только опубликованные):
   - логистическая регрессия, оценка максимального правдоподобия методом Ньютона-Рафсона (IRLS);
     стандартные ошибки из обратной информационной матрицы Фишера, доверительные интервалы и p по Вальду;
   - C-статистика (площадь под ROC-кривой) через ранги Манна-Уитни с учётом совпадений;
     95% ДИ по Hanley JA, McNeil BJ. Radiology 1982;143:29-36;
   - калибровка: наклон и свободный член (Cox DR. Biometrika 1958;45:562-565), калибровка в целом (O/E),
     таблица по децилям прогноза, показатель Brier (Brier GW. Mon Weather Rev 1950;78:1-3);
   - поправка на оптимизм бутстрепом (Harrell FE, Lee KL, Mark DB. Stat Med 1996;15:361-387;
     Steyerberg EW. Clinical Prediction Models, 2nd ed., 2019): 200 повторов, фиксированное зерно;
   - число событий на параметр (EPV) меньше 10: предупреждение (Peduzzi P et al. J Clin Epidemiol 1996;49:1373-1379).
   Пропуски: анализ полных случаев, число исключённых показывается. Множественной импутации нет.
   Подключается после formlib.js, до net.js. */
'use strict';

const RiskModel = {
  sig: x => 1 / (1 + Math.exp(-x)),
  /* решение A x = b и обращение матрицы методом Гаусса с выбором главного элемента */
  inverse(A) {
    const n = A.length, M = A.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
    for (let c = 0; c < n; c++) {
      let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (Math.abs(M[p][c]) < 1e-12) return null;
      [M[c], M[p]] = [M[p], M[c]];
      const d = M[c][c]; for (let j = 0; j < 2 * n; j++) M[c][j] /= d;
      for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c]; if (f) for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j]; }
    }
    return M.map(row => row.slice(n));
  },
  /* логистическая регрессия: X без столбца единиц (свободный член добавляется), offset необязателен */
  fit(X, y, offset = null, maxIter = 60) {
    const n = y.length, k = (X[0]?.length || 0) + 1;
    const row = i => [1, ...(X[i] || [])];
    let b = new Array(k).fill(0), it = 0, converged = false, cov = null;
    for (; it < maxIter; it++) {
      const H = Array.from({ length: k }, () => new Array(k).fill(0)), g = new Array(k).fill(0);
      for (let i = 0; i < n; i++) {
        const x = row(i); let eta = offset ? offset[i] : 0; for (let j = 0; j < k; j++) eta += b[j] * x[j];
        const p = RiskModel.sig(eta), w = p * (1 - p);
        for (let j = 0; j < k; j++) { g[j] += x[j] * (y[i] - p); for (let l = 0; l <= j; l++) H[j][l] += w * x[j] * x[l]; }
      }
      for (let j = 0; j < k; j++) for (let l = 0; l < j; l++) H[l][j] = H[j][l];
      cov = RiskModel.inverse(H); if (!cov) break;
      const step = cov.map(r => r.reduce((s, v, j) => s + v * g[j], 0));
      b = b.map((v, j) => v + step[j]);
      if (Math.max(...step.map(Math.abs)) < 1e-9) { converged = true; break; }
    }
    if (cov) { /* ковариация в точке оценки */
      const H = Array.from({ length: k }, () => new Array(k).fill(0));
      for (let i = 0; i < n; i++) { const x = row(i); let eta = offset ? offset[i] : 0; for (let j = 0; j < k; j++) eta += b[j] * x[j]; const p = RiskModel.sig(eta), w = p * (1 - p); for (let j = 0; j < k; j++) for (let l = 0; l < k; l++) H[j][l] += w * x[j] * x[l]; }
      cov = RiskModel.inverse(H);
    }
    const separated = !converged || b.some(v => Math.abs(v) > 15);
    const se = cov ? cov.map((r, j) => Math.sqrt(Math.max(0, r[j]))) : b.map(() => null);
    return { b, se, converged, separated, iterations: it + 1 };
  },
  lp(b, X, offset = null) { return X.map((x, i) => (offset ? offset[i] : 0) + b[0] + x.reduce((s, v, j) => s + v * b[j + 1], 0)); },
  /* C-статистика через средние ранги */
  auc(score, y) {
    const idx = score.map((s, i) => i).sort((a, b) => score[a] - score[b]), rank = new Array(score.length);
    for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && score[idx[j + 1]] === score[idx[i]]) j++; const r = (i + j) / 2 + 1; for (let t = i; t <= j; t++) rank[idx[t]] = r; i = j + 1; }
    const n1 = y.filter(v => v === 1).length, n0 = y.length - n1;
    if (!n1 || !n0) return null;
    const R1 = y.reduce((s, v, i) => s + (v === 1 ? rank[i] : 0), 0);
    const A = (R1 - n1 * (n1 + 1) / 2) / (n1 * n0);
    const Q1 = A / (2 - A), Q2 = 2 * A * A / (1 + A);
    const se = Math.sqrt((A * (1 - A) + (n1 - 1) * (Q1 - A * A) + (n0 - 1) * (Q2 - A * A)) / (n1 * n0));
    return { c: A, lo: Math.max(0, A - 1.959963984540054 * se), hi: Math.min(1, A + 1.959963984540054 * se), se };
  },
  /* калибровка прогноза p (доли): наклон и свободный член по Коксу, калибровка в целом */
  calibration(p, y) {
    const clip = v => Math.min(1 - 1e-9, Math.max(1e-9, v));
    const lp = p.map(v => Math.log(clip(v) / (1 - clip(v))));
    const slopeFit = RiskModel.fit(lp.map(v => [v]), y);
    const citl = RiskModel.fit(y.map(() => []), y, lp);
    const O = y.reduce((s, v) => s + v, 0), E = p.reduce((s, v) => s + v, 0);
    const brier = p.reduce((s, v, i) => s + (v - y[i]) ** 2, 0) / y.length;
    return { slope: slopeFit.b[1], slopeSe: slopeFit.se[1], intercept: citl.b[0], interceptSe: citl.se[0], O, E, oe: E ? O / E : null, brier };
  },
  deciles(p, y) {
    const order = p.map((v, i) => i).sort((a, b) => p[a] - p[b]);
    const g = Math.max(2, Math.min(10, Math.floor(y.length / 10)));
    const out = [];
    for (let k = 0; k < g; k++) {
      const part = order.slice(Math.floor(k * order.length / g), Math.floor((k + 1) * order.length / g));
      if (!part.length) continue;
      const O = part.reduce((s, i) => s + y[i], 0), E = part.reduce((s, i) => s + p[i], 0);
      out.push({ n: part.length, O, E, obs: O / part.length, pred: E / part.length, lo: p[part[0]], hi: p[part[part.length - 1]] });
    }
    return out;
  },
  rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; },
  /* поправка на оптимизм бутстрепом */
  bootstrap(X, y, B = 200, seed = 20261125) {
    const rnd = RiskModel.rng(seed), n = y.length, optC = [], slopes = [];
    for (let r = 0; r < B; r++) {
      const ix = Array.from({ length: n }, () => Math.floor(rnd() * n));
      const Xb = ix.map(i => X[i]), yb = ix.map(i => y[i]);
      if (!yb.some(v => v === 1) || !yb.some(v => v === 0)) continue;
      const m = RiskModel.fit(Xb, yb); if (!m.converged) continue;
      const cb = RiskModel.auc(RiskModel.lp(m.b, Xb), yb), lpo = RiskModel.lp(m.b, X), co = RiskModel.auc(lpo, y);
      if (!cb || !co) continue;
      optC.push(cb.c - co.c);
      const s = RiskModel.fit(lpo.map(v => [v]), y); if (s.converged) slopes.push(s.b[1]);
    }
    const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
    return { runs: optC.length, optimismC: mean(optC), slope: mean(slopes) };
  },
  pval: z => 2 * (1 - Stats.ncdf(Math.abs(z))),

  /* ---------- данные регистра ---------- */
  candidates(reg, et) {
    return formFields(et || {}).filter(f => ['number', 'yesno', 'select', 'calc'].includes(f.type));
  },
  async rows(reg, cfg) {
    const [events, patients] = await Promise.all([Data.events(reg.id), Data.patients(reg.id)]);
    const people = new Map(patients.filter(p => typeof visibleP !== 'function' || visibleP(p)).map(p => [p.id, p]));
    const base = etById(reg, cfg.base), outEt = etById(reg, cfg.outForm);
    const link = cfg.outForm !== cfg.base ? Episodes.link(reg, events) : null;
    const rows = [];
    for (const e of events) {
      if (e.type !== cfg.base || e.status === 'черновик' || !people.has(e.patientId) || !e.date || e.date < cfg.from || e.date > cfg.to) continue;
      const p = people.get(e.patientId), vals = computeValues(reg, p, base, e.data, e.date);
      let ov;
      if (!link) ov = vals[cfg.outKey];
      else {
        const o = events.filter(x => x.type === cfg.outForm && x.status !== 'черновик' && link.get(x.id) === e.id).sort((a, b) => String(a.date).localeCompare(String(b.date)))[0];
        ov = o ? computeValues(reg, p, outEt, o.data, o.date)[cfg.outKey] : null;
      }
      rows.push({ id: e.id, vals, out: ov });
    }
    return rows;
  },
  hasValue(v) { return !isEmpty(v) && v !== 'неизвестно'; },
  encodeOutcome(v, events) {
    if (!RiskModel.hasValue(v)) return null;
    const list = Array.isArray(v) ? v.map(String) : [String(v)];
    return list.some(x => events.includes(x)) ? 1 : 0;
  },
  /* кодирование предикторов: число как есть, да/нет как 1/0, список как индикаторы относительно самого частого значения */
  design(rows, fields) {
    const terms = [];
    for (const f of fields) {
      if (f.type === 'yesno') terms.push({ f, label: f.label + ': да', get: v => v === 'да' ? 1 : v === 'нет' ? 0 : null, expr: k => `(${k} === 'да' ? 1 : 0)` });
      else if (f.type === 'select') {
        const cnt = {}; rows.forEach(r => { const v = r.vals[f.key]; if (RiskModel.hasValue(v)) cnt[v] = (cnt[v] || 0) + 1; });
        const levels = Object.entries(cnt).sort((a, b) => b[1] - a[1]).map(x => x[0]);
        if (levels.length < 2) continue;
        f._ref = levels[0];
        for (const lv of levels.slice(1, 7)) terms.push({ f, label: `${f.label}: ${lv} (против «${levels[0]}»)`, get: v => !RiskModel.hasValue(v) ? null : String(v) === lv ? 1 : 0, expr: k => `(${k} === ${JSON.stringify(lv)} ? 1 : 0)` });
      } else terms.push({ f, label: f.label + (f.unit ? `, ${f.unit}` : ''), get: v => { if (isEmpty(v)) return null; const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; }, expr: k => k });
    }
    return terms;
  }
};

Routes.riskmodel = async (main, regId = '') => {
  const regs = await Data.registries();
  const reg = regs.find(r => r.id === regId) || regs[0];
  if (!reg) { main.innerHTML = '<div class="head"><h1>Модель риска</h1></div>' + emptyState('Нет регистров.'); return; }
  const st = (Routes.riskmodel.st ||= {});
  const y = String(Number(today().slice(0, 4)) - 1);
  const cfg = st[reg.id] ||= { from: '2000-01-01', to: today(), base: Episodes.isPatient(reg) ? reg.eventTypes[0].id : Episodes.opener(reg), outForm: '', outKey: '', events: [], mode: 'fit', preds: [], risk: '' };
  const forms = reg.eventTypes || [];
  if (!etById(reg, cfg.base)) cfg.base = forms[0]?.id;
  if (!etById(reg, cfg.outForm)) cfg.outForm = cfg.base;
  const outFields = formFields(etById(reg, cfg.outForm) || {}).filter(f => ['yesno', 'select', 'multiselect', 'complist'].includes(f.type));
  if (!outFields.some(f => f.key === cfg.outKey)) { cfg.outKey = outFields[0]?.key || ''; cfg.events = []; }
  const outF = outFields.find(f => f.key === cfg.outKey);
  const outOptions = outF ? (outF.type === 'yesno' ? ['да', 'нет'] : (outF.options || []).map(o => typeof o === 'object' ? (o.l ?? o.label ?? o.value) : o)) : [];
  if (outF && !cfg.events.length) cfg.events = outF.type === 'yesno' ? ['да'] : [];
  const cands = RiskModel.candidates(reg, etById(reg, cfg.base)).filter(f => !(cfg.outForm === cfg.base && f.key === cfg.outKey));
  const riskFields = cands.filter(f => ['number', 'calc'].includes(f.type));
  const sel = (id, list, cur) => `<select class="inp" id="${id}">${list.map(([v, t]) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
  main.innerHTML = `<div class="head"><h1>Модель риска</h1>${regSelect(regs, reg.id, 'rmReg', false)}</div>
    <div class="card" id="rmSetup"><p>Здесь можно построить свою модель риска на данных регистра или проверить готовую (например, P-POSSUM) на своих пациентах. Готовые формулы созданы на других больницах и в другие годы: перед сравнением учреждений их точность стоит проверить.</p>
      <div class="grid">
        <div class="fld"><label class="flab" for="rmFrom">Начало периода</label><input class="inp" type="date" id="rmFrom" value="${esc(cfg.from)}"></div>
        <div class="fld"><label class="flab" for="rmTo">Конец периода</label><input class="inp" type="date" id="rmTo" value="${esc(cfg.to)}"></div>
        <div class="fld"><label class="flab" for="rmBase">Случай (одна строка анализа)</label>${sel('rmBase', forms.map(f => [f.id, f.name]), cfg.base)}</div>
        <div class="fld"><label class="flab" for="rmOutForm">Исход в форме</label>${sel('rmOutForm', forms.filter(f => f.id === cfg.base || cfg.base === Episodes.opener(reg)).map(f => [f.id, f.name]), cfg.outForm)}</div>
        <div class="fld"><label class="flab" for="rmOut">Поле исхода</label>${outFields.length ? sel('rmOut', outFields.map(f => [f.key, f.label]), cfg.outKey) : '<p class="muted">В форме нет полей «да/нет» или списка.</p>'}</div>
        <div class="fld"><label class="flab">Что считать событием</label><div class="chips" id="rmEvents">${outOptions.map(o => `<label class="chip"><input type="checkbox" value="${esc(o)}" ${cfg.events.includes(String(o)) ? 'checked' : ''}>${esc(o)}</label>`).join('')}</div></div>
        <div class="fld"><label class="flab" for="rmMode">Что сделать</label>${sel('rmMode', [['fit', 'Построить свою модель'], ['check', 'Проверить готовую модель']], cfg.mode)}</div>
      </div>
      ${cfg.mode === 'fit' ? `<div class="fld"><label class="flab">Предикторы (из формы «${esc(etById(reg, cfg.base)?.name || '')}»)</label><div class="chips" id="rmPreds">${cands.map(f => `<label class="chip"><input type="checkbox" value="${esc(f.key)}" ${cfg.preds.includes(f.key) ? 'checked' : ''}>${esc(f.label)}</label>`).join('') || '<span class="muted">Нет подходящих полей.</span>'}</div><div class="help">Выбирайте заранее, по клиническому смыслу и литературе, а не перебором: перебор завышает точность.</div></div>`
        : `<div class="fld"><label class="flab" for="rmRisk">Поле с прогнозом риска</label>${riskFields.length ? sel('rmRisk', riskFields.map(f => [f.key, f.label + (f.unit ? ', ' + f.unit : '')]), cfg.risk || riskFields[0].key) : '<p class="muted">В форме нет числовых или расчётных полей.</p>'}<div class="help">Значения больше 1 считаются процентами.</div></div>`}
      <div class="row end"><button class="btn primary" id="rmRun">Рассчитать</button></div></div>
    <div class="card" id="rmOutBox"><p class="muted">Выберите настройки и нажмите «Рассчитать».</p></div>
    <div class="card"><h2>Методы</h2><p class="small">Логистическая регрессия (оценка максимального правдоподобия, метод Ньютона-Рафсона), доверительные интервалы и p по Вальду. C-статистика с 95% ДИ по Hanley и McNeil (1982). Калибровка: наклон и свободный член по Коксу (1958), отношение O/E, показатель Brier, таблица по группам прогноза. Поправка на оптимизм: 200 повторов бутстрепа (Harrell и соавт., 1996). Пропуски: анализируются только полные случаи. Отчёт о модели оформляйте по TRIPOD.</p></div>`;
  $('#rmReg', main).onchange = e => go('riskmodel/' + e.target.value);
  const re = () => App.route();
  $('#rmFrom', main).onchange = e => { cfg.from = e.target.value; };
  $('#rmTo', main).onchange = e => { cfg.to = e.target.value; };
  $('#rmBase', main).onchange = e => { cfg.base = e.target.value; cfg.outForm = cfg.base; cfg.preds = []; cfg.outKey = ''; re(); };
  $('#rmOutForm', main).onchange = e => { cfg.outForm = e.target.value; cfg.outKey = ''; re(); };
  if ($('#rmOut', main)) $('#rmOut', main).onchange = e => { cfg.outKey = e.target.value; cfg.events = []; re(); };
  $('#rmMode', main).onchange = e => { cfg.mode = e.target.value; re(); };
  if ($('#rmRisk', main)) $('#rmRisk', main).onchange = e => { cfg.risk = e.target.value; };
  for (const [selector, key] of [['#rmPreds', 'preds'], ['#rmEvents', 'events']]) {
    const group = $(selector, main);
    if (group) group.onchange = () => { cfg[key] = $$('input:checked', group).map(input => input.value); };
  }
  $('#rmRun', main).onclick = async () => {
    cfg.events = $$('#rmEvents input:checked', main).map(x => x.value);
    if (cfg.mode === 'fit') cfg.preds = $$('#rmPreds input:checked', main).map(x => x.value);
    else cfg.risk = $('#rmRisk', main)?.value || '';
    const box = $('#rmOutBox', main);
    if (!cfg.outKey || !cfg.events.length) return toast('Выберите поле исхода и что считать событием', 'err');
    if (cfg.mode === 'fit' && !cfg.preds.length) return toast('Выберите хотя бы один предиктор', 'err');
    if (cfg.mode === 'check' && !cfg.risk) return toast('Выберите поле с прогнозом', 'err');
    box.innerHTML = '<p class="muted">Считаю…</p>';
    const selection = { ...cfg };
    await new Promise(r => setTimeout(r, 30));
    const rows = await RiskModel.rows(reg, selection);
    if (!box.isConnected) return;
    box.innerHTML = selection.mode === 'fit' ? RiskModel.reportFit(reg, selection, rows) : RiskModel.reportCheck(reg, selection, rows);
    const copy = $('#rmCopy', box);
    if (copy) copy.onclick = () => { try { navigator.clipboard.writeText($('#rmFormula', box).textContent); toast('Формула скопирована'); } catch (e) { toast('Скопируйте формулу вручную', 'err'); } };
  };
};

RiskModel.f = (v, d = 2) => v == null || !Number.isFinite(v) ? 'нет' : (Math.round(v * 10 ** d) / 10 ** d).toLocaleString('ru-RU');
RiskModel.pf = v => v == null ? '' : v < 0.001 ? '<0,001' : RiskModel.f(v, 3);
RiskModel.calTable = (dec) => `<table class="tbl"><thead><tr><th>Группа прогноза</th><th>Случаев</th><th>Наблюдалось</th><th>Ожидалось</th><th>Наблюдаемая доля</th><th>Средний прогноз</th></tr></thead><tbody>
  ${dec.map((d, i) => `<tr><td>${i + 1} (${RiskModel.f(d.lo * 100, 1)}-${RiskModel.f(d.hi * 100, 1)}%)</td><td>${d.n}</td><td>${d.O}</td><td>${RiskModel.f(d.E, 1)}</td><td>${RiskModel.f(d.obs * 100, 1)}%</td><td>${RiskModel.f(d.pred * 100, 1)}%</td></tr>`).join('')}</tbody></table>`;
RiskModel.calChart = (dec) => typeof Chart === 'object' && Chart.line ? Chart.line('Калибровка: средний прогноз и наблюдаемая доля по группам', [{ pts: dec.map(d => ({ x: Math.round(d.pred * 1000) / 10, y: Math.round(d.obs * 1000) / 10 })) }], { xl: 'Прогноз, %', yl: 'Наблюдалось, %' }) : '';

RiskModel.reportFit = (reg, cfg, rows) => {
  const fields = cfg.preds.map(k => formFields(etById(reg, cfg.base)).find(f => f.key === k)).filter(Boolean);
  const terms = RiskModel.design(rows, fields);
  const all = rows.map(r => ({ y: RiskModel.encodeOutcome(r.out, cfg.events), x: terms.map(t => t.get(r.vals[t.f.key])) }));
  const used = all.filter(r => r.y != null && r.x.every(v => v != null));
  const X = used.map(r => r.x), Y = used.map(r => r.y);
  const ev = Y.filter(v => v === 1).length, k = terms.length;
  const head = `<h2>Модель: ${esc(formFields(etById(reg, cfg.outForm)).find(f => f.key === cfg.outKey)?.label || '')}</h2>
    <p>Случаев в периоде: <b>${rows.length}</b>. В анализе (все данные заполнены): <b>${used.length}</b>, событий <b>${ev}</b>. Исключено из-за пропусков: <b>${rows.length - used.length}</b>.</p>`;
  if (!terms.length) return head + '<p class="bad">Ни один выбранный предиктор не подходит (у списка должно быть хотя бы два значения).</p>';
  if (ev < 5 || used.length - ev < 5) return head + '<p class="bad">Слишком мало событий или случаев без события для модели.</p>';
  const m = RiskModel.fit(X, Y);
  const lp = RiskModel.lp(m.b, X), p = lp.map(RiskModel.sig);
  const c = RiskModel.auc(lp, Y), cal = RiskModel.calibration(p, Y), dec = RiskModel.deciles(p, Y);
  const boot = RiskModel.bootstrap(X, Y);
  const epv = ev / k;
  const z = 1.959963984540054;
  const coef = [`<tr><td>Свободный член</td><td>${RiskModel.f(m.b[0], 3)}</td><td></td><td></td><td></td></tr>`,
    ...terms.map((t, j) => { const b = m.b[j + 1], se = m.se[j + 1]; return `<tr><td>${esc(t.label)}</td><td>${RiskModel.f(b, 3)}</td><td>${RiskModel.f(Math.exp(b), 2)}</td><td>${se == null ? '' : RiskModel.f(Math.exp(b - z * se), 2) + '-' + RiskModel.f(Math.exp(b + z * se), 2)}</td><td>${se ? RiskModel.pf(RiskModel.pval(b / se)) : ''}</td></tr>`; })].join('');
  const keys = [...new Set(terms.map(t => t.f.key))];
  const formula = `(${keys.map(k2 => `${k2} == null || ${k2} === '' || ${k2} === 'неизвестно'`).join(' || ')}) ? null : Math.round(1000 / (1 + Math.exp(-(${RiskModel.num(m.b[0])}${terms.map((t, j) => ` + ${RiskModel.num(m.b[j + 1])} * ${t.expr(t.f.key)}`).join('')}))) ) / 10`;
  return head + `
    ${epv < 10 ? `<p class="warnt">Событий на один параметр: ${RiskModel.f(epv, 1)}. Это меньше 10: модель может быть переобучена, коэффициенты неустойчивы (Peduzzi и соавт., 1996). Уменьшите число предикторов или накопите данные.</p>` : `<p class="okt">Событий на один параметр: ${RiskModel.f(epv, 1)}.</p>`}
    ${m.separated ? '<p class="warnt">Модель не сошлась или есть почти полное разделение (какой-то предиктор почти идеально предсказывает исход). Коэффициенты ненадёжны.</p>' : ''}
    <h3>Коэффициенты</h3><table class="tbl"><thead><tr><th>Предиктор</th><th>Коэффициент</th><th>Отношение шансов</th><th>95% ДИ</th><th>p</th></tr></thead><tbody>${coef}</tbody></table>
    <h3>Точность</h3><ul>
      <li>C-статистика на тех же данных: <b>${RiskModel.f(c?.c, 3)}</b> (95% ДИ ${RiskModel.f(c?.lo, 3)}-${RiskModel.f(c?.hi, 3)}).</li>
      <li>С поправкой на оптимизм (бутстреп, ${boot.runs} повторов): C-статистика <b>${RiskModel.f(boot.optimismC == null ? null : c.c - boot.optimismC, 3)}</b>, наклон калибровки <b>${RiskModel.f(boot.slope, 2)}</b>. Наклон меньше 1 означает, что на новых пациентах прогнозы будут слишком крайними; это признак переобучения.</li>
      <li>Показатель Brier: ${RiskModel.f(cal.brier, 4)}. Наблюдалось ${cal.O}, ожидалось ${RiskModel.f(cal.E, 1)}.</li></ul>
    <h3>Калибровка по группам прогноза</h3>${RiskModel.calTable(dec)}${RiskModel.calChart(dec)}
    <h3>Формула для расчётного поля</h3><p class="small">Чтобы считать прогноз у каждого пациента, добавьте в форму «${esc(etById(reg, cfg.base)?.name || '')}» расчётное поле с этой формулой (результат в процентах). Перед использованием в сравнении учреждений проверьте модель на данных следующего периода (режим «Проверить готовую модель»).</p>
    <pre class="mono" id="rmFormula" style="white-space:pre-wrap">${esc(formula)}</pre><div class="row end"><button class="btn" id="rmCopy">Скопировать формулу</button></div>`;
};
RiskModel.num = v => (Math.round(v * 1e6) / 1e6).toString();

RiskModel.reportCheck = (reg, cfg, rows) => {
  const all = rows.map(r => { const v = r.vals[cfg.risk]; const n = isEmpty(v) ? null : Number(String(v).replace(',', '.')); return { y: RiskModel.encodeOutcome(r.out, cfg.events), r: Number.isFinite(n) ? n : null }; });
  const scale = all.some(r => r.r != null && r.r > 1) ? 100 : 1;
  const used = all.filter(r => r.y != null && r.r != null && r.r >= 0 && r.r / scale <= 1);
  const Y = used.map(r => r.y), p = used.map(r => r.r / scale), ev = Y.filter(v => v === 1).length;
  const label = formFields(etById(reg, cfg.base)).find(f => f.key === cfg.risk)?.label || cfg.risk;
  const head = `<h2>Проверка модели «${esc(label)}»</h2><p>Случаев в периоде: <b>${rows.length}</b>. В анализе: <b>${used.length}</b>, событий <b>${ev}</b>. Без прогноза или исхода: <b>${rows.length - used.length}</b>.</p>`;
  if (ev < 5 || used.length - ev < 5) return head + '<p class="bad">Слишком мало событий или случаев без события для проверки.</p>';
  const c = RiskModel.auc(p, Y), cal = RiskModel.calibration(p, Y), dec = RiskModel.deciles(p, Y);
  const z = 1.959963984540054;
  /* вывод только там, где 95% ДИ не включает идеальное значение */
  const verdict = [];
  const iLo = cal.intercept - z * cal.interceptSe, iHi = cal.intercept + z * cal.interceptSe, sLo = cal.slope - z * cal.slopeSe, sHi = cal.slope + z * cal.slopeSe;
  const badMean = iHi < 0 || iLo > 0, badSlope = sHi < 1 || sLo > 1;
  verdict.push(iHi < 0 ? 'модель завышает риск: событий меньше ожидаемого' : iLo > 0 ? 'модель занижает риск: событий больше ожидаемого' : 'общий уровень риска статистически не отличается от наблюдаемого');
  verdict.push(sHi < 1 ? 'прогнозы слишком крайние (наклон меньше 1)' : sLo > 1 ? 'прогнозы слишком сглажены (наклон больше 1)' : 'наклон статистически не отличается от 1');
  return head + `<ul>
      <li>C-статистика: <b>${RiskModel.f(c?.c, 3)}</b> (95% ДИ ${RiskModel.f(c?.lo, 3)}-${RiskModel.f(c?.hi, 3)}). 0,5 означает угадывание, 1 идеальное различение.</li>
      <li>Наблюдалось ${cal.O}, ожидалось ${RiskModel.f(cal.E, 1)}: O/E = <b>${RiskModel.f(cal.oe, 2)}</b>.</li>
      <li>Калибровка в целом (свободный член при наклоне 1): ${RiskModel.f(cal.intercept, 2)} (95% ДИ ${RiskModel.f(cal.intercept - z * cal.interceptSe, 2)} до ${RiskModel.f(cal.intercept + z * cal.interceptSe, 2)}); идеально 0.</li>
      <li>Наклон калибровки: <b>${RiskModel.f(cal.slope, 2)}</b> (95% ДИ ${RiskModel.f(cal.slope - z * cal.slopeSe, 2)}-${RiskModel.f(cal.slope + z * cal.slopeSe, 2)}); идеально 1.</li>
      <li>Показатель Brier: ${RiskModel.f(cal.brier, 4)}.</li></ul>
    <p><b>Вывод:</b> ${esc(verdict.join('; '))}. ${badMean || badSlope ? 'Перед сравнением учреждений по этой модели нужна перекалибровка или своя модель.' : 'Отсутствие различий при малом числе событий не доказывает, что модель точна: смотрите на ширину интервалов.'}</p>
    <h3>Калибровка по группам прогноза</h3>${RiskModel.calTable(dec)}${RiskModel.calChart(dec)}`;
};

ROUTE_GROUP.riskmodel = 'Наука';
NAV_ICONS.riskmodel = NAV_ICONS.riskmodel || NAV_ICONS.analytics || NAV_ICONS.me;
{
  const previous = navGroups;
  navGroups = async function () {
    const groups = await previous();
    const sci = groups.find(group => group.id === 'sci');
    if (sci?.items && can('analyse') && !sci.items.some(x => x.r === 'riskmodel')) {
      const at = sci.items.findIndex(item => item.r === 'analytics');
      sci.items.splice(at < 0 ? sci.items.length : at + 1, 0, { r: 'riskmodel', t: 'Модель риска', i: '◭' });
    }
    return groups;
  };
}
/* учебный режим: гайд сам выбирает исход и предикторы, чтобы показать готовый результат */
RiskModel.trainingDemo = async () => {
  if (!TRAIN || !Routes.riskmodel.st) return;
  const regId = decodeURIComponent(location.hash.split('/')[1] || '');
  const regs = await Data.registries();
  const reg = regs.find(r => r.id === regId) || regs[0];
  const cfg = reg && Routes.riskmodel.st[reg.id];
  if (!cfg) return;
  const base = etById(reg, cfg.base);
  const outs = formFields(base || {}).filter(f => f.type === 'yesno');
  const out = [/повторн.*операц|reop|релап/i, /несостоятельн|leak/i, /летальн|смерт|mort/i].map(rx => outs.find(f => rx.test(f.label + ' ' + f.key))).find(Boolean) || outs[0];
  if (!out) return;
  const skip = /летальн|смерт|повторн|осложн|койко|clavien|cci|несостоятельн|исход|mort|reop/i;
  const pool = RiskModel.candidates(reg, base).filter(f => f.key !== out.key && !skip.test(f.label + ' ' + f.key));
  /* числовые и «да/нет» предикторы дают по одному коэффициенту: на учебной выборке так модель читается проще */
  const simple = f => ['number', 'calc', 'yesno'].includes(f.type) || (f.type === 'select' && (f.options || []).length <= 2);
  const preds = [...pool.filter(simple), ...pool.filter(f => !simple(f))].slice(0, 2).map(f => f.key);
  Object.assign(cfg, { outForm: cfg.base, outKey: out.key, events: ['да'], mode: 'fit', preds });
  await App.route();
  await TrainingGuide.until(() => $('#rmRun'));
  $('#rmRun')?.click();
};
if (typeof TRAINING_CHAPTERS !== 'undefined' && typeof TrainingGuide === 'object') {
  const end = TRAINING_CHAPTERS.findIndex(c => c.id === 'end');
  TRAINING_CHAPTERS.splice(end < 0 ? TRAINING_CHAPTERS.length : end, 0,
    { id: 'riskmodel', name: 'Модель риска', page: 'riskmodel', go: 'riskmodel', steps: [
      { t: '#rmSetup', title: 'Модель риска', text: 'Выберите, что считается одним случаем (обычно операция), где записан исход и что считать событием. «Построить свою модель» подбирает логистическую регрессию по выбранным предикторам. «Проверить готовую модель» показывает, насколько формула вроде P-POSSUM точна на ваших пациентах.' },
      { t: '#rmOutBox', act: async () => { await RiskModel.trainingDemo(); await TrainingGuide.until(() => $('#rmOutBox') && $('#rmOutBox').textContent.length > 120, 8000); }, title: 'Результат', text: 'Гайд выбрал исход «повторная операция», два предиктора и нажал «Рассчитать». В учебной базе мало пациентов, поэтому модель помечена как ненадёжная: на реальных данных нужно больше событий. C-статистика показывает, различает ли модель пациентов с исходом и без. Калибровка показывает, совпадает ли прогноз с тем, что произошло: O/E, наклон и таблица по группам. Поправка на оптимизм бутстрепом показывает, какой точности ждать на новых пациентах. Если событий на один предиктор меньше 10, модель ненадёжна.' }
    ] });
  TrainingGuide.steps = TRAINING_CHAPTERS.flatMap((chapter, c) => chapter.steps.map((step, i) => ({ ...step, chapter, c, i })));
}
