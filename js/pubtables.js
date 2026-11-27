/* AddAll 2.0: материалы для статьи.
   «Таблица 1» (исходные характеристики по группам с p и стандартизованной разностью),
   схема отбора когорты по STROBE и выгрузка таблиц любого анализа в Word.
   Подключается после survival.js: использует его точки подключения Survival.cfg и Survival.run. */
'use strict';

Object.assign(Stats, {
  /* регуляризованная неполная бета-функция I_x(a, b): цепная дробь Ленца (Numerical Recipes, 6.4) */
  ibeta(x, a, b) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const front = Math.exp(this.lgamma(a + b) - this.lgamma(a) - this.lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    const cf = (x, a, b) => {
      const tiny = 1e-300; let c = 1, d = 1 - (a + b) * x / (a + 1);
      if (Math.abs(d) < tiny) d = tiny;
      d = 1 / d; let h = d;
      for (let m = 1; m <= 300; m++) {
        const m2 = 2 * m;
        let aa = m * (b - m) * x / ((a + m2 - 1) * (a + m2));
        d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny; c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny; d = 1 / d; h *= d * c;
        aa = -(a + m) * (a + b + m) * x / ((a + m2) * (a + m2 + 1));
        d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny; c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny; d = 1 / d;
        const del = d * c; h *= del;
        if (Math.abs(del - 1) < 1e-14) break;
      }
      return h;
    };
    return x < (a + 1) / (a + b + 2) ? front * cf(x, a, b) / a : 1 - front * cf(1 - x, b, a) / b;
  },
  /* двусторонний p для t-распределения */
  tp(t, df) { return df > 0 ? this.ibeta(df / (df + t * t), df / 2, 0.5) : null; },
  /* t-критерий Уэлча (как R t.test по умолчанию) */
  welch(a, b) {
    if (a.length < 2 || b.length < 2) return null;
    const va = this.sd(a) ** 2 / a.length, vb = this.sd(b) ** 2 / b.length;
    if (!(va + vb > 0)) return null;
    const t = (this.mean(a) - this.mean(b)) / Math.sqrt(va + vb);
    const df = (va + vb) ** 2 / (va * va / (a.length - 1) + vb * vb / (b.length - 1));
    return { t, df, p: this.tp(t, df) };
  },
  /* однофакторный дисперсионный анализ (R oneway.test(var.equal = TRUE), aov) */
  anova(groups) {
    groups = groups.filter(g => g.length);
    const all = groups.flat(), N = all.length, k = groups.length;
    if (k < 2 || N <= k) return null;
    const m = this.mean(all);
    const ssb = groups.reduce((s, g) => s + g.length * (this.mean(g) - m) ** 2, 0);
    const ssw = groups.reduce((s, g) => { const mg = this.mean(g); return s + g.reduce((t, x) => t + (x - mg) ** 2, 0); }, 0);
    const df1 = k - 1, df2 = N - k;
    if (!(ssw > 0)) return null;
    const F = ssb / df1 / (ssw / df2);
    return { F, df1, df2, p: this.ibeta(df2 / (df2 + df1 * F), df2 / 2, df1 / 2) };
  },
  /* χ² Пирсона для таблицы r×c; для 2×2 с поправкой Йейтса, как R chisq.test по умолчанию */
  chi2table(m) {
    m = m.filter(r => r.some(x => x > 0));
    const cols = m[0] ? m[0].map((_, j) => j).filter(j => m.some(r => r[j] > 0)) : [];
    m = m.map(r => cols.map(j => r[j]));
    const R = m.length, C = cols.length;
    if (R < 2 || C < 2) return null;
    const rt = m.map(r => r.reduce((s, x) => s + x, 0)), ct = cols.map((_, j) => m.reduce((s, r) => s + r[j], 0)), N = rt.reduce((s, x) => s + x, 0);
    const yates = R === 2 && C === 2;
    let chi = 0, low = 0;
    m.forEach((r, i) => r.forEach((o, j) => {
      const e = rt[i] * ct[j] / N;
      if (e < 5) low++;
      const d = yates ? Math.max(0, Math.abs(o - e) - Math.min(0.5, Math.abs(o - e))) : Math.abs(o - e);
      chi += d * d / e;
    }));
    const df = (R - 1) * (C - 1);
    return { chi, df, p: this.chi2p(chi, df), lowShare: low / (R * C), yates, m };
  }
});

const PubTables = {
  L: {
    ru: { total: 'Всего', variable: 'Показатель', mean: 'среднее ± SD', median: 'медиана (IQR)', n: 'n (%)', missing: 'нет данных', smd: 'SMD',
      age: 'Возраст, лет', sex: 'Пол', male: 'мужской', female: 'женский', title: 'Таблица 1. Исходная характеристика пациентов' },
    en: { total: 'Overall', variable: 'Characteristic', mean: 'mean ± SD', median: 'median (IQR)', n: 'n (%)', missing: 'missing', smd: 'SMD',
      age: 'Age, years', sex: 'Sex', male: 'male', female: 'female', title: 'Table 1. Baseline characteristics' }
  },
  num(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (isEmpty(v)) return null;
    const n = Number(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  },
  fmt(x, d, lang) { if (x == null || !Number.isFinite(x)) return ''; const s = x.toFixed(d); return lang === 'en' ? s : s.replace('.', ','); },
  pFmt(p, lang) {
    if (p == null || !Number.isFinite(p)) return '';
    const s = p < 0.001 ? '<0.001' : p.toFixed(3);
    return lang === 'en' ? s : s.replace('.', ',');
  },
  decimals(values) {
    const d = Math.max(0, ...values.slice(0, 500).map(v => { const s = String(v); const i = s.indexOf('.'); return i < 0 ? 0 : Math.min(2, s.length - i - 1); }));
    return Math.min(2, d);
  },

  /* кандидаты: факторы карточки и формы точки отсчёта */
  candidates(reg, et) {
    const pick = f => ['number', 'integer', 'calc', 'select', 'yesno', 'multiselect'].includes(f.type);
    const list = [{ key: '_age', label: 'Возраст', type: 'number' }, { key: '_sex', label: 'Пол', type: 'select', options: ['М', 'Ж'] }];
    for (const f of (reg.patientFields || []).filter(pick)) list.push({ ...f, key: '_p:' + f.key });
    if (et && et !== '_p') for (const f of formFields(etById(reg, et)).filter(pick)) list.push(f);
    return list;
  },
  groupCandidates(reg, et) {
    return this.candidates(reg, et).filter(f => ['select', 'yesno'].includes(f.type) || f.key === '_sex');
  },

  /* строки анализа: одна строка на пациента, первая форма точки отсчёта после отбора */
  rows(ds, reg, et, pts, efOK, efkey) {
    const form = et && et !== '_p' ? etById(reg, et) : null;
    const out = [];
    for (const p of ds.patients) {
      if (!pts.has(p.id)) continue;
      let date = today(), v = {};
      if (form) {
        const evs = ds.events.filter(e => e.patientId === p.id && e.type === et).sort((a, b) => String(a.date).localeCompare(String(b.date)));
        const hit = evs.map(e => ({ e, v: computeValues(reg, p, form, e.data, e.date) })).find(x => efOK(x.v[efkey]));
        if (!hit) continue;
        date = hit.e.date || date; v = hit.v;
      }
      out.push({ p, date, v });
    }
    return out;
  },
  value(row, key) {
    if (key === '_age') return row.p.birthDate && calendarDay(String(row.p.birthDate)) ? daysBetween(row.p.birthDate, String(row.date).slice(0, 10)) / 365.25 : null;
    if (key === '_sex') return row.p.sex || null;
    if (key.startsWith('_p:')) return row.p.data?.[key.slice(3)] ?? null;
    return row.v[key] ?? null;
  },
  missing(v) { return isEmpty(v) || v === 'неизвестно' || Array.isArray(v) && !v.length; },

  /* собственно «Таблица 1»: { head, rows: [{label, cells, p, test, smd, indent}], notes } */
  build(rows, groupKey, vars, opts = {}) {
    const lang = opts.lang || 'ru', L = this.L[lang], numMode = opts.num || 'median';
    const gv = r => { const v = this.value(r, groupKey); return this.missing(v) ? null : String(v); };
    const used = rows.filter(r => gv(r) != null);
    const groupField = vars.all.find(f => f.key === groupKey);
    const order = groupField?.type === 'yesno' ? ['да', 'нет'] : groupField?.options?.length ? groupField.options : [];
    const names = [...new Set(used.map(gv))].sort((a, b) => (order.indexOf(a) + 1 || 999) - (order.indexOf(b) + 1 || 999) || a.localeCompare(b));
    const groups = names.map(n => used.filter(r => gv(r) === n));
    const two = names.length === 2;
    const show = n => groupKey === '_sex' ? (n === 'М' ? L.male : n === 'Ж' ? L.female : n) : n;
    const head = [L.variable, `${L.total} (n = ${used.length})`, ...names.map((n, i) => `${show(n)} (n = ${groups[i].length})`), 'p', ...(two ? [L.smd] : [])];
    const out = [], tests = new Set(), notes = [];
    const pct = (k, n) => n ? `${k} (${this.fmt(100 * k / n, 1, lang)})` : '0';
    for (const f of vars.chosen) {
      const label = f.key === '_age' ? L.age : f.key === '_sex' ? L.sex : f.label + (f.unit ? ', ' + f.unit : '');
      const vals = rs => rs.map(r => this.value(r, f.key));
      const miss = rs => vals(rs).filter(v => this.missing(v)).length;
      const missRow = () => { if (miss(used)) out.push({ label: L.missing, indent: true, cells: [String(miss(used)), ...groups.map(g => String(miss(g)))], p: '', smd: '' }); };
      if (['number', 'integer', 'calc'].includes(f.type) || f.key === '_age') {
        const nums = rs => vals(rs).map(v => this.num(v)).filter(v => v != null);
        const all = nums(used), gs = groups.map(nums);
        if (!all.length) continue;
        const d = f.key === '_age' ? 0 : this.decimals(all);
        const cell = a => !a.length ? '' : numMode === 'mean'
          ? `${this.fmt(Stats.mean(a), Math.min(2, d + 1), lang)} ± ${this.fmt(Stats.sd(a) ?? 0, Math.min(2, d + 1), lang)}`
          : `${this.fmt(Stats.q(a, 0.5), d, lang)} (${this.fmt(Stats.q(a, 0.25), d, lang)}${lang === 'en' ? '-' : '; '}${this.fmt(Stats.q(a, 0.75), d, lang)})`;
        let p = null, test = '';
        if (gs.filter(g => g.length).length >= 2) {
          if (numMode === 'mean') { const r = two ? Stats.welch(gs[0], gs[1]) : Stats.anova(gs); p = r?.p; test = two ? 'welch' : 'anova'; }
          else { const r = two ? Stats.mannWhitney(gs[0], gs[1]) : Stats.kruskal(gs.filter(g => g.length)); p = r?.p; test = two ? 'mw' : 'kw'; }
        }
        if (test) tests.add(test);
        let smd = '';
        if (two && gs[0].length > 1 && gs[1].length > 1) {
          const s = Math.sqrt(((Stats.sd(gs[0]) ** 2) + (Stats.sd(gs[1]) ** 2)) / 2);
          smd = s > 0 ? this.fmt(Math.abs(Stats.mean(gs[0]) - Stats.mean(gs[1])) / s, 2, lang) : '';
        }
        out.push({ label: `${label}, ${numMode === 'mean' ? L.mean : L.median}`, cells: [cell(all), ...gs.map(cell)], p: this.pFmt(p, lang), test, smd });
        missRow();
        continue;
      }
      /* категориальные: уровни по порядку словаря; да/нет одной строкой «да» */
      const levelsOf = () => {
        if (f.type === 'yesno') return ['да', 'нет'];
        const seen = [...new Set(vals(used).flat().filter(v => !this.missing(v)).map(String))];
        const ord = f.options || [];
        return seen.sort((a, b) => (ord.indexOf(a) + 1 || 999) - (ord.indexOf(b) + 1 || 999) || a.localeCompare(b));
      };
      const levels = levelsOf();
      if (!levels.length) continue;
      const known = rs => vals(rs).filter(v => !this.missing(v));
      const count = (rs, lv) => known(rs).filter(v => Array.isArray(v) ? v.map(String).includes(lv) : String(v) === lv).length;
      const catTest = m => {
        const t = Stats.chi2table(m);
        if (!t) return { p: null, test: '' };
        const flat = t.m.flat();
        if (t.m.length === 2 && t.m[0].length === 2 && t.lowShare > 0) return { p: Stats.fisher2x2(flat[0], flat[1], flat[2], flat[3]).p, test: 'fisher' };
        if (t.lowShare > 0.2) notes.push(label);
        return { p: t.p, test: t.yates ? 'chi2y' : 'chi2' };
      };
      const binSmd = (k1, n1, k2, n2) => {
        if (!n1 || !n2) return '';
        const p1 = k1 / n1, p2 = k2 / n2, s = Math.sqrt((p1 * (1 - p1) + p2 * (1 - p2)) / 2);
        return s > 0 ? this.fmt(Math.abs(p1 - p2) / s, 2, lang) : this.fmt(0, 2, lang);
      };
      if (f.type === 'multiselect') {
        out.push({ label: label + ', ' + L.n, cells: ['', ...groups.map(() => '')], p: '', smd: '' });
        for (const lv of levels) {
          const r = names.length >= 2 ? catTest([groups.map(g => count(g, lv)), groups.map(g => known(g).length - count(g, lv))]) : { p: null, test: '' };
          if (r.test) tests.add(r.test);
          out.push({ label: lv, indent: true, cells: [pct(count(used, lv), known(used).length), ...groups.map(g => pct(count(g, lv), known(g).length))],
            p: this.pFmt(r.p, lang), test: r.test, smd: two ? binSmd(count(groups[0], lv), known(groups[0]).length, count(groups[1], lv), known(groups[1]).length) : '' });
        }
        missRow();
        continue;
      }
      const r = names.length >= 2 ? catTest(levels.map(lv => groups.map(g => count(g, lv)))) : { p: null, test: '' };
      if (r.test) tests.add(r.test);
      const smd = two && levels.length === 2 ? binSmd(count(groups[0], levels[0]), known(groups[0]).length, count(groups[1], levels[0]), known(groups[1]).length) : '';
      const lvShow = lv => f.key === '_sex' ? (lv === 'М' ? L.male : lv === 'Ж' ? L.female : lv) : lv;
      if (f.type === 'yesno') {
        out.push({ label: label + ', ' + L.n, cells: [pct(count(used, 'да'), known(used).length), ...groups.map(g => pct(count(g, 'да'), known(g).length))], p: this.pFmt(r.p, lang), test: r.test, smd });
      } else {
        out.push({ label: label + ', ' + L.n, cells: ['', ...groups.map(() => '')], p: this.pFmt(r.p, lang), test: r.test, smd });
        for (const lv of levels) out.push({ label: lvShow(lv), indent: true, cells: [pct(count(used, lv), known(used).length), ...groups.map(g => pct(count(g, lv), known(g).length))], p: '', smd: '' });
      }
      missRow();
    }
    const T = lang === 'en'
      ? { mw: 'Mann-Whitney U test', kw: 'Kruskal-Wallis test', welch: 'Welch t-test', anova: 'one-way ANOVA', chi2: "Pearson's χ² test", chi2y: "Pearson's χ² test with Yates' correction (2×2)", fisher: "Fisher's exact test (2×2 with expected counts < 5)" }
      : { mw: 'критерий Манна-Уитни', kw: 'критерий Краскела-Уоллиса', welch: 't-критерий Уэлча', anova: 'однофакторный дисперсионный анализ', chi2: 'χ² Пирсона', chi2y: 'χ² Пирсона с поправкой Йейтса (2×2)', fisher: 'точный критерий Фишера (2×2 с ожидаемыми частотами < 5)' };
    const foot = [];
    if (tests.size) foot.push((lang === 'en' ? 'p values: ' : 'p: ') + [...tests].map(t => T[t]).join('; ') + '.');
    foot.push(lang === 'en' ? 'Percentages are calculated among patients with known values; «unknown» is counted as missing.'
      : 'Проценты считаются от пациентов с известным значением; «неизвестно» считается пропуском.');
    if (two) foot.push(lang === 'en' ? 'SMD: absolute standardized mean difference; values above 0.1 suggest imbalance between groups.'
      : 'SMD: абсолютная стандартизованная разность; значения больше 0,1 указывают на дисбаланс групп.');
    if (notes.length) foot.push((lang === 'en' ? 'More than 20% of expected counts are below 5, χ² is approximate: ' : 'Больше 20% ожидаемых частот меньше 5, χ² приблизительный: ') + [...new Set(notes)].join('; ') + '.');
    if (rows.length > used.length) foot.push((lang === 'en' ? 'Excluded for unknown group: ' : 'Не включены, так как группа не указана: ') + (rows.length - used.length) + '.');
    return { title: L.title, head, rows: out, foot, two, groups: names, n: used.length };
  },
  html(t, id = 't1Table') {
    return `<div style="overflow-x:auto"><table class="tbl" id="${id}"><thead><tr>${t.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${t.rows.map(r =>
      `<tr><td>${r.indent ? '&nbsp;&nbsp;&nbsp;&nbsp;' : ''}${esc(r.label)}</td>${r.cells.map(c => `<td>${esc(c)}</td>`).join('')}<td>${esc(r.p)}</td>${t.two ? `<td>${esc(r.smd)}</td>` : ''}</tr>`).join('')}</tbody></table></div>`;
  },
  docx(fileName, title, bodyHtml, foot = []) {
    Office.docx(fileName, `<h2>${esc(title)}</h2>${bodyHtml}${foot.map(x => `<p>${esc(x)}</p>`).join('')}`, { font: 'Times New Roman', size: 10 });
  },
  xlsx(fileName, t) {
    Office.book(fileName, [{ name: 'Table 1', rows: [t.head, ...t.rows.map(r => [(r.indent ? '    ' : '') + r.label, ...r.cells, r.p, ...(t.two ? [r.smd] : [])]), [], ...t.foot.map(x => [x])] }]);
  },

  /* схема отбора когорты (STROBE): последовательное применение условий */
  OPS_TXT: { eq: '=', ne: '≠', gt: '>', lt: '<', ge: '≥', le: '≤', in: 'одно из', has: 'содержит', empty: 'пусто', notempty: 'заполнено' },
  condText(reg, c) {
    const f = (typeof fieldsOf === 'function' ? fieldsOf(reg, c.et) : []).find(x => x.key === c.key);
    const form = c.et === '_p' ? 'карточка' : etById(reg, c.et)?.name || c.et;
    return `${form}: ${f?.label || c.key} ${typeof OPS === 'object' && OPS[c.op] ? OPS[c.op] : this.OPS_TXT[c.op] || c.op} ${c.value || ''}`.trim();
  },
  flow(ds, st) {
    const reg = ds.reg, steps = [];
    const visible = ds.patients.filter(p => typeof visibleP !== 'function' || visibleP(p));
    let prev = visible.length;
    steps.push({ label: 'Пациенты в регистре «' + reg.name + '»', n: prev });
    const conds = st.cohort.conds || [];
    for (let i = 0; i < conds.length; i++) {
      const n = cohortPatients({ ...ds, patients: visible }, { conds: conds.slice(0, i + 1) }).length;
      steps.push({ label: 'Условие: ' + this.condText(reg, conds[i]), n, out: prev - n, why: 'не соответствуют условию «' + this.condText(reg, conds[i]) + '»' });
      prev = n;
    }
    let pts = cohortPatients({ ...ds, patients: visible }, st.cohort);
    if (st.cohort.from || st.cohort.to) {
      steps.push({ label: `Начало наблюдения ${st.cohort.from || '…'} - ${st.cohort.to || '…'}`, n: pts.length, out: prev - pts.length, why: 'начало наблюдения вне периода или нет формы начала' });
      prev = pts.length;
    }
    const c = st.cfg || {};
    if (c.et && c.et !== '_p' && st.type !== 'ind') {
      const form = etById(reg, c.et);
      const has = new Set(ds.events.filter(e => e.type === c.et).filter(e => {
        if (!c.efkey || !(c.efvals || []).length) return true;
        const p = ds.patients.find(x => x.id === e.patientId);
        const v = computeValues(reg, p, form, e.data, e.date)[c.efkey];
        return [].concat(v ?? []).some(x => c.efvals.includes(String(x)));
      }).map(e => e.patientId));
      const n = pts.filter(p => has.has(p.id)).length;
      if (n !== prev) {
        steps.push({ label: 'Есть форма «' + (form?.name || c.et) + '»' + (c.efkey && (c.efvals || []).length ? ' с отбором ' + c.efvals.join(', ') : ''), n, out: prev - n, why: 'нет формы «' + (form?.name || c.et) + '»' + (c.efkey && (c.efvals || []).length ? ' с нужным значением' : '') });
        prev = n;
      }
    }
    steps.push({ label: 'Включены в анализ', n: prev, final: true });
    return steps;
  },
  flowSvg(steps) {
    const W = 780, bx = 30, bw = 340, ex = 430, ew = 320, bh = 58;
    const wrap = (s, n) => { const lines = ['']; for (const w of String(s).split(' ')) { if ((lines[lines.length - 1] + ' ' + w).trim().length > n) lines.push(w); else lines[lines.length - 1] = (lines[lines.length - 1] + ' ' + w).trim(); } return lines.slice(0, 3); };
    const tx = (x, y, lines, bold) => `<text x="${x}" y="${y}" font-size="12" font-family="Arial, sans-serif"${bold ? ' font-weight="bold"' : ''}>${lines.map((l, i) => `<tspan x="${x}" dy="${i ? 15 : 0}">${esc(l)}</tspan>`).join('')}</text>`;
    const parts = []; let y = 16;
    steps.forEach((s, i) => {
      const label = i === 0 || s.final ? s.label : s.label.replace(/^Условие: /, '');
      parts.push(`<rect x="${bx}" y="${y}" width="${bw}" height="${bh}" fill="${s.final ? '#eef4ff' : '#fff'}" stroke="#333"/>` + tx(bx + 10, y + 20, wrap(label + ' (n = ' + s.n + ')', 46), s.final));
      const next = steps[i + 1]; if (!next) { y += bh + 16; return; }
      const gap = next.out > 0 ? bh + 40 : 34, x = bx + bw / 2;
      parts.push(`<line x1="${x}" y1="${y + bh}" x2="${x}" y2="${y + bh + gap - 2}" stroke="#333" marker-end="url(#ar)"/>`);
      if (next.out > 0) {
        const ey = y + bh + (gap - bh) / 2, my = ey + bh / 2;
        parts.push(`<line x1="${x}" y1="${my}" x2="${ex - 2}" y2="${my}" stroke="#333" marker-end="url(#ar)"/><rect x="${ex}" y="${ey}" width="${ew}" height="${bh}" fill="#fafafa" stroke="#333"/>`
          + tx(ex + 10, ey + 20, wrap('Исключены (n = ' + next.out + '): ' + next.why, 44)));
      }
      y += bh + gap;
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${y}" width="${W}" height="${y}" style="max-width:100%;height:auto" role="img" aria-label="Схема отбора когорты"><defs><marker id="ar" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#333"/></marker></defs><rect width="${W}" height="${y}" fill="#fff"/>${parts.join('')}</svg>`;
  },

  /* все таблицы результата анализа одним файлом Word */
  wordFromOut(out, name) {
    const parts = [];
    const coh = out.querySelector(':scope > p.muted');
    if (coh) parts.push(`<p>${esc(coh.textContent)}</p>`);
    for (const el of out.querySelectorAll('h2, h3, table, p.muted.small, .warnt p')) {
      if (el.closest('.chartbox')) continue;
      if (el.tagName === 'TABLE') {
        const t = el.cloneNode(true);
        t.querySelectorAll('button, input, select').forEach(x => x.remove());
        parts.push(t.outerHTML);
      } else parts.push(`<${el.tagName === 'P' ? 'p' : 'h3'}>${esc(el.textContent.trim())}</${el.tagName === 'P' ? 'p' : 'h3'}>`);
    }
    if (!out.querySelector('table')) return toast('В результате нет таблиц', 'err');
    Office.docx(slug(name) + '_' + today() + '.docx', `<h2>${esc(name)}</h2>` + parts.join(''), { font: 'Times New Roman', size: 10 });
  }
};

/* ---------- «Таблица 1» как вид анализа ---------- */
ANALYSES.table1 = 'Таблица 1 (характеристика групп)';
Survival.cfg.table1 = ({ c, reg, etOpts }) => {
  const vars = PubTables.candidates(reg, c.et), groups = PubTables.groupCandidates(reg, c.et);
  const chosen = new Set(String(c.t1vars || '').split(',').filter(Boolean));
  setTimeout(() => {
    const box = document.getElementById('t1Vars'); if (!box) return;
    box.onchange = () => { c.t1vars = $$('input:checked', box).map(x => x.value).join(','); $('#t1VarsVal').value = c.t1vars; };
    const all = document.getElementById('t1All');
    if (all) all.onclick = () => { $$('input', box).forEach(x => x.checked = true); box.onchange(); };
  }, 0);
  return `<label class="flab">Форма с исходными данными</label><select class="inp" data-k="et">${etOpts(c.et, true)}</select>
    <label class="flab">Группы (столбцы)</label><select class="inp" data-k="t1grp"><option value="">без разбиения</option>${groups.map(f => `<option value="${esc(f.key)}" ${c.t1grp === f.key ? 'selected' : ''}>${esc(f.label)}</option>`).join('')}</select>
    <label class="flab">Числа показывать как</label><select class="inp" data-k="t1num"><option value="median">медиана (IQR), Манна-Уитни / Краскела-Уоллиса</option><option value="mean" ${c.t1num === 'mean' ? 'selected' : ''}>среднее ± SD, t-критерий Уэлча / ANOVA</option></select>
    <label class="flab">Язык таблицы</label><select class="inp" data-k="t1lang"><option value="ru">русский</option><option value="en" ${c.t1lang === 'en' ? 'selected' : ''}>английский</option></select>
    <label class="flab">Строки таблицы</label><div class="rchk" id="t1Vars">${vars.map(f => `<label class="chk"><input type="checkbox" value="${esc(f.key)}" ${chosen.has(f.key) ? 'checked' : ''}>${esc(f.label)}</label>`).join('')}</div>
    <button class="btn xs" type="button" id="t1All">Отметить все</button><input type="hidden" data-k="t1vars" id="t1VarsVal" value="${esc(c.t1vars || '')}">`;
};
Survival.run.table1 = ({ ds, reg, c, pts, efOK }) => {
  const all = PubTables.candidates(reg, c.et);
  const keys = String(c.t1vars || '').split(',').filter(Boolean);
  if (!keys.length) throw new Error('Отметьте строки таблицы');
  const chosen = keys.map(k => all.find(f => f.key === k)).filter(Boolean).filter(f => f.key !== c.t1grp);
  const rows = PubTables.rows(ds, reg, c.et, pts, efOK, c.efkey);
  if (!rows.length) throw new Error('В когорте нет пациентов с выбранной формой');
  const t = c.t1grp ? PubTables.build(rows, c.t1grp, { all, chosen }, { num: c.t1num, lang: c.t1lang })
    : PubTables.build(rows.map(r => ({ ...r, _one: 1 })), '_all', { all: [...all, { key: '_all', type: 'select' }], chosen }, { num: c.t1num, lang: c.t1lang });
  if (!c.t1grp) { t.head = t.head.slice(0, 2); t.rows.forEach(r => { r.cells = r.cells.slice(0, 1); r.p = ''; }); t.two = false; t.foot = t.foot.filter(x => !/^p|SMD/.test(x)); }
  PubTables.last = t;
  setTimeout(() => {
    const w = document.getElementById('t1Docx'), x = document.getElementById('t1Xlsx');
    if (w) w.onclick = () => PubTables.docx('table1_' + slug(reg.name) + '_' + today() + '.docx', t.title, PubTables.html(t), t.foot);
    if (x) x.onclick = () => PubTables.xlsx('table1_' + slug(reg.name) + '_' + today() + '.xlsx', t);
  }, 0);
  const warn = typeof TRAIN !== 'undefined' && TRAIN ? '<div class="warnt"><p>Учебные данные: результат не имеет клинического смысла.</p></div>' : '';
  return `<div class="card">${warn}<h2>${esc(t.title)}</h2>${PubTables.html(t)}${t.foot.map(x => `<p class="muted small">${esc(x)}</p>`).join('')}
    <div class="row end"><button class="btn primary sm" id="t1Docx">Word (.docx)</button><button class="btn sm" id="t1Xlsx">Excel</button></div></div>`;
};
/* без разбиения: одна «группа» на всех */
{
  const value = PubTables.value.bind(PubTables);
  PubTables.value = (row, key) => key === '_all' ? (row._one ? 'all' : null) : value(row, key);
}

/* ---------- кнопки «Схема отбора» и «Таблицы в Word» на странице аналитики ---------- */
{
  const analytics = Routes.analytics;
  Routes.analytics = async (main, ...rest) => {
    const hash = location.hash;
    await analytics(main, ...rest);
    if (location.hash !== hash || !$('#aRun', main) || $('#aStrobe', main)) return;
    $('#aRun', main).insertAdjacentHTML('afterend', ' <button class="btn" id="aStrobe" title="Сколько пациентов отсеяно на каждом условии когорты: схема для раздела «Методы» по STROBE">Схема отбора (STROBE)</button>');
    $('#aStrobe', main).onclick = async () => {
      const st = Routes.analytics.st; if (!st) return;
      $$('#aCfg [data-k]').forEach(el => st.cfg[el.dataset.k] = el.value);
      const ds = await loadReg(st.reg);
      const steps = PubTables.flow(ds, st);
      const svg = PubTables.flowSvg(steps);
      const out = $('#aOut', main);
      out.innerHTML = `<div class="card"><h2>Схема отбора когорты (STROBE)</h2>${chartBox('strobe_flow', svg)}
        <table class="tbl" id="strobeTable"><thead><tr><th>Шаг</th><th>Осталось</th><th>Исключено</th></tr></thead><tbody>${steps.map(s => `<tr><td>${esc(s.label)}</td><td>${s.n}</td><td>${s.out ?? ''}</td></tr>`).join('')}</tbody></table>
        <p class="muted small">Схема строится из условий когорты слева: каждое условие применяется по очереди. Причины исключения в рамках условия (например, «нет данных») уточните в тексте статьи.</p></div>`;
      addWord(out, 'Схема отбора когорты');
    };
  };
  const addWord = (out, name) => {
    if (!out || !out.querySelector('table') || out.querySelector('#aWord')) return;
    out.insertAdjacentHTML('beforeend', '<div class="row end"><button class="btn sm" id="aWord" title="Все таблицы этого результата в один файл Word для статьи">Таблицы в Word</button></div>');
    out.querySelector('#aWord').onclick = () => PubTables.wordFromOut(out, name);
  };
  const run = runAnalysis;
  runAnalysis = function (ds, st, out) {
    run(ds, st, out);
    addWord(out, ANALYSES[st.type] || 'Анализ');
  };
}
