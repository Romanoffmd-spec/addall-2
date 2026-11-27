/* AddAll 2.0: биобанк и лаборатория.
   Образец хранится как обычная форма регистра «Биообразец» (id biosample): номер, тип, дата забора, место хранения,
   объём, согласие, статус и куда передан. Отдельного хранилища нет, поэтому работают права, аудит, синхронизация и выгрузки.
   Страница «Биобанк»: все образцы доступных регистров, поиск, отбор и манифест для лаборатории с кодами вместо ФИО. */
'use strict';

const Biobank = {
  FORM_ID: 'biosample',
  TYPES: ['ткань опухоли, свежезамороженная', 'ткань опухоли, FFPE-блок', 'нормальная ткань', 'кровь цельная', 'плазма', 'сыворотка', 'ДНК', 'РНК', 'кал', 'другое'],
  STATUS: ['в хранилище', 'передан в лабораторию', 'израсходован', 'утилизирован'],
  form() {
    return { id: this.FORM_ID, name: 'Биообразец', color: '#b5651d', dateLabel: 'Дата забора', sections: [{ id: uid('s'), title: 'Образец', fields: [
      F('bs_id', 'Номер образца', 'text', { required: true, safeText: true, def: 'Номер на пробирке или блоке. Не вписывайте ФИО и номер истории болезни.' }),
      F('bs_type', 'Тип образца', 'select', { options: this.TYPES, required: true }),
      F('bs_source', 'Откуда получен', 'select', { options: ['биопсия', 'операционный материал', 'венепункция', 'другое'] }),
      F('bs_volume', 'Объём или количество', 'number', { min: 0 }),
      F('bs_unit', 'Единица', 'select', { options: ['мл', 'мг', 'мкг', 'блоков', 'аликвот'] }),
      F('bs_box', 'Место хранения (морозильник, полка, коробка, ячейка)', 'text', { safeText: true }),
      F('bs_temp', 'Условия хранения', 'select', { options: ['-80 °C', '-20 °C', 'жидкий азот', '+4 °C', 'комнатная (FFPE)'] }),
      F('bs_consent', 'Есть согласие на хранение в биобанке', 'yesno', { required: true }),
      F('bs_status', 'Статус', 'select', { options: this.STATUS, def: 'в хранилище' }),
      F('bs_to', 'Передан (лаборатория)', 'text', { safeText: true, showIf: { key: 'bs_status', op: 'eq', value: 'передан в лабораторию' } }),
      F('bs_sent', 'Дата передачи', 'date', { showIf: { key: 'bs_status', op: 'eq', value: 'передан в лабораторию' } })
    ] }] };
  },
  has(reg) { return (reg.eventTypes || []).some(e => e.id === this.FORM_ID); },
  async addForm(reg) {
    const fresh = await DB.get('registries', reg.id);
    if (this.has(fresh)) return fresh;
    fresh.eventTypes = [...fresh.eventTypes, this.form()];
    return DB.put('registries', fresh, 'добавлена форма «Биообразец»');
  },
  async samples(regs) {
    const out = [];
    for (const reg of regs.filter(r => this.has(r))) {
      const [patients, events] = await Promise.all([Data.patients(reg.id), Data.events(reg.id)]);
      const byId = new Map(patients.map(p => [p.id, p]));
      for (const e of events.filter(x => x.type === this.FORM_ID)) {
        const p = byId.get(e.patientId); if (!p) continue;
        out.push({ reg, p, e, d: e.data || {} });
      }
    }
    return out.sort((a, b) => String(b.e.date).localeCompare(String(a.e.date)));
  },
  /* манифест: код пациента вместо ФИО (постоянный ID AddAll), только образцы с согласием */
  manifest(list, { dates = true } = {}) {
    const head = ['№', 'Номер образца', 'Код пациента', 'Тип образца', 'Откуда получен', dates ? 'Дата забора' : 'Год забора', 'Объём', 'Единица', 'Условия хранения', 'Место хранения', 'Примечание лаборатории'];
    const rows = list.filter(s => s.d.bs_consent === 'да').map((s, i) => [i + 1, s.d.bs_id || '', s.p.pid || 'P' + String(i + 1).padStart(5, '0'), s.d.bs_type || '', s.d.bs_source || '',
      dates ? s.e.date || '' : String(s.e.date || '').slice(0, 4), s.d.bs_volume ?? '', s.d.bs_unit || '', s.d.bs_temp || '', s.d.bs_box || '', '']);
    return { head, rows, skipped: list.length - rows.length };
  },
  /* учебный режим: по одному-два образца у первых пациентов */
  async demo(reg) {
    const patients = (await Data.patients(reg.id)).slice(0, 14);
    const types = [['ткань опухоли, свежезамороженная', 'операционный материал', 'мг', '-80 °C'], ['плазма', 'венепункция', 'мл', '-80 °C'], ['ткань опухоли, FFPE-блок', 'биопсия', 'блоков', 'комнатная (FFPE)']];
    let n = 0;
    for (const [i, p] of patients.entries()) {
      for (const k of i % 3 ? [0] : [0, 1]) {
        const t = types[(i + k) % types.length], status = i % 5 === 4 ? 'передан в лабораторию' : 'в хранилище';
        const date = new Date(Date.now() - (30 + i * 11) * 864e5).toISOString().slice(0, 10);
        await DB.put('events', { patientId: p.id, registryId: reg.id, type: this.FORM_ID, date, status: 'завершено', schemaVersion: reg.version, ownerId: Auth.user.id, synthetic: true,
          data: { bs_id: 'BB-' + date.slice(2, 4) + '-' + String(1000 + n), bs_type: t[0], bs_source: t[1], bs_volume: t[2] === 'мл' ? 2 : t[2] === 'мг' ? 50 : 1, bs_unit: t[2], bs_temp: t[3],
            bs_box: `Морозильник ${1 + i % 2}, полка ${1 + k}, коробка ${String.fromCharCode(65 + i % 4)}, ячейка ${1 + n % 81}`, bs_consent: i === 6 ? 'нет' : 'да', bs_status: status,
            ...(status === 'передан в лабораторию' ? { bs_to: 'Лаборатория молекулярной генетики', bs_sent: today() } : {}) } }, 'учебный биообразец');
        n++;
      }
    }
    return n;
  }
};

Routes.biobank = async (main, regId = '') => {
  const hash = location.hash;
  const regs = await Data.registries();
  if (location.hash !== hash) return;
  const withForm = regs.filter(r => Biobank.has(r));
  const pick = regs.find(r => r.id === regId) || withForm[0] || regs[0];
  main.innerHTML = `<div class="head"><h1>Биобанк</h1><a class="btn" href="#registry-export">Выгрузка регистра</a></div>
    <section class="card" id="bbSetup"><p>Образец заносится в карточку пациента формой «Биообразец»: номер, тип, дата забора, место хранения, согласие и статус.
      Здесь видны все образцы доступных регистров, а манифест для лаборатории содержит код пациента вместо ФИО.</p>
      <div class="row">${regs.length ? regSelect(regs, pick?.id || '', 'bbReg', false) : ''}
      ${pick && !Biobank.has(pick) && can('design') ? '<button class="btn primary" id="bbAdd">Добавить форму «Биообразец» в этот регистр</button>' : ''}
      ${pick && !Biobank.has(pick) && !can('design') ? '<span class="muted">В этом регистре нет формы «Биообразец». Попросите администратора регистра добавить её.</span>' : ''}
      ${pick && Biobank.has(pick) && typeof TRAIN !== 'undefined' && TRAIN && can('enter') ? '<button class="btn" id="bbDemo">Создать учебные образцы</button>' : ''}</div></section>
    <section class="card" id="bbList"><div class="row"><input class="inp" id="bbSearch" placeholder="Номер образца, пациент, место хранения" aria-label="Поиск образца">
      <select class="inp" id="bbStatus" aria-label="Статус"><option value="">Все статусы</option>${Biobank.STATUS.map(s => `<option>${esc(s)}</option>`).join('')}</select>
      <select class="inp" id="bbType" aria-label="Тип образца"><option value="">Все типы</option>${Biobank.TYPES.map(s => `<option>${esc(s)}</option>`).join('')}</select></div>
      <div id="bbTable"><p class="muted">Загрузка…</p></div>
      <div class="row"><label class="chk"><input type="checkbox" id="bbDates" checked>Даты забора в манифесте</label>
      <button class="btn primary" id="bbManifest">Манифест для лаборатории (Excel)</button><span class="muted small" id="bbNote"></span></div></section>`;
  const sel = $('#bbReg', main); if (sel) sel.onchange = () => go('biobank/' + sel.value);
  const add = $('#bbAdd', main);
  if (add) add.onclick = async () => {
    if (!await confirmBox(`Добавить форму «Биообразец» в регистр «${pick.name}»? Она появится в карточке каждого пациента.`)) return;
    await Biobank.addForm(pick); toast('Форма добавлена'); App.route();
  };
  const demo = $('#bbDemo', main);
  if (demo) demo.onclick = async () => { demo.disabled = true; const n = await Biobank.demo(pick); toast('Учебных образцов: ' + n); App.route(); };
  const all = await Biobank.samples(regs);
  if (location.hash !== hash) return;
  const chosen = new Set();
  const draw = () => {
    const q = $('#bbSearch', main).value.trim().toLowerCase(), st = $('#bbStatus', main).value, ty = $('#bbType', main).value;
    const list = all.filter(s => (!st || s.d.bs_status === st) && (!ty || s.d.bs_type === ty)
      && (!q || [s.d.bs_id, pname(s.p), s.p.pid, s.d.bs_type, s.d.bs_box, s.d.bs_to].join(' ').toLowerCase().includes(q)));
    $('#bbTable', main).innerHTML = list.length ? `<div style="overflow-x:auto"><table class="tbl hover" id="bbRows"><thead><tr><th><input type="checkbox" id="bbAll" aria-label="Отметить все"></th><th>Номер</th><th>Пациент</th><th>Тип</th><th>Дата забора</th><th>Хранение</th><th>Статус</th><th>Согласие</th></tr></thead><tbody>
      ${list.map(s => `<tr data-bb="${esc(s.e.id)}"><td><input type="checkbox" data-bbsel="${esc(s.e.id)}" ${chosen.has(s.e.id) ? 'checked' : ''} aria-label="Отметить образец"></td><td style="white-space:nowrap"><b>${esc(s.d.bs_id || '')}</b></td>
        <td><a href="#patient/${esc(s.p.id)}">${esc(pname(s.p))}</a><div class="muted small">${esc(s.reg.name)}</div></td><td>${esc(s.d.bs_type || '')}${s.d.bs_volume != null && s.d.bs_volume !== '' ? `<div class="muted small">${esc(s.d.bs_volume)} ${esc(s.d.bs_unit || '')}</div>` : ''}</td>
        <td>${esc(fmtDate ? fmtDate(s.e.date) : s.e.date)}</td><td>${esc(s.d.bs_box || '')}<div class="muted small">${esc(s.d.bs_temp || '')}</div></td>
        <td>${esc(s.d.bs_status || '')}${s.d.bs_to ? `<div class="muted small">${esc(s.d.bs_to)}</div>` : ''}</td><td>${s.d.bs_consent === 'да' ? 'да' : '<span class="bad">нет</span>'}</td></tr>`).join('')}</tbody></table></div>
      <p class="muted small">Всего образцов: ${list.length}. Отмеченные попадут в манифест; если ничего не отмечено, в манифест войдут все показанные.</p>`
      : `<p class="muted">${all.length ? 'Ничего не найдено.' : 'Образцов пока нет. Откройте карточку пациента и добавьте форму «Биообразец».'}</p>`;
    const head = $('#bbAll', main);
    if (head) head.onchange = () => { list.forEach(s => head.checked ? chosen.add(s.e.id) : chosen.delete(s.e.id)); draw(); };
    return list;
  };
  let shown = draw();
  $('#bbSearch', main).oninput = () => { shown = draw(); };
  $('#bbStatus', main).onchange = $('#bbType', main).onchange = () => { shown = draw(); };
  $('#bbTable', main).onclick = e => {
    const box = e.target.closest('[data-bbsel]');
    if (box) { box.checked ? chosen.add(box.dataset.bbsel) : chosen.delete(box.dataset.bbsel); return; }
    if (e.target.closest('a, input')) return;
    const row = e.target.closest('[data-bb]'); if (!row) return;
    const s = all.find(x => x.e.id === row.dataset.bb);
    if (s && typeof eventDialog === 'function') eventDialog(s.p, s.reg, s.e);
  };
  $('#bbManifest', main).onclick = async () => {
    const list = chosen.size ? all.filter(s => chosen.has(s.e.id)) : shown;
    if (!list.length) return toast('Нет образцов для манифеста', 'err');
    const m = Biobank.manifest(list, { dates: $('#bbDates', main).checked });
    if (!m.rows.length) return toast('У выбранных образцов нет согласия на биобанк', 'err');
    await Audit.log('манифест биообразцов: ' + m.rows.length, 'registries', list[0].reg.id, null, null);
    Office.book('manifest_biosamples_' + today() + '.xlsx', [{ name: 'Manifest', rows: [m.head, ...m.rows] },
      { name: 'README', rows: [['Манифест биообразцов AddAll'], ['Сформирован', nowISO()], ['Образцов', m.rows.length], ['Код пациента: постоянный ID AddAll (AA-XXXX-XXXX-K). ФИО и номера историй не передаются.'],
        ['Результаты лаборатории возвращайте с кодом пациента и номером образца: так их можно внести в регистр.']] }]);
    $('#bbNote', main).textContent = 'В манифесте ' + m.rows.length + (m.skipped ? ', без согласия пропущено ' + m.skipped : '') + '.';
  };
};
ROUTE_GROUP.biobank = 'Наука';
NAV_ICONS.biobank = NAV_ICONS.biobank || '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/>';

{
  const previous = navGroups;
  navGroups = async function () {
    const groups = await previous();
    const sci = groups.find(g => g.id === 'sci');
    if (sci?.items && can('enter') && !sci.items.some(x => x && x.r === 'biobank')) {
      const at = sci.items.findIndex(x => x && x.r === 'analytics');
      sci.items.splice(at < 0 ? sci.items.length : at + 1, 0, { r: 'biobank', t: 'Биобанк', i: '⚗' });
    }
    return groups;
  };
}
