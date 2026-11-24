/* AddAll 2.0: второй пакет по образцу Dendrite
   шкалы (Charlson, mFI-5, CFS, ECOG, ASA), библиотека анкет, шаблоны (вентральная грыжа EHS, несостоятельность анастомоза),
   перенос данных из прошлых записей, исправления через администратора, самопродление доступа, проверки регистрации,
   делегаты с подтверждением врача, маршрут направления к МДК, обратная связь и справка на входе, английский интерфейс */
'use strict';

/* ================= ШКАЛЫ ================= */
Object.assign(RISK_BLOCKS, {
  charlson: { name: 'Индекс коморбидности Charlson (с поправкой на возраст)', make: (p = 'ch_') => ({ id: uid('s'), title: 'Коморбидность: Charlson', fields: [
    F(p + 'age', 'Возраст на дату события', 'calc', { formula: 'age(birthDate, eventDate)', unit: 'лет' }),
    F(p + 'items', 'Сопутствующие заболевания', 'multiselect', { key_: true, options: ['нет', 'инфаркт миокарда (1)', 'хроническая сердечная недостаточность (1)', 'заболевания периферических сосудов (1)', 'цереброваскулярная болезнь, ТИА (1)', 'деменция (1)', 'хроническая болезнь лёгких (1)', 'болезнь соединительной ткани (1)', 'язвенная болезнь (1)', 'лёгкое поражение печени (1)', 'сахарный диабет без осложнений (1)', 'сахарный диабет с поражением органов (2)', 'гемиплегия (2)', 'умеренная или тяжёлая болезнь почек (2)', 'солидная опухоль без метастазов (2)', 'лейкоз (2)', 'лимфома (2)', 'умеренное или тяжёлое поражение печени (3)', 'метастатическая солидная опухоль (6)', 'СПИД (6)'], def: 'Charlson ME и соавт., 1987. Каждое заболевание даёт указанные баллы. Опухоль, по поводу которой пациент включён в регистр, обычно не учитывают.' }),
    F(p + 'cci', 'Индекс Charlson', 'calc', { formula: `ptsum(${p}items)` }),
    F(p + 'acci', 'Индекс Charlson с поправкой на возраст', 'calc', { formula: `ptsum(${p}items) + chAge(${p}age)`, def: 'Возраст: 50-59 = 1, 60-69 = 2, 70-79 = 3, 80 и старше = 4 балла.' }),
    F(p + 'surv', 'Ожидаемая 10-летняя выживаемость', 'calc', { formula: `round(100 * Math.pow(0.983, Math.exp(ptsum(${p}items) * 0.9)), 0)`, unit: '%', def: '0,983^(e^(0,9 × CCI)), Charlson 1987.' })
  ] }) },
  mfi5: { name: 'Модифицированный индекс хрупкости mFI-5', make: (p = 'mfi_') => ({ id: uid('s'), title: 'Хрупкость: mFI-5', fields: [
    F(p + 'dm', 'Сахарный диабет (на терапии)', 'yesno', { key_: true }), F(p + 'chf', 'Сердечная недостаточность (последние 30 дней)', 'yesno', { key_: true }),
    F(p + 'copd', 'ХОБЛ или пневмония', 'yesno', { key_: true }), F(p + 'htn', 'Артериальная гипертензия, требующая лечения', 'yesno', { key_: true }),
    F(p + 'dep', 'Функциональная зависимость (частичная или полная)', 'yesno', { key_: true }),
    F(p + 'score', 'mFI-5', 'calc', { formula: `(${p}dm === 'да') + (${p}chf === 'да') + (${p}copd === 'да') + (${p}htn === 'да') + (${p}dep === 'да')`, def: 'Subramaniam S и соавт., 2018. 0: нет хрупкости, 1: пре-хрупкость, 2 и больше: хрупкость.' })
  ] }) },
  cfs: { name: 'Клиническая шкала хрупкости (CFS, Rockwood)', make: (p = 'cfs_') => ({ id: uid('s'), title: 'Хрупкость: CFS', fields: [
    F(p + 'lvl', 'Уровень по CFS', 'select', { key_: true, options: ['очень хорошая форма (1)', 'хорошая форма (2)', 'справляется хорошо (3)', 'уязвимый (4)', 'лёгкая хрупкость (5)', 'умеренная хрупкость (6)', 'выраженная хрупкость (7)', 'очень выраженная хрупкость (8)', 'терминальное состояние (9)'], def: 'Rockwood K и соавт., 2005. Оценивается состояние за 2 недели до заболевания.' }),
    F(p + 'score', 'CFS, баллы', 'calc', { formula: `pt(${p}lvl)` }), F(p + 'frail', 'Хрупкость (CFS 5 и выше)', 'calc', { formula: `ifelse(pt(${p}lvl) >= 5, 'да', ifelse(pt(${p}lvl) == null, null, 'нет'))` })
  ] }) },
  ecogasa: { name: 'ECOG и ASA', make: (p = 'st_') => ({ id: uid('s'), title: 'Статус: ECOG и ASA', fields: [
    F(p + 'ecog', 'ECOG', 'select', { key_: true, options: ['0: полная активность (0)', '1: ограничение тяжёлой нагрузки (1)', '2: самообслуживание, не работает (2)', '3: в постели более 50% дня (3)', '4: полностью прикован к постели (4)'] }),
    F(p + 'asa', 'ASA', 'select', { key_: true, options: ['I (1)', 'II (2)', 'III (3)', 'IV (4)', 'V (5)', 'VI (6)'] }),
    F(p + 'asa_e', 'Экстренная (E)', 'yesno')
  ] }) }
});

/* ================= БИБЛИОТЕКА АНКЕТ (свободные инструменты) ================= */
const scale = (n, l0, l1) => Array.from({ length: n + 1 }, (_, i) => ({ l: i === 0 ? `0 (${l0})` : i === n ? `${n} (${l1})` : String(i), s: i }));
const PHQ_O = [{ l: 'Совсем нет', s: 0 }, { l: 'Несколько дней', s: 1 }, { l: 'Более половины дней', s: 2 }, { l: 'Почти каждый день', s: 3 }];
const INSTRUMENT_LIB = {
  nrs: { n: 'Боль: числовая шкала (ЧРШ 0-10)', make: () => ({ id: uid('in'), name: 'Боль (ЧРШ 0-10)', note: 'Средняя боль за последние 24 часа. 0: нет боли, 10: худшая боль.', items: [{ key: 'pain', label: 'Оцените вашу боль за последние сутки', options: scale(10, 'нет боли', 'невыносимая') }], bands: [{ min: 0, max: 0, l: 'нет боли' }, { min: 1, max: 3, l: 'слабая' }, { min: 4, max: 6, l: 'умеренная' }, { min: 7, max: 10, l: 'сильная' }] }) },
  hpain: { n: 'Хроническая боль после грыжесечения', make: () => ({ id: uid('in'), name: 'Боль после грыжесечения', note: 'Боль в области операции в покое и при нагрузке, 0-20.', items: [{ key: 'rest', label: 'Боль в области операции в покое', options: scale(10, 'нет', 'невыносимая') }, { key: 'act', label: 'Боль при ходьбе, подъёме тяжестей, кашле', options: scale(10, 'нет', 'невыносимая') }, { key: 'limit', label: 'Мешает ли боль работе или обычной активности?', options: [{ l: 'Нет', s: 0 }, { l: 'Иногда', s: 1 }, { l: 'Часто', s: 2 }, { l: 'Постоянно', s: 3 }] }], bands: [{ min: 0, max: 0, l: 'нет боли' }, { min: 1, max: 6, l: 'лёгкая' }, { min: 7, max: 13, l: 'умеренная' }, { min: 14, max: 23, l: 'выраженная' }] }) },
  phq2: { n: 'PHQ-2 (скрининг депрессии)', make: () => ({ id: uid('in'), name: 'PHQ-2', note: 'За последние 2 недели. 3 балла и больше: положительный скрининг. Шкала свободна для использования.', items: [{ key: 'q1', label: 'Как часто вас беспокоило: мало интереса или удовольствия от занятий', options: clone(PHQ_O) }, { key: 'q2', label: 'Как часто вас беспокоило: подавленность, уныние или безнадёжность', options: clone(PHQ_O) }], bands: [{ min: 0, max: 2, l: 'отрицательный' }, { min: 3, max: 6, l: 'положительный скрининг' }] }) },
  gad2: { n: 'GAD-2 (скрининг тревоги)', make: () => ({ id: uid('in'), name: 'GAD-2', note: 'За последние 2 недели. 3 балла и больше: положительный скрининг. Шкала свободна для использования.', items: [{ key: 'q1', label: 'Как часто вас беспокоило: нервозность, тревога, напряжение', options: clone(PHQ_O) }, { key: 'q2', label: 'Как часто вас беспокоило: невозможность успокоиться или контролировать беспокойство', options: clone(PHQ_O) }], bands: [{ min: 0, max: 2, l: 'отрицательный' }, { min: 3, max: 6, l: 'положительный скрининг' }] }) },
  bristol: { n: 'Бристольская шкала формы стула', make: () => ({ id: uid('in'), name: 'Бристольская шкала', note: 'Типичная форма стула за последнюю неделю. 1-2: запор, 3-5: норма, 6-7: диарея.', items: [{ key: 'type', label: 'Какой у вас чаще всего стул?', options: [{ l: 'Тип 1: отдельные твёрдые комки', s: 1 }, { l: 'Тип 2: колбаска из комков', s: 2 }, { l: 'Тип 3: колбаска с трещинами', s: 3 }, { l: 'Тип 4: гладкая мягкая колбаска', s: 4 }, { l: 'Тип 5: мягкие кусочки с ровными краями', s: 5 }, { l: 'Тип 6: рыхлые кусочки с рваными краями, кашица', s: 6 }, { l: 'Тип 7: водянистый, без твёрдых частиц', s: 7 }] }], bands: [{ min: 1, max: 2, l: 'запор' }, { min: 3, max: 5, l: 'норма' }, { min: 6, max: 7, l: 'диарея' }] }) },
  satisf: { n: 'Удовлетворённость результатом операции', make: () => ({ id: uid('in'), name: 'Удовлетворённость', note: '0-10 и готовность рекомендовать.', items: [{ key: 'sat', label: 'Насколько вы довольны результатом операции?', options: scale(10, 'совсем не доволен', 'полностью доволен') }, { key: 'again', label: 'Согласились бы вы на эту операцию снова?', options: [{ l: 'Да', s: 0 }, { l: 'Не уверен(а)', s: 0 }, { l: 'Нет', s: 0 }] }], bands: [{ min: 0, max: 4, l: 'не доволен' }, { min: 5, max: 7, l: 'частично' }, { min: 8, max: 10, l: 'доволен' }] }) },
  recover: { n: 'Возвращение к обычной жизни', make: () => ({ id: uid('in'), name: 'Восстановление', note: 'Насколько пациент вернулся к прежней активности.', items: [{ key: 'act', label: 'Вернулись ли вы к обычной повседневной активности?', options: [{ l: 'Полностью', s: 0 }, { l: 'Почти полностью', s: 1 }, { l: 'Частично', s: 2 }, { l: 'Нет', s: 3 }] }, { key: 'work', label: 'Вернулись ли вы к работе или учёбе (если работали)?', options: [{ l: 'Да / не работаю', s: 0 }, { l: 'Частично', s: 1 }, { l: 'Нет', s: 2 }] }], bands: [{ min: 0, max: 0, l: 'полное восстановление' }, { min: 1, max: 2, l: 'почти полное' }, { min: 3, max: 5, l: 'неполное' }] }) }
};
const _PromsAdmin = PromsAdmin;
PromsAdmin = function (reg, body, ro, mark) {
  _PromsAdmin(reg, body, ro, mark); if (ro) return;
  const inject = () => { if ($('#insLib', body) || !$('#insWex', body)) return; $('#insWex', body).insertAdjacentHTML('afterend', '<button class="btn sm" id="insLib">+ Из библиотеки</button>');
    $('#insLib', body).onclick = () => { const m = modal(`<h3>Библиотека анкет</h3><p class="muted">Свободные для использования инструменты. Лицензируемые (EQ-5D, EORTC, BREAST-Q и др.) добавляйте через «Свой опросник» после получения лицензии.</p>${Object.entries(INSTRUMENT_LIB).map(([k, x]) => `<button class="btn block" data-lib="${k}">${esc(x.n)}</button>`).join('')}`);
      $$('[data-lib]', m).forEach(b => b.onclick = () => { reg.instruments.push(INSTRUMENT_LIB[b.dataset.lib].make()); mark(); m.close(); PromsAdmin(reg, body, ro, mark); toast('Анкета добавлена'); }); }; };
  inject(); new MutationObserver(inject).observe(body, { childList: true });
};

/* ================= ШАБЛОНЫ РЕГИСТРОВ ================= */
const MESHES = ['Prolene (полипропилен)', 'Ultrapro', 'Vypro II', 'Optilene', 'Parietex', 'ProGrip (самофиксирующаяся)', 'Bard Soft Mesh', 'Bard 3DMax', 'TiMesh', 'DynaMesh-IPOM', 'Symbotex', 'Ventralight ST', 'Proceed', 'Phasix (рассасывающаяся)', 'Biodesign (биологическая)', 'Strattice (биологическая)', 'Vicryl mesh (рассасывающаяся)', 'отечественная полипропиленовая', 'другая'];
TEMPLATES.ventral = {
  name: 'Вентральные грыжи (EHS)', desc: 'Классификация EHS на кликабельной схеме, несколько дефектов, сетка с поиском, вкладки, рецидив и боль.',
  make: () => { const r = blankRegistry('Вентральные грыжи');
    r.description = 'Регистр вентральных и послеоперационных грыж по образцу европейских регистров: локализация по EHS, размер дефекта, способ пластики, сетка, осложнения, рецидив, хроническая боль.';
    r.patientFields = [F('smoke', 'Курение', 'select', { options: ['никогда', 'бросил(а)', 'курит'] })];
    r.eventTypes = [
      { id: 'op', name: 'Операция', color: '#e07a2f', dateLabel: 'Дата операции', sections: [
        { id: uid('s'), title: 'Обзор операции', note: 'Каждый дефект вносится отдельной записью ниже.', fields: [F('surgeon', 'Оперирующий хирург', 'user', { required: true }), F('assist', 'Второй хирург', 'user'), F('performed', 'Выполнил', 'select', { options: ['хирург-консультант', 'резидент под контролем', 'другой врач'] }), F('urgency', 'Срочность', 'select', { options: ['плановая', 'экстренная'], required: true }), F('htype', 'Тип грыжи', 'select', { required: true, options: ['первичная вентральная', 'послеоперационная (инцизионная)', 'параколостомическая', 'рецидивная'] }),
          F('loc', 'Локализация (EHS)', 'multiselect', { diagram: 'ehs', options: DIAGRAMS.ehs.r.map(x => x[0]), key_: true }), F('w', 'Ширина дефекта', 'number', { unit: 'см', key_: true, min: 0, max: 40 }), F('l', 'Длина дефекта', 'number', { unit: 'см', min: 0, max: 50 }),
          F('wcls', 'Класс ширины (EHS)', 'calc', { formula: "ifelse(w == null, null, ifelse(w < 4, 'W1 (<4 см)', ifelse(w <= 10, 'W2 (4-10 см)', 'W3 (>10 см)')))" }),
          { key: 'defects', label: 'Дефекты', type: 'group', itemLabel: 'Дефект', subfields: parseSubfields('Локализация | выбор | M1; M2; M3; M4; M5; L1; L2; L3; L4\nШирина | число | см\nДлина | число | см') }] },
        { id: uid('s'), title: 'Пластика дефекта', fields: [F('access', 'Доступ', 'select', { required: true, options: ['открытый', 'лапароскопический', 'роботический', 'гибридный'] }), F('closure', 'Закрытие дефекта', 'select', { options: ['ушит', 'не ушивался (мостовидная пластика)', 'частично'] }), F('cs', 'Разделение компонентов', 'select', { options: ['нет', 'передняя (ACS)', 'задняя (TAR)'] }), F('btx', 'Ботулотоксин до операции', 'yesno')] },
        { id: uid('s'), title: 'Сетка', tab: true, fields: [F('mesh', 'Сетка', 'select', { options: MESHES, key_: true, search: true, help: 'Поиск по названию; часто выбираемые поднимаются наверх.' }), F('mpos', 'Позиция сетки', 'select', { options: ['без сетки', 'onlay', 'inlay', 'ретромускулярно (sublay)', 'преперитонеально', 'интраперитонеально (IPOM)'], key_: true }), F('mfix', 'Фиксация', 'multiselect', { options: ['нет', 'швы', 'такеры рассасывающиеся', 'такеры нерассасывающиеся', 'клей', 'самофиксирующаяся'] }), F('msize', 'Размер сетки', 'text', { unit: 'см × см' })] },
        { id: uid('s'), title: 'Закрытие раны', tab: true, fields: [F('drain', 'Дренаж', 'yesno'), F('intraop', 'Интраоперационные осложнения', 'textarea', { key_: true, warn: 'Если осложнений не было, напишите «нет».' })] }] },
      { id: 'post', name: 'Госпитальный период', color: '#d24d57', single: true, dateLabel: 'Дата выписки', sections: [{ id: uid('s'), title: '30 дней', fields: [F('los', 'Койко-дни', 'number', { key_: true, min: 0, max: 200 }), F('compl', 'Осложнения', 'complist', { options: ['серома', 'гематома', 'ИОХВ поверхностная', 'ИОХВ глубокая', 'инфицирование сетки', 'кишечная непроходимость', 'повреждение кишки', 'пневмония', 'ТЭЛА'] }), F('cci_score', 'CCI', 'calc', { formula: 'cci(compl)' }), F('readm', 'Повторная госпитализация', 'yesno'), F('death30', 'Летальность 30 дней', 'yesno', { key_: true })] }] },
      { id: 'fu', name: 'Наблюдение', color: '#2a9d8f', dateLabel: 'Дата контакта', sections: [{ id: uid('s'), title: 'Результат', fields: [F('recur', 'Рецидив', 'yesno', { required: true }), F('rdiag', 'Как выявлен', 'select', { options: ['осмотр', 'УЗИ', 'КТ', 'со слов пациента'], showIf: { key: 'recur', op: 'eq', value: 'да' } }), F('chpain', 'Хроническая боль (0-10)', 'number', { min: 0, max: 10, key_: true }), F('bulge', 'Выпячивание без рецидива', 'yesno')] }] }
    ];
    r.keyDates = { start: 'op' }; r.followupEvery = 365;
    r.indicators = [IND('Летальность 30 дней', 'post', { key: 'death30', op: 'eq', value: 'да' }, null, 1), IND('Повторная госпитализация', 'post', { key: 'readm', op: 'eq', value: 'да' }, null, 5), IND('Рецидив', 'fu', { key: 'recur', op: 'eq', value: 'да' }, null, 10)];
    const p1 = INSTRUMENT_LIB.hpain.make(), p2 = INSTRUMENT_LIB.satisf.make(); r.instruments = [p1, p2];
    r.schedules = [{ id: uid('sc'), instrument: p1.id, anchorEt: 'op', offsets: [90, 365], condition: null }, { id: uid('sc'), instrument: p2.id, anchorEt: 'op', offsets: [365], condition: null }];
    return r; }
};
TEMPLATES.leak = {
  name: 'Несостоятельность анастомоза (колоректальная)', desc: 'Каждый анастомоз отдельной записью, факторы риска, ICG, проба на герметичность, ISREC A/B/C, лечение.',
  make: () => { const r = blankRegistry('Несостоятельность анастомоза');
    r.description = 'Регистр колоректальных анастомозов и их несостоятельности: факторы риска пациента и операции, техника анастомоза, интраоперационная проверка, классификация ISREC и лечение.';
    r.eventTypes = [
      { id: 'op', name: 'Операция', color: '#e07a2f', dateLabel: 'Дата операции', sections: [
        { id: uid('s'), title: 'Факторы риска', fields: [F('smoke', 'Курение', 'yesno', { carry: true }), F('dm', 'Сахарный диабет', 'yesno', { carry: true }), F('steroid', 'Стероиды или иммуносупрессия', 'yesno', { carry: true }), F('neo', 'Неоадъювантная лучевая / химиолучевая терапия', 'yesno', { key_: true, carry: true }), F('albumin', 'Альбумин до операции', 'number', { unit: 'г/л' }), F('height', 'Рост', 'number', { unit: 'см', carry: true }), F('weight', 'Вес', 'number', { unit: 'кг' }), F('bmi', 'ИМТ', 'calc', { formula: 'bmi(height, weight)', unit: 'кг/м²' })] },
        { id: uid('s'), title: 'Операция', fields: [F('surgeon', 'Оперирующий хирург', 'user', { required: true }), F('proc', 'Операция', 'select', { required: true, options: ['правосторонняя гемиколэктомия', 'расширенная правосторонняя гемиколэктомия', 'резекция поперечной ободочной', 'левосторонняя гемиколэктомия', 'резекция сигмовидной кишки', 'передняя резекция прямой кишки', 'низкая передняя резекция', 'ультранизкая / интерсфинктерная резекция', 'субтотальная / тотальная колэктомия', 'закрытие стомы', 'другая'] }), F('access', 'Доступ', 'select', { options: ['открытый', 'лапароскопический', 'роботический', 'конверсия'] }), F('urg', 'Срочность', 'select', { options: ['плановая', 'экстренная'] }),
          { key: 'anast', label: 'Анастомозы', type: 'group', itemLabel: 'Анастомоз', required: true, warn: 'Внесите каждый анастомоз отдельно.', subfields: parseSubfields('Расстояние от анального края | число | см\nТехника | выбор | ручной; аппаратный циркулярный; аппаратный линейный\nКонфигурация | выбор | конец-в-конец; конец-в-бок; бок-в-бок; J-резервуар\nICG-перфузия | да/нет\nПроба на герметичность | выбор | не проводилась; отрицательная; положительная, переделан; положительная, укреплён\nПревентивная стома | выбор | нет; илеостома; колостома') },
          F('n_anast', 'Число анастомозов', 'calc', { formula: 'count(anast)' })] }] },
      { id: 'post', name: 'Послеоперационный период', color: '#d24d57', single: true, dateLabel: 'Дата выписки', sections: [{ id: uid('s'), title: '30 дней', fields: [
        F('leak', 'Несостоятельность анастомоза', 'yesno', { required: true }), F('isrec', 'Степень ISREC', 'select', { options: ['A: без изменения лечения', 'B: активное лечение без релапаротомии', 'C: релапаротомия'], showIf: { key: 'leak', op: 'eq', value: 'да' }, required: true, def: 'Rahbari NN и соавт., 2010 (International Study Group of Rectal Cancer).' }),
        F('lday', 'День диагностики', 'number', { showIf: { key: 'leak', op: 'eq', value: 'да' }, min: 0, max: 60 }), F('ldx', 'Как выявлена', 'multiselect', { options: ['клинически', 'КТ с контрастом', 'эндоскопия', 'рентгеноконтраст', 'релапаротомия', 'по дренажу'], showIf: { key: 'leak', op: 'eq', value: 'да' } }),
        F('ltx', 'Лечение', 'multiselect', { options: ['наблюдение', 'антибиотики', 'чрескожное дренирование', 'эндоВАК', 'трансанальное дренирование', 'релапаротомия с ушиванием', 'разобщение анастомоза / стома'], showIf: { key: 'leak', op: 'eq', value: 'да' } }),
        F('compl', 'Другие осложнения', 'complist', { options: ['ИОХВ', 'кишечная непроходимость', 'кровотечение', 'пневмония', 'ТЭЛА'] }), F('cci_score', 'CCI', 'calc', { formula: 'cci(compl)' }), F('los', 'Койко-дни', 'number', { key_: true }), F('death30', 'Летальность 30 дней', 'yesno', { key_: true })] }] },
      { id: 'fu', name: 'Наблюдение', color: '#2a9d8f', dateLabel: 'Дата контакта', sections: [{ id: uid('s'), title: 'Результат', fields: [F('stoma', 'Стома закрыта', 'select', { options: ['стомы не было', 'да', 'нет, планируется', 'нет, постоянная'] }), F('sinus', 'Хронический пресакральный синус', 'yesno'), F('stric', 'Стриктура анастомоза', 'yesno')] }] }
    ];
    r.keyDates = { start: 'op' }; r.followupEvery = 180;
    r.indicators = [IND('Несостоятельность анастомоза', 'post', { key: 'leak', op: 'eq', value: 'да' }, null, '', true, 'Staiger RD и соавт. Benchmarks in colorectal surgery. Br J Surg 2022;109(12):1274-1281 (19 центров, 75-й перцентиль медиан центров). Ориентиры для несостоятельности, накопленно за 3 месяца: высокая передняя резекция 5,0% (пациенты без значимых сопутствующих заболеваний) и 6,9% (остальные), низкая передняя резекция 13,6% и 11,8%. Цель выбирает совет регистра с учётом доли низких резекций.'), IND('Несостоятельность ISREC C', 'post', { key: 'isrec', op: 'eq', value: 'C: релапаротомия' }, null, 5), IND('Летальность 30 дней', 'post', { key: 'death30', op: 'eq', value: 'да' }, null, '', true, 'Staiger RD и соавт. Benchmarks in colorectal surgery. Br J Surg 2022;109(12):1274-1281 (19 центров, 75-й перцентиль медиан центров). Ориентиры летальности: в стационаре 0% у пациентов без значимых сопутствующих заболеваний, у остальных 2,4% (высокая передняя резекция) и 1,1% (низкая); за 3 месяца 3,0% и 2,2%. Срок 30 дней в этом исследовании не оценивался.')];
    const b = INSTRUMENT_LIB.bristol.make(); r.instruments = [INSTRUMENTS.lars(), b]; r.schedules = [{ id: uid('sc'), instrument: r.instruments[0].id, anchorEt: 'op', offsets: [180, 365], condition: null }];
    return r; }
};

/* ================= ПЕРЕНОС ДАННЫХ ИЗ ПРОШЛЫХ ЗАПИСЕЙ ================= */
const _evd2 = eventDialog;
eventDialog = async function (p, reg, ev) {
  if (ev && !ev.id) {
    const et = etById(reg, ev.type); const carry = formFields(et || {}).filter(f => f.carry);
    if (carry.length) {
      const prev = (await Data.events(reg.id)).filter(e => e.patientId === p.id && e.date).sort((a, b) => b.date.localeCompare(a.date));
      const data = { ...(ev.data || {}) }; let n = 0;
      carry.forEach(f => { const src = prev.find(e => !isEmpty(e.data?.[f.key])); if (src && isEmpty(data[f.key])) { data[f.key] = clone(src.data[f.key]); n++; } });
      if (n) { ev.data = data; ev._carried = n; }
    }
  }
  await _evd2(p, reg, ev);
  const m = [...document.querySelectorAll('.modal-wrap.full')].pop(); if (!m) return;
  if (ev._carried) { $('.evbar', m)?.insertAdjacentHTML('afterend', `<div class="okbox small">Перенесено из прошлых записей пациента: ${ev._carried} полей. Проверьте, что данные актуальны.</div>`); delete ev._carried; }
};

/* ================= ИСПРАВЛЕНИЯ ЧЕРЕЗ АДМИНИСТРАТОРА ================= */
function correctionDialog(p, ev) {
  const m = modal(`<h3>Запрос на исправление</h3><p class="muted">Пациент ID ${p.seq || '?'} · № ${esc(p.localId)}${ev ? ` · событие от ${fmtDate(ev.date)}` : ''}. ФИО, дату рождения, пол и дату сохранённого события меняет администратор: так ошибки не исчезают без следа.</p>
    <div class="fld"><label class="flab">Что исправить и на что</label><textarea class="inp" id="cr_t" rows="3" placeholder="Например: дата рождения 05.05.1960 вместо 15.05.1960"></textarea></div><div class="row end"><button class="btn primary" id="cr_ok">Отправить администратору</button></div>`);
  $('#cr_ok', m).onclick = async () => { const t = $('#cr_t', m).value.trim(); if (!t) return toast('Опишите исправление', 'err');
    const S = Settings.data; S.corrections = S.corrections || []; S.corrections.push({ id: uid('cr'), at: nowISO(), by: Auth.user.id, byName: Auth.user.name, patientId: p.id, seq: p.seq, localId: p.localId, eventId: ev?.id || '', text: t, status: 'открыт' }); await Settings.save();
    m.close(); toast('Запрос отправлен. Номер появится у администратора в разделе «Пользователи и настройки».'); };
}

/* ================= АДМИНИСТРИРОВАНИЕ: исправления, обратная связь, срок учётных записей ================= */
const _admin3 = Routes.admin;
Routes.admin = async (main) => {
  await _admin3(main); const S = Settings.data; const cr = (S.corrections || []).filter(c => c.status !== 'закрыт'); const fb = (S.feedback || []).slice(-30).reverse();
  const md = $('#md_pd'); if (md) md.closest('.fld').insertAdjacentHTML('afterend', `<div class="fld"><label class="flab">Срок учётной записи, дней (0 = бессрочно)</label><input class="inp" type="number" id="md_ad" value="${esc(S.accountDays || 0)}" min="0"><div class="help">Как у Dendrite: 365. Сотрудник сам продлевает доступ в «Мой профиль».</div></div><div class="fld"><label class="flab">Почта при регистрации</label><select class="inp" id="md_fm"><option value="1">только рабочая (без gmail, mail.ru и т. п.)</option><option value="0" ${S.blockFreeMail === false ? 'selected' : ''}>любая</option></select></div>`);
  const sv = $('#md_s'); if (sv) { const o = sv.onclick; sv.onclick = async () => { S.accountDays = Number($('#md_ad').value || 0); S.blockFreeMail = $('#md_fm').value === '1'; await o(); }; }
  main.insertAdjacentHTML('beforeend', `<div class="card"><h3>Запросы на исправление ${cr.length ? `<span class="tag warnt">${cr.length}</span>` : ''}</h3>${cr.length ? `<table class="tbl"><thead><tr><th>Дата</th><th>Пациент</th><th>От кого</th><th>Что исправить</th><th></th></tr></thead><tbody>${cr.map(c => `<tr><td>${fmtDT(c.at)}</td><td><a href="#patient/${c.patientId}">ID ${c.seq || '?'} · № ${esc(c.localId || '')}</a></td><td>${esc(c.byName)}</td><td>${esc(c.text)}</td><td><button class="btn xs" data-crd="${c.id}">Исправлено</button></td></tr>`).join('')}</tbody></table>` : '<p class="muted">Открытых запросов нет.</p>'}</div>
    <div class="card"><h3>Обратная связь от пользователей</h3>${fb.length ? fb.map(f => `<div class="rq"><div class="rq-b"><b>${esc(f.name || 'без имени')}</b><span class="muted small">${fmtDT(f.at)} · ${esc(f.kind || '')}</span><span>${esc(f.text)}</span></div></div>`).join('') : '<p class="muted">Пока пусто.</p>'}</div>`);
  $$('[data-crd]', main).forEach(b => b.onclick = async () => { const c = S.corrections.find(x => x.id === b.dataset.crd); c.status = 'закрыт'; c.doneAt = nowISO(); c.doneBy = Auth.user.id; await Settings.save(); await DB.rawPut('audit', { id: uid('au_'), ts: nowISO(), user: Auth.user.id, userName: Auth.user.name, action: 'исправление по запросу: ' + c.text, store: 'patients', recId: c.patientId }); App.route(); });
};

/* ================= МОЯ УЧЁТНАЯ ЗАПИСЬ: продление ================= */
const _profile = profileDialog;
profileDialog = async function (force) {
  await _profile(force);
  const m = [...document.querySelectorAll('.modal-wrap')].pop(); if (!m) return; const u = Auth.user, S = Settings.data;
  const pd = Number(S.passDays || 0), ad = Number(S.accountDays || 0); const pe = pd && u.passChangedAt ? addDays(u.passChangedAt.slice(0, 10), pd) : '';
  const warn = (u.expiresAt && addDays(today(), 14) >= u.expiresAt) || (pe && addDays(today(), 14) >= pe);
  $('#p_ok', m).closest('.row').insertAdjacentHTML('beforebegin', `<h4>Моя учётная запись</h4>${warn ? '<div class="qbox">Скоро истекает срок доступа или пароля. Продлите ниже.</div>' : ''}
    <table class="tbl small"><tbody><tr><td>Логин</td><td><b>${esc(u.login)}</b></td></tr><tr><td>Учётная запись действует до</td><td><b>${u.expiresAt ? fmtDate(u.expiresAt) : 'бессрочно'}</b> ${ad ? '<button class="btn xs" id="exA" type="button">Продлить на ' + (ad >= 365 ? '12 месяцев' : ad + ' дней') + '</button>' : ''}</td></tr>
    <tr><td>Пароль действует до</td><td><b>${pe ? fmtDate(pe) : 'бессрочно'}</b> ${pd ? '<button class="btn xs" id="exP" type="button">Продлить пароль</button>' : ''}</td></tr><tr><td>Последний вход</td><td>${u.lastLogin ? fmtDT(u.lastLogin) : ''}</td></tr><tr><td>Роль</td><td>${esc(ROLES[u.role]?.name || '')}</td></tr></tbody></table>`);
  const save = async (msg) => { await DB.put('users', u, msg); toast(msg); m.close(); profileDialog(); };
  if (typeof NET !== 'undefined' && NET.on && !can('users')) {
    $('#exA', m)?.remove();
    $('#exP', m)?.remove();
  }
  if ($('#exA', m)) $('#exA', m).onclick = () => { u.expiresAt = addDays(today(), ad); save('Учётная запись продлена до ' + fmtDate(u.expiresAt)); };
  if ($('#exP', m)) $('#exP', m).onclick = () => { u.passChangedAt = nowISO(); save('Пароль продлён'); };
};
const _route3 = App.route.bind(App);
App.route = async function (...a) {
  const r = await _route3(...a); const u = Auth.user;
  if (u && !sessionStorage.getItem('addall2.expChecked') && !$('.modal-wrap')) { sessionStorage.setItem('addall2.expChecked', '1'); const pd = Number(Settings.data.passDays || 0); const pe = pd && u.passChangedAt ? addDays(u.passChangedAt.slice(0, 10), pd) : '';
    if ((u.expiresAt && addDays(today(), 14) >= u.expiresAt) || (pe && addDays(today(), 14) >= pe)) profileDialog(); }
  return r;
};

/* ================= РЕГИСТРАЦИЯ: рабочая почта, телефон, делегат ================= */
const FREE_MAIL = /@(gmail|googlemail|mail|inbox|list|bk|yandex|ya|hotmail|outlook|live|yahoo|icloud|me|rambler|proton|protonmail|aol)\./i;
const _login4 = Pages.login;
Pages.login = async function (mode = 'login') {
  await _login4.call(Pages, mode);
  const box = $('.auth-box'); if (!box) return;
  /* справка до входа, как «гамбургер» у Dendrite */
  if (mode === 'login' || mode === 'reg') {
    box.insertAdjacentHTML('afterbegin', `<button class="hamb" id="hamb" title="Информация">☰</button>`);
    $('#hamb').onclick = () => infoMenu();
  }
  if (mode !== 'reg') return;
  const lg = $('#r_lg'); lg.closest('.fld').insertAdjacentHTML('afterend', `<div class="fld"><label class="flab">Рабочая почта <i class="req">*</i></label><input class="inp" id="r_em" type="email" placeholder="name@hospital.kz"><span class="fhint">${Settings.data.blockFreeMail === false ? '' : 'Личные ящики (gmail, mail.ru и т. п.) не принимаются.'}</span></div>`);
  const ph = $('#r_ph'); if (ph) { ph.placeholder = '+77011234567'; ph.closest('.fld').insertAdjacentHTML('beforeend', '<span class="fhint">С кодом страны, без пробелов.</span>'); }
  box.addEventListener('input', e => { const i = e.target; if (i.matches('.inp')) i.classList.toggle('filled', !!i.value.trim()); });
  const go_ = $('#r_go'); const orig = go_.onclick;
  go_.onclick = async () => {
    const em = $('#r_em').value.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return toast('Укажите рабочую почту', 'err');
    if (Settings.data.blockFreeMail !== false && FREE_MAIL.test(em)) return toast('Нужна рабочая почта учреждения, личные ящики не принимаются', 'err');
    if (ph && ph.value.trim() && !/^\+\d{10,15}$/.test(ph.value.trim())) return toast('Телефон в формате +77011234567, без пробелов', 'err');
    await orig();
  };
};
function infoMenu() {
  const S = Settings.data;
  const m = modal(`<h3>Информация</h3>
    <details open><summary><b>Как получить доступ</b></summary><p>На странице входа откройте «Регистрация», заполните форму и отправьте заявку. Администратор проверит данные и подтвердит доступ. Делегат (вносит данные за врача) указывает врача: доступ включится после подтверждения врачом.</p></details>
    <details><summary><b>Забыли пароль или заблокирован вход</b></summary><p>После 3 неверных паролей вход блокируется на 15 минут. Нажмите «Забыли пароль?»: заявка уйдёт администратору, он выдаст временный пароль.</p></details>
    <details><summary><b>Частые вопросы</b></summary><p><b>Где хранятся данные?</b> ${typeof NET !== 'undefined' && NET.on ? 'В общей базе на сервере учреждения.' : 'В этом браузере на этом компьютере, резервную копию делает администратор.'}<br><b>Можно ли потренироваться?</b> Да: «Учебный режим» внизу страницы входа.<br><b>Как исправить ФИО или дату рождения?</b> В карточке пациента «Запросить исправление».<br><b>Как выгрузить свои данные?</b> Работа → Экспорт моих данных.</p></details>
    <details><summary><b>Документы</b></summary><div id="imDocs" class="muted">Загрузка…</div></details>
    <details><summary><b>Обратная связь</b></summary><div class="grid"><div class="fld"><label class="flab">Ваше имя</label><input class="inp" id="fb_n"></div><div class="fld"><label class="flab">Тема</label><select class="inp" id="fb_k"><option>предложение</option><option>ошибка</option><option>вопрос по данным</option><option>другое</option></select></div></div><textarea class="inp" id="fb_t" rows="3" placeholder="Ваше сообщение"></textarea><div class="row end"><button class="btn primary" id="fb_s">Отправить</button></div></details>
    <p class="muted small">${esc([S.center, S.department].filter(Boolean).join(' · '))}</p>`, { wide: true });
  DB.all('files').then(fs => { const d = fs.filter(f => f.registryDoc && f.public); $('#imDocs', m).innerHTML = d.length ? d.map(f => `<div><a href="javascript:void 0" data-pd="${f.id}">${esc(f.name)}</a></div>`).join('') : 'Нет общедоступных документов.'; $$('[data-pd]', m).forEach(a => a.onclick = async () => { const f = await DB.get('files', a.dataset.pd); window.open(URL.createObjectURL(f.blob), '_blank'); }); });
  $('#fb_s', m).onclick = async () => { const t = $('#fb_t', m).value.trim(); if (!t) return toast('Напишите сообщение', 'err'); S.feedback = S.feedback || []; S.feedback.push({ at: nowISO(), name: $('#fb_n', m).value.trim() || Auth.user?.name || '', kind: $('#fb_k', m).value, text: t }); await Settings.save(); toast('Спасибо, сообщение отправлено'); m.close(); };
}
/* документы регистра: отметка «показывать на странице входа» */
const _regdocs = Routes.regdocs;
Routes.regdocs = async (main, regId) => {
  await _regdocs(main, regId); if (!can('design')) return;
  const files = await DB.all('files');
  $$('[data-ro]', main).forEach(a => { const f = files.find(x => x.id === a.dataset.ro); if (!f) return; a.parentElement.insertAdjacentHTML('beforeend', `<label class="chk small"><input type="checkbox" data-pub="${f.id}" ${f.public ? 'checked' : ''}> <span>на странице входа</span></label>`); });
  $$('[data-pub]', main).forEach(c => c.onchange = async () => { const f = await DB.get('files', c.dataset.pub); f.public = c.checked; await DB.rawPut('files', f); toast(c.checked ? 'Документ виден до входа' : 'Документ скрыт'); });
};
/* меню пользователя: обратная связь, язык */
const _shell = App.shell.bind(App);
App.shell = async function (...a) {
  const r = await _shell(...a); const ub = $('#userBtn'); if (!ub) return r;
  const old = ub.onclick; ub.onclick = (e) => { old(e); setTimeout(() => { const pop = $('.pop.umenu'); if (!pop || $('#umFb', pop)) return; $('#umProf', pop)?.insertAdjacentHTML('afterend', `<button class="mn-it" id="umFb"><i>✉</i><span>Обратная связь</span></button><button class="mn-it" id="umLang"><i>⇄</i><span>${LANG === 'en' ? 'Русский' : 'English'}</span></button>`); $('#umFb', pop).onclick = () => { pop.remove(); infoMenu(); setTimeout(() => { const d = [...document.querySelectorAll('.modal details')].pop(); if (d) d.open = true; }, 50); }; $('#umLang', pop).onclick = () => setLang(LANG === 'en' ? 'ru' : 'en'); }, 0); };
  return r;
};

/* ================= ДЕЛЕГАТ: привязка к врачу при одобрении, подтверждение врачом ================= */
const _userDialog2 = userDialog;
userDialog = async function (u, approving) {
  await _userDialog2(u, approving);
  const m = [...document.querySelectorAll('.modal-wrap')].pop(); if (!m || !$('#u_ok', m)) return;
  const docs = (await DB.all('users')).filter(x => x.active !== false && x.id !== u?.id && ['admin', 'lead', 'surgeon'].includes(x.role));
  const cur = docs.filter(d => (d.delegates || []).some(x => x.userId === u?.id)).map(d => d.id);
  $('#u_exp', m)?.closest('.fld').insertAdjacentHTML('afterend', `<div class="fld wide"><label class="flab">Делегат для врачей (врач подтвердит сам)${u?.note && /Делегат/.test(u.note) ? ` <span class="muted small">из заявки: ${esc((u.note.match(/Делегат для врача: ([^;]+)/) || [])[1] || '')}</span>` : ''}</label><div class="rchk">${docs.map(d => `<label class="chk"><input type="checkbox" value="${d.id}" data-dg ${cur.includes(d.id) ? 'checked' : ''}> <span>${esc(d.name)}</span></label>`).join('') || '<span class="muted">нет врачей</span>'}</div></div>`);
  const ok = $('#u_ok', m); const orig = ok.onclick;
  ok.onclick = async () => {
    const want = $$('[data-dg]:checked', m).map(c => c.value); const ad = Number(Settings.data.accountDays || 0);
    if (u && ad && !u.expiresAt && !$('#u_exp', m).value) $('#u_exp', m).value = addDays(today(), ad);
    const login = $('#u_l', m).value.trim(); await orig();
    const all = await DB.all('users'); const me = u ? all.find(x => x.id === u.id) : all.find(x => x.login === login);
    if (!me) return;
    if (!u) { me.mustChange = true; if (ad && !me.expiresAt) me.expiresAt = addDays(today(), ad); await DB.rawPut('users', me); }
    for (const d of all.filter(x => ['admin', 'lead', 'surgeon'].includes(x.role))) {
      const has = (d.delegates || []).some(x => x.userId === me.id), need = want.includes(d.id);
      if (need && !has) { d.delegates = [...(d.delegates || []), { userId: me.id, at: nowISO(), confirmedAt: null, byAdmin: Auth.user.id }]; await DB.rawPut('users', d); }
      if (!need && has) { d.delegates = d.delegates.filter(x => x.userId !== me.id); await DB.rawPut('users', d); }
    }
  };
};
const _deleg = Routes.delegates;
Routes.delegates = async (main) => { await _deleg(main); $$('tr', main).forEach(tr => { const st = tr.children[4]; if (st && /истёк/.test(st.textContent) && !tr.children[3].textContent.trim()) st.innerHTML = '<span class="tag warnt">ждёт вашего подтверждения</span>'; }); };

/* ================= МАРШРУТ: НАПРАВЛЕНИЕ → ЗАОЧНАЯ ОЦЕНКА → МДК → РЕШЕНИЕ → ПИСЬМО ================= */
ROUTE_GROUP.referrals = 'Работа';
const REF_ST = ['получено', 'заочная оценка', 'на МДК', 'решение принято', 'лечение', 'закрыто'];
const REF_CHECK = ['гистология / биопсия', 'КТ грудной клетки и живота', 'МРТ малого таза', 'колоноскопия', 'РЭА', 'общий анализ крови', 'ЭКГ / консультация терапевта', 'данные о предыдущем лечении'];
const _nav2 = navGroups;
navGroups = async function () { const g = await _nav2(); const w = g.find(x => x.id === 'work'); if (w && w.items && can('mdt')) { const i = w.items.findIndex(x => x.r === 'mdt'); w.items.splice(i + 1, 0, { r: 'referrals', t: 'Направления (путь к МДК)', i: '↘' }); } return g; };
const refAll = async () => (await DB.all('jrecs')).filter(x => x.journalId === '_referrals');
Routes.referrals = async (main) => {
  const [list, pts, mdts] = await Promise.all([refAll(), Data.patients(), DB.all('mdt')]);
  const st = Routes.referrals.st || (Routes.referrals.st = { f: 'open' });
  const rows = list.filter(r => st.f === 'all' || (st.f === 'open' ? r.status !== 'закрыто' : r.status === st.f)).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const wait = r => Math.round((Date.now() - new Date(r.date)) / 864e5);
  main.innerHTML = `<div class="head"><div><h1>Направления</h1><div class="sub">Путь пациента: направление → заочная оценка → МДК → решение → лечение → письмо направившему врачу</div></div><div class="row"><select class="inp" id="rfF"><option value="open">в работе</option><option value="all" ${st.f === 'all' ? 'selected' : ''}>все</option>${REF_ST.map(s => `<option ${st.f === s ? 'selected' : ''}>${s}</option>`).join('')}</select><button class="btn primary" id="rfN">+ Направление</button></div></div>
    <div class="refbar">${REF_ST.map(s => `<div><b>${list.filter(r => r.status === s).length}</b><span>${s}</span></div>`).join('')}</div>
    ${rows.length ? `<table class="tbl hover"><thead><tr><th>Получено</th><th>Ждёт, дн</th><th>Пациент</th><th>Откуда</th><th>Диагноз / причина</th><th>Срочность</th><th>Готовность</th><th>Статус</th></tr></thead><tbody>${rows.map(r => { const p = pts.find(x => x.id === r.patientId); const done = REF_CHECK.filter(c => r.check?.[c]).length; return `<tr data-rf="${r.id}"><td>${fmtDate(r.date)}</td><td class="${r.status !== 'закрыто' && wait(r) > (r.urg === 'срочное' ? 7 : 14) ? 'bad' : ''}">${r.status === 'закрыто' ? '' : wait(r)}</td><td><b>${esc(p ? pname(p) : r.name || '')}</b><div class="muted small">${esc(p ? '№ ' + p.localId : 'не в регистре')}</div></td><td>${esc(r.from || '')}</td><td>${esc(r.reason || '')}</td><td>${r.urg === 'срочное' ? '<span class="tag warnt">срочное</span>' : esc(r.urg || '')}</td><td><div class="bar"><i style="width:${done / REF_CHECK.length * 100}%;background:${done === REF_CHECK.length ? '#3c9d5d' : '#f0ad4e'}"></i><span>${done}/${REF_CHECK.length}</span></div></td><td><span class="tag">${esc(r.status)}</span></td></tr>`; }).join('')}</tbody></table>` : emptyState('Направлений нет.')}`;
  $('#rfF').onchange = e => { st.f = e.target.value; App.route(); };
  $('#rfN').onclick = () => refDialog(null);
  $$('tr[data-rf]', main).forEach(tr => tr.onclick = () => refDialog(list.find(x => x.id === tr.dataset.rf)));
};
async function refDialog(r0) {
  const r = r0 ? clone(r0) : { journalId: '_referrals', date: today(), status: 'получено', urg: 'плановое', check: {} };
  const [pts, regs, mdts] = await Promise.all([Data.patients(), Data.registries(), DB.all('mdt')]); window.__PTS = pts;
  const p = pts.find(x => x.id === r.patientId);
  const mc = mdts.flatMap(mt => (mt.cases || []).map((c, i) => ({ mt, c, i }))).filter(x => r.patientId && x.c.patientId === r.patientId).sort((a, b) => b.mt.date.localeCompare(a.mt.date))[0];
  const m = modal(`<h3>Направление</h3><div class="steps">${REF_ST.map((s, i) => `<span class="${REF_ST.indexOf(r.status) >= i ? 'on' : ''}">${s}</span>`).join('')}</div>
    <div class="grid"><div class="fld"><label class="flab">Дата получения</label><input class="inp" type="date" id="rf_d" value="${esc(r.date)}"></div>
      <div class="fld"><label class="flab">Пациент из регистра</label><input class="inp" id="rf_p" list="dl_rfp" value="${esc(p ? p.localId + ' · ' + pname(p) : '')}" placeholder="№ ИБ или ФИО"><datalist id="dl_rfp">${pts.map(x => `<option value="${esc(x.localId + ' · ' + pname(x))}">`).join('')}</datalist></div>
      <div class="fld"><label class="flab">Или ФИО (если ещё не в регистре)</label><input class="inp" id="rf_n" value="${esc(r.name || '')}"></div>
      <div class="fld"><label class="flab">Откуда направлен (учреждение, врач)</label><input class="inp" id="rf_f" value="${esc(r.from || '')}"></div>
      <div class="fld"><label class="flab">Контакт направившего (почта, телефон)</label><input class="inp" id="rf_c" value="${esc(r.contact || '')}"></div>
      <div class="fld"><label class="flab">Срочность</label><select class="inp" id="rf_u">${['плановое', 'срочное'].map(o => `<option ${r.urg === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
      <div class="fld wide"><label class="flab">Диагноз / причина направления</label><input class="inp" id="rf_r" value="${esc(r.reason || '')}"></div>
      <div class="fld"><label class="flab">Статус</label><select class="inp" id="rf_s">${REF_ST.map(o => `<option ${r.status === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div></div>
    <h4>Заочная оценка: что уже есть</h4><div class="rchk">${REF_CHECK.map(c => `<label class="chk"><input type="checkbox" data-ck="${esc(c)}" ${r.check?.[c] ? 'checked' : ''}> <span>${esc(c)}</span></label>`).join('')}</div>
    <div class="fld"><label class="flab">Заметки заочной оценки (чего не хватает, что запросить)</label><textarea class="inp" id="rf_pa" rows="2">${esc(r.pre || '')}</textarea></div>
    ${mc ? `<div class="okbox">МДК ${fmtDate(mc.mt.date)}: <b>${esc(mc.c.decisionType || 'решение не внесено')}</b> ${esc(mc.c.decision || '')} <a href="#mdt/${mc.mt.id}">открыть заседание</a></div>` : ''}
    <div class="row between"><div class="row">${r0 && !r.patientId ? '<button class="btn" id="rf_mk">Создать пациента в регистре</button>' : ''}<button class="btn" id="rf_mdt">Направить на ближайший МДК</button><button class="btn" id="rf_let">Письмо направившему врачу (Word)</button></div><div class="row">${r0 ? '<button class="btn danger" id="rf_x">Удалить</button>' : ''}<button class="btn primary" id="rf_ok">Сохранить</button></div></div>`, { wide: true });
  const read = () => { const lid = $('#rf_p', m).value.split(' · ')[0].trim(); const pp = pts.find(x => x.localId === lid);
    Object.assign(r, { date: $('#rf_d', m).value, patientId: pp?.id || '', name: $('#rf_n', m).value.trim() || (pp ? pname(pp) : ''), from: $('#rf_f', m).value.trim(), contact: $('#rf_c', m).value.trim(), urg: $('#rf_u', m).value, reason: $('#rf_r', m).value.trim(), status: $('#rf_s', m).value, pre: $('#rf_pa', m).value.trim(), check: Object.fromEntries($$('[data-ck]', m).map(c => [c.dataset.ck, c.checked])) }); };
  const save = async (msg) => { read(); if (!r.patientId && !r.name) return toast('Укажите пациента', 'err'); const s = await DB.put('jrecs', r, msg || 'направление'); Object.assign(r, s); return s; };
  $('#rf_ok', m).onclick = async () => { if (await save()) { m.close(); toast('Сохранено'); App.route(); } };
  if ($('#rf_x', m)) $('#rf_x', m).onclick = async () => { if (await confirmBox('Удалить направление?')) { await DB.del('jrecs', r.id); m.close(); App.route(); } };
  if ($('#rf_mk', m)) $('#rf_mk', m).onclick = async () => { read(); await save(); m.close(); const [ln, fn, mn] = (r.name || '').split(/\s+/); await patientDialog(null, regs, regs[0]?.id); const pm = [...document.querySelectorAll('.modal-wrap')].pop(); if (pm) { $('#pd_ln', pm).value = ln || ''; $('#pd_fn', pm).value = fn || ''; $('#pd_mn', pm).value = mn || ''; } toast('После сохранения пациента выберите его в направлении'); };
  $('#rf_mdt', m).onclick = async () => { read(); if (!r.patientId) return toast('Сначала выберите или создайте пациента в регистре', 'err');
    let mt = mdts.filter(x => x.date >= today() && x.status !== 'проведено').sort((a, b) => a.date.localeCompare(b.date))[0];
    if (!mt) mt = await DB.put('mdt', { date: addDays(today(), 7 - ((new Date().getDay() + 6) % 7) || 7), title: 'Онкологический консилиум', attendees: [Auth.user.id], cases: [], status: 'запланировано' });
    if (!(mt.cases || []).some(c => c.patientId === r.patientId)) { const pp = pts.find(x => x.id === r.patientId); mt.cases = mt.cases || []; mt.cases.push({ patientId: r.patientId, summary: `Направлен: ${r.from || ''}. ${r.reason || ''}`, question: r.pre || '', decisionType: '', decision: '' }); await DB.put('mdt', mt, 'направление на МДК'); }
    r.status = 'на МДК'; r.mdtId = mt.id; await save('направлен на МДК'); m.close(); toast('Добавлен в МДК ' + fmtDate(mt.date)); go('mdt/' + mt.id); };
  $('#rf_let', m).onclick = async () => { read(); const pp = pts.find(x => x.id === r.patientId); const S = Settings.data;
    const html = `<p style="text-align:right">${esc(S.center || '')}<br>${esc(S.department || '')}</p><p>${esc(r.from || 'Направившему врачу')}</p><p style="text-align:center"><b>Информационное письмо</b></p>
      <p>Пациент(ка): <b>${esc(pp ? pname(pp) : r.name || '')}</b>${pp?.birthDate ? ', ' + fmtDate(pp.birthDate) + ' г. р.' : ''}, направлен(а) ${fmtDate(r.date)} с диагнозом / по поводу: ${esc(r.reason || '')}.</p>
      ${mc ? `<p>Пациент рассмотрен на мультидисциплинарном консилиуме ${fmtDate(mc.mt.date)}. Решение: <b>${esc(mc.c.decisionType || '')}</b>. ${esc(mc.c.decision || '')}</p>` : '<p>Пациент ожидает рассмотрения на мультидисциплинарном консилиуме.</p>'}
      ${r.pre ? `<p>Для дальнейшего лечения просим дополнительно: ${esc(r.pre)}</p>` : ''}<p>С уважением,<br>${esc(Auth.user.name)}${Auth.user.position ? ', ' + esc(Auth.user.position) : ''}<br>${fmtDate(today())}</p>`;
    Office.docx(`письмо_${slug(pp ? pname(pp) : r.name || 'пациент')}.docx`, html); r.letterAt = nowISO(); if (r0) await save('письмо направившему'); };
}
/* в карточке пациента: его направления */
const _patient2 = Routes.patient;
Routes.patient = async (main, id, ...a) => { await _patient2(main, id, ...a); const rf = (await refAll()).filter(r => r.patientId === id); if (!rf.length) return; const side = $('.pside', main); if (side) side.insertAdjacentHTML('afterbegin', `<div class="card"><h3>Направления</h3>${rf.map(r => `<div class="mdtc"><b>${fmtDate(r.date)}</b> <span class="tag">${esc(r.status)}</span><div class="muted small">${esc(r.from || '')} · ${esc(r.reason || '')}</div></div>`).join('')}<a href="#referrals">Все направления</a></div>`); };

/* ================= АНГЛИЙСКИЙ ИНТЕРФЕЙС (перевод основных элементов) ================= */
const LANG = (() => { try { return localStorage.getItem('addall2.lang') || 'ru'; } catch (e) { return 'ru'; } })();
function setLang(l) { try { localStorage.setItem('addall2.lang', l); } catch (e) {} location.reload(); }
const EN = {
  'Главная': 'Home', 'Работа': 'Work', 'Пациенты': 'Patients', 'Регистры': 'Registries', 'Наука': 'Research', 'Администрирование': 'Administration', 'Вход': 'Sign in', 'Регистрация': 'Register', 'Войти': 'Log in', 'Логин': 'Username', 'Пароль': 'Password', 'Забыли пароль?': 'Forgot password?',
  'МДК / консилиумы': 'MDT meetings', 'Журналы': 'Logs', 'Создать журнал': 'New log', 'Контроль': 'Control', 'Запросы по данным': 'Data queries', 'Мои задачи': 'My tasks', 'Мои данные': 'My data', 'Экспорт моих данных': 'Export my data', 'Делегаты (ввод за врача)': 'Delegates', 'Учебный режим': 'Training mode', 'Выйти из учебного режима': 'Leave training mode',
  'Регистры и конструктор': 'Registries and builder', 'Все регистры': 'All registries', 'Создать регистр': 'New registry', 'Предложить регистр': 'Propose a registry', 'Исследования': 'Trials', 'Анкеты (PROMs)': 'PROMs', 'Аналитика': 'Analytics', 'Годовой отчёт': 'Annual report', 'Материалы': 'Materials', 'Рукописи': 'Manuscripts', 'Литература': 'References', 'Словарь данных': 'Data dictionary', 'Качество данных': 'Data quality', 'Отчёты': 'Reports', 'Отчёт хирурга и сертификат': 'Surgeon report and certificate', 'Документы регистров': 'Registry documents',
  'Пользователи и настройки': 'Users and settings', 'Импорт и экспорт': 'Import and export', 'Журнал аудита': 'Audit log', 'Шаблоны документов': 'Document templates', 'Запросы субъектов данных': 'Data subject requests', 'Направления (путь к МДК)': 'Referrals (MDT pathway)', 'Направления': 'Referrals',
  'Мой профиль': 'My profile', 'Выйти': 'Log out', 'Ассистент': 'Assistant', 'Обратная связь': 'Feedback',
  'Все пациенты': 'All patients', '+ Пациент': '+ Patient', '✦ Пациент из документа': '✦ Patient from document', 'Сохранить': 'Save', 'Сохранить черновик': 'Save draft', 'Отмена': 'Cancel', 'Удалить': 'Delete', 'Изменить данные': 'Edit details', 'Документы': 'Documents', 'Открыть': 'Open', 'Просмотр': 'View', 'Готово': 'Done', 'Закрыть': 'Close', 'Добавить': 'Add', 'Построить': 'Run', 'Печать': 'Print', 'Сертификат': 'Certificate',
  '‹ Назад': '‹ Back', 'Далее ›': 'Next ›', 'К сводке ›': 'To summary ›', 'Сводка': 'Data summary', 'Вся форма сразу': 'Whole form', 'По страницам': 'Page by page', 'Вернуться к сводке': 'Return to summary', 'Не заполнено': 'Missing data', 'Да, верно': 'Yes, correct', 'Владелец записи:': 'Record owner:', 'Следующая вкладка ›': 'Next tab ›',
  'да': 'yes', 'нет': 'no', 'неизвестно': 'unknown', 'Записей нет': 'No records', 'запись полная': 'record complete', 'неполная или черновик': 'incomplete or draft', 'пациент умер': 'deceased',
  '№ ИБ': 'Hospital No', 'ФИО': 'Name', 'Возраст': 'Age', 'Пол': 'Sex', 'Регистр': 'Registry', 'Центр': 'Centre', 'Последнее событие': 'Last event', 'Событий': 'Events', 'Полнота': 'Completeness', 'Анкеты': 'PROMs', 'Статус': 'Status', 'Дата': 'Date', 'Тип': 'Type', 'Должность': 'Position', 'Отделение': 'Department', 'Роль': 'Role',
  'все записи': 'all records', 'неполные': 'incomplete', 'полные': 'complete', 'умершие': 'deceased', 'просрочены анкеты': 'overdue PROMs', 'недавно изменённые': 'recently edited', 'по ФИО': 'by name', 'по полноте': 'by completeness',
  'Опросники': 'Questionnaires', 'МДК': 'MDT', 'Файлы': 'Files', 'Комментарии': 'Comments', 'История изменений': 'Change history', 'Добавить событие:': 'Add event:', '✦ Разобрать документ (ИИ)': '✦ Parse document (AI)', '✦ Заполнить из документа (ИИ)': '✦ Fill from document (AI)',
  'Сообщение дня': 'Message of the day', 'Больше не показывать это сообщение': 'Do not show again', 'Обращение': 'Title', 'Фамилия': 'Last name', 'Имя': 'First name', 'Отчество': 'Middle name', 'Дата рождения': 'Date of birth', 'Рабочий телефон': 'Work phone', 'Рабочая почта': 'Work email', 'Отправить заявку': 'Submit request', 'Личные данные': 'Personal details', 'Место работы': 'Workplace',
  'Врач': 'Doctor', 'Резидент': 'Resident', 'Исследователь': 'Researcher', 'Монитор': 'Monitor', 'Студент / просмотр': 'Student / viewer', 'Администратор': 'Administrator',
  'Общее': 'General', 'Формы событий': 'Event forms', 'Поля пациента': 'Patient fields', 'Списки (реестры)': 'Lists', 'Показатели качества': 'Quality indicators', 'Опросники и расписание': 'PROMs and schedule', 'Доступ': 'Access',
  'Когорта': 'Cohort', 'Анализ': 'Analysis', 'Сохранённые': 'Saved', 'Отчёт хирурга': 'Surgeon report', 'Настройка отчёта (для всех хирургов регистра)': 'Report settings (all surgeons)', 'Операции по годам': 'Operations by year', 'Виды операций': 'Procedure types',
  'Скачать Excel': 'Download Excel', 'Документы регистра': 'Registry documents', 'Делегаты': 'Delegates', 'Мои делегаты': 'My delegates', 'Я делегат для': 'I am a delegate for', 'Подтвердить на год': 'Confirm for a year', 'Убрать': 'Remove',
  'Поиск пациентов и разделов': 'Search patients and sections', 'Все карточки всех регистров': 'All patients in all registries', 'ИИ выкл.': 'AI off', 'ИИ вкл.': 'AI on', 'Внеси всё. Честные данные.': 'Add all. Honest data.', 'Эта неделя': 'This week', 'Брифинг на сегодня': 'Today\'s briefing', 'Показатели качества регистров': 'Registry quality', 'Пациентов': 'Patients', 'Событий': 'Events', 'Нет доступа к регистру': 'No access to this registry', 'Запросить доступ': 'Request access', 'Регистры других отделений': 'Other departments\' registries', 'Учебный режим (вымышленные пациенты)': 'Training mode (fictitious patients)', 'Отправить заявку': 'Submit request',
  'Учреждение': 'Institution', 'Информация': 'Information', 'Частые вопросы': 'FAQ', 'Как получить доступ': 'How to get access', 'Отправить': 'Send', 'Уведомления': 'Notifications', 'Добрый день': 'Good afternoon', 'Доброе утро': 'Good morning', 'Добрый вечер': 'Good evening'
};
const EN_PH = { 'Поиск пациентов и разделов': 'Search patients and sections', 'Поиск: ФИО, № ИБ, ID, дата рождения или операции': 'Search: name, hospital No, ID, date of birth or procedure', 'Подпись к рисунку': 'Drawing caption' };
function trNode(root) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null); const todo = [];
  while (w.nextNode()) { const n = w.currentNode; const t = n.nodeValue.trim(); if (t && EN[t] && !n.parentElement?.closest('.inp,textarea,[contenteditable],.srep,.kv,.tl-body .kv')) todo.push([n, t]); }
  todo.forEach(([n, t]) => { n.nodeValue = n.nodeValue.replace(t, EN[t]); });
  root.querySelectorAll?.('[placeholder]').forEach(e => { const p = e.getAttribute('placeholder'); if (EN_PH[p]) e.setAttribute('placeholder', EN_PH[p]); });
  root.querySelectorAll?.('option').forEach(o => { const t = o.textContent.trim(); if (EN[t] && !o.closest('[data-k]')) { if (!o.hasAttribute('value')) o.value = t; o.textContent = EN[t]; } });
}
if (LANG === 'en') {
  document.documentElement.lang = 'en';
  const obs = new MutationObserver(ms => { obs.disconnect(); ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) trNode(n); else if (n.nodeType === 3 && n.parentElement) trNode(n.parentElement); })); obs.observe(document.body, { childList: true, subtree: true }); });
  const start = () => { trNode(document.body); obs.observe(document.body, { childList: true, subtree: true }); };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
}
/* переключатель языка на странице входа */
const _login5 = Pages.login;
Pages.login = async function (mode = 'login') { await _login5.call(Pages, mode); const box = $('.auth-box'); if (box && mode === 'login') { box.insertAdjacentHTML('beforeend', `<button class="linkbtn" id="lgLang">${LANG === 'en' ? 'Русский интерфейс' : 'English interface'}</button>`); $('#lgLang').onclick = () => setLang(LANG === 'en' ? 'ru' : 'en'); } };
