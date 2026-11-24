/* AddAll 2.0: вход, расширенная регистрация с отделениями, заявки на доступ, профиль */

const DEFAULT_DEPTS = ['Колопроктология', 'Абдоминальная онкохирургия', 'Торакальная хирургия', 'Онкогинекология', 'Онкоурология', 'Опухоли головы и шеи', 'Маммология', 'Эндоскопия', 'Химиотерапия', 'Лучевая терапия', 'Анестезиология и реанимация (ЦАРИТ)', 'Патоморфология', 'Лучевая диагностика', 'Научный отдел'];
const POSITIONS = ['Заведующий отделением', 'Врач-хирург', 'Врач-онколог', 'Врач-эндоскопист', 'Врач-анестезиолог', 'Врач-патоморфолог', 'Врач-радиолог', 'Химиотерапевт', 'Резидент', 'Интерн', 'Медицинская сестра', 'Научный сотрудник', 'Дата-менеджер / координатор исследований', 'Студент', 'Другое'];
const SIGNUP_ROLES = [
  ['surgeon', '⚕', 'Врач', 'ввод и правка данных, МДК, анкеты, анализ, рандомизация'],
  ['resident', '✚', 'Резидент', 'ввод данных и заявки на новые регистры'],
  ['researcher', '∑', 'Исследователь', 'анализ и экспорт обезличенных данных'],
  ['monitor', '⚑', 'Монитор', 'проверка данных, запросы, аудит'],
  ['viewer', '◎', 'Студент / просмотр', 'только просмотр и комментарии']
];
const depts = () => { const l = (Settings.data.departments && Settings.data.departments.length) ? [...Settings.data.departments] : [...DEFAULT_DEPTS]; if (Settings.data.department && !l.includes(Settings.data.department)) l.unshift(Settings.data.department); return l; };
const userDept = (u) => u?.dept || '';
function deptSelect(cur, id, any) {
  const list = depts(); const other = cur && !list.includes(cur);
  return `<select class="inp" id="${id}">${any ? '<option value="">все отделения</option>' : '<option value="">выберите отделение</option>'}${list.map(d => `<option ${d === cur ? 'selected' : ''}>${esc(d)}</option>`).join('')}<option value="__other" ${other ? 'selected' : ''}>Другое…</option></select><input class="inp" id="${id}_o" placeholder="Название отделения" value="${other ? esc(cur) : ''}" style="margin-top:6px;${other ? '' : 'display:none'}">`;
}
function bindDept(root, id) { const s = $('#' + id, root), o = $('#' + id + '_o', root); if (!s) return; s.onchange = () => { o.style.display = s.value === '__other' ? '' : 'none'; if (s.value === '__other') o.focus(); }; }
function readDept(root, id) { const s = $('#' + id, root); if (!s) return ''; return s.value === '__other' ? $('#' + id + '_o', root).value.trim() : s.value; }
function posSelect(cur, id) { const other = cur && !POSITIONS.includes(cur); return `<select class="inp" id="${id}"><option value=""></option>${POSITIONS.map(p => `<option ${p === cur || (other && p === 'Другое') ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select><input class="inp" id="${id}_o" placeholder="Ваша должность" value="${other ? esc(cur) : ''}" style="margin-top:6px;${other ? '' : 'display:none'}">`; }
function bindPos(root, id, onChange) { const s = $('#' + id, root), o = $('#' + id + '_o', root); s.onchange = () => { o.style.display = s.value === 'Другое' ? '' : 'none'; onChange && onChange(s.value); }; }
function readPos(root, id) { const s = $('#' + id, root); return s.value === 'Другое' ? ($('#' + id + '_o', root).value.trim() || 'Другое') : s.value; }
function passScore(p) { let s = 0; if (p.length >= 8) s++; if (p.length >= 12) s++; if (/[A-ZА-Я]/.test(p) && /[a-zа-я]/.test(p)) s++; if (/\d/.test(p)) s++; if (/[^\wА-Яа-я]/.test(p)) s++; return Math.min(4, s); }
const PASS_T = ['очень слабый', 'слабый', 'средний', 'хороший', 'надёжный'];
const fullName = (a, b, c) => [a, b, c].map(x => String(x || '').trim()).filter(Boolean).join(' ');

/* ---------- страница входа и регистрации ---------- */
Pages.login = async function (mode = 'login') {
  document.body.className = '';
  const selfReg = Settings.data.selfReg !== false;
  if (!selfReg && mode === 'reg') mode = 'login';
  const head = `<div class="auth-brand"><img src="media/addall-emblem.svg" alt=""><b>Add<i>All</i> 2.0</b></div><p class="muted">${esc([Settings.data.center, Settings.data.department].filter(Boolean).join(' ') || 'Платформа регистров')}</p>`;
  const tabs = selfReg ? `<div class="aseg"><button class="${mode === 'login' ? 'on' : ''}" data-am="login">Вход</button><button class="${mode === 'reg' ? 'on' : ''}" data-am="reg">Регистрация</button></div>` : '';
  let body = '';
  if (mode === 'wait') {
    body = `<div class="await"><div class="await-i">⏳</div><h2>Заявка отправлена</h2><p class="muted">Администратор проверит данные, подтвердит роль, отделение и доступ к регистрам. После этого войдите с тем же логином и паролем.</p><button class="btn primary block" data-am="login">Ко входу</button></div>`;
  } else if (mode === 'forgot') {
    body = `<h2 class="ah">Восстановление пароля</h2><p class="muted small">Сервера нет, поэтому письмо не придёт. Заявка уйдёт администратору платформы: он задаст временный пароль и передаст его вам лично.</p>
      <div class="fld"><label class="flab">Логин или рабочая почта</label><input class="inp" id="f_login"></div>
      <div class="fld"><label class="flab">Как с вами связаться</label><input class="inp" id="f_cont" placeholder="телефон или кабинет"></div>
      <button class="btn primary block" id="f_go">Отправить заявку</button><button class="linkbtn" data-am="login">← Ко входу</button>`;
  } else if (mode === 'reg') {
    body = `<h2 class="ah">Регистрация</h2><p class="muted small">Доступ к данным откроется после подтверждения администратором. Поля со * обязательны.</p>
      <div class="asec">Личные данные</div>
      <div class="grid g3">
        <div class="fld"><label class="flab">Фамилия <i class="req">*</i></label><input class="inp" id="r_ln" autocomplete="family-name"></div>
        <div class="fld"><label class="flab">Имя <i class="req">*</i></label><input class="inp" id="r_fn" autocomplete="given-name"></div>
        <div class="fld"><label class="flab">Отчество</label><input class="inp" id="r_mn" placeholder="если есть"></div>
      </div>
      <div class="asec">Место работы</div>
      <div class="grid">
        <div class="fld"><label class="flab">Отделение <i class="req">*</i></label>${deptSelect('', 'r_dep')}</div>
        <div class="fld"><label class="flab">Должность <i class="req">*</i></label>${posSelect('', 'r_pos')}</div>
        <div class="fld" id="r_yw" style="display:none"><label class="flab">Год резидентуры</label><select class="inp" id="r_yr"><option value=""></option>${[1, 2, 3, 4, 5].map(y => `<option value="${y}">${y}-й год</option>`).join('')}</select></div>
        <div class="fld" id="r_spw" style="display:none"><label class="flab">Специальность резидентуры</label><input class="inp" id="r_sp" placeholder="например: общая хирургия"></div>
        ${centers().length ? `<div class="fld"><label class="flab">Центр</label>${centerSelect('', 'r_ce')}</div>` : ''}
        <div class="fld"><label class="flab">Рабочий телефон</label><input class="inp" id="r_ph" type="tel" placeholder="+7 …"></div>
        <div class="fld"><label class="flab">ORCID</label><input class="inp" id="r_or" placeholder="0000-0000-0000-0000"></div>
      </div>
      <div class="asec">Роль</div>
      <div class="roles">${SIGNUP_ROLES.map((r, i) => `<button type="button" class="role${i === 0 ? ' on' : ''}" data-role="${r[0]}"><span class="ri">${r[1]}</span><b>${r[2]}</b><em>${r[3]}</em></button>`).join('')}</div>
      <p class="fhint">Роль, руководителя и права подтверждает администратор.</p>
      <div class="fld" style="margin-top:12px"><label class="flab">Над чем будете работать</label><input class="inp" id="r_wk" placeholder="например: регистр колоректального рака, база LLND"><span class="fhint">После подтверждения вам откроются регистры вашего отделения. Доступ к регистрам других отделений запрашивается внутри системы.</span></div>
      <div class="asec">Вход</div>
      <div class="grid">
        <div class="fld"><label class="flab">Логин или рабочая почта <i class="req">*</i></label><input class="inp" id="r_lg" autocomplete="username"></div>
        <div class="fld"></div>
        <div class="fld"><label class="flab">Пароль <i class="req">*</i></label><input class="inp" type="password" id="r_pw" autocomplete="new-password"><div class="pbar"><i id="r_pb"></i></div><span class="fhint" id="r_pt">от 8 символов, буквы и цифры</span></div>
        <div class="fld"><label class="flab">Пароль ещё раз <i class="req">*</i></label><input class="inp" type="password" id="r_pw2" autocomplete="new-password"></div>
      </div>
      <div class="fld"><label class="flab">Комментарий для администратора</label><textarea class="inp" id="r_cm" rows="2" placeholder="например: участвую в регистре LLND, руководитель Иванов И.И."></textarea></div>
      <label class="chk agree"><input type="checkbox" id="r_ok"> <span>Обязуюсь соблюдать конфиденциальность персональных и медицинских данных пациентов и не передавать свой логин и пароль другим лицам <i class="req">*</i></span></label>
      <button class="btn primary block" id="r_go">Отправить заявку</button>`;
  } else {
    body = `<div class="fld"><label class="flab">Логин</label><input class="inp" id="l_login" autocomplete="username" autofocus></div>
      <div class="fld"><label class="flab">Пароль</label><input class="inp" type="password" id="l_pass" autocomplete="current-password"></div>
      <div class="aerr" id="l_err" style="display:none"></div>
      <button class="btn primary block" id="l_go">Войти</button>
      <button class="linkbtn" data-am="forgot">Забыли пароль?</button>`;
  }
  document.body.innerHTML = `<div class="auth"><div class="auth-box ${mode === 'reg' ? 'wide' : ''}">${head}${mode === 'wait' ? '' : tabs}${body}</div></div>`;
  $$('[data-am]').forEach(b => b.onclick = () => Pages.login(b.dataset.am));

  if (mode === 'login') {
    const go_ = async () => {
      if (await Auth.login($('#l_login').value, $('#l_pass').value)) return App.boot();
      const m = { pending: 'Заявка ещё ждёт подтверждения администратором.', rejected: 'Заявка на доступ отклонена. Обратитесь к администратору.', off: 'Учётная запись отключена. Обратитесь к администратору.', locked: `Вход заблокирован после 3 неудачных попыток до ${Auth.lockedUntil ? new Date(Auth.lockedUntil).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : ''}. Можно подождать или обратиться к администратору.`, expired: 'Срок действия учётной записи истёк. Обратитесь к администратору.', bad2: 'Неверный логин или пароль. Осталось попыток: 2.', bad1: 'Неверный логин или пароль. Осталась 1 попытка, затем вход заблокируется на 15 минут.' }[Auth.lastErr] || 'Неверный логин или пароль';
      const e = $('#l_err'); e.textContent = m; e.style.display = '';
    };
    $('#l_go').onclick = go_; $('#l_pass').onkeydown = e => { if (e.key === 'Enter') go_(); };
  }
  if (mode === 'forgot') {
    $('#f_go').onclick = async () => {
      const lg = $('#f_login').value.trim().toLowerCase(); if (!lg) return toast('Введите логин', 'err');
      const contact = $('#f_cont').value.trim();
      if (typeof NET !== 'undefined' && NET.on) {
        try { await NET.call('POST', 'request-reset', { login: lg, contact }); }
        catch (error) { return toast(error.message, 'err'); }
      } else {
        const u = (await DB.all('users')).find(x => x.login?.toLowerCase() === lg);
        if (u) { u.resetReq = { at: nowISO(), contact }; await DB.rawPut('users', u); await DB.rawPut('audit', { id: uid('au_'), ts: nowISO(), user: u.id, userName: u.name, action: 'заявка на сброс пароля', store: 'users', recId: u.id }); }
      }
      toast('Заявка отправлена администратору'); Pages.login('login');
    };
  }
  if (mode === 'reg') {
    const root = document.body; bindDept(root, 'r_dep');
    bindPos(root, 'r_pos', v => { const res = /Резидент|Интерн/.test(v); $('#r_yw').style.display = $('#r_spw').style.display = res ? '' : 'none'; if (res) pickRole('resident'); else if (v === 'Студент') pickRole('viewer'); else if (/Научный|Дата-менеджер/.test(v)) pickRole('researcher'); else if (/Врач|Заведующий|Химиотерапевт/.test(v)) pickRole('surgeon'); });
    let role = 'surgeon';
    const pickRole = (r) => { role = r; $$('.role').forEach(b => b.classList.toggle('on', b.dataset.role === r)); };
    $$('.role').forEach(b => b.onclick = () => pickRole(b.dataset.role));
    $('#r_pw').oninput = () => { const s = passScore($('#r_pw').value); $('#r_pb').style.width = (($('#r_pw').value ? s + 1 : 0) * 20) + '%'; $('#r_pb').dataset.s = s; $('#r_pt').textContent = $('#r_pw').value ? 'Пароль: ' + PASS_T[s] : 'от 8 символов, буквы и цифры'; };
    $('#r_go').onclick = async () => {
      const v = id => ($('#' + id)?.value || '').trim();
      const dept = readDept(root, 'r_dep'), pos = readPos(root, 'r_pos');
      if (!v('r_ln') || !v('r_fn')) return toast('Укажите фамилию и имя', 'err');
      if (!dept) return toast('Выберите отделение', 'err');
      if (!pos) return toast('Выберите должность', 'err');
      if (!v('r_lg')) return toast('Укажите логин или почту', 'err');
      if ($('#r_pw').value.length < 8 || passScore($('#r_pw').value) < 2) return toast('Пароль слабый: минимум 8 символов, буквы и цифры', 'err');
      if ($('#r_pw').value !== $('#r_pw2').value) return toast('Пароли не совпадают', 'err');
      if (!$('#r_ok').checked) return toast('Подтвердите обязательство о конфиденциальности', 'err');
      const all = await DB.all('users');
      if (all.some(x => x.login?.toLowerCase() === v('r_lg').toLowerCase())) return toast('Такой логин уже зарегистрирован', 'err');
      const u = { id: uid('u_'), name: fullName(v('r_ln'), v('r_fn'), v('r_mn')), lastName: v('r_ln'), firstName: v('r_fn'), middleName: v('r_mn'), login: v('r_lg'), email: v('r_em'),
        role, reqRole: role, position: pos, dept, resYear: v('r_yr'), resSpec: v('r_sp'), center: v('r_ce'), phone: v('r_ph'), orcid: v('r_or'), reqRegs: [], work: v('r_wk'), regAccess: [], note: v('r_cm'),
        code: '', active: false, status: 'pending', createdAt: nowISO(), agreedAt: nowISO() };
      await setUserPassword(u, $('#r_pw').value);
      try { await DB.rawPut('users', u); }
      catch (error) { return toast(error.message, 'err'); }
      await DB.rawPut('audit', { id: uid('au_'), ts: nowISO(), user: u.id, userName: u.name, action: 'регистрация (заявка)', store: 'users', recId: u.id });
      Pages.login('wait');
    };
  }
};

/* ---------- первый запуск: добавляем отделения и саморегистрацию ---------- */
const _setup = Pages.setup;
Pages.setup = function () {
  _setup.call(Pages);
  const g = $('.auth-box .grid');
  g.insertAdjacentHTML('beforeend', `<div class="fld" style="grid-column:1/-1"><label class="flab">Отделения учреждения (по одному в строке): из них выбирают при регистрации</label><textarea class="inp" id="s_depts" rows="5">${esc(DEFAULT_DEPTS.join('\n'))}</textarea></div>
    <div class="fld" style="grid-column:1/-1"><label class="chk"><input type="checkbox" id="s_self" checked> <span>Разрешить сотрудникам регистрироваться самим (с подтверждением администратором)</span></label></div>`);
  const btn = $('#s_go'), orig = btn.onclick;
  btn.onclick = async () => {
    const list = $('#s_depts').value.split('\n').map(s => s.trim()).filter(Boolean), self = $('#s_self').checked, dep = $('#s_dep').value.trim();
    const _put = DB.rawPut; DB.rawPut = async (st, o) => { if (st === 'settings') { o.departments = list; o.selfReg = self; } return _put.call(DB, st, o); };
    try { await orig(); } finally { DB.rawPut = _put; }
    if (Auth.user && dep) { Auth.user.dept = dep; await DB.rawPut('users', Auth.user); }
  };
};

/* ---------- администрирование: заявки, отделения, доступ ---------- */
const _admin = Routes.admin;
Routes.admin = async (main) => {
  await _admin(main);
  const users = await DB.all('users'), regs = (await DB.all('registries')).sort((a, b) => a.name.localeCompare(b.name));
  const pend = users.filter(u => u.status === 'pending'), resets = users.filter(u => u.resetReq);
  const card = `<div class="card reqcard"><div class="row" style="justify-content:space-between"><h3>Заявки на доступ ${pend.length ? `<span class="tag warnt">${pend.length}</span>` : ''}</h3><span class="muted small">Саморегистрация: <label class="chk" style="display:inline-flex"><input type="checkbox" id="st_self" ${Settings.data.selfReg !== false ? 'checked' : ''}> <span>включена</span></label></span></div>
    ${pend.length ? pend.map(u => `<div class="rq"><span class="av">${esc(initials(u.name))}</span><div class="rq-b"><b>${esc(u.name)}</b><span>${esc([u.position, u.resYear ? u.resYear + '-й год' + (u.resSpec ? ', ' + u.resSpec : '') : '', u.dept, u.center].filter(Boolean).join(' · '))}</span>
      <span class="muted small">логин <span class="mono">${esc(u.login)}</span>${u.phone ? ' · ' + esc(u.phone) : ''}${u.orcid ? ' · ORCID ' + esc(u.orcid) : ''} · ${fmtDate(u.createdAt?.slice(0, 10))} · просит роль «${esc(ROLES[u.reqRole]?.name || '')}»${u.work ? ' · работа: ' + esc(u.work) : ''}</span>${u.note ? `<span class="rq-note">«${esc(u.note)}»</span>` : ''}</div>
      <div class="rq-a"><button class="btn primary sm" data-ua="${u.id}">Рассмотреть</button><button class="btn sm" data-ux="${u.id}">Отклонить</button></div></div>`).join('') : '<p class="muted">Новых заявок нет.</p>'}
    ${resets.length ? `<h4 style="margin-top:14px">Сброс пароля</h4>${resets.map(u => `<div class="rq"><span class="av">${esc(initials(u.name))}</span><div class="rq-b"><b>${esc(u.name)}</b><span class="muted small">${fmtDate(u.resetReq.at.slice(0, 10))}${u.resetReq.contact ? ' · связь: ' + esc(u.resetReq.contact) : ''}</span></div><div class="rq-a"><button class="btn primary sm" data-urs="${u.id}">Задать пароль</button><button class="btn sm" data-urx="${u.id}">Убрать</button></div></div>`).join('')}` : ''}</div>`;
  const head = $('.head', main); head.insertAdjacentHTML('afterend', card);
  /* таблица пользователей: отделение и статус заявки */
  const tbl = $$('.tbl', main)[0];
  if (tbl) {
    $$('thead th', tbl)[3].insertAdjacentHTML('afterend', '<th>Отделение</th><th>Регистры</th>');
    const ordered = await Data.users();
    $$('tbody tr', tbl).forEach((tr, i) => { const u = ordered[i]; if (!u) return; tr.children[3].insertAdjacentHTML('afterend', `<td>${esc(u.dept || '')}</td><td class="small">${u.role === 'admin' ? '<span class="muted">все</span>' : '<span class="muted">своего отделения</span>' + (u.regAccess?.length ? ' + ' + esc(u.regAccess.map(id => regs.find(r => r.id === id)?.name).filter(Boolean).join(', ')) : '')}</td>`); const st = tr.children[tr.children.length - 2]; if (u.status === 'pending') st.innerHTML = '<span class="tag warnt">ждёт подтверждения</span>'; else if (u.status === 'rejected') st.innerHTML = '<span class="bad">отклонён</span>'; });
  }
  /* отделения в карточке «Учреждение» */
  $('#st_d').closest('.fld').insertAdjacentHTML('afterend', `<div class="fld"><label class="flab">Отделения для регистрации (по одному в строке)</label><textarea class="inp" id="st_depts" rows="4">${esc(depts().join('\n'))}</textarea></div>`);
  const sv = $('#st_s').onclick; $('#st_s').onclick = async () => { Settings.data.departments = $('#st_depts').value.split('\n').map(s => s.trim()).filter(Boolean); await sv(); };
  $('#st_self').onchange = async () => { Settings.data.selfReg = $('#st_self').checked; await Settings.save(); toast(Settings.data.selfReg ? 'Саморегистрация включена' : 'Саморегистрация выключена'); };
  $$('[data-ua]').forEach(b => b.onclick = () => userDialog(users.find(u => u.id === b.dataset.ua), true));
  $$('[data-ux]').forEach(b => b.onclick = async () => { const u = users.find(x => x.id === b.dataset.ux); const why = await promptBox('Причина отказа (необязательно)'); if (why === null) return; u.status = 'rejected'; u.active = false; u.rejectNote = why || ''; await DB.put('users', u, 'заявка отклонена'); toast('Заявка отклонена'); App.route(); });
  $$('[data-urs]').forEach(b => b.onclick = async () => { const u = users.find(x => x.id === b.dataset.urs); const p = await promptBox('Временный пароль для ' + u.name + ' (от 8 символов). Передайте его лично.'); if (!p) return; if (p.length < 8) return toast('Минимум 8 символов', 'err'); await setUserPassword(u, p); u.mustChange = true; delete u.resetReq; await DB.put('users', u, 'сброс пароля'); toast('Пароль задан'); App.route(); });
  $$('[data-urx]').forEach(b => b.onclick = async () => { const u = users.find(x => x.id === b.dataset.urx); delete u.resetReq; await DB.put('users', u); App.route(); });
  $$('[data-ue]').forEach(b => b.onclick = () => userDialog(users.find(u => u.id === b.dataset.ue)));
};

/* ---------- карточка пользователя (админ): все поля и доступ ---------- */
userDialog = async function (u, approving) {
  const isNew = !u; const regs = (await DB.all('registries')).sort((a, b) => a.name.localeCompare(b.name)); const all = await DB.all('users');
  const acc = new Set(u?.regAccess || []);
  const m = modal(`<h3>${approving ? 'Заявка: ' + esc(u.name) : isNew ? 'Новый пользователь' : esc(u.name)}</h3>
    ${approving && u.note ? `<div class="rq-note" style="margin-bottom:10px">Комментарий: «${esc(u.note)}»</div>` : ''}
    <div class="grid g3">
      <div class="fld"><label class="flab">Фамилия</label><input class="inp" id="u_ln" value="${esc(u?.lastName || (u && !u.firstName ? u.name : '') || '')}"></div>
      <div class="fld"><label class="flab">Имя</label><input class="inp" id="u_fn" value="${esc(u?.firstName || '')}"></div>
      <div class="fld"><label class="flab">Отчество</label><input class="inp" id="u_mn" value="${esc(u?.middleName || '')}"></div>
    </div>
    <div class="grid">
      <div class="fld"><label class="flab">Логин</label><input class="inp" id="u_l" value="${esc(u?.login || '')}"></div>
      <div class="fld"><label class="flab">Роль${approving && u.reqRole ? ` <span class="muted small">(просил: ${esc(ROLES[u.reqRole]?.name || '')})</span>` : ''}</label><select class="inp" id="u_r">${Object.entries(ROLES).map(([k, r]) => `<option value="${k}" ${u?.role === k ? 'selected' : ''}>${r.name}</option>`).join('')}</select></div>
      <div class="fld"><label class="flab">Отделение</label>${deptSelect(u?.dept || '', 'u_dep')}</div>
      <div class="fld"><label class="flab">Должность</label>${posSelect(u?.position || '', 'u_pos')}</div>
      <div class="fld"><label class="flab">Год резидентуры</label><select class="inp" id="u_yr"><option value=""></option>${[1, 2, 3, 4, 5].map(y => `<option value="${y}" ${String(u?.resYear) === String(y) ? 'selected' : ''}>${y}-й год</option>`).join('')}</select></div>
      <div class="fld"><label class="flab">Куратор / руководитель</label><select class="inp" id="u_sup"><option value=""></option>${all.filter(x => x.active !== false && x.id !== u?.id && ['admin', 'lead', 'surgeon'].includes(x.role)).map(x => `<option value="${x.id}" ${u?.supervisor === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
      <div class="fld"><label class="flab">Центр</label>${centerSelect(u?.center || '', 'u_ce')}</div>
      <div class="fld"><label class="flab">Код для бенчмаркинга</label><input class="inp" id="u_c" value="${esc(u?.code || '')}" placeholder="например H03"></div>
      <div class="fld"><label class="flab">Телефон</label><input class="inp" id="u_ph" value="${esc(u?.phone || '')}"></div>
      <div class="fld"><label class="flab">ORCID</label><input class="inp" id="u_or" value="${esc(u?.orcid || '')}"></div>
      <div class="fld"><label class="flab">${isNew ? 'Пароль' : 'Новый пароль (пусто = не менять)'}</label><input class="inp" type="password" id="u_pw"></div>
      ${isNew || approving ? '' : `<div class="fld"><label class="flab">Статус</label><select class="inp" id="u_a"><option value="1">активен</option><option value="0" ${u.active === false ? 'selected' : ''}>отключён</option></select></div>`}
    </div>
    ${regs.length ? `<div class="fld"><label class="flab">Дополнительный доступ к регистрам других отделений</label><p class="fhint" style="margin:0 0 6px">Регистры своего отделения сотрудник видит и без этого.</p><div class="rchk">${regs.filter(r => !u?.dept || r.dept !== u.dept || acc.has(r.id)).map(r => `<label class="chk"><input type="checkbox" value="${r.id}" data-ra ${acc.has(r.id) ? 'checked' : ''}> <span>${esc(r.name)} <span class="muted small">${esc(r.dept || '')}</span></span></label>`).join('')}</div></div>` : ''}
    <div class="row end">${approving ? '<button class="btn" id="u_no">Отклонить</button>' : ''}<button class="btn primary" id="u_ok">${approving ? 'Подтвердить доступ' : 'Сохранить'}</button></div>`, { wide: true });
  bindDept(m, 'u_dep'); bindPos(m, 'u_pos');
  if (approving) $('#u_no', m).onclick = async () => { u.status = 'rejected'; u.active = false; await DB.put('users', u, 'заявка отклонена'); m.close(); toast('Заявка отклонена'); App.route(); };
  $('#u_ok', m).onclick = async () => {
    const v = id => ($('#' + id, m)?.value || '').trim();
    const name = fullName(v('u_ln'), v('u_fn'), v('u_mn'));
    if (!name || !v('u_l')) return toast('ФИО и логин обязательны', 'err');
    if (all.some(x => x.login.toLowerCase() === v('u_l').toLowerCase() && x.id !== u?.id)) return toast('Такой логин уже есть', 'err');
    const extra = { name, lastName: v('u_ln'), firstName: v('u_fn'), middleName: v('u_mn'), login: v('u_l'), role: v('u_r'), dept: readDept(m, 'u_dep'), position: readPos(m, 'u_pos'), resYear: v('u_yr'), supervisor: v('u_sup'), center: v('u_ce'), code: v('u_c'), phone: v('u_ph'), orcid: v('u_or'), regAccess: $$('[data-ra]:checked', m).map(c => c.value) };
    if (isNew) {
      if ($('#u_pw', m).value.length < 6) return toast('Пароль от 6 символов', 'err');
      const nu = await Auth.createUser({ name, login: v('u_l'), pass: $('#u_pw', m).value, role: v('u_r'), position: extra.position, code: v('u_c') });
      Object.assign(nu, extra, { status: 'active' }); await DB.put('users', nu);
    } else {
      if (u.id === Auth.user.id && v('u_r') !== 'admin' && !all.some(x => x.id !== u.id && x.role === 'admin' && x.active !== false)) return toast('Нельзя снять роль с последнего администратора', 'err');
      Object.assign(u, extra);
      if (approving) { u.status = 'active'; u.active = true; u.approvedBy = Auth.user.id; u.approvedAt = nowISO(); }
      else { u.active = $('#u_a', m).value === '1'; if (u.active && u.status !== 'active') u.status = 'active'; }
      if ($('#u_pw', m).value) { if ($('#u_pw', m).value.length < 6) return toast('Пароль от 6 символов', 'err'); await setUserPassword(u, $('#u_pw', m).value); }
      await DB.put('users', u, approving ? 'заявка подтверждена' : undefined);
      if (u.id === Auth.user.id) Object.assign(Auth.user, u);
    }
    m.close(); toast(approving ? 'Доступ подтверждён' : 'Сохранено'); App.route();
  };
};

/* ---------- мой профиль ---------- */
async function profileDialog(force) {
  const u = Auth.user;
  const m = modal(`<h3>Мой профиль</h3>${force ? '<div class="qbox" style="margin-bottom:10px">Администратор задал вам временный пароль. Задайте свой.</div>' : ''}
    <div class="grid g3">
      <div class="fld"><label class="flab">Фамилия</label><input class="inp" id="p_ln" value="${esc(u.lastName || (!u.firstName ? u.name : '') || '')}"></div>
      <div class="fld"><label class="flab">Имя</label><input class="inp" id="p_fn" value="${esc(u.firstName || '')}"></div>
      <div class="fld"><label class="flab">Отчество</label><input class="inp" id="p_mn" value="${esc(u.middleName || '')}"></div>
    </div><div class="grid">
      <div class="fld"><label class="flab">Отделение</label>${deptSelect(u.dept || '', 'p_dep')}</div>
      <div class="fld"><label class="flab">Должность</label>${posSelect(u.position || '', 'p_pos')}</div>
      <div class="fld"><label class="flab">Телефон</label><input class="inp" id="p_ph" value="${esc(u.phone || '')}"></div>
      <div class="fld"><label class="flab">ORCID</label><input class="inp" id="p_or" value="${esc(u.orcid || '')}"></div>
    </div>
    <div class="fld"><label class="flab">О себе: научные интересы</label><textarea class="inp" id="p_ab" rows="2">${esc(u.about || '')}</textarea></div>
    <p class="fhint">Логин: <span class="mono">${esc(u.login)}</span> · роль «${esc(ROLES[u.role]?.name || '')}». Роль и доступ к регистрам меняет администратор.</p>
    <h4>Смена пароля</h4><div class="grid g3">
      <div class="fld"><label class="flab">Текущий пароль</label><input class="inp" type="password" id="p_old"></div>
      <div class="fld"><label class="flab">Новый пароль</label><input class="inp" type="password" id="p_new"></div>
      <div class="fld"><label class="flab">Ещё раз</label><input class="inp" type="password" id="p_new2"></div>
    </div>
    <div class="row end"><button class="btn primary" id="p_ok">Сохранить</button></div>`, { wide: true });
  bindDept(m, 'p_dep'); bindPos(m, 'p_pos');
  if (typeof NET !== 'undefined' && NET.on && !can('users')) {
    for (const field of ['p_dep', 'p_dep__org']) {
      const input = $('#' + field, m);
      if (input) { input.disabled = true; input.title = 'Отделение и учреждение меняет администратор'; }
    }
  }
  $('#p_ok', m).onclick = async () => {
    const v = id => ($('#' + id, m)?.value || '').trim();
    const name = fullName(v('p_ln'), v('p_fn'), v('p_mn')); if (!name) return toast('Укажите ФИО', 'err');
    if ($('#p_new', m).value || force) {
      const oldPass = $('#p_old', m).value, newPass = $('#p_new', m).value;
      if (newPass.length < 8 || passScore(newPass) < 2) return toast('Новый пароль: минимум 8 символов, буквы и цифры', 'err');
      if (newPass !== $('#p_new2', m).value) return toast('Пароли не совпадают', 'err');
      if (typeof NET !== 'undefined' && NET.on) {
        try { await NET.changePassword(u, oldPass, newPass); }
        catch (error) { return toast(error.message, 'err'); }
      } else {
        if (!(await checkOwnPass(u, oldPass))) return toast('Текущий пароль неверный', 'err');
        await setUserPassword(u, newPass);
        delete u.mustChange;
      }
    }
    Object.assign(u, { name, lastName: v('p_ln'), firstName: v('p_fn'), middleName: v('p_mn'), dept: readDept(m, 'p_dep'), position: readPos(m, 'p_pos'), phone: v('p_ph'), orcid: v('p_or'), about: v('p_ab') });
    await DB.put('users', u, 'профиль'); m.close(); toast('Профиль сохранён'); App.boot();
  };
}

/* ---------- уведомления администратору и обязательная смена пароля ---------- */
const _bellItems = Bell.items.bind(Bell);
Bell.items = async function () {
  const out = await _bellItems();
  if (can('users')) { const us = await DB.all('users'); const p = us.filter(u => u.status === 'pending').length, r = us.filter(u => u.resetReq).length;
    if (p) out.unshift({ k: 'due', t: `Заявки на доступ: ${p}`, s: 'новые сотрудники ждут подтверждения', r: 'admin' });
    if (r) out.unshift({ k: 'warn', t: `Сброс пароля: ${r}`, s: 'сотрудники просят новый пароль', r: 'admin' }); }
  return out;
};
const _route = App.route.bind(App);
App.route = async function (...a) { const r = await _route(...a); if (Auth.user?.mustChange && !$('.modal-wrap')) profileDialog(true); return r; };


/* ================= доступ к регистрам по отделениям ================= */
const SCOPES = { dept: 'Только отделение-владелец (по умолчанию)', center: 'Всё учреждение', members: 'Только приглашённые участники' };
const ACCESS_WHY = { admin: 'администратор', owner: 'создатель', member: 'участник', grant: 'выдан администратором', center: 'всё учреждение', dept: 'своё отделение' };
async function requestRegAccess(r) {
  const note = await promptBox('Запрос доступа к «' + r.name + '». Зачем нужен доступ (проект, коллаборация)?'); if (note === null) return;
  if (typeof NET !== 'undefined' && NET.on) {
    try { await NET.call('POST', 'registry-access', { registryId: r.id, note }); }
    catch (error) { return toast(error.message, 'err'); }
    toast('Запрос отправлен владельцу регистра'); App.route();
    return;
  }
  const all = await DB.all('registries'); const reg = all.find(x => x.id === r.id);
  reg.requests = (reg.requests || []).filter(q => !(q.userId === Auth.user.id && q.status === 'ждёт'));
  reg.requests.push({ id: uid('rq_'), userId: Auth.user.id, at: nowISO(), note: note || '', status: 'ждёт' });
  await DB.rawPut('registries', reg);
  await DB.rawPut('audit', { id: uid('au_'), ts: nowISO(), user: Auth.user.id, userName: Auth.user.name, action: 'запрос доступа к регистру', store: 'registries', recId: reg.id });
  toast('Запрос отправлен владельцу регистра'); App.route();
}
function noAccessPage(main, r) {
  const pend = (r.requests || []).some(q => q.userId === Auth.user.id && q.status === 'ждёт');
  main.innerHTML = `<div class="card" style="max-width:620px;margin:40px auto;text-align:center"><div style="font-size:34px">🔒</div><h2>Нет доступа к регистру</h2>
    <p><b>${esc(r.name)}</b></p><p class="muted">Регистр отделения «${esc(r.dept || 'не указано')}». Данные видны сотрудникам этого отделения и приглашённым участникам.</p>
    ${pend ? '<p class="tag warnt">Запрос уже отправлен, ждёт решения</p>' : '<button class="btn primary" id="naReq">Запросить доступ</button>'} <a class="btn" href="#registries">К регистрам</a></div>`;
  if ($('#naReq')) $('#naReq').onclick = () => requestRegAccess(r);
}

const _registry = Routes.registry;
Routes.registry = async (main, id, tab = 'general') => {
  await loadRegs(); const r = REGS.get(id); if (!r) return go('registries');
  if (!regAllowed(r)) return noAccessPage(main, r);
  await _registry(main, id, tab === 'access' ? 'general' : tab);
  const nreq = (r.requests || []).filter(q => q.status === 'ждёт').length;
  $('.tabs', main).insertAdjacentHTML('beforeend', `<a href="#registry/${id}/access" class="${tab === 'access' ? 'on' : ''}">Доступ${nreq && regManage(r) ? ` <span class="tag warnt">${nreq}</span>` : ''}</a>`);
  if (tab !== 'access') return;
  $$('.tabs a', main).forEach(a => a.classList.toggle('on', a.href.endsWith('/access')));
  $('#rgSave')?.remove();
  const users = (await DB.all('users')).filter(u => u.active !== false);
  const save = async (msg) => { await DB.put('registries', r, msg); toast('Сохранено'); App.route(); };
  const mg = regManage(r);
  const withAccess = users.map(u => { const prev = Auth.user; Auth.user = u; const w = regAccess(r); Auth.user = prev; return [u, w]; }).filter(x => x[1]);
  const UN = id => users.find(u => u.id === id)?.name || '?';
  const reqs = (r.requests || []).filter(q => q.status === 'ждёт');
  $('#rgBody').innerHTML = `
    <div class="card"><h3>Владелец и видимость</h3><div class="grid">
      <div class="fld"><label class="flab">Отделение-владелец</label>${mg ? deptSelect(r.dept || '', 'ac_dep') : `<div class="calc">${esc(r.dept || '')}</div>`}</div>
      <div class="fld"><label class="flab">Кто видит без приглашения</label>${mg ? `<select class="inp" id="ac_sc">${Object.entries(SCOPES).map(([k, t]) => `<option value="${k}" ${(r.scope || 'dept') === k ? 'selected' : ''}>${t}</option>`).join('')}</select>` : `<div class="calc">${SCOPES[r.scope || 'dept']}</div>`}</div>
      ${centers().length ? `<div class="fld"><label class="flab">Центр</label>${mg ? centerSelect(r.center || '', 'ac_ce') : `<div class="calc">${esc(r.center || '')}</div>`}</div>` : ''}
      <div class="fld"><label class="flab">Создатель</label><div class="calc">${esc(UN(r.proposedBy || r.createdBy))}</div></div>
    </div>${mg ? '<div class="row end"><button class="btn primary" id="ac_save">Сохранить</button></div>' : ''}</div>
    ${mg ? `<div class="card"><h3>Запросы на доступ ${reqs.length ? `<span class="tag warnt">${reqs.length}</span>` : ''}</h3>${reqs.length ? reqs.map(q => { const u = users.find(x => x.id === q.userId); return `<div class="rq"><span class="av">${esc(initials(u?.name || '?'))}</span><div class="rq-b"><b>${esc(u?.name || '?')}</b><span>${esc([u?.position, u?.dept, u?.center].filter(Boolean).join(' · '))}</span><span class="muted small">${fmtDate(q.at.slice(0, 10))}</span>${q.note ? `<span class="rq-note">«${esc(q.note)}»</span>` : ''}</div><div class="rq-a"><button class="btn primary sm" data-qok="${q.id}">Допустить</button><button class="btn sm" data-qno="${q.id}">Отказать</button></div></div>`; }).join('') : '<p class="muted">Запросов нет.</p>'}</div>
    <div class="card"><h3>Пригласить участника</h3><p class="muted small">Сотрудник другого отделения или центра, например для многоцентрового проекта.</p><div class="row"><select class="inp" id="ac_add" style="max-width:420px"><option value="">выберите сотрудника</option>${users.filter(u => !withAccess.some(x => x[0].id === u.id)).map(u => `<option value="${u.id}">${esc(u.name)}${u.dept ? ' · ' + esc(u.dept) : ''}${u.center ? ' · ' + esc(u.center) : ''}</option>`).join('')}</select><button class="btn primary" id="ac_inv">Пригласить</button></div></div>` : ''}
    <div class="card"><h3>У кого есть доступ (${withAccess.length})</h3><table class="tbl"><thead><tr><th>Сотрудник</th><th>Отделение</th><th>Роль</th><th>Основание</th><th></th></tr></thead><tbody>
      ${withAccess.map(([u, w]) => `<tr><td>${esc(u.name)}</td><td>${esc(u.dept || '')}</td><td>${esc(ROLES[u.role]?.name || '')}</td><td>${ACCESS_WHY[w]}</td><td>${mg && w === 'member' ? `<button class="btn sm" data-rm="${u.id}">Убрать</button>` : ''}</td></tr>`).join('')}
    </tbody></table></div>`;
  if (!mg) return;
  bindDept(document, 'ac_dep');
  $('#ac_save').onclick = () => { r.dept = readDept(document, 'ac_dep'); r.scope = $('#ac_sc').value; if ($('#ac_ce')) r.center = $('#ac_ce').value; save('изменение доступа к регистру'); };
  $('#ac_inv').onclick = () => { const v = $('#ac_add').value; if (!v) return toast('Выберите сотрудника', 'err'); r.members = [...new Set([...(r.members || []), v])]; save('приглашение в регистр'); };
  $$('[data-rm]').forEach(b => b.onclick = () => { r.members = (r.members || []).filter(x => x !== b.dataset.rm); save('исключение из регистра'); });
  $$('[data-qok]').forEach(b => b.onclick = () => { const q = r.requests.find(x => x.id === b.dataset.qok); q.status = 'одобрен'; q.by = Auth.user.id; q.doneAt = nowISO(); r.members = [...new Set([...(r.members || []), q.userId])]; save('доступ к регистру выдан'); });
  $$('[data-qno]').forEach(b => b.onclick = () => { const q = r.requests.find(x => x.id === b.dataset.qno); q.status = 'отклонён'; q.by = Auth.user.id; q.doneAt = nowISO(); save('в доступе к регистру отказано'); });
};

const _patient = Routes.patient;
Routes.patient = async (main, id, ...rest) => {
  await loadRegs(); const p = await DB.get('patients', id);
  if (p && !regAllowed(p.registryId)) { const r = REGS.get(p.registryId); return r ? noAccessPage(main, r) : go('patients'); }
  return _patient(main, id, ...rest);
};

const _registries = Routes.registries;
Routes.registries = async (main, act) => {
  await _registries(main, act);
  const all = await loadRegs(); const mine = Auth.user.dept;
  const other = all.filter(r => !regAllowed(r) && r.status !== 'на одобрении').sort((a, b) => (a.dept || '').localeCompare(b.dept || '') || a.name.localeCompare(b.name));
  $$('.card.reg', main).forEach(c => { const id = $('h3 a', c)?.getAttribute('href')?.split('/')[1]; const r = REGS.get(id); if (!r) return; const w = regAccess(r); c.querySelector('h3').insertAdjacentHTML('afterend', `<p class="small" style="margin:-4px 0 4px"><span class="tag">${esc(r.dept || 'без отделения')}</span> <span class="muted">${ACCESS_WHY[w] || ''}</span></p>`); });
  if (!other.length) return;
  main.insertAdjacentHTML('beforeend', `<div class="card"><h3>Регистры других отделений</h3><p class="muted small">Данные закрыты. Нужен доступ для совместной работы или многоцентрового проекта: отправьте запрос владельцу.</p>
    <table class="tbl"><thead><tr><th>Регистр</th><th>Отделение</th><th>Центр</th><th>Статус</th><th></th></tr></thead><tbody>${other.map(r => { const pend = (r.requests || []).some(q => q.userId === Auth.user.id && q.status === 'ждёт'); return `<tr><td><b>${esc(r.name)}</b></td><td>${esc(r.dept || '')}</td><td>${esc(r.center || '')}</td><td>${esc(r.status || '')}</td><td>${pend ? '<span class="tag warnt">запрос отправлен</span>' : `<button class="btn sm" data-rqa="${r.id}">Запросить доступ</button>`}</td></tr>`; }).join('')}</tbody></table></div>`);
  $$('[data-rqa]', main).forEach(b => b.onclick = () => requestRegAccess(REGS.get(b.dataset.rqa)));
};

const _bellItems2 = Bell.items.bind(Bell);
Bell.items = async function () {
  const out = await _bellItems2(); const all = await loadRegs();
  all.filter(r => regManage(r)).forEach(r => { const n = (r.requests || []).filter(q => q.status === 'ждёт').length; if (n) out.unshift({ k: 'due', t: `Запросы доступа: ${r.name}`, s: `${n} сотрудник(а) просят доступ`, r: 'registry/' + r.id + '/access' }); });
  all.forEach(r => (r.requests || []).filter(q => q.userId === Auth.user?.id && q.status === 'одобрен' && q.doneAt > new Date(Date.now() - 7 * 864e5).toISOString()).forEach(() => out.push({ k: 'ok', t: `Доступ открыт: ${r.name}`, s: 'запрос одобрен', r: 'registry/' + r.id })));
  return out;
};
