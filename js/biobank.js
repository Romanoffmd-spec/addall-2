/* AddAll 2.0: гистологические заключения.
   Бланки гистологий из общего хранилища разбирает автопилот ИИ и заполняет форму «Гистологическое заключение» (id histology).
   Раздел «Гистологии» (маршрут biobank, имя оставлено для совместимости ссылок): все заключения доступных регистров одной таблицей,
   каждое поле бланка в своей ячейке, фильтры и выгрузка в Excel. */
'use strict';

const Biobank = {
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
  /* таблица гистологий для Excel: с ФИО для отделения или с кодом пациента для науки */
  histRows(list, { coded = false } = {}) {
    const fields = formFields(this.histForm()).filter(f => !(coded && f.type === 'textarea'));
    const tnm = d => { const pre = d.hs_yp === 'да' ? 'yp' : 'p'; return [d.hs_pt && pre + d.hs_pt, d.hs_pn && pre + d.hs_pn, d.hs_pm].filter(Boolean).join(' '); };
    const head = [...(coded ? ['Код пациента'] : ['Пациент', '№ ИБ', 'Дата рождения']), 'Регистр', 'Дата забора', 'TNM', ...fields.map(f => f.label), 'Источник', 'Проверено врачом'];
    const rows = list.map(s => [...(coded ? [s.p.pid || ''] : [pname(s.p), s.p.localId || '', s.p.birthDate || '']), s.reg.name, s.e.date || '', tnm(s.d),
      ...fields.map(f => { const v = s.d[f.key]; return Array.isArray(v) ? v.join(', ') : v ?? ''; }), s.e.intakeFile || (s.e.aiAuto ? 'бланк из хранилища' : 'вручную'), s.e.aiCheck === 'ожидает' ? 'нет' : 'да']);
    return { head, rows };
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
  }
};

Routes.biobank = async (main, regId = '') => {
  const hash = location.hash;
  const regs = await Data.registries();
  if (location.hash !== hash) return;
  const pick = regs.find(r => r.id === regId) || regs.find(r => Biobank.hasHist(r)) || regs[0];
  main.innerHTML = `<div class="head"><h1>Гистологии</h1><a class="btn" href="#registry-export">Выгрузка регистра</a></div>
    <section class="card" id="bbSetup"><p>Хранилище гистологических заключений. Бланки из общей папки хранилища разбирает автопилот ИИ: находит пациента по № истории болезни (или заводит новую карточку), заполняет форму «Гистологическое заключение» с цитатой из бланка на каждое значение и ставит отметку «ждёт проверки». Здесь все заключения одним списком: морфология, орган, когда взят материал, pTNM, лимфоузлы, CRM, R, регресс опухоли, молекулярные маркёры.</p>
      <div class="row">${regs.length ? regSelect(regs, pick?.id || '', 'bbReg', false) : ''}
      ${pick && !Biobank.hasHist(pick) && can('design') ? '<button class="btn primary" id="bbAddHist" style="white-space:normal">Добавить форму «Гистологическое заключение» в этот регистр</button>' : ''}
      ${can('design') && regs.filter(r => !r.archivedAt && !Biobank.hasHist(r)).length > 1 ? '<button class="btn" id="bbAddHistAll">Добавить во все регистры</button>' : ''}
      ${pick && !Biobank.hasHist(pick) && !can('design') ? '<span class="muted">В этом регистре нет формы «Гистологическое заключение». Попросите администратора регистра добавить её.</span>' : ''}</div></section>
    <section class="card" id="hsList"><div class="row"><input class="inp" id="hsSearch" placeholder="Пациент, № ИБ, № заключения, морфология" aria-label="Поиск заключения">
      <select class="inp" id="hsOrgan" aria-label="Орган"><option value="">Все органы</option>${Biobank.ORGANS.map(s => `<option>${esc(s)}</option>`).join('')}</select>
      <select class="inp" id="hsStage" aria-label="Когда взят материал"><option value="">До и после лечения</option>${['до лечения', 'после неоадъювантной терапии', 'операция без неоадъювантной терапии', 'рецидив или прогрессирование'].map(s => `<option>${esc(s)}</option>`).join('')}</select>
      <label class="chk"><input type="checkbox" id="hsPending">Только ждут проверки</label></div>
      <div id="hsTable"><p class="muted">Загрузка…</p></div>
      <div class="row"><button class="btn primary" id="hsXlsx">Excel: все поля</button><button class="btn" id="hsXlsxCoded" title="Код пациента AddAll вместо ФИО, без текста заключения">Excel без ФИО</button><span class="muted small" id="hsNote"></span></div></section>`;
  const sel = $('#bbReg', main); if (sel) sel.onchange = () => go('biobank/' + sel.value);
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
  return Biobank.histPage(main, regs, hash);
};
ROUTE_GROUP.biobank = 'Регистры';
NAV_ICONS.biobank = '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 12h7M9 16h7"/>';

/* отдельным блоком в разделе «Регистры», после списка регистров */
{
  const previous = navGroups;
  navGroups = async function () {
    const groups = await previous();
    const regs = groups.find(g => g.id === 'regs');
    if (regs?.items && can('enter') && !regs.items.some(x => x && x.r === 'biobank')) {
      const at = regs.items.findIndex(x => x && x.sep === '');
      regs.items.splice(at < 0 ? regs.items.length : at, 0, { sep: 'Патоморфология' }, { r: 'biobank', t: 'Гистологии', i: '🔬' });
    }
    return groups;
  };
}
