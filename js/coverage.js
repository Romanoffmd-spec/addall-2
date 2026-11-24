/* Охват регистра по независимому источнику за заданный период. */
'use strict';

const Coverage = {
  registered(reg, patients, events, filter) {
    const people = new Set(patients.filter(p => p.registryId === reg.id && (!filter.center || p.center === filter.center)).map(p => p.id));
    const observed = new Set();
    for (const event of events) {
      if (event.registryId === reg.id && event.type === filter.eventType && event.status !== 'черновик'
        && event.date >= filter.from && event.date <= filter.to && people.has(event.patientId)) {
        observed.add(event.patientId);
      }
    }
    return observed.size;
  },
  estimate(observed, expected) {
    if (expected == null) return 'Внесите число из независимого источника, чтобы рассчитать охват.';
    if (observed > expected) return 'Зарегистрировано больше пациентов, чем в источнике. Сверьте когорту, период и дубли.';
    if (!expected) return 'По источнику за этот период подходящих пациентов нет. Процент не рассчитывается.';
    return `Охват: ${(100 * observed / expected).toLocaleString('ru-RU', { maximumFractionDigits: 1 })}% (${observed} из ${expected}).`;
  }
};

Routes.coverage = async (main, regId = '') => {
  const regs = await Data.registries();
  const reg = regs.find(r => r.id === regId) || regs[0];
  if (!reg) { main.innerHTML = '<div class="head"><h1>Охват регистра</h1></div>' + emptyState('Нет регистров.'); return; }
  const [patients, events, stored] = await Promise.all([Data.patients(reg.id), Data.events(reg.id), DB.all('coverage')]);
  const screens = (Routes.coverage.filters ||= {});
  const filter = screens[reg.id] ||= { from: today().slice(0, 4) + '-01-01', to: today(), eventType: Out30.startType(reg) || '', center: '' };
  const types = reg.eventTypes || [];
  if (!types.some(type => type.id === filter.eventType)) filter.eventType = types[0]?.id || '';
  const history = stored.filter(x => x.registryId === reg.id);
  const orgs = [...new Set([...(Settings.data.centers || []), ...patients.map(p => p.center), ...history.map(item => item.center)].filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const canSave = can('users') || (can('design') && regManage(reg));
  main.innerHTML = `
    <div class="head"><h1>Охват регистра</h1>${regSelect(regs, reg.id, 'covReg', false)}</div>
    <div class="card">
      <p>Сверьте число уникальных пациентов регистра с независимым списком подходящих пациентов за тот же период, например с операционным журналом.</p>
      <div class="grid">
        <div class="fld"><label class="flab" for="covFrom">Начало периода</label><input class="inp" id="covFrom" type="date" value="${esc(filter.from)}"></div>
        <div class="fld"><label class="flab" for="covTo">Конец периода</label><input class="inp" id="covTo" type="date" value="${esc(filter.to)}"></div>
        <div class="fld"><label class="flab" for="covOrg">Учреждение в карточке пациента</label><select class="inp" id="covOrg"><option value="">Все учреждения</option>${orgs.map(name => `<option value="${esc(name)}" ${name === filter.center ? 'selected' : ''}>${esc(name)}</option>`).join('')}</select></div>
        <div class="fld"><label class="flab" for="covType">Событие для включения</label><select class="inp" id="covType">${types.map(type => `<option value="${esc(type.id)}" ${type.id === filter.eventType ? 'selected' : ''}>${esc(type.name)}</option>`).join('')}</select></div>
      </div>
      <p class="muted">В расчёт входят пациенты с сохранённым событием выбранного типа. При нескольких таких событиях пациент учитывается один раз. Черновики пропускаются.</p>
      <p id="covResult" aria-live="polite"></p>
      ${canSave && filter.eventType ? `
        <form id="covForm" class="grid">
          <div class="fld"><label class="flab" for="covExpected">Подходящих пациентов в источнике</label><input class="inp" id="covExpected" type="number" min="0" step="1" required></div>
          <div class="fld"><label class="flab" for="covSource">Источник и критерии отбора</label><input class="inp" id="covSource" maxlength="250" placeholder="Например, операционный журнал, резекции по поводу КРР" required></div>
          <div class="row"><button type="submit" class="btn primary">Сохранить сверку</button></div>
        </form>` : ''}
    </div>
    <div class="card"><h2>История сверок</h2><div id="covHistory"></div></div>`;
  $('#covReg', main).onchange = e => go('coverage/' + e.target.value);

  const read = () => Object.assign(filter, { from: $('#covFrom', main).value, to: $('#covTo', main).value,
    eventType: $('#covType', main).value, center: $('#covOrg', main).value });
  const valid = () => filter.eventType && filter.from && filter.to && filter.from <= filter.to;
  const renderResult = () => {
    const list = history.filter(x => x.from === filter.from && x.to === filter.to && x.eventType === filter.eventType && x.center === filter.center)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    const latest = list[0];
    const observed = Coverage.registered(reg, patients, events, filter);
    $('#covResult', main).textContent = valid()
      ? `В регистре: ${observed}. ${Coverage.estimate(observed, latest?.expected)}`
      : 'Выберите событие и проверьте границы периода.';
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
    if (!valid() || !source || !Number.isSafeInteger(expected) || expected < 0) return toast('Проверьте период, число пациентов и источник', 'err');
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
