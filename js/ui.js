/* AddAll 2.0: дизайн 3.0. Движение (своё лёгкое ядро на Web Animations API, как у motion.dev),
   живые графики в стиле shadcn/charts, иконки верхней панели, плавная смена темы.
   Подключается после mods.js и до net.js. Ничего не меняет в данных. */
'use strict';

/* ---------- 1. Ядро движения ---------- */
const Motion = (() => {
  const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  /* пружина -> CSS linear(): та же идея, что spring() в motion.dev */
  const springCache = {};
  function spring(stiffness = 260, damping = 24, mass = 1) {
    const key = stiffness + '/' + damping + '/' + mass; if (springCache[key]) return springCache[key];
    let x = 0, v = 0; const dt = 1 / 120, pts = []; let t = 0, settle = 0;
    while (t < 2.5) {
      const a = (-stiffness * (x - 1) - damping * v) / mass; v += a * dt; x += v * dt; t += dt; pts.push(x);
      if (Math.abs(x - 1) < 0.001 && Math.abs(v) < 0.01) { if (++settle > 12) break; } else settle = 0;
    }
    const step = Math.max(1, Math.floor(pts.length / 48)), out = [0];
    for (let i = step; i < pts.length; i += step) out.push(Math.round(pts[i] * 1000) / 1000);
    out.push(1);
    const ease = CSS.supports('animation-timing-function', 'linear(0, 1)') ? `linear(${out.join(', ')})` : 'cubic-bezier(.2,.9,.25,1.1)';
    return (springCache[key] = { easing: ease, duration: Math.round(pts.length * dt * 1000) });
  }
  function animate(el, frames, opts = {}) {
    if (!el || !el.animate || reduced()) return null;
    let { duration = 420, delay = 0, easing = 'cubic-bezier(.2,.8,.2,1)', fill = 'both' } = opts;
    if (opts.spring) { const s = spring(...[].concat(opts.spring === true ? [] : opts.spring)); easing = s.easing; duration = opts.duration || s.duration; }
    try { return el.animate(frames, { duration, delay, easing, fill }); } catch (e) { return null; }
  }
  function stagger(list, frames, opts = {}) {
    const each = opts.each ?? 40, max = opts.max ?? 12;
    [...list].forEach((el, i) => animate(el, frames, { ...opts, delay: (opts.delay || 0) + Math.min(i, max) * each }));
  }
  function inView(el, cb) {
    if (!('IntersectionObserver' in window)) return cb(el);
    const io = new IntersectionObserver((es) => es.forEach(e => { if (e.isIntersecting) { io.disconnect(); cb(el); } }), { threshold: 0.15 });
    io.observe(el);
  }
  function countUp(el, to, { duration = 900, suffix = '' } = {}) {
    if (reduced()) return;
    const t0 = performance.now(), ease = x => x === 1 ? 1 : 1 - Math.pow(2, -10 * x);
    const tick = (now) => { const p = Math.min(1, (now - t0) / duration); el.textContent = Math.round(to * ease(p)).toLocaleString('ru-RU') + suffix; if (p < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }
  return { animate, stagger, inView, countUp, spring, reduced };
})();

/* ---------- 2. Линейные иконки ---------- */
const UI_ICONS = {
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
  bell: '<path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9z"/><path d="M10.3 20a1.9 1.9 0 0 0 3.4 0"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4"/>',
  moon: '<path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7z"/>',
  chev: '<path d="M7 10l5 5 5-5"/>',
  user: '<circle cx="12" cy="8.5" r="4"/><path d="M4.5 20.5c.8-3.8 3.8-6 7.5-6s6.7 2.2 7.5 6"/>',
  logout: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M10 16l-4-4 4-4M6 12h10"/>',
  check: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>',
  mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="M4 7l8 6 8-6"/>',
  lang: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.3 2.4 3.4 5.2 3.4 8.5s-1.1 6.1-3.4 8.5c-2.3-2.4-3.4-5.2-3.4-8.5s1.1-6.1 3.4-8.5z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>'
};
const UI_GLYPH = { '☺': 'user', '☑': 'check', '⚙': 'gear', '⎋': 'logout', '✉': 'mail', '⇄': 'lang' };
const uiIcon = (k, s = 18, w = 1.8) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${UI_ICONS[k] || ''}</svg>`;

/* ---------- 3. Палитра графиков (и для экспорта) ---------- */
const PAL_NEW = ['#0A84D6', '#F0A800', '#12A594', '#E5484D', '#3E63DD', '#8E8C99', '#D6409F', '#46A758', '#0B8A86', '#C2610C'];
PAL.splice(0, PAL.length, ...PAL_NEW);
const PAL_VAR = { '#0a84d6': 1, '#f0a800': 2, '#12a594': 3, '#e5484d': 4, '#3e63dd': 5, '#8e8c99': 6, '#d6409f': 7, '#46a758': 8,
  '#3b6fd4': 1, '#1f2f84': 1, '#e07a2f': 2, '#f0ad4e': 2, '#d4a017': 2, '#2a9d8f': 3, '#16a2b8': 3, '#16a085': 3, '#c0392b': 4, '#d9534f': 4, '#8e6bd4': 5, '#7b4bb7': 5, '#3c9d5d': 8 };
/* одиночная серия столбцов: один цвет, а не чередование синий/оранжевый */
if (typeof DChart === 'object' && DChart.bars) {
  const _bars = DChart.bars.bind(DChart);
  DChart.bars = (title, labels, series, o) => _bars(title, labels, series.length === 1 && !series[0].c ? [{ ...series[0], c: PAL[0] }] : series, o);
}

/* ---------- 4. Живые графики: тема, анимация, подсказка ---------- */
const ChartFX = {
  tip: null,
  colorVar(c) { const k = PAL_VAR[String(c || '').toLowerCase()]; return k ? `var(--c${k})` : null; },
  theme(svg) {
    if (svg.classList.contains('aa')) return; svg.classList.add('aa');
    const bg = svg.querySelector(':scope > rect[width="100%"]'); if (bg) bg.classList.add('aa-bg');
    const texts = [...svg.querySelectorAll('text')];
    const title = texts.find(t => t.getAttribute('font-weight') === '700' && t.getAttribute('font-size') === '14'); if (title) title.classList.add('aa-title');
    svg.querySelectorAll('line').forEach(l => { const s = (l.getAttribute('stroke') || '').toLowerCase(); if (s === '#eee') l.classList.add('aa-grid'); else if (s === '#333') l.classList.add('aa-axis'); });
    svg.querySelectorAll('[fill],[stroke]').forEach(el => {
      const f = this.colorVar(el.getAttribute('fill')), s = this.colorVar(el.getAttribute('stroke'));
      if (f) el.style.fill = f; if (s) el.style.stroke = s;
      if ((el.getAttribute('fill') || '').toLowerCase() === '#fff' && el.tagName === 'circle') el.classList.add('aa-hole');
    });
    /* столбцы: rect с цветом, не легенда и не фон */
    svg.querySelectorAll('rect').forEach(r => {
      if (r === bg || r.closest('g[transform]')) return;
      const h = +r.getAttribute('height'), w = +r.getAttribute('width');
      if (h > 0 && w > 0 && r.getAttribute('fill') && r.getAttribute('fill') !== 'none') r.classList.add('aa-bar');
    });
    svg.querySelectorAll('path').forEach(p => {
      const f = p.getAttribute('fill');
      if (f === 'none' && p.getAttribute('stroke') && !p.getAttribute('stroke-dasharray')) p.classList.add('aa-line');
      else if (f && f !== 'none' && /A\d/.test(p.getAttribute('d') || '')) { p.classList.add('aa-slice'); if (p.getAttribute('stroke') === '#fff') p.removeAttribute('stroke'); }
    });
    svg.querySelectorAll('circle').forEach(c => { if (!c.classList.contains('aa-hole') && +c.getAttribute('r') <= 7) c.classList.add('aa-dot'); });
    texts.forEach(t => { if (t.getAttribute('font-weight') === '700' && t !== title) t.classList.add('aa-val'); if (t.getAttribute('fill') === '#333') t.classList.add('aa-lbl'); });
    /* подсказки: <title> внутри фигуры или подпись-значение над столбцом */
    svg.querySelectorAll('.aa-bar,.aa-slice,.aa-dot').forEach(el => {
      const tt = el.querySelector('title'); if (tt) { el.dataset.tip = tt.textContent; tt.remove(); }
    });
  },
  legendName(svg, color) {
    for (const g of svg.querySelectorAll('g[transform]')) { const r = g.querySelector('rect'); if (r && (r.getAttribute('fill') || '').toLowerCase() === String(color).toLowerCase()) return g.querySelector('text')?.textContent || ''; }
    return '';
  },
  tipFor(svg, el) {
    if (el.dataset.tip) return esc(el.dataset.tip);
    const fill = el.getAttribute('fill'), leg = this.legendName(svg, fill);
    if (el.classList.contains('aa-slice')) return esc(leg);
    if (el.classList.contains('aa-bar')) {
      const x = +el.getAttribute('x'), w = +el.getAttribute('width'), y = +el.getAttribute('y'), cx = x + w / 2;
      let val = '', lab = '';
      svg.querySelectorAll('text').forEach(t => {
        const tx = +t.getAttribute('x'), ty = +t.getAttribute('y'); if (isNaN(tx)) return;
        if (Math.abs(tx - cx) < 1.5 && ty <= y + 1 && ty > y - 20) val = t.textContent;
        if (Math.abs(tx - cx) < 1.5 && ty > y + +el.getAttribute('height')) lab = t.textContent;
      });
      return `${lab ? esc(lab) + '<br>' : ''}${leg ? esc(leg) + ': ' : ''}<b>${esc(val || '')}</b>`;
    }
    return leg ? esc(leg) : '';
  },
  bindTip(svg) {
    if (!this.tip) { this.tip = document.createElement('div'); this.tip.className = 'aa-tip'; document.body.appendChild(this.tip); }
    const tip = this.tip;
    svg.addEventListener('mousemove', (e) => {
      const el = e.target.closest('.aa-bar,.aa-slice,.aa-dot');
      if (!el) { tip.classList.remove('on'); return; }
      const html = this.tipFor(svg, el); if (!html) { tip.classList.remove('on'); return; }
      const col = getComputedStyle(el).fill;
      tip.innerHTML = `<i style="background:${col}"></i>${html}`;
      tip.style.left = Math.min(innerWidth - tip.offsetWidth - 8, e.clientX + 14) + 'px'; tip.style.top = (e.clientY + 14) + 'px';
      tip.classList.add('on');
    });
    svg.addEventListener('mouseleave', () => tip.classList.remove('on'));
  },
  intro(svg) {
    if (Motion.reduced()) return;
    const bars = svg.querySelectorAll('.aa-bar'), lines = svg.querySelectorAll('.aa-line'), dots = svg.querySelectorAll('.aa-dot'), slices = svg.querySelectorAll('.aa-slice'), vals = svg.querySelectorAll('.aa-val');
    bars.forEach(b => { b.style.transformBox = 'fill-box'; b.style.transformOrigin = '50% 100%'; });
    vals.forEach(v => v.style.opacity = 0);
    Motion.inView(svg, () => {
      const each = Math.max(8, Math.min(40, 600 / (bars.length || 1)));
      Motion.stagger(bars, [{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], { spring: [210, 22], each, max: 60 });
      lines.forEach((p, i) => { let L = 0; try { L = p.getTotalLength(); } catch (e) { } if (!L) return; Motion.animate(p, [{ strokeDasharray: `${L} ${L}`, strokeDashoffset: L }, { strokeDasharray: `${L} ${L}`, strokeDashoffset: 0 }], { duration: 1100, delay: i * 120, easing: 'cubic-bezier(.6,0,.2,1)', fill: 'none' }); });
      dots.forEach(d => { d.style.transformBox = 'fill-box'; d.style.transformOrigin = 'center'; });
      Motion.stagger(dots, [{ transform: 'scale(0)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { spring: [300, 18], delay: 500, each: 12, max: 40 });
      slices.forEach(s => { s.style.transformBox = 'view-box'; s.style.transformOrigin = '230px 205px'; });
      Motion.stagger(slices, [{ transform: 'scale(.6) rotate(-25deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], { spring: [180, 20], each: 70 });
      vals.forEach((v, i) => Motion.animate(v, [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 300, delay: 350 + Math.min(i, 40) * each }));
      setTimeout(() => vals.forEach(v => v.style.opacity = ''), 1600);
    });
  },
  scan(root) {
    (root.querySelectorAll ? root : document).querySelectorAll('svg.chart:not(.aa)').forEach(svg => { this.theme(svg); this.bindTip(svg); this.intro(svg); });
  }
};

/* ---------- 5. Верхняя панель: иконки, тема ---------- */
function uiDecorateShell() {
  const ck = document.getElementById('cmdk');
  if (ck && !ck.querySelector('svg')) { const sp = ck.querySelector('span'); if (sp) sp.textContent = sp.textContent.replace(/^⌕\s*/, ''); ck.insertAdjacentHTML('afterbegin', uiIcon('search', 16, 2)); }
  const bell = document.getElementById('bell');
  if (bell && !bell.querySelector('svg')) { [...bell.childNodes].forEach(n => { if (n.nodeType === 3) n.remove(); }); bell.insertAdjacentHTML('afterbegin', uiIcon('bell', 18)); }
  const th = document.getElementById('theme');
  if (th) {
    const paint = () => { th.innerHTML = uiIcon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon', 18); th.title = document.documentElement.dataset.theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'; };
    paint();
    th.onclick = (e) => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      const apply = () => { document.documentElement.dataset.theme = next; try { localStorage.setItem('addall2.theme', next); } catch (er) { } paint(); };
      if (!document.startViewTransition || Motion.reduced()) return apply();
      const r = th.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, R = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      const vt = document.startViewTransition(apply);
      vt.ready.then(() => document.documentElement.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${R}px at ${x}px ${y}px)`] }, { duration: 560, easing: 'cubic-bezier(.65,0,.35,1)', pseudoElement: '::view-transition-new(root)' })).catch(() => { });
    };
  }
  const ub = document.getElementById('userBtn');
  if (ub) { const m = [...ub.querySelectorAll('.muted')].find(x => x.textContent.trim() === '▾'); if (m) m.innerHTML = uiIcon('chev', 16, 2); }
}

/* «скользящая» подложка в меню разделов (как в Vercel / Linear) */
const NavInd = {
  last: null,
  place(ind, el, animate) {
    const host = ind.parentElement; if (!el || !host) { ind.style.opacity = 0; return; }
    const hr = host.getBoundingClientRect(), r = el.getBoundingClientRect();
    const to = { left: r.left - hr.left + host.scrollLeft, width: r.width };
    const from = this.last;
    ind.style.left = to.left + 'px'; ind.style.width = to.width + 'px'; ind.style.opacity = 1;
    if (animate && from && !Motion.reduced()) Motion.animate(ind, [{ left: from.left + 'px', width: from.width + 'px' }, { left: to.left + 'px', width: to.width + 'px' }], { spring: [380, 32], fill: 'none' });
    this.last = to;
  },
  mount() {
    const host = document.getElementById('mnav'); if (!host) return;
    let ind = host.querySelector('.mn-ind'); if (!ind) { ind = document.createElement('span'); ind.className = 'mn-ind'; host.prepend(ind); }
    const active = () => host.querySelector('.mn-g.on');
    this.place(ind, active(), true);
    if (!host.dataset.indBound) {
      host.dataset.indBound = '1';
      host.addEventListener('mouseover', (e) => { const g = e.target.closest('.mn-g'); const i = host.querySelector('.mn-ind'); if (g && i) this.place(i, g, true); });
      host.addEventListener('mouseleave', () => { const i = host.querySelector('.mn-ind'); if (i) this.place(i, active(), true); });
      addEventListener('resize', () => { const i = host.querySelector('.mn-ind'); if (i) this.place(i, active(), false); });
    }
  }
};

/* ---------- 6. Обёртки ---------- */
(() => {
  const _shell = App.shell.bind(App);
  App.shell = async function () { const r = await _shell(); uiDecorateShell(); NavInd.last = null; return r; };

  const _nav = App.nav.bind(App);
  App.nav = async function () { const r = await _nav(); NavInd.mount(); return r; };

  const _route = App.route.bind(App);
  App.route = async function () {
    /* 2.11: мягкий уход старой страницы перед новой */
    const m0 = document.getElementById('main');
    if (m0 && m0.children.length && !Motion.reduced() && document.querySelector('.sb')) {
      const a = m0.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
      try { await a.finished; } catch (e) { }
      const r0 = await _route(); try { a.cancel(); } catch (e) { } return after(r0);
    }
    return after(await _route());
  };
  const after = function (r) {
    const main = document.getElementById('main'); if (!main) return r;
    /* приветствие: имя выделяем */
    const h = main.querySelector('.hero h1');
    if (h && !h.querySelector('.hl') && h.textContent.includes(',')) { const t = h.textContent, i = t.lastIndexOf(','); h.innerHTML = `${esc(t.slice(0, i + 1))} <span class="hl">${esc(t.slice(i + 1).trim())}</span>`; }
    /* вход страницы: каскад блоков */
    const blocks = [...main.children].filter(el => !el.classList.contains('foot'));
    Motion.stagger(blocks, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 620, each: 60, max: 8, easing: 'cubic-bezier(.25,.1,.25,1)', fill: 'none' });
    const kp = main.querySelectorAll('.kpi'); if (kp.length) Motion.stagger(kp, [{ opacity: 0, transform: 'translateY(16px) scale(.98)' }, { opacity: 1, transform: 'none' }], { spring: [240, 24], delay: 120, each: 50, fill: 'none' });
    /* числа "набегают" */
    main.querySelectorAll('.kpi b, .dkpi b').forEach(b => { const m = b.textContent.trim().match(/^(\d{1,7})(%?)$/); if (m && +m[1] > 0) Motion.countUp(b, +m[1], { suffix: m[2] }); });
    /* полоски полноты растут */
    if (!Motion.reduced()) main.querySelectorAll('.bar > i').forEach((i, n) => { if (n > 60) return; const w = i.style.width; Motion.animate(i, [{ width: '0%' }, { width: w }], { duration: 700, delay: 150 + Math.min(n, 30) * 12, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'none' }); });
    ChartFX.scan(main);
    return r;
  };

  /* иконки в меню пользователя */
  if (typeof popMenu === 'function') {
    const _pm = popMenu;
    const map = UI_GLYPH;
    popMenu = function (anchor, html, bind, onClose) {
      html = String(html).replace(/<i>([☺☑⚙⎋✉⇄])<\/i>/g, (m, g) => `<i>${uiIcon(map[g], 17)}</i>`);
      const pop = _pm(anchor, html, bind, onClose);
      /* если меню не помещается вниз (кнопка пользователя внизу боковой панели), открываем вверх */
      try {
        const r = anchor.getBoundingClientRect(), h = pop.offsetHeight;
        if (r.bottom + 4 + h > innerHeight - 8 && r.top - h - 4 > 8) { pop.style.top = 'auto'; pop.style.bottom = (innerHeight - r.top + 6) + 'px'; pop.style.transformOrigin = 'bottom left'; }
        if (anchor.closest && anchor.closest('.sb')) pop.style.minWidth = Math.max(220, r.width) + 'px';
      } catch (e) { }
      return pop;
    };
  }

  /* появление модальных окон, всплывающих меню, палитры команд и новых графиков */
  const mo = new MutationObserver((muts) => {
    for (const m of muts) for (const n of m.addedNodes) {
      if (n.nodeType !== 1) continue;
      if (n.classList.contains('modal-wrap')) {
        Motion.animate(n, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, fill: 'none' });
        const box = n.querySelector('.modal');
        if (box && n.classList.contains('sheet-wrap')) Motion.animate(box, [{ transform: 'translateX(48px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { spring: [300, 30], fill: 'none' });
        else if (box && !n.classList.contains('full')) Motion.animate(box, [{ opacity: 0, transform: 'translateY(14px) scale(.97)' }, { opacity: 1, transform: 'none' }], { spring: [320, 28], fill: 'none' });
      } else if (n.classList.contains('pop') && n.classList.contains('floating')) {
        n.style.transformOrigin = 'top left';
        Motion.animate(n, [{ opacity: 0, transform: 'translateY(-4px) scale(.97)' }, { opacity: 1, transform: 'none' }], { spring: [420, 30], fill: 'none' });
      } else if (n.classList.contains('cmd')) {
        Motion.animate(n, [{ opacity: 0, transform: 'translateX(-50%) translateY(-8px) scale(.98)' }, { opacity: 1, transform: 'translateX(-50%)' }], { spring: [360, 30], fill: 'none' });
      } else if (n.classList.contains('cmd-dim')) {
        Motion.animate(n, [{ opacity: 0 }, { opacity: 1 }], { duration: 180, fill: 'none' });
      }
      if (n.matches('.mn-it') || n.querySelector?.('.mn-it > i')) (n.matches('.mn-it') ? [n] : n.querySelectorAll('.mn-it')).forEach(it => { const i = it.querySelector(':scope > i'); const k = i && UI_GLYPH[i.textContent.trim()]; if (k) i.innerHTML = uiIcon(k, 17); });
      if (n.matches('svg.chart') || n.querySelector?.('svg.chart:not(.aa)')) ChartFX.scan(n.matches('svg.chart') ? n.parentNode : n);
    }
  });
  const start = () => mo.observe(document.body, { childList: true, subtree: true });
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();

/* ---------- 7. Страница входа: левая колонка с позиционированием платформы ---------- */
const UI_AUTH_SIDE = () => `<aside class="auth-side">
  <span class="as-k"><img src="media/addall-icon.svg" alt="">AddAll · ${esc(Settings.data.center || 'платформа регистров')}</span>
  <h1>Честные данные<br>о <span>результатах лечения</span></h1>
  <p>Платформа клинических регистров: внесите пациента по событиям, наблюдайте исходы и сравнивайте свои результаты с регистром с поправкой на риск.</p>
  <ul>
    <li><i>${uiIcon('check', 17)}</i><span><b>Единый набор полей</b>Одинаковые формы для всех центров, полнота и запросы по данным.</span></li>
    <li><i><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg></i><span><b>Аналитика и отчёты</b>Выживаемость, CUSUM, funnel plot, годовой отчёт и отчёт хирурга.</span></li>
    <li><i><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v6c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/></svg></i><span><b>Доступ по ролям</b>Аудит каждого действия, данные отделения видят только свои.</span></li>
  </ul></aside>`;
function uiDecorateAuth() {
  const auth = document.querySelector('.auth'), box = auth && auth.querySelector('.auth-box'); if (!box) return;
  const hb = document.getElementById('hamb'); if (hb && !hb.querySelector('svg')) hb.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
  if (!box.classList.contains('wide') && box.offsetWidth < 560 && !auth.querySelector('.auth-side')) { auth.classList.add('aa-split'); box.insertAdjacentHTML('beforebegin', UI_AUTH_SIDE()); }
  Motion.animate(box, [{ opacity: 0, transform: 'translateY(16px) scale(.98)' }, { opacity: 1, transform: 'none' }], { spring: [260, 26], fill: 'none' });
  const side = auth.querySelector('.auth-side'); if (side) Motion.stagger(side.children, [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], { duration: 600, each: 80, fill: 'none' });
}
(() => {
  const _login = Pages.login;
  Pages.login = async function (...a) { const r = await _login.apply(this, a); uiDecorateAuth(); return r; };
  const _setup = Pages.setup;
  Pages.setup = function (...a) { const r = _setup.apply(this, a); Promise.resolve(r).then(uiDecorateAuth); return r; };
})();

/* ---------- 7б. Исправление опечаток в сохранённых названиях ----------
   Названия учреждений и отделений вводятся руками при первом запуске. Здесь список известных опечаток:
   при входе администратора они исправляются во всех местах сразу (настройки, сотрудники, регистры),
   чтобы доступ по отделению (сравнение r.dept === u.dept) не сломался. В журнале аудита остаётся запись. */
const TYPO_FIX = { 'Колопроутология': 'Колопроктология', 'колопроутология': 'колопроктология', 'КОЛОПРОУТОЛОГИЯ': 'КОЛОПРОКТОЛОГИЯ' };
const DataFix = {
  fixStr(v) { let out = v; for (const [a, b] of Object.entries(TYPO_FIX)) out = out.split(a).join(b); return out; },
  deep(o) { /* возвращает true, если что-то изменили */
    let ch = false;
    if (Array.isArray(o)) o.forEach((v, i) => { if (typeof v === 'string') { const n = this.fixStr(v); if (n !== v) { o[i] = n; ch = true; } } else if (v && typeof v === 'object') ch = this.deep(v) || ch; });
    else if (o && typeof o === 'object') for (const k of Object.keys(o)) { if (k === 'pass' || k === 'salt') continue; const v = o[k]; if (typeof v === 'string') { const n = this.fixStr(v); if (n !== v) { o[k] = n; ch = true; } } else if (v && typeof v === 'object' && !(v instanceof Blob)) ch = this.deep(v) || ch; }
    return ch;
  },
  async run() {
    try {
      if (!Auth.user || Auth.user.role !== 'admin' || (typeof TRAIN !== 'undefined' && TRAIN)) return;
      const has = (x) => Object.keys(TYPO_FIX).some(t => JSON.stringify(x || '').includes(t));
      let n = 0;
      if (has(Settings.data)) { this.deep(Settings.data); await Settings.save(); n++; }
      for (const st of ['users', 'registries']) for (const rec of await DB.all(st)) if (has(rec)) { this.deep(rec); await DB.put(st, rec, 'исправление опечатки'); n++; }
      if (has(Auth.user)) this.deep(Auth.user);
      if (n) setTimeout(() => toast('Исправлена опечатка в названии отделения: ' + Object.values(TYPO_FIX)[0]), 800);
    } catch (e) { console.warn('DataFix', e); }
  }
};

/* ---------- 8. Боковая навигация (с 2.10) ----------
   Старое меню (#mnav) по-прежнему строится core.js, но скрыто: на него опираются обёртки.
   Здесь: перестановка шапки в боковую панель, группы со сворачиванием, хлебные крошки. */
const SB = {
  key: 'addall2.sb', gkey: 'addall2.sbg', rkey: 'addall2.recent',
  recent() { try { return JSON.parse(localStorage.getItem(this.rkey + '.' + (Auth.user?.id || '')) || '[]'); } catch (e) { return []; } },
  remember(id, name) {
    if (!id || !name) return;
    const list = [{ id, name }, ...this.recent().filter(x => x.id !== id)].slice(0, 5);
    try { localStorage.setItem(this.rkey + '.' + (Auth.user?.id || ''), JSON.stringify(list)); } catch (e) { }
  },
  collapsed() { try { return localStorage.getItem(this.key) === 'mini'; } catch (e) { return false; } },
  groupsOpen() { try { return JSON.parse(localStorage.getItem(this.gkey) || '{}'); } catch (e) { return {}; } },
  saveGroups(o) { try { localStorage.setItem(this.gkey, JSON.stringify(o)); } catch (e) { } },
  ico(k) { return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${k}</svg>`; },
  build() {
    const body = document.body, top = document.querySelector('.top2'), ws = document.querySelector('.workspace');
    if (!top || !ws || document.getElementById('sb')) return;
    body.classList.add('aa-sb'); if (this.collapsed()) body.classList.add('sb-mini');
    const col = document.createElement('div'); col.className = 'aa-col'; body.insertBefore(col, top); col.append(top, ws);
    const sb = document.createElement('aside'); sb.className = 'sb'; sb.id = 'sb';
    sb.innerHTML = `<div class="sb-head"></div><div class="sb-tools"></div><nav class="sb-nav" id="sbnav" aria-label="Разделы"></nav><div class="sb-foot"></div>`;
    body.insertBefore(sb, col);
    const dim = document.createElement('div'); dim.className = 'sb-dim'; dim.onclick = () => this.mobile(false); body.insertBefore(dim, col);
    /* бренд и кнопка свернуть */
    const brand = top.querySelector('.t2-brand'); if (brand) sb.querySelector('.sb-head').appendChild(brand);
    sb.querySelector('.sb-head').insertAdjacentHTML('beforeend', `<button class="sb-col iconbtn" id="sbCol" title="Свернуть панель">${this.ico('<rect x="3.5" y="4" width="17" height="16" rx="3"/><path d="M9.5 4v16M15.5 10l-2 2 2 2"/>')}</button>`);
    sb.querySelector('#sbCol').onclick = () => this.toggleMini();
    /* поиск и быстрое действие */
    const tools = sb.querySelector('.sb-tools');
    const ck = document.getElementById('cmdk'); if (ck) tools.appendChild(ck);
    if (can('enter')) {
      tools.insertAdjacentHTML('beforeend', `<button class="btn primary sb-new" id="sbNewP" title="Новый пациент">${this.ico('<path d="M12 5v14M5 12h14"/>')}<span>Новый пациент</span></button>`);
      sb.querySelector('#sbNewP').onclick = async () => { const regs = (await Data.registries()).filter(r => typeof regAllowed !== 'function' || regAllowed(r)); if (!regs.length) return toast('Сначала создайте регистр', 'err'); patientDialog(null, regs); this.mobile(false); };
    }
    /* низ панели: пользователь и ИИ-переключатель */
    const foot = sb.querySelector('.sb-foot');
    const pill = document.getElementById('aiPill'); if (pill) foot.appendChild(pill);
    const ub = document.getElementById('userBtn'); if (ub) foot.appendChild(ub);
    /* верхняя полоса контента: меню (телефон), крошки, действия */
    const row = top.querySelector('.t2-row');
    row.insertAdjacentHTML('afterbegin', `<button class="iconbtn sb-burger" id="sbBurger" title="Меню">${this.ico('<path d="M4 7h16M4 12h16M4 17h16"/>')}</button><nav class="crumbs" id="crumbs" aria-label="Путь"></nav>`);
    row.querySelector('#sbBurger').onclick = () => this.mobile(true);
    const topR = row.querySelector('.top-r');
    if (topR) topR.insertAdjacentHTML('afterbegin', `<button class="iconbtn sb-search-m" id="sbSearchM" title="Поиск (Ctrl K)">${uiIcon('search', 18)}</button>`);
    const sm = document.getElementById('sbSearchM'); if (sm) sm.onclick = () => Cmd.open();
    const ai = document.getElementById('aiBtn'); if (ai && topR) topR.prepend(ai);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.mobile(false); if ((e.ctrlKey || e.metaKey) && e.key === '\\') { e.preventDefault(); this.toggleMini(); } });
  },
  toggleMini() {
    const on = !document.body.classList.contains('sb-mini');
    document.body.classList.toggle('sb-mini', on);
    try { localStorage.setItem(this.key, on ? 'mini' : 'full'); } catch (e) { }
    const b = document.getElementById('sbCol'); if (b) b.title = on ? 'Развернуть панель' : 'Свернуть панель';
  },
  mobile(open) { document.body.classList.toggle('sb-open', !!open); },
  match(groups) {
    const h = (location.hash.slice(1) || 'home'), r = h.split('/')[0];
    const all = groups.flatMap(g => g.items ? g.items.filter(x => x.r).map(x => ({ ...x, g })) : [{ r: g.r, t: g.t, g, top: true }]);
    let best = all.find(x => x.r === h);
    if (!best) best = all.filter(x => h.startsWith(x.r + '/')).sort((a, b) => b.r.length - a.r.length)[0];
    if (!best) { const alias = { patient: 'patients', registry: 'registries', list: 'registries', mdt: 'mdt', journal: 'journals', dashboard: 'dashboard' }[r] || r; best = all.find(x => x.r === alias) || all.find(x => x.r.split('/')[0] === alias); }
    return best;
  },
  render() {
    const nav = document.getElementById('sbnav'); let groups = App.groups; if (!nav || !groups) return;
    const cur = this.match(groups), open = this.groupsOpen();
    const item = (it, g) => {
      const on = it.recent ? location.hash === '#' + it.r : (cur && cur.r === it.r && !(location.hash.startsWith('#patient/') && this.recent().some(x => '#patient/' + x.id === location.hash) && it.r === 'patients'));
      const cnt = it.badge ? `<em class="sb-b due">${it.badge}</em>` : it.cnt != null ? `<em class="sb-b">${it.cnt}</em>` : '';
      return `<a class="sb-it ${on ? 'on' : ''} ${it.add ? 'add' : ''}" href="#${it.r}" style="--d:${it.d || 0}" title="${esc(it.t)}"><i>${it.recent ? `<b class="sb-av">${esc(initials(it.t))}</b>` : navIcon(it)}</i><span>${esc(it.t)}</span>${it.tag ? `<em class="sb-tag">${esc(it.tag)}</em>` : ''}${cnt}</a>`;
    };
    const order = { recent: 0, regs: 1, work: 2, sci: 3, adm: 4 };
    const rec = this.recent();
    if (rec.length) groups = [...groups, { id: 'recent', t: 'Недавние пациенты', items: rec.map(x => ({ r: 'patient/' + x.id, t: x.name, recent: true })) }];
    const sorted = [...groups].sort((a, b) => (a.items ? 1 : 0) - (b.items ? 1 : 0) || (order[a.id] ?? 9) - (order[b.id] ?? 9));
    nav.innerHTML = sorted.map(g => {
      if (!g.items) return item({ r: g.r, t: g.t, cnt: g.cnt }, g);
      const isOpen = open[g.id] ?? (g.id === 'regs' || g.id === 'recent' || (cur && cur.g === g));
      const badge = g.items.reduce((s, x) => s + (x.badge || 0), 0);
      const body = g.items.map(x => x.sep != null ? (x.sep ? `<div class="sb-sep">${esc(x.sep)}</div>` : '<div class="sb-hr"></div>') : item(x, g)).join('');
      return `<section class="sb-g ${isOpen ? 'open' : ''} ${cur && cur.g === g ? 'has-on' : ''}" data-g="${g.id}"><button class="sb-gh" aria-expanded="${isOpen}"><span>${esc(g.t)}</span>${badge ? `<em class="sb-b due">${badge}</em>` : ''}<b class="sb-cv"></b></button><div class="sb-gb"><div class="sb-gi">${body}</div></div></section>`;
    }).join('');
    nav.querySelectorAll('.sb-gh').forEach(b => b.onclick = () => {
      const s = b.parentElement, id = s.dataset.g, now = !s.classList.contains('open');
      s.classList.toggle('open', now); b.setAttribute('aria-expanded', now);
      const o = this.groupsOpen(); o[id] = now; this.saveGroups(o);
    });
    nav.querySelectorAll('.sb-it').forEach(a => a.addEventListener('click', () => this.mobile(false)));
  },
  crumbs() {
    const el = document.getElementById('crumbs'); if (!el) return;
    const main = document.getElementById('main'), groups = App.groups || [];
    const cur = this.match(groups), r = (location.hash.slice(1) || 'home').split('/')[0];
    const grp = ROUTE_GROUP[r] || (cur && cur.g && cur.g.t) || '';
    const h1 = main && (main.querySelector('.head h1, .phead h1, h1'));
    let title = cur ? cur.t : '';
    if (h1) { const c = h1.cloneNode(true); c.querySelectorAll('.av,.pav,[class*="avatar"],.kicker,small,.tag,button').forEach(x => x.remove()); title = c.textContent.replace(/\s+/g, ' ').trim(); }
    if (main && main.querySelector('.hero')) title = '';
    const parts = [];
    if (r === 'home' || !grp) parts.push(`<b>Главная</b>`);
    else {
      const gHref = cur && cur.g && cur.g.r ? '#' + cur.g.r : null;
      parts.push(gHref ? `<a href="${gHref}">${esc(grp)}</a>` : `<span>${esc(grp)}</span>`);
      if (r === 'patient' || r === 'list') { const back = main && main.querySelector('.phead a[href^="#patients/"], a[href^="#patients/"]'); if (back) parts.push(`<a href="${back.getAttribute('href')}">${esc(back.textContent.replace(/^[←\s]+/, '').trim())}</a>`); }
      if (title && title !== grp) parts.push(`<b>${esc(title)}</b>`);
    }
    el.innerHTML = parts.join('<i class="cr-s">/</i>');
  }
};
(() => {
  const _shell2 = App.shell.bind(App);
  App.shell = async function () { await DataFix.run(); const r = await _shell2(); SB.build(); return r; };
  const _nav2 = App.nav.bind(App);
  App.nav = async function () {
    const h = location.hash.slice(1).split('/');
    if (h[0] === 'patient' && h[1]) { const t = document.querySelector('#main .phead h1'); if (t) { const c = t.cloneNode(true); c.querySelectorAll('.pav').forEach(x => x.remove()); SB.remember(h[1], c.textContent.trim()); } }
    const r = await _nav2(); SB.render(); SB.crumbs(); return r;
  };
})();

/* ---------- 9. Окна: формы выезжают панелью справа, шапка и кнопки закреплены ---------- */
(() => {
  if (typeof modal !== 'function') return;
  const _modal = modal;
  const animClose = (wrap) => {
    if (wrap._closing) return; wrap._closing = true;
    const box = wrap.querySelector('.modal'), sheet = wrap.classList.contains('sheet-wrap');
    if (Motion.reduced() || !box || !box.animate) return wrap.close ? wrap.close() : wrap.remove();
    box.animate(sheet ? [{ transform: 'none' }, { transform: 'translateX(40px)', opacity: 0 }] : [{ transform: 'none', opacity: 1 }, { transform: 'translateY(8px) scale(.98)', opacity: 0 }], { duration: 160, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' });
    wrap.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 170, fill: 'forwards' }).onfinish = () => { wrap.close ? wrap.close() : wrap.remove(); };
  };
  modal = function (html, opts = {}) {
    const wrap = _modal(html, opts), box = wrap.querySelector('.modal');
    const fields = box.querySelectorAll('.inp,.seg,.chips,textarea,select').length;
    if (!opts.full && (opts.wide || fields > 5 || String(html).length > 2500)) {
      wrap.classList.add('sheet-wrap'); box.classList.add('sheet');
      const h = [...box.children].find(el => /^H[1-4]$/.test(el.tagName)); if (h) h.classList.add('sheet-h');
      const acts = [...box.children].reverse().find(el => el.matches('.row, .row.end, .sticky-bottom') && el.querySelector('.btn'));
      if (acts && acts !== box.firstElementChild) acts.classList.add('sheet-act');
    }
    const x = box.querySelector('.modal-x'); if (x) x.onclick = () => animClose(wrap);
    wrap.addEventListener('mousedown', (e) => { if (e.target === wrap && !opts.full) { e.stopImmediatePropagation(); animClose(wrap); } }, true);
    return wrap;
  };
  /* Esc закрывает верхнее окно (кроме полноэкранной формы события, чтобы не потерять ввод) */
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || document.querySelector('.cmd')) return;
    const ws = [...document.querySelectorAll('.modal-wrap')].filter(w => !w.classList.contains('full'));
    const top = ws[ws.length - 1]; if (top) { e.preventDefault(); animClose(top); }
  });
})();

/* ---------- 10. Английский интерфейс для новых надписей ---------- */
if (typeof EN === 'object') Object.assign(EN, {
  'Недавние пациенты': 'Recent patients', 'Новый пациент': 'New patient', 'Регистры и конструктор': 'Registries and builder', 'Создать регистр': 'Create registry',
  'Честные данные': 'Honest data', 'результатах лечения': 'treatment outcomes', 'Единый набор полей': 'One dataset for all',
  'Аналитика и отчёты': 'Analytics and reports', 'Доступ по ролям': 'Role-based access'
});

/* ---------- 11. Широкие таблицы прокручиваются внутри своей рамки, страница и окна не сдвигаются вбок (планшет, телефон) ---------- */
(() => {
  const wrapTables = (root) => {
    root.querySelectorAll?.('table').forEach(t => {
      const p = t.parentElement;
      if (!p || p.classList.contains('tbl-scroll') || t.closest('.tbl-scroll') || getComputedStyle(p).overflowX === 'auto' || getComputedStyle(p).overflowX === 'scroll') return;
      const w = document.createElement('div'); w.className = 'tbl-scroll';
      p.insertBefore(w, t); w.appendChild(t);
    });
  };
  let queued = false;
  const run = () => { queued = false; wrapTables(document.body); };
  new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(run); } }).observe(document.documentElement, { childList: true, subtree: true });
  if (document.body) run(); else document.addEventListener('DOMContentLoaded', run);
})();
