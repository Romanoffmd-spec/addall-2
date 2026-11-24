/* AddAll: очередь наблюдения. Задачи строятся из настроек регистра: какие формы ожидаются в каждом эпизоде,
   через сколько дней, повторяются ли и какое окно допустимо (FollowQ в episodes.js).
   Хирургический лист «Исходы 30 дней» остаётся частным случаем; здесь общий механизм для любой специальности.
   Подключается после coverage.js, до net.js. */
'use strict';

Routes.followup = async (main, regId = '') => {
  const regs = await Data.registries();
  const withRules = regs.filter(r => Episodes.expected(r).length);
  const reg = regs.find(r => r.id === regId) || withRules[0] || regs[0];
  if (!reg) { main.innerHTML = '<div class="head"><h1>Очередь наблюдения</h1></div>' + emptyState('Нет регистров.'); return; }
  const [patients, events, tasks, users] = await Promise.all([Data.patients(reg.id), Data.events(reg.id), DB.all('tasks'), Data.users()]);
  const visible = patients.filter(p => typeof visibleP !== 'function' || visibleP(p));
  const pById = new Map(visible.map(p => [p.id, p]));
  const items = FollowQ.build(reg, events, visible, tasks).filter(x => pById.has(x.ep.patientId));
  const st = Routes.followup.st ||= { tab: 'todo' };
  const groups = {
    todo: x => ['overdue', 'open', 'partial'].includes(x.state),
    soon: x => x.state === 'wait' && x.due <= addDays(today(), FollowQ.AHEAD),
    reason: x => x.state === 'reason' || x.state === 'na',
    done: x => x.state === 'done',
    all: () => true
  };
  const count = k => items.filter(groups[k]).length;
  const label = { overdue: 'просрочено', open: 'можно заполнять', partial: 'только черновик', wait: 'срок не наступил', done: 'выполнено', reason: 'закрыто с причиной', na: 'не применимо' };
  const cls = { overdue: 'badt', open: 'warnt', partial: 'warnt', wait: '', done: 'okt', reason: '', na: '' };
  const userName = id => users.find(u => u.id === id)?.name || '';
  const rules = Episodes.expected(reg);

  main.innerHTML = `<div class="head"><h1>Очередь наблюдения</h1>${regSelect(regs, reg.id, 'fqReg', false)}</div>
    <p class="muted">Задачи создаются сами из настроек регистра: какие формы ожидаются в каждом эпизоде («${esc(Episodes.openerName(reg))}»), через сколько дней и как часто. Если связаться не удалось или пациент наблюдается в другом центре, закройте задачу с причиной: так видно, где исход неизвестен и почему.</p>
    ${rules.length ? `<div class="tiles">
      <div class="tile ${count('todo') ? 'warn' : ''}"><b>${count('todo')}</b><span>нужно сделать</span></div>
      <div class="tile"><b>${items.filter(x => x.state === 'overdue').length}</b><span>из них просрочено</span></div>
      <div class="tile"><b>${count('soon')}</b><span>срок в ближайшие ${FollowQ.AHEAD} дней</span></div>
      <div class="tile"><b>${count('reason')}</b><span>закрыто с причиной</span></div>
      <div class="tile"><b>${count('done')}</b><span>выполнено</span></div></div>
    <div class="tabs" role="tablist">${[['todo', 'Нужно сделать'], ['soon', 'Скоро'], ['reason', 'С причиной'], ['done', 'Выполнено'], ['all', 'Все']].map(([k, t]) => `<a href="javascript:void 0" data-fq="${k}" class="${st.tab === k ? 'on' : ''}" role="tab" aria-selected="${st.tab === k}">${t} <span class="muted">${count(k)}</span></a>`).join('')}</div>
    <div id="fqList"></div>
    <p class="muted small">Правила: ${rules.map(et => { const r = Episodes.rule(et); return `«${esc(et.name)}» ${r.mode === 'by' ? 'к' : 'на'} ${r.days}-й день${r.every ? `, затем каждые ${r.every} дней` : ''}${r.mode === 'at' ? `; засчитывается запись не раньше чем за ${r.early} дн. до срока` : ''}${r.window ? `, заполнять можно ещё ${r.window} дн. после срока` : ''}`; }).join('; ')}. Меняются в конструкторе: Формы событий, «Настроить».</p>`
    : `<div class="card">${emptyState('В этом регистре ни одна форма не отмечена как ожидаемая. Откройте конструктор, вкладка «Формы событий», кнопка «Настроить» у нужной формы, и укажите, через сколько дней она ожидается в каждом эпизоде.')}<div class="row"><a class="btn" href="#registry/${esc(reg.id)}/events">Открыть конструктор</a></div></div>`}`;
  $('#fqReg', main).onchange = e => go('followup/' + e.target.value);
  if (!rules.length) return;

  const draw = () => {
    const list = items.filter(groups[st.tab]).sort((a, b) => a.due.localeCompare(b.due));
    $('#fqList', main).innerHTML = list.length ? `<table class="tbl hover"><thead><tr><th>Пациент</th><th>Что ожидается</th><th>Срок</th><th>Состояние</th><th>Ответственный</th><th></th></tr></thead><tbody>
      ${list.map((x, i) => { const p = pById.get(x.ep.patientId); return `<tr>
        <td><a href="#patient/${esc(p.id)}"><b>${esc(pname(p))}</b></a><div class="muted small">№ ИБ ${esc(p.localId || '')}</div></td>
        <td>${esc(x.et.name)}${Episodes.rule(x.et).every ? ` <span class="muted">· срок ${x.k + 1}</span>` : ''}<div class="muted small">${esc(Episodes.openerName(reg))} от ${fmtDate(x.ep.date)}</div></td>
        <td>${fmtDate(x.due)}</td>
        <td><span class="tag ${cls[x.state]}">${label[x.state]}</span>${x.state === 'overdue' ? ` <span class="muted small">на ${x.late} дн.</span>` : ''}${x.mark ? `<div class="muted small">${esc(FollowQ.REASONS[x.mark.status] || '')}${x.mark.note ? ': ' + esc(x.mark.note) : ''}</div>` : ''}</td>
        <td class="muted">${esc(userName(x.ep.ownerId || x.ep.createdBy))}</td>
        <td class="row end">${x.state === 'done' ? `<button class="btn xs" data-open="${i}">Открыть</button>`
          : `${can('enter') ? `<button class="btn xs primary" data-fill="${i}">${x.event ? 'Дополнить' : 'Заполнить'}</button>` : ''}${x.mark ? `<button class="btn xs" data-unmark="${i}">Вернуть в работу</button>` : can('enter') ? `<button class="btn xs" data-why="${i}">Причина</button>` : ''}`}</td></tr>`; }).join('')}</tbody></table>`
      : emptyState('Задач нет.');
    const rows = list;
    $$('[data-fq]', main).forEach(a => a.onclick = () => { st.tab = a.dataset.fq; $$('[data-fq]', main).forEach(b => { b.classList.toggle('on', b === a); b.setAttribute('aria-selected', b === a); }); draw(); });
    $$('[data-fill], [data-open]', $('#fqList', main)).forEach(b => b.onclick = () => {
      const x = rows[+(b.dataset.fill ?? b.dataset.open)];
      const p = pById.get(x.ep.patientId);
      eventDialog(p, reg, x.event || { type: x.et.id, followDue: x.due, ...(x.ep.patient ? {} : { anchorEventId: x.ep.id }) });
    });
    $$('[data-why]', $('#fqList', main)).forEach(b => b.onclick = () => {
      const x = rows[+b.dataset.why];
      const m = modal(`<h3>Причина: ${esc(x.et.name)}</h3><p class="muted">${esc(pname(pById.get(x.ep.patientId)))} · срок ${fmtDate(x.due)}</p>
        <div class="fld"><label class="flab" for="fqWhy">Почему форма не будет заполнена в срок</label><select class="inp" id="fqWhy">${Object.entries(FollowQ.REASONS).map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select></div>
        <div class="fld"><label class="flab" for="fqNote">Комментарий</label><input class="inp" id="fqNote" maxlength="250" placeholder="Например: три звонка без ответа, телефон недоступен"></div>
        <p class="muted small">«Не применимо» исключает задачу из расчёта полноты. Остальные причины оставляют случай с неизвестным исходом, но объясняют почему.</p>
        <div class="row end"><button class="btn primary" id="fqOk">Сохранить</button></div>`);
      $('#fqOk', m).onclick = async () => {
        try {
          await DB.put('tasks', { registryId: reg.id, patientId: x.ep.patientId, episodeId: x.ep.id, typeId: x.et.id, due: x.due, status: $('#fqWhy', m).value, note: $('#fqNote', m).value.trim() }, 'причина по задаче наблюдения');
        } catch (error) { return toast(error.message, 'err'); }
        m.close(); toast('Сохранено'); App.route();
      };
    });
    $$('[data-unmark]', $('#fqList', main)).forEach(b => b.onclick = async () => {
      const x = rows[+b.dataset.unmark];
      try { await DB.del('tasks', x.mark.id); } catch (error) { return toast(error.message, 'err'); }
      App.route();
    });
  };
  draw();
};

ROUTE_GROUP.followup = 'Работа';
/* причины по задачам нужны и в показателях качества (evalIndicator синхронный): держим их копию перед каждой отрисовкой */
FollowQ.refresh = async () => { try { FollowQ.cache = await DB.all('tasks'); } catch (error) { FollowQ.cache = FollowQ.cache || []; } };
{
  const route = App.route.bind(App);
  App.route = async function (...args) { await FollowQ.refresh(); return route(...args); };
}
NAV_ICONS.followup = NAV_ICONS.out30 || NAV_ICONS.me;
{
  const previous = navGroups;
  navGroups = async function () {
    const groups = await previous();
    const work = groups.find(group => group.id === 'work');
    if (work?.items && !work.items.some(item => item.r === 'followup')) {
      const index = work.items.findIndex(item => item.r === 'out30');
      work.items.splice(index < 0 ? 0 : index, 0, { r: 'followup', t: 'Очередь наблюдения', i: '◷' });
    }
    return groups;
  };
}
if (typeof EN === 'object') Object.assign(EN, { 'Очередь наблюдения': 'Follow-up queue' });
