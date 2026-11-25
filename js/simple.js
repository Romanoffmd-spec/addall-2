/* AddAll: простое меню для врача. Только ежедневная работа: пациенты, регистры, задачи, очередь, документы, запросы, МДК.
   Выбор хранится в этом браузере для каждого пользователя. Подключается последним из модулей меню, до net.js. */
'use strict';

const SimpleNav = {
  key: () => 'addall2.simpleNav.' + (Auth.user?.id || ''),
  on() { try { return localStorage.getItem(SimpleNav.key()) === '1'; } catch (e) { return false; } },
  set(v) { try { localStorage.setItem(SimpleNav.key(), v ? '1' : '0'); } catch (e) { } },
  WORK: ['inbox', 'me', 'followup', 'double', 'queries', 'mdt'],
  filter(groups) {
    const out = [];
    for (const g of groups) {
      if (!g.items) { if (['home', 'patients'].includes(g.id)) out.push(g); continue; }
      if (g.id === 'regs') out.push({ ...g, items: g.items.filter(x => x.r && /^(patients|list)\//.test(x.r)) });
      if (g.id === 'work') {
        const items = g.items.filter(x => x.r && (SimpleNav.WORK.includes(x.r) || x.r.startsWith('journal/')));
        if (!items.some(x => x.r === 'followup')) items.splice(1, 0, { r: 'followup', t: 'Очередь наблюдения' });
        out.push({ ...g, items: [...items, { sep: '' }, { r: 'navmode', t: 'Показать всё меню' }] });
      }
    }
    return out;
  }
};

{
  const previous = navGroups;
  navGroups = async function () {
    const groups = await previous();
    if (SimpleNav.on()) return SimpleNav.filter(groups);
    const work = groups.find(g => g.id === 'work');
    if (work?.items && !work.items.some(x => x.r === 'navmode')) work.items.push({ sep: '' }, { r: 'navmode', t: 'Простое меню врача' });
    return groups;
  };
}
Routes.navmode = async main => {
  const next = !SimpleNav.on();
  SimpleNav.set(next);
  toast(next ? 'Включено простое меню: только ежедневная работа. Вернуть всё: «Показать всё меню».' : 'Показано полное меню');
  go('home');
};
ROUTE_GROUP.navmode = 'Работа';

/* двухфакторный вход (только серверная версия) */
Routes.twofa = async main => {
  if (!(typeof NET !== 'undefined' && NET.on)) { main.innerHTML = '<div class="head"><h1>Двухфакторный вход</h1></div>' + emptyState('Двухфакторный вход работает в серверной версии AddAll. В этой версии данные хранятся в браузере.'); return; }
  const me = (await NET.call('GET', 'me')).user;
  main.innerHTML = `<div class="head"><h1>Двухфакторный вход</h1></div>
    <div class="card" id="tfBox"><p>Кроме пароля при входе спрашивается шестизначный код из приложения на телефоне (Google Authenticator, Microsoft Authenticator и подобные). Даже если пароль узнают, без телефона войти не получится.</p>
      <p>Сейчас: <b>${me.totpOn ? 'включён' : 'выключен'}</b>.</p>
      <div class="fld"><label class="flab" for="tfPass">Ваш пароль</label><input class="inp" type="password" id="tfPass" autocomplete="current-password"></div>
      <div class="row">${me.totpOn ? '<button class="btn danger" id="tfOff">Отключить</button>' : '<button class="btn primary" id="tfSetup">Включить</button>'}</div>
      <div id="tfStep"></div></div>
    ${can('users') ? '<div class="card" id="tfAdmin"><h2>Сброс для сотрудника</h2><p class="muted">Если сотрудник потерял телефон, сбросьте ему двухфакторный вход: он войдёт по паролю и включит заново.</p><div id="tfUsers"><p class="muted">Загрузка…</p></div></div>' : ''}`;
  const pass = () => $('#tfPass', main).value;
  const off = $('#tfOff', main);
  if (off) off.onclick = async () => { const r = await NET.call('POST', '2fa/disable', { pass: pass() }); if (!r.ok) return toast(r.err || 'Не получилось', 'err'); toast('Двухфакторный вход отключён'); App.route(); };
  const setup = $('#tfSetup', main);
  if (setup) setup.onclick = async () => {
    const r = await NET.call('POST', '2fa/setup', { pass: pass() });
    if (!r.ok) return toast(r.err || 'Не получилось', 'err');
    $('#tfStep', main).innerHTML = `<h3>1. Добавьте ключ в приложение</h3><p>В приложении выберите «Ввести ключ вручную» и введите:</p><p class="mono" style="font-size:22px;letter-spacing:2px">${esc(r.secret.replace(/(.{4})/g, '$1 ').trim())}</p><p class="muted small">Тип: по времени. Имя: AddAll. Ссылка для приложений, которые её принимают: <span class="mono">${esc(r.uri)}</span></p>
      <h3>2. Введите код из приложения</h3><div class="row"><input class="inp" id="tfCode" inputmode="numeric" maxlength="6" style="max-width:160px"><button class="btn primary" id="tfOn">Подтвердить</button></div>`;
    $('#tfOn', main).onclick = async () => { const x = await NET.call('POST', '2fa/enable', { code: $('#tfCode', main).value }); if (!x.ok) return toast(x.err || 'Код не подошёл', 'err'); toast('Двухфакторный вход включён'); App.route(); };
  };
  if (can('users')) {
    const users = (await DB.all('users')).filter(x => x.totpOn);
    const holder = $('#tfUsers', main); if (!holder || !holder.isConnected) return;
    holder.innerHTML = users.length ? `<table class="tbl"><tbody>${users.map(x => `<tr><td>${esc(x.name)}</td><td class="row end"><button class="btn sm" data-tfr="${esc(x.id)}">Сбросить</button></td></tr>`).join('')}</tbody></table>` : '<p class="muted">Ни у кого не включён.</p>';
    $$('[data-tfr]', main).forEach(b => b.onclick = async () => { if (!(await confirmBox('Сбросить двухфакторный вход сотруднику?'))) return; const r = await NET.call('POST', '2fa/disable', { userId: b.dataset.tfr }); if (!r.ok) return toast(r.err || 'Не получилось', 'err'); toast('Сброшено'); App.route(); });
  }
};
ROUTE_GROUP.twofa = 'Администрирование';
{
  const previous = navGroups;
  navGroups = async function () {
    const groups = await previous();
    if (typeof NET !== 'undefined' && NET.on && !SimpleNav.on()) {
      let adm = groups.find(g => g.id === 'adm');
      if (!adm) { adm = { id: 'adm', t: 'Администрирование', items: [] }; groups.push(adm); }
      if (!adm.items.some(x => x.r === 'twofa')) adm.items.push({ r: 'twofa', t: 'Двухфакторный вход' });
    } else if (typeof NET !== 'undefined' && NET.on) {
      const work = groups.find(g => g.id === 'work');
      if (work?.items && !work.items.some(x => x.r === 'twofa')) work.items.push({ r: 'twofa', t: 'Двухфакторный вход' });
    }
    return groups;
  };
}

/* руководство пользователя: docs/manual.html, открывается внутри программы */
Routes.manual = async main => {
  main.innerHTML = `<div class="head"><h1>Руководство пользователя</h1><a class="btn" href="docs/manual.html" target="_blank" rel="noopener">Открыть в новой вкладке</a></div>
    <iframe src="docs/manual.html" title="Руководство пользователя" style="width:100%;height:calc(100vh - 220px);border:1px solid var(--line, #d5dbe6);border-radius:12px;background:#fff"></iframe>`;
};
ROUTE_GROUP.manual = 'Работа';
{
  const previous = navGroups;
  navGroups = async function () {
    const groups = await previous();
    const work = groups.find(g => g.id === 'work');
    if (work?.items && !work.items.some(x => x.r === 'manual')) work.items.push({ r: 'manual', t: 'Руководство пользователя' });
    return groups;
  };
}
