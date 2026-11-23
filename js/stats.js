/* AddAll 2.0: статистика и графики SVG */
'use strict';

const Stats = {
  nums: (a) => a.map(Number).filter(x => x !== null && !isNaN(x) && isFinite(x)),
  mean: (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null,
  sd(a) { if (a.length < 2) return null; const m = this.mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); },
  q(a, p) { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); },
  summary(a) { a = this.nums(a); const r = (x, n = 1) => x == null ? '—' : Math.round(x * 10 ** n) / 10 ** n; return { n: a.length, mean: r(this.mean(a)), sd: r(this.sd(a)), median: r(this.q(a, .5)), q1: r(this.q(a, .25)), q3: r(this.q(a, .75)), min: a.length ? Math.min(...a) : '—', max: a.length ? Math.max(...a) : '—' }; },
  /* регуляризованная неполная гамма Q(a,x) */
  gammq(a, x) {
    if (x <= 0) return 1;
    const gln = this.lgamma(a);
    if (x < a + 1) { let ap = a, sum = 1 / a, del = sum; for (let n = 0; n < 300; n++) { ap++; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-12) break; } return 1 - sum * Math.exp(-x + a * Math.log(x) - gln); }
    let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
    for (let i = 1; i < 300; i++) { const an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300; c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-12) break; }
    return Math.exp(-x + a * Math.log(x) - gln) * h;
  },
  lgamma(x) { const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]; let y = x, t = x + 5.5; t -= (x + 0.5) * Math.log(t); let s = 1.000000000190015; for (const k of c) s += k / ++y; return -t + Math.log(2.5066282746310005 * s / x); },
  chi2p(chi, df) { return df > 0 ? this.gammq(df / 2, chi / 2) : null; },
  crosstab(rows) { /* rows: [{r, c}] */
    const R = [...new Set(rows.map(x => x.r))].sort(), C = [...new Set(rows.map(x => x.c))].sort();
    const m = R.map(r => C.map(c => rows.filter(x => x.r === r && x.c === c).length));
    const rt = m.map(r => r.reduce((s, x) => s + x, 0)), ct = C.map((_, j) => m.reduce((s, r) => s + r[j], 0)), N = rt.reduce((s, x) => s + x, 0);
    let chi = 0, lowExp = 0; m.forEach((r, i) => r.forEach((o, j) => { const e = rt[i] * ct[j] / N; if (e > 0) chi += (o - e) ** 2 / e; if (e < 5) lowExp++; }));
    const df = (R.length - 1) * (C.length - 1);
    return { R, C, m, rt, ct, N, chi: Math.round(chi * 100) / 100, df, p: df > 0 ? this.chi2p(chi, df) : null, lowExp: R.length * C.length ? lowExp / (R.length * C.length) : 0 };
  },
  /* Каплан-Майер: data [{t, e}] */
  km(data) {
    const d = data.filter(x => x.t != null && x.t >= 0).sort((a, b) => a.t - b.t);
    let n = d.length, s = 1; const pts = [{ t: 0, s: 1, n }]; const times = [...new Set(d.map(x => x.t))];
    times.forEach(t => {
      const at = d.filter(x => x.t === t), ev = at.filter(x => x.e).length;
      if (ev) { s *= (1 - ev / n); pts.push({ t, s, n, ev }); }
      n -= at.length;
    });
    const at = (tt) => { let v = 1; pts.forEach(p => { if (p.t <= tt) v = p.s; }); return v; };
    const med = pts.find(p => p.s <= 0.5);
    return { pts, n: d.length, events: d.filter(x => x.e).length, at, median: med ? med.t : null, maxT: d.length ? d[d.length - 1].t : 0, censored: d.filter(x => !x.e).map(x => ({ t: x.t, s: at(x.t) })) };
  },
  /* лог-ранговый критерий для k групп */
  logrank(groups) { /* groups: [[{t,e}]] */
    const k = groups.length; if (k < 2) return null;
    const all = groups.flatMap((g, gi) => g.map(x => ({ ...x, g: gi })));
    const times = [...new Set(all.filter(x => x.e).map(x => x.t))].sort((a, b) => a - b);
    const O = Array(k).fill(0), E = Array(k).fill(0), V = Array.from({ length: k }, () => Array(k).fill(0));
    times.forEach(t => {
      const nAt = groups.map(g => g.filter(x => x.t >= t).length), dAt = groups.map(g => g.filter(x => x.t === t && x.e).length);
      const N = nAt.reduce((s, x) => s + x, 0), D = dAt.reduce((s, x) => s + x, 0); if (N < 1) return;
      for (let i = 0; i < k; i++) {
        O[i] += dAt[i]; E[i] += D * nAt[i] / N;
        for (let j = 0; j < k; j++) { if (N > 1) V[i][j] += D * (N - D) / (N - 1) * (nAt[i] / N) * ((i === j ? 1 : 0) - nAt[j] / N); }
      }
    });
    /* chi2 = U' V^-1 U по первым k-1 группам */
    const m = k - 1, U = O.slice(0, m).map((o, i) => o - E[i]), A = V.slice(0, m).map(r => r.slice(0, m));
    const inv = this.invert(A); if (!inv) return { O, E, chi: null, p: null };
    let chi = 0; for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) chi += U[i] * inv[i][j] * U[j];
    return { O, E, chi: Math.round(chi * 100) / 100, df: m, p: this.chi2p(chi, m) };
  },
  invert(M) {
    const n = M.length, A = M.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => i === j ? 1 : 0)]);
    for (let c = 0; c < n; c++) {
      let piv = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
      if (Math.abs(A[piv][c]) < 1e-12) return null; [A[c], A[piv]] = [A[piv], A[c]];
      const d = A[c][c]; for (let j = 0; j < 2 * n; j++) A[c][j] /= d;
      for (let r = 0; r < n; r++) if (r !== c) { const f = A[r][c]; for (let j = 0; j < 2 * n; j++) A[r][j] -= f * A[c][j]; }
    }
    return A.map(r => r.slice(n));
  },
  /* риск-адаптированный CUSUM (Steiner) и VLAD */
  racusum(cases, OR = 2, h = 4.5) { /* cases [{y, p}] */
    let S = 0; const out = []; let signals = [];
    cases.forEach((c, i) => {
      const p = Math.min(Math.max(c.p, 0.0001), 0.9999), den = 1 - p + OR * p;
      const W = c.y ? Math.log(OR / den) : Math.log(1 / den);
      S = Math.max(0, S + W); let sig = false; if (S >= h) { sig = true; signals.push(i + 1); }
      out.push({ i: i + 1, S, sig }); if (sig) S = 0;
    });
    return { pts: out, signals };
  },
  vlad(cases) { let v = 0; return cases.map((c, i) => { v += c.p - (c.y ? 1 : 0); return { i: i + 1, v }; }); },
  pFmt(p) { if (p == null || isNaN(p)) return '—'; return p < 0.001 ? '< 0,001' : String(Math.round(p * 1000) / 1000).replace('.', ','); }
};

/* ---------- SVG графики ---------- */
const PAL = ['#3b6fd4', '#e07a2f', '#2a9d8f', '#c0392b', '#8e6bd4', '#7f8c3a', '#d4a017', '#5d6d7e', '#e84393', '#16a085'];
const Chart = {
  W: 760, H: 380, M: { l: 60, r: 20, t: 30, b: 60 },
  nice(max) { if (max <= 0) return 1; const e = Math.pow(10, Math.floor(Math.log10(max))); const f = max / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e; },
  ticks(min, max, n = 5) { const step = this.nice((max - min) / n) || 1; const out = []; for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6); return out; },
  frame(title, inner, legend = '') { return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${this.W} ${this.H}" class="chart" font-family="Segoe UI, Arial, sans-serif" font-size="12"><rect width="100%" height="100%" fill="#fff"/><text x="${this.W / 2}" y="18" text-anchor="middle" font-weight="700" font-size="14">${esc(title)}</text>${inner}${legend}</svg>`; },
  axes(xs, ys, xt, yt, xl, yl, fmtX = v => v, fmtY = v => v) {
    const { l, r, t, b } = this.M, W = this.W, H = this.H;
    let g = `<line x1="${l}" y1="${H - b}" x2="${W - r}" y2="${H - b}" stroke="#333"/><line x1="${l}" y1="${t}" x2="${l}" y2="${H - b}" stroke="#333"/>`;
    yt.forEach(v => { const y = ys(v); g += `<line x1="${l}" x2="${W - r}" y1="${y}" y2="${y}" stroke="#eee"/><text x="${l - 6}" y="${y + 4}" text-anchor="end" fill="#555">${esc(fmtY(v))}</text>`; });
    xt.forEach(v => { const x = xs(v); g += `<text x="${x}" y="${H - b + 16}" text-anchor="middle" fill="#555">${esc(fmtX(v))}</text>`; });
    g += `<text x="${(l + W - r) / 2}" y="${H - 18}" text-anchor="middle" fill="#333">${esc(xl || '')}</text><text transform="translate(16,${(t + H - b) / 2}) rotate(-90)" text-anchor="middle" fill="#333">${esc(yl || '')}</text>`;
    return g;
  },
  legend(items) { const { l } = this.M; return items.map((it, i) => `<g transform="translate(${l + 10 + (i % 4) * 175},${this.M.t + 6 + Math.floor(i / 4) * 16})"><rect width="12" height="4" y="4" fill="${it.c}"/><text x="18" y="10">${esc(String(it.n).slice(0, 24))}</text></g>`).join(''); },
  bar(title, labels, values, { yl = 'n', pct = null, color = PAL[0] } = {}) {
    const { l, r, t, b } = this.M, W = this.W, H = this.H, n = labels.length || 1;
    const max = this.nice(Math.max(1, ...values)), bw = (W - l - r) / n;
    const ys = v => H - b - v / max * (H - t - b);
    let g = this.axes(v => v, ys, [], this.ticks(0, max).filter(v => max < 5 ? Number.isInteger(v) : true), '', yl);
    labels.forEach((lab, i) => {
      const x = l + i * bw + bw * 0.15, w = bw * 0.7, y = ys(values[i]);
      g += `<rect x="${x}" y="${y}" width="${w}" height="${H - b - y}" fill="${color}" rx="2"/><text x="${x + w / 2}" y="${y - 4}" text-anchor="middle" font-weight="700">${values[i]}${pct ? ` (${pct[i]}%)` : ''}</text>`;
      const lb = String(lab).length > 16 ? String(lab).slice(0, 15) + '…' : lab;
      g += `<text x="${x + w / 2}" y="${H - b + 14}" text-anchor="end" transform="rotate(-25 ${x + w / 2} ${H - b + 14})" fill="#333">${esc(lb)}</text>`;
    });
    return this.frame(title, g);
  },
  hist(title, vals, xl) {
    if (!vals.length) return this.frame(title, '<text x="50%" y="50%" text-anchor="middle">Нет данных</text>');
    const min = Math.min(...vals), max = Math.max(...vals), k = Math.max(5, Math.min(20, Math.ceil(Math.sqrt(vals.length))));
    const w = (max - min) / k || 1, bins = Array(k).fill(0); vals.forEach(v => bins[Math.min(k - 1, Math.floor((v - min) / w))]++);
    return this.bar(title, bins.map((_, i) => `${Math.round((min + i * w) * 10) / 10}–${Math.round((min + (i + 1) * w) * 10) / 10}`), bins, { yl: 'n' }).replace('</svg>', `<text x="${this.W / 2}" y="${this.H - 4}" text-anchor="middle" fill="#333">${esc(xl || '')}</text></svg>`);
  },
  line(title, series, { xl = '', yl = '', step = false, xmin = null, xmax = null, ymin = null, ymax = null, hlines = [], fmtX, fmtY, markers = true } = {}) {
    const { l, r, t, b } = this.M, W = this.W, H = this.H;
    const xsAll = series.flatMap(s => s.pts.map(p => p.x)), ysAll = series.flatMap(s => s.pts.map(p => p.y)).concat(hlines.map(h => h.y));
    if (!xsAll.length) return this.frame(title, '<text x="50%" y="50%" text-anchor="middle">Нет данных</text>');
    const x0 = xmin ?? Math.min(...xsAll), x1 = xmax ?? Math.max(...xsAll), y0 = ymin ?? Math.min(0, ...ysAll), y1 = ymax ?? (Math.max(...ysAll) * 1.08 || 1);
    const xs = v => l + (v - x0) / ((x1 - x0) || 1) * (W - l - r), ys = v => H - b - (v - y0) / ((y1 - y0) || 1) * (H - t - b);
    let g = this.axes(xs, ys, this.ticks(x0, x1, 8), this.ticks(y0, y1, 5), xl, yl, fmtX, fmtY);
    hlines.forEach(h => { g += `<line x1="${l}" x2="${W - r}" y1="${ys(h.y)}" y2="${ys(h.y)}" stroke="${h.c || '#c0392b'}" stroke-dasharray="6 4"/><text x="${W - r - 4}" y="${ys(h.y) - 4}" text-anchor="end" fill="${h.c || '#c0392b'}">${esc(h.label || '')}</text>`; });
    series.forEach((s, si) => {
      const c = s.c || PAL[si % PAL.length]; let d = '';
      s.pts.forEach((p, i) => { const X = xs(p.x), Y = ys(p.y); if (!i) d += `M${X},${Y}`; else if (step) d += `H${X}V${Y}`; else d += `L${X},${Y}`; });
      if (step && s.pts.length) d += `H${xs(s.extendTo ?? s.pts[s.pts.length - 1].x)}`;
      g += `<path d="${d}" fill="none" stroke="${c}" stroke-width="2"${s.dash ? ' stroke-dasharray="5 4"' : ''}/>`;
      if (markers && !step && s.pts.length < 80) s.pts.forEach(p => { g += `<circle cx="${xs(p.x)}" cy="${ys(p.y)}" r="${p.mark ? 5 : 2.5}" fill="${p.mark ? '#c0392b' : c}"/>`; });
      (s.ticks || []).forEach(p => { g += `<line x1="${xs(p.x)}" x2="${xs(p.x)}" y1="${ys(p.y) - 4}" y2="${ys(p.y) + 4}" stroke="${c}" stroke-width="1.5"/>`; });
    });
    return this.frame(title, g, series.length > 1 || series[0]?.n ? this.legend(series.filter(s => s.n).map((s, i) => ({ n: s.n, c: s.c || PAL[i % PAL.length] }))) : '');
  },
  funnel(title, pts, p0, { yl = '%' } = {}) {
    const { l, r, t, b } = this.M, W = this.W, H = this.H;
    if (!pts.length) return this.frame(title, '<text x="50%" y="50%" text-anchor="middle">Нет данных</text>');
    const nMax = Math.max(...pts.map(p => p.n)) * 1.1, yMax = Math.min(100, Math.max(p0 * 100 * 2.5, ...pts.map(p => p.rate * 100)) * 1.1 + 2);
    const xs = v => l + v / nMax * (W - l - r), ys = v => H - b - v / yMax * (H - t - b);
    let g = this.axes(xs, ys, this.ticks(0, nMax, 8), this.ticks(0, yMax, 5), 'Число случаев', yl);
    [[1.96, '#f0ad4e', '95%'], [3.09, '#d9534f', '99,8%']].forEach(([z, c, lab]) => {
      let up = '', lo = '';
      for (let n = 3; n <= nMax; n += Math.max(1, nMax / 120)) { const se = Math.sqrt(p0 * (1 - p0) / n); const u = Math.min(1, p0 + z * se) * 100, d = Math.max(0, p0 - z * se) * 100; up += (up ? 'L' : 'M') + xs(n) + ',' + ys(u); lo += (lo ? 'L' : 'M') + xs(n) + ',' + ys(d); }
      g += `<path d="${up}" fill="none" stroke="${c}" stroke-dasharray="5 4"/><path d="${lo}" fill="none" stroke="${c}" stroke-dasharray="5 4"/><text x="${W - r - 4}" y="${ys(Math.min(100, p0 + z * Math.sqrt(p0 * (1 - p0) / nMax)) * 100) - 4}" text-anchor="end" fill="${c}">${lab}</text>`;
    });
    g += `<line x1="${l}" x2="${W - r}" y1="${ys(p0 * 100)}" y2="${ys(p0 * 100)}" stroke="#333"/><text x="${l + 4}" y="${ys(p0 * 100) - 4}" fill="#333">среднее ${Math.round(p0 * 1000) / 10}%</text>`;
    pts.forEach(p => { g += `<circle cx="${xs(p.n)}" cy="${ys(p.rate * 100)}" r="6" fill="${p.out ? '#c0392b' : PAL[0]}" opacity=".85"/><text x="${xs(p.n) + 8}" y="${ys(p.rate * 100) + 4}" font-weight="700">${esc(p.label)}</text>`; });
    return this.frame(title, g);
  },
  toPNG(svg, name) {
    const img = new Image(); const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    img.onload = () => { const c = document.createElement('canvas'); c.width = this.W * 2; c.height = this.H * 2; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height); c.toBlob(b => download(name, b)); URL.revokeObjectURL(url); };
    img.src = url;
  }
};
