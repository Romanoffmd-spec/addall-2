/* AddAll 2.0: схемы регистров, движок форм, расчёты, шаблоны */
'use strict';

const FIELD_TYPES = {
  text: 'Текст', textarea: 'Длинный текст', number: 'Число', date: 'Дата', select: 'Выбор (один)',
  multiselect: 'Выбор (несколько)', yesno: 'Да / Нет', calc: 'Расчётное поле', complist: 'Осложнения (Clavien-Dindo + CCI)',
  user: 'Сотрудник (хирург, врач)', icd10: 'Диагноз по МКБ-10', icdo: 'Морфология по МКБ-О', patient: 'Пациент (ссылка на карточку)',
  group: 'Вложенные записи (повторяющаяся группа)'
};
/* особые значения поля «Сотрудник» */
const USER_SPECIAL = { __guest: 'Приглашённый (иностранный) хирург', __ext: 'Хирург, не зарегистрированный в системе' };
function recentUsers() { try { return JSON.parse(localStorage.getItem('addall2.recentUsers.' + (Auth.user?.id || '')) || '[]'); } catch (e) { return []; } }
function rememberUsers(et, data) {
  try { const ids = formFields(et).filter(f => f.type === 'user').map(f => data[f.key]).filter(v => v && !USER_SPECIAL[v]);
    const r = [...new Set([...ids, ...recentUsers()])].slice(0, 8); localStorage.setItem('addall2.recentUsers.' + Auth.user.id, JSON.stringify(r)); } catch (e) {}
}
/* кликабельные схемы для выбора (синхронно с вариантами ответа) */
const DIAGRAMS = {
  ehs: { n: 'Вентральная грыжа: классификация EHS', vb: '0 0 300 300', bg: '<path d="M70 20 Q40 150 60 280 L240 280 Q260 150 230 20 Z" fill="none" stroke="#9aa3c7" stroke-width="2"/><circle cx="150" cy="150" r="5" fill="none" stroke="#9aa3c7"/>',
    r: [['M1 субксифоидальная', 'M115 25h70v45h-70z'], ['M2 эпигастральная', 'M115 72h70v55h-70z'], ['M3 пупочная', 'M115 129h70v42h-70z'], ['M4 инфраумбиликальная', 'M115 173h70v52h-70z'], ['M5 надлобковая', 'M115 227h70v48h-70z'],
      ['L1 подрёберная', 'M62 25h50v80h-50zM188 25h50v80h-50z'], ['L2 боковая (фланк)', 'M58 107h54v80h-54zM188 107h54v80h-54z'], ['L3 подвздошная', 'M60 189h52v86h-52zM188 189h52v86h-52z'], ['L4 поясничная', 'M250 120h44v70h-44z']] },
  colon: { n: 'Толстая кишка: отделы', vb: '0 0 300 260', bg: '',
    r: [['слепая', 'M40 200h40v40h-40z'], ['восходящая', 'M40 90h40v108h-40z'], ['печёночный изгиб', 'M40 40h50v48h-50z'], ['поперечная ободочная', 'M92 40h116v40h-116z'], ['селезёночный изгиб', 'M210 40h50v48h-50z'], ['нисходящая', 'M220 90h40v100h-40z'], ['сигмовидная', 'M160 192h100v34h-100z'], ['ректосигмоидный отдел', 'M130 200h28v26h-28z'], ['прямая кишка', 'M128 228h32v28h-32z']] },
  abd9: { n: 'Живот: 9 областей', vb: '0 0 300 300', bg: '',
    r: [['правое подреберье', 'M20 20h86v86h-86z'], ['эпигастрий', 'M107 20h86v86h-86z'], ['левое подреберье', 'M194 20h86v86h-86z'], ['правый фланк', 'M20 107h86v86h-86z'], ['пупочная область', 'M107 107h86v86h-86z'], ['левый фланк', 'M194 107h86v86h-86z'], ['правая подвздошная', 'M20 194h86v86h-86z'], ['надлобковая', 'M107 194h86v86h-86z'], ['левая подвздошная', 'M194 194h86v86h-86z']] },
  lln: { n: 'Латеральные лимфоузлы таза (JSCCR)', vb: '0 0 300 220', bg: '<path d="M150 10V70M150 70L70 200M150 70L230 200" stroke="#9aa3c7" stroke-width="3" fill="none"/>',
    r: [['273 справа', 'M95 72h30v26h-30z'], ['273 слева', 'M175 72h30v26h-30z'], ['293 справа', 'M50 110h34v28h-34z'], ['293 слева', 'M216 110h34v28h-34z'], ['263P справа', 'M100 110h34v28h-34z'], ['263P слева', 'M166 110h34v28h-34z'], ['263D справа', 'M90 150h34v28h-34z'], ['263D слева', 'M176 150h34v28h-34z'], ['283 справа', 'M40 160h40v30h-40z'], ['283 слева', 'M220 160h40v30h-40z']] }
};
function diagramSVG(f, v) { const D = DIAGRAMS[f.diagram]; if (!D) return ''; const sel = [].concat(v || []);
  return `<svg class="dgm" viewBox="${D.vb}" data-dgm="${f.key}">${D.bg}${D.r.map(([o, d]) => `<path d="${d}" class="dgr${sel.includes(o) ? ' on' : ''}" data-o="${esc(o)}"><title>${esc(o)}</title></path>`).join('')}${D.r.map(([o, d]) => { const m = d.match(/M(\d+) (\d+)h(\d+)v(\d+)/) || d.match(/M(\d+)\s*(\d+)h(\d+)v(\d+)/); return m ? `<text x="${+m[1] + +m[3] / 2}" y="${+m[2] + +m[4] / 2 + 4}" text-anchor="middle" class="dgt">${esc(o.split(' ')[0])}</text>` : ''; }).join('')}</svg>`; }
function optUse(key) { try { return JSON.parse(localStorage.getItem('addall2.optUse.' + key) || '{}'); } catch (e) { return {}; } }
function rememberOpts(et, data) { try { formFields(et).filter(f => f.type === 'select' && (f.search || (f.options || []).length > 20) && data[f.key]).forEach(f => { const u = optUse(f.key); u[data[f.key]] = (u[data[f.key]] || 0) + 1; localStorage.setItem('addall2.optUse.' + f.key, JSON.stringify(u)); }); } catch (e) {} }
/* вложенные записи: краткая подпись одной записи */
function grpSummary(f, it, users) { const sf = (f.subfields || []).filter(x => x.type !== 'group'); const parts = sf.slice(0, 4).map(x => isEmpty(it[x.key]) ? null : `${x.label}: ${typeof showVal === 'function' ? String(showVal(x, it[x.key], users)).replace(/<[^>]+>/g, '') : it[x.key]}`).filter(Boolean);
  const nested = (f.subfields || []).filter(x => x.type === 'group').map(x => `${x.label}: ${(it[x.key] || []).length}`); return [...parts, ...nested].join(' · ') || 'пустая запись'; }
function grpHTML(f, list, users) {
  return `<div class="grp-list">${list.map((it, i) => `<div class="grp-it" data-gi="${i}"><span class="grp-n">${esc(f.itemLabel || f.label)} ${i + 1}</span><span class="grp-s">${esc(grpSummary(f, it, users))}</span><button class="btn xs" type="button" data-ged="${i}">Открыть</button><button class="btn xs" type="button" data-gdel="${i}">×</button></div>`).join('') || '<div class="muted small">Записей нет</div>'}</div>
    <button class="btn sm" type="button" data-gadd>+ ${esc(f.itemLabel || 'Добавить')}</button>`;
}
/* разбор описания вложенных полей: «Подпись | тип | варианты через ;», вложенность отступом */
const TYPE_ALIAS = { текст: 'text', число: 'number', дата: 'date', выбор: 'select', несколько: 'multiselect', 'да/нет': 'yesno', группа: 'group', сотрудник: 'user', 'длинный текст': 'textarea' };
function parseSubfields(txt) {
  const root = { subfields: [] }; const stack = [{ ind: -1, node: root }]; const used = new Set();
  String(txt || '').split('\n').forEach(line => {
    if (!line.trim()) return; const ind = line.match(/^\s*/)[0].replace(/\t/g, '  ').length;
    const [label, t0, opt, unit] = line.trim().split('|').map(x => (x || '').trim());
    let type = (t0 || 'text').toLowerCase(); type = TYPE_ALIAS[type] || (FIELD_TYPES[type] ? type : 'text');
    let key = slug(label).replace(/[^\wЀ-ӿ]/g, '_') || 'f'; let k2 = key, n = 2; while (used.has(k2)) k2 = key + '_' + n++; used.add(k2);
    const f = { key: k2, label, type, options: ['select', 'multiselect'].includes(type) ? (opt || '').split(';').map(x => x.trim()).filter(Boolean) : [], unit: type === 'number' ? (opt || unit || '') : (unit || '') };
    if (type === 'group') { f.subfields = []; f.itemLabel = opt || ''; }
    while (stack.length > 1 && stack[stack.length - 1].ind >= ind) stack.pop();
    const parent = stack[stack.length - 1].node; (parent.subfields = parent.subfields || []).push(f);
    if (type === 'group') stack.push({ ind, node: f });
  });
  return root.subfields;
}
function stringifySubfields(list, d = 0) {
  const rev = Object.fromEntries(Object.entries(TYPE_ALIAS).map(([a, b]) => [b, a]));
  return (list || []).map(f => '  '.repeat(d) + [f.label, rev[f.type] || f.type, f.type === 'group' ? (f.itemLabel || '') : f.type === 'number' ? (f.unit || '') : (f.options || []).join('; ')].join(' | ').replace(/( \| )+$/, '') + (f.type === 'group' ? '\n' + stringifySubfields(f.subfields, d + 1) : '')).join('\n').replace(/\n+$/,'');
}
function groupItemDialog(reg, patient, f, item, users, done, ro) {
  const pseudo = { id: 'grp_' + f.key, name: f.label, sections: [{ id: 'g', title: f.itemLabel || f.label, fields: f.subfields || [] }] };
  const m = modal(`<h3>${esc(f.itemLabel || f.label)}</h3><div id="giForm"></div><div class="row end">${ro ? '' : '<button class="btn primary" id="giOk">Готово</button>'}</div>`, { wide: true });
  const read = renderEventForm($('#giForm', m), reg, patient, pseudo, item || {}, today(), users);
  if (ro) $$('input,select,textarea,button[data-gadd],button[data-gdel]', m).forEach(x => x.disabled = true);
  if (!ro) $('#giOk', m).onclick = () => { done(read().data); m.close(); };
}
const OPS = { eq: '=', ne: '≠', gt: '>', lt: '<', in: 'одно из (несколько)', filled: 'заполнено', empty: 'пусто' };
const CD_GRADES = ['I', 'II', 'IIIa', 'IIIb', 'IVa', 'IVb', 'V'];
const CCI_W = { I: 300, II: 1750, IIIa: 2750, IIIb: 4550, IVa: 7200, IVb: 8550, V: 10000 };

/* ---------- функции, доступные в формулах ---------- */
const FX = {
  age(birth, at) { if (!birth) return null; const a = new Date(at || Date.now()), b = new Date(birth); let y = a.getFullYear() - b.getFullYear(); if (a.getMonth() < b.getMonth() || (a.getMonth() === b.getMonth() && a.getDate() < b.getDate())) y--; return y; },
  days(a, b) { if (!a || !b) return null; return daysBetween(a, b); },
  bmi(h, w) { if (!h || !w) return null; const m = h > 3 ? h / 100 : h; return Math.round(w / (m * m) * 10) / 10; },
  round(x, n = 0) { if (x == null || x === '' || isNaN(x)) return null; const k = Math.pow(10, n); return Math.round(x * k) / k; },
  /* Comprehensive Complication Index (Slankamenac 2013): sqrt(сумма весов) / 2; при степени V индекс равен 100 */
  cci(list) { if (!Array.isArray(list) || !list.length) return 0; if (list.some(c => c.grade === 'V')) return 100; const s = list.reduce((t, c) => t + (CCI_W[c.grade] || 0), 0); return Math.min(100, Math.round(Math.sqrt(s) / 2 * 10) / 10); },
  maxcd(list) { if (!Array.isArray(list) || !list.length) return '0'; let m = -1; list.forEach(c => { const i = CD_GRADES.indexOf(c.grade); if (i > m) m = i; }); return m < 0 ? '0' : CD_GRADES[m]; },
  ifelse(c, a, b) { return c ? a : b; },
  /* вложенные записи: число записей, сумма поля, есть ли запись с значением */
  count(list) { return Array.isArray(list) ? list.filter(x => !/^(нет|ничего|отсутствуют|none)$/i.test(String(x))).length : 0; },
  /* сумма баллов «(n)» по выбранным вариантам; возрастные баллы Charlson */
  ptsum(list) { return [].concat(list || []).reduce((s, x) => s + (FX.pt(x) || 0), 0); },
  chAge(age) { if (age == null || isNaN(age)) return null; return age < 50 ? 0 : age < 60 ? 1 : age < 70 ? 2 : age < 80 ? 3 : 4; },
  sumOf(list, k) { return Array.isArray(list) ? list.reduce((s, x) => s + (Number(x?.[k]) || 0), 0) : 0; },
  anyOf(list, k, v) { return Array.isArray(list) && list.some(x => String(x?.[k]) === String(v)) ? 'да' : 'нет'; },
  today() { return today(); },
  /* баллы из варианта ответа вида «... (4)» */
  pt(s) { const m = String(s ?? '').match(/\((\d+)\)\s*$/); return m ? Number(m[1]) : null; },
  hbg(hb) { if (hb == null || hb === '') return null; hb = Number(hb); return hb > 30 ? hb / 10 : hb; },
  /* ---------- CR-POSSUM (Tekkis 2004) ---------- */
  crpPS(age, cardiac, sbp, pulse, urea, hb) {
    hb = FX.hbg(hb); const c = FX.pt(cardiac);
    if ([age, sbp, pulse, urea, hb, c].some(v => v == null || v === '' || isNaN(v))) return null;
    const a = age <= 60 ? 1 : age <= 70 ? 3 : age <= 80 ? 4 : 8; /* Tekkis 2004, табл. 1: 1 / 3 / 4 / 8 (исправлено в 2.11, было 1 / 2 / 3 / 8) */
    const b = sbp >= 100 && sbp <= 170 ? 1 : sbp > 170 || sbp >= 90 ? 2 : 3;
    const p = pulse >= 40 && pulse <= 100 ? 1 : pulse > 100 && pulse <= 120 ? 2 : 3;
    const u = urea <= 10 ? 1 : urea <= 15 ? 2 : 3;
    const h = hb >= 13 && hb <= 16 ? 1 : (hb >= 10 && hb < 13) || (hb > 16 && hb <= 18) ? 2 : 3;
    return a + c + b + p + u + h;
  },
  crpOS(severity, soiling, cancer, urgency) {
    const u = FX.pt(urgency) ?? ({ 'плановая': 1, 'срочная': 3, 'экстренная': 8 })[String(urgency || '').toLowerCase()];
    const v = [FX.pt(severity), FX.pt(soiling), FX.pt(cancer), u]; if (v.some(x => x == null)) return null; return v.reduce((s, x) => s + x, 0);
  },
  crpossum(ps, os) { if (ps == null || os == null) return null; return Math.round(100 / (1 + Math.exp(-(-9.167 + 0.338 * ps + 0.308 * os))) * 10) / 10; },
  /* ---------- POSSUM / P-POSSUM (Copeland 1991, Prytherch 1998) ---------- */
  pPS(age, cardiac, resp, sbp, pulse, gcs, hb, wcc, urea, na, k, ecg) {
    hb = FX.hbg(hb); const c = FX.pt(cardiac), r = FX.pt(resp), e = FX.pt(ecg);
    if ([age, sbp, pulse, gcs, hb, wcc, urea, na, k, c, r, e].some(v => v == null || v === '' || isNaN(v))) return null;
    const A = age <= 60 ? 1 : age <= 70 ? 2 : 4;
    const B = sbp >= 110 && sbp <= 130 ? 1 : (sbp >= 100 && sbp < 110) || (sbp > 130 && sbp <= 170) ? 2 : (sbp >= 90 && sbp < 100) || sbp > 170 ? 4 : 8;
    const P = pulse >= 50 && pulse <= 80 ? 1 : (pulse >= 40 && pulse < 50) || (pulse > 80 && pulse <= 100) ? 2 : pulse > 100 && pulse <= 120 ? 4 : 8;
    const G = gcs >= 15 ? 1 : gcs >= 12 ? 2 : gcs >= 9 ? 4 : 8;
    const H = hb >= 13 && hb <= 16 ? 1 : (hb >= 11.5 && hb < 13) || (hb > 16 && hb <= 17) ? 2 : (hb >= 10 && hb < 11.5) || (hb > 17 && hb <= 18) ? 4 : 8;
    const W = wcc >= 4 && wcc <= 10 ? 1 : (wcc > 3 && wcc < 4) || (wcc > 10 && wcc <= 20) ? 2 : 4;
    const U = urea <= 7.5 ? 1 : urea <= 10 ? 2 : urea <= 15 ? 4 : 8;
    const N = na >= 136 ? 1 : na >= 131 ? 2 : na >= 126 ? 4 : 8;
    const K = k >= 3.5 && k <= 5 ? 1 : (k >= 3.2 && k < 3.5) || (k > 5 && k <= 5.3) ? 2 : (k >= 2.9 && k < 3.2) || (k > 5.3 && k < 6) ? 4 : 8;
    return A + c + r + B + P + G + H + W + U + N + K + e;
  },
  pOS(severity, nproc, blood, soiling, malig, urgency) {
    const n = nproc == null || nproc === '' ? null : Number(nproc) <= 1 ? 1 : Number(nproc) === 2 ? 4 : 8;
    const b = blood == null || blood === '' ? null : blood <= 100 ? 1 : blood <= 500 ? 2 : blood < 1000 ? 4 : 8;
    const v = [FX.pt(severity), n, b, FX.pt(soiling), FX.pt(malig), FX.pt(urgency)]; if (v.some(x => x == null)) return null; return v.reduce((s, x) => s + x, 0);
  },
  ppossum(ps, os) { if (ps == null || os == null) return null; return Math.round(100 / (1 + Math.exp(-(-9.065 + 0.1692 * ps + 0.155 * os))) * 10) / 10; },
  possumMorb(ps, os) { if (ps == null || os == null) return null; return Math.round(100 / (1 + Math.exp(-(-5.91 + 0.16 * ps + 0.19 * os))) * 10) / 10; },
  logit(x) { return x == null ? null : Math.round(1 / (1 + Math.exp(-x)) * 10000) / 10000; },
  num(x) { const n = parseFloat(String(x).replace(',', '.')); return isNaN(n) ? null : n; }
};

const RESERVED = new Set('break case catch class const continue debugger default delete do else enum export extends false finally for function if import in instanceof new null return super switch this throw true try typeof var void while with yield let static implements interface package private protected public await arguments eval'.split(' '));
function evalFormula(formula, vars) {
  try {
    const keys = Object.keys(vars).filter(k => /^[A-Za-z_Ѐ-ӿ][\wЀ-ӿ]*$/.test(k));
    const fn = new Function(...keys, ...Object.keys(FX), `"use strict"; return (${formula});`);
    const v = fn(...keys.map(k => vars[k]), ...Object.values(FX));
    return (v === undefined || (typeof v === 'number' && !isFinite(v))) ? null : v;
  } catch (e) { return null; }
}

function isEmpty(v) { return v == null || v === '' || (Array.isArray(v) && !v.length); }

function condOK(cond, vals) {
  if (!cond || !cond.key) return true;
  const v = vals[cond.key], t = cond.value;
  switch (cond.op) {
    case 'eq': return String(v ?? '') === String(t ?? '');
    case 'ne': return String(v ?? '') !== String(t ?? '');
    case 'gt': return Number(v) > Number(t);
    case 'lt': return Number(v) < Number(t);
    case 'in': return String(t || '').split(/[;,]/).map(s => s.trim()).includes(String(v ?? '')) || (Array.isArray(v) && v.some(x => String(t).includes(x)));
    case 'filled': return !isEmpty(v);
    case 'empty': return isEmpty(v);
    default: return true;
  }
}

/* все поля формы события плоским списком */
const formFields = (et) => (et?.sections || []).flatMap(s => s.fields || []);

/* значения с расчётами: patient + event */
function computeValues(reg, patient, et, data, eventDate) {
  const vals = { ...(patient?.data || {}), birthDate: patient?.birthDate, sex: patient?.sex, eventDate, ...(data || {}) };
  vals._center = patient?.center || ''; vals.vital = patient?.vital || ''; vals.deathDate = patient?.deathDate || ''; vals.funding = patient?.funding || '';
  formFields(et).forEach(f => { if (!(f.key in vals)) vals[f.key] = null; });
  for (let pass = 0; pass < 2; pass++) {
    formFields(et).filter(f => f.type === 'calc' && f.formula).forEach(f => { vals[f.key] = evalFormula(f.formula, vals); });
  }
  return vals;
}

function validateEvent(et, vals) {
  const errs = [];
  formFields(et).forEach(f => {
    if (!condOK(f.showIf, vals)) return;
    const v = vals[f.key];
    if (f.required && isEmpty(v) && f.type !== 'calc') errs.push(`«${f.label}»: обязательно`);
    if (f.type === 'number' && !isEmpty(v)) {
      if (f.min !== '' && f.min != null && Number(v) < Number(f.min)) errs.push(`«${f.label}»: меньше ${f.min}`);
      if (f.max !== '' && f.max != null && Number(v) > Number(f.max)) errs.push(`«${f.label}»: больше ${f.max}`);
    }
    if (f.type === 'date' && !isEmpty(v) && v > addDays(today(), 1)) errs.push(`«${f.label}»: дата в будущем`);
  });
  return errs;
}

/* полнота: доля заполненных видимых полей (ключевые = обязательные или отмеченные key) */
function completeness(et, vals) {
  let total = 0, filled = 0; const missing = [];
  formFields(et).forEach(f => {
    if (f.type === 'calc' || !condOK(f.showIf, vals)) return;
    if (!(f.required || f.key_)) return;
    total++; if (!isEmpty(vals[f.key])) filled++; else missing.push(f.label);
  });
  return { total, filled, pct: total ? Math.round(filled / total * 100) : 100, missing };
}

/* отображение значения */
function showVal(f, v, users) {
  if (isEmpty(v)) return '<span class="muted">не указано</span>';
  if (f.type === 'date') return fmtDate(v);
  if (f.type === 'yesno') return v === 'да' ? 'Да' : v === 'нет' ? 'Нет' : esc(v);
  if (f.type === 'multiselect') return esc([].concat(v).join(', '));
  if (f.type === 'complist') return v.length ? v.map(c => `${esc(c.name)} <span class="tag">CD ${esc(c.grade)}</span>`).join('<br>') + `<div class="muted">CCI ${FX.cci(v)}</div>` : 'нет';
  if (f.type === 'user') { if (USER_SPECIAL[v]) return esc(USER_SPECIAL[v]); const u = (users || []).find(x => x.id === v); return u ? esc(u.name) : esc(v); }
  if (f.type === 'patient') { const p = (window.__PTS || []).find(x => x.id === v); return p ? `<a href="#patient/${p.id}">${esc(pname(p))}</a>` : esc(v); }
  if (f.type === 'group') return Array.isArray(v) ? `${v.length} зап.: ${v.slice(0, 3).map(it => esc(grpSummary(f, it, users))).join('; ')}` : '';
  return esc(v) + (f.unit ? ' ' + esc(f.unit) : '');
}

/* ---------- рендер поля ввода ---------- */
function fieldInput(f, v, users) {
  const id = 'fld_' + f.key, req = f.required ? ' <i class="req">*</i>' : '';
  const def = f.def ? `<span class="def" title="${esc(f.def)}">?</span>` : '';
  const lab = `<label class="flab" for="${id}">${esc(f.label)}${req}${f.unit ? ` <small>(${esc(f.unit)})</small>` : ''} ${def}</label>`;
  const opts = (f.options || []);
  let inp = '';
  switch (f.type) {
    case 'textarea': inp = `<textarea class="inp" id="${id}" data-k="${f.key}" rows="3">${esc(v || '')}</textarea>`; break;
    case 'number': inp = `<input class="inp" type="number" step="any" id="${id}" data-k="${f.key}" value="${esc(v ?? '')}" ${f.min !== '' && f.min != null ? `min="${f.min}"` : ''} ${f.max !== '' && f.max != null ? `max="${f.max}"` : ''}>`; break;
    case 'date': inp = `<input class="inp" type="date" id="${id}" data-k="${f.key}" value="${esc(v || '')}">`; break;
    case 'select': if ((f.search || opts.length > 20) && !f.diagram) { const u = optUse(f.key); const so = [...opts].sort((a, b) => (u[b] || 0) - (u[a] || 0)); inp = `<input class="inp srch" id="${id}" data-k="${f.key}" data-opts="1" list="dl_${f.key}" value="${esc(v ?? '')}" placeholder="Начните вводить: поиск по ${opts.length} вариантам" autocomplete="off"><datalist id="dl_${f.key}">${so.map(o => `<option value="${esc(o)}">${u[o] ? '★ часто' : ''}</option>`).join('')}</datalist>`; break; }
      inp = `<select class="inp" id="${id}" data-k="${f.key}"><option value=""></option>${opts.map(o => `<option ${String(v) === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>${f.diagram ? diagramSVG(f, v) : ''}`; break;
    case 'multiselect': inp = `<div class="chips" id="${id}" data-k="${f.key}" data-multi="1">${opts.map(o => `<label class="chip"><input type="checkbox" value="${esc(o)}" ${[].concat(v || []).includes(o) ? 'checked' : ''}>${esc(o)}</label>`).join('')}</div>${f.diagram ? diagramSVG(f, v) : ''}`; break;
    case 'yesno': inp = `<div class="seg" id="${id}" data-k="${f.key}" data-seg="1">${['да', 'нет', 'неизвестно'].map(o => `<label><input type="radio" name="${id}" value="${o}" ${v === o ? 'checked' : ''}><span>${o}</span></label>`).join('')}</div>`; break;
    case 'user': { const act = (users || []).filter(u => u.active !== false); const me = Auth.user?.id; const rec = recentUsers().filter(id => id !== me && act.some(u => u.id === id));
      const top = [me, ...rec].filter(id => act.some(u => u.id === id)); const rest = act.filter(u => !top.includes(u.id)).sort((a, b) => a.name.localeCompare(b.name));
      const o = u => `<option value="${u.id}" ${v === u.id ? 'selected' : ''}>${esc(u.name)}${u.position ? ' · ' + esc(u.position) : ''}${u.id === me ? ' (я)' : ''}</option>`;
      inp = `<select class="inp" id="${id}" data-k="${f.key}"><option value=""></option>${top.length ? `<optgroup label="Я и недавние">${top.map(id => o(act.find(u => u.id === id))).join('')}</optgroup>` : ''}<optgroup label="Особые">${Object.entries(USER_SPECIAL).map(([k, t]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${t}</option>`).join('')}</optgroup><optgroup label="Все сотрудники">${rest.map(o).join('')}</optgroup></select>`; break; }
    case 'group': inp = `<div class="grp" id="${id}" data-k="${f.key}" data-grp="1" data-val="${esc(JSON.stringify(Array.isArray(v) ? v : []))}">${grpHTML(f, Array.isArray(v) ? v : [], users)}</div>`; break;
    case 'icd10': case 'icdo': inp = `<input class="inp" id="${id}" data-k="${f.key}" data-icd="${f.type}" value="${esc(v ?? '')}" placeholder="${f.type === 'icd10' ? 'Код или слово: C20, прямой кишки' : 'Код или слово: 8140/3, аденокарцинома'}" autocomplete="off">`; break;
    case 'patient': { const P = window.__PTS || []; const p = P.find(x => x.id === v); inp = `<input class="inp" id="${id}" data-k="${f.key}" data-pat="1" list="dl_pts" value="${esc(p ? (p.localId + ' · ' + pname(p)) : '')}" placeholder="№ ИБ или ФИО"><datalist id="dl_pts">${P.slice(0, 2000).map(x => `<option value="${esc(x.localId + ' · ' + pname(x))}">`).join('')}</datalist>`; break; }
    case 'calc': inp = `<div class="calc" id="${id}" data-calc="${f.key}">${isEmpty(v) ? '—' : esc(v)}</div>`; break;
    case 'complist': inp = `<div class="complist" id="${id}" data-k="${f.key}" data-comp="1">${compRows(v || [], f)}</div>`; break;
    default: inp = `<input class="inp" id="${id}" data-k="${f.key}" value="${esc(v ?? '')}">`;
  }
  return `<div class="fld ${f.type === 'textarea' || f.type === 'complist' || f.type === 'multiselect' || f.type === 'group' ? 'wide' : ''}${f.required ? ' isreq' : f.key_ ? ' isdes' : ''}" data-wrap="${f.key}">${lab}${inp}${f.help ? `<div class="help">${esc(f.help)}</div>` : ''}${f.warn ? `<div class="fwarn">${esc(f.warn)}</div>` : ''}</div>`;
}
function compRows(list, f) {
  const names = f.options || [];
  return `<div class="comp-rows">${list.map((c, i) => `<div class="comp-row" data-i="${i}">
      <input class="inp" list="cl_${f.key}" value="${esc(c.name)}" data-cn placeholder="Осложнение">
      <select class="inp" data-cg>${CD_GRADES.map(g => `<option ${c.grade === g ? 'selected' : ''}>${g}</option>`).join('')}</select>
      <input class="inp" type="date" value="${esc(c.date || '')}" data-cd>
      <button class="btn sm" data-crm type="button">×</button></div>`).join('')}</div>
    <datalist id="cl_${f.key}">${names.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
    <button class="btn sm" data-cadd type="button">+ Осложнение</button> <span class="muted" data-cci>CCI: ${FX.cci(list)} · макс. CD: ${FX.maxcd(list)}</span>`;
}

/* собрать значения из DOM формы */
function readForm(root) {
  const vals = {};
  $$('[data-k]', root).forEach(el => {
    const k = el.dataset.k;
    if (el.dataset.grp) { try { vals[k] = JSON.parse(el.dataset.val || '[]'); } catch (e) { vals[k] = []; } return; }
    if (el.closest('[data-grp]') && el.closest('[data-grp]') !== el) return;
    if (el.dataset.multi) vals[k] = $$('input:checked', el).map(i => i.value);
    else if (el.dataset.seg) { const c = $('input:checked', el); vals[k] = c ? c.value : ''; }
    else if (el.dataset.comp) vals[k] = $$('.comp-row', el).map(r => ({ name: $('[data-cn]', r).value.trim(), grade: $('[data-cg]', r).value, date: $('[data-cd]', r).value })).filter(c => c.name);
    else if (el.dataset.pat) { const lid = el.value.split(' · ')[0].trim(); const p = (window.__PTS || []).find(x => x.localId === lid); vals[k] = p ? p.id : ''; }
    else if (el.type === 'number') vals[k] = el.value === '' ? '' : Number(el.value);
    else vals[k] = el.value;
  });
  return vals;
}

/* форма события: возвращает элемент и функцию получения значений */
function renderEventForm(root, reg, patient, et, data, eventDate, users) {
  const vals = computeValues(reg, patient, et, data, eventDate);
  root.innerHTML = (et.sections || []).map((s, i) => `<fieldset class="sec" data-page="${i}"><legend>${esc(s.title)}</legend>${s.note ? `<div class="fwarn sec-note">${esc(s.note)}</div>` : ''}<div class="grid">${(s.fields || []).map(f => fieldInput(f, vals[f.key], users)).join('')}</div></fieldset>`).join('') || '<p class="muted">В этой форме пока нет полей. Добавьте их в конструкторе регистра.</p>';
  const refresh = () => {
    const cur = { ...readForm(root) };
    const dateEl = root.closest('.modal')?.querySelector('#evDate');
    const all = computeValues(reg, patient, et, cur, dateEl ? dateEl.value : eventDate);
    formFields(et).forEach(f => {
      const w = $(`[data-wrap="${f.key}"]`, root); if (!w) return;
      w.style.display = condOK(f.showIf, all) ? '' : 'none';
      w.classList.toggle('ans', !isEmpty(f.type === 'calc' ? all[f.key] : cur[f.key]));
      if (f.diagram) { const sel = [].concat(cur[f.key] || []); $$('.dgr', w).forEach(r => r.classList.toggle('on', sel.includes(r.dataset.o))); }
      if (f.type === 'multiselect') { const box = $('[data-multi]', w); const none = $$('input', box).find(i => /^(нет|ничего|отсутствуют|none|не было)$/i.test(i.value)); if (none) $$('input', box).forEach(i => { if (i !== none) { if (none.checked) i.checked = false; i.disabled = none.checked; i.closest('.chip')?.classList.toggle('dis', none.checked); } }); }
      if (f.type === 'select' && (f.search || (f.options || []).length > 20) && !f.diagram) { const el = $('[data-k]', w); if (el && el.value && !f.options.includes(el.value)) el.classList.add('badopt'); else el?.classList.remove('badopt'); }
      if (f.type === 'calc') { const c = $('[data-calc]', w); c.textContent = isEmpty(all[f.key]) ? '—' : all[f.key]; }
    });
    $$('[data-comp]', root).forEach(el => { const l = cur[el.dataset.k] || []; const s = $('[data-cci]', el); if (s) s.textContent = `CCI: ${FX.cci(l)} · макс. CD: ${FX.maxcd(l)}`; });
  };
  root.oninput = refresh; root.onchange = refresh;
  /* двойной щелчок по варианту «да/нет» очищает ответ */
  root.ondblclick = (e) => { const seg = e.target.closest('[data-seg]'); if (!seg || root.dataset.ro) return; $$('input', seg).forEach(i => i.checked = false); refresh(); };
  root.onclick = (e) => {
    const dg = e.target.closest('.dgr');
    if (dg && !root.dataset.ro) { const w = dg.closest('[data-wrap]'); const f = formFields(et).find(x => x.key === w.dataset.wrap); const o = dg.dataset.o;
      if (f.type === 'multiselect') { const cb = $$('[data-multi] input', w).find(i => i.value === o); if (cb && !cb.disabled) cb.checked = !cb.checked; }
      else { const sel = $('select[data-k]', w); if (sel) sel.value = sel.value === o ? '' : o; }
      refresh(); return; }
    const gb = e.target.closest('[data-gadd],[data-ged],[data-gdel]');
    if (gb) {
      const box = gb.closest('[data-grp]'); const f = formFields(et).find(x => x.key === box.dataset.k); let list = []; try { list = JSON.parse(box.dataset.val || '[]'); } catch (x) {}
      const put = (l) => { box.dataset.val = JSON.stringify(l); box.innerHTML = grpHTML(f, l, users); refresh(); };
      const ro = !!gb.closest('[data-ro]');
      if (gb.dataset.gdel != null) { confirmBox('Удалить запись «' + (f.itemLabel || f.label) + ' ' + (Number(gb.dataset.gdel) + 1) + '» вместе с вложенными?').then(ok => { if (ok) { list.splice(Number(gb.dataset.gdel), 1); put(list); } }); return; }
      const i = gb.dataset.ged != null ? Number(gb.dataset.ged) : -1;
      groupItemDialog(reg, patient, f, i >= 0 ? list[i] : {}, users, (d) => { if (i >= 0) list[i] = d; else list.push(d); put(list); }, ro);
      return;
    }
    const add = e.target.closest('[data-cadd]'), rm = e.target.closest('[data-crm]');
    if (add || rm) {
      const box = e.target.closest('[data-comp]'); const f = formFields(et).find(x => x.key === box.dataset.k);
      const cur = $$('.comp-row', box).map(r => ({ name: $('[data-cn]', r).value, grade: $('[data-cg]', r).value, date: $('[data-cd]', r).value }));
      if (add) cur.push({ name: '', grade: 'I', date: '' });
      if (rm) cur.splice(Number(rm.closest('.comp-row').dataset.i), 1);
      box.innerHTML = compRows(cur, f); refresh();
    }
  };
  refresh();
  return () => {
    const cur = readForm(root);
    const dateEl = root.closest('.modal')?.querySelector('#evDate');
    const all = computeValues(reg, patient, et, cur, dateEl ? dateEl.value : eventDate);
    formFields(et).filter(f => f.type === 'calc').forEach(f => { cur[f.key] = all[f.key]; });
    formFields(et).forEach(f => { if (!condOK(f.showIf, all) && f.type !== 'calc') delete cur[f.key]; });
    return { data: cur, all };
  };
}

/* ---------- готовые блоки моделей риска ---------- */
const RISK_BLOCKS = {
  crpossum: { name: 'CR-POSSUM (колоректальная хирургия)', make: (p = 'crp_') => ({ id: uid('s'), title: 'Риск: CR-POSSUM', fields: [
    F(p + 'age', 'Возраст на дату операции', 'calc', { formula: 'age(birthDate, eventDate)', unit: 'лет' }),
    F(p + 'cardiac', 'Сердечная недостаточность', 'select', { options: ['нет или лёгкая (1)', 'умеренная (2)', 'тяжёлая (3)'], key_: true }),
    F(p + 'sbp', 'САД до операции', 'number', { unit: 'мм рт. ст.', key_: true, min: 40, max: 260 }),
    F(p + 'pulse', 'ЧСС до операции', 'number', { unit: 'уд/мин', key_: true, min: 20, max: 220 }),
    F(p + 'urea', 'Мочевина', 'number', { unit: 'ммоль/л', key_: true, min: 0, max: 80 }),
    F(p + 'hb', 'Гемоглобин', 'number', { unit: 'г/л или г/дл', key_: true, min: 2, max: 250, help: 'Можно в г/л (например, 128) или г/дл (12,8)' }),
    F(p + 'severity', 'Тяжесть операции (CR-POSSUM)', 'select', { options: ['малая (1)', 'средняя (3)', 'большая (4)', 'сложная большая (8)'], key_: true, def: 'Малая: например, ушивание, биопсия. Средняя: например, аппендэктомия, стомирование. Большая: резекции кишки. Сложная большая: брюшно-промежностная экстирпация, тотальная колэктомия, эвисцерация.' }),
    F(p + 'soiling', 'Перитонеальное загрязнение', 'select', { options: ['нет / серозная жидкость (1)', 'местный гной (2)', 'свободный гной или кал (3)'], key_: true }),
    F(p + 'cancer', 'Стадия рака (Dukes)', 'select', { options: ['нет рака или Dukes A-B (1)', 'Dukes C (2)', 'Dukes D (3)'], key_: true }),
    F(p + 'urgency', 'Срочность (CR-POSSUM)', 'select', { options: ['плановая (1)', 'срочная (3)', 'экстренная (8)'], key_: true }),
    F(p + 'ps', 'Физиологический балл', 'calc', { formula: `crpPS(${p}age, ${p}cardiac, ${p}sbp, ${p}pulse, ${p}urea, ${p}hb)` }),
    F(p + 'os', 'Операционный балл', 'calc', { formula: `crpOS(${p}severity, ${p}soiling, ${p}cancer, ${p}urgency)` }),
    F(p + 'risk', 'Прогноз летальности CR-POSSUM', 'calc', { formula: `crpossum(${p}ps, ${p}os)`, unit: '%', def: 'logit = -9,167 + 0,338 × PS + 0,308 × OS (Tekkis 2004, BJS). Используется как ожидаемый риск в RA-CUSUM, VLAD и funnel plot.' })
  ] }) },
  ppossum: { name: 'P-POSSUM (любая хирургия)', make: (p = 'pp_') => ({ id: uid('s'), title: 'Риск: POSSUM / P-POSSUM', fields: [
    F(p + 'age', 'Возраст на дату операции', 'calc', { formula: 'age(birthDate, eventDate)', unit: 'лет' }),
    F(p + 'cardiac', 'Сердечно-сосудистые признаки', 'select', { options: ['норма (1)', 'диуретики, дигоксин, антиангинальная или гипотензивная терапия (2)', 'периферические отёки, варфарин, пограничная кардиомегалия (4)', 'повышенное ЦВД (набухание шейных вен), кардиомегалия (8)'], key_: true }),
    F(p + 'resp', 'Дыхательная система', 'select', { options: ['одышки нет (1)', 'одышка при нагрузке, лёгкая ХОБЛ на рентгене (2)', 'ограничивающая одышка (1 пролёт), умеренная ХОБЛ (4)', 'одышка в покое (ЧДД ≥ 30), фиброз или консолидация (8)'], key_: true }),
    F(p + 'sbp', 'САД', 'number', { unit: 'мм рт. ст.', key_: true }), F(p + 'pulse', 'ЧСС', 'number', { unit: 'уд/мин', key_: true }),
    F(p + 'gcs', 'Шкала комы Глазго', 'number', { key_: true, min: 3, max: 15 }),
    F(p + 'hb', 'Гемоглобин', 'number', { unit: 'г/л или г/дл', key_: true }), F(p + 'wcc', 'Лейкоциты', 'number', { unit: '×10⁹/л', key_: true }),
    F(p + 'urea', 'Мочевина', 'number', { unit: 'ммоль/л', key_: true }), F(p + 'na', 'Натрий', 'number', { unit: 'ммоль/л', key_: true }), F(p + 'k', 'Калий', 'number', { unit: 'ммоль/л', key_: true }),
    F(p + 'ecg', 'ЭКГ', 'select', { options: ['норма (1)', 'фибрилляция предсердий 60-90/мин (4)', 'другая аритмия, ≥5 экстрасистол/мин, зубцы Q или изменения ST/T (8)'], key_: true }),
    F(p + 'severity', 'Тяжесть операции (POSSUM)', 'select', { options: ['малая (1)', 'средняя (2)', 'большая (4)', 'большая+ (8)'], key_: true }),
    F(p + 'nproc', 'Число вмешательств за 30 дней', 'number', { min: 1, key_: true }),
    F(p + 'blood', 'Кровопотеря', 'number', { unit: 'мл', min: 0, key_: true }),
    F(p + 'soiling', 'Перитонеальное загрязнение', 'select', { options: ['нет (1)', 'серозная жидкость (2)', 'местный гной (4)', 'свободное содержимое кишки, гной или кровь (8)'], key_: true }),
    F(p + 'malig', 'Злокачественность', 'select', { options: ['нет (1)', 'только первичная опухоль (2)', 'метастазы в лимфоузлы (4)', 'отдалённые метастазы (8)'], key_: true }),
    F(p + 'urgency', 'Срочность (POSSUM)', 'select', { options: ['плановая (1)', 'экстренная, возможна подготовка, в течение 24 ч (4)', 'экстренная немедленная, до 2 ч (8)'], key_: true }),
    F(p + 'ps', 'Физиологический балл', 'calc', { formula: `pPS(${p}age, ${p}cardiac, ${p}resp, ${p}sbp, ${p}pulse, ${p}gcs, ${p}hb, ${p}wcc, ${p}urea, ${p}na, ${p}k, ${p}ecg)` }),
    F(p + 'os', 'Операционный балл', 'calc', { formula: `pOS(${p}severity, ${p}nproc, ${p}blood, ${p}soiling, ${p}malig, ${p}urgency)` }),
    F(p + 'risk', 'Прогноз летальности P-POSSUM', 'calc', { formula: `ppossum(${p}ps, ${p}os)`, unit: '%', def: 'logit = -9,065 + 0,1692 × PS + 0,155 × OS (Prytherch 1998, BJS).' }),
    F(p + 'morb', 'Прогноз осложнений POSSUM', 'calc', { formula: `possumMorb(${p}ps, ${p}os)`, unit: '%', def: 'logit = -5,91 + 0,16 × PS + 0,19 × OS (Copeland 1991, BJS).' })
  ] }) }
};

/* ---------- новый регистр / шаблоны ---------- */
const F = (key, label, type = 'text', extra = {}) => ({ key, label, type, options: [], required: false, def: '', ...extra });

function blankRegistry(name) {
  return {
    name, description: '', version: 1, status: 'черновик',
    patientFields: [],
    eventTypes: [
      { id: 'enrol', name: 'Включение в регистр', color: '#3b6fd4', single: true, dateLabel: 'Дата включения', sections: [{ id: uid('s'), title: 'Основное', fields: [] }] },
      { id: 'followup', name: 'Наблюдение', color: '#2a9d8f', dateLabel: 'Дата контакта', sections: [{ id: uid('s'), title: 'Статус', fields: [F('status', 'Статус пациента', 'select', { options: ['жив', 'умер', 'потерян для наблюдения'], required: true })] }] }
    ],
    indicators: [], instruments: [], schedules: [], keyDates: {}
  };
}

const TEMPLATES = {
  blank: { name: 'Пустой регистр', desc: 'Только включение и наблюдение. Всё остальное настраиваете сами.', make: () => blankRegistry('Новый регистр') },
  colorectal: {
    name: 'Колоректальный рак (базовый)',
    desc: 'Домены ICORC/ICHOM: предоперационный статус, операция, осложнения (CD + CCI), патоморфология, наблюдение. Опросники LARS и Wexner. Показатели качества.',
    make: () => {
      const r = blankRegistry('Колоректальный рак');
      r.description = 'Шаблон по доменам международного общего набора данных колоректальных регистров (ICORC) и ICHOM Colorectal. Набор полей стоит сверить с вашим локальным регистром.';
      r.patientFields = [F('referrer', 'Направивший врач / учреждение')];
      r.eventTypes = [
        { id: 'enrol', name: 'Включение и диагноз', color: '#3b6fd4', single: true, dateLabel: 'Дата гистологической верификации', sections: [
          { id: uid('s'), title: 'Опухоль', fields: [
            F('site', 'Локализация', 'select', { options: ['Слепая кишка', 'Восходящая ободочная', 'Печёночный изгиб', 'Поперечная ободочная', 'Селезёночный изгиб', 'Нисходящая ободочная', 'Сигмовидная', 'Ректосигмоидный отдел', 'Прямая кишка'], required: true }),
            F('dist_av', 'Расстояние от анального края', 'number', { unit: 'см', showIf: { key: 'site', op: 'eq', value: 'Прямая кишка' }, min: 0, max: 20 }),
            F('histo', 'Гистология', 'select', { options: ['Аденокарцинома', 'Муцинозная аденокарцинома', 'Перстневидноклеточный рак', 'Другая'], required: true }),
            F('ct', 'cT', 'select', { options: ['Tx', 'T1', 'T2', 'T3', 'T4a', 'T4b'], required: true }),
            F('cn', 'cN', 'select', { options: ['Nx', 'N0', 'N1', 'N2'], required: true }),
            F('cm', 'cM', 'select', { options: ['M0', 'M1a', 'M1b', 'M1c'], required: true }),
            F('mrf', 'MRF/CRM по МРТ', 'select', { options: ['свободна', 'вовлечена', 'не оценивалась'], showIf: { key: 'site', op: 'eq', value: 'Прямая кишка' } }),
            F('emvi', 'EMVI по МРТ', 'yesno', { showIf: { key: 'site', op: 'eq', value: 'Прямая кишка' } }),
            F('lln', 'Латеральные лимфоузлы по МРТ', 'yesno', { showIf: { key: 'site', op: 'eq', value: 'Прямая кишка' } }),
            F('cea', 'РЭА исходно', 'number', { unit: 'нг/мл' }),
            F('msi', 'MSI / MMR', 'select', { options: ['MSS / pMMR', 'MSI-H / dMMR', 'не определялся'] })
          ] },
          { id: uid('s'), title: 'Пациент', fields: [
            F('height', 'Рост', 'number', { unit: 'см', min: 100, max: 230 }),
            F('weight', 'Вес', 'number', { unit: 'кг', min: 25, max: 300 }),
            F('bmi', 'ИМТ', 'calc', { formula: 'bmi(height, weight)', unit: 'кг/м²' }),
            F('age_dx', 'Возраст на момент диагноза', 'calc', { formula: 'age(birthDate, eventDate)', unit: 'лет' }),
            F('asa', 'ASA', 'select', { options: ['I', 'II', 'III', 'IV', 'V'], required: true }),
            F('ecog', 'ECOG', 'select', { options: ['0', '1', '2', '3', '4'] }),
            F('comorb', 'Сопутствующие заболевания', 'multiselect', { options: ['ИБС', 'ХСН', 'Сахарный диабет', 'ХОБЛ', 'ХБП', 'Цирроз', 'Другое'] })
          ] }
        ] },
        { id: 'neoadj', name: 'Неоадъювантная терапия', color: '#8e6bd4', dateLabel: 'Дата начала', sections: [
          { id: uid('s'), title: 'Лечение', fields: [
            F('neo_type', 'Схема', 'select', { options: ['Короткий курс ЛТ 5×5', 'Длительная ХЛТ', 'TNT (консолидирующая)', 'TNT (индукционная)', 'Только ХТ'], required: true }),
            F('neo_end', 'Дата окончания', 'date'),
            F('response', 'Клинический ответ', 'select', { options: ['полный (cCR)', 'почти полный (near-cCR)', 'неполный', 'прогрессирование'] }),
            F('mrtrg', 'mrTRG', 'select', { options: ['1', '2', '3', '4', '5'] }),
            F('ww', 'Тактика watch and wait', 'yesno')
          ] }
        ] },
        { id: 'surgery', name: 'Операция', color: '#e07a2f', dateLabel: 'Дата операции', sections: [
          { id: uid('s'), title: 'Операция', fields: [
            F('surgeon', 'Оперирующий хирург', 'user', { required: true }),
            F('urgency', 'Срочность', 'select', { options: ['плановая', 'срочная', 'экстренная'], required: true }),
            F('procedure', 'Операция', 'select', { options: ['Правосторонняя гемиколэктомия', 'Расширенная правосторонняя гемиколэктомия', 'Резекция поперечной ободочной', 'Левосторонняя гемиколэктомия', 'Резекция сигмовидной кишки', 'Передняя резекция', 'Низкая передняя резекция', 'Интерсфинктерная резекция', 'Брюшно-промежностная экстирпация', 'Операция Гартмана', 'Субтотальная/тотальная колэктомия', 'Тазовая эвисцерация', 'Другая'], required: true }),
            F('approach', 'Доступ', 'select', { options: ['открытый', 'лапароскопический', 'робот-ассистированный', 'TaTME'], required: true }),
            F('conversion', 'Конверсия', 'yesno', { showIf: { key: 'approach', op: 'ne', value: 'открытый' } }),
            F('anast', 'Анастомоз', 'yesno', { required: true }),
            F('stoma', 'Стома', 'select', { options: ['нет', 'превентивная илеостома', 'превентивная колостома', 'концевая колостома', 'концевая илеостома'], required: true }),
            F('llnd', 'Латеральная лимфодиссекция', 'yesno'),
            F('blood_loss', 'Кровопотеря', 'number', { unit: 'мл', min: 0 }),
            F('op_time', 'Длительность операции', 'number', { unit: 'мин', min: 0 })
          ] },
          { id: uid('s'), title: 'Послеоперационный период (30 дней)', fields: [
            F('complications', 'Осложнения', 'complist', { options: ['Несостоятельность анастомоза', 'Абсцесс', 'Раневая инфекция', 'Кровотечение', 'Парез кишечника', 'Пневмония', 'Тромбоэмболия', 'ИМП / задержка мочи', 'Сердечно-сосудистое', 'Другое'] }),
            F('cd_max', 'Макс. Clavien-Dindo', 'calc', { formula: 'maxcd(complications)' }),
            F('cci_score', 'CCI', 'calc', { formula: 'cci(complications)' }),
            F('leak', 'Несостоятельность анастомоза', 'select', { options: ['нет', 'A', 'B', 'C'], showIf: { key: 'anast', op: 'eq', value: 'да' }, required: true, def: 'Классификация ISREC: A не требует активного вмешательства, B лечится без релапаротомии, C требует релапаротомии.' }),
            F('reop', 'Повторная операция в 30 дней', 'yesno', { required: true }),
            F('discharge', 'Дата выписки', 'date'),
            F('los', 'Койко-день после операции', 'calc', { formula: 'days(eventDate, discharge)', unit: 'дн' }),
            F('mort30', 'Летальность 30 дней', 'yesno', { required: true }),
            F('readm', 'Повторная госпитализация в 30 дней', 'yesno')
          ] }
        ] },
        { id: 'path', name: 'Патоморфология', color: '#c0392b', single: true, dateLabel: 'Дата заключения', sections: [
          { id: uid('s'), title: 'Заключение', fields: [
            F('pt', 'pT / ypT', 'select', { options: ['T0', 'Tis', 'T1', 'T2', 'T3', 'T4a', 'T4b'], required: true }),
            F('pn', 'pN / ypN', 'select', { options: ['N0', 'N1a', 'N1b', 'N1c', 'N2a', 'N2b'], required: true }),
            F('ln_total', 'Лимфоузлов исследовано', 'number', { min: 0, required: true }),
            F('ln_pos', 'Лимфоузлов поражено', 'number', { min: 0 }),
            F('ln_ok', '12 и более лимфоузлов', 'calc', { formula: "ln_total == null || ln_total === '' ? null : (ln_total >= 12 ? 'да' : 'нет')" }),
            F('r', 'Радикальность', 'select', { options: ['R0', 'R1', 'R2'], required: true }),
            F('crm', 'CRM', 'number', { unit: 'мм', min: 0 }),
            F('tme', 'Качество мезоректумэктомии', 'select', { options: ['полная', 'почти полная', 'неполная'] }),
            F('trg', 'TRG', 'select', { options: ['0', '1', '2', '3'] }),
            F('grade', 'Степень дифференцировки', 'select', { options: ['G1', 'G2', 'G3', 'G4'] }),
            F('lvi', 'Лимфоваскулярная инвазия', 'yesno'),
            F('pni', 'Периневральная инвазия', 'yesno')
          ] }
        ] },
        { id: 'adj', name: 'Адъювантная терапия', color: '#6c8ebf', dateLabel: 'Дата начала', sections: [{ id: uid('s'), title: 'Лечение', fields: [F('adj_scheme', 'Схема', 'select', { options: ['CAPOX', 'FOLFOX', 'Капецитабин', 'Другая'] }), F('adj_cycles', 'Циклов', 'number', { min: 0 }), F('adj_stop', 'Прекращена досрочно', 'yesno')] }] },
        { id: 'followup', name: 'Наблюдение', color: '#2a9d8f', dateLabel: 'Дата контакта', sections: [{ id: uid('s'), title: 'Статус', fields: [
          F('status', 'Статус пациента', 'select', { options: ['жив без признаков болезни', 'жив с рецидивом/прогрессированием', 'умер', 'потерян для наблюдения'], required: true }),
          F('recur', 'Рецидив', 'select', { options: ['нет', 'местный', 'отдалённый', 'местный и отдалённый'], required: true }),
          F('recur_date', 'Дата рецидива', 'date', { showIf: { key: 'recur', op: 'ne', value: 'нет' } }),
          F('death_date', 'Дата смерти', 'date', { showIf: { key: 'status', op: 'eq', value: 'умер' } }),
          F('death_cause', 'Причина смерти', 'select', { options: ['основное заболевание', 'осложнение лечения', 'другая причина', 'неизвестно'], showIf: { key: 'status', op: 'eq', value: 'умер' } }),
          F('stoma_closed', 'Стома закрыта', 'yesno')
        ] }] }
      ];
      r.eventTypes.find(e => e.id === 'surgery').sections.splice(1, 0, RISK_BLOCKS.crpossum.make());
      r.keyDates = { start: 'surgery', death: 'death_date', recur: 'recur_date' };
      r.indicators = [
        { id: uid('i'), name: 'Несостоятельность анастомоза (B+C)', et: 'surgery', denom: { key: 'anast', op: 'eq', value: 'да' }, num: { key: 'leak', op: 'in', value: 'B;C' }, target: '', ref: 'Staiger RD и соавт. Benchmarks in colorectal surgery. Br J Surg 2022;109(12):1274-1281 (19 центров, 75-й перцентиль медиан центров). Ориентиры для несостоятельности, накопленно за 3 месяца: высокая передняя резекция 5,0% (пациенты без значимых сопутствующих заболеваний) и 6,9% (остальные), низкая передняя резекция 13,6% и 11,8%. Цель выбирает совет регистра с учётом доли низких резекций.', lowerBetter: true },
        { id: uid('i'), name: 'Летальность 30 дней', et: 'surgery', denom: null, num: { key: 'mort30', op: 'eq', value: 'да' }, target: '', ref: 'Staiger RD и соавт. Benchmarks in colorectal surgery. Br J Surg 2022;109(12):1274-1281 (19 центров, 75-й перцентиль медиан центров). Ориентиры летальности: в стационаре 0% у пациентов без значимых сопутствующих заболеваний, у остальных 2,4% (высокая передняя резекция) и 1,1% (низкая); за 3 месяца 3,0% и 2,2%. Срок 30 дней в этом исследовании не оценивался.', lowerBetter: true },
        { id: uid('i'), name: 'Clavien-Dindo ≥ IIIa', et: 'surgery', denom: null, num: { key: 'cd_max', op: 'in', value: 'IIIa;IIIb;IVa;IVb;V' }, target: '', ref: 'Staiger RD и соавт. Benchmarks in colorectal surgery. Br J Surg 2022;109(12):1274-1281 (19 центров, 75-й перцентиль медиан центров). Ориентиры для осложнений Clavien-Dindo IIIa и выше при выписке: высокая передняя резекция 8,8% и 13,6%, низкая 12,2% и 13,7% (без и с сопутствующими заболеваниями).', lowerBetter: true },
        { id: uid('i'), name: 'Повторные операции', et: 'surgery', denom: null, num: { key: 'reop', op: 'eq', value: 'да' }, target: '', ref: 'Повторные операции в бенчмарк-исследовании Staiger 2022 не оценивались. Цель не задана: в шаблоне нет опубликованного источника для этого порога. Цель задаёт совет регистра и записывает здесь её обоснование.', lowerBetter: true },
        { id: uid('i'), name: 'R0 резекции', et: 'path', denom: null, num: { key: 'r', op: 'eq', value: 'R0' }, target: '', ref: 'Цель не задана: в шаблоне нет опубликованного источника для этого порога. Цель задаёт совет регистра и записывает здесь её обоснование.', lowerBetter: false },
        { id: uid('i'), name: '12 и более лимфоузлов', et: 'path', denom: null, num: { key: 'ln_ok', op: 'eq', value: 'да' }, target: '', ref: 'Порог 12 узлов: минимальное число исследованных лимфоузлов для стадирования рака толстой кишки по AJCC/UICC TNM. Долю пациентов, которую считать целью, задаёт совет регистра.', lowerBetter: false },
        { id: uid('i'), name: 'Конверсии', et: 'surgery', denom: { key: 'approach', op: 'ne', value: 'открытый' }, num: { key: 'conversion', op: 'eq', value: 'да' }, target: '', ref: 'Staiger RD и соавт. Benchmarks in colorectal surgery. Br J Surg 2022;109(12):1274-1281 (19 центров, 75-й перцентиль медиан центров). Ориентиры для конверсии: высокая передняя резекция 6,1% и 14,5%, низкая 7,6% и 10,9% (без и с сопутствующими заболеваниями).', lowerBetter: true }
      ];
      r.instruments = [INSTRUMENTS.lars(), INSTRUMENTS.wexner()];
      r.schedules = [
        { id: uid('sc'), instrument: r.instruments[0].id, anchorEt: 'surgery', offsets: [180, 365, 730], condition: { key: 'anast', op: 'eq', value: 'да' } },
        { id: uid('sc'), instrument: r.instruments[1].id, anchorEt: 'surgery', offsets: [180, 365], condition: { key: 'anast', op: 'eq', value: 'да' } }
      ];
      return r;
    }
  }
};

TEMPLATES.surgaudit = {
  name: 'Хирургический аудит (любые операции)',
  desc: 'Универсальный аудит операций: госпитализация, операция с осложнениями (CD + CCI), исход 30 дней. Подходит для любого отделения хирургии.',
  make: () => {
    const r = blankRegistry('Хирургический аудит');
    r.description = 'Универсальный аудит исходов хирургических вмешательств: объём, осложнения, повторные операции, летальность.';
    r.eventTypes = [
      { id: 'enrol', name: 'Госпитализация', color: '#3b6fd4', dateLabel: 'Дата поступления', sections: [{ id: uid('s'), title: 'Поступление', fields: [
        F('dx', 'Основной диагноз', 'text', { required: true }), F('icd', 'Код МКБ-10', 'text'),
        F('urgency', 'Срочность', 'select', { options: ['плановая', 'срочная', 'экстренная'], required: true }),
        F('asa', 'ASA', 'select', { options: ['I', 'II', 'III', 'IV', 'V'], required: true }),
        F('height', 'Рост', 'number', { unit: 'см' }), F('weight', 'Вес', 'number', { unit: 'кг' }), F('bmi', 'ИМТ', 'calc', { formula: 'bmi(height, weight)' }),
        F('age_adm', 'Возраст', 'calc', { formula: 'age(birthDate, eventDate)', unit: 'лет' })] }] },
      { id: 'surgery', name: 'Операция', color: '#e07a2f', dateLabel: 'Дата операции', sections: [
        { id: uid('s'), title: 'Операция', fields: [F('surgeon', 'Оперирующий хирург', 'user', { required: true }), F('procedure', 'Операция', 'text', { required: true }),
          F('approach', 'Доступ', 'select', { options: ['открытый', 'лапароскопический', 'робот-ассистированный', 'эндоскопический'], required: true }),
          F('conversion', 'Конверсия', 'yesno', { showIf: { key: 'approach', op: 'ne', value: 'открытый' } }), F('op_time', 'Длительность', 'number', { unit: 'мин' }), F('blood_loss', 'Кровопотеря', 'number', { unit: 'мл' })] },
        { id: uid('s'), title: 'Исход (30 дней)', fields: [F('complications', 'Осложнения', 'complist', { options: ['Кровотечение', 'Инфекция области хирургического вмешательства', 'Несостоятельность швов', 'Пневмония', 'Тромбоэмболия', 'Другое'] }),
          F('cd_max', 'Макс. Clavien-Dindo', 'calc', { formula: 'maxcd(complications)' }), F('cci_score', 'CCI', 'calc', { formula: 'cci(complications)' }),
          F('reop', 'Повторная операция в 30 дней', 'yesno', { required: true }), F('discharge', 'Дата выписки', 'date'), F('los', 'Койко-день после операции', 'calc', { formula: 'days(eventDate, discharge)', unit: 'дн' }),
          F('mort30', 'Летальность 30 дней', 'yesno', { required: true }), F('readm', 'Повторная госпитализация в 30 дней', 'yesno')] }] },
      { id: 'followup', name: 'Наблюдение', color: '#2a9d8f', dateLabel: 'Дата контакта', sections: [{ id: uid('s'), title: 'Статус', fields: [F('status', 'Статус пациента', 'select', { options: ['жив', 'умер', 'потерян для наблюдения'], required: true }), F('death_date', 'Дата смерти', 'date', { showIf: { key: 'status', op: 'eq', value: 'умер' } })] }] }
    ];
    r.keyDates = { start: 'surgery' };
    r.indicators = [
      { id: uid('i'), name: 'Летальность 30 дней', et: 'surgery', denom: null, num: { key: 'mort30', op: 'eq', value: 'да' }, target: '', lowerBetter: true },
      { id: uid('i'), name: 'Clavien-Dindo ≥ IIIa', et: 'surgery', denom: null, num: { key: 'cd_max', op: 'in', value: 'IIIa;IIIb;IVa;IVb;V' }, target: '', lowerBetter: true },
      { id: uid('i'), name: 'Повторные операции', et: 'surgery', denom: null, num: { key: 'reop', op: 'eq', value: 'да' }, target: '', lowerBetter: true },
      { id: uid('i'), name: 'Повторные госпитализации', et: 'surgery', denom: null, num: { key: 'readm', op: 'eq', value: 'да' }, target: '', lowerBetter: true }
    ];
    return r;
  }
};

/* общие куски шаблонов */
const compBlock = (names) => [F('complications', 'Осложнения (30 дней)', 'complist', { options: names }), F('cd_max', 'Макс. Clavien-Dindo', 'calc', { formula: 'maxcd(complications)' }), F('cci_score', 'CCI', 'calc', { formula: 'cci(complications)' }),
  F('reop', 'Повторная операция в 30 дней', 'yesno', { required: true }), F('discharge', 'Дата выписки', 'date'), F('los', 'Койко-день после операции', 'calc', { formula: 'days(eventDate, discharge)', unit: 'дн' }), F('mort30', 'Летальность 30 дней', 'yesno', { required: true }), F('readm', 'Повторная госпитализация в 30 дней', 'yesno')];
const IND = (name, et, num, denom = null, target = '', lowerBetter = true, ref = '') => ({ id: uid('i'), name, et, num, denom, target: '', lowerBetter, ref: ref || 'Цель не задана: в шаблоне нет опубликованного источника для этого порога. Цель задаёт совет регистра и записывает здесь её обоснование.' });
const CDIII = { key: 'cd_max', op: 'in', value: 'IIIa;IIIb;IVa;IVb;V' };
const ET = (id, name, color, dateLabel, fields, extra = {}) => ({ id, name, color, dateLabel, sections: [{ id: uid('s'), title: name, fields }], ...extra });

TEMPLATES.tnt = {
  name: 'Рак прямой кишки: TNT (тотальная неоадъювантная терапия)',
  desc: 'Стадирование по МРТ, курс TNT с токсичностью CTCAE, оценка ответа (cCR / near-cCR), watch and wait, операция, ypTNM и pCR, повторный рост.',
  make: () => {
    const r = blankRegistry('TNT: рак прямой кишки');
    r.description = 'Проспективный регистр пациентов, получающих тотальную неоадъювантную терапию по поводу рака прямой кишки.';
    r.eventTypes = [
      ET('enrol', 'Исходное стадирование', '#3b6fd4', 'Дата МРТ', [F('dist_av', 'Расстояние от анального края', 'number', { unit: 'см', required: true }), F('length', 'Протяжённость опухоли', 'number', { unit: 'см' }),
        F('ct', 'mrT', 'select', { options: ['T1', 'T2', 'T3a', 'T3b', 'T3c', 'T3d', 'T4a', 'T4b'], required: true }), F('cn', 'mrN', 'select', { options: ['N0', 'N1', 'N2'], required: true }), F('cm', 'cM', 'select', { options: ['M0', 'M1'], required: true }),
        F('mrf', 'MRF', 'select', { options: ['свободна', 'вовлечена (≤1 мм)'], required: true }), F('emvi', 'EMVI', 'yesno', { required: true }), F('lln', 'Увеличенные латеральные лимфоузлы', 'yesno'), F('lln_sa', 'Короткая ось латерального узла', 'number', { unit: 'мм', showIf: { key: 'lln', op: 'eq', value: 'да' } }),
        F('cea', 'РЭА', 'number', { unit: 'нг/мл' }), F('msi', 'MSI / MMR', 'select', { options: ['MSS / pMMR', 'MSI-H / dMMR', 'не определялся'] }), F('ecog', 'ECOG', 'select', { options: ['0', '1', '2', '3'] }), F('asa', 'ASA', 'select', { options: ['I', 'II', 'III', 'IV'] })], { single: true }),
      ET('tnt', 'Курс TNT', '#8e6bd4', 'Дата начала', [F('sequence', 'Последовательность', 'select', { options: ['ЛТ затем ХТ (консолидирующая)', 'ХТ затем ЛТ (индукционная)'], required: true }),
        F('rt', 'Лучевая терапия', 'select', { options: ['короткий курс 5×5 Гр', 'ХЛТ 45-50,4 Гр', 'ХЛТ 50-54 Гр', 'без ЛТ'], required: true }), F('chemo', 'Схема ХТ', 'select', { options: ['CAPOX', 'FOLFOX', 'mFOLFIRINOX', 'Капецитабин', 'другая'], required: true }),
        F('cyc_plan', 'Циклов ХТ запланировано', 'number', { min: 0 }), F('cyc_done', 'Циклов ХТ проведено', 'number', { min: 0 }), F('tnt_end', 'Дата окончания TNT', 'date'),
        F('completed', 'TNT завершена полностью', 'yesno', { required: true }), F('dose_red', 'Редукция доз', 'yesno'), F('delay', 'Отсрочка курсов', 'yesno'),
        F('tox_max', 'Макс. токсичность CTCAE v5.0 (степень)', 'select', { options: ['0', '1', '2', '3', '4', '5'], required: true }), F('tox_types', 'Виды токсичности ≥ 2 степени', 'multiselect', { options: ['диарея', 'периферическая нейропатия', 'нейтропения', 'тромбоцитопения', 'анемия', 'тошнота / рвота', 'лучевой проктит', 'цистит', 'кожная', 'слабость', 'ладонно-подошвенный синдром', 'другая'] })]),
      ET('response', 'Оценка ответа', '#2a9d8f', 'Дата оценки', [F('weeks', 'Недель после окончания ЛТ', 'number', { min: 0 }), F('mrtrg', 'mrTRG', 'select', { options: ['1', '2', '3', '4', '5'] }),
        F('endo', 'Эндоскопически', 'select', { options: ['белый плоский рубец без язвы и опухоли', 'нерегулярность слизистой, небольшая язва или остаточная неровность', 'видимая опухоль'] }),
        F('resp', 'Клинический ответ', 'select', { options: ['полный (cCR)', 'почти полный (near-cCR)', 'неполный', 'прогрессирование'], required: true, def: 'Критерии MSKCC / OPRA: cCR = отсутствие опухоли эндоскопически, при пальцевом исследовании и на МРТ; near-cCR = остаточные минимальные изменения.' }),
        F('decision', 'Решение', 'select', { options: ['watch and wait', 'повторная оценка через 8-12 недель', 'операция', 'системная терапия', 'паллиатив'], required: true })]),
      ET('surgery', 'Операция', '#e07a2f', 'Дата операции', [F('surgeon', 'Хирург', 'user', { required: true }), F('procedure', 'Операция', 'select', { options: ['низкая передняя резекция', 'интерсфинктерная резекция', 'брюшно-промежностная экстирпация', 'трансанальная местная эксцизия', 'TaTME', 'эвисцерация'], required: true }),
        F('approach', 'Доступ', 'select', { options: ['открытый', 'лапароскопический', 'робот-ассистированный', 'трансанальный'], required: true }), F('salvage', 'Спасительная операция после watch and wait', 'yesno'), F('anast', 'Анастомоз', 'yesno', { required: true }),
        F('leak', 'Несостоятельность анастомоза (ISREC)', 'select', { options: ['нет', 'A', 'B', 'C'], showIf: { key: 'anast', op: 'eq', value: 'да' }, required: true }), ...compBlock(['Несостоятельность анастомоза', 'Абсцесс', 'Раневая инфекция', 'Задержка мочи', 'Кровотечение', 'Другое'])]),
      ET('path', 'Патоморфология', '#c0392b', 'Дата заключения', [F('pt', 'ypT', 'select', { options: ['T0', 'Tis', 'T1', 'T2', 'T3', 'T4a', 'T4b'], required: true }), F('pn', 'ypN', 'select', { options: ['N0', 'N1a', 'N1b', 'N1c', 'N2a', 'N2b'], required: true }),
        F('pcr', 'Полный патоморфологический ответ (pCR)', 'calc', { formula: "pt == null || pn == null ? null : ((pt === 'T0' && pn === 'N0') ? 'да' : 'нет')" }), F('trg', 'TRG (AJCC)', 'select', { options: ['0', '1', '2', '3'] }), F('r', 'Радикальность', 'select', { options: ['R0', 'R1', 'R2'], required: true }),
        F('crm', 'CRM', 'number', { unit: 'мм' }), F('ln_total', 'Лимфоузлов исследовано', 'number')], { single: true }),
      ET('followup', 'Наблюдение', '#16a085', 'Дата контакта', [F('status', 'Статус', 'select', { options: ['жив без признаков болезни', 'жив с болезнью', 'умер', 'потерян для наблюдения'], required: true }),
        F('regrowth', 'Повторный рост опухоли (watch and wait)', 'yesno'), F('regrowth_date', 'Дата повторного роста', 'date', { showIf: { key: 'regrowth', op: 'eq', value: 'да' } }),
        F('local_rec', 'Местный рецидив', 'yesno'), F('distant', 'Отдалённые метастазы', 'yesno', { required: true }), F('distant_date', 'Дата метастазов', 'date', { showIf: { key: 'distant', op: 'eq', value: 'да' } }),
        F('death_date', 'Дата смерти', 'date', { showIf: { key: 'status', op: 'eq', value: 'умер' } }), F('organ_preserved', 'Прямая кишка сохранена', 'yesno')])
    ];
    r.keyDates = { start: 'tnt' }; r.followupEvery = 90;
    r.indicators = [IND('Полный клинический ответ (cCR)', 'response', { key: 'resp', op: 'eq', value: 'полный (cCR)' }, null, '', false), IND('TNT завершена полностью', 'tnt', { key: 'completed', op: 'eq', value: 'да' }, null, 85, false),
      IND('Токсичность CTCAE ≥ 3', 'tnt', { key: 'tox_max', op: 'in', value: '3;4;5' }, null, 30, true), IND('pCR', 'path', { key: 'pcr', op: 'eq', value: 'да' }, null, '', false), IND('Clavien-Dindo ≥ IIIa', 'surgery', CDIII, null, 15, true), IND('Повторный рост при наблюдении', 'followup', { key: 'regrowth', op: 'eq', value: 'да' }, null, '', true)];
    r.instruments = [INSTRUMENTS.lars(), INSTRUMENTS.wexner()];
    r.schedules = [{ id: uid('sc'), instrument: r.instruments[0].id, anchorEt: 'response', offsets: [0, 180, 365], condition: null }];
    return r;
  }
};

TEMPLATES.llnd = {
  name: 'Латеральная лимфодиссекция (LLND)',
  desc: 'МРТ латеральных узлов (компартмент, короткая ось до и после терапии), LLND, удалённые и поражённые латеральные узлы, мочевая дисфункция, латеральный рецидив.',
  make: () => {
    const r = blankRegistry('Латеральная лимфодиссекция');
    r.eventTypes = [
      ET('enrol', 'МРТ: латеральные узлы', '#3b6fd4', 'Дата МРТ', [F('side', 'Сторона', 'select', { options: ['справа', 'слева', 'с обеих сторон'], required: true }),
        F('compartment', 'Компартмент', 'multiselect', { options: ['запирательный', 'внутренний подвздошный проксимальный', 'внутренний подвздошный дистальный', 'наружный подвздошный', 'общий подвздошный'], required: true }),
        F('sa_pre', 'Короткая ось до терапии', 'number', { unit: 'мм', required: true }), F('sa_post', 'Короткая ось после неоадъювантной терапии', 'number', { unit: 'мм' }), F('malig', 'Злокачественные признаки (неровный край, гетерогенность)', 'yesno')], { single: true }),
      ET('surgery', 'Операция с LLND', '#e07a2f', 'Дата операции', [F('surgeon', 'Хирург', 'user', { required: true }), F('llnd_side', 'Сторона LLND', 'select', { options: ['справа', 'слева', 'с обеих сторон'], required: true }),
        F('approach', 'Доступ', 'select', { options: ['открытый', 'лапароскопический', 'робот-ассистированный'], required: true }), F('main_op', 'Основная операция', 'select', { options: ['низкая передняя резекция', 'интерсфинктерная резекция', 'брюшно-промежностная экстирпация', 'эвисцерация'] }),
        F('nerve', 'Сохранение тазовых нервов', 'select', { options: ['полное', 'частичное', 'нет'] }), F('op_time', 'Длительность', 'number', { unit: 'мин' }), F('blood_loss', 'Кровопотеря', 'number', { unit: 'мл' }),
        F('ln_lat', 'Латеральных узлов удалено', 'number', { min: 0, required: true }), F('ln_lat_pos', 'Латеральных узлов поражено', 'number', { min: 0, required: true }),
        F('lat_pos', 'Метастазы в латеральных узлах', 'calc', { formula: "ln_lat_pos == null ? null : (ln_lat_pos > 0 ? 'да' : 'нет')" }), F('urinary', 'Задержка мочи / катетер > 7 дней', 'yesno', { required: true }),
        ...compBlock(['Лимфоцеле', 'Задержка мочи', 'Повреждение мочеточника', 'Кровотечение', 'Несостоятельность анастомоза', 'Абсцесс', 'Другое'])]),
      ET('followup', 'Наблюдение', '#2a9d8f', 'Дата контакта', [F('status', 'Статус', 'select', { options: ['жив без признаков болезни', 'жив с болезнью', 'умер', 'потерян для наблюдения'], required: true }),
        F('lat_rec', 'Латеральный рецидив', 'yesno', { required: true }), F('lat_rec_date', 'Дата латерального рецидива', 'date', { showIf: { key: 'lat_rec', op: 'eq', value: 'да' } }), F('local_rec', 'Местный рецидив (любой)', 'yesno'),
        F('uro', 'Мочевая дисфункция через 6-12 мес', 'yesno'), F('sex_dys', 'Сексуальная дисфункция', 'yesno'), F('death_date', 'Дата смерти', 'date', { showIf: { key: 'status', op: 'eq', value: 'умер' } })])
    ];
    r.keyDates = { start: 'surgery' }; r.followupEvery = 180;
    r.indicators = [IND('Метастазы в латеральных узлах', 'surgery', { key: 'lat_pos', op: 'eq', value: 'да' }, null, '', false), IND('Задержка мочи', 'surgery', { key: 'urinary', op: 'eq', value: 'да' }, null, 15, true),
      IND('Clavien-Dindo ≥ IIIa', 'surgery', CDIII, null, 15, true), IND('Латеральный рецидив', 'followup', { key: 'lat_rec', op: 'eq', value: 'да' }, null, 5, true)];
    return r;
  }
};

TEMPLATES.hernia = {
  name: 'Грыжи (паховые и вентральные, классификация EHS)',
  desc: 'Классификация EHS, техника пластики, сетка и фиксация, осложнения, рецидив и хроническая боль.',
  make: () => {
    const r = blankRegistry('Герниология');
    const groin = { key: 'type', op: 'in', value: 'паховая;бедренная' }, ventral = { key: 'type', op: 'in', value: 'пупочная;эпигастральная;послеоперационная вентральная;параколостомическая' };
    r.eventTypes = [
      ET('enrol', 'Грыжа', '#3b6fd4', 'Дата осмотра', [F('type', 'Вид грыжи', 'select', { options: ['паховая', 'бедренная', 'пупочная', 'эпигастральная', 'послеоперационная вентральная', 'параколостомическая'], required: true }),
        F('side', 'Сторона', 'select', { options: ['справа', 'слева', 'с обеих сторон'], showIf: groin }), F('ehs_groin', 'EHS (паховые)', 'select', { options: ['L1', 'L2', 'L3', 'M1', 'M2', 'M3', 'F'], showIf: groin, def: 'EHS: L латеральная, M медиальная, F бедренная; 1 ≤ 1,5 см (один палец), 2 ≤ 3 см, 3 > 3 см.' }),
        F('ehs_loc', 'EHS (вентральные): локализация', 'multiselect', { options: ['M1 субксифоидальная', 'M2 эпигастральная', 'M3 пупочная', 'M4 инфраумбиликальная', 'M5 надлобковая', 'L1 субкостальная', 'L2 фланковая', 'L3 подвздошная', 'L4 поясничная'], showIf: ventral }),
        F('width', 'Ширина дефекта', 'number', { unit: 'см', showIf: ventral }), F('ehs_w', 'EHS W', 'calc', { formula: "width == null ? null : (width < 4 ? 'W1' : width <= 10 ? 'W2' : 'W3')" }),
        F('recurrent', 'Рецидивная грыжа', 'yesno', { required: true }), F('emergency', 'Ущемление / экстренно', 'yesno', { required: true }), F('height', 'Рост', 'number', { unit: 'см' }), F('weight', 'Вес', 'number', { unit: 'кг' }), F('bmi', 'ИМТ', 'calc', { formula: 'bmi(height, weight)' }),
        F('smoking', 'Курение', 'yesno'), F('diabetes', 'Сахарный диабет', 'yesno')], { single: true }),
      ET('surgery', 'Пластика', '#e07a2f', 'Дата операции', [F('surgeon', 'Хирург', 'user', { required: true }), F('technique', 'Техника', 'select', { options: ['Лихтенштейн', 'TAPP', 'TEP', 'Шолдайс', 'натяжная пластика', 'IPOM', 'IPOM-plus', 'eTEP', 'Rives-Stoppa (sublay)', 'TAR', 'onlay', 'MILOS / EMILOS', 'другая'], required: true }),
        F('mesh', 'Сетка', 'yesno', { required: true }), F('mesh_size', 'Размер сетки', 'text', { showIf: { key: 'mesh', op: 'eq', value: 'да' } }), F('fixation', 'Фиксация', 'select', { options: ['без фиксации', 'клей', 'такеры рассасывающиеся', 'такеры нерассасывающиеся', 'швы'], showIf: { key: 'mesh', op: 'eq', value: 'да' } }),
        F('resection', 'Резекция кишки / сальника', 'yesno'), F('drain', 'Дренаж', 'yesno'), F('op_time', 'Длительность', 'number', { unit: 'мин' }), F('day_case', 'Хирургия одного дня', 'yesno'),
        F('ssi', 'Инфекция области хирургического вмешательства', 'yesno', { required: true }), ...compBlock(['Серома', 'Гематома', 'ИОХВ', 'Инфекция сетки', 'Задержка мочи', 'Кишечная непроходимость', 'Повреждение кишки', 'Другое'])]),
      ET('followup', 'Наблюдение', '#2a9d8f', 'Дата контакта', [F('recurrence', 'Рецидив', 'yesno', { required: true }), F('rec_date', 'Дата рецидива', 'date', { showIf: { key: 'recurrence', op: 'eq', value: 'да' } }),
        F('pain', 'Хроническая боль (> 3 мес)', 'yesno', { required: true }), F('vas', 'Боль по ВАШ', 'number', { min: 0, max: 10 }), F('mesh_inf', 'Поздняя инфекция сетки', 'yesno'), F('status', 'Статус', 'select', { options: ['жив', 'умер', 'потерян для наблюдения'] })])
    ];
    r.keyDates = { start: 'surgery' }; r.followupEvery = 365;
    r.indicators = [IND('Рецидив', 'followup', { key: 'recurrence', op: 'eq', value: 'да' }, null, 5, true), IND('Хроническая боль', 'followup', { key: 'pain', op: 'eq', value: 'да' }, null, 10, true),
      IND('ИОХВ', 'surgery', { key: 'ssi', op: 'eq', value: 'да' }, null, 5, true), IND('Clavien-Dindo ≥ IIIa', 'surgery', CDIII, null, 5, true)];
    return r;
  }
};

TEMPLATES.bariatric = {
  name: 'Бариатрическая и метаболическая хирургия',
  desc: 'Исходный вес и ИМТ, сопутствующие заболевания, вид операции, осложнения, %TWL и %EWL в динамике, ремиссия СД 2 типа.',
  make: () => {
    const r = blankRegistry('Бариатрическая хирургия');
    r.patientFields = [F('height0', 'Рост', 'number', { unit: 'см' }), F('weight0', 'Исходный вес (до операции)', 'number', { unit: 'кг' })];
    r.eventTypes = [
      ET('enrol', 'Предоперационная оценка', '#3b6fd4', 'Дата', [F('bmi0', 'Исходный ИМТ', 'calc', { formula: 'bmi(height0, weight0)' }),
        F('comorb', 'Сопутствующие заболевания', 'multiselect', { options: ['СД 2 типа', 'артериальная гипертензия', 'синдром обструктивного апноэ сна', 'ГЭРБ', 'дислипидемия', 'МАЖБП', 'остеоартрит', 'СПКЯ'] }),
        F('hba1c', 'HbA1c', 'number', { unit: '%' }), F('insulin', 'Инсулинотерапия', 'yesno'), F('prior', 'Предыдущая бариатрическая операция', 'yesno', { required: true }), F('asa', 'ASA', 'select', { options: ['I', 'II', 'III', 'IV'] })], { single: true }),
      ET('surgery', 'Операция', '#e07a2f', 'Дата операции', [F('surgeon', 'Хирург', 'user', { required: true }), F('procedure', 'Операция', 'select', { options: ['продольная резекция желудка', 'гастрошунтирование по Ру (RYGB)', 'одноанастомозное гастрошунтирование (OAGB)', 'SADI-S', 'BPD-DS', 'регулируемый бандаж', 'ревизионная'], required: true }),
        F('approach', 'Доступ', 'select', { options: ['лапароскопический', 'робот-ассистированный', 'открытый'], required: true }), F('op_time', 'Длительность', 'number', { unit: 'мин' }),
        F('leak', 'Несостоятельность швов', 'yesno', { required: true }), F('bleed', 'Кровотечение', 'yesno'), ...compBlock(['Несостоятельность швов', 'Кровотечение', 'Стриктура', 'Тромбоэмболия', 'Пневмония', 'Другое'])]),
      ET('followup', 'Наблюдение', '#2a9d8f', 'Дата контакта', [F('weight', 'Вес', 'number', { unit: 'кг', required: true }), F('bmi_now', 'ИМТ', 'calc', { formula: 'bmi(height0, weight)' }),
        F('twl', '%TWL', 'calc', { formula: 'weight0 && weight ? round((weight0 - weight) / weight0 * 100, 1) : null', unit: '%', def: 'Процент потери от исходного веса: (исходный - текущий) / исходный × 100.' }),
        F('ewl', '%EWL', 'calc', { formula: 'weight0 && weight && height0 ? round((weight0 - weight) / (weight0 - 25 * Math.pow(height0 / 100, 2)) * 100, 1) : null', unit: '%', def: 'Процент потери избыточного веса относительно ИМТ 25.' }),
        F('t2dm', 'Сахарный диабет 2 типа', 'select', { options: ['не было', 'полная ремиссия', 'частичная ремиссия', 'улучшение', 'без изменений'] }), F('gerd_new', 'ГЭРБ de novo', 'yesno'),
        F('status', 'Статус', 'select', { options: ['жив', 'умер', 'потерян для наблюдения'], required: true })])
    ];
    r.keyDates = { start: 'surgery' }; r.followupEvery = 180;
    r.indicators = [IND('Несостоятельность швов', 'surgery', { key: 'leak', op: 'eq', value: 'да' }, null, 2, true), IND('Летальность 30 дней', 'surgery', { key: 'mort30', op: 'eq', value: 'да' }, null, 0.5, true),
      IND('Clavien-Dindo ≥ IIIa', 'surgery', CDIII, null, 5, true), IND('%TWL ≥ 20% на наблюдении', 'followup', { key: 'twl', op: 'gt', value: '19.99' }, null, '', false)];
    return r;
  }
};

/* ---------- опросники (PROMs) ---------- */
const INSTRUMENTS = {
  lars: () => ({ id: uid('in'), name: 'LARS score', note: 'Синдром низкой передней резекции. 0–20: нет LARS, 21–29: минорный, 30–42: мажорный.', items: [
    { key: 'q1', label: 'Бывает ли, что вы не можете удержать газы?', options: [{ l: 'Нет, никогда', s: 0 }, { l: 'Да, реже 1 раза в неделю', s: 4 }, { l: 'Да, хотя бы раз в неделю', s: 7 }] },
    { key: 'q2', label: 'Бывает ли у вас случайное подтекание жидкого стула?', options: [{ l: 'Нет, никогда', s: 0 }, { l: 'Да, реже 1 раза в неделю', s: 3 }, { l: 'Да, хотя бы раз в неделю', s: 3 }] },
    { key: 'q3', label: 'Как часто у вас бывает стул?', options: [{ l: 'Чаще 7 раз в день', s: 4 }, { l: '4–7 раз в день', s: 2 }, { l: '1–3 раза в день', s: 0 }, { l: 'Реже 1 раза в день', s: 5 }] },
    { key: 'q4', label: 'Бывает ли, что вам приходится снова идти в туалет в течение часа после стула?', options: [{ l: 'Нет, никогда', s: 0 }, { l: 'Да, реже 1 раза в неделю', s: 9 }, { l: 'Да, хотя бы раз в неделю', s: 11 }] },
    { key: 'q5', label: 'Бывают ли у вас такие сильные позывы, что нужно бежать в туалет?', options: [{ l: 'Нет, никогда', s: 0 }, { l: 'Да, реже 1 раза в неделю', s: 11 }, { l: 'Да, хотя бы раз в неделю', s: 16 }] }
  ], bands: [{ min: 0, max: 20, l: 'нет LARS' }, { min: 21, max: 29, l: 'минорный LARS' }, { min: 30, max: 42, l: 'мажорный LARS' }] }),
  wexner: () => {
    const o = [{ l: 'Никогда', s: 0 }, { l: 'Редко (реже 1 раза в месяц)', s: 1 }, { l: 'Иногда (реже 1 раза в неделю, но чаще 1 раза в месяц)', s: 2 }, { l: 'Обычно (реже 1 раза в день, но чаще 1 раза в неделю)', s: 3 }, { l: 'Всегда (1 раз в день и чаще)', s: 4 }];
    return { id: uid('in'), name: 'Wexner (Cleveland Clinic)', note: 'Шкала анального недержания, 0–20. Чем выше, тем тяжелее.', items: [
      { key: 'solid', label: 'Недержание твёрдого стула', options: clone(o) }, { key: 'liquid', label: 'Недержание жидкого стула', options: clone(o) },
      { key: 'gas', label: 'Недержание газов', options: clone(o) }, { key: 'pad', label: 'Использование прокладок', options: clone(o) },
      { key: 'life', label: 'Изменение образа жизни', options: clone(o) }
    ], bands: [{ min: 0, max: 0, l: 'полное удержание' }] };
  }
};
function scoreInstrument(ins, answers) {
  let s = 0, n = 0;
  (ins.items || []).forEach(it => { const a = answers[it.key]; if (a != null && a !== '') { s += Number(a); n++; } });
  if (!n) return { score: null, band: '' };
  const b = (ins.bands || []).find(x => s >= x.min && s <= x.max);
  return { score: s, band: b ? b.l : '', complete: n === (ins.items || []).length };
}

/* оценка показателя качества */
function evalIndicator(ind, events, patients, reg) {
  const et = reg.eventTypes.find(e => e.id === ind.et);
  let den = 0, num = 0, miss = 0, naN = 0; const denIds = [], numIds = [], missIds = [];
  events.filter(e => e.type === ind.et).forEach(e => {
    const p = patients.find(x => x.id === e.patientId);
    const v = computeValues(reg, p, et, e.data, e.date);
    if (ind.denom && ind.denom.key && !condOK(ind.denom, v)) return;
    if (ind.num.key && isEmpty(v[ind.num.key]) && !['empty', 'filled'].includes(ind.num.op)) {
      /* 2.11: поле скрыто условием (например, степень ISREC при отсутствии несостоятельности): случай считается без события */
      const nf = formFields(et || {}).find(f => f.key === ind.num.key);
      const na = nf && nf.showIf && nf.showIf.key && !isEmpty(v[nf.showIf.key]) && !condOK(nf.showIf, v);
      if (v._na && v._na[ind.num.key] === 'na') { naN++; return; } /* 2.11: отмечено "не применимо": случай вне знаменателя */
      if (!na) { miss++; missIds.push(e.id); return; }
    }
    den++; denIds.push(e.id); if (condOK(ind.num, v)) { num++; numIds.push(e.id); }
  });
  const r = { den, num, miss, na: naN, pct: den ? Math.round(num / den * 1000) / 10 : null };
  /* списки событий для перехода к пациентам; неперечисляемые, чтобы не попадать в контекст ИИ */
  Object.defineProperties(r, { denIds: { value: denIds }, numIds: { value: numIds }, missIds: { value: missIds } });
  return r;
}
