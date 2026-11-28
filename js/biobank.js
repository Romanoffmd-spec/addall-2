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

  /* гистологическое заключение: бланк из хранилища разбирает автопилот ИИ, форма не требует эпизода (биопсия бывает задолго до операции) */
  HIST_ID: 'histology',
  ORGANS: ['прямая кишка', 'сигмовидная кишка', 'ободочная кишка', 'слепая кишка', 'анальный канал', 'аппендикс', 'тонкая кишка', 'желудок', 'печень', 'лёгкое', 'брюшина', 'яичник', 'лимфатический узел', 'другое'],
  histForm() {
    const yn = (k, l, d) => F(k, l, 'yesno', d ? { def: d } : {});
    return { id: this.HIST_ID, name: 'Гистологическое заключение', color: '#7b4fa0', dateLabel: 'Дата забора материала', noEpisode: true,
      def: 'Бланк патоморфологического исследования. Заполняется автопилотом ИИ из бланков в хранилище, каждое значение с цитатой из бланка.', sections: [
      { id: uid('s'), title: 'Бланк', fields: [
        F('hs_no', 'Номер гистологического заключения', 'text', { safeText: true }),
        F('hs_lab', 'Патоморфологическая лаборатория', 'text', { safeText: true }),
        F('hs_rdate', 'Дата заключения', 'date'),
        F('hs_material', 'Вид материала', 'select', { options: ['эндоскопическая биопсия', 'биопсия (другая)', 'пункционная биопсия', 'эндоскопическая резекция (полипэктомия)', 'операционный материал', 'срочное интраоперационное исследование', 'другое'] }),
        F('hs_stage', 'Когда взят материал', 'select', { options: ['до лечения', 'после неоадъювантной терапии', 'операция без неоадъювантной терапии', 'рецидив или прогрессирование', 'другое'] }),
        F('hs_organ', 'Орган', 'select', { options: this.ORGANS }),
        F('hs_site', 'Локализация (уровень, отдел, расстояние)', 'text', { safeText: true }),
        F('hs_op', 'Операция (для операционного материала)', 'text', { safeText: true }),
        F('hs_size', 'Размер опухоли, мм', 'number', { min: 0, max: 300 })
      ] },
      { id: uid('s'), title: 'Опухоль', fields: [
        F('hs_type', 'Гистологический тип', 'select', { options: ['аденокарцинома', 'муцинозная аденокарцинома', 'перстневидноклеточный рак', 'медуллярный рак', 'плоскоклеточный рак', 'нейроэндокринная опухоль', 'нейроэндокринный рак', 'тубулярная аденома', 'тубуло-ворсинчатая аденома', 'ворсинчатая аденома', 'зубчатая аденома', 'гиперпластический полип', 'без опухолевого роста', 'другое'] }),
        F('hs_grade', 'Степень дифференцировки', 'select', { options: ['G1 (высокодифференцированная)', 'G2 (умереннодифференцированная)', 'G3 (низкодифференцированная)', 'G4 (недифференцированная)', 'low grade', 'high grade', 'не определяется'] }),
        F('hs_dysplasia', 'Дисплазия', 'select', { options: ['нет', 'низкой степени', 'высокой степени'] }),
        F('hs_icdo', 'Код морфологии МКБ-О', 'text', { safeText: true, def: 'Например, 8140/3' }),
        yn('hs_yp', 'Префикс y (после неоадъювантной терапии)'),
        F('hs_pt', 'pT', 'select', { options: ['T0', 'Tis', 'T1', 'T2', 'T3', 'T4a', 'T4b', 'Tx'] }),
        F('hs_pn', 'pN', 'select', { options: ['N0', 'N1a', 'N1b', 'N1c', 'N2a', 'N2b', 'Nx'] }),
        F('hs_pm', 'pM', 'select', { options: ['M0', 'M1a', 'M1b', 'M1c', 'Mx'] }),
        F('hs_ln', 'Лимфоузлов исследовано', 'number', { min: 0, max: 150 }),
        F('hs_lnpos', 'Лимфоузлов с метастазами', 'number', { min: 0, max: 150 }),
        yn('hs_dep', 'Опухолевые депозиты'),
        yn('hs_lvi', 'Лимфоваскулярная инвазия'),
        yn('hs_pni', 'Периневральная инвазия'),
        yn('hs_emvi', 'Экстрамуральная венозная инвазия (EMVI)'),
        F('hs_bud', 'Опухолевое почкование (budding)', 'select', { options: ['Bd1', 'Bd2', 'Bd3', 'не оценивалось'] })
      ] },
      { id: uid('s'), title: 'Края резекции и ответ на лечение', fields: [
        F('hs_crmmm', 'CRM, мм', 'number', { min: 0, max: 100, def: 'Расстояние до циркулярного края резекции' }),
        F('hs_crm', 'CRM', 'select', { options: ['отрицательный (больше 1 мм)', 'положительный (1 мм и меньше)', 'не оценивался'] }),
        F('hs_dist', 'Дистальный край резекции, мм', 'number', { min: 0, max: 500 }),
        F('hs_r', 'Радикальность (R)', 'select', { options: ['R0', 'R1', 'R2', 'Rx'] }),
        F('hs_quirke', 'Качество мезоректумэктомии (Quirke)', 'select', { options: ['полная (grade 3)', 'почти полная (grade 2)', 'неполная (grade 1)'] }),
        F('hs_trgsys', 'Шкала регресса опухоли', 'select', { options: ['AJCC/CAP', 'Mandard', 'Dworak', 'Ryan'] }),
        F('hs_trg', 'Степень регресса (TRG)', 'select', { options: ['0', '1', '2', '3', '4', '5'] })
      ] },
      { id: uid('s'), title: 'Молекулярные исследования', fields: [
        F('hs_mmr', 'MMR / MSI', 'select', { options: ['pMMR / MSS', 'dMMR / MSI-H', 'не исследован'] }),
        F('hs_kras', 'KRAS', 'select', { options: ['дикий тип', 'мутация', 'не исследован'] }),
        F('hs_nras', 'NRAS', 'select', { options: ['дикий тип', 'мутация', 'не исследован'] }),
        F('hs_braf', 'BRAF V600E', 'select', { options: ['нет мутации', 'мутация', 'не исследован'] }),
        F('hs_her2', 'HER2', 'select', { options: ['отрицательный', 'положительный', 'не исследован'] })
      ] },
      { id: uid('s'), title: 'Заключение', fields: [F('hs_concl', 'Текст заключения', 'textarea')] }
    ] };
  },
  hasHist(reg) { return (reg.eventTypes || []).some(e => e.id === this.HIST_ID); },
  async addHist(reg) {
    const fresh = await DB.get('registries', reg.id);
    if (this.hasHist(fresh)) return fresh;
    fresh.eventTypes = [...fresh.eventTypes, this.histForm()];
    return DB.put('registries', fresh, 'добавлена форма «Гистологическое заключение»');
  },
  async histology(regs) {
    const out = [];
    for (const reg of regs.filter(r => this.hasHist(r))) {
      const [patients, events] = await Promise.all([Data.patients(reg.id), Data.events(reg.id)]);
      const byId = new Map(patients.map(p => [p.id, p]));
      for (const e of events.filter(x => x.type === this.HIST_ID)) { const p = byId.get(e.patientId); if (p) out.push({ reg, p, e, d: e.data || {} }); }
    }
    return out.sort((a, b) => String(b.e.date).localeCompare(String(a.e.date)));
  },
  /* таблица гистологий для Excel: с ФИО для отделения или с кодом пациента для лаборатории и науки */
  histRows(list, { coded = false } = {}) {
    const fields = formFields(this.histForm()).filter(f => !(coded && f.type === 'textarea'));
    const tnm = d => { const pre = d.hs_yp === 'да' ? 'yp' : 'p'; return [d.hs_pt && pre + d.hs_pt, d.hs_pn && pre + d.hs_pn, d.hs_pm].filter(Boolean).join(' '); };
    const head = [...(coded ? ['Код пациента'] : ['Пациент', '№ ИБ', 'Дата рождения']), 'Регистр', 'Дата забора', 'TNM', ...fields.map(f => f.label), 'Источник', 'Проверено врачом'];
    const rows = list.map(s => [...(coded ? [s.p.pid || ''] : [pname(s.p), s.p.localId || '', s.p.birthDate || '']), s.reg.name, s.e.date || '', tnm(s.d),
      ...fields.map(f => { const v = s.d[f.key]; return Array.isArray(v) ? v.join(', ') : v ?? ''; }), s.e.intakeFile || (s.e.aiAuto ? 'бланк из хранилища' : 'вручную'), s.e.aiCheck === 'ожидает' ? 'нет' : 'да']);
    return { head, rows };
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
  /* вкладка «Гистологии»: все поля бланка в ячейках, фильтры и выгрузка */
  async histPage(main, regs, hash) {
    const all = await this.histology(regs);
    if (location.hash !== hash) return;
    let shown = [];
    const draw = () => {
      const q = $('#hsSearch', main).value.trim().toLowerCase(), organ = $('#hsOrgan', main).value, stage = $('#hsStage', main).value, pend = $('#hsPending', main).checked;
      shown = all.filter(s => (!organ || s.d.hs_organ === organ) && (!stage || s.d.hs_stage === stage) && (!pend || s.e.aiCheck === 'ожидает')
        && (!q || [pname(s.p), s.p.localId, s.d.hs_no, s.d.hs_type, s.d.hs_organ, s.d.hs_site, s.d.hs_concl].join(' ').toLowerCase().includes(q)));
      if (!shown.length) { $('#hsTable', main).innerHTML = `<p class="muted">${all.length ? 'Ничего не найдено.' : 'Гистологических заключений пока нет. Положите бланки в общую папку хранилища: автопилот разберёт их ночью. Можно и вручную: карточка пациента, форма «Гистологическое заключение».'}</p>`; return; }
      const { head, rows } = this.histRows(shown);
      $('#hsTable', main).innerHTML = `<div style="overflow-x:auto"><table class="tbl hover small" id="hsRows"><thead><tr>${head.map(h => `<th style="white-space:nowrap">${esc(h)}</th>`).join('')}</tr></thead><tbody>
        ${rows.map((r, i) => `<tr data-hs="${esc(shown[i].e.id)}">${r.map((c, j) => j === 0 ? `<td style="white-space:nowrap"><a href="#patient/${esc(shown[i].p.id)}">${esc(c)}</a>${shown[i].e.aiCheck === 'ожидает' ? ' <span class="badge warn">ИИ, ждёт проверки</span>' : ''}</td>`
          : `<td${String(c).length > 60 ? ' style="min-width:260px"' : ''}>${esc(String(c).slice(0, 400))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
        <p class="muted small">Заключений: ${shown.length}. Строка открывает форму с цитатами из бланка.</p>`;
    };
    draw();
    $('#hsSearch', main).oninput = draw;
    $('#hsOrgan', main).onchange = $('#hsStage', main).onchange = $('#hsPending', main).onchange = draw;
    $('#hsTable', main).onclick = e => {
      if (e.target.closest('a')) return;
      const row = e.target.closest('[data-hs]'); if (!row) return;
      const s = all.find(x => x.e.id === row.dataset.hs);
      if (s && typeof eventDialog === 'function') eventDialog(s.p, s.reg, s.e);
    };
    const xls = async coded => {
      if (!shown.length) return toast('Нет заключений для выгрузки', 'err');
      const { head, rows } = this.histRows(shown, { coded });
      await Audit.log('выгрузка гистологических заключений' + (coded ? ' без ФИО' : '') + ': ' + rows.length, 'registries', shown[0].reg.id, null, null);
      Office.book('histology_' + today() + (coded ? '_coded' : '') + '.xlsx', [{ name: 'Гистологии', rows: [head, ...rows] }]);
      $('#hsNote', main).textContent = 'В файле ' + rows.length + '.';
    };
    $('#hsXlsx', main).onclick = () => xls(false);
    $('#hsXlsxCoded', main).onclick = () => xls(true);
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

Routes.biobank = async (main, regId = '', tab = '') => {
  const hash = location.hash;
  const regs = await Data.registries();
  if (location.hash !== hash) return;
  const withForm = regs.filter(r => Biobank.has(r) || Biobank.hasHist(r));
  const pick = regs.find(r => r.id === regId) || withForm[0] || regs[0];
  const hist = tab === 'hist';
  const train = typeof TRAIN !== 'undefined' && TRAIN;
  main.innerHTML = `<div class="head"><h1>Биобанк</h1><a class="btn" href="#registry-export">Выгрузка регистра</a></div>
    <div class="tabs" role="tablist" id="bbTabs"><a class="${hist ? '' : 'on'}" href="#biobank/${esc(pick?.id || '')}" role="tab" aria-selected="${!hist}">Образцы</a><a class="${hist ? 'on' : ''}" href="#biobank/${esc(pick?.id || '')}/hist" role="tab" id="bbHistTab" aria-selected="${hist}">Гистологии</a></div>
    <section class="card" id="bbSetup">${hist
      ? `<p>Бланки гистологических заключений из общего хранилища разбирает автопилот ИИ: находит пациента по № истории болезни (или заводит новую карточку), заполняет форму «Гистологическое заключение» с цитатой из бланка на каждое значение и ставит отметку «ждёт проверки». Здесь все заключения одним списком: морфология, орган, когда взят материал, pTNM, лимфоузлы, CRM, R, регресс опухоли, молекулярные маркёры.</p>`
      : `<p>Образец заносится в карточку пациента формой «Биообразец»: номер, тип, дата забора, место хранения, согласие и статус.
      Здесь видны все образцы доступных регистров, а список для отправки в лабораторию содержит код пациента вместо ФИО.</p>`}
      <div class="row">${regs.length ? regSelect(regs, pick?.id || '', 'bbReg', false) : ''}
      ${pick && !hist && !Biobank.has(pick) && can('design') ? '<button class="btn primary" id="bbAdd">Добавить форму «Биообразец» в этот регистр</button>' : ''}
      ${pick && hist && !Biobank.hasHist(pick) && can('design') ? '<button class="btn primary" id="bbAddHist">Добавить форму «Гистологическое заключение» в этот регистр</button>' : ''}
      ${hist && can('design') && regs.filter(r => !r.archivedAt && !Biobank.hasHist(r)).length > 1 ? '<button class="btn" id="bbAddHistAll">Добавить во все регистры</button>' : ''}
      ${pick && (hist ? !Biobank.hasHist(pick) : !Biobank.has(pick)) && !can('design') ? `<span class="muted">В этом регистре нет формы «${hist ? 'Гистологическое заключение' : 'Биообразец'}». Попросите администратора регистра добавить её.</span>` : ''}
      ${pick && !hist && Biobank.has(pick) && train && can('enter') ? '<button class="btn" id="bbDemo">Создать учебные образцы</button>' : ''}</div></section>
    ${hist ? `<section class="card" id="hsList"><div class="row"><input class="inp" id="hsSearch" placeholder="Пациент, № ИБ, № заключения, морфология" aria-label="Поиск заключения">
      <select class="inp" id="hsOrgan" aria-label="Орган"><option value="">Все органы</option>${Biobank.ORGANS.map(s => `<option>${esc(s)}</option>`).join('')}</select>
      <select class="inp" id="hsStage" aria-label="Когда взят материал"><option value="">До и после лечения</option>${['до лечения', 'после неоадъювантной терапии', 'операция без неоадъювантной терапии', 'рецидив или прогрессирование'].map(s => `<option>${esc(s)}</option>`).join('')}</select>
      <label class="chk"><input type="checkbox" id="hsPending">Только ждут проверки</label></div>
      <div id="hsTable"><p class="muted">Загрузка…</p></div>
      <div class="row"><button class="btn primary" id="hsXlsx">Excel: все поля</button><button class="btn" id="hsXlsxCoded" title="Код пациента AddAll вместо ФИО, без текста заключения">Excel без ФИО</button><span class="muted small" id="hsNote"></span></div></section>`
    : `<section class="card" id="bbList"><div class="row"><input class="inp" id="bbSearch" placeholder="Номер образца, пациент, место хранения" aria-label="Поиск образца">
      <select class="inp" id="bbStatus" aria-label="Статус"><option value="">Все статусы</option>${Biobank.STATUS.map(s => `<option>${esc(s)}</option>`).join('')}</select>
      <select class="inp" id="bbType" aria-label="Тип образца"><option value="">Все типы</option>${Biobank.TYPES.map(s => `<option>${esc(s)}</option>`).join('')}</select></div>
      <div id="bbTable"><p class="muted">Загрузка…</p></div>
      <div class="row"><label class="chk"><input type="checkbox" id="bbDates" checked>Даты забора в списке</label>
      <button class="btn primary" id="bbManifest">Список образцов для отправки в лабораторию (Excel)</button><span class="muted small" id="bbNote"></span></div></section>`}`;
  const sel = $('#bbReg', main); if (sel) sel.onchange = () => go('biobank/' + sel.value + (hist ? '/hist' : ''));
  const add = $('#bbAdd', main);
  if (add) add.onclick = async () => {
    if (!await confirmBox(`Добавить форму «Биообразец» в регистр «${pick.name}»? Она появится в карточке каждого пациента.`)) return;
    await Biobank.addForm(pick); toast('Форма добавлена'); App.route();
  };
  const addH = $('#bbAddHist', main);
  if (addH) addH.onclick = async () => {
    if (!await confirmBox(`Добавить форму «Гистологическое заключение» в регистр «${pick.name}»? Автопилот ИИ начнёт заполнять её из бланков в хранилище.`)) return;
    await Biobank.addHist(pick); toast('Форма добавлена'); App.route();
  };
  const addHA = $('#bbAddHistAll', main);
  if (addHA) addHA.onclick = async () => {
    const list = regs.filter(r => !r.archivedAt && !Biobank.hasHist(r));
    if (!await confirmBox(`Добавить форму «Гистологическое заключение» во все регистры (${list.length})?`)) return;
    for (const r of list) await Biobank.addHist(r);
    toast('Форма добавлена в регистры: ' + list.length); App.route();
  };
  const demo = $('#bbDemo', main);
  if (demo) demo.onclick = async () => { demo.disabled = true; const n = await Biobank.demo(pick); toast('Учебных образцов: ' + n); App.route(); };
  if (hist) return Biobank.histPage(main, regs, hash);
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
      <p class="muted small">Всего образцов: ${list.length}. Отмеченные попадут в список для лаборатории; если ничего не отмечено, войдут все показанные.</p>`
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
    if (!list.length) return toast('Нет образцов для списка', 'err');
    const m = Biobank.manifest(list, { dates: $('#bbDates', main).checked });
    if (!m.rows.length) return toast('У выбранных образцов нет согласия на биобанк', 'err');
    await Audit.log('список биообразцов для лаборатории: ' + m.rows.length, 'registries', list[0].reg.id, null, null);
    Office.book('manifest_biosamples_' + today() + '.xlsx', [{ name: 'Manifest', rows: [m.head, ...m.rows] },
      { name: 'README', rows: [['Список биообразцов для лаборатории (AddAll)'], ['Сформирован', nowISO()], ['Образцов', m.rows.length], ['Код пациента: постоянный ID AddAll (AA-XXXX-XXXX-K). ФИО и номера историй не передаются.'],
        ['Результаты лаборатории возвращайте с кодом пациента и номером образца: так их можно внести в регистр.']] }]);
    $('#bbNote', main).textContent = 'В списке ' + m.rows.length + (m.skipped ? ', без согласия пропущено ' + m.skipped : '') + '.';
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
