/* AddAll 2.0: модули платформы. Режим "Национальный регистр" оставляет только ядро,
   остальные инструменты отделения включаются администратором по необходимости. */
'use strict';

const MODULES = {
  proms: { n: 'Анкеты пациентов (PROMs)', d: 'Исходы глазами пациента: боль, качество жизни, удовлетворённость.', r: ['proms'], core: true },
  delegates: { n: 'Делегаты', d: 'Резидент или медсестра вносят данные за врача.', r: ['delegates'], core: true },
  training: { n: 'Учебный режим', d: 'Песочница с вымышленными пациентами для обучения.', r: ['training'], core: true },
  dashboard: { n: 'Визуальный дашборд', d: 'Графики врача: мои результаты против регистра.', r: ['dashboard'], core: true },
  mdt: { n: 'МДК и направления', d: 'Консилиумы отделения и очередь пациентов к ним.', r: ['mdt', 'referrals'] },
  journals: { n: 'Журналы отделения', d: 'Планировщик операций, M&M, ротации и другие таблицы.', r: ['journal', 'journals'] },
  trials: { n: 'Исследования и рандомизация', d: 'Клинические исследования, скрининг, рандомизация.', r: ['trials', 'trial'] },
  writing: { n: 'Рукописи и литература', d: 'Черновики статей и библиотека ссылок.', r: ['writing', 'library'] },
  docs: { n: 'Документы по шаблонам', d: 'Выписки и письма из данных пациента.', r: ['doctpl'] },
  ai: { n: 'ИИ-ассистент', d: 'Заполнение из документов, сверка с документами, вопросы к регистру, регистр из описания, разбор к M&M. Требует настройки модели.', r: ['aicheck', 'ask', 'aiquality'], core: true }
};
const modOn = (k) => { const m = Settings.data.modules; return m && k in m ? !!m[k] : !!MODULES[k]?.core; };
const routeOff = (r) => { const base = String(r || '').split('/')[0]; return Object.entries(MODULES).some(([k, m]) => !modOn(k) && m.r.includes(base)); };
function modsApply() { const h = document.documentElement; Object.keys(MODULES).forEach(k => h.classList.toggle('off-' + k, !modOn(k))); }

/* меню без выключенных модулей */
const _navM = navGroups;
navGroups = async function () {
  const g = await _navM();
  g.forEach(x => { if (x.items) { x.items = x.items.filter(i => !i.r || !routeOff(i.r)); x.items = x.items.filter((i, k, a) => !(i.sep !== undefined && (!a[k + 1] || a[k + 1].sep !== undefined))); while (x.items[0] && x.items[0].sep !== undefined && !x.items[0].sep) x.items.shift(); } });
  return g.filter(x => !x.items || x.items.some(i => i.r));
};
/* прямой переход на выключенный раздел */
const _routeM = App.route.bind(App);
App.route = async function () {
  modsApply();
  const h = location.hash.slice(1);
  if (Auth.user && routeOff(h)) {
    const m = $('#main'); if (!m) return _routeM();
    const base = h.split('/')[0], k = Object.keys(MODULES).find(x => MODULES[x].r.includes(base));
    m.innerHTML = `<div class="head"><h1>${esc(MODULES[k].n)}</h1></div><div class="card"><p>Этот модуль выключен в режиме национального регистра.</p>${can('users') ? `<button class="btn primary" id="modOn">Включить модуль</button>` : '<p class="muted">Включить его может администратор.</p>'}</div>`;
    if ($('#modOn')) $('#modOn').onclick = async () => { Settings.data.modules = { ...(Settings.data.modules || {}), [k]: true }; await Settings.save(); App.boot(); };
    return;
  }
  return _routeM();
};
const _bootM = App.boot.bind(App);
App.boot = async function () { const r = await _bootM(); modsApply(); return r; };

/* администрирование: модули */
const _admM = Routes.admin;
Routes.admin = async (main) => {
  await _admM(main);
  if (!can('users')) return;
  const card = document.createElement('div'); card.className = 'card'; card.id = 'modCard';
  const oc = $('#orgCard', main); oc ? oc.after(card) : main.prepend(card);
  const draw = () => {
    const core = Object.keys(MODULES).every(k => modOn(k) === !!MODULES[k].core);
    card.innerHTML = `<h3>Модули платформы ${core ? '<span class="tag">режим национального регистра</span>' : ''}</h3>
      <p class="muted small">Ядро регистра включено всегда: регистры и формы, пациенты и события, наблюдение, запросы по данным, полнота, аудит, аналитика, годовой отчёт, отчёт хирурга, экспорт. Ниже то, что можно включать по необходимости.</p>
      <div class="mods">${Object.entries(MODULES).map(([k, m]) => `<label class="mod ${modOn(k) ? 'on' : ''}"><input type="checkbox" data-mod="${k}" ${modOn(k) ? 'checked' : ''}><span><b>${esc(m.n)}</b><em>${esc(m.d)}</em></span></label>`).join('')}</div>
      <div class="row"><button class="btn sm" id="modCore">Только ядро (национальный регистр)</button><button class="btn sm" id="modAll">Включить всё</button></div>`;
  };
  draw();
  const save = async (m) => { Settings.data.modules = m; await Settings.save(); modsApply(); await App.boot(); toast('Модули обновлены'); };
  card.onchange = e => { const k = e.target.dataset.mod; if (!k) return; const m = {}; Object.keys(MODULES).forEach(x => m[x] = modOn(x)); m[k] = e.target.checked; save(m); };
  card.onclick = e => {
    if (e.target.id === 'modCore') { const m = {}; Object.keys(MODULES).forEach(x => m[x] = !!MODULES[x].core); save(m); }
    if (e.target.id === 'modAll') { const m = {}; Object.keys(MODULES).forEach(x => m[x] = true); save(m); }
  };
};

if (typeof EN === 'object') Object.assign(EN, { 'Модули платформы': 'Platform modules', 'Только ядро (национальный регистр)': 'Core only (national registry)', 'Включить всё': 'Enable everything' });
