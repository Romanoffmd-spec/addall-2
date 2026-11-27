/* AddAll 2.0: анализ выживаемости до уровня публикации.
   Методы (только опубликованные, сверены с R пакетом survival в dev-tests/stats_check.js):
   - Каплан-Майер с 95% ДИ по Гринвуду в log-log преобразовании (как SAS и Stata по умолчанию, в R conf.type = "log-log");
   - 95% ДИ медианы по Brookmeyer R, Crowley J. Biometrics 1982;38:29-41: границы там, где доверительные кривые пересекают 50%
     (так считает R quantile.survfit; на шкале log совпадает с R survfit по умолчанию, проверено на наборе aml);
   - таблица «число под риском» под кривой;
   - регрессия Кокса: частичное правдоподобие с поправкой Эфрона на совпадающие времена (Efron B. JASA 1977;72:557-565),
     метод Ньютона-Рафсона, ДИ и p по Вальду, критерий отношения правдоподобия; как coxph по умолчанию;
   - проверка пропорциональности рисков: корреляция масштабированных остатков Шёнфельда со временем
     (Grambsch PM, Therneau TM. Biometrika 1994;81:515-526), приближённый вариант (как cox.zph в R до версии 3.0, время без преобразования);
   - конкурирующие риски: кумулятивная частота события по Аалену-Йохансену (Kalbfleisch JD, Prentice RL, 2002),
     без доверительных интервалов и критерия Грея: для них выгрузите данные в R (cmprsk::cuminc).
   Подключается после modules.js и biostat.js. */
'use strict';

Object.assign(Stats, {
  /* обращение матрицы методом Гаусса с выбором главного элемента */
  inv(A) {
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
  /* доверительная полоса Каплана-Майера в каждой точке события */
  /* transform: 'loglog' (по умолчанию в AddAll, SAS и Stata) или 'log' (по умолчанию в R survfit) */
  kmBand(km, transform = 'loglog') {
    let g = 0;
    return km.pts.filter(p => p.ev).map(p => {
      if (p.n > p.ev) g += p.ev / (p.n * (p.n - p.ev)); else g = Infinity;
      if (p.s <= 0 || p.s >= 1 || !isFinite(g)) return { t: p.t, s: p.s, lo: p.s <= 0 ? 0 : null, hi: p.s <= 0 ? 0 : null };
      if (transform === 'log') return { t: p.t, s: p.s, lo: p.s * Math.exp(-Z975 * Math.sqrt(g)), hi: Math.min(1, p.s * Math.exp(Z975 * Math.sqrt(g))) };
      const se = Math.sqrt(g) / Math.abs(Math.log(p.s));
      return { t: p.t, s: p.s, lo: Math.pow(p.s, Math.exp(Z975 * se)), hi: Math.pow(p.s, Math.exp(-Z975 * se)) };
    });
  },
  /* медиана и её 95% ДИ (Brookmeyer-Crowley через log-log полосу) */
  kmMedian(km, transform = 'loglog') {
    const band = this.kmBand(km, transform);
    const first = test => band.find(test)?.t ?? null;
    const at = band.findIndex(b => b.s <= 0.5);
    let median = at < 0 ? null : band[at].t;
    /* как в R: если кривая ровно 50% на отрезке, медиана посередине до следующего события */
    if (at >= 0 && Math.abs(band[at].s - 0.5) < 1e-12 && band[at + 1]) median = (band[at].t + band[at + 1].t) / 2;
    return { median, lo: first(b => b.lo != null && b.lo <= 0.5), hi: first(b => b.hi != null && b.hi <= 0.5) };
  },
  atRisk(data, times) { return times.map(t => data.filter(x => x.t >= t).length); },

  /* регрессия Кокса, поправка Эфрона. rows: [{ t, e, x: [..] }] */
  cox(rows, maxIter = 50) {
    const d = rows.filter(r => r.t != null && r.t >= 0 && r.x.every(v => Number.isFinite(v))).sort((a, b) => a.t - b.t);
    const n = d.length, p = d[0]?.x.length || 0;
    if (!n || !p) return null;
    /* центрирование, как в coxph: не меняет коэффициенты, улучшает устойчивость */
    const mean = Array.from({ length: p }, (_, j) => d.reduce((s, r) => s + r.x[j], 0) / n);
    const X = d.map(r => r.x.map((v, j) => v - mean[j]));
    const times = [...new Set(d.filter(r => r.e).map(r => r.t))];
    const zero = () => new Array(p).fill(0), zero2 = () => Array.from({ length: p }, () => new Array(p).fill(0));
    const evaluate = beta => {
      const w = X.map(x => Math.exp(x.reduce((s, v, j) => s + v * beta[j], 0)));
      let ll = 0; const U = zero(), I = zero2();
      for (const time of times) {
        let S0 = 0, D0 = 0; const S1 = zero(), D1 = zero(), S2 = zero2(), D2 = zero2();
        const deaths = [];
        for (let i = 0; i < n; i++) {
          if (d[i].t < time) continue;
          S0 += w[i];
          for (let j = 0; j < p; j++) { S1[j] += w[i] * X[i][j]; for (let k = 0; k < p; k++) S2[j][k] += w[i] * X[i][j] * X[i][k]; }
          if (d[i].t === time && d[i].e) deaths.push(i);
        }
        for (const i of deaths) {
          D0 += w[i]; ll += Math.log(w[i]);
          for (let j = 0; j < p; j++) { U[j] += X[i][j]; D1[j] += w[i] * X[i][j]; for (let k = 0; k < p; k++) D2[j][k] += w[i] * X[i][j] * X[i][k]; }
        }
        const m = deaths.length;
        for (let l = 0; l < m; l++) {
          const f = l / m, s0 = S0 - f * D0;
          const s1 = S1.map((v, j) => v - f * D1[j]);
          ll -= Math.log(s0);
          for (let j = 0; j < p; j++) {
            U[j] -= s1[j] / s0;
            for (let k = 0; k < p; k++) I[j][k] += (S2[j][k] - f * D2[j][k]) / s0 - s1[j] * s1[k] / (s0 * s0);
          }
        }
      }
      return { ll, U, I };
    };
    let beta = zero(), cur = evaluate(beta);
    const ll0 = cur.ll;
    let converged = false, it = 0;
    for (; it < maxIter; it++) {
      const inv = Stats.inv(cur.I);
      if (!inv) break;
      const step = inv.map(r => r.reduce((s, v, j) => s + v * cur.U[j], 0));
      let factor = 1, next, trial;
      do { trial = beta.map((b, j) => b + factor * step[j]); next = evaluate(trial); factor /= 2; } while (next.ll < cur.ll - 1e-10 && factor > 1e-6);
      const change = Math.abs(next.ll - cur.ll);
      beta = trial; cur = next;
      if (change < 1e-9) { converged = true; break; }
    }
    const cov = Stats.inv(cur.I);
    const se = cov ? cov.map((r, j) => Math.sqrt(Math.max(0, r[j]))) : beta.map(() => null);
    const lr = 2 * (cur.ll - ll0);
    return { beta, se, cov, ll: cur.ll, ll0, lr, lrP: this.chi2p(lr, p), n, events: d.filter(r => r.e).length, converged, iterations: it + 1,
      separated: !converged || beta.some(b => Math.abs(b) > 10), zph: this.zph(d, X, beta, cov, times) };
  },

  /* проверка пропорциональности: масштабированные остатки Шёнфельда против времени (Grambsch-Therneau) */
  zph(d, X, beta, cov, times) {
    if (!cov) return null;
    const p = beta.length, w = X.map(x => Math.exp(x.reduce((s, v, j) => s + v * beta[j], 0)));
    const res = [], tt = [];
    for (const time of times) {
      let S0 = 0; const S1 = new Array(p).fill(0);
      for (let i = 0; i < d.length; i++) if (d[i].t >= time) { S0 += w[i]; for (let j = 0; j < p; j++) S1[j] += w[i] * X[i][j]; }
      for (let i = 0; i < d.length; i++) if (d[i].t === time && d[i].e) { res.push(X[i].map((v, j) => v - S1[j] / S0)); tt.push(time); }
    }
    const m = res.length;
    if (m < 3) return null;
    const tbar = tt.reduce((s, v) => s + v, 0) / m, tc = tt.map(v => v - tbar), tss = tc.reduce((s, v) => s + v * v, 0);
    if (!tss) return null;
    return beta.map((_, j) => {
      /* масштабированный остаток: m * V^-1 r + beta; для одного ковариата это m * var(beta) * r + beta */
      const scaled = res.map(r => m * r.reduce((s, v, k) => s + cov[j][k] * v, 0) + beta[j]);
      const num = scaled.reduce((s, v, i) => s + (v - beta[j]) * tc[i], 0);
      const chi = (num * num) / (m * cov[j][j] * tss);
      return { chi, p: this.chi2p(chi, 1) };
    });
  },

  /* кумулятивная частота события 1 при конкурирующем событии 2 (Аален-Йохансен). data: [{ t, type: 0|1|2 }] */
  cif(data) {
    const d = data.filter(x => x.t != null && x.t >= 0).sort((a, b) => a.t - b.t);
    let n = d.length, S = 1, F = 0;
    const pts = [{ t: 0, f: 0, n }], steps = [];
    for (const t of [...new Set(d.map(x => x.t))]) {
      const at = d.filter(x => x.t === t), d1 = at.filter(x => x.type === 1).length, d2 = at.filter(x => x.type === 2).length;
      if (d1 || d2) {
        steps.push({ t, n, d1, d2, Sprev: S });
        F += S * d1 / n;
        S *= 1 - (d1 + d2) / n;
        if (d1) pts.push({ t, f: F, n });
      }
      n -= at.length;
    }
    const value = tt => { let v = 0; pts.forEach(p => { if (p.t <= tt) v = p.f; }); return v; };
    return { pts, n: d.length, events: d.filter(x => x.type === 1).length, competing: d.filter(x => x.type === 2).length, value, maxT: d.length ? d[d.length - 1].t : 0 };
  }
});

const Survival = {
  /* сроки для таблицы «число под риском» */
  ticks(maxT) {
    const step = maxT > 72 ? 24 : maxT > 30 ? 12 : maxT > 12 ? 6 : maxT > 4 ? 2 : maxT > 1 ? 0.5 : 0.25;
    const out = []; for (let t = 0; t <= maxT + 1e-9 && out.length < 10; t += step) out.push(Math.round(t * 100) / 100);
    return out;
  },
  /* наблюдение по пациентам: время от своей точки отсчёта (у каждого своя дата) до события или последнего контакта, мес */
  data(ds, reg, c, pts, efOK, keyOf = () => 'Все') {
    const rows = [];
    const analysisDay = today();
    const deathKeys = reg.eventTypes.flatMap(e => formFields(e)).filter(f => f.type === 'date' && /смерт|death/i.test(f.label + ' ' + f.key)).map(f => f.key);
    for (const p of ds.patients.filter(p => pts.has(p.id))) {
      const pe = ds.events.filter(e => e.patientId === p.id);
      const start = pe.filter(e => e.type === c.et && e.date && efOK(computeValues(reg, p, etById(reg, c.et), e.data, e.date)[c.efkey])).sort((a, b) => a.date.localeCompare(b.date))[0];
      if (!start) continue;
      const dateOf = key => {
        if (!key) return null;
        if (key === '_death') {
          /* смерть: дата в карточке или в любом поле «Дата смерти» форм пациента */
          const dates = [p.deathDate, ...pe.flatMap(e => deathKeys.map(k => e.data?.[k]))].filter(v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && v >= start.date).sort();
          return dates[0] || null;
        }
        let found = null; pe.forEach(e => { const v = e.data?.[key]; if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && v >= start.date && (!found || v < found)) found = v; });
        return found;
      };
      const last = [p.deathDate, ...pe.map(e => e.date), ...pe.flatMap(e => Object.values(e.data || {}).filter(v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)))]
        .filter(v => v && v <= analysisDay).sort().pop() || start.date;
      const event = dateOf(c.end), competing = c.comp ? dateOf(c.comp) : null;
      let type = 0, until = last;
      if (event && (!competing || event <= competing)) { type = 1; until = event; }
      else if (competing) { type = 2; until = competing; }
      rows.push({ p, start, t: Math.max(0, daysBetween(start.date, until)) / 30.4375, e: type === 1 ? 1 : 0, type, last, group: keyOf(p, start) });
    }
    return rows;
  },
  /* неполное наблюдение: цензурированные без записи за последний год при живом или неизвестном статусе */
  lost(rows) {
    const yearAgo = addDays(today(), -365);
    const censored = rows.filter(r => !r.type);
    const lost = censored.filter(r => r.last < yearAgo && r.p.vital !== 'умер');
    return { censored: censored.length, lost: lost.length };
  },
  lostText(rows) {
    const { censored, lost } = this.lost(rows);
    if (!censored || lost / censored < 0.2) return '';
    return `У ${lost} из ${censored} пациентов без события последняя запись в регистре старше года. Для них неизвестно, что было дальше: если смерти или рецидивы не вносятся, кривая завышает выживаемость. Внесите наблюдение или статус «жив/умер» (раздел «Сведения о смерти»).`;
  },
  riskTable(groups) {
    const maxT = Math.max(...groups.map(g => Math.max(0, ...g.rows.map(r => r.t))));
    const ticks = this.ticks(maxT);
    return `<h3>Число под риском</h3><table class="tbl small" id="kmAtRisk"><thead><tr><th>Группа</th>${ticks.map(t => `<th>${String(t).replace('.', ',')} мес</th>`).join('')}</tr></thead>
      <tbody>${groups.map(g => `<tr><td><b>${esc(g.name)}</b></td>${Stats.atRisk(g.rows, ticks).map(n => `<td>${n}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  },
  months: v => v == null ? 'не достигнута' : String(Math.round(v * 10) / 10).replace('.', ','),
  pct: v => v == null ? '' : String(Math.round(v * 1000) / 10).replace('.', ',') + '%',

  cfg: {
    cox({ c, reg, etOpts, fOpts, dateFields }) {
      const cands = formFields(etById(reg, c.et) || {}).filter(f => ['number', 'calc', 'yesno', 'select'].includes(f.type));
      const chosen = String(c.cov || '').split(',').filter(Boolean);
      return `<label class="flab">Точка отсчёта (время 0 у каждого пациента своё)</label><select class="inp" data-k="et">${etOpts(c.et)}</select>
        <label class="flab">Событие (дата)</label><select class="inp" data-k="end">${Survival.endOptions(dateFields, c.end)}</select>
        <label class="flab">Факторы (из формы точки отсчёта)</label><div class="chips" id="coxCov">
        ${[{ key: '_age', label: 'Возраст на дату отсчёта, лет' }, { key: '_sex', label: 'Пол: мужской' }, ...cands].map(f => `<label class="chip"><input type="checkbox" value="${esc(f.key)}" ${chosen.includes(f.key) ? 'checked' : ''}>${esc(f.label)}</label>`).join('')}</div>
        <input type="hidden" data-k="cov" id="coxCovVal" value="${esc(c.cov || '')}">
        <div class="help">Отношение рисков (HR) каждого фактора с поправкой на остальные. Выбирайте факторы заранее, по клиническому смыслу: на одно событие нужно около 10 событий на фактор.</div>`;
    },
    cif({ c, reg, etOpts, dateFields }) {
      if (!c.end || c.end === '_death') c.end = (dateFields.find(f => /рецидив|прогресс|метастаз/i.test(f.label)) || dateFields[0])?.key || '';
      if (!c.comp) c.comp = '_death';
      return `<label class="flab">Точка отсчёта</label><select class="inp" data-k="et">${etOpts(c.et)}</select>
        <label class="flab">Интересующее событие (дата)</label><select class="inp" data-k="end">${Survival.endOptions(dateFields, c.end)}</select>
        <label class="flab">Конкурирующее событие (дата)</label><select class="inp" data-k="comp">${Survival.endOptions(dateFields, c.comp || '_death')}</select>
        <div class="help">Например: событие «рецидив», конкурирующее «смерть». Пациент, умерший без рецидива, уже не может получить рецидив, поэтому его нельзя просто цензурировать: 1 минус Каплан-Майер завысит частоту рецидива.</div>`;
    }
  },
  endOptions(dateFields, sel) {
    return `<option value="_death" ${sel === '_death' ? 'selected' : ''}>Смерть (дата смерти в карточке пациента)</option>`
      + dateFields.map(f => `<option value="${f.key}" ${sel === f.key ? 'selected' : ''}>${esc(f.etName)} › ${esc(f.label)}</option>`).join('');
  },

  run: {
    cox({ ds, reg, c, pts, efOK }) {
      const keys = String(c.cov || '').split(',').filter(Boolean);
      if (!c.end) throw new Error('Выберите дату события');
      if (!keys.length) throw new Error('Отметьте хотя бы один фактор');
      const startForm = etById(reg, c.et);
      const fields = formFields(startForm || {});
      const rows = Survival.data(ds, reg, c, pts, efOK);
      const vals = rows.map(r => computeValues(reg, r.p, startForm, r.start.data, r.start.date));
      /* кодирование: число как есть, да/нет 1/0, список индикаторами против самого частого значения */
      const terms = [];
      for (const key of keys) {
        if (key === '_age') { terms.push({ label: 'Возраст, на 1 год', get: i => rows[i].p.birthDate ? daysBetween(rows[i].p.birthDate, rows[i].start.date) / 365.25 : null }); continue; }
        if (key === '_sex') { terms.push({ label: 'Пол: мужской (против женского)', get: i => rows[i].p.sex === 'М' ? 1 : rows[i].p.sex === 'Ж' ? 0 : null }); continue; }
        const f = fields.find(x => x.key === key); if (!f) continue;
        const raw = i => vals[i][key];
        const known = v => !isEmpty(v) && v !== 'неизвестно';
        if (f.type === 'yesno') terms.push({ label: f.label + ': да', get: i => raw(i) === 'да' ? 1 : raw(i) === 'нет' ? 0 : null });
        else if (f.type === 'select') {
          const cnt = {}; rows.forEach((r, i) => { const v = raw(i); if (known(v)) cnt[v] = (cnt[v] || 0) + 1; });
          const levels = Object.entries(cnt).sort((a, b) => b[1] - a[1]).map(x => x[0]);
          for (const lv of levels.slice(1, 6)) terms.push({ label: `${f.label}: ${lv} (против «${levels[0]}»)`, get: i => known(raw(i)) ? (String(raw(i)) === lv ? 1 : 0) : null });
        } else terms.push({ label: f.label + (f.unit ? ', на 1 ' + f.unit : ''), get: i => { const v = raw(i); if (!known(v)) return null; const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; } });
      }
      if (!terms.length) throw new Error('Выбранные факторы не подходят: у списка должно быть хотя бы два значения');
      const data = rows.map((r, i) => ({ t: r.t, e: r.e, x: terms.map(term => term.get(i)) }));
      const used = data.filter(r => r.x.every(v => v != null && Number.isFinite(v)));
      const fit = Stats.cox(used);
      const events = used.filter(r => r.e).length;
      const head = `<div class="card"><h2>Регрессия Кокса</h2><p>Пациентов с точкой отсчёта: <b>${rows.length}</b>. В модели (все факторы заполнены): <b>${used.length}</b>, событий <b>${events}</b>. Исключено из-за пропусков: <b>${rows.length - used.length}</b>.</p>`;
      if (!fit || events < 5) return head + '<p class="bad">Слишком мало событий для модели.</p></div>';
      const warn = [];
      if (typeof TRAIN !== 'undefined' && TRAIN) warn.push('Учебные данные: результат не имеет клинического смысла.');
      if (events / terms.length < 10) warn.push(`Событий на один параметр ${String(Math.round(events / terms.length * 10) / 10).replace('.', ',')}: меньше 10, оценки неустойчивы (Peduzzi и соавт., 1995).`);
      if (fit.separated) warn.push('Модель не сошлась или есть почти полное разделение: коэффициенты ненадёжны.');
      const lost = Survival.lostText(rows.filter((r, i) => data[i].x.every(v => v != null && Number.isFinite(v))));
      if (lost) warn.push(lost);
      const z = Z975, f2 = v => String(Math.round(v * 100) / 100).replace('.', ',');
      const zphBad = (fit.zph || []).map((x, j) => x && x.p < 0.05 ? terms[j].label : null).filter(Boolean);
      if (zphBad.length) warn.push('Риск может меняться со временем (непропорциональность, p < 0,05): ' + zphBad.join('; ') + '. Отношение рисков для этих факторов усреднено по времени.');
      const table = terms.map((term, j) => {
        const b = fit.beta[j], se = fit.se[j], p = se ? 2 * (1 - Stats.ncdf(Math.abs(b / se))) : null;
        return `<tr><td>${esc(term.label)}</td><td>${f2(Math.exp(b))}</td><td>${se ? f2(Math.exp(b - z * se)) + '-' + f2(Math.exp(b + z * se)) : ''}</td><td>${p == null ? '' : p < 0.001 ? '<0,001' : String(Math.round(p * 1000) / 1000).replace('.', ',')}</td><td>${fit.zph?.[j] ? String(Math.round(fit.zph[j].p * 1000) / 1000).replace('.', ',') : ''}</td></tr>`;
      }).join('');
      return head + (warn.length ? `<div class="warnt">${warn.map(w => '<p>' + esc(w) + '</p>').join('')}</div>` : '')
        + `<table class="tbl" id="coxTable"><thead><tr><th>Фактор</th><th>HR</th><th>95% ДИ</th><th>p</th><th>p пропорциональности</th></tr></thead><tbody>${table}</tbody></table>
        <p>Критерий отношения правдоподобия: χ² = ${f2(fit.lr)}, df = ${terms.length}, p = ${fit.lrP < 0.001 ? '<0,001' : String(Math.round(fit.lrP * 1000) / 1000).replace('.', ',')}.</p>
        <p class="muted small">HR больше 1: фактор повышает риск события, меньше 1: снижает. Совпадающие времена учтены по Эфрону, как в R coxph. Пропорциональность проверена по остаткам Шёнфельда (Grambsch, Therneau 1994).</p></div>`;
    },
    cif({ ds, reg, c, pts, efOK, users }) {
      if (!c.end || !c.comp) throw new Error('Выберите событие и конкурирующее событие');
      if (c.end === c.comp) throw new Error('Событие и конкурирующее событие должны различаться');
      const rows = Survival.data(ds, reg, c, pts, efOK);
      if (!rows.length) throw new Error('Нет пациентов с точкой отсчёта');
      const res = Stats.cif(rows.map(r => ({ t: r.t, type: r.type })));
      const svg = Chart.line('Кумулятивная частота события', [{ n: '', step: true, pts: res.pts.map(p => ({ x: p.t, y: p.f * 100 })), extendTo: res.maxT }], { step: true, xl: 'Месяцы', yl: '%', ymin: 0, ymax: 100, xmin: 0, xmax: res.maxT || 1 });
      const at = m => m > res.maxT ? 'нет наблюдения' : Survival.pct(res.value(m));
      const warn = [];
      if (typeof TRAIN !== 'undefined' && TRAIN) warn.push('Учебные данные: результат не имеет клинического смысла.');
      const lost = Survival.lostText(rows); if (lost) warn.push(lost);
      return (warn.length ? `<div class="card warnt">${warn.map(w => '<p>' + esc(w) + '</p>').join('')}</div>` : '') + chartBox('cumulative_incidence', svg)
        + `<div class="card"><table class="tbl" id="cifTable"><thead><tr><th>n</th><th>Событий</th><th>Конкурирующих</th><th>12 мес</th><th>36 мес</th><th>60 мес</th></tr></thead>
        <tbody><tr><td>${res.n}</td><td>${res.events}</td><td>${res.competing}</td><td>${at(12)}</td><td>${at(36)}</td><td>${at(60)}</td></tr></tbody></table>
        ${Survival.riskTable([{ name: 'Все', rows }])}
        <p class="muted small">Кумулятивная частота по Аалену-Йохансену. Доверительные интервалы и сравнение групп критерием Грея AddAll пока не считает: для статьи выгрузите данные в R (cmprsk::cuminc).</p></div>`;
    }
  }
};

ANALYSES.cox = 'Регрессия Кокса (отношение рисков)';
ANALYSES.cif = 'Конкурирующие риски (кумулятивная частота)';

/* учебный сценарий «Отдалённые результаты»: операции разнесены по 6 годам, наблюдение раз в полгода до смерти,
   выбытия или сегодняшнего дня, смерть и рецидив зависят от возраста и тяжести (первое поле-список формы отсчёта).
   Так в учебной базе кривые Каплана-Майера, модель Кокса и конкурирующие риски показывают осмысленную картину. */
if (typeof SYN === 'object') {
  const make = SYN.make.bind(SYN);
  SYN.make = async function (reg, n, scenario) {
    if (scenario !== 'survival') return make(reg, n, scenario);
    const before = new Set((await DB.all('patients')).map(p => p.id));
    const count = await make(reg, n, 'regular');
    const fresh = (await DB.all('patients')).filter(p => !before.has(p.id) && p.registryId === reg.id);
    const all = await DB.all('events');
    const startType = Episodes.isPatient(reg) ? reg.episode?.anchorForm || reg.eventTypes[0]?.id : Episodes.opener(reg);
    const startForm = etById(reg, startType);
    const severity = formFields(startForm || {}).find(f => f.type === 'select' && (f.options || []).length >= 2);
    const fuForm = reg.eventTypes.find(e => /наблюд|follow|контрол/i.test(e.name + ' ' + e.id));
    const dateKey = rx => reg.eventTypes.flatMap(e => formFields(e).map(f => ({ ...f, et: e.id }))).filter(f => f.type === 'date' && rx.test(f.label + ' ' + f.key));
    const deathFields = dateKey(/смерт|death/i), recurFields = dateKey(/рецидив|recur|прогресс/i);
    const recurOnFu = recurFields.find(f => f.et === fuForm?.id);
    const isDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
    const expo = median => -Math.log(1 - Math.random()) * median / Math.LN2;
    const end = today();
    for (const p of fresh) {
      const own = all.filter(e => e.patientId === p.id);
      const start = own.find(e => e.type === startType);
      if (!start) continue;
      /* сдвиг всей истории назад на 0-6 лет */
      const shift = -Math.floor(Math.random() * 6 * 365);
      for (const e of own) {
        e.date = addDays(e.date, shift);
        for (const [k, v] of Object.entries(e.data || {})) if (isDate(v)) e.data[k] = addDays(v, shift);
        for (const f of [...deathFields, ...recurFields]) delete e.data?.[f.key];
        if (e.followDue) e.followDue = addDays(e.followDue, shift);
        if (e.out30CheckedOn) e.out30CheckedOn = addDays(e.out30CheckedOn, shift);
        await DB.rawPut('events', e);
      }
      const age = p.birthDate ? daysBetween(p.birthDate, start.date) / 365.25 : 60;
      const level = severity ? Math.max(0, (severity.options || []).map(o => typeof o === 'object' ? o.v ?? o.value ?? o.l : o).indexOf(start.data?.[severity.key])) : 0;
      const hr = Math.exp(0.035 * (age - 60) + 0.45 * level);
      const deathAt = addDays(start.date, Math.round(expo(8 * 365) / hr));
      const recurAt = addDays(start.date, Math.round(expo(6 * 365) / hr));
      const lostAt = Math.random() < 0.12 ? addDays(start.date, Math.round(Math.random() * 4 * 365)) : end;
      const stop = [deathAt, lostAt, end].sort()[0];
      if (deathAt <= stop && deathAt <= end) await DB.put('patients', { ...(await DB.get('patients', p.id)), vital: 'умер', deathDate: deathAt }, 'учебный пациент: дата смерти');
      if (fuForm) {
        let anchor = Episodes.isPatient(reg) ? null : start.id;
        for (let visit = addDays(start.date, 182), k = 0; visit <= stop && k < 14; visit = addDays(visit, 182), k++) {
          const data = SYN.fill(formFields(fuForm).filter(f => f.type !== 'date' || !/смерт|death|рецидив|recur|прогресс/i.test(f.label + ' ' + f.key)), { date: visit, users: [], people: [], patient: p });
          if (recurOnFu && recurAt <= visit && recurAt > addDays(visit, -182)) data[recurOnFu.key] = recurAt;
          await DB.put('events', { patientId: p.id, registryId: reg.id, type: fuForm.id, date: visit, data, status: 'завершено', schemaVersion: reg.version, ownerId: Auth.user.id, synthetic: true, ...(anchor ? { anchorEventId: anchor } : {}) }, 'учебное наблюдение');
        }
      }
    }
    return count;
  };
  const training = Routes.training;
  Routes.training = async (main, ...rest) => {
    await training(main, ...rest);
    const select = $('#trScenario', main);
    if (select && !select.querySelector('[value="survival"]')) select.add(new Option('Отдалённые результаты: 6 лет наблюдения, выживаемость', 'survival'));
  };
}
