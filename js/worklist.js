/* AddAll 2.11: лист исходов на 30-й день после операции (по образцу 30-дневного наблюдения ACS NSQIP).
   Для каждой операции (точка отсчёта регистра) проверяется, заполнена ли форма исхода.
   Подключается после biostat.js, до net.js. */
'use strict';

const Out30 = {
  DAYS: 30,
  /* форма исхода: из настройки регистра или по признаку "30 дней" в названии раздела или поля */
  outType(reg) {
    if (reg.keyDates?.out30) return etById(reg, reg.keyDates.out30) || null;
    const start = reg.keyDates?.start;
    return (reg.eventTypes || []).find(et => et.id !== start && ((et.sections || []).some(s => /30\s*дн/i.test(s.title || '')) || formFields(et).some(f => /30/.test(f.key) || /30\s*дн/i.test(f.label || '')))) || null;
  },
  /* ключевые поля формы исхода: обязательные и желательные */
  keyFields(et) { return formFields(et).filter(f => (f.required || f.key_) && f.type !== 'calc'); },
  addDays(d, n) { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); },

  async build() {
    const [regs, patients, events] = await Promise.all([Data.registries(), Data.patients(), Data.events()]);
    const t0 = today(), out = [];
    regs.forEach(reg => {
      const start = reg.keyDates?.start; const st = start && etById(reg, start); if (!st) return;
      const ot = this.outType(reg); const kf = ot ? this.keyFields(ot) : [];
      events.filter(e => e.registryId === reg.id && e.type === start && e.date).forEach(e => {
        const p = patients.find(x => x.id === e.patientId); if (!p || (typeof visibleP === 'function' && !visibleP(p))) return;
        const due = this.addDays(e.date, this.DAYS);
        const outs = ot ? events.filter(x => x.patientId === p.id && x.type === ot.id && (!x.date || x.date >= e.date)) : [];
        const o = outs.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))[0];
        let state, miss = [];
        if (!ot) state = 'noform';
        else if (o) {
          const v = computeValues(reg, p, ot, o.data, o.date); miss = kf.filter(f => condOK(f.showIf, v) && isEmpty(v[f.key]) && !(v._na && v._na[f.key]));
          state = o.status === 'черновик' || miss.length ? 'partial' : 'done';
        } else state = t0 < due ? 'wait' : 'due';
        out.push({ reg, p, e, ot, o, due, state, miss, late: Math.max(0, daysBetween(due, t0)) });
      });
    });
    return out;
  },
  async badge() { try { return (await this.build()).filter(x => x.state === 'due' || x.state === 'partial').length; } catch (e) { return 0; } }
};

Routes.out30 = async (main) => {
  const all = await Out30.build();
  const st = Routes.out30.st || (Routes.out30.st = { f: 'todo' });
  const lab = { due: 'нужен исход', partial: 'заполнено не полностью', wait: 'срок не наступил', done: 'заполнено', noform: 'форма исхода не найдена' };
  const cls = { due: 'badt', partial: 'warnt', wait: '', done: 'okt', noform: 'warnt' };
  const cnt = k => all.filter(x => k === 'todo' ? (x.state === 'due' || x.state === 'partial') : x.state === k).length;
  const draw = () => {
    let L = all.filter(x => st.f === 'all' || (st.f === 'todo' ? (x.state === 'due' || x.state === 'partial') : x.state === st.f));
    L.sort((a, b) => (b.late - a.late) || a.due.localeCompare(b.due));
    const noForm = [...new Set(all.filter(x => x.state === 'noform').map(x => x.reg.name))];
    main.innerHTML = `<div class="head"><div><h1>Исходы 30 дней</h1><div class="sub">Каждая операция должна получить форму исхода на 30-й день: осложнения, повторная госпитализация, повторная операция, летальность. Так считают ACS NSQIP и большинство хирургических регистров.</div></div></div>
      <div class="tabs" role="tablist">${[['todo', 'Нужно заполнить'], ['wait', 'Срок не наступил'], ['done', 'Заполнено'], ['all', 'Все']].map(([k, t]) => `<a href="javascript:void 0" class="${st.f === k ? 'on' : ''}" data-f="${k}" role="tab" aria-selected="${st.f === k}">${t} <span class="muted">${k === 'all' ? all.length : cnt(k)}</span></a>`).join('')}</div>
      ${noForm.length ? `<div class="card warn" style="margin-top:12px">Не найдена форма исхода 30 дней в регистрах: ${esc(noForm.join(', '))}. Добавьте в конструкторе форму с разделом «30 дней» или укажите её в настройке регистра.</div>` : ''}
      <div class="card" style="margin-top:12px">${L.length ? `<table class="tbl hover"><thead><tr><th>Пациент</th><th>Регистр</th><th>Операция</th><th>30-й день</th><th>Статус</th><th>Чего не хватает</th><th></th></tr></thead><tbody>${L.map(x => `<tr>
        <td><a href="#patient/${x.p.id}"><b>${esc(pname(x.p))}</b></a><div class="muted small">ID ${x.p.seq || ''}${x.p.localId ? ' · № ' + esc(x.p.localId) : ''}${x.p.vital === 'умер' ? ' · умер' : ''}</div></td>
        <td>${esc(x.reg.name)}</td><td>${fmtDate(x.e.date)}</td><td>${fmtDate(x.due)}${x.state === 'due' && x.late ? `<div class="bad small">просрочено на ${x.late} дн.</div>` : x.state === 'wait' ? `<div class="muted small">через ${daysBetween(today(), x.due)} дн.</div>` : ''}</td>
        <td><span class="tag ${cls[x.state]}">${lab[x.state]}</span></td>
        <td class="small">${x.miss.length ? esc(x.miss.map(f => f.label).join(', ')) : x.o && x.o.status === 'черновик' ? 'черновик' : ''}</td>
        <td>${x.ot && can('enter') && x.state !== 'done' ? `<button class="btn xs primary" data-fill="${x.e.id}">${x.o ? 'Дополнить' : 'Заполнить'}</button>` : ''}</td></tr>`).join('')}</tbody></table>` : emptyState(st.f === 'todo' ? 'Все исходы 30 дней заполнены.' : 'Нет операций в этом списке.')}
        <p class="muted small" style="margin-top:10px">Операция берётся из точки отсчёта регистра. Форма исхода: указанная в настройке регистра или форма с разделом «30 дней». Полной считается форма без статуса «черновик», где заполнены обязательные и желательные поля.</p></div>`;
    $$('[data-f]', main).forEach(b => b.onclick = () => { st.f = b.dataset.f; draw(); });
    $$('[data-fill]', main).forEach(b => b.onclick = async () => { const x = all.find(y => y.e.id === b.dataset.fill); if (!x) return; await eventDialog(x.p, x.reg, x.o || { type: x.ot.id, date: x.due <= today() ? x.due : today() }); });
  };
  draw();
};
if (typeof ROUTE_GROUP === 'object') ROUTE_GROUP.out30 = 'Работа';

{
  const _ng = navGroups;
  navGroups = async function () {
    const g = await _ng(); const w = g.find(x => x.id === 'work');
    if (w && w.items) { const i = w.items.findIndex(x => x.r === 'queries'); const n = await Out30.badge(); w.items.splice(i < 0 ? w.items.length : i, 0, { r: 'out30', t: 'Исходы 30 дней', i: '◷', badge: n }); }
    return g;
  };
}
if (typeof NAV_ICONS === 'object') NAV_ICONS.out30 = '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>';

/* ---------- 2.11: пакет к M&M на 15 минут ----------
   Отбор случаев за период по правилам: осложнение Clavien-Dindo IIIa и выше, смерть, повторная операция или госпитализация.
   15 минут: по 3 минуты на случай, поэтому в пакет по умолчанию входит 5 случаев, самые тяжёлые первыми. */
const MM = {
  PER_CASE: 3, SLOT: 15,
  sev: { I: 1, II: 2, IIIa: 3, IIIb: 4, IVa: 5, IVb: 6, V: 7 },
  async cases(reg, from, to) {
    const [patients, events, users] = await Promise.all([Data.patients(), Data.events(reg.id), DB.all('users')]);
    const out = [];
    events.filter(e => e.date && e.date >= from && e.date <= to).forEach(e => {
      const et = etById(reg, e.type); if (!et) return; const p = patients.find(x => x.id === e.patientId); if (!p || (typeof visibleP === 'function' && !visibleP(p))) return;
      const v = computeValues(reg, p, et, e.data, e.date); const why = []; let score = 0;
      formFields(et).forEach(f => {
        if (f.type === 'complist' && Array.isArray(v[f.key])) v[f.key].forEach(c => { const s = MM.sev[c.grade] || 0; if (s >= 3) { why.push(`${c.name || 'осложнение'}, CD ${c.grade}`); score = Math.max(score, s); } });
        if (f.type === 'yesno' && v[f.key] === 'да') {
          if (/death|mort|letal|смерт/i.test(f.key + ' ' + f.label)) { why.push(f.label); score = Math.max(score, 7); }
          else if (/reop|relap|повторн.*операц|leak|несостоятельн/i.test(f.key + ' ' + f.label)) { why.push(f.label); score = Math.max(score, 4); }
          else if (/readm|госпитал/i.test(f.key + ' ' + f.label)) { why.push(f.label); score = Math.max(score, 3); }
        }
      });
      if (why.length) out.push({ p, e, et, why, score, cci: formFields(et).filter(f => f.type === 'complist').map(f => FX.cci(v[f.key])).reduce((a, b) => Math.max(a, b), 0), users });
    });
    return out.sort((a, b) => b.score - a.score || b.cci - a.cci || a.e.date.localeCompare(b.e.date));
  }
};
Routes.mm = async (main, regId = '') => {
  const regs = await Data.registries(); const reg = regs.find(r => r.id === regId) || regs[0];
  if (!reg) { main.innerHTML = '<div class="head"><h1>Пакет к M&M</h1></div>' + emptyState('Нет регистров.'); return; }
  const st = Routes.mm.st || (Routes.mm.st = (() => { const t = new Date(), f = new Date(t.getFullYear(), t.getMonth() - 1, 1), l = new Date(t.getFullYear(), t.getMonth(), 0); const iso = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); return { from: iso(f), to: iso(l), pick: null }; })());
  const all = await MM.cases(reg, st.from, st.to);
  const max = Math.floor(MM.SLOT / MM.PER_CASE);
  if (!st.pick || st.pickFor !== reg.id + st.from + st.to) { st.pick = all.slice(0, max).map(x => x.e.id); st.pickFor = reg.id + st.from + st.to; }
  const picked = all.filter(x => st.pick.includes(x.e.id));
  main.innerHTML = `<div class="head noprint"><div><h1>Пакет к M&M</h1><div class="sub">Случаи за период, которые стоит разобрать: осложнения Clavien-Dindo IIIa и выше, смерть, повторная операция или госпитализация. На 15 минут помещается ${max} случаев по ${MM.PER_CASE} минуты.</div></div>
    <div class="row">${regSelect(regs, reg.id, 'mmReg', false)}<input class="inp" type="date" id="mmFrom" value="${st.from}" aria-label="Начало периода"><input class="inp" type="date" id="mmTo" value="${st.to}" aria-label="Конец периода"><button class="btn primary" id="mmPrint">Печать / PDF</button></div></div>
    <div class="card noprint"><b>Найдено случаев: ${all.length}</b>, выбрано в пакет: ${picked.length} (${picked.length * MM.PER_CASE} мин)${picked.length > max ? ' <span class="bad">больше, чем помещается в 15 минут</span>' : ''}
      ${all.length ? `<table class="tbl" style="margin-top:8px"><thead><tr><th></th><th>Пациент</th><th>Дата</th><th>Почему в списке</th><th>CCI</th></tr></thead><tbody>${all.map(x => `<tr><td><input type="checkbox" data-pk="${x.e.id}" ${st.pick.includes(x.e.id) ? 'checked' : ''} aria-label="Включить в пакет"></td><td><a href="#patient/${x.p.id}">${esc(pname(x.p))}</a></td><td>${fmtDate(x.e.date)}</td><td>${esc(x.why.join('; '))}</td><td>${x.cci}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">За период таких случаев нет.</p>'}</div>
    <div class="report mm-pack"><div class="rep-title"><div>${esc(Settings.data.center || '')}${Settings.data.department ? ' · ' + esc(Settings.data.department) : ''}</div><h1>M&M: ${esc(reg.name)}</h1><h2>${fmtDate(st.from)} - ${fmtDate(st.to)}</h2><div class="muted">Случаев в разборе: ${picked.length} · регламент ${MM.SLOT} минут · сформировано ${fmtDate(today())}</div></div>
      ${picked.map((x, i) => { return `<div class="mm-case"><h3>${i + 1}. ${esc(pname(x.p))}${x.p.birthDate ? `, ${FX.age(x.p.birthDate, x.e.date)} лет` : ''}${x.p.sex ? ', ' + esc(x.p.sex) : ''}</h3>
        <p><b>Почему в разборе:</b> ${esc(x.why.join('; '))}${x.cci ? ` · CCI ${x.cci}` : ''}</p>
        <p class="muted small">Событие: ${esc(x.et.name)}, ${fmtDate(x.e.date)}. № ИБ ${esc(x.p.localId || '')}</p>
        <div class="mm-q"><b>Для обсуждения (3 минуты):</b> что произошло; можно ли было предотвратить; что меняем в практике; кто отвечает и к какому сроку.</div></div>`; }).join('') || '<p class="muted">Выберите случаи выше.</p>'}
    </div>`;
  $('#mmReg').onchange = e => { st.pick = null; go('mm/' + e.target.value); };
  $('#mmFrom').onchange = e => { st.from = e.target.value; st.pick = null; Routes.mm(main, reg.id); };
  $('#mmTo').onchange = e => { st.to = e.target.value; st.pick = null; Routes.mm(main, reg.id); };
  $$('[data-pk]', main).forEach(cb => cb.onchange = () => { const id = cb.dataset.pk; st.pick = cb.checked ? [...st.pick, id] : st.pick.filter(x => x !== id); Routes.mm(main, reg.id); });
  $('#mmPrint').onclick = () => window.print();
};
if (typeof ROUTE_GROUP === 'object') ROUTE_GROUP.mm = 'Работа';
if (typeof NAV_ICONS === 'object') NAV_ICONS.mm = '<path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17h.01"/>';
{
  const _ng2 = navGroups;
  navGroups = async function () {
    const g = await _ng2(); const w = g.find(x => x.id === 'work');
    if (w && w.items) { const i = w.items.findIndex(x => x.r === 'out30'); w.items.splice(i < 0 ? w.items.length : i + 1, 0, { r: 'mm', t: 'Пакет к M&M', i: '⚠' }); }
    return g;
  };
}
