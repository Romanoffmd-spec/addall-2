/* AddAll 2.0: «Сводка автозаполнения». Что ИИ сам нашёл в хранилище документов, кого завёл, что заполнил и куда добавил.
   Источник: карточки и черновики с отметками aiCreated и aiAuto (их ставит фоновый разбор на сервере или учебный автопилот)
   и очередь документов, которые ИИ оставил человеку. Сводка видна на главной, в колокольчике, в брифинге и на своей странице;
   врач открывает карточку, проверяет по цитатам и сохраняет форму, после этого отметка «ждёт проверки» снимается.
   Подключается после traininbox.js, до net.js. */
'use strict';

const AIDigest = {
  DAY: 86400000,
  last: null,

  /* seed: в учебном режиме разобрать учебные документы (только со страницы сводки и из очереди документов,
     чтобы главная и колокольчик ничего не создавали сами) */
  async collect(seed = false) {
    if (seed && typeof TrainInbox === 'object' && TrainInbox.on()) { try { await TrainInbox.seed(); } catch (e) { } }
    const since = new Date(Date.now() - this.DAY).toISOString();
    const [regs, patients, events] = await Promise.all([Data.registries(), Data.patients(), Data.events()]);
    const visible = p => p && (typeof visibleP !== 'function' || visibleP(p));
    const P = new Map(patients.filter(visible).map(p => [p.id, p]));
    const R = new Map(regs.map(r => [r.id, r]));
    const auto = events.filter(e => e.aiAuto && P.has(e.patientId));
    const fresh = auto.filter(e => (e.aiAutoAt || '') >= since);
    const waiting = auto.filter(e => e.aiCheck === 'ожидает');
    const cards = new Map();
    for (const e of [...fresh, ...waiting]) {
      const p = P.get(e.patientId), reg = R.get(e.registryId);
      if (!reg) continue;
      const card = cards.get(p.id) || { p, reg, isNew: !!p.aiCreated && (p.aiAutoAt || '') >= since, forms: [], files: new Set(), waiting: 0, fresh: false };
      if (!card.forms.some(f => f.e.id === e.id)) {
        card.forms.push({ e, name: etById(reg, e.type)?.name || e.type, fields: (e.aiFields || Object.keys(e.aiEvidence || {})).length, review: e.aiCheck === 'ожидает' });
        if (e.aiCheck === 'ожидает') card.waiting++;
        if ((e.aiAutoAt || '') >= since) card.fresh = true;
      }
      if (e.intakeFile) card.files.add(e.intakeFile);
      cards.set(p.id, card);
    }
    const newCards = [...P.values()].filter(p => p.aiCreated && (p.aiAutoAt || '') >= since);
    let manual = [];
    if (typeof TrainInbox === 'object' && TrainInbox.on()) manual = (TrainInbox.state()?.items || []).filter(row => ['review', 'error'].includes(row.status));
    else if (typeof DocumentInbox === 'object' && DocumentInbox.available()) {
      try { manual = ((await NET.call('GET', 'intake?status=pending')).rows || []).filter(row => ['review', 'error'].includes(row.status)); } catch (e) { }
    }
    const list = [...cards.values()].sort((a, b) => (b.isNew - a.isNew) || (b.waiting - a.waiting) || pname(a.p).localeCompare(pname(b.p)));
    this.last = { since, cards: list, fresh, waiting, newCards, manual, regs: new Set(list.map(c => c.reg.id)).size,
      freshCards: list.filter(c => c.fresh).length, waitingCards: list.filter(c => c.waiting).length };
    return this.last;
  },

  line(d) {
    if (!d.fresh.length && !d.waiting.length && !d.manual.length) return 'За сутки новых документов в хранилище не было.';
    return `За сутки ИИ разобрал документы из хранилища: новых пациентов ${d.newCards.length}, дополнено карточек ${d.freshCards} (форм ${d.fresh.length}).`
      + ` Ждут проверки врачом: ${d.waitingCards} ${d.waitingCards === 1 ? 'карточка' : 'карточек'}.` + (d.manual.length ? ` Документов, которые ИИ не смог разобрать сам: ${d.manual.length}.` : '');
  },

  /* данные для брифинга: только числа и названия форм, без ФИО */
  brief() {
    const d = this.last;
    if (!d) return null;
    return { new_patients: d.newCards.length, cards_updated: d.freshCards, forms_added: d.fresh.length, waiting_review: d.waitingCards, documents_for_manual_review: d.manual.length };
  },

  row(c, short) {
    const forms = c.forms.map(f => `${esc(f.name)}${f.fields ? ' (' + f.fields + ' ' + (f.fields === 1 ? 'поле' : f.fields < 5 ? 'поля' : 'полей') + ')' : ''}`).join(', ');
    return `<div class="aid-row"><div class="aid-who"><a href="#patient/${esc(c.p.id)}"><b>${esc(pname(c.p))}</b></a>
      ${c.isNew ? '<span class="tag aid-new">новый пациент</span>' : ''}${c.waiting ? '<span class="tag aid-wait">ждёт проверки</span>' : '<span class="tag">проверено</span>'}
      <div class="muted small">${esc(c.reg.name)} · № ИБ ${esc(c.p.localId || '')}</div></div>
      <div class="aid-what small">${short ? '' : 'Заполнено: '}${forms}${!short && c.files.size ? '<div class="muted">Из документа: ' + esc([...c.files].join(', ')) + '</div>' : ''}</div>
      <a class="btn xs ${c.waiting ? 'primary' : ''}" href="#patient/${esc(c.p.id)}">${c.waiting ? 'Проверить' : 'Открыть'}</a></div>`;
  },

  panel(d) {
    const top = d.cards.slice(0, 5);
    return `<div class="panel wide aid-panel" id="aiDigest"><div class="ph"><h2>✦ Сводка автозаполнения</h2><span class="muted">хранилище документов</span><a class="r" href="#aidigest">Вся сводка</a></div>
      <p class="aid-line">${esc(this.line(d))}</p>
      ${top.length ? top.map(c => this.row(c, true)).join('') : ''}
      ${d.cards.length > 5 ? `<a class="btn sm" href="#aidigest">Ещё ${d.cards.length - 5}</a>` : ''}
      ${d.manual.length ? `<a class="btn sm" href="#inbox">Документы для ручного разбора: ${d.manual.length}</a>` : ''}</div>`;
  }
};

Routes.aidigest = async main => {
  const d = await AIDigest.collect(true);
  const fresh = d.cards.filter(c => c.fresh), older = d.cards.filter(c => !c.fresh && c.waiting);
  main.innerHTML = `<div class="head"><h1>Сводка автозаполнения</h1><button class="btn" id="aidRefresh">Обновить</button></div>
    <div class="card"><p>${esc(AIDigest.line(d))}</p>
    <p class="muted small">Каждую ночь и в течение дня ИИ читает новые документы из общих папок больницы: находит пациента по № ИБ, если его нет, заводит карточку, решает, к каким регистрам относится документ, и заполняет формы черновиками. Каждое значение подтверждено дословной цитатой из документа. Черновики не попадают в аналитику и отчёты, пока врач их не проверит: откройте карточку, сверьте значения по цитатам и сохраните форму.</p></div>
    <div class="card" id="aidFresh"><h2>Добавлено за последние 24 часа</h2>${fresh.length ? fresh.map(c => AIDigest.row(c)).join('') : '<p class="muted">Новых записей нет.</p>'}</div>
    ${older.length ? `<div class="card"><h2>Ещё ждут проверки</h2>${older.map(c => AIDigest.row(c)).join('')}</div>` : ''}
    ${d.manual.length ? `<div class="card" id="aidManual"><h2>ИИ не смог разобрать сам</h2><p class="muted small">Например, в документе нет № ИБ или фамилии, или в регистре несколько похожих карточек. Их разбирает координатор.</p>
      <ul>${d.manual.map(row => `<li>${esc(row.filename)} · ${esc(row.autoNote || row.error || 'нужна проверка')}</li>`).join('')}</ul><a class="btn primary sm" href="#inbox">Открыть очередь документов</a></div>` : ''}`;
  $('#aidRefresh', main).onclick = () => Routes.aidigest(main);
};
ROUTE_GROUP.aidigest = 'Работа';
NAV_ICONS.aidigest = NAV_ICONS.aidigest || '✦';

/* меню «Работа»: сразу после «Документы из хранилища» или в начале */
{
  const previous = navGroups;
  navGroups = async function () {
    const groups = await previous();
    const work = groups.find(g => g.id === 'work');
    if (work?.items && can('enter') && !work.items.some(x => x.r === 'aidigest')) {
      const at = work.items.findIndex(x => x.r === 'inbox');
      work.items.splice(at < 0 ? 0 : at + 1, 0, { r: 'aidigest', t: 'Сводка автозаполнения', i: '✦' });
    }
    /* простое меню врача прячет «Науку»; аналитику (χ², Каплан-Мейер) оставляем в «Работе» */
    if (work?.items && typeof SimpleNav === 'object' && SimpleNav.on() && can('analyse') && !work.items.some(x => x.r === 'analytics')) {
      const sep = work.items.findIndex(x => x.sep !== undefined);
      work.items.splice(sep < 0 ? work.items.length : sep, 0, { r: 'analytics', t: 'Аналитика', i: '◭' });
    }
    return groups;
  };
}
if (typeof SimpleNav === 'object' && !SimpleNav.WORK.includes('aidigest')) SimpleNav.WORK.unshift('aidigest');

/* главная: блок сразу под шапкой */
{
  const home = Routes.home;
  Routes.home = async (main, ...rest) => {
    const hash = location.hash;
    await home(main, ...rest);
    if (!can('enter') || $('#aiDigest', main)) return;
    const d = await AIDigest.collect();
    if (location.hash !== hash) return;
    if (!d.cards.length && !d.manual.length && !(typeof TrainInbox === 'object' && TrainInbox.on())) return;
    const dash = $('.dash', main), hero = $('.hero', main), html = AIDigest.panel(d);
    if (dash) dash.insertAdjacentHTML('afterbegin', html);
    else if (hero) hero.insertAdjacentHTML('afterend', html);
    else main.insertAdjacentHTML('afterbegin', html);
  };
}

/* колокольчик */
{
  const items = Bell.items.bind(Bell);
  Bell.items = async function () {
    const out = await items();
    try {
      const d = AIDigest.last && Date.now() - Date.parse(AIDigest.last.at || 0) < 60000 ? AIDigest.last : await AIDigest.collect();
      d.at = d.at || nowISO();
      if (d.waitingCards) out.unshift({ k: 'due', t: `Сводка автозаполнения: ${d.waitingCards} ${d.waitingCards === 1 ? 'карточка ждёт' : 'карточек ждут'} проверки`, s: `новых пациентов ${d.newCards.length}, форм ${d.fresh.length}`, r: 'aidigest' });
      if (d.manual.length) out.unshift({ k: 'warn', t: `Документы для ручного разбора: ${d.manual.length}`, s: 'ИИ не смог разобрать их сам', r: 'inbox' });
    } catch (e) { }
    return out;
  };
}

/* карточка пациента: что сделал ИИ и что проверить */
{
  const patient = Routes.patient;
  Routes.patient = async (main, id, ...rest) => {
    const hash = location.hash;
    await patient(main, id, ...rest);
    const p = await DB.get('patients', id);
    if (!p) return;
    const events = (await Data.events(p.registryId)).filter(e => e.patientId === id && e.aiAuto && e.aiCheck === 'ожидает');
    if (location.hash !== hash || $('#aidReview', main)) return;
    const created = p.aiCreated && p.aiCheck === 'ожидает';
    if (!events.length && !created) return;
    const reg = await DB.get('registries', p.registryId);
    if (location.hash !== hash || $('#aidReview', main)) return;
    const box = document.createElement('div');
    box.className = 'card aid-review';
    box.id = 'aidReview';
    box.innerHTML = `<h3>✦ Заполнено ИИ из хранилища документов</h3>
      ${created ? `<p>Карточку создал ИИ из документа «${esc(p.intakeFile || 'документ')}». Проверьте № ИБ, ФИО, дату рождения и пол.</p><div class="row"><button class="btn sm" id="aidPatientOk">Данные карточки верны</button></div>` : ''}
      ${events.length ? `<p>Черновики ждут проверки. Откройте форму: у каждого значения есть цитата из документа. После сохранения отметка снимется.</p>
      <ul>${events.map(e => `<li><a href="javascript:void 0" data-aid-ev="${esc(e.id)}">${esc(etById(reg, e.type)?.name || e.type)} от ${fmtDate(e.date)}</a> · ${(e.aiFields || []).length} полей · ${esc(e.intakeFile || '')}</li>`).join('')}</ul>` : ''}`;
    const head = $('.phead', main) || $('.head', main);
    if (head) head.insertAdjacentElement('afterend', box); else main.prepend(box);
    const ok = $('#aidPatientOk', box);
    if (ok) ok.onclick = async () => {
      const fresh = await DB.get('patients', id);
      await DB.put('patients', { ...fresh, aiCheck: 'проверено', aiCheckedBy: Auth.user.id, aiCheckedAt: nowISO() }, 'карточка, созданная ИИ, проверена');
      toast('Отмечено: карточка проверена');
      App.route();
    };
    $$('[data-aid-ev]', box).forEach(a => a.onclick = async () => {
      const ev = await DB.get('events', a.dataset.aidEv);
      if (ev && typeof eventDialog === 'function') eventDialog(p, reg, ev);
      else $(`[data-ev="${a.dataset.aidEv}"]`, main)?.click();
    });
  };
}

/* ссылки на статистику там, где её ищут: «Экспорт моих данных» и «Импорт и экспорт» */
AIDigest.statsCard = () => `<div class="card aid-stats" id="statsLinks"><h3>Нужна статистика или выгрузка для статистической программы?</h3>
  <p class="muted">χ², точный критерий Фишера, выживаемость по Каплану-Майеру с лог-ранговым критерием, динамика по месяцам, CUSUM и funnel plot считаются прямо в AddAll, в разделе «Аналитика». Файлы для SPSS, Stata, R, SAS, REDCap и CDISC ODM с метками переменных собираются в «Выгрузке регистра».</p>
  <div class="row">${can('analyse') ? '<a class="btn primary" href="#analytics">Аналитика: χ², Фишер, Каплан-Мейер</a>' : ''}${can('export') ? '<a class="btn" href="#registry-export">Выгрузка для SPSS, Stata, R, REDCap</a>' : ''}</div></div>`;
for (const name of ['mydata', 'io']) {
  const route = Routes[name];
  if (typeof route !== 'function') continue;
  Routes[name] = async (main, ...rest) => {
    await route(main, ...rest);
    if ((can('analyse') || can('export')) && !$('#statsLinks', main)) {
      const head = $('.head', main);
      if (head) head.insertAdjacentHTML('afterend', AIDigest.statsCard()); else main.insertAdjacentHTML('afterbegin', AIDigest.statsCard());
    }
  };
}
