/* AddAll 2.0: визуальный дашборд врача (по образцу Dendrite Visual Dashboard)
   и смайлики в анкетах PROMs (по образцу Dendrite PROMs Auto-emailer) */
'use strict';

Object.assign(ROUTE_GROUP, { dashboard: 'Наука' });
const _nav3 = navGroups;
navGroups = async function () {
  const g = await _nav3(); const s = g.find(x => x.id === 'sci');
  if (s && s.items) s.items.splice(0, 0, { r: 'dashboard', t: 'Визуальный дашборд', i: '◫' });
  return g;
};

/* ---------- графики дашборда (тот же размер холста, что у Chart, чтобы PNG не искажался) ---------- */
const DChart = {
  empty(t) { return Chart.frame(t, '<text x="50%" y="50%" text-anchor="middle" fill="#888">Нет данных</text>'); },
  pie(title, items, donut = false) {
    const tot = items.reduce((s, x) => s + x.n, 0); if (!tot) return this.empty(title);
    const cx = 230, cy = 205, R = 140, r0 = donut ? 75 : 0; let a = -Math.PI / 2, g = '';
    items.forEach((it, i) => {
      const da = it.n / tot * Math.PI * 2, a2 = a + da, c = PAL[i % PAL.length], big = da > Math.PI ? 1 : 0;
      const p = (rr, ang) => `${cx + rr * Math.cos(ang)},${cy + rr * Math.sin(ang)}`;
      if (items.length === 1) g += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${c}"/>${donut ? `<circle cx="${cx}" cy="${cy}" r="${r0}" fill="#fff"/>` : ''}`;
      else g += `<path d="M${p(R, a)} A${R},${R} 0 ${big} 1 ${p(R, a2)} ${donut ? `L${p(r0, a2)} A${r0},${r0} 0 ${big} 0 ${p(r0, a)}` : `L${cx},${cy}`} Z" fill="${c}" stroke="#fff" stroke-width="2"/>`;
      a = a2;
    });
    if (donut) g += `<text x="${cx}" y="${cy + 6}" text-anchor="middle" font-size="22" font-weight="700">${tot}</text>`;
    g += items.slice(0, 14).map((it, i) => `<g transform="translate(420,${60 + i * 22})"><rect width="14" height="14" fill="${PAL[i % PAL.length]}" rx="2"/><text x="22" y="12">${esc(String(it.l).slice(0, 30))}: <tspan font-weight="700">${it.n}</tspan> (${Math.round(it.n / tot * 1000) / 10}%)</text></g>`).join('');
    return Chart.frame(title, g);
  },
  bars(title, labels, series, { yl = '', pct = false } = {}) {
    const { l, r, t, b } = Chart.M, W = Chart.W, H = Chart.H, n = labels.length; if (!n) return this.empty(title);
    const max = Chart.nice(Math.max(pct ? 1 : 1, ...series.flatMap(s => s.v)));
    const ys = v => H - b - v / max * (H - t - b - 20), bw = (W - l - r) / n, k = series.length;
    let g = Chart.axes(v => v, ys, [], Chart.ticks(0, max), '', yl, v => v, v => pct ? v + '%' : v);
    labels.forEach((lab, i) => {
      series.forEach((s, j) => {
        const w = bw * 0.75 / k, x = l + i * bw + bw * 0.125 + j * w, y = ys(s.v[i] || 0), c = s.c || (k === 1 ? PAL[i % 2 ? 1 : 0] : PAL[j % PAL.length]);
        g += `<rect x="${x}" y="${y}" width="${Math.max(1, w - 1)}" height="${H - b - y}" fill="${c}" rx="1"><title>${esc(lab)}: ${s.v[i]}${pct ? '%' : ''}</title></rect>`;
        if (n * k <= 24) g += `<text x="${x + w / 2}" y="${y - 3}" text-anchor="middle" font-size="10">${s.v[i]}${pct ? '%' : ''}</text>`;
      });
      const step = Math.ceil(n / 30), lb = String(lab).length > 14 ? String(lab).slice(0, 13) + '…' : lab;
      if (i % step === 0) g += `<text x="${l + i * bw + bw / 2}" y="${H - b + 12}" text-anchor="end" font-size="10" transform="rotate(-45 ${l + i * bw + bw / 2} ${H - b + 12})" fill="#333">${esc(lb)}</text>`;
    });
    const leg = k > 1 ? Chart.legend(series.map((s, j) => ({ n: s.n, c: s.c || PAL[j % PAL.length] }))) : '';
    return Chart.frame(title, g, leg);
  }
};

/* ---------- данные ---------- */
const DASH_TYPES = { kpi: 'Число записей', sex: 'Пол (круговая)', activity: 'Активность по кварталам', donut: 'Структура (кольцевая)', cmp: 'Мои показатели против регистра', hist: 'Распределение числа (% случаев)', traj: 'Динамика показателя во времени' };
const TRAJ_X = [0, 1, 3, 6, 9, 12, 24, 36, 48, 60];
const trajLbl = m => m === 0 ? 'день опер.' : m < 12 ? m + ' мес' : (m / 12) + ' г';
const isMine = (r) => { const me = Auth.user.id; return r.e.ownerId === me || r.e.createdBy === me || Object.values(r.e.data || {}).some(v => v === me || (Array.isArray(v) && v.includes(me))); };
const qOf = d => d ? d.slice(0, 4) + ' Q' + (Math.floor((Number(d.slice(5, 7)) - 1) / 3) + 1) : '';
const startEtOf = reg => reg.keyDates?.start || reg.eventTypes[0]?.id;
const catVals = (f, v, users) => {
  if (isEmpty(v)) return [];
  if (f.type === 'complist') return [...new Set(v.map(x => typeof x === 'object' ? x.name : x))];
  if (Array.isArray(v)) return v.map(x => typeof x === 'object' ? (x.name || JSON.stringify(x)) : String(x));
  if (f.type === 'user') return [users.find(u => u.id === v)?.name || v];
  return [String(v)];
};

function dashDefaults(reg) {
  const st = etById(reg, startEtOf(reg)), W = [{ id: uid('w'), type: 'kpi' }, { id: uid('w'), type: 'sex' }, { id: uid('w'), type: 'activity', et: st?.id }];
  const ff = st ? formFields(st) : [];
  const proc = ff.find(f => f.type === 'select' && /операц|вмешат|процедур|доступ|тип/i.test(f.label)) || ff.find(f => f.type === 'select');
  if (proc) W.push({ id: uid('w'), type: 'donut', et: st.id, field: proc.key });
  const all = reg.eventTypes.flatMap(e => formFields(e).map(f => ({ et: e.id, f })));
  const comp = all.find(x => x.f.type === 'complist') || all.find(x => x.f.type === 'yesno' && /осложн|летал|смерт|несост/i.test(x.f.label));
  if (comp) W.push({ id: uid('w'), type: 'cmp', et: comp.et, field: comp.f.key });
  const los = all.find(x => ['number', 'calc'].includes(x.f.type) && /койко|пребыв|LOS|выписк/i.test(x.f.label + x.f.key));
  if (los) W.push({ id: uid('w'), type: 'hist', et: los.et, field: los.f.key });
  const fu = reg.eventTypes.find(e => e.id !== st?.id && /наблюд|контрол|follow|визит/i.test(e.name));
  const num = fu && formFields(fu).find(f => f.type === 'number' || (f.type === 'calc' && /bmi|имт|вес|балл|score|боль/i.test(f.label + f.key)));
  if (num) W.push({ id: uid('w'), type: 'traj', et: fu.id, field: num.key, grp: proc?.key || '', mode: 'mean' });
  return W;
}
const dashKey = regId => Auth.user.id + ':' + regId;
const dashGet = reg => { const d = (Settings.data.dash || {})[dashKey(reg.id)]; return d ? clone(d) : dashDefaults(reg); };
async function dashSet(reg, w) { Settings.data.dash = Settings.data.dash || {}; Settings.data.dash[dashKey(reg.id)] = w; await Settings.save(); }

function dashWidget(w, ctx) {
  const { reg, ds, inRange, scopeRows, users } = ctx;
  const f = w.field ? fieldsOf(reg, w.et).find(x => x.key === w.field) : null;
  const etName = etById(reg, w.et)?.name || '';
  const T = w.title || '';
  const rowsAll = (et) => rowsFor(ds, et).filter(inRange);
  try {
    if (w.type === 'kpi') {
      const rs = scopeRows(rowsAll(startEtOf(reg))), pts = new Set(rs.map(r => r.p.id));
      const ok = rs.filter(r => r.e.status === 'завершено').length;
      return `<div class="card dkpi"><div><b>${rs.length}</b><span>${esc(etById(reg, startEtOf(reg))?.name || 'событий')}</span></div><div><b>${pts.size}</b><span>пациентов</span></div><div><b>${rs.length ? Math.round(ok / rs.length * 100) : 0}%</b><span>завершённых записей</span></div><div><b>${rs.length ? fmtDate(rs.map(r => r.e.date).sort().pop()) : '-'}</b><span>последняя запись</span></div></div>`;
    }
    if (w.type === 'sex') {
      const pts = new Map(); scopeRows(ds.events.filter(e => true).map(e => ({ e, p: ds.patients.find(p => p.id === e.patientId) })).filter(r => r.p && inRange(r))).forEach(r => pts.set(r.p.id, r.p));
      const c = {}; [...pts.values()].forEach(p => { const k = p.sex || 'не указан'; c[k] = (c[k] || 0) + 1; });
      return chartBox(T || 'Пол пациентов', DChart.pie(T || 'Пол пациентов', Object.entries(c).map(([l, n]) => ({ l: l === 'М' ? 'мужчины' : l === 'Ж' ? 'женщины' : l, n }))), Object.entries(c).map(([k, n]) => ({ k, n })), [{ key: 'k', label: 'Пол' }, { key: 'n', label: 'n' }]);
    }
    if (w.type === 'activity') {
      const rs = scopeRows(rowsAll(w.et || startEtOf(reg))); const c = {}; rs.forEach(r => { const q = qOf(r.e.date); c[q] = (c[q] || 0) + 1; });
      const keys = Object.keys(c).sort(); const labs = [];
      if (keys.length) { let [y, q] = [Number(keys[0].slice(0, 4)), Number(keys[0].slice(-1))]; const [ye, qe] = [Number(keys[keys.length - 1].slice(0, 4)), Number(keys[keys.length - 1].slice(-1))]; while (y < ye || (y === ye && q <= qe)) { labs.push(`${y} Q${q}`); q++; if (q > 4) { q = 1; y++; } } }
      const t = T || `Активность по кварталам: ${etName}`;
      return chartBox(t, DChart.bars(t, labs.map(x => x.slice(-2) + ' ' + x.slice(0, 4)), [{ v: labs.map(x => c[x] || 0) }], { yl: 'Число' }), labs.map(x => ({ q: x, n: c[x] || 0 })), [{ key: 'q', label: 'Квартал' }, { key: 'n', label: 'n' }]);
    }
    if (!f) return `<div class="card muted">Поле не найдено: выберите заново в настройке графика.</div>`;
    if (w.type === 'donut') {
      const c = {}; scopeRows(rowsAll(w.et)).forEach(r => catVals(f, r.v[f.key], users).forEach(x => c[x] = (c[x] || 0) + 1));
      const items = Object.entries(c).sort((a, b) => b[1] - a[1]).map(([l, n]) => ({ l, n })); const t = T || f.label;
      return chartBox(t, DChart.pie(t, items, true), items, [{ key: 'l', label: f.label }, { key: 'n', label: 'n' }]);
    }
    if (w.type === 'cmp') {
      const all = rowsAll(w.et), mine = scopeRows(all, true);
      const cnt = (rs) => { const c = {}; rs.forEach(r => new Set(catVals(f, r.v[f.key], users)).forEach(x => c[x] = (c[x] || 0) + 1)); return c; };
      const cm = cnt(mine), ca = cnt(all);
      let labs = f.type === 'yesno' ? ['да'] : [...new Set([...(f.options || []), ...Object.keys(ca)])].filter(x => ca[x] || cm[x]);
      if (f.type === 'select' && labs.length > 12) labs = labs.sort((a, b) => (ca[b] || 0) - (ca[a] || 0)).slice(0, 12);
      const pc = (c, n, k) => n ? Math.round((c[k] || 0) / n * 1000) / 10 : 0;
      const t = T || `${f.label}: ${ctx.mineName} против регистра`;
      const rows = labs.map(k => ({ k, mine: pc(cm, mine.length, k), all: pc(ca, all.length, k), km: cm[k] || 0, ka: ca[k] || 0 }));
      return chartBox(t, DChart.bars(t, labs.map(x => f.type === 'yesno' ? f.label : x), [{ n: `${ctx.mineName} (n=${mine.length})`, v: rows.map(r => r.mine), c: PAL[0] }, { n: `Весь регистр (n=${all.length})`, v: rows.map(r => r.all), c: PAL[1] }], { yl: '% случаев', pct: true }), rows, [{ key: 'k', label: 'Значение' }, { key: 'km', label: 'Мои, n' }, { key: 'mine', label: 'Мои, %' }, { key: 'ka', label: 'Регистр, n' }, { key: 'all', label: 'Регистр, %' }]);
    }
    if (w.type === 'hist') {
      const v = scopeRows(rowsAll(w.et)).map(r => Number(r.v[f.key])).filter(x => isFinite(x) && x !== null);
      const t = T || `${f.label}: % случаев`; if (!v.length) return chartBox(t, DChart.empty(t));
      const ints = v.every(Number.isInteger) && Math.max(...v) - Math.min(...v) <= 15;
      let labs, cnt;
      if (ints) { const lo = Math.min(...v), hi = Math.max(...v), cap = Math.min(hi, lo + 7); labs = []; for (let i = lo; i <= cap; i++) labs.push(String(i)); if (hi > cap) labs.push('>' + cap); cnt = labs.map(l => v.filter(x => l[0] === '>' ? x > cap : x === Number(l)).length); }
      else { const lo = Math.min(...v), hi = Math.max(...v), k = 8, wd = (hi - lo) / k || 1; cnt = Array(k).fill(0); v.forEach(x => cnt[Math.min(k - 1, Math.floor((x - lo) / wd))]++); labs = cnt.map((_, i) => `${Math.round((lo + i * wd) * 10) / 10}-${Math.round((lo + (i + 1) * wd) * 10) / 10}`); }
      const p = cnt.map(c => Math.round(c / v.length * 1000) / 10);
      return chartBox(t, DChart.bars(t, labs, [{ v: p }], { yl: '% случаев', pct: true }).replace('</svg>', `<text x="${Chart.W / 2}" y="${Chart.H - 4}" text-anchor="middle" fill="#333">${esc(f.label)}${f.unit ? ', ' + esc(f.unit) : ''} (n=${v.length})</text></svg>`), labs.map((l, i) => ({ l, n: cnt[i], p: p[i] })), [{ key: 'l', label: f.label }, { key: 'n', label: 'n' }, { key: 'p', label: '%' }]);
    }
    if (w.type === 'traj') {
      const sEt = startEtOf(reg), starts = {}; scopeRows(rowsAll(sEt)).forEach(r => { if (!starts[r.p.id] || r.e.date < starts[r.p.id].e.date) starts[r.p.id] = r; });
      const gf = w.grp ? fieldsOf(reg, sEt).find(x => x.key === w.grp) : null;
      const pts = rowsFor(ds, w.et).filter(r => starts[r.p.id] && !isEmpty(r.v[f.key]) && isFinite(Number(r.v[f.key])));
      const byP = {}; pts.forEach(r => { const m = (new Date(r.e.date) - new Date(starts[r.p.id].e.date)) / 864e5 / 30.44; if (m < -0.5) return; const bx = TRAJ_X.reduce((a, b) => Math.abs(b - m) < Math.abs(a - m) ? b : a, 0); (byP[r.p.id] = byP[r.p.id] || []).push({ bx, y: Number(r.v[f.key]), d: r.e.date }); });
      const groups = {}; Object.entries(byP).forEach(([pid, arr]) => { const s = starts[pid]; const gv = gf ? (catVals(gf, s.v[gf.key], users)[0] || 'не указано') : 'Все'; arr.sort((a, b) => a.d < b.d ? -1 : 1); const base = arr[0].y; arr.forEach(x => { const y = w.mode === 'pct' ? (base ? (x.y - base) / Math.abs(base) * 100 : null) : x.y; if (y == null) return; ((groups[gv] = groups[gv] || {})[x.bx] = groups[gv][x.bx] || []).push(y); }); });
      const gOf = pid => gf ? (catVals(gf, starts[pid].v[gf.key], users)[0] || 'не указано') : 'Все';
      const nG = {}; Object.keys(byP).forEach(pid => { const g = gOf(pid); nG[g] = (nG[g] || 0) + 1; });
      const ser = Object.entries(groups).map(([g, b]) => ({ g, n: nG[g] || 0, pts: TRAJ_X.filter(x => b[x]).map(x => ({ x: TRAJ_X.indexOf(x), y: Math.round(Stats.mean(b[x]) * 10) / 10, k: b[x].length })) })).filter(s => s.pts.length).sort((a, b) => b.n - a.n);
      const yl = w.mode === 'pct' ? `% изменения ${f.label}` : f.label + (f.unit ? ', ' + f.unit : '');
      const one = (s) => { const t = (T || `${f.label}`) + (gf ? `: ${s.g}` : '') + ` (n = ${s.n})`; return chartBox(t, Chart.line(t, [{ pts: s.pts, c: PAL[0] }], { xl: 'Время после операции', yl, xmin: 0, xmax: TRAJ_X.length - 1, fmtX: v => TRAJ_X[v] != null ? trajLbl(TRAJ_X[v]) : '', ymin: w.mode === 'pct' ? Math.min(0, ...s.pts.map(p => p.y)) * 1.1 : undefined }), s.pts.map(p => ({ t: trajLbl(TRAJ_X[p.x]), y: p.y, k: p.k })), [{ key: 't', label: 'Срок' }, { key: 'y', label: 'Среднее' }, { key: 'k', label: 'n' }]); };
      if (!ser.length) { const t = T || f.label; return chartBox(t, DChart.empty(t)); }
      return w.split === false || !gf ? (() => { const t = T || f.label; return chartBox(t, Chart.line(t, ser.map((s, i) => ({ n: `${s.g} (n=${s.n})`, pts: s.pts, c: PAL[i % PAL.length] })), { xl: 'Время после операции', yl, xmin: 0, xmax: TRAJ_X.length - 1, fmtX: v => TRAJ_X[v] != null ? trajLbl(TRAJ_X[v]) : '' })); })() : ser.slice(0, 6).map(one).join('');
    }
  } catch (e) { console.warn(e); return `<div class="card muted">Ошибка графика: ${esc(e.message)}</div>`; }
  return '';
}

function dashEdit(reg, w, onOk) {
  w = clone(w || { id: uid('w'), type: 'donut', et: startEtOf(reg) });
  const m = modal(`<h3>${w.field || w.type !== 'donut' ? 'Настройка графика' : 'Новый график'}</h3><div id="deB"></div><div class="row end"><button class="btn primary" id="deOk">Готово</button></div>`);
  const etO = (sel) => reg.eventTypes.map(e => `<option value="${e.id}" ${sel === e.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('');
  const fO = (et, sel, types) => fieldsOf(reg, et).filter(f => types.includes(f.type)).map(f => `<option value="${f.key}" ${sel === f.key ? 'selected' : ''}>${esc(f.label)}</option>`).join('');
  const CAT = ['select', 'multiselect', 'yesno', 'user', 'complist', 'calc', 'text'], NUM = ['number', 'calc'];
  const draw = () => {
    const t = w.type; let h = `<div class="fld"><label class="flab">Тип графика</label><select class="inp" data-w="type">${Object.entries(DASH_TYPES).map(([k, v]) => `<option value="${k}" ${t === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>`;
    if (!['kpi', 'sex'].includes(t)) h += `<div class="fld"><label class="flab">Форма (событие)</label><select class="inp" data-w="et">${etO(w.et)}</select></div>`;
    if (['donut', 'cmp'].includes(t)) h += `<div class="fld"><label class="flab">Поле</label><select class="inp" data-w="field">${fO(w.et, w.field, CAT)}</select></div>`;
    if (['hist', 'traj'].includes(t)) h += `<div class="fld"><label class="flab">Числовое поле</label><select class="inp" data-w="field">${fO(w.et, w.field, NUM)}</select></div>`;
    if (t === 'traj') h += `<div class="fld"><label class="flab">Показывать</label><select class="inp" data-w="mode"><option value="mean">среднее значение</option><option value="pct" ${w.mode === 'pct' ? 'selected' : ''}>% изменения от первого измерения</option></select></div><div class="fld"><label class="flab">Отдельный график для каждого значения</label><select class="inp" data-w="grp"><option value="">без разбивки</option>${fO(startEtOf(reg), w.grp, ['select', 'yesno', 'user'])}</select></div><label class="chk"><input type="checkbox" id="deSplit" ${w.split === false ? 'checked' : ''}> все группы на одном графике</label><div class="help">Срок считается от даты формы «${esc(etById(reg, startEtOf(reg))?.name || '')}» и округляется до 1, 3, 6, 9 мес, 1-5 лет.</div>`;
    if (t === 'cmp') h += `<div class="help">«Мои» = записи, где вы владелец, автор или указаны в любом поле-пользователе (хирург, ассистент).</div>`;
    h += `<div class="fld"><label class="flab">Заголовок (необязательно)</label><input class="inp" data-w="title" value="${esc(w.title || '')}"></div>`;
    $('#deB', m).innerHTML = h;
  };
  draw();
  m.onchange = e => { const k = e.target.dataset.w; if (e.target.id === 'deSplit') w.split = e.target.checked ? false : undefined; if (!k) return; w[k] = e.target.value; if (k === 'type' || k === 'et') { if (k === 'type' && ['activity'].includes(w.type)) w.et = w.et || startEtOf(reg); w.field = ''; draw(); const fs = $('[data-w=field]', m); if (fs) w.field = fs.value; } };
  $('#deOk', m).onclick = () => { $$('[data-w]', m).forEach(el => w[el.dataset.w] = el.value); if (['donut', 'cmp', 'hist', 'traj'].includes(w.type) && !w.field) return toast('Выберите поле', 'err'); m.close(); onOk(w); };
}

Routes.dashboard = async (main, regId = '') => {
  const regs = await Data.registries();
  const reg0 = regs.find(r => r.id === regId) || regs[0];
  if (!reg0) { main.innerHTML = '<div class="head"><h1>Визуальный дашборд</h1></div>' + emptyState('Нет доступных регистров.'); return; }
  const ds = await loadReg(reg0.id), reg = ds.reg, users = ds.users;
  const st = Routes.dashboard.st && Routes.dashboard.st.reg === reg.id ? Routes.dashboard.st : (Routes.dashboard.st = { reg: reg.id, scope: 'mine', from: '', to: '', edit: false });
  let W = dashGet(reg);
  const inRange = r => (!st.from || r.e.date >= st.from) && (!st.to || r.e.date <= st.to);
  const scopeRows = (rs, forceMine) => (st.scope === 'mine' || forceMine) ? rs.filter(isMine) : rs;
  const mineName = st.scope === 'mine' ? 'Мои случаи' : 'Выбранные случаи';
  const ctx = { reg, ds, users, inRange, scopeRows, mineName };
  const sRows = scopeRows(rowsFor(ds, startEtOf(reg)).filter(inRange));
  const dates = sRows.map(r => r.e.date).sort();
  const hosp = [...new Set(sRows.map(r => r.p.center).filter(Boolean))];
  main.innerHTML = `<div class="head"><h1>Визуальный дашборд</h1><div class="row">${regSelect(regs, reg.id, 'dbReg', false)}</div></div>
    <div class="dash-top card"><div class="dash-sum"><b>${sRows.length}</b> записей${dates.length ? ` с ${fmtDate(dates[0])} по ${fmtDate(dates[dates.length - 1])}` : ''} ${st.scope === 'mine' ? `из всех больниц, где я работаю${hosp.length ? ' (' + esc(hosp.join(', ')) + ')' : ''}: <b>${esc(Auth.user.name)}</b>` : 'по всему регистру'}</div>
    <div class="row"><div class="seg"><button class="btn sm ${st.scope === 'mine' ? 'primary' : ''}" data-sc="mine">Мои данные</button><button class="btn sm ${st.scope === 'all' ? 'primary' : ''}" data-sc="all">Весь регистр</button></div>
    <input class="inp sm" type="date" id="dbFrom" value="${esc(st.from)}" title="с"><input class="inp sm" type="date" id="dbTo" value="${esc(st.to)}" title="по">
    <button class="btn sm" id="dbAdd">+ График</button><button class="btn sm ${st.edit ? 'primary' : ''}" id="dbEdit">${st.edit ? 'Готово' : 'Настроить'}</button><button class="btn sm" id="dbPrint">Печать</button></div></div>
    <div class="dash-grid" id="dbGrid">${W.map((w, i) => `<div class="dw ${w.type === 'kpi' ? 'dw-full' : ''} ${w.type === 'traj' && w.grp && w.split !== false ? 'dw-full dw-multi' : ''}" data-i="${i}">${st.edit ? `<div class="dw-tools"><button class="btn xs" data-mv="-1" title="Выше">↑</button><button class="btn xs" data-mv="1" title="Ниже">↓</button><button class="btn xs" data-ed>Изменить</button><button class="btn xs danger" data-rm>×</button></div>` : ''}${dashWidget(w, ctx)}</div>`).join('') || emptyState('Графиков нет. Нажмите «+ График».')}</div>
    ${st.edit ? '<div class="row"><button class="btn sm" id="dbReset">Вернуть стандартный набор</button></div>' : ''}
    <p class="help">Дашборд строится только по данным, к которым у вас есть доступ. Каждый график можно скачать как SVG, PNG или CSV. Набор графиков сохраняется отдельно для каждого пользователя и регистра.</p>`;
  $('#dbReg').onchange = e => go('dashboard/' + e.target.value);
  $$('[data-sc]').forEach(b => b.onclick = () => { st.scope = b.dataset.sc; App.route(); });
  $('#dbFrom').onchange = e => { st.from = e.target.value; App.route(); }; $('#dbTo').onchange = e => { st.to = e.target.value; App.route(); };
  $('#dbEdit').onclick = () => { st.edit = !st.edit; App.route(); };
  $('#dbPrint').onclick = () => window.print();
  $('#dbAdd').onclick = () => dashEdit(reg, null, async w => { W.push(w); await dashSet(reg, W); App.route(); });
  if ($('#dbReset')) $('#dbReset').onclick = async () => { if (!(await confirmBox('Вернуть стандартный набор графиков?'))) return; Settings.data.dash && delete Settings.data.dash[dashKey(reg.id)]; await Settings.save(); App.route(); };
  $('#dbGrid').onclick = async e => {
    const d = e.target.closest('.dw'); if (!d || !st.edit) return; const i = Number(d.dataset.i);
    if (e.target.dataset.mv) { const j = i + Number(e.target.dataset.mv); if (j < 0 || j >= W.length) return; [W[i], W[j]] = [W[j], W[i]]; await dashSet(reg, W); App.route(); }
    if (e.target.hasAttribute('data-rm')) { W.splice(i, 1); await dashSet(reg, W); App.route(); }
    if (e.target.hasAttribute('data-ed')) dashEdit(reg, W[i], async w => { W[i] = w; await dashSet(reg, W); App.route(); });
  };
};

/* ---------- анкеты PROMs: смайлики, как в рассылке Dendrite ---------- */
const FACES = ['😀', '🙂', '😐', '🙁', '😣', '😖'];
const faceFor = (rank, n) => FACES[Math.min(FACES.length - 1, Math.round(rank / Math.max(1, n - 1) * (FACES.length - 1)))];
const FACE_COL = ['#2e9d57', '#7cb342', '#d4a017', '#ef8a2f', '#d9534f', '#a8322b'];
const _pfill = Proms.fill;
Proms.fill = function (pr, reg) {
  _pfill.call(this, pr, reg);
  const ins = reg.instruments.find(i => i.id === pr.instrumentId); const root = $$('.patient-mode').pop(); if (!ins || !root) return;
  const hb = ins.higherBetter != null ? ins.higherBetter : /удовлетвор|качеств.*жизн|satisf/i.test(ins.name);
  const KEY = 'addall2.promsView'; const apply = (on) => {
    root.classList.toggle('pq-faces', on);
    $$('.pq', root).forEach((q, k) => {
      const it = ins.items[k]; if (!it) return; const sc = it.options.map(o => Number(o.s)); const uniq = [...new Set(sc)].sort((a, b) => a - b);
      const flat = uniq.length < 2; q.classList.toggle('pq-scale', on && it.options.length >= 7);
      $$('.pq-o', q).forEach((lab, j) => {
        let f = $('.pq-face', lab); if (f) f.remove(); if (!on || flat) return;
        const r = uniq.indexOf(sc[j]), rank = hb ? uniq.length - 1 - r : r, n = uniq.length; const fi = Math.min(FACES.length - 1, Math.round(rank / Math.max(1, n - 1) * (FACES.length - 1)));
        f = document.createElement('span'); f.className = 'pq-face'; f.textContent = FACES[fi]; f.style.setProperty('--fc', FACE_COL[fi]); lab.insertBefore(f, lab.querySelector('span'));
      });
    });
  };
  const sw = document.createElement('div'); sw.className = 'row end pq-sw'; sw.innerHTML = `<label class="chk"><input type="checkbox" id="pqFaces"> Смайлики и крупные кнопки (удобно на телефоне)</label>`;
  root.querySelector('h2').after(sw);
  let on = true; try { on = localStorage.getItem(KEY) !== 'list'; } catch (e) {}
  $('#pqFaces', root).checked = on; apply(on);
  $('#pqFaces', root).onchange = e => { try { localStorage.setItem(KEY, e.target.checked ? 'faces' : 'list'); } catch (er) {} apply(e.target.checked); };
};

/* ---------- английский словарь для новых строк ---------- */
if (typeof EN === 'object') Object.assign(EN, { 'Визуальный дашборд': 'Visual dashboard', 'Мои данные': 'My data', 'Весь регистр': 'Whole registry', '+ График': '+ Chart', 'Настроить': 'Customise', 'Печать': 'Print', 'Готово': 'Done' });
