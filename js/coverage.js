/* Охват регистра по независимому источнику за заданный период. */
'use strict';

const Coverage = {
  /* эпизоды (случаи) за период: каждое сохранённое событие выбранного типа; два события одного пациента это два эпизода */
  episodes(reg, patients, events, filter) {
    const people = new Set(patients.filter(p => p.registryId === reg.id && (!filter.center || p.center === filter.center)).map(p => p.id));
    const inPeriod = e => e.date >= filter.from && e.date <= filter.to && people.has(e.patientId);
    if (filter.eventType === Episodes.PATIENT) return Episodes.list(reg, events, patients).filter(inPeriod);
    return events.filter(event => event.registryId === reg.id && event.type === filter.eventType && event.status !== 'черновик' && inPeriod(event));
  },
  registered(reg, patients, events, filter) { return this.episodes(reg, patients, events, filter).length; },
  /* полнота наблюдения по тем же эпизодам: исход 30 дней и формы, ожидаемые в каждом эпизоде */
  async followup(reg, patients, events, filter) {
    const episodes = this.episodes(reg, patients, events, filter);
    const ids = new Set(episodes.map(e => e.id));
    const lines = [];
    if (Out30.startType(reg) === filter.eventType && Out30.form(reg, filter.eventType)) {
      const rows = (await Out30.build()).filter(x => x.reg.id === reg.id && ids.has(x.e.id));
      const n = k => rows.filter(x => x.state === k).length;
      const due = n('done') + n('due') + n('partial');
      lines.push({ name: 'Исход 30 дней', done: n('done'), due, missing: n('due'), partial: n('partial'), wait: n('wait'), reason: 0, link: '#out30' });
    }
    if (filter.eventType === Episodes.opener(reg)) {
      const tasks = await DB.all('tasks');
      const items = FollowQ.build(reg, events, patients, tasks, { episodes });
      for (const x of FollowQ.summary(items)) lines.push({ name: x.et.name + (Episodes.rule(x.et).every ? ' (все сроки)' : ''), done: x.done, due: x.due, missing: x.missing, partial: x.partial, wait: x.wait, reason: x.reason, link: '#followup/' + reg.id });
    }
    return { total: episodes.length, lines };
  },
  estimate(observed, expected) {
    if (expected == null) return 'Внесите число из независимого источника, чтобы рассчитать охват.';
    if (observed > expected) return 'Зарегистрировано больше случаев, чем в источнике. Сверьте когорту, период и дубли.';
    if (!expected) return 'По источнику за этот период подходящих случаев нет. Процент не рассчитывается.';
    return `Охват: ${(100 * observed / expected).toLocaleString('ru-RU', { maximumFractionDigits: 1 })}% (${observed} из ${expected}).`;
  }
};

Routes.coverage = async (main, regId = '') => {
  const regs = await Data.registries();
  const reg = regs.find(r => r.id === regId) || regs[0];
  if (!reg) { main.innerHTML = '<div class="head"><h1>Охват регистра</h1></div>' + emptyState('Нет регистров.'); return; }
  const [patients, events, stored] = await Promise.all([Data.patients(reg.id), Data.events(reg.id), DB.all('coverage')]);
  const screens = (Routes.coverage.filters ||= {});
  const filter = screens[reg.id] ||= { from: today().slice(0, 4) + '-01-01', to: today(), eventType: Episodes.opener(reg) || '', center: '' };
  const types = reg.eventTypes || [];
  if (filter.eventType !== Episodes.PATIENT && !types.some(type => type.id === filter.eventType)) filter.eventType = types[0]?.id || '';
  if (filter.eventType === Episodes.PATIENT && !Episodes.isPatient(reg)) filter.eventType = Episodes.opener(reg);
  const history = stored.filter(x => x.registryId === reg.id);
  const orgs = [...new Set([...(Settings.data.centers || []), ...patients.map(p => p.center), ...history.map(item => item.center)].filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const canSave = can('users') || (can('design') && regManage(reg));
  main.innerHTML = `
    <div class="head"><h1>Охват регистра</h1>${regSelect(regs, reg.id, 'covReg', false)}</div>
    <div class="card">
      <p>Сверьте число случаев (эпизодов) в регистре с независимым списком подходящих случаев за тот же период, например с операционным журналом.</p>
      <div class="grid">
        <div class="fld"><label class="flab" for="covFrom">Начало периода</label><input class="inp" id="covFrom" type="date" value="${esc(filter.from)}"></div>
        <div class="fld"><label class="flab" for="covTo">Конец периода</label><input class="inp" id="covTo" type="date" value="${esc(filter.to)}"></div>
        <div class="fld"><label class="flab" for="covOrg">Учреждение в карточке пациента</label><select class="inp" id="covOrg"><option value="">Все учреждения</option>${orgs.map(name => `<option value="${esc(name)}" ${name === filter.center ? 'selected' : ''}>${esc(name)}</option>`).join('')}</select></div>
        <div class="fld"><label class="flab" for="covType">Единица учёта: эпизод открывается событием</label><select class="inp" id="covType">${Episodes.isPatient(reg) ? `<option value="${Episodes.PATIENT}" ${filter.eventType === Episodes.PATIENT ? 'selected' : ''}>Пациент целиком (эпизод регистра)</option>` : ''}${types.map(type => `<option value="${esc(type.id)}" ${type.id === filter.eventType ? 'selected' : ''}>${esc(type.name)}${type.id === Episodes.opener(reg) ? ' (эпизод регистра)' : ''}</option>`).join('')}</select></div>
      </div>
      <p class="muted">Каждое сохранённое событие выбранного типа это отдельный случай: две операции у одного пациента дают два случая. Черновики пропускаются. Те же случаи используются для полноты наблюдения ниже и для показателей качества.</p>
      <p id="covResult" aria-live="polite"></p>
      ${canSave && filter.eventType ? `
        <form id="covForm" class="grid">
          <div class="fld"><label class="flab" for="covExpected">Подходящих случаев в источнике</label><input class="inp" id="covExpected" type="number" min="0" step="1" required></div>
          <div class="fld"><label class="flab" for="covSource">Источник и критерии отбора</label><input class="inp" id="covSource" maxlength="250" placeholder="Например, операционный журнал, резекции по поводу КРР" required></div>
          <div class="row"><button type="submit" class="btn primary">Сохранить сверку</button></div>
        </form>` : ''}
    </div>
    <div class="card"><h2>Полнота наблюдения за период</h2><div id="covFollow"></div></div>
    <div class="card"><h2>История сверок</h2><div id="covHistory"></div></div>`;
  $('#covReg', main).onchange = e => go('coverage/' + e.target.value);

  const read = () => Object.assign(filter, { from: $('#covFrom', main).value, to: $('#covTo', main).value,
    eventType: $('#covType', main).value, center: $('#covOrg', main).value });
  const valid = () => filter.eventType && filter.from && filter.to && filter.from <= filter.to;
  const pct = (a, b) => b ? ' (' + (100 * a / b).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + '%)' : '';
  let followSeq = 0;
  const renderFollow = async () => {
    const box = $('#covFollow', main); if (!box) return;
    if (!valid()) { box.innerHTML = ''; return; }
    const seq = ++followSeq;
    const f = await Coverage.followup(reg, patients, events, filter);
    if (seq !== followSeq) return;
    box.innerHTML = !f.lines.length
      ? `<p class="muted">Для этого события нет ожидаемых форм. Укажите в конструкторе (Формы событий, «Настроить»), какие формы ожидаются в каждом эпизоде и через сколько дней, например патоморфология через 30 дней.</p>`
      : `<p>Случаев за период: <b>${f.total}</b>.</p><table class="tbl"><thead><tr><th>Что ожидается</th><th>Есть</th><th>Нет, срок наступил</th><th>Срок не наступил</th></tr></thead><tbody>
        ${f.lines.map(x => `<tr><td>${x.link ? `<a href="${x.link}">${esc(x.name)}</a>` : esc(x.name)}</td><td><b>${x.done}</b> из ${x.due}${pct(x.done, x.due)}</td><td>${x.missing}${x.partial ? ` + ${x.partial} заполнено не полностью` : ''}${x.reason ? ` · ${x.reason} закрыто с причиной` : ''}</td><td>${x.wait}</td></tr>`).join('')}</tbody></table>
        <p class="muted small">Случай без формы не пропадает: он считается как «нет, срок наступил» здесь и как «исход неизвестен» в показателях качества.</p>`;
  };
  const renderResult = () => {
    const list = history.filter(x => x.from === filter.from && x.to === filter.to && x.eventType === filter.eventType && x.center === filter.center)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    const latest = list[0];
    const observed = Coverage.registered(reg, patients, events, filter);
    $('#covResult', main).textContent = valid()
      ? `В регистре: ${observed}. ${Coverage.estimate(observed, latest?.expected)}`
      : 'Выберите событие и проверьте границы периода.';
    renderFollow();
    $('#covHistory', main).innerHTML = list.length ? `<table class="tbl"><thead><tr><th>Дата сверки</th><th>В источнике</th><th>Источник и отбор</th></tr></thead><tbody>
      ${list.map(item => `<tr><td>${fmtDT(item.createdAt)}</td><td>${esc(item.expected)}</td><td>${esc(item.source)}</td></tr>`).join('')}</tbody></table>`
      : '<p class="muted">За выбранный период сверок пока нет.</p>';
  };
  for (const id of ['covFrom', 'covTo', 'covType', 'covOrg']) {
    $('#' + id, main).onchange = () => { read(); renderResult(); };
  }
  const form = $('#covForm', main);
  if (form) form.onsubmit = async e => {
    e.preventDefault();
    read();
    const source = $('#covSource', main).value.trim();
    const expected = $('#covExpected', main).valueAsNumber;
    if (!valid() || !source || !Number.isSafeInteger(expected) || expected < 0) return toast('Проверьте период, число случаев и источник', 'err');
    const button = $('button[type=submit]', form);
    button.disabled = true;
    try {
      const saved = await DB.put('coverage', { registryId: reg.id, ...filter, source, expected }, 'сверка охвата регистра');
      history.push(saved);
      form.reset();
      renderResult();
      toast('Сверка сохранена');
    } catch (error) { toast(error.message, 'err'); }
    finally { button.disabled = false; }
  };
  renderResult();
};

ROUTE_GROUP.coverage = 'Работа';
NAV_ICONS.coverage = NAV_ICONS.analytics;
{
  const previous = navGroups;
  navGroups = async function () {
    const groups = await previous();
    const work = groups.find(group => group.id === 'work');
    if (work?.items) {
      const index = work.items.findIndex(item => item.r === 'out30');
      work.items.splice(index < 0 ? work.items.length : index + 1, 0, { r: 'coverage', t: 'Охват регистра', i: '▤' });
    }
    return groups;
  };
}
if (typeof EN === 'object') Object.assign(EN, { 'Охват регистра': 'Registry coverage', 'Сохранить сверку': 'Save reconciliation' });
