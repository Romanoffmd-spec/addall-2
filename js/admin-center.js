/* Administrative work in one place. The shared database authorizes every action. */
'use strict';

const AdminCenter = {
  async perform(action, body) {
    try {
      await NET.call('POST', 'admin/' + action, body);
      toast('Изменение сохранено');
      await App.route();
      return true;
    } catch (error) { toast(error.message, 'err'); return false; }
  },

  accountStatus(account) {
    if (account.status === 'pending') return 'Ждёт подтверждения';
    if (account.status === 'rejected') return 'Отклонён';
    if (account.active === false) return 'Отключён';
    if (account.expiresAt && account.expiresAt < today()) return 'Срок истёк';
    return 'Активен';
  },

  registryLabel(reg) {
    return esc(reg.name) + (reg.dept ? ' · ' + esc(reg.dept) : '') + (reg.center ? ' · ' + esc(reg.center) : '');
  },

  async access(reg, members, users) {
    const active = users.filter(account => account.role !== 'admin' && account.active !== false);
    const dialog = modal(`<h2>Доступ к регистру</h2><p>${this.registryLabel(reg)}</p>
      <div class="fld"><label for="acPerson">Сотрудник</label><select class="inp" id="acPerson"><option value="">Выберите сотрудника</option>
      ${active.map(account => `<option value="${esc(account.id)}">${esc(account.name)} · ${esc(account.login)}</option>`).join('')}</select></div>
      <p id="acState" class="muted" role="status">Выберите сотрудника</p>
      <div class="fld"><label for="acChange">Решение</label><select id="acChange" class="inp"><option value="grant">Выдать доступ</option>
      <option value="deny">Отозвать доступ, включая доступ по отделению</option><option value="default">Применять общие правила регистра</option></select></div>
      <div class="fld"><label for="acReason">Комментарий</label><textarea id="acReason" class="inp" maxlength="500"></textarea></div>
      <button id="acApply" class="btn primary">Сохранить доступ</button>`);
    const person = $('#acPerson', dialog);
    person.onchange = () => {
      const status = !person.value ? 'Выберите сотрудника' : (reg.deniedMembers || []).includes(person.value)
        ? 'Есть индивидуальный запрет' : members.includes(person.value) ? 'Сейчас есть доступ' : 'Сейчас доступа нет';
      $('#acState', dialog).textContent = status;
    };
    const button = $('#acApply', dialog);
    button.onclick = async () => {
      if (!person.value) return toast('Выберите сотрудника', 'err');
      button.disabled = true;
      if (await this.perform('access', { registryId: reg.id, userId: person.value, mode: $('#acChange', dialog).value,
        reason: $('#acReason', dialog).value })) dialog.close();
      else button.disabled = false;
    };
  },

  async account(action, account) {
    if (!account) return;
    const titles = { 'reject-account': 'Укажите причину отказа', 'disable-account': 'Почему нужно отключить учётную запись' };
    let reason = '';
    if (titles[action]) {
      reason = (await promptBox(titles[action]))?.trim();
      if (!reason) return;
    } else {
      const text = { 'reopen-account': 'Вернуть заявку на рассмотрение?', 'enable-account': 'Включить учётную запись?',
        sessions: 'Завершить все сеансы этого сотрудника?' };
      if (!await confirmBox(text[action])) return;
    }
    await this.perform(action, { userId: account.id, reason });
  }
};

Routes['admin-center'] = async (main, requestedTab = 'applications', chosen = '') => {
  if (!can('users') || !NET.on) {
    main.innerHTML = '<div class="head"><h1>Кабинет администратора</h1></div><p>Войдите как администратор на сервере AddAll.</p>';
    return;
  }
  const tabs = { applications: 'Заявки', people: 'Пользователи', registries: 'Регистры и доступы', history: 'История' };
  const tab = Object.hasOwn(tabs, requestedTab) ? requestedTab : 'applications';
  const [users, regs, overview] = await Promise.all([DB.all('users'), DB.all('registries'), NET.call('GET', 'admin/overview')]);
  const people = new Map(users.map(user => [user.id, user]));
  const registries = new Map(regs.map(reg => [reg.id, reg]));
  const pending = users.filter(account => account.status === 'pending');
  const requests = regs.flatMap(reg => (reg.requests || []).filter(request => request.status === 'ждёт').map(request => ({ reg, request })));
  const button = (label, selector, value, style = '') => `<button class="btn xs ${style}" ${selector}="${esc(value)}">${label}</button>`;
  const date = value => value ? fmtDT(value) : 'нет';
  const status = account => AdminCenter.accountStatus(account);
  const personRow = account => `<b>${esc(account?.name || 'Учётная запись')}</b><div class="muted small">${esc(account?.login || '')}
    ${account?.applicationNumber ? ' · ' + esc(account.applicationNumber) : ''}</div>`;
  const oldestFirst = (a, b) => String(a.createdAt).localeCompare(String(b.createdAt));
  main.innerHTML = `<div class="head"><h1>Кабинет администратора</h1><a class="btn" href="#admin">Настройки и справочники</a></div>
    <div class="tiles"><div class="tile ${pending.length ? 'warn' : ''}"><b>${pending.length}</b><span>заявок на вход</span></div>
      <div class="tile"><b>${requests.length}</b><span>запросов к регистрам</span></div>
      <div class="tile"><b>${users.filter(account => status(account) === 'Активен').length}</b><span>активных сотрудников</span></div>
      <div class="tile"><b>${regs.filter(reg => !reg.archivedAt).length}</b><span>регистров вне архива</span></div></div>
    <nav class="tabs" aria-label="Разделы кабинета">${Object.entries(tabs).map(([id, label]) => `<a href="#admin-center/${id}" class="${tab === id ? 'on' : ''}">${label}</a>`).join('')}</nav>
    <div id="adminContent"></div>`;
  const content = $('#adminContent', main);

  if (tab === 'applications') {
    const resets = users.filter(account => account.resetReq);
    content.innerHTML = `<section class="card"><h2>Подтверждение регистрации</h2>
      ${pending.sort(oldestFirst).map(account => `<div class="rq"><div class="rq-b">${personRow(account)}
        <p>${esc([account.center, account.dept, account.position].filter(Boolean).join(' · '))} · ${date(account.createdAt)}</p>
        ${account.note || account.work ? '<p>' + esc([account.work, account.note].filter(Boolean).join(' · ')) + '</p>' : ''}</div>
        <div class="row">${button('Рассмотреть', 'data-admin-approve', account.id, 'primary')}${button('Отклонить', 'data-admin-account', 'reject-account/' + account.id)}</div></div>`).join('') || '<p class="muted">Новых заявок нет.</p>'}</section>
      <section class="card"><h2>Доступ к отдельным регистрам</h2>
        ${requests.map(({ reg, request }) => `<div class="rq"><div class="rq-b">${personRow(people.get(request.userId))}
          <p>${AdminCenter.registryLabel(reg)} · ${date(request.at)}</p>${request.note ? '<p>' + esc(request.note) + '</p>' : ''}</div>
          <div class="row">${button('Разрешить', 'data-admin-request', 'grant/' + reg.id + '/' + request.id, 'primary')}
          ${button('Отклонить', 'data-admin-request', 'deny/' + reg.id + '/' + request.id)}</div></div>`).join('') || '<p class="muted">Новых запросов нет.</p>'}</section>
      <section class="card"><h2>Сброс пароля</h2>${resets.map(account => `<div class="rq"><div class="rq-b">${personRow(account)}
        <p>${esc(account.resetReq.contact || '')} · ${date(account.resetReq.at)}</p></div>
        ${button('Задать временный пароль', 'data-admin-reset', account.id)}</div>`).join('') || '<p class="muted">Запросов нет.</p>'}</section>`;
    $$('[data-admin-request]', content).forEach(control => control.onclick = async () => {
      const [mode, registryId, requestId] = control.dataset.adminRequest.split('/');
      const request = registries.get(registryId).requests.find(item => item.id === requestId);
      const reason = mode === 'deny' ? (await promptBox('Укажите причину отказа в доступе'))?.trim() : '';
      if (mode === 'deny' && !reason) return;
      await AdminCenter.perform('access', { registryId, requestId, userId: request.userId, mode, reason });
    });
    $$('[data-admin-reset]', content).forEach(control => control.onclick = async () => {
      const account = await DB.get('users', control.dataset.adminReset);
      const dialog = modal('<h3>Временный пароль</h3><p>Передайте его сотруднику лично.</p><label for="admPassword">Новый пароль</label><input id="admPassword" class="inp" type="password" autocomplete="new-password"><button id="admPasswordSave" class="btn primary">Сохранить</button>');
      $('#admPasswordSave', dialog).onclick = async () => {
        const password = $('#admPassword', dialog).value;
        if (password.length < 8) return toast('Введите восемь символов или больше', 'err');
        try {
          await setUserPassword(account, password);
          account.mustChange = true;
          delete account.resetReq;
          await DB.put('users', account, 'задан временный пароль');
          dialog.close(); toast('Пароль задан'); App.route();
        } catch (error) { toast(error.message, 'err'); }
      };
    });
  }

  if (tab === 'people') {
    content.innerHTML = `<section class="card"><div class="row between"><h2>Пользователи</h2><button id="adminCreateUser" class="btn primary">Добавить пользователя</button></div>
      <div class="row"><label for="adminPersonSearch">Поиск</label><input id="adminPersonSearch" class="inp" placeholder="Имя, логин или номер заявки">
      <label for="adminPersonStatus">Статус</label><select id="adminPersonStatus" class="inp"><option value="">Все</option>
      ${[...new Set(users.map(status))].sort().map(label => `<option>${label}</option>`).join('')}</select></div>
      <div id="adminPersonRows"></div></section>`;
    const rows = $('#adminPersonRows', content);
    const draw = () => {
      const search = $('#adminPersonSearch', content).value.trim().toLowerCase();
      const filter = $('#adminPersonStatus', content).value;
      const list = users.filter(account => (!filter || status(account) === filter) && [account.name, account.login, account.applicationNumber, account.center, account.dept]
        .some(value => String(value || '').toLowerCase().includes(search))).sort((a, b) => String(a.name).localeCompare(String(b.name)));
      rows.innerHTML = `<table class="tbl"><thead><tr><th>Сотрудник</th><th>Статус</th><th>Роль и учреждение</th><th>Последний вход</th><th>Действия</th></tr></thead><tbody>
        ${list.map(account => `<tr><td>${personRow(account)}</td><td>${status(account)}${account.rejectNote || account.disabledReason ? '<div class="muted small">' + esc(account.rejectNote || account.disabledReason) + '</div>' : ''}</td>
          <td>${esc([ROLES[account.role]?.name, account.center, account.dept].filter(Boolean).join(' · '))}</td><td>${date(account.lastLogin)}</td><td class="row">
          ${account.status === 'pending' ? button('Рассмотреть', 'data-admin-approve', account.id)
            : account.status === 'rejected' ? button('Вернуть в заявки', 'data-admin-account', 'reopen-account/' + account.id)
            : button('Изменить', 'data-admin-edit', account.id) +
              (account.id === Auth.user.id ? '' : button(account.active === false ? 'Включить' : 'Отключить', 'data-admin-account',
                (account.active === false ? 'enable-account/' : 'disable-account/') + account.id) + (account.active !== false ? button('Завершить сеансы', 'data-admin-account', 'sessions/' + account.id) : ''))}</td></tr>`).join('')}</tbody></table>
        ${list.length ? '' : '<p class="muted">Совпадений нет.</p>'}`;
    };
    $('#adminPersonSearch', content).oninput = draw;
    $('#adminPersonStatus', content).onchange = draw;
    $('#adminCreateUser', content).onclick = () => userDialog(null);
    draw();
  }

  if (tab === 'registries') {
    const sorted = regs.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    content.innerHTML = `<section class="card"><div class="row between"><h2>Регистры</h2><button class="btn" id="adminSchemaImport">Загрузить структуру</button><button id="adminCreateReg" class="btn primary">Создать регистр</button></div>
      <div class="row"><label for="adminRegistrySearch">Поиск</label><input class="inp" id="adminRegistrySearch" placeholder="Регистр или учреждение">
      <label for="adminRegistryFilter">Вид</label><select class="inp" id="adminRegistryFilter"><option value="all">Все</option><option value="active">Вне архива</option><option value="archive">Архив</option></select></div>
      <div id="adminRegistryRows"></div></section>`;
    const rows = $('#adminRegistryRows', content);
    const draw = () => {
      const filter = $('#adminRegistryFilter', content).value, search = $('#adminRegistrySearch', content).value.trim().toLowerCase();
      const list = sorted.filter(reg => (filter === 'all' || (filter === 'archive') === !!reg.archivedAt)
        && (!search || [reg.name, reg.dept, reg.center].some(value => String(value || '').toLowerCase().includes(search)) || reg.id === chosen));
      rows.innerHTML = `<table class="tbl"><thead><tr><th>Регистр</th><th>Состояние</th><th>Данные</th><th>Действия</th></tr></thead><tbody>${list.map(reg => {
        const counts = overview.counts[reg.id] || {};
        return `<tr><td><a href="#registry/${encodeURIComponent(reg.id)}">${AdminCenter.registryLabel(reg)}</a></td>
          <td>${esc(reg.archivedAt ? 'В архиве' : reg.status || 'Активен')}${reg.archiveReason ? '<div class="small muted">' + esc(reg.archiveReason) + '</div>' : ''}</td>
          <td>Пациентов ${counts.patients || 0} · событий ${counts.events || 0} · отчётов ${counts.releases || 0}</td>
          <td class="row">${button('Доступы', 'data-admin-access', reg.id)}${button(reg.archivedAt ? 'Восстановить' : 'В архив', 'data-admin-registry',
            (reg.archivedAt ? 'restore/' : 'archive/') + reg.id)}
          ${reg.archivedAt && !counts.patients && !counts.events && !counts.releases ? button('Удалить пустой', 'data-admin-registry', 'delete/' + reg.id, 'danger') : ''}</td></tr>`;
      }).join('')}</tbody></table>${list.length ? '' : '<p class="muted">Регистры не найдены.</p>'}`;
    };
    if (chosen && registries.get(chosen)) $('#adminRegistrySearch', content).value = registries.get(chosen).name;
    $('#adminRegistrySearch', content).oninput = draw;
    $('#adminRegistryFilter', content).onchange = draw;
    $('#adminCreateReg', content).onclick = () => newRegDialog();
    $('#adminSchemaImport', content).onclick = () => SchemaTransfer.pick();
    draw();
  }

  if (tab === 'history') {
    content.innerHTML = `<section class="card"><div class="row between"><h2>Последние действия</h2><a href="#audit" class="btn">Полный журнал</a></div>
      <table class="tbl"><thead><tr><th>Время</th><th>Кто</th><th>Действие</th><th>Запись</th></tr></thead><tbody>
        ${overview.operations.map(item => `<tr><td>${date(item.ts)}</td><td>${esc(item.userName || '')}</td><td>${esc(item.action || '')}</td>
        <td>${esc((item.store === 'users' ? people.get(item.recId) : registries.get(item.recId))?.name || item.recId || '')}</td></tr>`).join('')}
      </tbody></table></section>`;
  }

  content.addEventListener('click', async event => {
    const control = event.target.closest('button');
    if (!control) return;
    const { adminApprove, adminEdit, adminAccount, adminAccess, adminRegistry } = control.dataset;
    if (adminApprove || adminEdit) {
      const latest = await DB.get('users', adminApprove || adminEdit);
      if (!latest || (adminApprove && latest.status !== 'pending')) return toast('Заявка уже рассмотрена', 'err');
      return userDialog(latest, Boolean(adminApprove));
    }
    if (adminAccount) { const [action, id] = adminAccount.split('/'); return AdminCenter.account(action, people.get(id)); }
    if (adminAccess) return AdminCenter.access(registries.get(adminAccess), overview.access[adminAccess] || [], users);
    if (!adminRegistry) return;
    const [action, registryId] = adminRegistry.split('/');
    const reg = registries.get(registryId);
    if (action === 'restore') {
      if (await confirmBox('Восстановить регистр «' + reg.name + '»?')) await AdminCenter.perform(action, { registryId });
    } else if (action === 'archive') {
      const reason = (await promptBox('Укажите причину архивации «' + reg.name + '»'))?.trim();
      if (reason) await AdminCenter.perform(action, { registryId, reason });
    } else {
      const confirm = await promptBox('Для удаления пустого регистра введите его название «' + reg.name + '»');
      if (confirm !== reg.name) return;
      const reason = (await promptBox('Укажите причину удаления'))?.trim();
      if (reason) await AdminCenter.perform(action, { registryId, reason, confirm });
    }
  });
};

ROUTE_GROUP['admin-center'] = 'Администрирование';
