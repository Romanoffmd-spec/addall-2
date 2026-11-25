/* AddAll 2.0: дополнительные шкалы, классификации, справочник CTCAE и свободные анкеты пациента.
   Всё здесь свободно для использования: оригинальные публикации указаны в описании каждого поля.
   Лицензируемые инструменты (EQ-5D, EORTC QLQ, SF-36, HADS, MedDRA, SNOMED CT) не включены: их добавляют после получения лицензии.
   Подключается после formlib.js. */
'use strict';

/* ---------- CTCAE v5.0 (NCI, общественное достояние): частые нежелательные явления в хирургии и онкологии ---------- */
const CTCAE_TERMS = [
  ['Желудочно-кишечные', ['Диарея (Diarrhea)', 'Тошнота (Nausea)', 'Рвота (Vomiting)', 'Мукозит полости рта (Oral mucositis)', 'Запор (Constipation)', 'Боль в животе (Abdominal pain)', 'Кишечная непроходимость (Ileus)', 'Проктит (Proctitis)', 'Желудочно-кишечное кровотечение (Gastrointestinal hemorrhage)', 'Перфорация кишки (Colonic perforation)', 'Свищ (Fistula)']],
  ['Кровь и лимфа', ['Анемия (Anemia)', 'Фебрильная нейтропения (Febrile neutropenia)']],
  ['Лабораторные', ['Снижение нейтрофилов (Neutrophil count decreased)', 'Снижение тромбоцитов (Platelet count decreased)', 'Снижение лейкоцитов (White blood cell decreased)', 'Повышение АЛТ (Alanine aminotransferase increased)', 'Повышение АСТ (Aspartate aminotransferase increased)', 'Повышение билирубина (Blood bilirubin increased)', 'Повышение креатинина (Creatinine increased)']],
  ['Общие', ['Слабость (Fatigue)', 'Лихорадка (Fever)', 'Отёки конечностей (Edema limbs)']],
  ['Нервная система', ['Периферическая сенсорная нейропатия (Peripheral sensory neuropathy)', 'Дисгевзия (Dysgeusia)']],
  ['Кожа', ['Ладонно-подошвенный синдром (Palmar-plantar erythrodysesthesia syndrome)', 'Акнеподобная сыпь (Rash acneiform)', 'Алопеция (Alopecia)', 'Лучевой дерматит (Dermatitis radiation)']],
  ['Инфекции', ['Раневая инфекция (Wound infection)', 'Внутрибрюшная инфекция (Abdominal infection)', 'Сепсис (Sepsis)', 'Инфекция мочевых путей (Urinary tract infection)', 'Пневмония (Lung infection)']],
  ['Сосуды', ['Тромбоэмболия (Thromboembolic event)', 'Артериальная гипертензия (Hypertension)', 'Артериальная гипотензия (Hypotension)']],
  ['Хирургические', ['Несостоятельность анастомоза (Anastomotic leak)', 'Расхождение раны (Wound dehiscence)', 'Послеоперационное кровотечение (Postoperative hemorrhage)', 'Задержка мочи (Urinary retention)']],
  ['Иммунные и прочие', ['Аллергическая реакция (Allergic reaction)', 'Инфузионная реакция (Infusion related reaction)', 'Гипотиреоз (Hypothyroidism)', 'Колит (Colitis)', 'Пневмонит (Pneumonitis)']]
];
const CTCAE_LIST = CTCAE_TERMS.flatMap(([soc, terms]) => terms.map(t => `${t} [${soc}]`));
const CTCAE_GRADES = ['1: лёгкая', '2: умеренная', '3: тяжёлая', '4: угрожает жизни', '5: смерть'];

/* число нежелательных явлений степени 3 и выше */
FX.ae3 = list => Array.isArray(list) ? list.filter(x => /^[345]/.test(String(x?.grade || ''))).length : 0;

Object.assign(RISK_BLOCKS, {
  karnofsky: { name: 'Индекс Карновского', make: (p = 'kps_') => ({ id: uid('s'), title: 'Статус: индекс Карновского', fields: [
    F(p + 'kps', 'Индекс Карновского', 'select', { key_: true, options: ['100: норма, жалоб нет (100)', '90: обычная активность, минимальные симптомы (90)', '80: обычная активность с усилием (80)', '70: себя обслуживает, работать не может (70)', '60: иногда нужна помощь (60)', '50: нужна значительная помощь и частая медицинская помощь (50)', '40: инвалидизирован, нужен особый уход (40)', '30: тяжело инвалидизирован, показана госпитализация (30)', '20: тяжёлое состояние, нужна активная поддержка (20)', '10: умирающий (10)', '0: смерть (0)'], def: 'Karnofsky DA, Burchenal JH, 1949.' })
  ] }) },
  nyha: { name: 'Сердечная недостаточность: класс NYHA', make: (p = 'ny_') => ({ id: uid('s'), title: 'Класс NYHA', fields: [
    F(p + 'cls', 'Функциональный класс NYHA', 'select', { key_: true, options: ['I: без ограничения активности (1)', 'II: лёгкое ограничение, симптомы при обычной нагрузке (2)', 'III: выраженное ограничение, симптомы при малой нагрузке (3)', 'IV: симптомы в покое (4)'], def: 'New York Heart Association, 1994 (9-е изд. критериев).' })
  ] }) },
  gcs: { name: 'Шкала комы Глазго', make: (p = 'gcs_') => ({ id: uid('s'), title: 'Шкала комы Глазго', fields: [
    F(p + 'e', 'Открывание глаз', 'select', { options: ['спонтанное (4)', 'на речь (3)', 'на боль (2)', 'нет (1)'] }),
    F(p + 'v', 'Речевая реакция', 'select', { options: ['ориентирован (5)', 'спутанная речь (4)', 'отдельные слова (3)', 'нечленораздельные звуки (2)', 'нет (1)'] }),
    F(p + 'm', 'Двигательная реакция', 'select', { options: ['выполняет команды (6)', 'локализует боль (5)', 'отдёргивает на боль (4)', 'патологическое сгибание (3)', 'патологическое разгибание (2)', 'нет (1)'] }),
    F(p + 'sum', 'Сумма баллов (3-15)', 'calc', { formula: `ifelse(pt(${p}e) == null || pt(${p}v) == null || pt(${p}m) == null, null, pt(${p}e) + pt(${p}v) + pt(${p}m))`, def: 'Teasdale G, Jennett B. Lancet 1974;2:81-84.' })
  ] }) },
  childpugh: { name: 'Класс Child-Pugh', make: (p = 'cp_') => ({ id: uid('s'), title: 'Функция печени: Child-Pugh', fields: [
    F(p + 'bili', 'Билирубин', 'select', { options: ['< 34 мкмоль/л (1)', '34-50 мкмоль/л (2)', '> 50 мкмоль/л (3)'] }),
    F(p + 'alb', 'Альбумин', 'select', { options: ['> 35 г/л (1)', '28-35 г/л (2)', '< 28 г/л (3)'] }),
    F(p + 'inr', 'МНО', 'select', { options: ['< 1,7 (1)', '1,7-2,3 (2)', '> 2,3 (3)'] }),
    F(p + 'asc', 'Асцит', 'select', { options: ['нет (1)', 'лёгкий, поддаётся лечению (2)', 'выраженный, плохо поддаётся (3)'] }),
    F(p + 'enc', 'Печёночная энцефалопатия', 'select', { options: ['нет (1)', 'I-II стадия (2)', 'III-IV стадия (3)'] }),
    F(p + 'sum', 'Баллы Child-Pugh (5-15)', 'calc', { formula: `ifelse(pt(${p}bili) == null || pt(${p}alb) == null || pt(${p}inr) == null || pt(${p}asc) == null || pt(${p}enc) == null, null, ptsum([${p}bili, ${p}alb, ${p}inr, ${p}asc, ${p}enc]))` }),
    F(p + 'cls', 'Класс Child-Pugh', 'calc', { formula: `ifelse(pt(${p}bili) == null || pt(${p}alb) == null || pt(${p}inr) == null || pt(${p}asc) == null || pt(${p}enc) == null, null, ifelse(ptsum([${p}bili, ${p}alb, ${p}inr, ${p}asc, ${p}enc]) <= 6, 'A', ifelse(ptsum([${p}bili, ${p}alb, ${p}inr, ${p}asc, ${p}enc]) <= 9, 'B', 'C')))`, def: 'Pugh RN и соавт. Br J Surg 1973;60:646-649. A: 5-6, B: 7-9, C: 10-15.' })
  ] }) },
  bmi: { name: 'Рост, вес и ИМТ', make: (p = 'bm_') => ({ id: uid('s'), title: 'Рост, вес, ИМТ', fields: [
    F(p + 'h', 'Рост', 'number', { unit: 'см', min: 100, max: 230 }), F(p + 'w', 'Вес', 'number', { unit: 'кг', min: 25, max: 350 }),
    F(p + 'bmi', 'ИМТ', 'calc', { formula: `bmi(${p}h, ${p}w)`, unit: 'кг/м²' }),
    F(p + 'cls', 'Класс по ВОЗ', 'calc', { formula: `ifelse(bmi(${p}h, ${p}w) == null, null, ifelse(bmi(${p}h, ${p}w) < 18.5, 'дефицит', ifelse(bmi(${p}h, ${p}w) < 25, 'норма', ifelse(bmi(${p}h, ${p}w) < 30, 'избыточный вес', ifelse(bmi(${p}h, ${p}w) < 35, 'ожирение I', ifelse(bmi(${p}h, ${p}w) < 40, 'ожирение II', 'ожирение III'))))))`, def: 'ВОЗ, классификация ИМТ для взрослых.' })
  ] }) },
  cdcci: { name: 'Осложнения: Clavien-Dindo и CCI', make: (p = 'cx_') => ({ id: uid('s'), title: 'Осложнения (Clavien-Dindo, CCI)', fields: [
    F(p + 'list', 'Осложнения', 'complist', { key_: true, def: 'Каждое осложнение со степенью Clavien-Dindo (Dindo D и соавт. Ann Surg 2004;240:205-213). CCI: Slankamenac K и соавт. Ann Surg 2013;258:1-7.' }),
    F(p + 'cci', 'Comprehensive Complication Index', 'calc', { formula: `cci(${p}list)` }),
    F(p + 'max', 'Максимальная степень Clavien-Dindo', 'calc', { formula: `maxcd(${p}list)` })
  ] }) },
  ctcae: { name: 'Нежелательные явления: CTCAE v5.0', make: (p = 'ae_') => ({ id: uid('s'), title: 'Нежелательные явления (CTCAE v5.0)', fields: [
    { key: p + 'list', label: 'Нежелательные явления', type: 'group', itemLabel: 'Явление', required: false, options: [], def: 'Common Terminology Criteria for Adverse Events v5.0, NCI, 2017 (общественное достояние). Список частых терминов; другой термин впишите в поле «Другое».', subfields: [
      { key: 'term', label: 'Термин CTCAE', type: 'select', options: CTCAE_LIST, search: true },
      { key: 'other', label: 'Другое (если нет в списке)', type: 'text', options: [] },
      { key: 'grade', label: 'Степень', type: 'select', options: CTCAE_GRADES },
      { key: 'start', label: 'Дата начала', type: 'date', options: [] },
      { key: 'serious', label: 'Серьёзное (ICH E2A)', type: 'yesno', options: [] },
      { key: 'rel', label: 'Связь с лечением', type: 'select', options: ['не связано', 'маловероятно', 'возможно', 'вероятно', 'определённо'] }
    ] },
    F(p + 'n3', 'Явлений 3 степени и выше', 'calc', { formula: `ae3(${p}list)` })
  ] }) }
});

/* ---------- анкеты пациента, свободные для использования ---------- */
const FREQ5 = [{ l: 'Никогда', s: 0 }, { l: 'Редко (реже раза в месяц)', s: 1 }, { l: 'Иногда (реже раза в неделю, но чаще раза в месяц)', s: 2 }, { l: 'Каждую неделю (реже раза в день)', s: 3 }, { l: 'Каждый день', s: 4 }];
const IPSS_O = [{ l: 'Ни разу', s: 0 }, { l: 'Реже 1 раза из 5', s: 1 }, { l: 'Реже чем в половине случаев', s: 2 }, { l: 'Примерно в половине случаев', s: 3 }, { l: 'Чаще чем в половине случаев', s: 4 }, { l: 'Почти всегда', s: 5 }];
Object.assign(INSTRUMENT_LIB, {
  phq9: { n: 'PHQ-9 (депрессия)', make: () => ({ id: uid('in'), name: 'PHQ-9', note: 'За последние 2 недели. Kroenke K и соавт., J Gen Intern Med 2001. Свободна для использования (Pfizer). При ответе больше 0 на вопрос 9 нужна срочная оценка врачом.', items: [
    'Мало интереса или удовольствия от занятий', 'Подавленность, уныние или безнадёжность', 'Трудно заснуть, прерывистый сон или слишком долгий сон', 'Усталость или мало сил', 'Плохой аппетит или переедание',
    'Плохое мнение о себе: чувство, что вы неудачник или подвели себя или семью', 'Трудно сосредоточиться, например на чтении или телевизоре', 'Движения или речь настолько медленные, что это заметно другим, или наоборот, беспокойство и суетливость',
    'Мысли, что лучше было бы умереть, или о причинении себе вреда'].map((label, i) => ({ key: 'q' + (i + 1), label: 'Как часто вас беспокоило: ' + label.charAt(0).toLowerCase() + label.slice(1), options: clone(PHQ_O) })),
    bands: [{ min: 0, max: 4, l: 'минимальная' }, { min: 5, max: 9, l: 'лёгкая' }, { min: 10, max: 14, l: 'умеренная' }, { min: 15, max: 19, l: 'умеренно тяжёлая' }, { min: 20, max: 27, l: 'тяжёлая' }] }) },
  gad7: { n: 'GAD-7 (тревога)', make: () => ({ id: uid('in'), name: 'GAD-7', note: 'За последние 2 недели. Spitzer RL и соавт., Arch Intern Med 2006. Свободна для использования (Pfizer).', items: [
    'Нервозность, тревога или напряжение', 'Невозможность успокоиться или контролировать беспокойство', 'Чрезмерное беспокойство по разным поводам', 'Трудно расслабиться',
    'Такое беспокойство, что трудно усидеть на месте', 'Легко раздражаетесь', 'Страх, что может случиться что-то ужасное'].map((label, i) => ({ key: 'q' + (i + 1), label: 'Как часто вас беспокоило: ' + label.charAt(0).toLowerCase() + label.slice(1), options: clone(PHQ_O) })),
    bands: [{ min: 0, max: 4, l: 'минимальная' }, { min: 5, max: 9, l: 'лёгкая' }, { min: 10, max: 14, l: 'умеренная' }, { min: 15, max: 21, l: 'тяжёлая' }] }) },
  vaizey: { n: "Недержание: шкала St Mark's (Vaizey)", make: () => ({ id: uid('in'), name: "St Mark's (Vaizey)", note: "Последние 4 недели. Vaizey CJ и соавт., Gut 1999;44:77-80. 0: нет недержания, 24: полное недержание.", items: [
    { key: 'solid', label: 'Недержание оформленного стула', options: clone(FREQ5) }, { key: 'liquid', label: 'Недержание жидкого стула', options: clone(FREQ5) },
    { key: 'gas', label: 'Недержание газов', options: clone(FREQ5) }, { key: 'life', label: 'Изменение образа жизни из-за недержания', options: clone(FREQ5) },
    { key: 'pad', label: 'Нужно ли носить прокладку или вкладыш из-за недержания?', options: [{ l: 'Нет', s: 0 }, { l: 'Да', s: 2 }] },
    { key: 'med', label: 'Принимаете ли закрепляющие препараты (например, лоперамид)?', options: [{ l: 'Нет', s: 0 }, { l: 'Да', s: 2 }] },
    { key: 'defer', label: 'Можете ли вы отложить дефекацию на 15 минут?', options: [{ l: 'Да', s: 0 }, { l: 'Нет', s: 4 }] }],
    bands: [{ min: 0, max: 0, l: 'нет недержания' }, { min: 1, max: 8, l: 'лёгкое' }, { min: 9, max: 16, l: 'умеренное' }, { min: 17, max: 24, l: 'тяжёлое' }] }) },
  ipss: { n: 'IPSS (симптомы нижних мочевых путей)', make: () => ({ id: uid('in'), name: 'IPSS', note: 'За последний месяц. Barry MJ и соавт., J Urol 1992 (AUA Symptom Index). 0-7 лёгкие, 8-19 умеренные, 20-35 тяжёлые симптомы.', items: [
    { key: 'empty', label: 'Ощущение неполного опорожнения мочевого пузыря после мочеиспускания', options: clone(IPSS_O) },
    { key: 'freq', label: 'Повторное мочеиспускание раньше чем через 2 часа', options: clone(IPSS_O) },
    { key: 'interm', label: 'Прерывистое мочеиспускание (струя останавливается и начинается снова)', options: clone(IPSS_O) },
    { key: 'urg', label: 'Трудно сдержать позыв к мочеиспусканию', options: clone(IPSS_O) },
    { key: 'weak', label: 'Слабая струя', options: clone(IPSS_O) },
    { key: 'strain', label: 'Приходится натуживаться, чтобы начать мочеиспускание', options: clone(IPSS_O) },
    { key: 'noct', label: 'Сколько раз за ночь обычно встаёте помочиться?', options: [0, 1, 2, 3, 4, 5].map(n => ({ l: n === 5 ? '5 и больше' : String(n), s: n })) }],
    bands: [{ min: 0, max: 7, l: 'лёгкие симптомы' }, { min: 8, max: 19, l: 'умеренные' }, { min: 20, max: 35, l: 'тяжёлые' }] }) }
});

/* ---------- шкалы как источник в библиотеке форм: любой блок можно добавить разделом в любую форму ---------- */
if (typeof FormLib === 'object') {
  const previous = FormLib.sources.bind(FormLib);
  FormLib.sources = async function (reg) {
    const out = await previous(reg);
    const sections = Object.values(RISK_BLOCKS).map(b => { try { const s = b.make(); s.title = s.title || b.name; return s; } catch (e) { return null; } }).filter(Boolean);
    out.unshift({ id: 'lib:scales', name: 'Шкалы и классификации (ASA, ECOG, Charlson, Clavien-Dindo, CTCAE и др.)', forms: [{ id: 'lib_scales', name: 'Шкалы и классификации', sections }] });
    return out;
  };
}
