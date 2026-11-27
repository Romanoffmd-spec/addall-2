/* AddAll 2.0: квартальная обратная связь хирургу по мичиганской модели.
   В «Отчёте хирурга» добавляется разбор за квартал: операции и исход хирурга против регистра и против ориентира
   лучших хирургов (Achievable Benchmark of Care: лучшие хирурги, на которых приходится не менее 10% операций, Kiefe 1998),
   с переходом к списку пациентов, и план действий со сроком и ответственным. Открытый план видят хирург (в колокольчике)
   и руководитель. Сводка всех хирургов за квартал помогает подготовить встречу отделения.
   Планы хранятся в «saved» с kind: 'actionPlan'. Подключается после dendrite.js. */
'use strict';

const SurgeonPlan = {
  quarter(date) { const d = new Date(date); return d.getFullYear() + '-Q' + (Math.floor(d.getMonth() / 3) + 1); },
  bounds(q) { const [y, n] = q.split('-Q').map(Number); const from = `${y}-${String((n - 1) * 3 + 1).padStart(2, '0')}-01`; const end = new Date(y, n * 3, 0); return { from, to: `${y}-${String(n * 3).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}` }; },
  label(q) { const [y, n] = q.split('-Q'); return `${['I', 'II', 'III', 'IV'][n - 1]} квартал ${y}`; },
  recent(count = 8) { const out = []; const d = new Date(); d.setDate(1); for (let i = 0; i < count; i++) { out.push(this.quarter(d)); d.setMonth(d.getMonth() - 3); } return out; },
  /* по каждому хирургу: операции и исходы за период; ориентир лучших по скорректированной доле (k+1)/(n+2) */
  stats(ds, cfg, from, to) {
    const o = { key: cfg.okey, op: cfg.oop || 'eq', value: cfg.oval || '' };
    const rows = rowsFor(ds, cfg.et).filter(r => r.e.date >= from && r.e.date <= to && r.e.status !== 'черновик');
    const by = {};
    rows.forEach(r => { const u = r.v[cfg.ukey]; if (!u || USER_SPECIAL?.[u]) return; (by[u] ||= { id: u, n: 0, k: 0, rows: [], hit: [] }); by[u].n++; by[u].rows.push(r); if (cfg.okey && condOK(o, r.v)) { by[u].k++; by[u].hit.push(r); } });
    const list = Object.values(by);
    let abc = null;
    if (cfg.okey && list.length >= 2) {
      const sorted = list.map(x => ({ ...x, apf: (x.k + 1) / (x.n + 2) })).sort((a, b) => a.apf - b.apf);
      const need = Math.ceil(rows.length * 0.1); let sn = 0, sk = 0; for (const x of sorted) { if (sn >= need) break; sn += x.n; sk += x.k; }
      if (sn) abc = sk / sn;
    }
    const K = list.reduce((s, x) => s + x.k, 0);
    return { rows, by, list, abc, rate: rows.length ? K / rows.length : null, K };
  },
  async plans(regId, surgeonId) {
    return (await DB.all('saved')).filter(s => s.kind === 'actionPlan' && s.registryId === regId && (!surgeonId || s.surgeonId === surgeonId))
      .sort((a, b) => String(b.quarter).localeCompare(String(a.quarter)) || String(b.createdAt).localeCompare(String(a.createdAt)));
  }
};

{
  const surgeon = Routes.surgeon;
  Routes.surgeon = async (main, regId = '', userId = '', quarterArg = '') => {
    const hash = location.hash;
    await surgeon(main, regId, userId);
    const sel = $('#srU', main)?.value;
    const regs = await Data.registries();
    const reg0 = regs.find(r => r.id === regId) || regs[0];
    if (!sel || !reg0 || !$('#srOut', main)) return;
    const ds = await loadReg(reg0.id), reg = ds.reg;
    /* те же значения по умолчанию, что у отчёта хирурга */
    const cfg = Object.assign({ et: reg.keyDates?.start || reg.eventTypes[0]?.id, ukey: '', okey: '', oop: 'eq', oval: '' }, reg.surgeonReport || {});
    const etF = t => formFields(etById(reg, cfg.et) || {}).filter(f => !t || t.includes(f.type));
    if (!cfg.ukey) cfg.ukey = (etF(['user'])[0] || {}).key || '';
    if (!cfg.okey) { const o = etF(['yesno', 'select']).find(f => /летальн|смерт|умер|исход/i.test(f.label)); if (o) { cfg.okey = o.key; cfg.oval = o.type === 'yesno' ? 'да' : ''; } }
    if (!cfg.ukey) return;
    /* по умолчанию последний завершённый квартал, в котором у регистра есть операции */
    const q = SurgeonPlan.recent().includes(quarterArg) ? quarterArg
      : SurgeonPlan.recent().slice(1).find(x => { const r = SurgeonPlan.bounds(x); return SurgeonPlan.stats(ds, cfg, r.from, r.to).rows.length; }) || SurgeonPlan.recent()[1];
    const { from, to } = SurgeonPlan.bounds(q);
    const S = SurgeonPlan.stats(ds, cfg, from, to);
    const mine = S.by[sel] || { n: 0, k: 0, rows: [], hit: [] };
    const of = cfg.okey ? fieldsOf(reg, cfg.et).find(f => f.key === cfg.okey) : null;
    const name = id => ds.users.find(u => u.id === id)?.name || id;
    const ci = wilson(mine.k, mine.n);
    const plans = await SurgeonPlan.plans(reg.id, sel);
    if (location.hash !== hash) return;
    $('#spQuarter', main)?.remove();
    const lead = can('query') || ['lead', 'admin'].includes(Auth.user.role);
    const box = document.createElement('div');
    box.className = 'card';
    box.id = 'spQuarter';
    box.innerHTML = `<div class="row between"><h2>Квартальный разбор</h2><select class="inp" id="spQ" style="max-width:220px">${SurgeonPlan.recent().map(x => `<option value="${x}" ${x === q ? 'selected' : ''}>${SurgeonPlan.label(x)}</option>`).join('')}</select></div>
      <p class="muted small">${fmtDate(from)} - ${fmtDate(to)}. Сравнение с регистром и с ориентиром лучших хирургов (те, у кого лучший результат и на кого приходится не менее 10% всех операций).</p>
      <table class="tbl"><thead><tr><th></th><th>Операций</th>${of ? `<th>${esc(of.label)}</th><th>95% ДИ</th>` : ''}</tr></thead><tbody>
        <tr><td><b>${esc(name(sel))}</b></td><td><a href="javascript:void 0" data-sp-list="all">${mine.n}</a></td>${of ? `<td><a href="javascript:void 0" data-sp-list="hit">${mine.k}</a> (${pc1(mine.n ? mine.k / mine.n : null)})</td><td>${mine.n ? pc1(ci.lo) + ' - ' + pc1(ci.hi) : ''}</td>` : ''}</tr>
        <tr><td>Весь регистр</td><td>${S.rows.length}</td>${of ? `<td>${S.K} (${pc1(S.rate)})</td><td></td>` : ''}</tr>
        ${of ? `<tr><td>Ориентир лучших</td><td></td><td>${S.abc == null ? 'мало хирургов' : pc1(S.abc)}</td><td></td></tr>` : ''}</tbody></table>
      ${mine.n && mine.n < 10 ? '<p class="warnt small">Меньше 10 операций за квартал: доля исхода сильно колеблется случайно, смотрите на интервал и на результат за год.</p>' : ''}
      <div id="spList"></div>
      <h3>План действий</h3>
      ${plans.length ? `<table class="tbl small" id="spPlans"><thead><tr><th>Квартал</th><th>Что делаем</th><th>Срок</th><th>Ответственный</th><th>Состояние</th><th></th></tr></thead><tbody>
        ${plans.map(p => `<tr><td>${SurgeonPlan.label(p.quarter)}</td><td style="white-space:pre-wrap">${esc(p.text)}</td><td>${p.due ? fmtDate(p.due) : ''}</td><td>${esc(p.ownerName || '')}</td><td>${esc(p.status)}${p.doneAt ? '<div class="muted small">' + fmtDate(p.doneAt) + '</div>' : ''}</td>
          <td>${p.status !== 'выполнено' && (lead || p.surgeonId === Auth.user.id) ? `<button class="btn xs" data-sp-done="${esc(p.id)}">Выполнено</button>` : ''}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Планов пока нет.</p>'}
      ${lead || sel === Auth.user.id ? `<div class="fld"><label class="flab" for="spText">Новый пункт плана за ${SurgeonPlan.label(q)}</label><textarea class="inp" id="spText" rows="3" placeholder="Например: разобрать 2 несостоятельности на M&M, перейти на ... , проверить протокол профилактики"></textarea></div>
      <div class="row"><div class="fld"><label class="flab" for="spDue">Срок</label><input class="inp" type="date" id="spDue" value="${addDays(today(), 90)}"></div>
      <div class="fld"><label class="flab" for="spOwner">Ответственный</label><select class="inp" id="spOwner">${ds.users.filter(u => u.active !== false).map(u => `<option value="${esc(u.id)}" ${u.id === sel ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></div>
      <button class="btn primary" id="spAdd">Добавить в план</button></div>` : ''}
      ${lead ? `<details id="spAll"><summary>Все хирурги за ${SurgeonPlan.label(q)} (к встрече отделения)</summary><table class="tbl small"><thead><tr><th>Хирург</th><th>Операций</th>${of ? `<th>${esc(of.label)}</th><th>95% ДИ</th><th>Против ориентира</th>` : ''}</tr></thead><tbody>
        ${S.list.sort((a, b) => b.n - a.n).map(x => { const c = wilson(x.k, x.n); return `<tr><td><a href="#surgeon/${esc(reg.id)}/${esc(x.id)}">${esc(name(x.id))}</a></td><td>${x.n}</td>${of ? `<td>${x.k} (${pc1(x.k / x.n)})</td><td>${pc1(c.lo)} - ${pc1(c.hi)}</td><td>${S.abc == null ? '' : c.lo > S.abc ? '<span class="warnt">выше ориентира</span>' : 'в пределах'}</td>` : ''}</tr>`; }).join('') || '<tr><td class="muted">Операций нет</td></tr>'}</tbody></table>
        <p class="muted small">«Выше ориентира»: нижняя граница 95% интервала выше доли лучших. Это повод для разбора, а не вывод о качестве: учитывайте тяжесть пациентов.</p></details>` : ''}`;
    $('#srOut', main).after(box);
    $('#spQ', box).onchange = e => Routes.surgeon(main, reg.id, sel, e.target.value);
    $$('[data-sp-list]', box).forEach(a => a.onclick = () => {
      const list = a.dataset.spList === 'hit' ? mine.hit : mine.rows;
      $('#spList', box).innerHTML = `<table class="tbl small"><thead><tr><th>Дата</th><th>Пациент</th><th>№ ИБ</th></tr></thead><tbody>${list.map(r => `<tr><td>${fmtDate(r.e.date)}</td><td><a href="#patient/${esc(r.p.id)}">${esc(pname(r.p))}</a></td><td>${esc(r.p.localId || '')}</td></tr>`).join('')}</tbody></table>`;
    });
    const add = $('#spAdd', box);
    if (add) add.onclick = async () => {
      const text = $('#spText', box).value.trim();
      if (!text) return toast('Опишите, что нужно сделать', 'err');
      const owner = $('#spOwner', box).value;
      await DB.put('saved', { kind: 'actionPlan', registryId: reg.id, surgeonId: sel, quarter: q, text, due: $('#spDue', box).value, ownerId: owner, ownerName: name(owner), status: 'открыт', authorName: Auth.user.name }, 'план действий хирурга');
      toast('Добавлено в план');
      Routes.surgeon(main, reg.id, sel, q);
    };
    $$('[data-sp-done]', box).forEach(b => b.onclick = async () => {
      const p = await DB.get('saved', b.dataset.spDone);
      await DB.put('saved', { ...p, status: 'выполнено', doneAt: today() }, 'пункт плана действий выполнен');
      Routes.surgeon(main, reg.id, sel, q);
    });
  };
}

/* колокольчик: открытые пункты плана, где я хирург или ответственный */
{
  const items = Bell.items.bind(Bell);
  Bell.items = async function () {
    const out = await items();
    try {
      const mine = (await DB.all('saved')).filter(s => s.kind === 'actionPlan' && s.status !== 'выполнено' && (s.surgeonId === Auth.user.id || s.ownerId === Auth.user.id));
      mine.slice(0, 5).forEach(p => out.push({ k: p.due && p.due < today() ? 'due' : 'warn', t: 'План действий: ' + String(p.text).slice(0, 60), s: SurgeonPlan.label(p.quarter) + (p.due ? ' · срок ' + fmtDate(p.due) : ''), r: 'surgeon/' + p.registryId + '/' + p.surgeonId }));
    } catch (e) { }
    return out;
  };
}
