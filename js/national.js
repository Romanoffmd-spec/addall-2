/* AddAll: функции национального уровня.
   1. Сравнение учреждений и врачей с поправкой на надёжность (малые объёмы).
   2. Паспорт регистра: ответственные, цель, правовое основание, автоматический чек-лист готовности.
   3. Публичная страница из официального выпуска периода: обезличенно, с порогом малых групп.
   4. Сведения о смерти из внешнего списка (ИИН или № ИБ и дата смерти).
   Подключается после training.js, до net.js. */
'use strict';

/* ---------- поправка на надёжность ----------
   Эмпирическая байесовская оценка доли по учреждению (врачу):
     скорректированная доля = R × наблюдаемая + (1 - R) × общая доля,
     R = s² / (s² + p(1 - p) / n),
   где p это общая доля по всем единицам, n это число случаев у единицы, s² это дисперсия истинных долей между единицами.
   s² оценивается методом моментов (дисперсионный анализ для биномиальных данных):
     s² = max(0, [Σ nᵢ(pᵢ - p)² - (k - 1) p(1 - p)] / [N - Σ nᵢ² / N]).
   Источники: Dimick JB, Staiger DO, Birkmeyer JD. Ranking hospitals on surgical mortality: the importance of
   reliability adjustment. Health Serv Res 2010;45(6 Pt 1):1614-29. Fleiss JL, Levin B, Paik MC. Statistical
   Methods for Rates and Proportions, 3rd ed., 2003, разд. 15 (оценка межкластерной дисперсии для долей). */
const Reliability = {
  adjust(units) {
    const rows = units.filter(u => u.den > 0);
    const N = rows.reduce((s, u) => s + u.den, 0), X = rows.reduce((s, u) => s + u.num, 0), k = rows.length;
    if (!N) return { mean: null, s2: null, rows: units.map(u => ({ ...u, obs: null, R: null, adj: null })) };
    const p = X / N, pq = p * (1 - p);
    let s2 = null;
    if (k >= 2) {
      const S = rows.reduce((s, u) => s + u.den * (u.num / u.den - p) ** 2, 0);
      const D = N - rows.reduce((s, u) => s + u.den * u.den, 0) / N;
      s2 = D > 0 ? Math.max(0, (S - (k - 1) * pq) / D) : 0;
    }
    return { mean: p, s2, rows: units.map(u => {
      if (!u.den) return { ...u, obs: null, R: null, adj: null };
      const obs = u.num / u.den;
      if (s2 == null) return { ...u, obs, R: null, adj: null };
      const R = pq === 0 ? 0 : s2 / (s2 + pq / u.den);
      return { ...u, obs, R, adj: R * obs + (1 - R) * p };
    }) };
  }
};

const National = {
  pct: v => v == null ? '' : (Math.round(v * 1000) / 10).toLocaleString('ru-RU'),
  minCell: reg => Math.max(1, Number(reg?.passport?.minCell) || 10),
  /* показатели, у которых результат это доля (числитель из знаменателя) */
  props: reg => (reg.indicators || []).filter(i => !i.kind || i.kind === 'proportion'),
  centers: async reg => [...new Set([...(Settings.data.centers || []), ...(await Data.patients(reg.id)).map(p => p.center),
    ...(await Data.events(reg.id)).map(e => e.episodeCenter)].filter(Boolean))].sort(),
  /* таблица сравнения: наблюдаемая доля, 95% ДИ Уилсона, надёжность и скорректированная доля */
  table(units, label, small) {
    const adj = Reliability.adjust(units);
    const f = National.pct;
    const head = `<tr><th>${esc(label)}</th><th>Случаев</th><th>Событий</th><th>Наблюдаемая доля</th><th>95% ДИ</th><th>Надёжность</th><th>С поправкой на надёжность</th></tr>`;
    const body = adj.rows.sort((a, b) => (b.den || 0) - (a.den || 0)).map(u => {
      const ci = u.den ? Stats.wilson(u.num, u.den) : null;
      return `<tr class="${u.den && u.den < small ? 'muted' : ''}"><td><b>${esc(u.name)}</b>${u.den && u.den < small ? ' <span class="tag warnt">мало случаев</span>' : ''}</td><td>${u.den}</td><td>${u.num}</td>
        <td>${u.obs == null ? 'нет данных' : f(u.obs) + '%'}</td><td>${ci ? f(ci.lo) + '-' + f(ci.hi) + '%' : ''}</td>
        <td>${u.R == null ? '' : (Math.round(u.R * 100) / 100).toLocaleString('ru-RU')}</td><td><b>${u.adj == null ? '' : f(u.adj) + '%'}</b></td></tr>`;
    }).join('');
    const note = adj.mean == null ? '' : adj.s2 == null ? 'Для поправки нужно хотя бы две единицы с данными.'
      : adj.s2 === 0 ? `Общая доля ${f(adj.mean)}%. Различия между единицами не превышают ожидаемых случайных колебаний, поэтому все оценки с поправкой равны общей доле.`
        : `Общая доля ${f(adj.mean)}%. Чем меньше случаев, тем ниже надёжность и тем сильнее оценка сдвигается к общей доле.`;
    return `<table class="tbl">${head}<tbody>${body}</tbody></table><p class="muted small">${note}</p>`;
  }
};

/* ---------- 1. сравнение учреждений и врачей ---------- */
Routes.compare = async (main, regId = '') => {
  const regs = await Data.registries();
  const reg = regs.find(r => r.id === regId) || regs[0];
  if (!reg) { main.innerHTML = '<div class="head"><h1>Сравнение учреждений и врачей</h1></div>' + emptyState('Нет регистров.'); return; }
  const st = (Routes.compare.st ||= {});
  const y = String(Number(today().slice(0, 4)) - 1);
  const filter = st[reg.id] ||= { from: y + '-01-01', to: y + '-12-31', ind: '' };
  const inds = National.props(reg);
  if (!inds.some(i => i.id === filter.ind)) filter.ind = inds[0]?.id || '';
  main.innerHTML = `<div class="head"><h1>Сравнение учреждений и врачей</h1>${regSelect(regs, reg.id, 'cmReg', false)}</div>
    <div class="card"><p>Доля осложнений у учреждения с 8 операциями может оказаться и 0%, и 25% просто случайно. Поэтому рядом с наблюдаемой долей показана оценка с поправкой на надёжность: чем меньше случаев, тем сильнее она сдвигается к общей доле. Так малые учреждения не попадают в «лучшие» и «худшие» из-за случайности.</p>
      <div class="grid"><div class="fld"><label class="flab" for="cmFrom">Начало периода</label><input class="inp" type="date" id="cmFrom" value="${esc(filter.from)}"></div>
        <div class="fld"><label class="flab" for="cmTo">Конец периода</label><input class="inp" type="date" id="cmTo" value="${esc(filter.to)}"></div>
        <div class="fld"><label class="flab" for="cmInd">Показатель</label><select class="inp" id="cmInd">${inds.map(i => `<option value="${esc(i.id)}" ${i.id === filter.ind ? 'selected' : ''}>${esc(i.name)}</option>`).join('')}</select></div></div></div>
    <div class="card" id="cmCenters"></div><div class="card" id="cmDocs"></div>
    <div class="card"><h2>Как считается</h2><p class="small">Скорректированная доля = R × наблюдаемая доля + (1 - R) × общая доля. Надёжность R = s² / (s² + p(1 - p) / n): n это число случаев, p это общая доля, s² это разброс истинных долей между единицами, оценённый методом моментов. Метод: Dimick, Staiger, Birkmeyer, Health Services Research, 2010. Поправка на тяжесть пациентов (модель риска) это отдельный шаг, он показан в аналитике и в funnel plot.</p></div>`;
  $('#cmReg', main).onchange = e => go('compare/' + e.target.value);
  for (const [id, k] of [['cmFrom', 'from'], ['cmTo', 'to'], ['cmInd', 'ind']]) $('#' + id, main).onchange = e => { filter[k] = e.target.value; draw(); };
  let seq = 0;
  const draw = async () => {
    const my = ++seq, boxC = $('#cmCenters', main), boxD = $('#cmDocs', main);
    if (!boxC) return;
    const stale = () => my !== seq || !boxC.isConnected;
    const ind = inds.find(i => i.id === filter.ind);
    if (!ind) { boxC.innerHTML = '<p class="muted">В регистре нет показателей вида «доля». Задайте их в конструкторе регистра.</p>'; boxD.innerHTML = ''; return; }
    if (!filter.from || !filter.to || filter.from > filter.to) { boxC.innerHTML = '<p class="bad">Проверьте границы периода.</p>'; boxD.innerHTML = ''; return; }
    boxC.innerHTML = '<p class="muted">Считаю…</p>'; boxD.innerHTML = '';
    const small = National.minCell(reg);
    const base = { from: filter.from, to: filter.to, eventType: Episodes.opener(reg) };
    const centers = await National.centers(reg);
    const units = [];
    for (const center of centers) {
      const d = await Period.collect(reg, { ...base, center });
      if (stale()) return;
      const r = d.results.find(x => x.id === ind.id);
      if (r && r.den) units.push({ name: center, num: r.num, den: r.den });
    }
    if (stale()) return;
    boxC.innerHTML = `<h2>Учреждения</h2>${units.length ? National.table(units, 'Учреждение', small) : '<p class="muted">За период нет случаев с указанным учреждением.</p>'}`;
    /* врачи: только если у формы показателя есть поле «врач» и форма не заполняется по сроку после эпизода */
    const et = etById(reg, ind.et), uf = formFields(et || {}).find(f => f.type === 'user');
    if (!uf) { boxD.innerHTML = '<h2>Врачи</h2><p class="muted">В форме показателя нет поля с выбором врача.</p>'; return; }
    if (Episodes.rule(et)) { boxD.innerHTML = '<h2>Врачи</h2><p class="muted">Показатель считается по форме со сроком наблюдения. Сравнение врачей для таких показателей пока не делается, чтобы не исказить полноту.</p>'; return; }
    const all = await Period.collect(reg, base);
    if (stale()) return;
    const users = await Data.users(), anon = Settings.data.anonCodes !== false;
    const ids = [...new Set(all.cohortEvents.filter(e => e.type === ind.et).map(e => e.data?.[uf.key]).filter(Boolean))];
    const docs = ids.map(id => {
      const sev = all.cohortEvents.filter(e => e.type === ind.et && e.data?.[uf.key] === id);
      const x = evalIndicator(ind, sev, all.patients, reg);
      const u = users.find(v => v.id === id);
      return { name: anon ? (u?.code || 'без кода') : (u?.name || '?'), num: x.num || 0, den: x.den || 0 };
    }).filter(u => u.den);
    boxD.innerHTML = `<h2>Врачи</h2>${anon ? '<p class="muted small">Врачи показаны под кодами бенчмаркинга.</p>' : ''}${docs.length ? National.table(docs, 'Врач', small) : '<p class="muted">Нет данных.</p>'}`;
  };
  draw();
};

/* ---------- 2. паспорт регистра ---------- */
National.checks = async reg => {
  const [patients, recon, releases, queries] = await Promise.all([Data.patients(reg.id), DB.all('recon'), DB.all('releases'), DB.all('queries')]);
  const ps = reg.passport || {};
  const fields = (reg.eventTypes || []).flatMap(et => formFields(et)).filter(f => f.type !== 'calc');
  const withDef = fields.filter(f => String(f.def || '').trim()).length;
  const defPct = fields.length ? Math.round(withDef / fields.length * 100) : 0;
  const consentKnown = patients.filter(p => ['получено', 'не требуется'].includes(p.consent)).length;
  const consentNo = patients.filter(p => p.consent === 'не получено').length;
  const official = releases.filter(r => r.registryId === reg.id && r.kind === 'official');
  const runs = recon.filter(r => r.registryId === reg.id);
  const openQ = queries.filter(q => q.registryId === reg.id && q.status !== 'закрыт').length;
  const net = typeof NET !== 'undefined' && NET.on, cloud = typeof FIRE !== 'undefined' && FIRE.on;
  return [
    { ok: !!(ps.owner && ps.custodian), t: 'Назначены владелец данных и ответственный за регистр', d: ps.owner && ps.custodian ? `${ps.owner}; ${ps.custodian}` : 'заполните в паспорте' },
    { ok: !!(ps.purpose && ps.legal && ps.inclusion), t: 'Описаны цель, правовое основание и критерии включения', d: [ps.purpose ? '' : 'цель', ps.legal ? '' : 'правовое основание', ps.inclusion ? '' : 'критерии включения'].filter(Boolean).join(', ') ? 'не хватает: ' + [ps.purpose ? '' : 'цель', ps.legal ? '' : 'правовое основание', ps.inclusion ? '' : 'критерии включения'].filter(Boolean).join(', ') : 'есть' },
    { ok: defPct >= 80, t: 'Словарь данных: у полей есть определения', d: `${withDef} из ${fields.length} полей (${defPct}%), нужно не меньше 80%` },
    { ok: !!(reg.indicators || []).length, t: 'Заданы показатели качества с определениями', d: `показателей: ${(reg.indicators || []).length}` },
    { ok: !!Episodes.expected(reg).length || Episodes.isPatient(reg), t: 'Для наблюдения заданы сроки ожидаемых форм', d: Episodes.expected(reg).map(et => et.name).join(', ') || 'сроки не заданы' },
    { ok: !!runs.length, t: 'Проводилась сверка с независимым списком (охват)', d: runs.length ? `сверок: ${runs.length}` : 'сверок нет: экран «Охват регистра»' },
    { ok: !openQ, t: 'Нет открытых запросов по данным', d: `открытых: ${openQ}` },
    { ok: !!official.length, t: 'Выпускался официальный отчёт за период', d: official.length ? `последний: ${fmtDate(official.map(r => r.acceptedAt).sort().pop())}` : 'нет: экран «Отчётный период»' },
    { ok: !patients.length || consentKnown + consentNo === patients.length, t: 'У каждого пациента отмечено согласие', d: `получено или не требуется: ${consentKnown}, не получено: ${consentNo}, не отмечено: ${patients.length - consentKnown - consentNo}` },
    { ok: net && !cloud && ps.storage === 'rk', t: 'Данные хранятся на сервере в Казахстане', d: cloud ? 'сейчас облачная демо-версия за пределами РК: только вымышленные или обезличенные данные' : net ? (ps.storage === 'rk' ? 'сервер в РК' : 'укажите в паспорте место размещения сервера') : 'сейчас данные хранятся только в этом браузере' }
  ];
};

Routes.passport = async (main, regId = '') => {
  const regs = await Data.registries();
  const reg = regs.find(r => r.id === regId) || regs[0];
  if (!reg) { main.innerHTML = '<div class="head"><h1>Паспорт регистра</h1></div>' + emptyState('Нет регистров.'); return; }
  const ps = reg.passport || {};
  const edit = regManage(reg);
  const checks = await National.checks(reg);
  const allReleases = (await DB.all('releases')).filter(r => r.registryId === reg.id).sort((a, b) => String(b.acceptedAt).localeCompare(String(a.acceptedAt)));
  const releases = allReleases.filter(r => r.kind === 'official');
  const fld = (id, label, val, hint = '', rows = 0) => `<div class="fld"><label class="flab" for="ps_${id}">${label}</label>${rows ? `<textarea class="inp" id="ps_${id}" rows="${rows}" ${edit ? '' : 'disabled'}>${esc(val || '')}</textarea>` : `<input class="inp" id="ps_${id}" value="${esc(val || '')}" ${edit ? '' : 'disabled'}>`}${hint ? `<div class="help">${hint}</div>` : ''}</div>`;
  const done = checks.filter(c => c.ok).length;
  main.innerHTML = `<div class="head"><h1>Паспорт регистра</h1>${regSelect(regs, reg.id, 'psReg', false)}</div>
    <div class="card" id="psChecks"><h2>Готовность регистра: ${done} из ${checks.length}</h2>
      <p class="muted small">Чек-лист составлен по мотивам австралийского стандарта качества клинических регистров (ACSQHC, 2024) и руководства AHRQ «Registries for Evaluating Patient Outcomes». Пункты проверяются автоматически по данным регистра.</p>
      <ul class="pr-checks">${checks.map(c => `<li class="${c.ok ? 'okt' : 'warnt'}">${c.ok ? '✓' : '!'} <b>${esc(c.t)}</b><br><span class="small">${esc(c.d)}</span></li>`).join('')}</ul></div>
    <div class="card" id="psForm"><h2>Управление и описание</h2>
      <div class="grid">${fld('owner', 'Владелец данных (учреждение)', ps.owner)}${fld('custodian', 'Ответственный за регистр (ФИО, должность)', ps.custodian)}
        ${fld('contact', 'Контакт для вопросов', ps.contact)}${fld('council', 'Совет регистра (врачи, статистик, представитель пациентов)', ps.council)}</div>
      ${fld('purpose', 'Цель регистра', ps.purpose, 'Например: аудит результатов хирургии рака прямой кишки в учреждениях-участниках.', 2)}
      ${fld('legal', 'Правовое основание обработки данных', ps.legal, 'Приказ, договор между учреждениями, решение этического комитета, согласие пациента.', 2)}
      ${fld('inclusion', 'Критерии включения и исключения', ps.inclusion, '', 3)}
      <div class="grid"><div class="fld"><label class="flab" for="ps_storage">Где размещены данные</label><select class="inp" id="ps_storage" ${edit ? '' : 'disabled'}>${[['', 'не указано'], ['rk', 'сервер на территории Казахстана'], ['local', 'компьютер учреждения'], ['demo', 'демо-версия, только вымышленные данные']].map(([v, t]) => `<option value="${v}" ${ps.storage === v ? 'selected' : ''}>${t}</option>`).join('')}</select><div class="help">Закон РК «О персональных данных и их защите» требует хранить персональные данные в базе на территории Казахстана.</div></div>
        <div class="fld"><label class="flab" for="ps_minCell">Порог малых групп</label><input class="inp" type="number" min="1" id="ps_minCell" value="${esc(ps.minCell || 10)}" ${edit ? '' : 'disabled'}><div class="help">Меньше этого числа случаев: в публичной странице цифры скрываются, в сравнении строка отмечается «мало случаев».</div></div>
        <div class="fld"><label class="flab" for="ps_names">Учреждения на публичной странице</label><select class="inp" id="ps_names" ${edit ? '' : 'disabled'}><option value="codes" ${ps.names !== 'named' ? 'selected' : ''}>под кодами (Учреждение 1, 2…)</option><option value="named" ${ps.names === 'named' ? 'selected' : ''}>по названиям</option></select></div></div>
      ${edit ? '<div class="row end"><button class="btn primary" id="psSave">Сохранить паспорт</button></div>' : '<p class="muted small">Изменять паспорт может руководитель регистра или администратор.</p>'}</div>
    <div class="card" id="psPublic"><h2>Публичная страница</h2>
      <p>Страница результатов для публикации: на сайте учреждения, профессионального общества или для внешней экспертизы. Собирается только из официального выпуска периода: цифры не меняются после выпуска. Пациентов и их данных на странице нет. Группы меньше порога скрываются. Для каждого учреждения показана доля с поправкой на надёжность.</p>
      ${releases.length ? `<div class="row"><select class="inp" id="psRel">${releases.map(r => `<option value="${esc(r.id)}">${fmtDate(r.from)} - ${fmtDate(r.to)}${r.center ? ', ' + esc(r.center) : ''} · версия ${r.version}</option>`).join('')}</select><button class="btn" id="psPub">Скачать страницу (HTML)</button></div>` : '<p class="muted">Официальных выпусков пока нет. Выпустите отчёт на экране «Отчётный период».</p>'}</div>
    <div class="card" id="psRecord"><h2>Описание данных для статьи (RECORD)</h2>
      <p>Черновик раздела «Методы» для публикации на данных регистра по пунктам чек-листа RECORD (Benchimol и соавт., PLoS Med 2015): источник данных, отбор случаев, коды и определения, качество и полнота, связывание с другими базами, ограничения. Собирается из паспорта, словаря и выпуска за период. Проверьте и допишите текст перед подачей.</p>
      ${allReleases.length ? `<div class="row"><select class="inp" id="psRecRel">${allReleases.map(r => `<option value="${esc(r.id)}">${fmtDate(r.from)} - ${fmtDate(r.to)}${r.center ? ', ' + esc(r.center) : ''} · версия ${r.version} · ${r.kind === 'official' ? 'официальный' : 'внутренний'}</option>`).join('')}</select><button class="btn" id="psRec">Скачать описание (Markdown)</button></div>` : '<p class="muted">Нужен хотя бы один выпуск за период.</p>'}</div>`;
  $('#psReg', main).onchange = e => go('passport/' + e.target.value);
  const save = $('#psSave', main);
  if (save) save.onclick = async () => {
    const v = id => $('#ps_' + id, main).value.trim();
    reg.passport = { ...ps, owner: v('owner'), custodian: v('custodian'), contact: v('contact'), council: v('council'), purpose: v('purpose'), legal: v('legal'),
      inclusion: v('inclusion'), storage: v('storage'), minCell: Math.max(1, Math.round(Number(v('minCell')) || 10)), names: v('names'), updatedAt: nowISO(), updatedBy: Auth.user.name };
    try { await DB.put('registries', reg, 'паспорт регистра'); toast('Паспорт сохранён'); App.route(); } catch (e) { toast(e.message, 'err'); }
  };
  const rec = $('#psRec', main);
  if (rec) rec.onclick = async () => {
    const r = allReleases.find(x => x.id === $('#psRecRel', main).value);
    if (!r) return;
    download(`${slug(reg.name)}_${r.from}_${r.to}_v${r.version}_RECORD.md`, await National.recordText(reg, r), 'text/markdown');
    Audit.log('описание данных RECORD из выпуска', 'releases', r.id, null, null);
  };
  const pub = $('#psPub', main);
  if (pub) pub.onclick = () => {
    const r = releases.find(x => x.id === $('#psRel', main).value);
    if (!r) return;
    download(`${slug(reg.name)}_${r.from}_${r.to}_v${r.version}_public.html`, National.publicHtml(reg, r), 'text/html');
    Audit.log('публичная страница из выпуска', 'releases', r.id, null, null);
  };
};

/* ---------- 3. публичная страница из официального выпуска ---------- */
National.publicHtml = (reg, r) => {
  const ps = reg.passport || {}, small = National.minCell(reg), f = National.pct;
  const e = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const d = s => s ? String(s).slice(0, 10).split('-').reverse().join('.') : '';
  const code = new Map((r.byCenter || []).map((c, i) => [c.center, ps.names === 'named' ? c.center : 'Учреждение ' + (i + 1)]));
  const value = x => x.kind ? (typeof RegistryMeasure === 'object' ? RegistryMeasure.summary(x, v => v == null ? 'нет' : String(v).replace('.', ',')) : '') : x.den ? f(x.num / x.den) + '%' : 'нет данных';
  const national = (r.results || []).map(x => {
    const hide = !x.kind && x.den < small, ci = !x.kind && x.den ? Stats.wilson(x.num, x.den) : null;
    return `<tr><td>${e(x.name)}</td><td><b>${hide ? 'менее ' + small + ' случаев' : e(value(x))}</b></td><td>${hide || !ci ? '' : f(ci.lo) + '-' + f(ci.hi) + '%'}</td><td>${hide ? '' : x.den}</td></tr>`;
  }).join('');
  const byInd = (r.byCenter || []).length ? (r.definitions || []).filter(i => !i.kind || i.kind === 'proportion').map(ind => {
    const units = r.byCenter.map(c => { const x = (c.results || []).find(y => y.id === ind.id); return { name: code.get(c.center), num: x?.num || 0, den: x?.den || 0 }; });
    const adj = Reliability.adjust(units);
    const rows = adj.rows.filter(u => u.den).sort((a, b) => String(a.name).localeCompare(String(b.name), 'ru')).map(u => u.den < small
      ? `<tr><td>${e(u.name)}</td><td colspan="4">менее ${small} случаев, цифры не показываются</td></tr>`
      : `<tr><td>${e(u.name)}</td><td>${u.den}</td><td>${f(u.obs)}%</td><td>${(() => { const ci = Stats.wilson(u.num, u.den); return f(ci.lo) + '-' + f(ci.hi) + '%'; })()}</td><td><b>${u.adj == null ? '' : f(u.adj) + '%'}</b></td></tr>`).join('');
    return rows ? `<h3>${e(ind.name)}</h3><table><tr><th>Учреждение</th><th>Случаев</th><th>Наблюдаемая доля</th><th>95% ДИ</th><th>С поправкой на надёжность</th></tr>${rows}</table>${adj.mean == null ? '' : `<p class="m">Общая доля ${f(adj.mean)}%.</p>`}` : '';
  }).join('') : '<p class="m">В этом выпуске нет разбивки по учреждениям (выпуск сделан в ранней версии AddAll или за одно учреждение).</p>';
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(reg.name)}: результаты за ${d(r.from)} - ${d(r.to)}</title>
<style>body{font:15px/1.5 "Segoe UI",Arial,sans-serif;max-width:980px;margin:0 auto;padding:24px;color:#1d2433}h1{font-size:26px;margin:0 0 4px}h2{margin-top:28px;border-bottom:2px solid #2c5aa0;padding-bottom:4px}table{border-collapse:collapse;width:100%;margin:8px 0}th,td{border:1px solid #d5dbe6;padding:6px 8px;text-align:left}th{background:#eef2f8}.m{color:#5b6475;font-size:13px}</style></head><body>
<p class="m">${e(ps.owner || '')}</p><h1>${e(reg.name)}</h1><p>Результаты за период ${d(r.from)} - ${d(r.to)}${r.center ? ', ' + e(code.get(r.center) || r.center) : ''}. Официальный отчёт, версия ${r.version}, выпущен ${d(r.acceptedAt)}.</p>
${ps.purpose ? `<p>${e(ps.purpose)}</p>` : ''}
<h2>Общие результаты</h2><table><tr><th>Показатель</th><th>Результат</th><th>95% ДИ</th><th>Случаев</th></tr>${national}</table>
<p class="m">Случаев в отчёте: ${(r.cohort || []).length}${r.recon?.pct != null ? `. Охват по независимому списку: ${r.recon.pct}% (${r.recon.found} из ${r.recon.expected})` : ''}.</p>
${(r.follow || []).length ? `<p class="m">Полнота наблюдения: ${(r.follow || []).map(s => `${e(s.name)} ${s.done} из ${s.due}`).join('; ')}.</p>` : ''}
<h2>Результаты учреждений</h2>${byInd}
<h2>Определения показателей</h2><ul>${(r.definitions || []).map(i => `<li><b>${e(i.name)}</b>: ${e(i.text || '')}</li>`).join('')}</ul>
<h2>Как читать</h2><p>95% ДИ это доверительный интервал Уилсона. Доля с поправкой на надёжность учитывает, что у учреждений с малым числом случаев результат сильно зависит от случайности: такая оценка сдвинута к общей доле тем сильнее, чем меньше случаев (Dimick, Staiger, Birkmeyer, Health Services Research, 2010). Группы меньше ${small} случаев не показываются, чтобы нельзя было узнать отдельных пациентов. Случаи с неизвестным исходом в расчёт не входят.</p>
${ps.legal ? `<p class="m">Правовое основание: ${e(ps.legal)}</p>` : ''}${ps.contact ? `<p class="m">Контакт: ${e(ps.contact)}</p>` : ''}
<p class="m">Сформировано в AddAll 2.0 из неизменяемого снимка выпуска. Версия схемы регистра v${e(r.schemaVersion)}.</p></body></html>`;
};

/* ---------- описание данных для статьи по чек-листу RECORD ----------
   Benchimol EI et al. The REporting of studies Conducted using Observational Routinely-collected health Data
   (RECORD) statement. PLoS Med 2015;12(10):e1001885. Нумерация пунктов по чек-листу RECORD. */
National.recordText = async (reg, r) => {
  const ps = reg.passport || {}, d = s => s ? String(s).slice(0, 10).split('-').reverse().join('.') : '';
  const patients = await Data.patients(reg.id);
  const withDeathList = patients.filter(p => p.deathSource).length;
  const fields = (reg.eventTypes || []).flatMap(et => formFields(et).map(f => ({ et, f })));
  const coded = fields.filter(x => x.f.standardCode || x.f.codeSystem || ['icd10', 'icdo'].includes(x.f.type) || x.f.dict);
  const used = new Set((r.definitions || []).flatMap(i => [i.num?.key, i.denom?.key, i.measure?.field].filter(Boolean)));
  const defs = fields.filter(x => used.has(x.f.key));
  const lines = [], L = (s = '') => lines.push(s);
  L(`# ${reg.name}: описание данных (черновик по чек-листу RECORD)`);
  L(`Источник: AddAll 2.0, выпуск за период ${d(r.from)} - ${d(r.to)}, версия ${r.version} (${r.kind === 'official' ? 'официальный' : 'внутренний'}), выпущен ${d(r.acceptedAt)}; версия схемы регистра v${r.schemaVersion}. Текст собран автоматически: проверьте и дополните места в квадратных скобках.`);
  L();
  L('## Название и аннотация (RECORD 1.1-1.3)');
  L(`- 1.1 Тип данных: проспективный клинический регистр «${reg.name}»${ps.owner ? ', владелец данных: ' + ps.owner : ''}.`);
  L(`- 1.2 Территория и период: [укажите регион и учреждения]; период ${d(r.from)} - ${d(r.to)}${r.center ? ', учреждение: ' + r.center : ''}.`);
  L(`- 1.3 Связывание баз данных: ${withDeathList ? `сведения о смерти для ${withDeathList} пациентов загружены из внешнего списка (сопоставление по ИИН или № ИБ); [укажите источник списка].` : 'связывание с другими базами не проводилось.'}`);
  L();
  L('## Участники (RECORD 6.1-6.3)');
  L(`- 6.1 Отбор: единица учёта «${r.unitName || ''}». Критерии включения: ${ps.inclusion || reg.description || '[укажите]'}. Цель регистра: ${ps.purpose || '[укажите]'}.`);
  L(`- 6.2 Проверка кодов и определений: ${coded.length ? `поля с внешней классификацией: ${coded.map(x => x.f.label).join(', ')}.` : 'внешние классификации не использовались.'} Валидационные исследования кодов в регистре: [укажите, если были].`);
  L(`- 6.3 Связывание: ${withDeathList ? 'сопоставление по ИИН, при его отсутствии по № ИБ и учреждению; неоднозначные совпадения проверялись вручную.' : 'не применялось.'}`);
  L();
  L('## Переменные (RECORD 7.1)');
  for (const i of r.definitions || []) L(`- ${i.name}: ${i.text || ''}`);
  for (const x of defs) L(`  - «${x.f.label}» (${x.et.name}, код ${x.f.key}${x.f.standardCode ? ', ' + (x.f.codeSystem || '') + ' ' + x.f.standardCode : ''})${x.f.def ? ': ' + x.f.def : ''}`);
  L();
  L('## Доступ к данным и очистка (RECORD 12.1-12.3)');
  L('- 12.1 Доступ: исследователи [имели / не имели] доступ ко всей базе регистра; анализ проведён на неизменяемом снимке выпуска.');
  L(`- 12.2 Качество и очистка данных: ${r.recon ? `охват по независимому списку ${r.recon.pct ?? 'не рассчитан'}% (${r.recon.found} из ${r.recon.expected}${r.recon.source ? ', источник: ' + r.recon.source : ''}); ` : 'сверка с независимым списком не проводилась; '}${(r.follow || []).length ? 'полнота наблюдения: ' + r.follow.map(s => `${s.name} ${s.done} из ${s.due}${s.missing ? `, нет ${s.missing}` : ''}`).join('; ') + '; ' : ''}состояние на дату выпуска: ${(r.checks || []).map(c => (c.ok ? 'выполнено: ' : 'замечание: ') + c.text).join('; ')}.`);
  L(`- 12.3 Связывание: ${withDeathList ? 'см. пункты 1.3 и 6.3.' : 'не применялось.'}`);
  L();
  L('## Результаты (RECORD 13.1)');
  L(`- 13.1 Отбор случаев: в выпуск вошло ${(r.cohort || []).length} случаев (${new Set(r.patients || []).size} пациентов). По показателям:`);
  for (const x of r.results || []) L(`  - ${x.name}: в расчёте ${x.den}, событий ${x.num}, исход неизвестен ${x.miss || 0}${x.na ? `, не применимо ${x.na}` : ''}.`);
  L('  [Постройте по этим числам схему отбора случаев.]');
  L();
  L('## Ограничения (RECORD 19.1)');
  L('- Случаи с неизвестным исходом не входили в расчёт долей; если пропуски не случайны, это может смещать результат. Множественная импутация не применялась.');
  L(`- ${r.recon ? 'Неполный охват по независимому списку может приводить к систематической ошибке отбора.' : 'Без сверки с независимым списком полнота включения неизвестна.'}`);
  L('- Возможны ошибки классификации при ручном вводе и при извлечении данных из документов; [укажите долю записей, проверенных по первичной документации, и долю записей с двойным вводом].');
  L();
  L('## Доступность протокола и данных (RECORD 22.1)');
  L(`- Словарь данных и определения показателей: выгрузка из AddAll (версия схемы v${r.schemaVersion}). Протокол регистра: ${ps.legal ? ps.legal : '[укажите]'}. Доступ к данным: ${ps.contact ? 'по запросу, ' + ps.contact : '[укажите порядок]'}.`);
  L();
  L('## Статистические методы');
  L('- Доли с 95% доверительным интервалом Уилсона. Сравнение учреждений: доля с поправкой на надёжность, эмпирическая байесовская оценка (Dimick, Staiger, Birkmeyer, Health Serv Res 2010). [Добавьте модели риска и программы анализа, если использовались.]');
  return lines.join('\n');
};

/* ---------- 4. сведения о смерти из внешнего списка ---------- */
Routes.deaths = async (main) => {
  if (!can('edit')) { main.innerHTML = '<div class="head"><h1>Сведения о смерти</h1></div>' + emptyState('Нет прав на изменение карточек пациентов.'); return; }
  main.innerHTML = `<div class="head"><h1>Сведения о смерти</h1></div>
    <div class="card"><p>Загрузите список умерших (например, выгрузку из МИС, службы статистики или регистра смертности): ИИН или № ИБ и дата смерти. AddAll найдёт пациентов во всех доступных вам регистрах и покажет, что изменится. Ничего не записывается, пока вы не нажмёте «Внести».</p>
      <p class="muted small">Столбцы: «ИИН», «№ ИБ», «Учреждение» (нужно, если № ИБ повторяются в разных учреждениях), «Дата смерти». Подходят CSV и XLSX. Без даты смерти строка не принимается.</p>
      <div class="row"><input type="file" id="dtFile" accept=".csv,.xlsx,.txt"><button class="btn" id="dtTpl">Шаблон CSV</button></div></div>
    <div class="card" id="dtOut"><p class="muted">Файл не выбран.</p></div>`;
  $('#dtTpl', main).onclick = () => download('spisok_umershih_shablon.csv', '﻿ИИН;№ ИБ;Учреждение;Дата смерти\n;;;\n', 'text/csv');
  $('#dtFile', main).onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    let table;
    e.target.value = '';
    try { table = await Recon.readTable(file); } catch (err) { return toast(err.message, 'err'); }
    const plan = await National.deathPlan(table);
    if (plan.error) { $('#dtOut', main).innerHTML = `<p class="bad">${esc(plan.error)}</p>`; return; }
    National.drawDeaths($('#dtOut', main), plan, file.name);
  };
};

National.deathPlan = async table => {
  if (!table || table.length < 2) return { error: 'В файле нет строк.' };
  const head = table[0].map(h => String(h || '').trim().toLowerCase());
  const col = re => head.findIndex(h => re.test(h));
  const ci = col(/иин|iin/), cl = col(/иб|карт|local|номер/), cc = col(/учрежд|центр|center|клиник/), cd = col(/смерт|death/);
  if (cd < 0) return { error: 'Не найден столбец «Дата смерти».' };
  if (ci < 0 && cl < 0) return { error: 'Нужен столбец «ИИН» или «№ ИБ».' };
  const patients = (await Data.patients()).filter(p => typeof visibleP !== 'function' || visibleP(p));
  const events = await Data.events();
  const lastEvent = new Map();
  for (const ev of events) if (ev.date && ev.status !== 'черновик' && (!lastEvent.get(ev.patientId) || ev.date > lastEvent.get(ev.patientId))) lastEvent.set(ev.patientId, ev.date);
  const digits = v => String(v ?? '').replace(/\D/g, '');
  const rows = table.slice(1).map((r, i) => {
    const iin = ci >= 0 ? digits(r[ci]) : '', lid = cl >= 0 ? Recon.norm(r[cl]) : '', center = cc >= 0 ? String(r[cc] || '').trim() : '';
    const date = Recon.day(r[cd]);
    const row = { n: i + 2, iin, lid: cl >= 0 ? String(r[cl] || '').trim() : '', center, raw: String(r[cd] ?? ''), date, matches: [] };
    if (!iin && !lid) return { ...row, state: 'skip', why: 'нет ИИН и № ИБ' };
    if (!date) return { ...row, state: 'bad', why: 'дата смерти не распознана' };
    if (date > today()) return { ...row, state: 'bad', why: 'дата смерти в будущем' };
    let m = iin ? patients.filter(p => digits(p.iin) === iin) : [];
    if (!m.length && lid) m = patients.filter(p => Recon.norm(p.localId) === lid && (!center || (p.center || '') === center));
    row.matches = m;
    if (!m.length) return { ...row, state: 'none', why: 'пациент не найден' };
    if (!iin && new Set(m.map(p => p.center || '')).size > 1) return { ...row, state: 'bad', why: 'одинаковый № ИБ в разных учреждениях: укажите учреждение или ИИН' };
    const why = [];
    for (const p of m) {
      if (p.birthDate && date < p.birthDate) why.push('дата смерти раньше даты рождения');
      if (p.vital === 'умер' && p.deathDate && p.deathDate !== date) why.push(`в карточке уже другая дата смерти (${fmtDate(p.deathDate)})`);
      const last = lastEvent.get(p.id);
      if (last && last > date) why.push(`есть записи после даты смерти (${fmtDate(last)})`);
    }
    if (why.length) return { ...row, state: 'bad', why: [...new Set(why)].join('; ') };
    if (m.every(p => p.vital === 'умер' && p.deathDate === date)) return { ...row, state: 'same', why: 'уже внесено' };
    return { ...row, state: 'ok', why: m.length > 1 ? `будет внесено в ${m.length} регистрах` : 'будет внесено' };
  });
  return { rows };
};

National.drawDeaths = (box, plan, fileName) => {
  const cnt = s => plan.rows.filter(r => r.state === s).length;
  const label = { ok: 'внести', same: 'уже внесено', none: 'не найден', bad: 'нужна проверка', skip: 'пропущено' };
  box.innerHTML = `<h2>Что изменится</h2><p>Будет внесено: <b>${cnt('ok')}</b>. Уже внесено: ${cnt('same')}. Не найдено: ${cnt('none')}. Нужна ручная проверка: <b>${cnt('bad')}</b>.</p>
    <table class="tbl"><thead><tr><th>Строка</th><th>ИИН / № ИБ</th><th>Пациент</th><th>Дата смерти</th><th>Итог</th></tr></thead><tbody>
    ${plan.rows.map(r => `<tr><td>${r.n}</td><td>${esc(r.iin || r.lid)}${r.center ? '<div class="muted small">' + esc(r.center) + '</div>' : ''}</td><td>${r.matches.map(p => `<a href="#patient/${esc(p.id)}">${esc(pname(p))}</a>`).join(', ')}</td><td>${r.date ? fmtDate(r.date) : esc(r.raw)}</td><td class="${r.state === 'ok' ? 'okt' : r.state === 'bad' ? 'warnt' : ''}">${label[r.state]}: ${esc(r.why)}</td></tr>`).join('')}</tbody></table>
    <p class="muted small">Строки «нужна проверка» не вносятся автоматически: откройте карточку пациента и решите вручную.</p>
    ${cnt('ok') ? `<div class="row end"><button class="btn primary" id="dtGo">Внести ${cnt('ok')}</button></div>` : ''}`;
  const btn = $('#dtGo', box);
  if (btn) btn.onclick = async () => {
    btn.disabled = true;
    let done = 0;
    for (const r of plan.rows.filter(x => x.state === 'ok')) for (const p of r.matches) {
      if (p.vital === 'умер' && p.deathDate === r.date) continue;
      Object.assign(p, { vital: 'умер', deathDate: r.date, deathSource: `${fileName}, загружен ${fmtDate(today())}` });
      try { await DB.put('patients', p, 'сведения о смерти из внешнего списка'); done++; } catch (e) { toast(e.message, 'err'); }
    }
    if (typeof FollowQ === 'object') FollowQ.cache = null;
    toast('Внесено: ' + done);
    box.insertAdjacentHTML('beforeend', `<p class="okt">Внесено карточек: ${done}. Пациенты, умершие до срока наблюдения, появятся в очереди как «умер до срока: внесите исход».</p>`);
  };
};

/* ---------- шаблон регистра: безопасность препарата или изделия ----------
   Серьёзность по ICH E2A, степень по CTCAE v5.0, связь по шкале ВОЗ-UMC. */
TEMPLATES.safety = {
  name: 'Безопасность препарата или изделия',
  desc: 'Пострегистрационное наблюдение: начало применения, нежелательные явления (серьёзность ICH E2A, степень CTCAE, связь по ВОЗ-UMC), исходы.',
  make: () => {
    const r = blankRegistry('Безопасность препарата или изделия');
    r.description = 'Наблюдение за пациентами, получающими препарат или изделие. Нежелательные явления описываются по критериям серьёзности ICH E2A, степени тяжести CTCAE v5.0 и шкале причинно-следственной связи ВОЗ-UMC. О серьёзных непредвиденных реакциях сообщайте также в национальную систему фармаконадзора в установленный срок.';
    r.eventTypes = [
      { id: 'enrol', name: 'Начало применения', color: '#3b6fd4', single: true, dateLabel: 'Дата начала', sections: [{ id: uid('s'), title: 'Препарат или изделие', fields: [
        F('product', 'Препарат или изделие', 'text', { required: true }), F('lot', 'Серия или серийный номер'), F('indication', 'Показание (диагноз)', 'text', { required: true }),
        F('dose', 'Доза и режим'), F('route', 'Путь введения или способ установки')] }] },
      { id: 'ae', name: 'Нежелательное явление', color: '#d9534f', dateLabel: 'Дата начала явления', sections: [{ id: uid('s'), title: 'Описание', fields: [
        F('ae_term', 'Явление (диагноз или симптом)', 'text', { required: true }),
        F('ae_serious', 'Серьёзное явление (ICH E2A)', 'yesno', { required: true, def: 'Серьёзное, если привело к смерти, угрожало жизни, потребовало госпитализации или её продления, привело к стойкой нетрудоспособности, врождённой аномалии или является другим важным медицинским событием.' }),
        F('ae_crit', 'Критерий серьёзности', 'select', { options: ['смерть', 'угроза жизни', 'госпитализация или её продление', 'стойкая нетрудоспособность', 'врождённая аномалия', 'другое важное медицинское событие'], showIf: { key: 'ae_serious', op: 'eq', value: 'да' } }),
        F('ae_grade', 'Степень (CTCAE v5.0)', 'select', { options: ['1', '2', '3', '4', '5'], def: '1 лёгкая, 2 умеренная, 3 тяжёлая, 4 угрожающая жизни, 5 смерть, связанная с явлением.' }),
        F('ae_cause', 'Связь с препаратом или изделием (ВОЗ-UMC)', 'select', { options: ['определённая', 'вероятная', 'возможная', 'сомнительная', 'условная', 'не поддаётся оценке'] }),
        F('ae_action', 'Что сделано с препаратом или изделием', 'select', { options: ['без изменений', 'доза снижена', 'временно отменён', 'отменён окончательно', 'изделие удалено', 'неизвестно'] }),
        F('ae_outcome', 'Исход явления', 'select', { options: ['выздоровление', 'выздоровление с последствиями', 'улучшение', 'без улучшения', 'смерть', 'неизвестно'] }),
        F('ae_reported', 'Сообщено в систему фармаконадзора', 'yesno')] }] },
      { id: 'followup', name: 'Наблюдение', color: '#2a9d8f', dateLabel: 'Дата контакта', expect: { days: 90, every: 90, window: 30 }, sections: [{ id: uid('s'), title: 'Статус', fields: [
        F('on_treatment', 'Продолжает применение', 'yesno'), F('status', 'Состояние', 'select', { options: ['без нежелательных явлений', 'есть нежелательные явления', 'умер', 'потерян для наблюдения'] })] }] }
    ];
    r.episode = { opener: 'enrol' };
    r.indicators = [
      { id: uid('i'), name: 'Серьёзные нежелательные явления', et: 'ae', denom: null, num: { key: 'ae_serious', op: 'eq', value: 'да' }, target: '', lowerBetter: true, ref: 'Доля серьёзных среди всех зарегистрированных явлений.' },
      { id: uid('i'), name: 'Серьёзные явления, о которых сообщено', et: 'ae', denom: { key: 'ae_serious', op: 'eq', value: 'да' }, num: { key: 'ae_reported', op: 'eq', value: 'да' }, target: 100, ref: 'Полнота сообщений о серьёзных явлениях в фармаконадзор.' }
    ];
    return r;
  }
};

/* ---------- меню, группы и гайд ---------- */
Object.assign(ROUTE_GROUP, { compare: 'Работа', passport: 'Работа', deaths: 'Работа' });
NAV_ICONS.compare = NAV_ICONS.compare || NAV_ICONS.me; NAV_ICONS.passport = NAV_ICONS.passport || NAV_ICONS.me; NAV_ICONS.deaths = NAV_ICONS.deaths || NAV_ICONS.me;
{
  const previous = navGroups;
  navGroups = async function () {
    const groups = await previous();
    const work = groups.find(group => group.id === 'work');
    if (work?.items) {
      const add = [{ r: 'passport', t: 'Паспорт регистра' }, can('analyse') && { r: 'compare', t: 'Сравнение учреждений и врачей' }, can('edit') && { r: 'deaths', t: 'Сведения о смерти' }].filter(Boolean)
        .filter(item => !work.items.some(x => x.r === item.r));
      const at = work.items.findIndex(item => item.r === 'period');
      work.items.splice(at < 0 ? work.items.length : at + 1, 0, ...add);
    }
    return groups;
  };
}
if (typeof TRAINING_CHAPTERS !== 'undefined' && typeof TrainingGuide === 'object') {
  const end = TRAINING_CHAPTERS.findIndex(c => c.id === 'end');
  TRAINING_CHAPTERS.splice(end < 0 ? TRAINING_CHAPTERS.length : end, 0,
    { id: 'passport', name: 'Паспорт регистра', page: 'passport', go: 'passport', steps: [
      { t: '#psChecks', title: 'Что такое паспорт регистра', text: 'Паспорт описывает сам регистр: кто за него отвечает, зачем он ведётся, на каком основании собираются данные, каких пациентов включают и где хранятся данные. Его спрашивают при аудите, экспертизе и при подаче статьи. Паспорт один на регистр, заполняет руководитель регистра.' },
      { t: '#psChecks', title: 'Готовность регистра', text: 'Автоматический чек-лист: назначены ли ответственные, есть ли определения полей и показателей, сроки наблюдения, сверка с независимым списком, официальный отчёт, отметки о согласии и где хранятся данные. Восклицательный знак показывает, чего не хватает и где это исправить.' },
      { t: '#psForm', title: 'Управление и описание', text: 'Владелец данных, ответственный, совет регистра, цель, правовое основание и критерии включения. Здесь же место хранения данных, порог малых групп и то, как называть учреждения на публичной странице. Сохраняет руководитель регистра или администратор.' },
      { t: '#psPublic', title: 'Публичная страница', text: 'Скачивает готовую страницу для сайта из официального выпуска периода. Пациентов на ней нет, малые группы скрыты, у учреждений показана доля с поправкой на надёжность.' },
      { t: '#psRecord', title: 'Описание данных для статьи', text: 'Черновик раздела «Методы» для публикации по чек-листу RECORD: источник, отбор, определения, охват и полнота, связывание баз, ограничения. Места в квадратных скобках нужно дописать самому.' }
    ] },
    { id: 'compare', name: 'Сравнение учреждений и врачей', page: 'compare', go: 'compare', steps: [
      { t: '#cmCenters', title: 'Зачем поправка на надёжность', text: 'В больнице с 5 операциями одно осложнение даёт 20%, хотя это может быть случайность. Поэтому кроме обычной доли показана доля с поправкой: чем меньше случаев, тем сильнее она приближена к общей доле. Так сравнивают и в национальных регистрах.' },
      { t: '#cmCenters', title: 'Учреждения', text: 'Для выбранного показателя и периода: число случаев, наблюдаемая доля с 95% интервалом и доля с поправкой на надёжность. У учреждений с малым числом случаев оценка сдвинута к общей доле, чтобы случайность не делала их лучшими или худшими.' },
      { t: '#cmDocs', title: 'Врачи', text: 'То же сравнение по врачам. Если в настройках включены коды бенчмаркинга, врачи показаны под кодами.' }
    ] },
    { id: 'deaths', name: 'Сведения о смерти', page: 'deaths', go: 'deaths', steps: [
      { t: '#dtTpl', title: 'Зачем это нужно', text: 'Смерть после выписки часто не попадает в регистр: пациент умер дома или в другой больнице. Тогда показатели смертности занижены. Раз в месяц или квартал загрузите список умерших из статистики или регистра смертности, и AddAll сам найдёт ваших пациентов. Кнопка «Шаблон» скачивает пример файла: ИИН или № ИБ и дата смерти.' },
      { t: '#dtFile', title: 'Загрузка и предпросмотр', text: 'Выберите файл CSV или Excel. AddAll ищет пациентов во всех ваших регистрах и показывает, что изменится: кого отметит умершим и с какой датой. Ничего не меняется, пока вы не нажмёте «Внести».' },
      { t: '#dtFile', title: 'Спорные строки', text: 'Если в карточке другая дата смерти, после даты смерти есть записи, один № ИБ встречается в разных учреждениях без ИИН или дата раньше рождения, строка не вносится автоматически. Её проверяют вручную: так ошибка в списке не испортит данные.' }
    ] });
  TrainingGuide.steps = TRAINING_CHAPTERS.flatMap((chapter, c) => chapter.steps.map((step, i) => ({ ...step, chapter, c, i })));
}
