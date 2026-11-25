/* AddAll 2.11: проверенная биостатистика.
   Все формулы взяты из опубликованных методов, ссылки в комментариях и в docs (STATISTICS).
   Файл переопределяет и дополняет Stats (stats.js, extras.js) и Chart.funnel. Подключается после quality.js, до net.js. */
'use strict';

/* Точные квантили стандартного нормального распределения */
const Z975 = 1.959963984540054;   /* 95%, двусторонний (2 SD в терминах HQIP) */
const Z999 = 3.090232306167813;   /* 99,8%, двусторонний (3 SD в терминах HQIP) */

Object.assign(Stats, {
  /* Функция нормального распределения: алгоритм Hart 5666 в записи West (2005), точность около 1e-15.
     Заменяет приближение Абрамовица-Стиган 26.2.17 (точность 7,5e-8). */
  ncdf(x) {
    const z = Math.abs(x); let c;
    if (z > 37) c = 0;
    else {
      const e = Math.exp(-z * z / 2);
      if (z < 7.07106781186547) {
        let n = 3.52624965998911e-02 * z + 0.700383064443688; n = n * z + 6.37396220353165; n = n * z + 33.912866078383; n = n * z + 112.079291497871; n = n * z + 221.213596169931; n = n * z + 220.206867912376;
        let d = 8.83883476483184e-02 * z + 1.75566716318264; d = d * z + 16.064177579207; d = d * z + 86.7807322029461; d = d * z + 296.564248779674; d = d * z + 637.333633378831; d = d * z + 793.826512519948; d = d * z + 440.413735824752;
        c = e * n / d;
      } else { let b = z + 0.65; b = z + 4 / b; b = z + 3 / b; b = z + 2 / b; b = z + 1 / b; c = e / b / 2.506628274631; }
    }
    return x > 0 ? 1 - c : c;
  },
  lfact(n) { return n < 2 ? 0 : this.lgamma(n + 1); },
  lchoose(n, k) { return this.lfact(n) - this.lfact(k) - this.lfact(n - k); },

  /* Интервал Уилсона (Wilson 1927; рекомендован Brown, Cai, DasGupta 2001 и Agresti, Coull 1998) */
  wilson(k, n, z = Z975) {
    if (!n) return null;
    const p = k / n, z2 = z * z, d = 1 + z2 / n, c = (p + z2 / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n)) / d;
    return { p, lo: Math.max(0, c - h), hi: Math.min(1, c + h) };
  },

  /* Биномиальное распределение: P(X = k), P(X <= k) */
  bpmf(k, n, p) { if (k < 0 || k > n) return 0; if (p <= 0) return k === 0 ? 1 : 0; if (p >= 1) return k === n ? 1 : 0; return Math.exp(this.lchoose(n, k) + k * Math.log(p) + (n - k) * Math.log(1 - p)); },
  bcdf(k, n, p) { if (k < 0) return 0; if (k >= n) return 1; let s = 0; for (let i = 0; i <= k; i++) s += this.bpmf(i, n, p); return Math.min(1, s); },
  /* P(X >= k): верхний хвост (односторонний точный биномиальный критерий) */
  bupper(k, n, p) { return k <= 0 ? 1 : 1 - this.bcdf(k - 1, n, p); },
  ppmf(k, m) { if (k < 0) return 0; if (m <= 0) return k === 0 ? 1 : 0; return Math.exp(k * Math.log(m) - m - this.lfact(k)); },
  pcdf(k, m) { if (k < 0) return 0; let s = 0; for (let i = 0; i <= k; i++) s += this.ppmf(i, m); return Math.min(1, s); },

  /* Границы funnel plot с интерполяцией дискретного распределения (Spiegelhalter 2005, Stat Med 24:1185, приложение A.1.1).
     Для доли: r = наименьшее целое с F(r) >= q; alpha = (F(r) - q) / (F(r) - F(r-1)); граница = (r - alpha) / n. */
  funnelLimitP(n, p0, q) {
    if (!n) return null;
    let r = 0, F = this.bcdf(0, n, p0); while (F < q && r < n) { r++; F += this.bpmf(r, n, p0); }
    const Fm = F - this.bpmf(r, n, p0), a = F - Fm > 0 ? (F - q) / (F - Fm) : 0;
    return Math.min(1, Math.max(0, (r - a) / n));
  },
  /* Для отношения O/E: Пуассон с ожидаемым числом E, граница = (r - alpha) / E (там же, A.1.2) */
  funnelLimitR(E, q) {
    if (!(E > 0)) return null;
    let r = 0, F = this.ppmf(0, E); while (F < q && r < 100000) { r++; F += this.ppmf(r, E); }
    const Fm = F - this.ppmf(r, E), a = F - Fm > 0 ? (F - q) / (F - Fm) : 0;
    return Math.max(0, (r - a) / E);
  },
  /* Избыточная дисперсия, мультипликативная модель (Spiegelhalter 2005, Qual Saf Health Care 14:347):
     z-оценки винсоризуются на 10% с каждой стороны, phi = сумма z^2 / k; проверка: k*phi против хи-квадрат с k-1 степенями свободы. */
  overdispersion(zs) {
    const k = zs.length; if (k < 10) return { phi: 1, k, test: false, note: 'групп меньше 10: избыточная дисперсия не оценивается' };
    const s = [...zs].sort((a, b) => a - b), lo = s[Math.floor(0.1 * k)], hi = s[Math.ceil(0.9 * k) - 1];
    const w = zs.map(z => Math.min(hi, Math.max(lo, z))), phi = w.reduce((t, z) => t + z * z, 0) / k;
    const p = this.chi2p(k * phi, k - 1);
    return { phi, k, p, test: true, inflate: p < 0.05 && phi > 1 };
  },

  /* Точный критерий Фишера для таблицы 2x2, двусторонний (сумма вероятностей таблиц не больше наблюдаемой, как в R fisher.test) */
  fisher2x2(a, b, c, d) {
    const r1 = a + b, r2 = c + d, c1 = a + c, n = r1 + r2; if (!n) return null;
    const lp = (x) => this.lchoose(r1, x) + this.lchoose(r2, c1 - x) - this.lchoose(n, c1);
    const p0 = lp(a), lo = Math.max(0, c1 - r2), hi = Math.min(r1, c1); let p = 0;
    for (let x = lo; x <= hi; x++) { const v = lp(x); if (v <= p0 + 1e-7) p += Math.exp(v); }
    return { p: Math.min(1, p) };
  },

  /* Манна-Уитни: точное распределение U при n1, n2 < 50 и отсутствии совпадений (как в R wilcox.test), иначе нормальное приближение с поправкой на совпадения и на непрерывность */
  mannWhitney(a, b) {
    const n1 = a.length, n2 = b.length; if (!n1 || !n2) return null;
    const { r, ties } = this.ranks([...a, ...b]); const R1 = r.slice(0, n1).reduce((s, x) => s + x, 0); const U = R1 - n1 * (n1 + 1) / 2;
    const Umin = Math.min(U, n1 * n2 - U);
    if (n1 < 50 && n2 < 50 && !ties) {
      /* число перестановок с данным U: f(i,j,u) = f(i-1,j,u-j) + f(i,j-1,u) */
      const M = n1 * n2; let prev = Array.from({ length: n2 + 1 }, () => { const x = new Float64Array(M + 1); x[0] = 1; return x; });
      for (let i = 1; i <= n1; i++) { const cur = [new Float64Array(M + 1)]; cur[0][0] = 1; for (let j = 1; j <= n2; j++) { const v = new Float64Array(M + 1); for (let u = 0; u <= M; u++) v[u] = (u >= j ? prev[j][u - j] : 0) + cur[j - 1][u]; cur.push(v); } prev = cur; }
      const f = prev[n2], tot = f.reduce((s, x) => s + x, 0); let le = 0; for (let u = 0; u <= Math.floor(Umin); u++) le += f[u];
      return { U: Math.round(Umin * 10) / 10, z: null, p: Math.min(1, 2 * le / tot), exact: true };
    }
    const N = n1 + n2, mu = n1 * n2 / 2, sd = Math.sqrt(n1 * n2 / 12 * ((N + 1) - ties / (N * (N - 1))));
    const z = sd ? (U - mu - Math.sign(U - mu) * 0.5) / sd : 0;
    return { U: Math.round(Umin * 10) / 10, z: Math.round(z * 100) / 100, p: Math.min(1, 2 * (1 - this.ncdf(Math.abs(z)))), exact: false };
  },
  /* Знаковый ранговый критерий Уилкоксона: нули отбрасываются (метод Уилкоксона), точное распределение при n < 50 без совпадений */
  wilcoxon(pairs) {
    const d = pairs.map(([x, y]) => y - x).filter(x => x !== 0); const n = d.length; if (n < 1) return null;
    const { r, ties } = this.ranks(d.map(Math.abs)); const Wp = r.reduce((s, x, i) => s + (d[i] > 0 ? x : 0), 0);
    if (n < 50 && !ties) {
      const M = n * (n + 1) / 2; let f = new Float64Array(M + 1); f[0] = 1;
      for (let k = 1; k <= n; k++) { const g = new Float64Array(M + 1); for (let s = 0; s <= M; s++) g[s] = f[s] + (s >= k ? f[s - k] : 0); f = g; }
      const tot = Math.pow(2, n), w = Math.min(Wp, M - Wp); let le = 0; for (let s = 0; s <= Math.floor(w); s++) le += f[s];
      return { n, W: Wp, z: null, p: Math.min(1, 2 * le / tot), exact: true };
    }
    const mu = n * (n + 1) / 4, sd = Math.sqrt(n * (n + 1) * (2 * n + 1) / 24 - ties / 48);
    const z = sd ? (Wp - mu - Math.sign(Wp - mu) * 0.5) / sd : 0;
    return { n, W: Wp, z: Math.round(z * 100) / 100, p: Math.min(1, 2 * (1 - this.ncdf(Math.abs(z)))), exact: false };
  },

  /* Каплан-Майер: дисперсия Гринвуда и 95% ДИ через преобразование log(-log S) (Kalbfleisch, Prentice 1980) */
  kmCI(km, t) {
    let s = 1, g = 0;
    km.pts.forEach(p => { if (p.t <= t && p.ev) { s = p.s; if (p.n > p.ev) g += p.ev / (p.n * (p.n - p.ev)); else g = Infinity; } });
    if (s >= 1 || s <= 0 || !isFinite(g)) return { s, lo: null, hi: null };
    const se = Math.sqrt(g) / Math.abs(Math.log(s));
    return { s, lo: Math.pow(s, Math.exp(Z975 * se)), hi: Math.pow(s, Math.exp(-Z975 * se)) };
  }
});

/* Funnel plot по Spiegelhalter: точные границы 95% и 99,8% с интерполяцией.
   mode 'p': ось X число случаев n, ось Y доля; mode 'r': ось X ожидаемое число E, ось Y отношение O/E. */
Chart.funnel = function (title, pts, target, { mode = 'p', phi = 1 } = {}) {
  const { l, r, t, b } = this.M, W = this.W, H = this.H;
  if (!pts.length) return this.frame(title, '<text x="50%" y="50%" text-anchor="middle">Нет данных</text>');
  const xv = p => mode === 'r' ? p.e : p.n, yv = p => mode === 'r' ? p.y / p.e : p.y / p.n;
  const xMax = Math.max(...pts.map(xv)) * 1.1;
  const lim = (x, q) => {
    if (phi > 1) { const z = q > 0.5 ? (q > 0.99 ? Z999 : Z975) : (q < 0.01 ? -Z999 : -Z975); const s = mode === 'r' ? Math.sqrt(1 / x) : Math.sqrt(target * (1 - target) / x); return Math.max(0, target + z * Math.sqrt(phi) * s); }
    return mode === 'r' ? Stats.funnelLimitR(x, q) : Stats.funnelLimitP(Math.round(x), target, q);
  };
  const scale = mode === 'r' ? 1 : 100;
  const yTop = Math.max(...pts.map(yv), lim(Math.max(1, Math.min(...pts.map(xv))), 0.999) || 0, target * 2) * 1.1;
  const yMax = mode === 'r' ? yTop : Math.min(1, yTop);
  const xs = v => l + v / xMax * (W - l - r), ys = v => H - b - v / yMax * (H - t - b);
  let g = this.axes(xs, v => ys(v / scale), this.ticks(0, xMax, 8), this.ticks(0, yMax * scale, 5), mode === 'r' ? 'Ожидаемое число исходов (E)' : 'Число случаев (n)', mode === 'r' ? 'O/E' : '%');
  [[0.975, 0.025, '#f0ad4e', '95%'], [0.999, 0.001, '#d9534f', '99,8%']].forEach(([qu, ql, c, lab]) => {
    let up = '', lo = ''; const x0 = mode === 'r' ? xMax / 200 : 1, step = mode === 'r' ? xMax / 160 : Math.max(1, Math.round(xMax / 160));
    for (let x = x0; x <= xMax; x += step) { const u = lim(x, qu), d = lim(x, ql); if (u == null) continue; up += (up ? 'L' : 'M') + xs(x) + ',' + ys(Math.min(yMax, u)); lo += (lo ? 'L' : 'M') + xs(x) + ',' + ys(Math.max(0, d)); }
    g += `<path d="${up}" fill="none" stroke="${c}" stroke-dasharray="5 4"/><path d="${lo}" fill="none" stroke="${c}" stroke-dasharray="5 4"/><text x="${W - r - 4}" y="${ys(Math.min(yMax, lim(xMax, qu))) - 4}" text-anchor="end" fill="${c}">${lab}</text>`;
  });
  g += `<line x1="${l}" x2="${W - r}" y1="${ys(target)}" y2="${ys(target)}" stroke="#333"/><text x="${l + 4}" y="${ys(target) - 4}" fill="#333">${mode === 'r' ? 'O/E = 1' : 'среднее ' + QI.n1(target * 100) + '%'}</text>`;
  pts.forEach(p => { const col = p.flag === 'alarm' ? '#c0392b' : p.flag === 'alert' ? '#e08e0b' : PAL[0]; g += `<circle cx="${xs(xv(p))}" cy="${ys(Math.min(yMax, yv(p)))}" r="6" fill="${col}" opacity=".85"/><text x="${xs(xv(p)) + 8}" y="${ys(Math.min(yMax, yv(p))) + 4}" font-weight="700">${esc(p.label)}</text>`; });
  return this.frame(title, g);
};

/* Exact Poisson interval for observed / expected. */
Stats.oeInterval = function (observed, expected) {
  if (!Number.isInteger(observed) || observed < 0 || !(expected > 0)) return null;
  const quantile = (df, probability) => {
    let low = 0, high = Math.max(1, df * 2);
    while (this.chi2p(high, df) > 1 - probability) high *= 2;
    for (let index = 0; index < 55; index++) {
      const middle = (low + high) / 2;
      if (this.chi2p(middle, df) > 1 - probability) low = middle;
      else high = middle;
    }
    return (low + high) / 2;
  };
  return [observed ? quantile(2 * observed, 0.025) / (2 * expected) : 0, quantile(2 * (observed + 1), 0.975) / (2 * expected)];
};

Stats.riskProbability = function (raw, format) {
  if (raw == null || raw === '' || typeof raw === 'boolean') return null;
  const value = Number(raw);
  const probability = format === 'percent' ? value / 100 : value;
  return Number.isFinite(probability) && probability >= 0 && probability <= 1 ? probability : null;
};

/* Классификация точки funnel plot по HQIP (2017): за 95% (2 SD) предупреждение, за 99,8% (3 SD) тревога */
Stats.funnelFlag = function (p, target, mode, phi = 1) {
  const x = mode === 'r' ? p.e : p.n, y = mode === 'r' ? p.y / p.e : p.y / p.n;
  const L = (q) => {
    if (phi > 1) { const z = q > 0.5 ? (q > 0.99 ? Z999 : Z975) : (q < 0.01 ? -Z999 : -Z975); const s = mode === 'r' ? Math.sqrt(1 / x) : Math.sqrt(target * (1 - target) / x); return target + z * Math.sqrt(phi) * s; }
    return mode === 'r' ? Stats.funnelLimitR(x, q) : Stats.funnelLimitP(x, target, q);
  };
  if (y > L(0.999)) return { flag: 'alarm', side: 'hi' }; if (y < L(0.001)) return { flag: 'alarm', side: 'lo' };
  if (y > L(0.975)) return { flag: 'alert', side: 'hi' }; if (y < L(0.025)) return { flag: 'alert', side: 'lo' };
  return { flag: '', side: '' };
};

/* единые константы для показателей качества */
if (typeof QI === 'object') QI.Z = Z975;
