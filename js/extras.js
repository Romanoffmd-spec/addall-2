/* AddAll 2.0: МКБ-10/МКБ-О, непараметрические тесты, списки в регистрах, мои задачи, ИИ-ассистент */
'use strict';

/* ---------- выбор кода МКБ-10 / МКБ-О ---------- */
const ICD = {
  load(kind) {
    const g = kind === 'icd10' ? 'ICD10' : 'ICDO'; if (window[g]) return Promise.resolve(window[g]);
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = `data/${kind === 'icd10' ? 'icd10' : 'icdo'}.js`; s.onload = () => res(window[g]); s.onerror = rej; document.head.appendChild(s); });
  },
  async show(inp) {
    const list = await this.load(inp.dataset.icd); const q = inp.value.trim().toLowerCase();
    const words = q.split(/\s+/).filter(Boolean);
    const hits = (q ? list.filter(([c, l]) => { const s = (c + ' ' + l).toLowerCase(); return words.every(w => s.includes(w)) || c.toLowerCase().startsWith(q); }) : list.filter(([c]) => inp.dataset.icd === 'icd10' ? /^C(1[89]|2[01])/.test(c) : /^8(140|480|490|240)/.test(c))).slice(0, 60);
    $$('.icdpick').forEach(p => p.remove());
    const pop = document.createElement('div'); pop.className = 'pop icdpick';
    pop.innerHTML = hits.map(([c, l], i) => `<button type="button" data-v="${esc(c + ' ' + l)}" class="${i === 0 ? 'on' : ''}"><b>${esc(c)}</b><span>${esc(l)}</span></button>`).join('') || '<div class="bnone" style="padding:8px">Не найдено</div>';
    const r = inp.getBoundingClientRect(); pop.style.position = 'fixed'; pop.style.top = (r.bottom + 2) + 'px'; pop.style.left = Math.min(r.left, innerWidth - 530) + 'px';
    document.body.appendChild(pop);
    $$('button', pop).forEach(b => b.onmousedown = e => { e.preventDefault(); inp.value = b.dataset.v; inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); pop.remove(); });
  }
};
document.addEventListener('focusin', e => { if (e.target.matches?.('[data-icd]')) ICD.show(e.target); });
document.addEventListener('input', e => { if (e.target.matches?.('[data-icd]')) { clearTimeout(ICD.t); ICD.t = setTimeout(() => ICD.show(e.target), 150); } });
document.addEventListener('focusout', e => { if (e.target.matches?.('[data-icd]')) setTimeout(() => $$('.icdpick').forEach(p => p.remove()), 150); });
document.addEventListener('keydown', e => { const p = $('.icdpick'); if (!p || !e.target.matches?.('[data-icd]')) return; const bs = $$('button', p); let i = bs.findIndex(b => b.classList.contains('on'));
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); i = Math.max(0, Math.min(bs.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1))); bs.forEach((b, k) => b.classList.toggle('on', k === i)); bs[i]?.scrollIntoView({ block: 'nearest' }); }
  if (e.key === 'Enter' && bs[i]) { e.preventDefault(); bs[i].dispatchEvent(new MouseEvent('mousedown')); } if (e.key === 'Escape') p.remove(); });

/* ---------- непараметрические тесты ---------- */
Object.assign(Stats, {
  ncdf(z) { const t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989423 * Math.exp(-z * z / 2); const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p; },
  ranks(v) { const s = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]); const r = Array(v.length); let ties = 0; for (let i = 0; i < s.length;) { let j = i; while (j + 1 < s.length && s[j + 1][0] === s[i][0]) j++; const rk = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[s[k][1]] = rk; const t = j - i + 1; if (t > 1) ties += t ** 3 - t; i = j + 1; } return { r, ties }; },
  mannWhitney(a, b) { const n1 = a.length, n2 = b.length; if (!n1 || !n2) return null; const { r, ties } = this.ranks([...a, ...b]); const R1 = r.slice(0, n1).reduce((s, x) => s + x, 0); const U = R1 - n1 * (n1 + 1) / 2; const N = n1 + n2; const mu = n1 * n2 / 2, sd = Math.sqrt(n1 * n2 / 12 * ((N + 1) - ties / (N * (N - 1)))); const z = sd ? (U - mu - Math.sign(U - mu) * 0.5) / sd : 0; return { U: Math.round(Math.min(U, n1 * n2 - U) * 10) / 10, z: Math.round(z * 100) / 100, p: 2 * (1 - this.ncdf(Math.abs(z))) }; },
  wilcoxon(pairs) { const d = pairs.map(([x, y]) => y - x).filter(x => x !== 0); const n = d.length; if (n < 1) return null; const { r, ties } = this.ranks(d.map(Math.abs)); const Wp = r.reduce((s, x, i) => s + (d[i] > 0 ? x : 0), 0); const mu = n * (n + 1) / 4, sd = Math.sqrt(n * (n + 1) * (2 * n + 1) / 24 - ties / 48); const z = sd ? (Wp - mu - Math.sign(Wp - mu) * 0.5) / sd : 0; return { n, W: Wp, z: Math.round(z * 100) / 100, p: 2 * (1 - this.ncdf(Math.abs(z))) }; },
  kruskal(groups) { const all = groups.flat(), N = all.length, k = groups.length; if (k < 2 || N < 3) return null; const { r, ties } = this.ranks(all); let off = 0, H = 0; groups.forEach(g => { const R = r.slice(off, off + g.length).reduce((s, x) => s + x, 0); off += g.length; if (g.length) H += R * R / g.length; }); H = 12 / (N * (N + 1)) * H - 3 * (N + 1); const C = 1 - ties / (N ** 3 - N); if (C > 0) H /= C; return { H: Math.round(H * 100) / 100, df: k - 1, p: this.chi2p(H, k - 1) }; },
  holm(ps) { const o = ps.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]); const adj = Array(ps.length); let mx = 0; o.forEach(([p, i], k) => { mx = Math.max(mx, Math.min(1, p * (ps.length - k))); adj[i] = mx; }); return adj; }
});
ANALYSES.compare = 'Сравнение групп (Манн-Уитни / Краскел-Уоллис)';

/* ---------- списки (реестры) внутри регистра ---------- */
function listRule(l, reg) {
  const conds = (l.conds || []).map(c => { const et = c.et === '_p' ? { name: 'Пациент' } : etById(reg, c.et); const f = (c.et === '_p' ? [F('sex', 'Пол')].concat(reg.patientFields || []) : formFields(et)).find(x => x.key === c.key); return `${et?.name || ''}: ${f?.label || c.key} ${OPS[c.op] || ''} ${String(c.value || '').replace(/;/g, ', ')}`; });
  return [conds.length ? 'Правило: ' + conds.join('; ') : '', (l.manual || []).length ? `вручную: ${(l.manual || []).length}` : ''].filter(Boolean).join(' · ') || 'Пустой список';
}
function ListsAdmin(reg, body, ro, mark) {
  reg.lists = reg.lists || [];
  const draw = () => {
    body.innerHTML = `<div class="card"><p class="muted">Списки (реестры) внутри регистра: «Прямая кишка», «Платные пациенты», «TNT», «Эндоскопия» и т. п. Пациент попадает в список автоматически по правилу (условия по полям) и/или добавляется вручную. Списки видны в меню «Регистры».</p>
      <table class="tbl"><tbody>${reg.lists.map((l, i) => `<tr><td><b>${esc(l.name)}</b><div class="muted small">${esc(listRule(l, reg))}</div></td><td><a class="btn xs" href="#list/${reg.id}/${l.id}">Открыть</a></td>${ro ? '' : `<td class="nowrap"><button class="btn xs" data-le="${i}">✎</button><button class="btn xs danger" data-lx="${i}">×</button></td>`}</tr>`).join('') || '<tr><td class="muted">Списков нет</td></tr>'}</tbody></table>${ro ? '' : '<button class="btn sm" id="lNew">+ Список</button>'}</div>`;
    if (ro) return;
    $('#lNew').onclick = () => listDialog(reg, null, l => { reg.lists.push(l); mark(); draw(); });
    body.onclick = async e => { const d = e.target.dataset; if (d.le) listDialog(reg, reg.lists[d.le], l => { reg.lists[d.le] = l; mark(); draw(); }); if (d.lx && await confirmBox('Удалить список? Пациенты останутся в регистре.')) { reg.lists.splice(d.lx, 1); mark(); draw(); } };
  };
  draw();
}
function listDialog(reg, l, done) {
  const x = l ? clone(l) : { id: uid('ls'), name: '', conds: [], manual: null };
  const etO = (sel) => `<option value="_p" ${sel === '_p' ? 'selected' : ''}>Карточка пациента</option>${reg.eventTypes.map(e => `<option value="${e.id}" ${sel === e.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}`;
  const fO = (et, sel) => (et === '_p' ? [F('sex', 'Пол', 'select', { options: ['М', 'Ж'] }), ...(reg.patientFields || [])] : formFields(etById(reg, et))).map(f => `<option value="${f.key}" ${sel === f.key ? 'selected' : ''}>${esc(f.label)}</option>`).join('');
  const m = modal(`<h3>Список</h3><div class="fld"><label class="flab">Название</label><input class="inp" id="ls_n" value="${esc(x.name)}" placeholder="Например: Прямая кишка"></div>
    <label class="flab">Правило (все условия одновременно)</label><div id="ls_c"></div><button class="btn xs" id="ls_add">+ условие</button>
    <div class="fld" style="margin-top:12px"><label class="chip"><input type="checkbox" id="ls_m" ${x.manual ? 'checked' : ''}>можно добавлять пациентов вручную</label></div>
    <div class="row end"><button class="btn primary" id="ls_ok">Готово</button></div>`, { wide: true });
  const drawC = () => { $('#ls_c', m).innerHTML = x.conds.map((c, i) => `<div class="cond" data-i="${i}"><select class="inp" data-c="et">${etO(c.et)}</select><select class="inp" data-c="key">${fO(c.et, c.key)}</select><select class="inp" data-c="op">${Object.entries(OPS).map(([k, v]) => `<option value="${k}" ${c.op === k ? 'selected' : ''}>${v}</option>`).join('')}</select><div class="row"><input class="inp" data-c="value" value="${esc(c.value || '')}" style="flex:1"><button class="btn xs" data-pick="${i}">☰</button><button class="btn xs" data-cx="${i}">×</button></div></div>`).join('') || '<p class="muted small">Без условий: только ручной список.</p>'; };
  drawC();
  $('#ls_c', m).onchange = e => { const d = e.target.closest('.cond'); if (!d) return; const c = x.conds[d.dataset.i]; c[e.target.dataset.c] = e.target.value; if (e.target.dataset.c === 'et') { c.key = (c.et === '_p' ? 'sex' : formFields(etById(reg, c.et))[0]?.key); drawC(); } };
  $('#ls_c', m).onclick = async e => { const t = e.target.dataset; if (t.cx) { x.conds.splice(t.cx, 1); drawC(); } if (t.pick) { const c = x.conds[t.pick]; const f = (c.et === '_p' ? [F('sex', 'Пол', 'select', { options: ['М', 'Ж'] }), ...(reg.patientFields || [])] : formFields(etById(reg, c.et))).find(y => y.key === c.key); if (!f) return; const v = await pickValues(f.label, valueOptions(f, await Data.users(), []), String(c.value || '').split(';').filter(Boolean)); if (v == null) return; c.op = 'in'; c.value = v.join(';'); drawC(); } };
  $('#ls_add', m).onclick = () => { const et = reg.eventTypes[0]?.id; x.conds.push({ et, key: formFields(etById(reg, et))[0]?.key || '', op: 'eq', value: '' }); drawC(); };
  $('#ls_ok', m).onclick = () => { x.name = $('#ls_n', m).value.trim(); if (!x.name) return toast('Нужно название', 'err'); x.manual = $('#ls_m', m).checked ? (x.manual || []) : null; m.close(); done(x); };
}
Routes.list = (main, regId, listId) => Routes.patients(main, regId, listId);

/* ---------- мои задачи ---------- */
Routes.me = async (main) => {
  const [qs, proms, pts, regs, evs, mdt, jr, js, users] = await Promise.all([DB.all('queries'), DB.all('proms'), Data.patients(), Data.registries(), Data.events(), DB.all('mdt'), DB.all('jrecs'), DB.all('journals'), Data.users()]);
  const me = Auth.user.id; const P = (id) => pts.find(x => x.id === id);
  const mine = new Set(pts.filter(p => p.createdBy === me || evs.some(e => e.patientId === p.id && (e.createdBy === me || Object.values(e.data || {}).includes(me)))).map(p => p.id));
  const sec = (t, rows, empty) => `<div class="panel" style="margin-bottom:14px"><div class="ph"><h2>${t}</h2><span class="tag">${rows.length}</span></div>${rows.join('') || `<div class="bnone">${empty}</div>`}</div>`;
  const bi = (r, pod, cls, t, s) => `<a class="bi" href="#${r}"><span class="pod ${cls}">${pod}</span><span class="bi-t"><b>${esc(t)}</b><span>${esc(s)}</span></span></a>`;
  main.innerHTML = `<div class="head"><div><h1>Мои задачи</h1><div class="sub">Всё, что ждёт от вас действия: запросы по данным, черновики и наблюдения ваших пациентов.</div></div></div>
    ${sec('Запросы по данным', qs.filter(q => q.status !== 'закрыт' && (q.to === me || (can('query') && q.status === 'отвечен' && q.thread[0].by === me))).map(q => bi('queries', '⚑', 'due', `${P(q.patientId) ? pname(P(q.patientId)) : '?'}: ${q.fieldLabel}`, q.thread[q.thread.length - 1].text)), 'Нет')}
    ${sec('Мои черновики', evs.filter(e => e.status === 'черновик' && e.createdBy === me).map(e => { const r = regs.find(x => x.id === e.registryId); return bi('patient/' + e.patientId, '✎', 'warn', P(e.patientId) ? pname(P(e.patientId)) : '?', `${etById(r, e.type)?.name || ''} · ${fmtDate(e.date)}`); }), 'Нет незавершённых событий')}
    ${!proms.length ? '' : sec('Анкеты моих пациентов', proms.filter(x => !x.doneAt && x.due <= addDays(today(), 7) && mine.has(x.patientId)).map(x => bi('patient/' + x.patientId, '✎', x.due < today() ? 'due' : '', P(x.patientId) ? pname(P(x.patientId)) : '?', `${x.instrumentName} · срок ${fmtDate(x.due)}`)), 'Нет')}
    ${sec('Просроченные наблюдения моих пациентов', regs.flatMap(r => overdueFollowups(r, pts.filter(p => mine.has(p.id)), evs)).map(o => bi('patient/' + o.p.id, '+' + o.overdue, 'due', pname(o.p), 'последний контакт ' + fmtDate(o.last))), 'Нет')}
    ${!(typeof modOn !== 'function' || modOn('mdt')) ? '' : sec('Решения МДК, где я ответственный', mdt.flatMap(m => (m.cases || []).filter(c => c.resp === me).map(c => bi('mdt/' + m.id, '◎', '', P(c.patientId) ? pname(P(c.patientId)) : '?', `${fmtDate(m.date)}: ${c.decisionType || ''} ${c.decision || ''}`))), 'Нет')}
    ${!(typeof modOn !== 'function' || modOn('journals')) ? '' : sec('Журналы: записи на мне', jr.filter(x => { const j = js.find(y => y.id === x.journalId); return j && j.fields.some(f => f.type === 'user' && x.data?.[f.key] === me) && !/выполнено|разобран|выписан|закрыт/.test(String(x.data?.[j.groupKey] || '')); }).map(x => { const j = js.find(y => y.id === x.journalId); return bi('journal/' + j.id, j.icon || '▦', '', String(x.data?.[j.titleKey] || j.name), j.name + (j.dateKey && x.data?.[j.dateKey] ? ' · ' + fmtDate(x.data[j.dateKey]) : '')); }), 'Нет')}`;
};

/* ---------- ИИ-ассистент (боковая панель) ---------- */
const Assistant = {
  hist: [],
  toggle() { if ($('.aip')) { $('.aip').remove(); document.body.classList.remove('ai-open'); $('#aiBtn')?.classList.remove('on'); return; } this.open(); },
  async ctx() {
    const [r, id] = (location.hash.slice(1) || 'home').split('/');
    if (r === 'patient' && id) {
      const p = await DB.get('patients', id); const reg = p && await DB.get('registries', p.registryId); const ev = (await Data.events(p?.registryId)).filter(e => e.patientId === id); const users = await Data.users();
      if (!p || !reg) return { page: 'пациент' };
      return { page: 'карточка пациента', patient: { id: p.localId, age: FX.age(p.birthDate), sex: p.sex, registry: reg.name }, events: ev.sort((a, b) => (a.date || '').localeCompare(b.date || '')).map(e => { const et = etById(reg, e.type); const v = computeValues(reg, p, et, e.data, e.date); return { type: et?.name, date: e.date, data: Object.fromEntries(formFields(et).filter(f => !isEmpty(v[f.key])).map(f => [f.label, f.type === 'user' ? users.find(u => u.id === v[f.key])?.name : f.type === 'complist' ? v[f.key].map(c => c.name + ' CD ' + c.grade).join(', ') : v[f.key]])) }; }) };
    }
    const regs = await Data.registries(); const evs = await Data.events(); const pts = await Data.patients();
    return { page: r, registries: regs.map(reg => ({ name: reg.name, patients: pts.filter(p => p.registryId === reg.id).length, events: evs.filter(e => e.registryId === reg.id).length, indicators: (reg.indicators || []).map(i => ({ name: i.name, ...evalIndicator(i, evs.filter(e => e.registryId === reg.id), pts, reg) })) })) };
  },
  open() {
    document.body.classList.add('ai-open'); $('#aiBtn')?.classList.add('on');
    const el = document.createElement('aside'); el.className = 'aip';
    el.innerHTML = `<div class="aip-h"><b>✦ Ассистент</b><span class="muted small">${AI.ready() ? (AI.local() ? 'локальная модель' : 'облачная модель') : 'не настроен'}</span><button class="iconbtn" id="aipX">×</button></div>
      <div class="aip-l" id="aipL">${this.hist.map(m => `<div class="msg ${m.r}">${esc(m.t)}</div>`).join('') || `<div class="muted small">Спросите о текущей странице. На карточке пациента ассистент видит все его события (без ФИО), в остальных разделах сводку по регистрам.</div><div class="aip-q">${['Кратко резюмируй пациента', 'Чего не хватает в данных?', 'Сравни показатели качества с целями', 'Предложи вопрос для МДК'].map(q => `<button class="btn xs" data-q="${q}">${q}</button>`).join('')}</div>`}</div>
      <div class="aip-f"><textarea class="inp" id="aipT" placeholder="Вопрос… (Enter отправить, Shift+Enter перенос)"></textarea><button class="btn primary" id="aipS">→</button></div>`;
    document.body.appendChild(el);
    const send = async (q) => {
      q = (q || $('#aipT').value).trim(); if (!q) return; if (!AI.ready()) return toast('ИИ не настроен', 'err');
      $('#aipT').value = ''; this.hist.push({ r: 'u', t: q }); $('#aipL').insertAdjacentHTML('beforeend', `<div class="msg u">${esc(q)}</div><div class="msg a" id="aipW">думаю…</div>`); $('#aipL').scrollTop = 1e9;
      try {
        const ctx = await this.ctx();
        const t = await AI.call(`Ты ассистент хирурга в платформе клинических регистров AddAll. Отвечай по-русски, кратко и по делу, без длинных тире. Опирайся только на данные контекста, не выдумывай. Если данных нет, так и скажи.\nКонтекст страницы (JSON): ${JSON.stringify(ctx).slice(0, 30000)}\n\nДиалог:\n${this.hist.slice(-8).map(m => (m.r === 'u' ? 'Врач: ' : 'Ассистент: ') + m.t).join('\n')}\nАссистент:`, { text: '' });
        this.hist.push({ r: 'a', t: t.trim() }); $('#aipW').outerHTML = `<div class="msg a">${esc(t.trim())}</div>`;
      } catch (e) { $('#aipW').outerHTML = `<div class="msg a bad">${esc(e.message)}</div>`; }
      $('#aipL').scrollTop = 1e9;
    };
    $('#aipS').onclick = () => send(); $('#aipT').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };
    $$('[data-q]', el).forEach(b => b.onclick = () => send(b.dataset.q));
    $('#aipX').onclick = () => this.toggle();
  }
};
