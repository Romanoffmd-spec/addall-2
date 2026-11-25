/* AddAll: интерфейс по ролям.
   Свой набор меню и своя главная страница для каждой роли; национальная сводка для органа здравоохранения и фармы;
   заявки на данные с рассмотрением советом регистра. Права на данные проверяет сервер (server.js), здесь только интерфейс.
   Подключается последним из модулей меню, до net.js. */
'use strict';

const RoleUI = {
  role: () => Auth.user?.role || '',
  aggregate: () => ['authority', 'sponsor'].includes(Auth.user?.role),
  /* набор пунктов меню по ролям; null означает обычное меню с фильтром по правам */
  menus: {
    authority: [['home', 'Главная'], ['national', 'Национальная сводка'], ['passport', 'Паспорта регистров'], ['manual', 'Руководство пользователя']],
    sponsor: [['home', 'Главная'], ['national', 'Сводка по регистрам'], ['datarequests', 'Заявки на данные'], ['passport', 'Паспорта регистров'], ['manual', 'Руководство пользователя']],
    itadmin: [['home', 'Главная'], ['admin-center', 'Кабинет администратора'], ['admin', 'Пользователи и настройки'], ['twofa', 'Двухфакторный вход'], ['audit', 'Журнал действий'], ['manual', 'Руководство пользователя']],
    manager: [['home', 'Главная'], ['patients', 'Пациенты учреждения'], ['followup', 'Очередь наблюдения'], ['coverage', 'Охват регистра'], ['period', 'Отчётный период'], ['compare', 'Сравнение учреждений и врачей'], ['quality', 'Показатели качества'], ['passport', 'Паспорт регистра'], ['datarequests', 'Заявки на данные'], ['manual', 'Руководство пользователя']],
    auditor: [['home', 'Главная'], ['patients', 'Пациенты'], ['queries', 'Запросы по данным'], ['audit', 'Журнал действий'], ['period', 'Отчётный период'], ['passport', 'Паспорт регистра'], ['manual', 'Руководство пользователя']],
    datamanager: [['home', 'Главная'], ['patients', 'Пациенты'], ['inbox', 'Документы из хранилища'], ['followup', 'Очередь наблюдения'], ['double', 'Двойной ввод'], ['queries', 'Запросы по данным'], ['me', 'Мои задачи'], ['manual', 'Руководство пользователя']]
  }
};

{
  const previous = navGroups;
  navGroups = async function () {
    const list = RoleUI.menus[RoleUI.role()];
    if (!list) {
      const groups = await previous();
      /* исследователь: заявки на данные в разделе «Наука» */
      const sci = groups.find(g => g.id === 'sci');
      if (sci?.items && Auth.user?.role === 'researcher' && !sci.items.some(x => x.r === 'datarequests')) sci.items.push({ r: 'datarequests', t: 'Заявки на данные' });
      const work = groups.find(g => g.id === 'work');
      if (work?.items && can('design') && !work.items.some(x => x.r === 'datarequests')) work.items.push({ r: 'datarequests', t: 'Заявки на данные' });
      return groups;
    }
    const [first, ...rest] = list;
    return [{ id: 'home', r: first[0], t: first[1], i: '⌂' }, { id: 'work', t: ROLES[RoleUI.role()]?.name || 'Работа', items: rest.map(([r, t]) => ({ r, t })) }];
  };
}
/* орган здравоохранения, фарма и ИТ-администратор не получают данных пациентов и в браузерной версии */
{
  const p0 = Data.patients, e0 = Data.events;
  Data.patients = async (...a) => ['authority', 'sponsor', 'itadmin'].includes(RoleUI.role()) ? [] : p0.apply(Data, a);
  Data.events = async (...a) => ['authority', 'sponsor', 'itadmin'].includes(RoleUI.role()) ? [] : e0.apply(Data, a);
}
Object.assign(ROUTE_GROUP, { national: 'Работа', datarequests: 'Работа' });

/* ---------- главная по ролям ---------- */
{
  const home0 = Routes.home;
  Routes.home = async (main, ...rest) => {
    const role = RoleUI.role();
    if (!['authority', 'sponsor', 'itadmin', 'manager', 'auditor', 'researcher'].includes(role)) return home0(main, ...rest);
    const card = (href, title, text, n) => `<a class="card rolecard" href="#${href}" style="display:block;text-decoration:none"><h3>${esc(title)}${n != null ? ` <span class="tag">${n}</span>` : ''}</h3><p class="muted">${esc(text)}</p></a>`;
    const regs = await Data.registries();
    const head = `<div class="head"><h1>${esc(ROLES[role]?.name || '')}</h1></div><p class="muted">${esc(Auth.user.name || '')}${Auth.user.center ? ' · ' + esc(Auth.user.center) : ''}</p>`;
    let body = '';
    if (role === 'authority' || role === 'sponsor') {
      const rel = (await DB.all('releases')).filter(r => r.kind === 'official');
      body = `<div class="card"><p>Вам доступны только официальные отчёты регистров: результаты по стране и по учреждениям, без данных отдельных пациентов. Отчёт выпускается руководителем регистра после проверки полноты и подтверждения учреждениями и после выпуска не меняется.</p></div>
        <div class="grid">${card('national', 'Национальная сводка', 'Результаты официальных отчётов по регистрам и учреждениям, с поправкой на малые объёмы', rel.length)}
        ${card('passport', 'Паспорта регистров', 'Кто отвечает за регистр, цель, правовое основание, готовность')}
        ${role === 'sponsor' ? card('datarequests', 'Заявки на данные', 'Запросить обезличенный набор данных для исследования: рассматривает совет регистра') : ''}</div>`;
    } else if (role === 'itadmin') {
      const users = await DB.all('users');
      const pending = users.filter(u => u.status === 'pending').length, active = users.filter(u => u.active !== false && !['pending', 'rejected'].includes(u.status));
      body = `<div class="card"><p>Роль ИТ-администратора: пользователи, доступы и настройки портала. Медицинские данные пациентов этой роли не видны: это разделение обязанностей по правилам информационной безопасности.</p></div>
        <div class="grid">${card('admin-center', 'Заявки и доступы', 'Одобрение регистраций, роли, учреждения', pending)}
        ${card('admin', 'Пользователи и настройки', 'Учётные записи, сроки доступа, блокировки', active.length)}
        ${card('twofa', 'Двухфакторный вход', 'Включение и сброс для сотрудников', active.filter(u => u.totpOn).length + ' из ' + active.length)}
        ${card('audit', 'Журнал действий', 'Входы, изменения пользователей и настроек')}</div>`;
    } else if (role === 'manager') {
      const [patients, queries] = await Promise.all([Data.patients(), DB.all('queries')]);
      let overdue = 0;
      try { for (const r of regs) { const s = FollowQ.summary(FollowQ.build(r, await Data.events(r.id), patients.filter(p => p.registryId === r.id), await DB.all('tasks'))); overdue += (s.overdue || 0) + (s.died || 0); } } catch (e) { overdue = null; }
      body = `<div class="card"><p>Обзор учреждения${Auth.user.center ? ' «' + esc(Auth.user.center) + '»' : ''}: полнота, просрочки, показатели и подтверждение данных перед отчётом. Медицинские записи эта роль не меняет.</p></div>
        <div class="grid">${card('patients', 'Пациенты учреждения', 'Все регистры учреждения', patients.length)}
        ${card('followup', 'Просроченное наблюдение', 'Формы, которые не внесены в срок', overdue)}
        ${card('queries', 'Открытые запросы по данным', 'Вопросы монитора к записям', queries.filter(q => q.status !== 'закрыт').length)}
        ${card('period', 'Подтвердить отчётный период', 'Проверка готовности и подпись данных учреждения')}
        ${card('compare', 'Сравнение учреждений и врачей', 'С поправкой на малые объёмы')}
        ${card('coverage', 'Охват регистра', 'Все ли случаи учреждения внесены')}</div>`;
    } else if (role === 'auditor') {
      const until = Auth.user.expiresAt ? 'Доступ до ' + fmtDate(Auth.user.expiresAt) + '.' : 'Срок доступа не ограничен: попросите администратора указать дату окончания проверки.';
      body = `<div class="card"><p>Роль внешнего аудитора: только чтение, журнал действий и запросы по данным. ${esc(until)}</p></div>
        <div class="grid">${card('patients', 'Записи для проверки', 'Сверка с первичной документацией')}
        ${card('queries', 'Запросы по данным', 'Задать вопрос к конкретному полю')}
        ${card('audit', 'Журнал действий', 'Кто, когда и что менял, с причинами изменений')}
        ${card('period', 'Отчёты за период', 'Выпуски, проверки готовности и подтверждения учреждений')}</div>`;
    } else if (role === 'researcher') {
      body = `<div class="card"><p>Вы работаете с обезличенными данными: вместо ФИО и ИИН показывается ID пациента AddAll, дата рождения сокращена до года. Документы, комментарии и материалы МДК этой роли недоступны.</p></div>
        <div class="grid">${card('analytics', 'Аналитика', 'Распределения, выживаемость, CUSUM, funnel plot')}
        ${card('riskmodel', 'Модель риска', 'Своя модель или проверка готовой')}
        ${card('datarequests', 'Заявки на данные', 'Запросить набор данных для исследования')}
        ${card('patients', 'Записи регистра', 'Обезличенный просмотр')}</div>`;
    }
    main.innerHTML = head + body;
  };
}

/* ---------- национальная сводка: только официальные выпуски ---------- */
Routes.national = async main => {
  const regs = await Data.allRegistries();
  const rel = (await DB.all('releases')).filter(r => r.kind === 'official').sort((a, b) => String(b.acceptedAt).localeCompare(String(a.acceptedAt)));
  const st = (Routes.national.st ||= {});
  if (!rel.some(r => r.id === st.id)) st.id = rel[0]?.id || '';
  const r = rel.find(x => x.id === st.id), reg = r && regs.find(x => x.id === r.registryId);
  main.innerHTML = `<div class="head"><h1>Национальная сводка</h1></div>
    <div class="card" id="nsPick"><p>Только официальные отчёты регистров: они выпускаются после проверки полноты и подтверждения учреждениями и не меняются. Данных отдельных пациентов здесь нет, группы меньше порога скрыты.</p>
      ${rel.length ? `<div class="row"><select class="inp" id="nsRel">${rel.map(x => `<option value="${esc(x.id)}" ${x.id === st.id ? 'selected' : ''}>${esc(regs.find(g => g.id === x.registryId)?.name || 'Регистр')} · ${fmtDate(x.from)} - ${fmtDate(x.to)} · версия ${x.version}</option>`).join('')}</select>${r && reg ? '<button class="btn" id="nsDl">Скачать страницу (HTML)</button>' : ''}</div>` : '<p class="muted">Официальных отчётов пока нет.</p>'}</div>
    ${r && reg ? '<div class="card"><iframe id="nsView" title="Результаты" style="width:100%;height:calc(100vh - 280px);border:0;background:#fff;border-radius:8px"></iframe></div>' : ''}`;
  const sel = $('#nsRel', main); if (sel) sel.onchange = e => { st.id = e.target.value; App.route(); };
  if (r && reg) {
    const html = National.publicHtml(reg, r);
    $('#nsView', main).srcdoc = html;
    $('#nsDl', main).onclick = () => download(`${slug(reg.name)}_${r.from}_${r.to}_v${r.version}.html`, html, 'text/html');
  }
};

/* ---------- заявки на данные ---------- */
Routes.datarequests = async main => {
  const regs = await Data.allRegistries();
  const all = (await DB.all('datarequests')).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const mine = all.filter(x => x.requesterId === Auth.user.id);
  const review = all.filter(x => x.requesterId !== Auth.user.id && regManage(regs.find(r => r.id === x.registryId)));
  const canAsk = ['researcher', 'sponsor', 'lead', 'surgeon', 'admin', 'authority'].includes(RoleUI.role());
  const rname = id => regs.find(r => r.id === id)?.name || 'Регистр';
  const cls = { 'подана': '', 'одобрена': 'okt', 'выдана': 'okt', 'отклонена': 'badt', 'отозвана': 'muted' };
  const row = (x, rev) => `<tr><td><b>${esc(rname(x.registryId))}</b><div class="muted small">${fmtDate(x.createdAt)} · ${esc(x.requesterName || '')}${x.org ? ', ' + esc(x.org) : ''}</div></td>
    <td>${esc(x.purpose)}<div class="muted small">Данные: ${esc(x.dataset)}${x.period ? ' · период: ' + esc(x.period) : ''}${x.ethics ? ' · этический комитет: ' + esc(x.ethics) : ''}</div></td>
    <td class="${cls[x.status] || ''}">${esc(x.status)}${x.reviewNote ? `<div class="small">${esc(x.reviewNote)}</div>` : ''}${x.issuedNote ? `<div class="small">Выдано: ${esc(x.issuedNote)}</div>` : ''}</td>
    <td class="row end">${rev && x.status === 'подана' ? `<button class="btn sm primary" data-drs="${esc(x.id)}:одобрена">Одобрить</button><button class="btn sm" data-drs="${esc(x.id)}:отклонена">Отклонить</button>` : ''}${rev && x.status === 'одобрена' ? `<button class="btn sm" data-drs="${esc(x.id)}:выдана">Отметить выдачу</button>` : ''}${!rev && x.status === 'подана' ? `<button class="btn sm" data-drs="${esc(x.id)}:отозвана">Отозвать</button>` : ''}</td></tr>`;
  const table = (list, rev) => list.length ? `<table class="tbl"><thead><tr><th>Регистр</th><th>Цель и данные</th><th>Состояние</th><th></th></tr></thead><tbody>${list.map(x => row(x, rev)).join('')}</tbody></table>` : '<p class="muted">Заявок нет.</p>';
  main.innerHTML = `<div class="head"><h1>Заявки на данные</h1></div>
    <div class="card"><p>Исследователь, фарма или другое учреждение запрашивает набор данных регистра. Заявку рассматривает руководитель (совет) регистра: одобряет, отклоняет или отмечает выдачу обезличенного набора. Всё сохраняется в журнале.</p></div>
    ${canAsk ? `<div class="card" id="drNew"><h2>Новая заявка</h2><div class="grid">
      <div class="fld"><label class="flab" for="drReg">Регистр</label><select class="inp" id="drReg">${regs.filter(r => r.status !== 'на одобрении').map(r => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('')}</select></div>
      <div class="fld"><label class="flab" for="drOrg">Организация</label><input class="inp" id="drOrg" value="${esc(Auth.user.center || '')}"></div>
      <div class="fld"><label class="flab" for="drPeriod">Период данных</label><input class="inp" id="drPeriod" placeholder="например, 2024-2026"></div>
      <div class="fld"><label class="flab" for="drEthics">Одобрение этического комитета (номер, дата)</label><input class="inp" id="drEthics"></div></div>
      <div class="fld"><label class="flab" for="drPurpose">Цель исследования</label><textarea class="inp" id="drPurpose" rows="2"></textarea></div>
      <div class="fld"><label class="flab" for="drSet">Какие данные нужны (поля, показатели, подгруппы)</label><textarea class="inp" id="drSet" rows="2"></textarea><div class="help">Просите минимум, нужный для цели: так заявку одобрят быстрее.</div></div>
      <div class="row end"><button class="btn primary" id="drSend">Подать заявку</button></div></div>` : ''}
    ${review.length || can('design') ? `<div class="card" id="drReview"><h2>На рассмотрении у вас</h2>${table(review, true)}</div>` : ''}
    <div class="card" id="drMine"><h2>Мои заявки</h2>${table(mine, false)}</div>`;
  const send = $('#drSend', main);
  if (send) send.onclick = async () => {
    const v = id => $('#' + id, main).value.trim();
    if (!v('drPurpose') || !v('drSet')) return toast('Опишите цель и нужные данные', 'err');
    try {
      await DB.put('datarequests', { registryId: v('drReg'), requesterId: Auth.user.id, requesterName: Auth.user.name, org: v('drOrg'), purpose: v('drPurpose'), dataset: v('drSet'), period: v('drPeriod'), ethics: v('drEthics'), status: 'подана', createdAt: nowISO() }, 'заявка на данные');
    } catch (e) { return toast(e.message, 'err'); }
    toast('Заявка подана'); App.route();
  };
  $$('[data-drs]', main).forEach(b => b.onclick = async () => {
    const [id, status] = b.dataset.drs.split(':');
    const x = all.find(y => y.id === id); if (!x) return;
    let note = '';
    if (['одобрена', 'отклонена'].includes(status)) { note = (await promptBox(status === 'отклонена' ? 'Причина отказа' : 'Условия одобрения (например, срок хранения, запрет передачи третьим лицам)'))?.trim(); if (note == null || (status === 'отклонена' && !note)) return; }
    if (status === 'выдана') { note = (await promptBox('Что выдано: файл, дата, контрольная сумма или ссылка на запись в журнале выгрузок'))?.trim(); if (!note) return; }
    const upd = { ...x, status, ...(status === 'выдана' ? { issuedNote: note, issuedAt: nowISO(), issuedBy: Auth.user.name } : status === 'отозвана' ? {} : { reviewNote: note, reviewedAt: nowISO(), reviewedBy: Auth.user.name }) };
    try { await DB.put('datarequests', upd, 'заявка на данные: ' + status); } catch (e) { return toast(e.message, 'err'); }
    toast('Сохранено'); App.route();
  });
};

if (typeof TRAINING_CHAPTERS !== 'undefined' && typeof TrainingGuide === 'object') {
  const end = TRAINING_CHAPTERS.findIndex(c => c.id === 'end');
  TRAINING_CHAPTERS.splice(end < 0 ? TRAINING_CHAPTERS.length : end, 0,
    { id: 'datarequests', name: 'Заявки на данные', page: 'datarequests', go: 'datarequests', steps: [
      { t: '#drNew', title: 'Новая заявка', text: 'Исследователь или фарма описывает цель, нужные данные, период и одобрение этического комитета. Просите минимум, нужный для цели.' },
      { t: '#drMine', title: 'Рассмотрение', text: 'Руководитель регистра одобряет или отклоняет заявку с комментарием и отмечает выдачу обезличенного набора. Всё сохраняется в журнале действий.' }
    ] });
  TrainingGuide.steps = TRAINING_CHAPTERS.flatMap((chapter, c) => chapter.steps.map((step, i) => ({ ...step, chapter, c, i })));
}
