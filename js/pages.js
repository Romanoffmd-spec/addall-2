/* AddAll 2.0: страницы (вход, главная, регистры и конструктор, пациенты, карточка, словарь, качество, аудит, админ) */
'use strict';

const Pages = {
  setup() {
    document.body.className = '';
    document.body.innerHTML = `<div class="auth"><div class="auth-box wide">
      <div class="auth-brand"><img src="media/addall-emblem.svg" alt=""><b>Add<i>All</i> 2.0</b></div><p class="muted">Первый запуск. Создайте администратора платформы. ${typeof NET !== 'undefined' && NET.on ? 'Данные хранятся в общей базе на сервере.' : 'Данные хранятся только в этом браузере на этом компьютере.'}</p>
      <div class="grid">
        <div class="fld"><label class="flab">Учреждение</label><input class="inp" id="s_center" placeholder="Например: ННОЦ, Астана"></div>
        <div class="fld"><label class="flab">Отделение / сектор</label><input class="inp" id="s_dep"></div>
        <div class="fld"><label class="flab">ФИО администратора <i class="req">*</i></label><input class="inp" id="s_name"></div>
        <div class="fld"><label class="flab">Должность</label><input class="inp" id="s_pos"></div>
        <div class="fld"><label class="flab">Логин <i class="req">*</i></label><input class="inp" id="s_login"></div>
        <div class="fld"><label class="flab">Пароль (от 6 символов) <i class="req">*</i></label><input class="inp" type="password" id="s_pass"></div>
        <div class="fld"><label class="flab">Пароль ещё раз <i class="req">*</i></label><input class="inp" type="password" id="s_pass2"></div>
      </div>
      <div class="row end"><button class="btn" id="s_train">Открыть учебный режим</button><button class="btn" id="s_restore">Восстановить из резервной копии</button><button class="btn primary" id="s_go">Создать и войти</button></div>
    </div></div>`;
    $('#s_go').onclick = async () => {
      const v = id => $('#' + id).value.trim();
      if (!v('s_name') || !v('s_login')) return toast('Заполните ФИО и логин', 'err');
      if ($('#s_pass').value.length < 6) return toast('Пароль слишком короткий', 'err');
      if ($('#s_pass').value !== $('#s_pass2').value) return toast('Пароли не совпадают', 'err');
      Settings.data = { id: 'main', center: v('s_center'), department: v('s_dep'), anonCodes: true };
      await DB.rawPut('settings', Settings.data);
      const u = await Auth.createUser({ name: v('s_name'), login: v('s_login'), pass: $('#s_pass').value, role: 'admin', position: v('s_pos'), code: 'A01' });
      await Auth.login(u.login, $('#s_pass').value);
      location.hash = 'registries'; App.boot();
    };
    $('#s_restore').onclick = () => IO.restorePicker();
    $('#s_train').onclick = () => setTraining(true);
  },
  login() {
    document.body.className = '';
    document.body.innerHTML = `<div class="auth"><div class="auth-box">
      <div class="auth-brand"><img src="media/addall-emblem.svg" alt=""><b>Add<i>All</i> 2.0</b></div><p class="muted">${esc(Settings.data.center || '')} ${esc(Settings.data.department || '')}</p>
      <div class="fld"><label class="flab">Логин</label><input class="inp" id="l_login" autofocus></div>
      <div class="fld"><label class="flab">Пароль</label><input class="inp" type="password" id="l_pass"></div>
      <button class="btn primary block" id="l_go">Войти</button></div></div>`;
    const go_ = async () => { if (await Auth.login($('#l_login').value, $('#l_pass').value)) App.boot(); else toast('Неверный логин или пароль', 'err'); };
    $('#l_go').onclick = go_; $('#l_pass').onkeydown = e => { if (e.key === 'Enter') go_(); };
  }
};

/* ---------- общие помощники ---------- */
const pname = (p) => [p.lastName, p.firstName, p.middleName].filter(Boolean).join(' ') || 'Без имени';
const etById = (reg, id) => reg.eventTypes.find(e => e.id === id);
const centers = () => Settings.data.centers || [];
/* видимость пациентов: при режиме «свой центр» обычные роли видят только пациентов своего центра */
const visibleP = (p) => Settings.data.centerScope !== 'own' || ['admin', 'lead'].includes(Auth.user.role) || !Auth.user.center || p.center === Auth.user.center;
function centerSelect(cur, id) { return centers().length ? `<select class="inp" id="${id}"><option value=""></option>${centers().map(c => `<option ${c === cur ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>` : `<input class="inp" id="${id}" value="${esc(cur || '')}" placeholder="список центров задаётся в настройках">`; }
function regSelect(regs, cur, id = 'regSel', all = true) {
  return `<select class="inp" id="${id}">${all ? '<option value="">Все регистры</option>' : ''}${regs.map(r => `<option value="${r.id}" ${r.id === cur ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select>`;
}
function emptyState(text, btn) { return `<div class="empty"><p>${text}</p>${btn || ''}</div>`; }

/* просроченные наблюдения */
function overdueFollowups(reg, patients, events) {
  const every = Number(reg.followupEvery || 0); if (!every) return [];
  const out = [];
  patients.filter(p => p.registryId === reg.id).forEach(p => {
    const ev = events.filter(e => e.patientId === p.id).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    if (!ev.length) return;
    const dead = ev.some(e => e.data && (e.data.status === 'умер' || e.data.mort30 === 'да'));
    const lost = ev[0].data?.status === 'потерян для наблюдения';
    if (dead || lost) return;
    const due = addDays(ev[0].date, every);
    if (due < today()) out.push({ p, last: ev[0].date, due, overdue: daysBetween(due, today()) });
  });
  return out.sort((a, b) => b.overdue - a.overdue);
}

/* ---------- ГЛАВНАЯ (дизайн AddAll: hero, плитки, брифинг, неделя, качество, наука) ---------- */
Routes.home = async (main) => {
  let [regs, patients, events, mdt, proms, qs, trials, allocs, jrecs, journals] = await Promise.all([Data.registries(), Data.patients(), Data.events(), DB.all('mdt'), DB.all('proms'), DB.all('queries'), DB.all('trials'), DB.all('alloc'), DB.all('jrecs'), DB.all('journals')]);
  const M_ = (k) => typeof modOn !== 'function' || modOn(k); const hasProms = proms.length > 0; /* 2.10: показываем только то, что реально может заполниться */
  patients = patients.filter(visibleP); const vis = new Set(patients.map(p => p.id)); events = events.filter(e => vis.has(e.patientId)); proms = proms.filter(x => vis.has(x.patientId));
  const overdue = regs.flatMap(r => overdueFollowups(r, patients, events).map(o => ({ ...o, reg: r })));
  const promDue = proms.filter(x => !x.doneAt && x.due <= today());
  const qOpen = qs.filter(q => q.status !== 'закрыт' && vis.has(q.patientId)).length;
  const isSurg = (e) => { const r = regs.find(x => x.id === e.registryId); const et = r && etById(r, e.type); return et && (/операц|пластик|вмешат/i.test(et.name) || e.type === 'surgery'); };
  const addedWeek = events.filter(e => (e.createdAt || '').slice(0, 10) >= addDays(today(), -6));
  const opsWeek = events.filter(e => isSurg(e) && e.date >= addDays(today(), -((new Date().getDay() + 6) % 7)) && e.date <= addDays(today(), 6 - ((new Date().getDay() + 6) % 7)));
  let compTot = 0, compN = 0;
  events.forEach(e => { const r = regs.find(x => x.id === e.registryId); const et = r && etById(r, e.type); if (!et) return; const c = completeness(et, computeValues(r, patients.find(x => x.id === e.patientId), et, e.data, e.date)); if (c.total) { compTot += c.pct; compN++; } });
  const comp = compN ? Math.round(compTot / compN) : null;
  const h = new Date().getHours(), hello = h < 6 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер';
  const first = (Auth.user.name.split(/\s+/)[1] || Auth.user.name.split(/\s+/)[0]);
  /* неделя */
  const mon = addDays(today(), -((new Date().getDay() + 6) % 7));
  const days = [...Array(7)].map((_, i) => addDays(mon, i));
  const weekItems = (d) => [
    ...events.filter(e => e.date === d).map(e => { const r = regs.find(x => x.id === e.registryId); const et = r && etById(r, e.type); const p = patients.find(x => x.id === e.patientId); return { c: et?.color || '#3346B0', t: p ? pname(p).split(' ')[0] : '?', s: et?.name || '', r: 'patient/' + e.patientId }; }),
    ...mdt.filter(m => m.date === d).map(m => ({ c: '#0E7F7A', t: 'МДК', s: (m.cases || []).length + ' пац.', r: 'mdt/' + m.id })),
    ...jrecs.filter(x => { const j = journals.find(y => y.id === x.journalId); return j?.dateKey && x.data?.[j.dateKey] === d; }).map(x => { const j = journals.find(y => y.id === x.journalId); return { c: j.color || '#6B55D6', t: String(x.data?.[j.titleKey] || j.name), s: j.name, r: 'journal/' + j.id }; })
  ];
  const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  /* качество: показатели первого активного регистра с событиями */
  const qreg = regs.find(r => (r.indicators || []).length && events.some(e => e.registryId === r.id)) || regs.find(r => (r.indicators || []).length);
  main.innerHTML = `
    <section class="hero"><div class="hero-bg" style="background-image:url(media/nroc-hero-hd.webp)"></div><div class="hero-in">
      <div class="hero-k"><img src="media/addall-icon.svg" alt=""><span>${esc(Settings.data.center || 'AddAll 2.0')}</span></div>
      <h1>${hello}, ${esc(first)}</h1><p>${esc(Settings.data.department || 'Регистр результатов лечения')}: результаты лечения, наблюдение и качество в одном месте.</p>
      <span class="hero-date">${new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
      <div class="hero-act">${can('enter') ? '<button class="btn light" id="hNewP">+ Новый пациент</button><button class="btn glass" id="hNewAI">✦ Пациент из документа</button>' : ''}<button class="btn glass" id="hBrief">✦ Брифинг ИИ</button><a class="btn glass" href="#mdt">МДК</a><a class="btn glass" href="#trials">Исследования</a></div>
    </div></section>
    <div class="kpis">
      <a class="kpi" href="#patients"><span class="ic"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c2 .7 3.2 2.5 3.5 5.2"/></svg></span><b>${patients.length}</b><span>пациентов в регистрах · ${events.length} событий</span></a>
      <a class="kpi" href="#patients"><span class="ic"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/><rect x="3" y="3" width="18" height="18" rx="4"/></svg></span><b>${addedWeek.length}</b><span>записей внесено за 7 дней${addedWeek.length ? ` · ${addedWeek.filter(e => e.createdBy === Auth.user.id).length} мной` : ''}</span></a>
      <a class="kpi ${overdue.length ? 'warn' : ''}" href="#me"><span class="ic"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/></svg></span><b>${overdue.length}</b><span>наблюдений просрочено</span></a>
      ${hasProms ? `<a class="kpi ${promDue.length ? 'warn' : ''}" href="#proms"><span class="ic"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/></svg></span><b>${promDue.length}</b><span>анкет к заполнению</span></a>` : ''}
      <a class="kpi ${qOpen ? 'due' : ''}" href="#queries"><span class="ic"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/></svg></span><b>${qOpen}</b><span>открытых запросов по данным</span></a>
      <a class="kpi" href="#quality"><span class="ic"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.8 2.8L16.5 9.5"/></svg></span><b>${comp == null ? '0%' : comp + '%'}</b><span>полнота ключевых полей${comp == null ? ' (нет записей)' : ''}</span></a>
    </div>
    ${!regs.length ? `<div class="panel" style="margin-top:18px"><h2>Платформа готова к работе</h2><p class="muted">Создайте первый регистр: пустой или из шаблона (колоректальный рак, TNT, LLND, грыжи, бариатрия, хирургический аудит).<span class="mj"> Затем журналы (планировщик, МДГ, M&M, ротации) из раздела «Работа».</span></p><a class="btn primary" href="#registries/new">Создать регистр</a>${M_('journals') ? ' <a class="btn" href="#journals">Создать журнал</a>' : ''}</div>` : ''}
    <div class="dash">
      <div class="panel two"><div class="ph"><h2>Требует внимания</h2><button class="btn ai sm r" id="hBrief2">✦ Разбор ИИ</button></div>
        <div class="cols" style="grid-template-columns:${hasProms || M_('mdt') ? '1fr 1fr' : '1fr'}">
          <div>
            <h4>Просроченные наблюдения</h4>${overdue.slice(0, 5).map(o => `<a class="bi" href="#patient/${o.p.id}"><span class="pod due">+${o.overdue}<i>дн</i></span><span class="bi-t"><b>${esc(pname(o.p))}</b><span>${esc(o.reg.name)} · последний контакт ${fmtDate(o.last)}</span></span></a>`).join('') || '<div class="bnone">Нет</div>'}</div>
          ${hasProms || M_('mdt') ? `<div>${hasProms ? `<h4>Анкеты к заполнению</h4>${promDue.slice(0, 5).map(x => { const p = patients.find(y => y.id === x.patientId); return `<a class="bi" href="#patient/${x.patientId}"><span class="pod warn">✎</span><span class="bi-t"><b>${esc(p ? pname(p) : '?')}</b><span>${esc(x.instrumentName)} · срок ${fmtDate(x.due)}</span></span></a>`; }).join('') || '<div class="bnone">Нет</div>'}` : ''}
            ${M_('mdt') ? `<h4>МДК</h4>${mdt.filter(m => m.date >= today()).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3).map(m => `<a class="bi" href="#mdt/${m.id}"><span class="pod">${new Date(m.date).getDate()}<i>${new Date(m.date).toLocaleDateString('ru-RU', { month: 'short' })}</i></span><span class="bi-t"><b>${esc(m.title || 'МДК')}</b><span>${(m.cases || []).length} пациентов в повестке</span></span></a>`).join('') || '<div class="bnone">Не запланировано</div>'}` : ''}</div>` : ''}
        </div><div id="briefOut"></div></div>
      <div class="panel"><div class="ph"><h2>Наука</h2><a class="r" href="#trials">Все</a></div>
        ${trials.length ? trials.slice(0, 5).map(t => { const n = allocs.filter(a => a.trialId === t.id).length; return `<a class="bi" href="#trials/${t.id}"><span class="bi-t"><b>${esc(t.acronym || t.name)}</b><span>${n}${t.target ? ' из ' + t.target : ''} рандомизировано · ${esc(t.status)}</span><div class="pbar"><span style="width:${t.target ? Math.min(100, n / t.target * 100) : 0}%"></span></div></span></a>`; }).join('') : '<div class="bnone">Нет активных исследований.</div>'}
        <div class="row" style="margin-top:8px"><a class="btn sm" href="#writing">Рукописи</a><a class="btn sm" href="#library">Литература</a></div></div>
      ${M_('mdt') || M_('journals') ? `<div class="panel wide"><div class="ph"><h2>Эта неделя</h2><span class="muted">${fmtDate(days[0])} · ${fmtDate(days[6])}</span></div>
        <div class="wk">${days.map((d, i) => { const it = weekItems(d); return `<div class="wd ${d === today() ? 'today' : d < today() ? 'past' : ''}"><div class="wd-h"><span>${WD[i]}</span><b>${new Date(d).getDate()}</b></div><div class="wd-l">${it.slice(0, 5).map(x => `<a class="we" href="#${x.r}" style="--c:${x.c}"><b>${esc(x.t)}</b><span>${esc(x.s)}</span></a>`).join('')}${it.length > 5 ? `<span class="muted small">ещё ${it.length - 5}</span>` : it.length ? '' : '<span class="muted small" style="text-align:center;padding-top:10px">·</span>'}</div></div>`; }).join('')}</div></div>` : ''}
      ${qreg ? `<div class="panel wide"><div class="ph"><h2>Показатели качества</h2><span class="muted">${esc(qreg.name)}</span><a class="r" href="#analytics/${qreg.id}">Аналитика</a></div><div class="qis">${(() => { const qev = events.filter(e => e.registryId === qreg.id); return qreg.indicators.map(i => typeof QI === 'object' ? QI.tile(qreg, i, evalIndicator(i, qev, patients, qreg), qev, patients) : '').join(''); })()}</div><p class="muted small" style="margin-top:10px">Расчёт на ${fmtDate(today())}, без поправки на риск. Зелёный и красный только когда весь 95% интервал лучше или хуже цели; при малом числе случаев цвет нейтральный. Нажмите на плитку, чтобы увидеть пациентов.</p></div>` : ''}
    </div>`;
  if ($('#hNewP')) $('#hNewP').onclick = () => patientDialog(null, regs);
  if ($('#hNewAI')) $('#hNewAI').onclick = () => { if (!regs.length) return toast('Сначала создайте регистр', 'err'); AI.fullParse(regs[0], null); };
  const brief = async () => {
    if (!AI.ready()) return toast('ИИ не настроен: «Администрирование» → «Пользователи и настройки»', 'err');
    $('#briefOut').innerHTML = '<p class="muted">ИИ готовит брифинг…</p>';
    const ctx = { date: today(), operations_today_tomorrow: events.filter(e => isSurg(e) && e.date >= today() && e.date <= addDays(today(), 1)).length, overdue_followups: overdue.slice(0, 20).map(o => ({ patient: pname(o.p), registry: o.reg.name, days: o.overdue })), proms_due: promDue.length, open_queries: qOpen, completeness: comp, indicators: qreg ? qreg.indicators.map(i => ({ name: i.name, ...evalIndicator(i, events.filter(e => e.registryId === qreg.id), patients, qreg), target: i.target })) : [], mdt_upcoming: mdt.filter(m => m.date >= today()).length };
    try { const t = await AI.call(`Ты помощник заведующего хирургическим отделением. По данным JSON составь короткий брифинг на сегодня по-русски: 4-7 пунктов, что важно сделать, на что обратить внимание. Без вступлений, без длинных тире.\n${JSON.stringify(ctx)}`, { text: '' }); $('#briefOut').innerHTML = `<div class="card" style="margin-top:12px;white-space:pre-wrap">${esc(t)}</div>`; }
    catch (e) { $('#briefOut').innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
  };
  $('#hBrief').onclick = brief; $('#hBrief2').onclick = brief;
};

/* ---------- РЕГИСТРЫ ---------- */
Routes.registries = async (main, act) => {
  const [regs, patients] = await Promise.all([Data.registries(), Data.patients()]);
  main.innerHTML = `<div class="head"><h1>Регистры</h1>${can('design') ? '<button class="btn primary" id="newReg">+ Новый регистр</button>' : ''}</div>
    ${regs.length ? `<div class="cards">${regs.map(r => `<div class="card reg"><h3><a href="#registry/${r.id}">${esc(r.name)}</a></h3><p class="muted">${esc(r.description || '')}</p>
      <div class="row between"><span><span class="tag">${esc(r.status || '')}</span> <span class="tag">v${r.version}</span></span><span>${patients.filter(p => p.registryId === r.id).length} пац. · ${r.eventTypes.length} типов событий</span></div>
      <div class="row">${r.status === 'на одобрении' && can('design') ? `<button class="btn sm primary" data-appr="${r.id}">Одобрить</button>` : ''}<a class="btn sm" href="#patients/${r.id}">Пациенты</a><a class="btn sm" href="#registry/${r.id}">${can('design') ? 'Конструктор' : 'Структура'}</a></div></div>`).join('')}</div>`
      : emptyState('Регистров пока нет.', can('design') ? '<button class="btn primary" onclick="$(\'#newReg\').click()">Создать регистр</button>' : '')}`;
  $$('[data-appr]', main).forEach(b => b.onclick = async () => { const r = regs.find(x => x.id === b.dataset.appr); r.status = 'пилот'; await DB.put('registries', r, 'одобрение регистра'); toast('Регистр одобрен'); App.route(); });
  if (act === 'new') setTimeout(() => newRegDialog(), 0);
  if ($('#newReg')) $('#newReg').onclick = () => newRegDialog();
  if (!can('design') && !$('#newReg')) $('.head', main).insertAdjacentHTML('beforeend', '<button class="btn" id="propReg">Предложить регистр</button>');
  if ($('#propReg')) $('#propReg').onclick = () => newRegDialog();
};
function newRegDialog() {
  {
    const m = modal(`<h3>Новый регистр</h3><div class="fld"><label class="flab">Название</label><input class="inp" id="nr_name"></div>
      <label class="flab">Шаблон</label><div class="tpls">${Object.entries(TEMPLATES).map(([k, t], i) => `<label class="tpl"><input type="radio" name="tpl" value="${k}" ${i === 0 ? 'checked' : ''}><b>${esc(t.name)}</b><span class="muted">${esc(t.desc)}</span></label>`).join('')}</div>
      <div class="row end"><button class="btn primary" id="nr_go">Создать</button></div>`, { wide: true });
    $('#nr_go', m).onclick = async () => {
      const k = $('input[name=tpl]:checked', m).value; const r = TEMPLATES[k].make();
      if ($('#nr_name', m).value.trim()) r.name = $('#nr_name', m).value.trim();
      if (k === 'colorectal') r.followupEvery = 180;
      if (!can('design')) { r.status = 'на одобрении'; r.proposedBy = Auth.user.id; }
      const saved = await DB.put('registries', r, can('design') ? 'создание регистра' : 'заявка на регистр'); m.close(); toast(can('design') ? 'Регистр создан' : 'Заявка отправлена администратору'); go(can('design') ? 'registry/' + saved.id : 'registries');
    };
  }
}

/* ---------- КОНСТРУКТОР РЕГИСТРА ---------- */
Routes.registry = async (main, id, tab = 'general') => {
  const reg = await DB.get('registries', id); if (!reg) return go('registries');
  const ro = !can('design') || (typeof NET !== 'undefined' && NET.on && !regManage(reg));
  const tabs = { general: 'Общее', events: 'Формы событий', patient: 'Поля пациента', lists: 'Списки (реестры)', indicators: 'Показатели качества', proms: 'Опросники и расписание' };
  main.innerHTML = `<div class="head"><h1>${esc(reg.name)}</h1><div class="row"><a class="btn" href="#patients/${reg.id}">Пациенты</a>${TRAIN ? `<a class="btn" href="#training/${encodeURIComponent(reg.id)}">Учебные пациенты</a>` : ''}${ro ? '' : '<button class="btn primary" id="rgSave">Сохранить</button>'}</div></div>
    <div class="tabs">${Object.entries(tabs).map(([k, t]) => `<a href="#registry/${reg.id}/${k}" class="${k === tab ? 'on' : ''}">${t}</a>`).join('')}</div><div id="rgBody"></div>`;
  const body = $('#rgBody');
  let dirty = false; const mark = () => { dirty = true; const b = $('#rgSave'); if (b) b.classList.add('pulse'); };
  const save = async () => { reg.version = (reg.version || 1) + (dirty ? 1 : 0); await DB.put('registries', reg, 'изменение структуры регистра'); dirty = false; toast('Сохранено, версия ' + reg.version); App.route(); };
  if ($('#rgSave')) $('#rgSave').onclick = save;

  if (tab === 'general') {
    body.innerHTML = `<div class="card"><div class="grid">
      <div class="fld wide"><label class="flab">Название</label><input class="inp" id="g_name" value="${esc(reg.name)}" ${ro ? 'disabled' : ''}></div>
      <div class="fld wide"><label class="flab">Описание, критерии включения</label><textarea class="inp" id="g_desc" rows="3" ${ro ? 'disabled' : ''}>${esc(reg.description || '')}</textarea></div>
      <div class="fld"><label class="flab">Статус</label><select class="inp" id="g_status" ${ro ? 'disabled' : ''}>${['черновик', 'пилот', 'активный', 'закрыт'].map(s => `<option ${reg.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      <div class="fld"><label class="flab">Наблюдение каждые (дней), 0 = не напоминать</label><input class="inp" type="number" id="g_fu" value="${reg.followupEvery || 0}" ${ro ? 'disabled' : ''}></div>
      <div class="fld wide"><label class="flab">Единица учёта: эпизод открывается событием</label><select class="inp" id="g_ep" ${ro ? 'disabled' : ''}>${reg.eventTypes.map(e => `<option value="${e.id}" ${Episodes.opener(reg) === e.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}<option value="${Episodes.PATIENT}" ${Episodes.isPatient(reg) ? 'selected' : ''}>Пациент целиком (продольный регистр)</option></select><span class="fhint">Что регистр считает одним случаем. Хирургический аудит: операция. Регистр заболевания: диагноз. Кардиология: госпитализация. Продольный регистр (например, диабет): пациент целиком, отсчёт от первой записи. Остальные события пациента относятся к эпизоду по дате или по выбору в форме. Охват, полнота наблюдения и показатели качества считаются по эпизодам.</span></div>
      <div class="fld"><label class="flab">Событие-точка отсчёта для выживаемости</label><select class="inp" id="g_start" ${ro ? 'disabled' : ''}>${reg.eventTypes.map(e => `<option value="${e.id}" ${reg.keyDates?.start === e.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select></div>
      <div class="fld"><label class="flab">Версия схемы</label><div class="calc">v${reg.version}</div></div>
    </div></div>
    ${ro ? '' : `<div class="card"><h3>Действия</h3><div class="row"><button class="btn" id="g_export">Экспорт структуры (JSON)</button><button class="btn" id="g_dup">Дублировать регистр</button><button class="btn danger" id="g_del">Удалить регистр</button></div><p class="muted">Экспорт структуры позволяет перенести регистр в другую установку AddAll без данных пациентов.</p></div>`}`;
    const upd = () => { reg.name = $('#g_name').value; reg.description = $('#g_desc').value; reg.status = $('#g_status').value; reg.followupEvery = Number($('#g_fu').value || 0); reg.keyDates = { ...(reg.keyDates || {}), start: $('#g_start').value }; reg.episode = { ...(reg.episode || {}), opener: $('#g_ep').value }; mark(); };
    $$('input,textarea,select', body).forEach(x => x.onchange = upd);
    if (!ro) {
      $('#g_export').onclick = () => { const c = clone(reg); ['id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy'].forEach(k => delete c[k]); download(slug(reg.name) + '_schema.json', JSON.stringify(c, null, 2), 'application/json'); };
      $('#g_dup').onclick = async () => { const c = clone(reg); delete c.id; c.name += ' (копия)'; c.version = 1; const s = await DB.put('registries', c, 'дублирование регистра'); go('registry/' + s.id); };
      $('#g_del').onclick = async () => {
        const pts = await Data.patients(reg.id);
        if (pts.length) return toast(`В регистре ${pts.length} пациентов. Сначала удалите или перенесите их.`, 'err');
        if (await confirmBox('Удалить регистр «' + reg.name + '»?')) { await DB.del('registries', reg.id); go('registries'); }
      };
    }
  }

  if (tab === 'events') {
    const draw = () => {
      body.innerHTML = `${ro ? '' : '<div class="row"><button class="btn" id="addEt">+ Тип события</button></div>'}
        ${reg.eventTypes.map((et, ei) => `<div class="card et" style="border-left:4px solid ${et.color || '#888'}">
          <div class="row between"><h3>${esc(et.name)} <small class="muted">${et.single ? '· однократное' : '· повторяемое'} · дата: «${esc(et.dateLabel || 'Дата')}»</small></h3>
          ${ro ? '' : `<div class="row"><button class="btn sm" data-ete="${ei}">Настроить</button><button class="btn sm" data-etu="${ei}">↑</button><button class="btn sm" data-etd="${ei}">↓</button><button class="btn sm danger" data-etx="${ei}">×</button></div>`}</div>
          ${(et.sections || []).map((s, si) => `<div class="sec-b"><div class="row between"><b class="sec-t">${esc(s.title)}</b>${ro ? '' : `<span><button class="btn xs" data-sr="${ei}:${si}">Переименовать</button> <button class="btn xs" data-sx="${ei}:${si}">Удалить раздел</button></span>`}</div>
            <table class="tbl fields"><tbody>${(s.fields || []).map((f, fi) => `<tr><td><b>${esc(f.label)}</b>${f.required ? ' <i class="req">*</i>' : ''}<div class="muted mono">${esc(f.key)}</div></td><td>${esc(FIELD_TYPES[f.type] || f.type)}${f.type === 'calc' ? `<div class="muted mono">${esc(f.formula || '')}</div>` : ''}</td>
              <td class="muted">${f.showIf?.key ? `если ${esc(f.showIf.key)} ${esc(OPS[f.showIf.op] || '')} ${esc(f.showIf.value || '')}` : ''}</td><td class="muted">${f.def ? '§ определение' : ''}</td>
              ${ro ? '' : `<td class="nowrap"><button class="btn xs" data-fe="${ei}:${si}:${fi}">✎</button><button class="btn xs" data-fu="${ei}:${si}:${fi}">↑</button><button class="btn xs" data-fd="${ei}:${si}:${fi}">↓</button><button class="btn xs danger" data-fx="${ei}:${si}:${fi}">×</button></td>`}</tr>`).join('')}</tbody></table>
            ${ro ? '' : `<button class="btn xs" data-fa="${ei}:${si}">+ Поле</button>`}</div>`).join('')}
          ${ro ? '' : `<button class="btn xs" data-sa="${ei}">+ Раздел</button> <button class="btn xs" data-rb="${ei}">+ Блок модели риска</button>`}
        </div>`).join('')}`;
      const idx = (s) => s.split(':').map(Number);
      body.onclick = async (e) => {
        const b = e.target.closest('button'); if (!b || ro) return; const d = b.dataset;
        if (b.id === 'addEt') { reg.eventTypes.push({ id: uid('et'), name: 'Новое событие', color: '#888888', dateLabel: 'Дата', sections: [{ id: uid('s'), title: 'Основное', fields: [] }] }); mark(); draw(); }
        if (d.ete) etDialog(reg.eventTypes[d.ete], () => { mark(); draw(); });
        if (d.etu && d.etu > 0) { const a = reg.eventTypes; [a[d.etu - 1], a[d.etu]] = [a[d.etu], a[d.etu - 1]]; mark(); draw(); }
        if (d.etd && d.etd < reg.eventTypes.length - 1) { const a = reg.eventTypes, i = Number(d.etd); [a[i + 1], a[i]] = [a[i], a[i + 1]]; mark(); draw(); }
        if (d.etx) { const n = (await Data.events(reg.id)).filter(x => x.type === reg.eventTypes[d.etx].id).length; if (n) return toast(`Есть ${n} событий этого типа, удалить нельзя`, 'err'); if (await confirmBox('Удалить тип события?')) { reg.eventTypes.splice(d.etx, 1); mark(); draw(); } }
        if (d.rb) {
          const m2 = modal(`<h3>Готовый блок модели риска</h3><p class="muted">Добавит раздел с полями и расчётом прогноза летальности. Прогноз можно выбрать как «ожидаемый риск» в RA-CUSUM, VLAD и funnel plot.</p>${Object.entries(RISK_BLOCKS).map(([k, b]) => `<button class="btn block" data-blk="${k}">${esc(b.name)}</button>`).join('')}`);
          $$('[data-blk]', m2).forEach(bb => bb.onclick = () => {
            const k = bb.dataset.blk, pref = k === 'crpossum' ? 'crp_' : 'pp_';
            const used = reg.eventTypes.flatMap(formFields).map(f => f.key);
            let px = pref, n = 2; while (used.some(u => u.startsWith(px))) px = pref.replace('_', n++ + '_');
            reg.eventTypes[d.rb].sections.push(RISK_BLOCKS[k].make(px)); m2.close(); mark(); draw(); toast('Блок добавлен');
          });
        }
        if (d.sa) { const t = await promptBox('Название раздела', 'Новый раздел'); if (t) { reg.eventTypes[d.sa].sections.push({ id: uid('s'), title: t, fields: [] }); mark(); draw(); } }
        if (d.sr) { const [a, s] = idx(d.sr); const sec = reg.eventTypes[a].sections[s]; const t = await promptBox('Название раздела', sec.title); if (t) { sec.title = t; const n = await promptBox('Напоминание красным вверху раздела (необязательно), например: «Не забудьте внести данные реципиентной зоны!»', sec.note || ''); if (n !== null) sec.note = n.trim(); if (s > 0) sec.tab = await confirmBox('Показывать раздел «' + t + '» вкладкой на одной странице с предыдущим разделом? (Нет = отдельная страница)'); mark(); draw(); } }
        if (d.sx) { const [a, s] = idx(d.sx); if (await confirmBox('Удалить раздел вместе с полями? Уже введённые данные сохранятся, но не будут видны в форме.')) { reg.eventTypes[a].sections.splice(s, 1); mark(); draw(); } }
        if (d.fa) { const [a, s] = idx(d.fa); fieldDialog(reg, reg.eventTypes[a], null, (f) => { reg.eventTypes[a].sections[s].fields.push(f); mark(); draw(); }); }
        if (d.fe) { const [a, s, f] = idx(d.fe); fieldDialog(reg, reg.eventTypes[a], reg.eventTypes[a].sections[s].fields[f], (nf) => { reg.eventTypes[a].sections[s].fields[f] = nf; mark(); draw(); }); }
        if (d.fu) { const [a, s, f] = idx(d.fu); const L = reg.eventTypes[a].sections[s].fields; if (f > 0) { [L[f - 1], L[f]] = [L[f], L[f - 1]]; mark(); draw(); } }
        if (d.fd) { const [a, s, f] = idx(d.fd); const L = reg.eventTypes[a].sections[s].fields; if (f < L.length - 1) { [L[f + 1], L[f]] = [L[f], L[f + 1]]; mark(); draw(); } }
        if (d.fx) { const [a, s, f] = idx(d.fx); if (await confirmBox('Удалить поле? Уже введённые значения останутся в базе и в экспорте.')) { reg.eventTypes[a].sections[s].fields.splice(f, 1); mark(); draw(); } }
      };
    };
    draw();
  }

  if (tab === 'patient') {
    const draw = () => {
      body.innerHTML = `<div class="card"><p class="muted">Базовые поля (номер ИБ, ФИО, дата рождения, пол, телефон, согласие) есть всегда. Здесь добавляются дополнительные поля карточки пациента.</p>
        <table class="tbl fields"><tbody>${(reg.patientFields || []).map((f, i) => `<tr><td><b>${esc(f.label)}</b><div class="muted mono">${esc(f.key)}</div></td><td>${esc(FIELD_TYPES[f.type])}</td>${ro ? '' : `<td class="nowrap"><button class="btn xs" data-pe="${i}">✎</button><button class="btn xs danger" data-px="${i}">×</button></td>`}</tr>`).join('') || '<tr><td class="muted">Дополнительных полей нет</td></tr>'}</tbody></table>
        ${ro ? '' : '<button class="btn sm" id="pfAdd">+ Поле</button>'}</div>`;
      if (!ro) {
        $('#pfAdd').onclick = () => fieldDialog(reg, { sections: [{ fields: reg.patientFields }] }, null, f => { reg.patientFields.push(f); mark(); draw(); }, true);
        body.onclick = async e => { const b = e.target.closest('button'); if (!b) return;
          if (b.dataset.pe) fieldDialog(reg, { sections: [{ fields: reg.patientFields }] }, reg.patientFields[b.dataset.pe], f => { reg.patientFields[b.dataset.pe] = f; mark(); draw(); }, true);
          if (b.dataset.px && await confirmBox('Удалить поле?')) { reg.patientFields.splice(b.dataset.px, 1); mark(); draw(); } };
      }
    };
    draw();
  }

  if (tab === 'indicators') {
    const draw = () => {
      body.innerHTML = `<div class="card"><p class="muted">Показатель качества = доля событий, где выполнено условие числителя, среди событий, где выполнено условие знаменателя. Считается на главной, в аналитике и в годовом отчёте.</p>
        <table class="tbl"><thead><tr><th>Показатель</th><th>Событие</th><th>Знаменатель</th><th>Числитель</th><th>Цель</th><th></th></tr></thead><tbody>${(reg.indicators || []).map((i, k) => `<tr><td><b>${esc(i.name)}</b></td><td>${esc(etById(reg, i.et)?.name || '?')}</td><td class="muted">${i.denom?.key ? `${esc(i.denom.key)} ${OPS[i.denom.op]} ${esc(i.denom.value || '')}` : 'все'}</td><td>${esc(i.num.key)} ${OPS[i.num.op]} ${esc(i.num.value || '')}</td><td>${i.target !== '' && i.target != null ? (i.lowerBetter ? '≤' : '≥') + i.target + '%' : ''}</td>${ro ? '<td></td>' : `<td class="nowrap"><button class="btn xs" data-ie="${k}">✎</button><button class="btn xs danger" data-ix="${k}">×</button></td>`}</tr>`).join('') || '<tr><td colspan="6" class="muted">Нет показателей</td></tr>'}</tbody></table>
        ${ro ? '' : '<button class="btn sm" id="indAdd">+ Показатель</button>'}</div>`;
      if (ro) return;
      $('#indAdd').onclick = () => indicatorDialog(reg, null, i => { reg.indicators = reg.indicators || []; reg.indicators.push(i); mark(); draw(); });
      body.onclick = async e => { const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.ie) indicatorDialog(reg, reg.indicators[b.dataset.ie], i => { reg.indicators[b.dataset.ie] = i; mark(); draw(); });
        if (b.dataset.ix && await confirmBox('Удалить показатель?')) { reg.indicators.splice(b.dataset.ix, 1); mark(); draw(); } };
    };
    draw();
  }

  if (tab === 'proms') PromsAdmin(reg, body, ro, mark);
  if (tab === 'lists') ListsAdmin(reg, body, ro, mark);
};

function etDialog(et, done) {
  const m = modal(`<h3>Тип события</h3><div class="grid">
    <div class="fld"><label class="flab">Название</label><input class="inp" id="e_n" value="${esc(et.name)}"></div>
    <div class="fld"><label class="flab">Подпись поля даты</label><input class="inp" id="e_d" value="${esc(et.dateLabel || 'Дата')}"></div>
    <div class="fld"><label class="flab">Цвет на таймлайне</label><input class="inp" type="color" id="e_c" value="${esc(et.color || '#888888')}"></div>
    <div class="fld"><label class="flab">Однократное событие</label><select class="inp" id="e_s"><option value="0">нет, может повторяться</option><option value="1" ${et.single ? 'selected' : ''}>да, одно на пациента</option></select></div>
    </div>
    <h4 style="margin:14px 0 4px">Ожидание в каждом эпизоде</h4>
    <p class="muted small" style="margin:0 0 8px">Если задать срок, форма попадёт в очередь наблюдения. Пример: патоморфология через 30 дней после операции; исход через 90 дней после инсульта; визит каждые 90 дней в регистре диабета. Если срок и окно прошли, а формы нет, случай виден как пропуск в охвате, очереди и показателях.</p>
    <div class="grid">
    <div class="fld"><label class="flab" for="e_x">Первый срок через (дней от начала эпизода)</label><input class="inp" type="number" min="0" step="1" id="e_x" value="${et.expect && et.expect.days !== '' && et.expect.days != null ? esc(et.expect.days) : ''}" placeholder="пусто: не ожидается"></div>
    <div class="fld"><label class="flab" for="e_xe">Повторять каждые (дней)</label><input class="inp" type="number" min="0" step="1" id="e_xe" value="${et.expect?.every ? esc(et.expect.every) : ''}" placeholder="пусто: один раз"></div>
    <div class="fld"><label class="flab" for="e_xw">Допустимое окно после срока (дней)</label><input class="inp" type="number" min="0" step="1" id="e_xw" value="${et.expect && et.expect.window !== '' && et.expect.window != null ? esc(et.expect.window) : ''}" placeholder="по умолчанию: 0, у повторяющихся половина интервала"></div>
    </div><div class="row end"><button class="btn primary" id="e_ok">Готово</button></div>`);
  $('#e_ok', m).onclick = () => { et.name = $('#e_n', m).value; et.dateLabel = $('#e_d', m).value; et.color = $('#e_c', m).value; et.single = $('#e_s', m).value === '1'; const ex = $('#e_x', m).value.trim(), xe = $('#e_xe', m).value.trim(), xw = $('#e_xw', m).value.trim(); if (ex === '') delete et.expect; else { et.expect = { days: Math.max(0, Math.round(Number(ex) || 0)) }; if (Number(xe) > 0) et.expect.every = Math.round(Number(xe)); if (xw !== '') et.expect.window = Math.max(0, Math.round(Number(xw) || 0)); } m.close(); done(); };
}

function fieldDialog(reg, et, field, done, patientLevel) {
  const f = field ? clone(field) : { key: '', label: '', type: 'text', options: [], required: false, def: '' };
  const allKeys = reg.eventTypes.flatMap(formFields).map(x => x.key).concat((reg.patientFields || []).map(x => x.key));
  const sameForm = formFields(et).filter(x => x.key !== f.key);
  const m = modal(`<h3>${field ? 'Поле' : 'Новое поле'}</h3><div class="grid">
    <div class="fld"><label class="flab">Название (как видит врач) <i class="req">*</i></label><input class="inp" id="f_l" value="${esc(f.label)}"></div>
    <div class="fld"><label class="flab">Код переменной (для экспорта и формул)</label><input class="inp mono" id="f_k" value="${esc(f.key)}" ${field ? 'disabled' : ''} placeholder="автоматически"></div>
    <div class="fld"><label class="flab">Тип</label><select class="inp" id="f_t">${Object.entries(FIELD_TYPES).filter(([k]) => !patientLevel || !['calc', 'complist'].includes(k)).map(([k, v]) => `<option value="${k}" ${f.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    <div class="fld"><label class="flab">Единица измерения</label><input class="inp" id="f_u" value="${esc(f.unit || '')}"></div>
    <div class="fld wide" data-show="select,multiselect,complist"><label class="flab">Варианты (по одному в строке)</label><textarea class="inp" id="f_o" rows="5">${esc((f.options || []).join('\n'))}</textarea></div>
    <div class="fld" data-show="number"><label class="flab">Минимум</label><input class="inp" type="number" id="f_min" value="${esc(f.min ?? '')}"></div>
    <div class="fld" data-show="number"><label class="flab">Максимум</label><input class="inp" type="number" id="f_max" value="${esc(f.max ?? '')}"></div>
    <div class="fld wide" data-show="calc"><label class="flab">Формула</label><input class="inp mono" id="f_f" value="${esc(f.formula || '')}" placeholder="bmi(height, weight)">
      <div class="help">Переменные: коды полей этой формы и карточки пациента, eventDate, birthDate. Функции: age(дата, на_дату), days(с, по), bmi(рост, вес), round(x, n), cci(список), maxcd(список), ifelse(условие, a, b), logit(x) для модели риска, Math.*. Модель риска: <span class="mono">logit(-5.2 + 0.04*age_dx + ifelse(asa == 'III', 0.9, 0))</span>. Пример: <span class="mono">ifelse(ln_total >= 12, 'да', 'нет')</span></div></div>
    <div class="fld"><label class="flab">Обязательное</label><select class="inp" id="f_r"><option value="0">нет</option><option value="1" ${f.required ? 'selected' : ''}>да</option></select></div>
    <div class="fld"><label class="flab">Желательное (оранжевое, считается в полноте)</label><select class="inp" id="f_key"><option value="0">нет</option><option value="1" ${f.key_ ? 'selected' : ''}>да</option></select></div>
    ${patientLevel ? '' : `<div class="fld wide"><label class="flab">Показывать, только если</label><div class="row"><select class="inp" id="f_ck"><option value="">всегда показывать</option>${sameForm.map(x => `<option value="${x.key}" ${f.showIf?.key === x.key ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select>
      <select class="inp" id="f_co">${Object.entries(OPS).map(([k, v]) => `<option value="${k}" ${f.showIf?.op === k ? 'selected' : ''}>${v}</option>`).join('')}</select><input class="inp" id="f_cv" value="${esc(f.showIf?.value || '')}" placeholder="значение (для «одно из» через ;)"></div></div>`}
    <div class="fld wide"><label class="flab">Определение для словаря данных</label><textarea class="inp" id="f_d" rows="2" placeholder="Точное определение: что считать, когда, по какой классификации">${esc(f.def || '')}</textarea></div>
    <div class="fld wide"><label class="flab">Подсказка под полем</label><input class="inp" id="f_h" value="${esc(f.help || '')}"></div>
    <div class="fld wide"><label class="flab">Правило ввода красным (видно всем, кто заполняет)</label><input class="inp" id="f_w" value="${esc(f.warn || '')}" placeholder="Например: «Нет» для повторных операций отмечайте только после выписки"></div>
    <div class="fld" data-show="select"><label class="flab">Поиск по вариантам с запоминанием частых</label><select class="inp" id="f_sr"><option value="0">нет (обычный список)</option><option value="1" ${f.search ? 'selected' : ''}>да (для длинных списков: сетки, импланты, препараты)</option></select></div>
    <div class="fld"><label class="flab">Переносить из прошлой записи пациента</label><select class="inp" id="f_cf"><option value="0">нет</option><option value="1" ${f.carry ? 'selected' : ''}>да: в новом событии подставится последнее значение</option></select></div>
    <div class="fld" data-show="select,multiselect"><label class="flab">Выбор на схеме</label><select class="inp" id="f_dg"><option value="">без схемы</option>${Object.entries(DIAGRAMS).map(([k, d]) => `<option value="${k}" ${f.diagram === k ? 'selected' : ''}>${esc(d.n)}</option>`).join('')}</select><div class="help">Варианты ответа заполнятся областями схемы; врач выбирает щелчком по рисунку или по списку, они синхронны.</div></div>
    <div class="fld" data-show="group"><label class="flab">Название одной записи</label><input class="inp" id="f_il" value="${esc(f.itemLabel || '')}" placeholder="Например: Анастомоз, Лимфоузел, Донорская зона"></div>
    <div class="fld wide" data-show="group"><label class="flab">Поля внутри записи: по одному в строке «Подпись | тип | варианты через ;»</label><textarea class="inp mono" id="f_sub" rows="7" placeholder="Сосуд | выбор | артерия; вена&#10;Диаметр | число | мм&#10;Анастомозы | группа | Анастомоз&#10;  Тип | выбор | конец-в-конец; конец-в-бок&#10;  Результат | выбор | проходим; переделан; тромбоз">${esc(stringifySubfields(f.subfields || []))}</textarea>
      <div class="help">Типы: текст, длинный текст, число (третья колонка: единица), дата, выбор, несколько, да/нет, сотрудник, группа. Строки с отступом (2 пробела) под строкой «группа» — её вложенные поля, до 3 уровней. В формулах: count(поле), sumOf(поле, "код"), anyOf(поле, "код", "значение").</div></div>
    </div><div class="row end"><button class="btn primary" id="f_ok">Готово</button></div>`, { wide: true });
  const sync = () => { const t = $('#f_t', m).value; $$('[data-show]', m).forEach(x => x.style.display = x.dataset.show.split(',').includes(t) ? '' : 'none'); };
  $('#f_t', m).onchange = sync; sync();
  $('#f_ok', m).onclick = () => {
    const label = $('#f_l', m).value.trim(); if (!label) return toast('Укажите название', 'err');
    let key = field ? f.key : ($('#f_k', m).value.trim() || slug(label));
    if (!field) { key = key.replace(/[^\wЀ-ӿ]/g, '_'); if (/^\d/.test(key)) key = 'f_' + key; let k2 = key, n = 2; while (allKeys.includes(k2)) k2 = key + '_' + n++; key = k2; }
    const out = { ...f, key, label, type: $('#f_t', m).value, unit: $('#f_u', m).value.trim(), options: $('#f_o', m).value.split('\n').map(s => s.trim()).filter(Boolean),
      min: $('#f_min', m).value, max: $('#f_max', m).value, formula: $('#f_f', m).value.trim(), required: $('#f_r', m).value === '1', key_: $('#f_key', m).value === '1',
      def: $('#f_d', m).value.trim(), help: $('#f_h', m).value.trim(), warn: $('#f_w', m).value.trim() };
    out.carry = $('#f_cf', m).value === '1'; out.search = out.type === 'select' && $('#f_sr', m).value === '1'; out.diagram = ['select', 'multiselect'].includes(out.type) ? $('#f_dg', m).value : '';
    if (out.diagram) { const D = DIAGRAMS[out.diagram]; const extra = out.options.filter(o => !D.r.some(r => r[0] === o)); out.options = [...D.r.map(r => r[0]), ...extra]; }
    if (out.type === 'group') { out.itemLabel = $('#f_il', m).value.trim(); out.subfields = parseSubfields($('#f_sub', m).value); if (!out.subfields.length) return toast('Опишите хотя бы одно поле внутри записи', 'err'); }
    if (!patientLevel) out.showIf = $('#f_ck', m).value ? { key: $('#f_ck', m).value, op: $('#f_co', m).value, value: $('#f_cv', m).value } : null;
    m.close(); done(out);
  };
}

function indicatorDialog(reg, ind, done) {
  const i = ind ? clone(ind) : { id: uid('i'), name: '', et: reg.eventTypes[0]?.id, denom: null, num: { key: '', op: 'eq', value: '' }, target: '', lowerBetter: true };
  const m = modal(`<h3>Показатель качества</h3><div class="grid">
    <div class="fld wide"><label class="flab">Название</label><input class="inp" id="i_n" value="${esc(i.name)}"></div>
    <div class="fld"><label class="flab">Тип события</label><select class="inp" id="i_et">${reg.eventTypes.map(e => `<option value="${e.id}" ${i.et === e.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select></div>
    <div class="fld"><label class="flab">Цель, %</label><div class="row"><select class="inp" id="i_lb"><option value="1">не больше</option><option value="0" ${!i.lowerBetter ? 'selected' : ''}>не меньше</option></select><input class="inp" type="number" id="i_t" value="${esc(i.target)}"></div></div>
    <div class="fld wide"><label class="flab" for="i_ref">Обоснование цели: источник (статья, рекомендация, решение совета регистра)</label><textarea class="inp" id="i_ref" rows="2" placeholder="Например: Staiger RD и соавт., Br J Surg 2022;109:1274. Порог 75-го перцентиля медиан центров">${esc(i.ref || '')}</textarea></div>
    <div class="fld wide"><label class="flab">Знаменатель (какие события считать)</label><div class="row" id="i_den"></div></div>
    <div class="fld wide"><label class="flab">Числитель (событие считается «случаем», если)</label><div class="row" id="i_num"></div></div>
    </div><div class="row end"><button class="btn primary" id="i_ok">Готово</button></div>`, { wide: true });
  const condUI = (box, c, allowAll) => {
    const et = etById(reg, $('#i_et', m).value);
    box.innerHTML = `<select class="inp" data-c="k">${allowAll ? '<option value="">все события этого типа</option>' : ''}${formFields(et).map(f => `<option value="${f.key}" ${c?.key === f.key ? 'selected' : ''}>${esc(f.label)}</option>`).join('')}</select>
      <select class="inp" data-c="o">${Object.entries(OPS).map(([k, v]) => `<option value="${k}" ${c?.op === k ? 'selected' : ''}>${v}</option>`).join('')}</select><input class="inp" data-c="v" value="${esc(c?.value || '')}" placeholder="значение">`;
  };
  const rd = (box) => ({ key: $('[data-c=k]', box).value, op: $('[data-c=o]', box).value, value: $('[data-c=v]', box).value });
  const draw = () => { condUI($('#i_den', m), i.denom, true); condUI($('#i_num', m), i.num, false); };
  $('#i_et', m).onchange = () => { i.denom = null; i.num = { key: '', op: 'eq', value: '' }; draw(); }; draw();
  $('#i_ok', m).onclick = () => {
    const d = rd($('#i_den', m)), n = rd($('#i_num', m));
    if (!$('#i_n', m).value.trim() || !n.key) return toast('Укажите название и числитель', 'err');
    m.close(); done({ ...i, name: $('#i_n', m).value.trim(), et: $('#i_et', m).value, denom: d.key ? d : null, num: n, target: $('#i_t', m).value === '' ? '' : Number($('#i_t', m).value), ref: $('#i_ref', m).value.trim(), lowerBetter: $('#i_lb', m).value === '1' });
  };
}

/* ---------- ПАЦИЕНТЫ ---------- */
Routes.patients = async (main, regId = '', listId = '') => {
  const [regs, patients, events, promsAll] = await Promise.all([Data.registries(), Data.patients(), Data.events(), DB.all('proms')]);
  window.__PTS = patients; const promsOver = new Set(promsAll.filter(x => !x.doneAt && x.due < today()).map(x => x.patientId));
  const curReg = regs.find(r => r.id === regId); const curList = curReg && (curReg.lists || []).find(l => l.id === listId);
  let only = null;
  if (curList) { const ds = { reg: curReg, patients: patients.filter(p => p.registryId === regId), events: events.filter(e => e.registryId === regId) }; only = new Set([...(curList.conds || []).length ? cohortPatients(ds, { conds: curList.conds }).map(p => p.id) : [], ...(curList.manual || [])]); }
  const st = Routes.patients.state || (Routes.patients.state = { q: '', sort: 'updated', f: '', pg: 0, dir: 1, cf: {} }); st.cf = st.cf || {};
  main.innerHTML = `<div class="head"><div><h1>${esc(curList ? curList.name : curReg ? curReg.name : 'Все пациенты')}</h1><div class="sub">${curList ? esc(listRule(curList, curReg)) : curReg ? esc(curReg.description || '') : 'Все карточки всех регистров'}</div></div><div class="row">${curList ? '' : regSelect(regs, regId)}<input class="inp" id="pq" placeholder="Поиск: ФИО, № ИБ, ID, дата рождения или операции" value="${esc(st.q)}">
    <select class="inp" id="psort"><option value="updated">недавно изменённые</option><option value="name" ${st.sort === 'name' ? 'selected' : ''}>по ФИО</option><option value="comp" ${st.sort === 'comp' ? 'selected' : ''}>по полноте</option></select>
    <select class="inp" id="pflt"><option value="">все записи</option><option value="inc" ${st.f === 'inc' ? 'selected' : ''}>неполные</option><option value="ok" ${st.f === 'ok' ? 'selected' : ''}>полные</option><option value="dead" ${st.f === 'dead' ? 'selected' : ''}>умершие</option><option value="proms" ${st.f === 'proms' ? 'selected' : ''}>просрочены анкеты</option></select>
    ${can('enter') ? '<button class="btn ai" id="newPAI">✦ Пациент из документа</button><button class="btn primary" id="newP">+ Пациент</button>' : ''}</div></div><div id="pviews" class="chips" style="margin:-4px 0 10px"></div><div id="plist"></div>`;
  const rows = patients.filter(p => (!regId || p.registryId === regId) && visibleP(p) && (!only || only.has(p.id))).map(p => {
    const r = regs.find(x => x.id === p.registryId); const ev = events.filter(e => e.patientId === p.id).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    let ct = 0, cf = 0; ev.forEach(e => { const et = r && etById(r, e.type); if (!et) return; const c = completeness(et, computeValues(r, p, et, e.data, e.date)); ct += c.total; cf += c.filled; });
    const comp = ct ? Math.round(cf / ct * 100) : null; const draft = ev.some(e => e.status === 'черновик');
    const state = p.vital === 'умер' ? 'dead' : (comp === 100 || comp == null) && !draft && ev.length ? 'ok' : 'inc';
    return { p, r, ev, comp, state, proms: promsOver.has(p.id) };
  });
  const draw = () => {
    const q = st.q.toLowerCase();
    const hay = x => [pname(x.p), x.p.localId, x.p.iin, x.p.seq, x.p.birthDate, fmtDate(x.p.birthDate), x.p.sex, ...(x.p.ids || []).map(i => i.value), ...x.ev.map(e => e.date + ' ' + fmtDate(e.date))].join(' ').toLowerCase();
    let list = rows.filter(x => (!q || q.split(/\s+/).every(t => hay(x).includes(t))) && (!st.f || (st.f === 'proms' ? x.proms : x.state === st.f)));
    /* 2.11: фильтры под заголовками колонок */
    const cf = st.cf, has = (v, t) => String(v || '').toLowerCase().includes(String(t).toLowerCase());
    list = list.filter(x => (!cf.seq || has(x.p.seq || x.p.id, cf.seq)) && (!cf.lid || has([x.p.localId, ...(x.p.ids || []).map(i => i.value)].join(' '), cf.lid)) && (!cf.name || has(pname(x.p), cf.name))
      && (!cf.sex || x.p.sex === cf.sex) && (!cf.age || (() => { const a = FX.age(x.p.birthDate); const m = String(cf.age).match(/^\s*(\d+)?\s*-?\s*(\d+)?\s*$/); if (a == null || !m) return !m; const lo = m[1] != null ? +m[1] : 0, hi = m[2] != null ? +m[2] : (String(cf.age).includes('-') ? 200 : lo); return a >= lo && a <= hi; })())
      && (!cf.last || (x.ev[0] && x.ev[0].type === cf.last)) && (!cf.comp || (cf.comp === 'lo' ? x.comp != null && x.comp < 60 : cf.comp === 'mid' ? x.comp != null && x.comp >= 60 && x.comp < 90 : cf.comp === 'hi' ? x.comp != null && x.comp >= 90 : x.comp == null))
      && (!cf.reg || x.p.registryId === cf.reg) && (!cf.center || x.p.center === cf.center));
    const S = { name: x => pname(x.p), comp: x => x.comp ?? 101, seq: x => x.p.seq || 0, lid: x => x.p.localId || '', age: x => x.p.birthDate || '', sex: x => x.p.sex || '', last: x => x.ev[0]?.date || '', n: x => x.ev.length, updated: x => x.p.updatedAt || '' };
    const kf = S[st.sort] || S.updated; const dir = st.sort === 'updated' ? -1 : (st.dir || 1);
    list.sort((a, b) => { const A = kf(a), B = kf(b); return (typeof A === 'number' ? A - B : String(A).localeCompare(String(B))) * dir; });
    const PER = 25, pages = Math.max(1, Math.ceil(list.length / PER)); if (st.pg >= pages) st.pg = 0; const total = list.length; list = list.slice(st.pg * PER, st.pg * PER + PER);
    const th = (k, t) => `<th class="sortable${st.sort === k ? ' on' : ''}" data-sort="${k}">${t}${st.sort === k ? (dir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
    const fi = (k, ph) => `<th><input class="inp xs cf" data-cf="${k}" value="${esc(cf[k] || '')}" placeholder="${ph}" aria-label="Фильтр: ${ph}"></th>`;
    const fs_ = (k, opts) => `<th><select class="inp xs cf" data-cf="${k}"><option value="">все</option>${opts.map(([v, l]) => `<option value="${esc(v)}" ${cf[k] === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></th>`;
    const etAll = []; regs.filter(r => !regId || r.id === regId).forEach(r => (r.eventTypes || []).forEach(et => { if (!etAll.some(e => e[0] === et.id)) etAll.push([et.id, et.name]); }));
    const filterRow = () => `<tr class="cf-row">${fi('seq', 'ID')}${fi('lid', '№')}${fi('name', 'ФИО')}${fi('age', '50-70')}${fs_('sex', [['М', 'М'], ['Ж', 'Ж']])}${regId ? '<th></th>' : fs_('reg', regs.map(r => [r.id, r.name]))}${centers().length ? fs_('center', centers().map(c => [c, c])) : ''}${fs_('last', etAll)}<th></th>${fs_('comp', [['lo', 'меньше 60%'], ['mid', '60-89%'], ['hi', '90% и выше'], ['none', 'нет данных']])}<th></th></tr>`;
    $('#plist').innerHTML = list.length ? `<table class="tbl hover"><thead><tr>${th('seq', 'ID')}${th('lid', '№ ИБ')}${th('name', 'ФИО')}${th('age', 'Возраст')}${th('sex', 'Пол')}<th>Регистр</th>${centers().length ? '<th>Центр</th>' : ''}${th('last', 'Последнее событие')}${th('n', 'Событий')}${th('comp', 'Полнота')}<th>Анкеты</th></tr>${filterRow()}</thead><tbody>${list.map(x => `<tr data-id="${x.p.id}" class="prow-${x.state}">
      <td class="mono muted">${x.p.seq || `<span title="Номер ещё не присвоен, показан код записи">${esc(String(x.p.id).slice(-6).toUpperCase())}</span>`}</td><td class="mono">${esc(x.p.localId || '')}${(x.p.ids || []).length ? `<div class="muted small">${esc(x.p.ids.map(i => i.type + ': ' + i.value).join(', '))}</div>` : ''}</td><td><b>${esc(pname(x.p))}</b></td><td>${FX.age(x.p.birthDate) ?? ''}</td><td>${esc(x.p.sex || '')}</td><td>${esc(x.r?.name || '')}</td>${centers().length ? `<td>${esc(x.p.center || '')}</td>` : ''}
      <td>${x.ev[0] ? `${esc(etById(x.r, x.ev[0].type)?.name || '')} · ${fmtDate(x.ev[0].date)}` : '<span class="muted">нет</span>'}</td><td>${x.ev.length}</td>
      <td>${x.comp == null ? '—' : `<div class="bar"><i style="width:${x.comp}%;background:${x.comp < 60 ? '#d9534f' : x.comp < 90 ? '#f0ad4e' : '#3c9d5d'}"></i><span>${x.comp}%</span></div>`}</td><td>${x.proms ? '<span class="tag warnt">просрочены</span>' : ''}</td></tr>`).join('')}</tbody></table>
      ${pages > 1 ? `<div class="pager"><button class="btn xs" data-pg="${st.pg - 1}" ${st.pg ? '' : 'disabled'}>‹ Назад</button>${Array.from({ length: pages }, (_, i) => `<button class="btn xs${i === st.pg ? ' primary' : ''}" data-pg="${i}">${i + 1}</button>`).join('')}<button class="btn xs" data-pg="${st.pg + 1}" ${st.pg < pages - 1 ? '' : 'disabled'}>Далее ›</button></div>` : ''}
      <p class="muted">${total} из ${rows.length}${q || st.f || Object.keys(cf).length ? ' · <a href="javascript:void 0" id="pclr">сбросить фильтры</a>' : ''} · <span class="lg lg-ok"></span> запись полная <span class="lg lg-inc"></span> неполная или черновик <span class="lg lg-dead"></span> пациент умер</p>` : (rows.length ? `<table class="tbl"><thead>${filterRow()}</thead></table>` : '') + emptyState(rows.length ? 'Никого не найдено. <a href="javascript:void 0" id="pclr">Сбросить фильтры</a>' : 'Пациентов пока нет.', '');
    $$('#plist tr[data-id]').forEach(tr => tr.onclick = () => go('patient/' + tr.dataset.id));
    $$('#plist [data-cf]').forEach(el => { const ev_ = el.tagName === 'SELECT' ? 'onchange' : 'oninput'; el[ev_] = () => { const k = el.dataset.cf, pos = el.selectionStart; if (el.value) cf[k] = el.value; else delete cf[k]; st.pg = 0; draw(); const n = $(`#plist [data-cf="${k}"]`); if (n) { n.focus(); if (pos != null && n.setSelectionRange) try { n.setSelectionRange(pos, pos); } catch (e) { } } }; el.onclick = e => e.stopPropagation(); });
    drawViews();
    $$('#plist [data-sort]').forEach(h => h.onclick = () => { if (st.sort === h.dataset.sort) st.dir = -(st.dir || 1); else { st.sort = h.dataset.sort; st.dir = 1; } st.pg = 0; draw(); });
    $$('#plist [data-pg]').forEach(b => b.onclick = () => { st.pg = Number(b.dataset.pg); draw(); });
    if ($('#pclr')) $('#pclr').onclick = () => { st.q = ''; st.f = ''; st.cf = {}; st.pg = 0; $('#pq').value = ''; $('#pflt').value = ''; draw(); };
  };
  /* 2.11: сохранённые виды списка (на этом компьютере, для этого пользователя) */
  const VK = 'addall2.views.' + (Auth.user?.id || '');
  const views = () => { try { return JSON.parse(localStorage.getItem(VK) || '[]'); } catch (e) { return []; } };
  function drawViews() {
    const v = views(), box = $('#pviews'); if (!box) return;
    const active = Object.keys(st.cf).length || st.q || st.f;
    box.innerHTML = v.map((x, i) => `<span class="chip"><a href="javascript:void 0" data-vw="${i}">${esc(x.name)}</a> <button class="btn xs ghost" data-vdel="${i}" aria-label="Удалить вид">×</button></span>`).join('') + (active ? '<button class="btn xs" id="vSave">Сохранить вид</button>' : '');
    $$('[data-vw]', box).forEach(a => a.onclick = () => { const x = views()[+a.dataset.vw]; Object.assign(st, { q: x.q || '', f: x.f || '', sort: x.sort || 'updated', dir: x.dir || 1, cf: { ...(x.cf || {}) }, pg: 0 }); $('#pq').value = st.q; $('#pflt').value = st.f; $('#psort').value = st.sort; draw(); });
    $$('[data-vdel]', box).forEach(b => b.onclick = () => { const a = views(); a.splice(+b.dataset.vdel, 1); try { localStorage.setItem(VK, JSON.stringify(a)); } catch (e) { } drawViews(); });
    if ($('#vSave')) $('#vSave').onclick = async () => { const name = await promptBox('Название вида', ''); if (!name) return; const a = views(); a.push({ name, q: st.q, f: st.f, sort: st.sort, dir: st.dir, cf: { ...st.cf } }); try { localStorage.setItem(VK, JSON.stringify(a)); } catch (e) { } drawViews(); };
  }
  draw();
  $('#pq').oninput = e => { st.q = e.target.value; st.pg = 0; draw(); };
  $('#psort').onchange = e => { st.sort = e.target.value; draw(); };
  $('#pflt').onchange = e => { st.f = e.target.value; draw(); };
  if ($('#regSel')) $('#regSel').onchange = e => go('patients/' + e.target.value);
  if (curList && curList.manual && can('enter')) $('.head .row', main).insertAdjacentHTML('afterbegin', '<button class="btn" id="lAdd">+ В список</button>');
  if ($('#lAdd')) $('#lAdd').onclick = async () => { const v = await pickValues('Добавить пациентов в список', patients.filter(p => p.registryId === regId).map(p => ({ v: p.id, l: p.localId + ' · ' + pname(p) })), curList.manual); if (v == null) return; curList.manual = v; await DB.put('registries', curReg, 'состав списка'); App.route(); };
  if (TRAIN && curReg && !curList) $('.head .row', main)?.insertAdjacentHTML('beforeend', `<a class="btn" href="#training/${encodeURIComponent(curReg.id)}">Учебные пациенты</a>`);
  if ($('#newP')) $('#newP').onclick = () => patientDialog(null, regs, regId);
  if ($('#newPAI')) $('#newPAI').onclick = () => { const r = regs.find(x => x.id === regId) || regs[0]; if (!r) return toast('Сначала создайте регистр', 'err'); AI.fullParse(r, null); };
};

async function patientDialog(p, regs, regId) {
  if (!regs.length) return toast('Сначала создайте регистр', 'err');
  const isNew = !p; p = p ? clone(p) : { registryId: regId || regs[0].id, center: Auth.user.center || '', data: {}, consent: '' };
  const reg = () => regs.find(r => r.id === $('#pd_reg', m).value) || regs[0];
  const m = modal(`<h2>${isNew ? 'Новый пациент' : 'Данные пациента'}</h2>
    <div class="grid">
      <div class="fld"><label class="flab">Регистр <i class="req">*</i></label>${regSelect(regs, p.registryId, 'pd_reg', false).replace('<select', `<select ${isNew ? '' : 'disabled'}`)}</div>
      <div class="fld"><label class="flab">Основной идентификатор</label><select class="inp" id="pd_idt">${['№ истории болезни', 'ИИН', 'Паспорт', 'Другой'].map(o => `<option ${(p.idType || '№ истории болезни') === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
      <div class="fld"><label class="flab" id="pd_idl">${esc(p.idType && p.idType !== '№ истории болезни' ? p.idType : '№ истории болезни / локальный ID')} <i class="req">*</i></label><input class="inp" id="pd_id" value="${esc(p.localId || '')}"></div>
      <div class="fld wide"><label class="flab">Другие идентификаторы (по одному в строке «Тип: номер»)</label><textarea class="inp" id="pd_ids" rows="2" placeholder="Паспорт: N1234567&#10;№ амбулаторной карты: 45-221">${esc((p.ids || []).map(i => i.type + ': ' + i.value).join('\n'))}</textarea></div>
      <div class="fld"><label class="flab">ИИН</label><input class="inp" id="pd_iin" value="${esc(p.iin || '')}" maxlength="12" inputmode="numeric"></div>
      <div class="fld"><label class="flab">Источник оплаты</label><select class="inp" id="pd_fu"><option value=""></option>${['ГОБМП', 'ОСМС', 'платно', 'ДМС', 'другое'].map(o => `<option ${p.funding === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
      <div class="fld"><label class="flab">Фамилия <i class="req">*</i></label><input class="inp" id="pd_ln" value="${esc(p.lastName || '')}"></div>
      <div class="fld"><label class="flab">Имя</label><input class="inp" id="pd_fn" value="${esc(p.firstName || '')}"></div>
      <div class="fld"><label class="flab">Отчество</label><input class="inp" id="pd_mn" value="${esc(p.middleName || '')}"></div>
      <div class="fld"><label class="flab">Дата рождения <i class="req">*</i></label><input class="inp" type="date" id="pd_bd" value="${esc(p.birthDate || '')}"></div>
      <div class="fld"><label class="flab">Пол <i class="req">*</i></label><select class="inp" id="pd_sx"><option></option><option ${p.sex === 'М' ? 'selected' : ''}>М</option><option ${p.sex === 'Ж' ? 'selected' : ''}>Ж</option></select></div>
      <div class="fld"><label class="flab">Центр</label>${centerSelect(p.center ?? Auth.user.center, 'pd_ce')}</div>
      <div class="fld"><label class="flab">Email</label><input class="inp" id="pd_em" value="${esc(p.email || '')}"></div>
      <div class="fld"><label class="flab">Телефон (WhatsApp)</label><input class="inp" id="pd_ph" value="${esc(p.phone || '')}" placeholder="+7 7xx xxx xx xx"></div>
      <div class="fld"><label class="flab">Согласие на анкеты (PROMs)</label><select class="inp" id="pd_pc"><option value=""></option>${['да', 'нет'].map(o => `<option ${p.promsConsent === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
      <div class="fld"><label class="flab">Статус</label><select class="inp" id="pd_vs">${['жив', 'умер', 'неизвестно'].map(o => `<option ${(p.vital || 'жив') === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
      <div class="fld" id="pd_ddw" ${p.vital === 'умер' ? '' : 'style="display:none"'}><label class="flab">Дата смерти</label><input class="inp" type="date" id="pd_dd" value="${esc(p.deathDate || '')}"></div>
      <div class="fld"><label class="flab">Согласие на включение в регистр</label><select class="inp" id="pd_cs"><option value=""></option>${['получено', 'не получено', 'не требуется'].map(o => `<option ${p.consent === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
    </div>
    <div id="pd_extra"></div>
    <div class="row between"><button class="btn ai" id="pd_ai">✦ Из документа (ИИ)</button><button class="btn primary" id="pd_ok">${isNew ? 'Создать и открыть карточку' : 'Сохранить'}</button></div>`, { wide: true });
  const users = await Data.users();
  const drawExtra = () => { const r = reg(); $('#pd_extra', m).innerHTML = (r.patientFields || []).length ? `<fieldset class="sec"><legend>Дополнительно</legend><div class="grid">${r.patientFields.map(f => fieldInput(f, p.data?.[f.key], users)).join('')}</div></fieldset>` : ''; };
  drawExtra(); $('#pd_reg', m).onchange = drawExtra;
  if (!isNew && !can('users')) { ['pd_ln', 'pd_fn', 'pd_mn', 'pd_bd', 'pd_sx'].forEach(id => { const el = $('#' + id, m); el.disabled = true; el.title = 'После сохранения меняет только администратор'; });
    $('#pd_ok', m).insertAdjacentHTML('beforebegin', '<button class="btn" id="pd_fix" type="button">Запросить исправление ФИО / даты рождения</button>');
    $('#pd_fix', m).onclick = () => correctionDialog(p, null); }
  $('#pd_idt', m).onchange = () => { const t = $('#pd_idt', m).value; $('#pd_idl', m).innerHTML = esc(t === '№ истории болезни' ? '№ истории болезни / локальный ID' : t) + ' <i class="req">*</i>'; if (t === 'ИИН' && !$('#pd_id', m).value) $('#pd_id', m).value = $('#pd_iin', m).value; };
  $('#pd_vs', m).onchange = () => { $('#pd_ddw', m).style.display = $('#pd_vs', m).value === 'умер' ? '' : 'none'; };
  const core = [F('localId', 'Номер истории болезни'), F('lastName', 'Фамилия'), F('firstName', 'Имя'), F('middleName', 'Отчество'), F('birthDate', 'Дата рождения', 'date'), F('sex', 'Пол', 'select', { options: ['М', 'Ж'] }), F('phone', 'Телефон')];
  const coreId = { localId: 'pd_id', lastName: 'pd_ln', firstName: 'pd_fn', middleName: 'pd_mn', birthDate: 'pd_bd', sex: 'pd_sx', phone: 'pd_ph' };
  $('#pd_ai', m).onclick = () => AI.dialog({ title: 'Карточка пациента', fields: [...core, ...(reg().patientFields || [])], users, onApply: (take, _d, ow) => {
    const extra = readForm($('#pd_extra', m)); let n = 0;
    Object.entries(take).forEach(([k, v]) => { if (coreId[k]) { const el = $('#' + coreId[k], m); if (ow || !el.value) { el.value = v; el.closest('.fld').classList.add('ai-filled'); n++; } } else if (ow || isEmpty(extra[k])) { p.data = p.data || {}; p.data[k] = v; n++; } });
    drawExtra(); toast('ИИ заполнил полей: ' + n);
  } });
  $('#pd_ok', m).onclick = async () => {
    const v = id => $('#' + id, m).value.trim();
    if (!v('pd_id') || !v('pd_ln') || !v('pd_bd') || !v('pd_sx')) return toast('Заполните номер ИБ, фамилию, дату рождения и пол', 'err');
    if (v('pd_bd') > today()) return toast('Дата рождения в будущем', 'err');
    if (v('pd_iin') && !/^\d{12}$/.test(v('pd_iin'))) return toast('ИИН: 12 цифр', 'err');
    if (v('pd_vs') === 'умер' && v('pd_dd') && v('pd_dd') < v('pd_bd')) return toast('Дата смерти раньше даты рождения', 'err');
    const dup = (await Data.patients(reg().id)).find(x => x.localId === v('pd_id') && x.id !== p.id);
    if (dup && !(await confirmBox(`Пациент с номером ${v('pd_id')} уже есть (${pname(dup)}). Всё равно сохранить?`))) return;
    Object.assign(p, { registryId: reg().id, localId: v('pd_id'), lastName: v('pd_ln'), firstName: v('pd_fn'), middleName: v('pd_mn'), birthDate: v('pd_bd'), sex: v('pd_sx'), phone: v('pd_ph'), email: v('pd_em'), center: v('pd_ce'), consent: v('pd_cs'), idType: v('pd_idt'), iin: v('pd_iin'), funding: v('pd_fu'), promsConsent: v('pd_pc'), vital: v('pd_vs'), deathDate: v('pd_vs') === 'умер' ? v('pd_dd') : '', data: { ...(p.data || {}), ...readForm($('#pd_extra', m)) } });
    p.ids = $('#pd_ids', m).value.split('\n').map(l => l.trim()).filter(Boolean).map(l => { const i = l.indexOf(':'); return i > 0 ? { type: l.slice(0, i).trim(), value: l.slice(i + 1).trim() } : { type: 'ID', value: l }; });
    if (!p.seq) p.seq = (await DB.all('patients')).reduce((mx, x) => Math.max(mx, x.seq || 0), 0) + 1;
    try { const saved = await DB.put('patients', p); m.close(); toast('Сохранено'); go('patient/' + saved.id); }
    catch (error) { toast(error.message, 'err'); }
  };
}

/* ---------- КАРТОЧКА ПАЦИЕНТА (на весь экран) ---------- */
Routes.patient = async (main, id) => {
  const p = await DB.get('patients', id); if (!p) return go('patients');
  if (!visibleP(p)) { main.innerHTML = '<div class="card err">Пациент другого центра: нет доступа.</div>'; return; }
  const [reg, regs, users, allEv, proms, mdts, audit, qs, allocs, trials] = await Promise.all([DB.get('registries', p.registryId), Data.registries(), Data.users(), Data.events(), DB.all('proms'), DB.all('mdt'), DB.all('audit'), DB.all('queries'), DB.all('alloc'), DB.all('trials')]);
  const ev = allEv.filter(e => e.patientId === id).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const epList = reg ? Episodes.list(reg, ev, [p]) : [];
  const epLink = epList.length > 1 ? Episodes.link(reg, ev) : new Map();
  const epNo = new Map(epList.map((e, i) => [e.id, i + 1]));
  const pr = proms.filter(x => x.patientId === id).sort((a, b) => a.due.localeCompare(b.due));
  const pm = mdts.flatMap(mt => (mt.cases || []).filter(c => c.patientId === id).map(c => ({ ...c, mt })));
  const hist = audit.filter(a => a.recId === id || ev.some(e => e.id === a.recId)).sort((a, b) => b.ts.localeCompare(a.ts));
  main.innerHTML = `<div class="pcard">
    <div class="phead"><div><a href="#patients/${p.registryId}" class="muted">← ${esc(reg?.name || 'К списку')}</a><h1><span class="pav">${esc(initials(pname(p)))}</span>${esc(pname(p))}</h1>
      <div class="pmeta"><span><b>№ ИБ</b> ${esc(p.localId)}</span><span><b>Возраст</b> ${FX.age(p.birthDate) ?? '?'} (${fmtDate(p.birthDate)})</span><span><b>Пол</b> ${esc(p.sex)}</span><span><b>Регистр</b> ${esc(reg?.name || '?')}</span>${p.center ? `<span><b>Центр</b> ${esc(p.center)}</span>` : ''}<span><b>Согласие</b> ${esc(p.consent || 'не указано')}</span>${p.iin ? `<span><b>ИИН</b> ${esc(p.iin)}</span>` : ''}${p.funding ? `<span><b>Оплата</b> ${esc(p.funding)}</span>` : ''}${p.vital === 'умер' ? `<span class="bad"><b>Умер</b> ${fmtDate(p.deathDate) || ''}</span>` : ''}${p.phone ? `<span><b>Тел.</b> ${esc(p.phone)}</span>` : ''}</div>
      ${(reg?.patientFields || []).length ? `<div class="pmeta">${reg.patientFields.map(f => `<span><b>${esc(f.label)}</b> ${showVal(f, p.data?.[f.key], users)}</span>`).join('')}</div>` : ''}</div>
      <div class="row"><button class="btn" id="pDocs">Документы</button>${can('edit') ? '<button class="btn" id="pEdit">Изменить данные</button>' : ''}${can('delete') ? '<button class="btn danger" id="pDel">Удалить</button>' : ''}</div></div>
    ${can('enter') && reg ? `<div class="addev"><button class="btn ai" id="pAI">✦ Разобрать документ (ИИ)</button><b>Добавить событие:</b> ${reg.eventTypes.map(et => { const has = et.single && ev.some(e => e.type === et.id); return `<button class="btn sm" data-add="${et.id}" ${has ? 'disabled title="Уже есть"' : ''} style="border-color:${et.color}">${esc(et.name)}</button>`; }).join('')}</div>` : ''}
    <div class="pgrid"><div class="timeline">${ev.length ? ev.map(e => {
      const et = reg && etById(reg, e.type); if (!et) return '';
      const vals = computeValues(reg, p, et, e.data, e.date); const c = completeness(et, vals);
      const shown = formFields(et).filter(f => condOK(f.showIf, vals) && !isEmpty(vals[f.key]));
      return `<div class="tl" style="--c:${et.color}"><div class="tl-dot"></div><div class="tl-body">
        <div class="row between"><div><b class="tl-t">${esc(et.name)}</b> ${epLink.has(e.id) ? `<span class="tag" title="Эпизод регистра">эпизод ${epNo.get(epLink.get(e.id))}</span> ` : ''}<span class="muted">${esc(et.dateLabel || 'Дата')}: <b>${fmtDate(e.date)}</b></span></div>
        <div class="row">${e.locked ? '<span class="tag lockt">🔒</span>' : ''}${e.verified ? '<span class="tag okt" title="Проверено с первичной документацией">✓ SDV</span>' : ''}${(() => { const n = qs.filter(q => q.eventId === e.id && q.status !== 'закрыт').length; return n ? `<span class="tag warnt">⚑ ${n}</span>` : ''; })()}${e.status === 'черновик' ? '<span class="tag warnt">черновик</span>' : ''}<span class="tag ${c.pct < 100 ? 'warnt' : 'okt'}" title="${esc(c.missing.join(', '))}">полнота ${c.pct}%</span>${can('edit') ? `<button class="btn xs" data-ed="${e.id}">Открыть</button>` : `<button class="btn xs" data-ed="${e.id}">Просмотр</button>`}</div></div>
        <div class="kv">${shown.slice(0, 14).map(f => `<div><b>${esc(f.label)}</b><span>${showVal(f, vals[f.key], users)}</span></div>`).join('')}${shown.length > 14 ? `<div class="muted">и ещё ${shown.length - 14}…</div>` : ''}</div>
        ${c.missing.length ? `<div class="miss">${formFields(et).filter(f => f.type !== 'calc' && (f.required || f.key_) && condOK(f.showIf, vals) && isEmpty(vals[f.key])).slice(0, 8).map(f => `<a href="javascript:void 0" class="tlmiss ${f.required ? 'rq' : 'ds'}" data-jmp="${e.id}|${f.key}">⚠ ${esc(f.label)}: не отвечено</a>`).join(' ')}${c.missing.length > 8 ? ` <span class="muted">и ещё ${c.missing.length - 8}</span>` : ''}</div>` : ''}</div></div>`;
    }).join('') : emptyState('Событий пока нет. Добавьте первое событие кнопками выше.')}</div>
    <div class="pside">
      <div class="card"><h3>Опросники</h3>${pr.length ? `<table class="tbl small"><tbody>${pr.map(x => `<tr><td><b>${esc(x.instrumentName)}</b><div class="muted">к ${fmtDate(x.due)}</div></td><td>${x.doneAt ? `<b>${x.score ?? ''}</b> <span class="muted">${esc(x.band || '')}</span>` : x.due < today() ? '<span class="bad">просрочен</span>' : 'ожидается'}</td><td>${!x.doneAt && can('proms') ? `<button class="btn xs" data-pf="${x.id}">Заполнить</button>` : ''}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Не назначены. Назначаются автоматически по расписанию регистра.</p>'}
        ${can('proms') && reg?.instruments?.length ? '<button class="btn xs" id="pAssign">+ Назначить вручную</button>' : ''}</div>
      ${allocs.filter(a => a.patientId === id).map(a => { const t = trials.find(x => x.id === a.trialId); return `<div class="card trialc"><h3>⚖ ${esc(t?.name || 'Исследование')}</h3><p>Группа: <b>${esc(a.arm)}</b> · рандомизирован ${fmtDate(a.date)} · № ${a.seqNo}</p><a href="#trials/${a.trialId}">Открыть исследование</a></div>`; }).join('')}
      ${(typeof modOn !== 'function' || modOn('mdt') || pm.length) ? `<div class="card"><h3>МДК</h3>${pm.length ? pm.map(c => `<div class="mdtc"><b>${fmtDate(c.mt.date)}</b> <span class="tag">${esc(c.decisionType || 'без решения')}</span><div>${esc(c.decision || '')}</div></div>`).join('') : '<p class="muted">Не обсуждался.</p>'}</div>` : ''}
      <div id="pFiles"></div>
      <div class="card"><h3>История изменений</h3><table class="tbl small"><tbody>${hist.slice(0, 12).map(a => `<tr><td class="muted">${fmtDT(a.ts)}</td><td><b>${esc(a.userName)}</b> ${esc(a.action)}${a.diff ? `<div class="muted">${esc(Object.keys(a.diff).slice(0, 4).join(', '))}</div>` : ''}</td></tr>`).join('') || '<tr><td class="muted">Пусто</td></tr>'}</tbody></table></div>
    </div></div></div>`;
  window.__PTS = await Data.patients();
  $('#pFiles').innerHTML = await PFiles.card(p, reg); PFiles.bind($('#pFiles'), p, reg);
  $('#pDocs').onclick = () => patientDocs(p, reg, ev, users, pm, pr);
  if ($('#pEdit')) $('#pEdit').onclick = () => patientDialog(p, regs);
  if ($('#pDel')) $('#pDel').onclick = async () => {
    if (!(await confirmBox(`Удалить пациента ${pname(p)} и все его события (${ev.length})? Действие попадёт в журнал аудита.`))) return;
    for (const e of ev) await DB.del('events', e.id);
    for (const x of pr) await DB.del('proms', x.id);
    await DB.del('patients', p.id); toast('Удалено'); go('patients/' + p.registryId);
  };
  if (Routes.patient.openEvent) { const oe = ev.find(x => x.id === Routes.patient.openEvent); Routes.patient.openEvent = null; if (oe) eventDialog(p, reg, oe); }
  main.onclick = (e) => {
    const jm = e.target.closest('[data-jmp]'); if (jm) { const [eid, key] = jm.dataset.jmp.split('|'); window.__evJump = key; eventDialog(p, reg, ev.find(x => x.id === eid)); return; }
    const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'pAI') AI.fullParse(reg, p);
    if (b.dataset.add) eventDialog(p, reg, { type: b.dataset.add });
    if (b.dataset.ed) eventDialog(p, reg, ev.find(x => x.id === b.dataset.ed));
    if (b.dataset.pf) Proms.fill(pr.find(x => x.id === b.dataset.pf), reg);
    if (b.id === 'pAssign') Proms.assignManual(p, reg);
  };
};

async function eventDialog(p, reg, ev) {
  const et = etById(reg, ev.type); const isNew = !ev.id; const ro = !isNew && (!can('edit') || ev.locked);
  const users = await Data.users();
  const m = modal(`<div class="row between"><div class="evhead" style="border-color:${et.color}"><h2>${esc(et.name)}</h2><div class="muted">${esc(pname(p))} · № ИБ ${esc(p.localId)}</div></div>${ro ? '' : '<button class="btn ai" id="evAI">✦ Заполнить из документа (ИИ)</button>'}</div>
    <div class="row between"><div class="fld" style="max-width:260px"><label class="flab">${esc(et.dateLabel || 'Дата')} <i class="req">*</i></label><input class="inp" type="date" id="evDate" value="${esc(ev.date || (ev.out30Due ? '' : today()))}" ${ro ? 'disabled' : ''}></div><div class="row" id="evStatus"></div></div>
    ${ev.out30Due ? `<div class="fld"><label for="evOut30Checked" class="flab">Дата проверки исхода 30 дней</label><input class="inp" type="date" id="evOut30Checked" min="${esc(ev.out30Due)}" max="${today()}" value="${esc(ev.out30CheckedOn || '')}" ${ro ? 'disabled' : ''}><span class="fhint">Укажите дату, когда проверено, что исход известен как минимум до ${fmtDate(ev.out30Due)}.</span></div>` : ''}
    ${ev.locked ? '<div class="miss">Событие заблокировано после проверки. Изменения возможны только после разблокировки руководителем (с указанием причины).</div>' : ''}
    <div id="evEp"></div><div id="evForm"></div><div id="evQA"></div>
    <div class="row between sticky-bottom"><div>${!isNew && can('delete') ? '<button class="btn danger" id="evDel">Удалить событие</button>' : ''}</div>
    <div class="row"><span class="muted" id="evErr"></span>${ro ? '' : '<button class="btn" id="evDraft">Сохранить черновик</button><button class="btn primary" id="evSave">Сохранить</button>'}</div></div>`, { full: true });
  if (!isNew && !ro && ev.status === 'завершено' && !can('users')) { const d = $('#evDate', m); d.disabled = true; d.title = 'Дату сохранённой записи меняет администратор'; d.insertAdjacentHTML('afterend', ' <a href="javascript:void 0" class="small" id="evFix">запросить исправление</a>'); setTimeout(() => { const a = $('#evFix', m); if (a) a.onclick = () => correctionDialog(p, ev); }, 0); }
  const formRoot = $('#evForm', m);
  if (ro) formRoot.dataset.ro = '1';
  /* к какому эпизоду относится событие, если у пациента их несколько */
  if (et.id !== Episodes.opener(reg)) {
    const own = (await Data.events(reg.id)).filter(e => e.patientId === p.id);
    const eps = Episodes.list(reg, own);
    const anchorIsEpisode = !ev.anchorEventId || eps.some(e => e.id === ev.anchorEventId);
    if (eps.length > 1 && anchorIsEpisode) {
      $('#evEp', m).innerHTML = `<div class="fld" style="max-width:420px"><label class="flab" for="evEpisode">Эпизод</label><select class="inp" id="evEpisode" ${ro ? 'disabled' : ''}><option value="">автоматически по дате</option>${eps.map((e, i) => `<option value="${esc(e.id)}" ${ev.anchorEventId === e.id ? 'selected' : ''}>${esc(Episodes.title(reg, e, i))}</option>`).join('')}</select><span class="fhint">У пациента несколько эпизодов. Укажите, к какому относится эта запись, если дата не даёт однозначного ответа.</span></div>`;
    }
  }
  const draftKey = ev.id || ('new-' + (ev.anchorEventId || ''));
  let read = renderEventForm(formRoot, reg, p, et, ev.data || {}, ev.date || today(), users, draftKey);
  if ($('#evAI', m)) $('#evAI', m).onclick = () => AI.dialog({ title: `${et.name} (${reg.name})`, fields: formFields(et), users, dateLabel: et.dateLabel || 'Дата', onApply: (take, date, ow) => {
    const cur = read().data; const filled = [];
    Object.entries(take).forEach(([k, v]) => { if (ow || isEmpty(cur[k])) { cur[k] = v; filled.push(k); } });
    if (date && (ow || !ev.id)) $('#evDate', m).value = date;
    read = renderEventForm(formRoot, reg, p, et, cur, $('#evDate', m).value, users, draftKey);
    read.saveAutosave?.();
    filled.forEach(k => $(`[data-wrap="${k}"]`, m)?.classList.add('ai-filled'));
    eventQA(m, p, reg, et, ev, () => App.route());
    toast(`ИИ заполнил полей: ${filled.length}. Проверьте подсвеченные.`);
  } });
  if (ro) { $('#evForm', m).dataset.ro = '1'; $$('input,select,textarea,button[data-cadd],button[data-crm],button[data-gadd],button[data-gdel]', $('#evForm', m)).forEach(x => x.disabled = true); }
  eventQA(m, p, reg, et, ev, () => App.route());
  const save = async (draft) => {
    const date = $('#evDate', m).value; if (!date) return toast('Укажите дату', 'err');
    const { data, all } = read();
    const errs = validateEvent(et, all);
    if (errs.length && !draft) { $('#evErr', m).innerHTML = `<span class="bad">${esc(errs.slice(0, 3).join('; '))}${errs.length > 3 ? ` и ещё ${errs.length - 3}` : ''}</span>`; return toast('Есть незаполненные обязательные поля. Можно сохранить как черновик.', 'err'); }
    const { out30Due, ...record } = ev;
    const check = $('#evOut30Checked', m);
    if (check?.value && (check.value < out30Due || check.value > today())) return toast('Проверьте дату подтверждения исхода', 'err');
    if (check) record.out30CheckedOn = check.value;
    const epSel = $('#evEpisode', m);
    if (epSel) { if (epSel.value) record.anchorEventId = epSel.value; else delete record.anchorEventId; }
    const obj = { ...record, patientId: p.id, registryId: reg.id, type: et.id, date, data, status: draft ? 'черновик' : 'завершено', schemaVersion: reg.version };
    try { await DB.put('events', obj); }
    catch (error) { return toast(error.message, 'err'); }
    read.clearAutosave?.();
    rememberUsers(et, data); rememberOpts(et, data);
    try { await Proms.autoSchedule(p, reg); }
    catch (error) { toast('Событие сохранено. Опросники не запланированы: ' + error.message, 'err'); }
    m.close(); toast(draft ? 'Черновик сохранён' : 'Сохранено'); App.route();
  };
  if ($('#evSave', m)) $('#evSave', m).onclick = () => save(false);
  if ($('#evDraft', m)) $('#evDraft', m).onclick = () => save(true);
  if ($('#evDel', m)) $('#evDel', m).onclick = async () => { if (await confirmBox('Удалить событие?')) { await DB.del('events', ev.id); m.close(); App.route(); } };
}

/* ---------- СЛОВАРЬ ДАННЫХ ---------- */
Routes.dictionary = async (main, regId = '') => {
  const regs = await Data.registries(); const reg = regs.find(r => r.id === regId) || regs[0];
  if (!reg) { main.innerHTML = '<div class="head"><h1>Словарь данных</h1></div>' + emptyState('Нет регистров.'); return; }
  const rows = [];
  [{ name: 'Карточка пациента', sections: [{ title: 'Базовые', fields: [F('localId', '№ ИБ'), F('lastName', 'Фамилия'), F('firstName', 'Имя'), F('birthDate', 'Дата рождения', 'date'), F('sex', 'Пол', 'select', { options: ['М', 'Ж'] }), F('consent', 'Согласие', 'select')] }, { title: 'Дополнительные', fields: reg.patientFields || [] }] }, ...reg.eventTypes]
    .forEach(et => (et.sections || []).forEach(s => (s.fields || []).forEach(f => rows.push({ form: et.name, section: s.title, key: f.key, label: f.label, type: FIELD_TYPES[f.type] || f.type, options: (f.options || []).join(' | '), unit: f.unit || '', required: f.required ? 'да' : '', level: f.required ? 'обязательное' : f.key_ ? 'желательное' : 'необязательное', cond: f.showIf?.key ? `${f.showIf.key} ${OPS[f.showIf.op]} ${f.showIf.value || ''}` : '', formula: f.formula || '', def: f.def || '' }))));
  main.innerHTML = `<div class="head"><h1>Словарь данных</h1><div class="row">${regSelect(regs, reg.id, 'regSel', false)}<button class="btn" id="dExp">CSV</button><button class="btn" id="dX">Excel</button><button class="btn" id="dOdm">CDISC ODM</button><button class="btn" id="dPrint">Печать</button></div></div>
    <p class="muted">Все переменные регистра с определениями. Именно этот документ прикладывается к протоколу и к статьям: он делает данные сопоставимыми. У обязательных и желательных полей вместо значения можно отметить причину: «неизвестно», «не применимо», «нет в документе».</p>
    <table class="tbl dict"><thead><tr><th>Форма</th><th>Переменная</th><th>Код</th><th>Тип</th><th>Варианты / единицы</th><th>Условие</th><th>Определение</th></tr></thead><tbody>${rows.map(r => `<tr><td class="muted">${esc(r.form)}<br><small>${esc(r.section)}</small></td><td><b>${esc(r.label)}</b>${r.required ? ' <i class="req">*</i>' : ''}<div class="muted small">${esc(r.level)}</div></td><td class="mono">${esc(r.key)}</td><td>${esc(r.type)}${r.formula ? `<div class="mono muted">${esc(r.formula)}</div>` : ''}</td><td>${esc(r.options)} ${esc(r.unit)}</td><td class="muted">${esc(r.cond)}</td><td>${r.def ? esc(r.def) : '<span class="muted">нет определения</span>'}</td></tr>`).join('')}</tbody></table>`;
  $('#regSel').onchange = e => go('dictionary/' + e.target.value);
  $('#dExp').onclick = () => download(slug(reg.name) + '_dictionary.csv', toCSV(rows, [{ key: 'form', label: 'Форма' }, { key: 'section', label: 'Раздел' }, { key: 'label', label: 'Переменная' }, { key: 'key', label: 'Код' }, { key: 'type', label: 'Тип' }, { key: 'options', label: 'Варианты' }, { key: 'unit', label: 'Единицы' }, { key: 'required', label: 'Обязательное' }, { key: 'cond', label: 'Условие' }, { key: 'formula', label: 'Формула' }, { key: 'def', label: 'Определение' }]), 'text/csv');
  $('#dPrint').onclick = () => window.print();
  $('#dX').onclick = () => Office.xlsx(slug(reg.name) + '_dictionary.xlsx', 'Словарь', [['Форма', 'Раздел', 'Переменная', 'Код', 'Тип', 'Варианты', 'Единицы', 'Обязательное', 'Условие', 'Формула', 'Определение'], ...rows.map(r => [r.form, r.section, r.label, r.key, r.type, r.options, r.unit, r.required, r.cond, r.formula, r.def])]);
  $('#dOdm').onclick = () => Office.odm(reg);
};

/* ---------- КАЧЕСТВО ДАННЫХ ---------- */
Routes.quality = async (main, regId = '') => {
  const [regs, patients, events, users] = await Promise.all([Data.registries(), Data.patients(), Data.events(), Data.users()]);
  const reg = regs.find(r => r.id === regId) || regs[0];
  if (!reg) { main.innerHTML = '<div class="head"><h1>Качество данных</h1></div>' + emptyState('Нет регистров.'); return; }
  const ev = events.filter(e => e.registryId === reg.id);
  const fieldStat = {}, byUser = {}, todo = [];
  ev.forEach(e => {
    const et = etById(reg, e.type); if (!et) return; const p = patients.find(x => x.id === e.patientId);
    const vals = computeValues(reg, p, et, e.data, e.date); const c = completeness(et, vals);
    formFields(et).forEach(f => { if (f.type === 'calc' || !(f.required || f.key_) || !condOK(f.showIf, vals)) return; const k = et.name + ' › ' + f.label; fieldStat[k] = fieldStat[k] || { n: 0, f: 0 }; fieldStat[k].n++; if (!isEmpty(vals[f.key])) fieldStat[k].f++; });
    const u = e.createdBy || '?'; byUser[u] = byUser[u] || { t: 0, f: 0, n: 0 }; byUser[u].t += c.total; byUser[u].f += c.filled; byUser[u].n++;
    if (c.missing.length || e.status === 'черновик') todo.push({ e, p, et, c });
  });
  const fs = Object.entries(fieldStat).map(([k, v]) => ({ k, pct: Math.round(v.f / v.n * 100), ...v })).sort((a, b) => a.pct - b.pct);
  main.innerHTML = `<div class="head"><h1>Качество данных</h1>${regSelect(regs, reg.id, 'regSel', false)}</div>
    <div class="cols"><div>
      <div class="card"><div class="row between"><h3>Выборочная проверка (SDV)</h3>${can('query') ? '<button class="btn sm" id="sdvGo">Случайная выборка 10%</button>' : ''}</div><p class="muted small">Проверено с первичной документацией: <b>${ev.filter(e => e.verified).length}</b> из ${ev.length} событий${ev.length ? ` (${Math.round(ev.filter(e => e.verified).length / ev.length * 100)}%)` : ''}. Заблокировано: ${ev.filter(e => e.locked).length}.</p><div id="sdvL"></div></div>
      <div class="card"><h3>Дозаполнить (${todo.length})</h3>${todo.length ? `<table class="tbl hover"><thead><tr><th>Пациент</th><th>Событие</th><th>Полнота</th><th>Не заполнено</th></tr></thead><tbody>${todo.sort((a, b) => a.c.pct - b.c.pct).slice(0, 200).map(t => `<tr data-id="${t.p?.id}"><td><b>${esc(t.p ? pname(t.p) : '?')}</b><div class="muted mono">${esc(t.p?.localId || '')}</div></td><td>${esc(t.et.name)}<div class="muted">${fmtDate(t.e.date)}${t.e.status === 'черновик' ? ' · черновик' : ''}</div></td><td><b>${t.c.pct}%</b></td><td class="muted">${esc(t.c.missing.slice(0, 5).join(', '))}${t.c.missing.length > 5 ? '…' : ''}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Все ключевые поля заполнены.</p>'}</div>
    </div><div>
      <div class="card"><h3>Полнота по полям</h3>${fs.length ? `<table class="tbl small"><tbody>${fs.map(x => `<tr><td>${esc(x.k)}</td><td style="width:45%"><div class="bar"><i style="width:${x.pct}%;background:${x.pct < 60 ? '#d9534f' : x.pct < 90 ? '#f0ad4e' : '#3c9d5d'}"></i><span>${x.pct}% · ${x.f}/${x.n}</span></div></td></tr>`).join('')}</tbody></table>` : '<p class="muted">Нет данных.</p>'}</div>
      <div class="card"><h3>По сотрудникам (кто вносил)</h3><table class="tbl small"><tbody>${Object.entries(byUser).map(([u, v]) => `<tr><td><b>${esc(users.find(x => x.id === u)?.name || u)}</b></td><td>${v.n} событий</td><td><b>${v.t ? Math.round(v.f / v.t * 100) : 100}%</b></td></tr>`).join('') || '<tr><td class="muted">Нет данных</td></tr>'}</tbody></table></div>
    </div></div>`;
  $('#regSel').onchange = e => go('quality/' + e.target.value);
  if ($('#sdvGo')) $('#sdvGo').onclick = () => { const pool = ev.filter(e => !e.verified); const a = new Uint32Array(pool.length); crypto.getRandomValues(a); const smp = pool.map((e, i) => [a[i], e]).sort((x, y) => x[0] - y[0]).slice(0, Math.max(1, Math.ceil(ev.length * 0.1))).map(x => x[1]);
    $('#sdvL').innerHTML = smp.length ? `<table class="tbl hover small"><tbody>${smp.map(e => { const p = patients.find(x => x.id === e.patientId); return `<tr data-id="${e.patientId}" data-ev="${e.id}"><td><b>${esc(p ? pname(p) : '?')}</b></td><td>${esc(etById(reg, e.type)?.name || '')}</td><td>${fmtDate(e.date)}</td></tr>`; }).join('')}</tbody></table><p class="muted small">Откройте событие, сверьте с первичной документацией и нажмите «✓ Проверено (SDV)».</p>` : '<p class="muted">Все события уже проверены.</p>';
    $$('#sdvL tr[data-id]').forEach(tr => tr.onclick = () => { Routes.patient.openEvent = tr.dataset.ev; go('patient/' + tr.dataset.id); }); };
  $$('tr[data-id]', main).forEach(tr => tr.onclick = () => tr.dataset.id && go('patient/' + tr.dataset.id));
};

/* ---------- ЖУРНАЛ АУДИТА ---------- */
Routes.audit = async (main) => {
  const [audit, users] = await Promise.all([DB.all('audit'), Data.users()]);
  const st = Routes.audit.st || (Routes.audit.st = { u: '', a: '', q: '' });
  main.innerHTML = `<div class="head"><h1>Журнал аудита</h1><div class="row"><select class="inp" id="au_u"><option value="">все пользователи</option>${users.map(u => `<option value="${u.id}" ${st.u === u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select>
    <select class="inp" id="au_a"><option value="">все действия</option>${[...new Set(audit.map(a => a.action))].map(a => `<option ${st.a === a ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select><input class="inp" id="au_q" placeholder="Поиск по ID записи или полю" value="${esc(st.q)}"><button class="btn" id="au_x">Экспорт CSV</button></div></div><div id="au_l"></div>`;
  const filt = () => audit.filter(a => (!st.u || a.user === st.u) && (!st.a || a.action === st.a) && (!st.q || JSON.stringify(a).toLowerCase().includes(st.q.toLowerCase()))).sort((a, b) => b.ts.localeCompare(a.ts));
  const draw = () => { const l = filt(); $('#au_l').innerHTML = `<table class="tbl small"><thead><tr><th>Время</th><th>Пользователь</th><th>Действие</th><th>Объект</th><th>Изменения</th></tr></thead><tbody>${l.slice(0, 500).map(a => `<tr><td class="nowrap">${fmtDT(a.ts)}</td><td><b>${esc(a.userName)}</b></td><td>${esc(a.action)}</td><td class="mono muted">${esc(a.store)}/${esc(a.recId || '')}</td><td>${a.diff ? Object.entries(a.diff).slice(0, 6).map(([k, [o, n]]) => `<div><b>${esc(k)}</b>: <span class="muted">${esc(typeof o === 'object' ? JSON.stringify(o) : o ?? '∅')}</span> → ${esc(typeof n === 'object' ? JSON.stringify(n) : n ?? '∅')}</div>`).join('') : ''}</td></tr>`).join('')}</tbody></table><p class="muted">${l.length} записей${l.length > 500 ? ', показаны последние 500' : ''}</p>`; };
  draw();
  $('#au_u').onchange = e => { st.u = e.target.value; draw(); }; $('#au_a').onchange = e => { st.a = e.target.value; draw(); }; $('#au_q').oninput = e => { st.q = e.target.value; draw(); };
  $('#au_x').onclick = () => download('audit_' + today() + '.csv', toCSV(filt().map(a => ({ ...a, diff: a.diff ? JSON.stringify(a.diff) : '' })), [{ key: 'ts', label: 'Время' }, { key: 'userName', label: 'Пользователь' }, { key: 'action', label: 'Действие' }, { key: 'store', label: 'Таблица' }, { key: 'recId', label: 'ID' }, { key: 'diff', label: 'Изменения' }]), 'text/csv');
};

/* ---------- ПОЛЬЗОВАТЕЛИ И НАСТРОЙКИ ---------- */
Routes.admin = async (main) => {
  const users = await Data.users();
  main.innerHTML = `<div class="head"><h1>Пользователи и настройки</h1><button class="btn primary" id="uAdd">+ Пользователь</button></div>
    <div class="card"><table class="tbl"><thead><tr><th>ФИО</th><th>Логин</th><th>Роль</th><th>Должность</th><th>Код для бенчмаркинга</th><th>Центр</th><th>Статус</th><th></th></tr></thead><tbody>${users.map(u => `<tr><td><b>${esc(u.name)}</b></td><td class="mono">${esc(u.login)}</td><td>${esc(ROLES[u.role]?.name)}</td><td>${esc(u.position || '')}</td><td class="mono">${esc(u.code || '')}</td><td>${esc(u.center || '')}</td><td>${u.active === false ? '<span class="bad">отключён</span>' : 'активен'}</td><td><button class="btn xs" data-ue="${u.id}">✎</button></td></tr>`).join('')}</tbody></table></div>
    <div class="card"><h3>Права ролей</h3><table class="tbl small"><thead><tr><th>Роль</th>${Object.values(PERM_NAMES).map(n => `<th>${n}</th>`).join('')}</tr></thead><tbody>${Object.entries(ROLES).map(([k, r]) => `<tr><td><b>${r.name}</b></td>${Object.keys(PERM_NAMES).map(p => `<td>${r.perms.includes(p) ? '✓' : ''}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <div class="card"><h3>Учреждение</h3><div class="grid"><div class="fld"><label class="flab">Учреждение</label><input class="inp" id="st_c" value="${esc(Settings.data.center || '')}"></div><div class="fld"><label class="flab">Отделение</label><input class="inp" id="st_d" value="${esc(Settings.data.department || '')}"></div>
      <div class="fld"><label class="flab">Центры (по одному в строке) для мультицентрового регистра</label><textarea class="inp" id="st_cl" rows="3">${esc(centers().join('\n'))}</textarea></div>
      <div class="fld"><label class="flab">Доступ к пациентам</label><select class="inp" id="st_sc"><option value="all">все видят всех пациентов</option><option value="own" ${Settings.data.centerScope === 'own' ? 'selected' : ''}>врачи видят только свой центр (аналитика общая, обезличенная)</option></select></div>
      <div class="fld"><label class="flab">Автовыход при бездействии (минут, 0 = выкл.)</label><input class="inp" type="number" id="st_idle" value="${esc(Settings.data.idleMinutes ?? 30)}"></div>
      <div class="fld"><label class="flab">В бенчмаркинге показывать других хирургов</label><select class="inp" id="st_a"><option value="1">под кодами</option><option value="0" ${Settings.data.anonCodes === false ? 'selected' : ''}>по именам</option></select></div></div><button class="btn" id="st_s">Сохранить</button></div>
    ${AI.settingsCard()}
    <div class="card"><h3>Резервная копия</h3><p class="muted">${typeof NET !== 'undefined' && NET.on ? 'Данные хранятся в общей базе на сервере. Копию на сервере делает IT, а эту копию можно скачать для себя.' : 'Все данные живут в этом браузере.'} Делайте резервную копию регулярно и храните её на защищённом носителе: файл содержит персональные данные пациентов.</p>
      <div class="row"><button class="btn primary" id="bk">Скачать резервную копию (JSON)</button><button class="btn" id="rs">Восстановить из копии</button><button class="btn danger" id="wipe">Стереть все данные</button></div></div>`;
  $('#uAdd').onclick = () => userDialog(null);
  $$('[data-ue]').forEach(b => b.onclick = () => userDialog(users.find(u => u.id === b.dataset.ue)));
  $('#st_s').onclick = async () => { Settings.data.center = $('#st_c').value; Settings.data.department = $('#st_d').value; Settings.data.anonCodes = $('#st_a').value === '1'; Settings.data.centers = $('#st_cl').value.split('\n').map(s => s.trim()).filter(Boolean); Settings.data.centerScope = $('#st_sc').value; Settings.data.idleMinutes = Number($('#st_idle').value || 0); await Settings.save(); toast('Сохранено'); App.boot(); };
  AI.bindSettings();
  $('#bk').onclick = () => IO.backup();
  $('#rs').onclick = () => IO.restorePicker();
  $('#wipe').onclick = async () => { if (!(await confirmBox('Стереть ВСЕ данные платформы, включая пользователей? Сначала скачайте резервную копию.'))) return; const t = await promptBox('Для подтверждения введите СТЕРЕТЬ'); if (t !== 'СТЕРЕТЬ') return; for (const s of STORES) await DB.clear(s); sessionStorage.clear(); location.hash = ''; location.reload(); };
};

function userDialog(u) {
  const isNew = !u;
  const m = modal(`<h3>${isNew ? 'Новый пользователь' : 'Пользователь'}</h3><div class="grid">
    <div class="fld"><label class="flab">ФИО</label><input class="inp" id="u_n" value="${esc(u?.name || '')}"></div>
    <div class="fld"><label class="flab">Логин</label><input class="inp" id="u_l" value="${esc(u?.login || '')}"></div>
    <div class="fld"><label class="flab">Роль</label><select class="inp" id="u_r">${Object.entries(ROLES).map(([k, r]) => `<option value="${k}" ${u?.role === k ? 'selected' : ''}>${r.name}</option>`).join('')}</select></div>
    <div class="fld"><label class="flab">Должность</label><input class="inp" id="u_p" value="${esc(u?.position || '')}"></div>
    <div class="fld"><label class="flab">Код для бенчмаркинга</label><input class="inp" id="u_c" value="${esc(u?.code || '')}" placeholder="например H03"></div>
    <div class="fld"><label class="flab">Центр</label>${centerSelect(u?.center || '', 'u_ce')}</div>
    <div class="fld"><label class="flab">${isNew ? 'Пароль' : 'Новый пароль (пусто = не менять)'}</label><input class="inp" type="password" id="u_pw"></div>
    ${isNew ? '' : `<div class="fld"><label class="flab">Статус</label><select class="inp" id="u_a"><option value="1">активен</option><option value="0" ${u.active === false ? 'selected' : ''}>отключён</option></select></div>`}
    </div><div class="row end"><button class="btn primary" id="u_ok">Сохранить</button></div>`, { wide: true });
  $('#u_ok', m).onclick = async () => {
    const v = id => $('#' + id, m).value.trim();
    if (!v('u_n') || !v('u_l')) return toast('ФИО и логин обязательны', 'err');
    const all = await Data.users(); if (all.some(x => x.login.toLowerCase() === v('u_l').toLowerCase() && x.id !== u?.id)) return toast('Такой логин уже есть', 'err');
    if (isNew) { if ($('#u_pw', m).value.length < 6) return toast('Пароль от 6 символов', 'err'); const nu = await Auth.createUser({ name: v('u_n'), login: v('u_l'), pass: $('#u_pw', m).value, role: v('u_r'), position: v('u_p'), code: v('u_c') }); nu.center = v('u_ce'); await DB.put('users', nu); }
    else {
      if (u.id === Auth.user.id && v('u_r') !== 'admin' && !all.some(x => x.id !== u.id && x.role === 'admin' && x.active !== false)) return toast('Нельзя снять роль с последнего администратора', 'err');
      Object.assign(u, { name: v('u_n'), login: v('u_l'), role: v('u_r'), position: v('u_p'), code: v('u_c'), center: v('u_ce'), active: $('#u_a', m).value === '1' });
      if ($('#u_pw', m).value) { if ($('#u_pw', m).value.length < 6) return toast('Пароль от 6 символов', 'err'); await setUserPassword(u, $('#u_pw', m).value); }
      await DB.put('users', u);
    }
    m.close(); toast('Сохранено'); App.route();
  };
}


/* ---------- документы из карточки: выписка из регистра, письмо врачу ---------- */
function printDoc(title, body) {
  const w = window.open('', '_blank');
  w.document.write(`<html><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font-family:'Times New Roman',serif;font-size:13pt;margin:2cm;line-height:1.4}h1{font-size:16pt;text-align:center}h2{font-size:13pt;margin:16px 0 4px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #000;padding:3px 6px;vertical-align:top;text-align:left;font-size:11pt}pre{white-space:pre-wrap;font-family:inherit;margin:0}.sig{margin-top:40px}</style></head><body>${body}<script>setTimeout(()=>print(),300)<\/script></body></html>`);
  w.document.close();
}
function patientDocs(p, reg, ev, users, pm, pr) {
  const head = `<div style="text-align:center">${esc(Settings.data.center || '')}<br>${esc(Settings.data.department || '')}</div>`;
  const evText = ev.map(e => { const et = etById(reg, e.type); if (!et) return ''; const v = computeValues(reg, p, et, e.data, e.date);
    return `${et.name} (${fmtDate(e.date)}): ` + formFields(et).filter(f => condOK(f.showIf, v) && !isEmpty(v[f.key])).map(f => `${f.label}: ${f.type === 'complist' ? v[f.key].map(c => `${c.name} (CD ${c.grade})`).join(', ') : f.type === 'user' ? (users.find(u => u.id === v[f.key])?.name || '') : f.type === 'date' ? fmtDate(v[f.key]) : [].concat(v[f.key]).join(', ')}${f.unit ? ' ' + f.unit : ''}`).join('; ') + '.'; }).filter(Boolean).join('\n\n');
  const letter = `Уважаемый коллега!\n\nНаправляем информацию о пациенте ${pname(p)}, ${fmtDate(p.birthDate)} г.р., № ИБ ${p.localId}.\n\n${evText}\n\n${pm.length ? 'Решение МДК от ' + fmtDate(pm[pm.length - 1].mt.date) + ': ' + (pm[pm.length - 1].decisionType || '') + '. ' + (pm[pm.length - 1].decision || '') + '\n\n' : ''}Рекомендации: \n\nС уважением,\n${Auth.user.name}${Auth.user.position ? ', ' + Auth.user.position : ''}`;
  const m = modal(`<h2>Документы</h2><div class="tabs"><a href="javascript:void 0" class="on" data-t="sum">Выписка из регистра</a><a href="javascript:void 0" data-t="let">Письмо врачу</a></div>
    <div data-p="sum"><p class="muted">Все события пациента в регистре, с осложнениями, решениями МДК и опросниками.</p><div class="row"><button class="btn primary" id="dSum">Печать / PDF</button><button class="btn" id="dSumW">Word (.docx)</button><button class="btn" id="dTpl">По шаблону…</button></div></div>
    <div data-p="let" style="display:none"><div class="fld"><label class="flab">Кому</label><input class="inp" id="dTo" placeholder="ФИО врача, организация"></div><div class="fld"><label class="flab">Текст (можно править)</label><textarea class="inp" id="dTxt" rows="16">${esc(letter)}</textarea></div><button class="btn primary" id="dLet">Печать / PDF</button></div>`, { wide: true });
  $$('[data-t]', m).forEach(a => a.onclick = () => { $$('[data-t]', m).forEach(x => x.classList.toggle('on', x === a)); $$('[data-p]', m).forEach(x => x.style.display = x.dataset.p === a.dataset.t ? '' : 'none'); });
  $('#dTpl', m).onclick = async () => { m.close(); docFromTemplate(p, reg, await Data.events(reg.id), users); };
  const sumHTML = () => `${head}<h1>Выписка из регистра «${esc(reg.name)}»</h1><p><b>Пациент:</b> ${esc(pname(p))}, ${fmtDate(p.birthDate)} г.р. (${FX.age(p.birthDate)} лет), пол ${esc(p.sex)}, № ИБ ${esc(p.localId)}</p>
    ${ev.map(e => { const et = etById(reg, e.type); if (!et) return ''; const v = computeValues(reg, p, et, e.data, e.date); return `<h2>${esc(et.name)}: ${fmtDate(e.date)}</h2><table>${formFields(et).filter(f => condOK(f.showIf, v) && !isEmpty(v[f.key])).map(f => `<tr><td style="width:40%"><b>${esc(f.label)}</b></td><td>${showVal(f, v[f.key], users).replace(/<[^>]+>/g, ' ')}</td></tr>`).join('')}</table>`; }).join('')}
    ${pm.length ? `<h2>Решения МДК</h2>${pm.map(c => `<p>${fmtDate(c.mt.date)}: ${esc(c.decisionType || '')}. ${esc(c.decision || '')}</p>`).join('')}` : ''}
    ${pr.filter(x => x.doneAt).length ? `<h2>Опросники</h2>${pr.filter(x => x.doneAt).map(x => `<p>${esc(x.instrumentName)} (${fmtDate(x.doneAt)}): ${x.score ?? ''} ${esc(x.band || '')}</p>`).join('')}` : ''}
    <p class="sig">Выписку подготовил: ${esc(Auth.user.name)} ____________ ${fmtDate(today())}</p>`;
  $('#dSum', m).onclick = () => printDoc('Выписка из регистра', sumHTML());
  $('#dSumW', m).onclick = () => Office.docx('vypiska_' + slug(p.localId) + '.docx', sumHTML());
  $('#dLet', m).insertAdjacentHTML('afterend', ' <button class="btn" id="dLetW">Word (.docx)</button>');
  $('#dLetW', m).onclick = () => Office.docx('pismo_' + slug(p.localId) + '.docx', `${head}<p style="text-align:right">${esc($('#dTo', m).value)}</p>${$('#dTxt', m).value.split('\n').map(l => `<p>${esc(l)}</p>`).join('')}<p>${fmtDate(today())} ____________</p>`);
  $('#dLet', m).onclick = () => printDoc('Письмо', `${head}<p style="text-align:right">${esc($('#dTo', m).value)}</p><pre>${esc($('#dTxt', m).value)}</pre><p class="sig">${fmtDate(today())} ____________</p>`);
}
