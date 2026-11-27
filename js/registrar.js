/* AddAll 2.0: регистратор данных.
   1) Нагрузка на заполнение: в словаре данных по каждой форме число полей, обязательных полей и примерное время ввода.
      Оценка по типу поля (выбор из списка 4 с, да/нет 3 с, число и дата 6 с, текст 12 с, длинный текст 30 с,
      вложенная группа 20 с плюс её поля). Это ориентир для конструктора: каждое лишнее поле умножается на всех пациентов.
   2) Ежегодная аттестация по правилам регистра и словарю (как обучение абстракторов NSQIP): 10 вопросов, зачёт от 80%,
      действует год. Вопросы: общие правила ввода и определения полей выбранного регистра. Результат хранится в «saved»
      (kind: 'certification') и виден в разделе и администратору. Подключается после pages.js и missing.js. */
'use strict';

const Registrar = {
  SECONDS: { select: 4, yesno: 3, number: 6, calc: 0, date: 6, time: 5, datetime: 8, text: 12, textarea: 30, icd10: 10, multiselect: 6, user: 4, complist: 25, file: 10, image: 10 },
  burden(et) {
    const walk = fields => fields.reduce((acc, f) => {
      if (f.type === 'group') { const inner = walk(f.subfields || []); return { n: acc.n + inner.n, req: acc.req + inner.req, sec: acc.sec + 20 + inner.sec }; }
      return { n: acc.n + (f.type === 'calc' ? 0 : 1), req: acc.req + (f.required ? 1 : 0), sec: acc.sec + (this.SECONDS[f.type] ?? 6) };
    }, { n: 0, req: 0, sec: 0 });
    return walk((et.sections || []).flatMap(s => s.fields || []));
  },
  burdenCard(reg) {
    const rows = (reg.eventTypes || []).map(et => ({ et, ...this.burden(et) }));
    const total = rows.reduce((s, r) => s + r.sec, 0);
    const min = s => s < 60 ? s + ' с' : String(Math.round(s / 6) / 10).replace('.', ',') + ' мин';
    return `<div class="card" id="burdenCard"><h3>Нагрузка на заполнение</h3>
      <table class="tbl small"><thead><tr><th>Форма</th><th>Полей</th><th>Обязательных</th><th>Примерное время ввода</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td>${esc(r.et.name)}</td><td>${r.n}</td><td>${r.req}</td><td>${min(r.sec)}${r.sec > 600 ? ' <span class="warnt">много</span>' : ''}</td></tr>`).join('')}
      <tr><td><b>Все формы одного пациента</b></td><td>${rows.reduce((s, r) => s + r.n, 0)}</td><td>${rows.reduce((s, r) => s + r.req, 0)}</td><td><b>${min(total)}</b></td></tr></tbody></table>
      <p class="muted small">Оценка по типу поля, без поиска данных в документах. На 1000 пациентов в год это примерно ${Math.round(total * 1000 / 3600)} часов ввода. Оставляйте обязательными только поля, которые нужны для показателей и моделей риска.</p></div>`;
  },

  GENERAL: [
    { q: 'В выписке не указана кровопотеря, хотя поле обязательное. Что внести?', a: 'Отметить «нет в документе»', o: ['Оставить пустым', 'Внести 0', 'Отметить «нет в документе»', 'Внести среднее по отделению'] },
    { q: 'Пациенту не выполнялась химиотерапия, поле «Ответ на химиотерапию». Что внести?', a: 'Отметить «не применимо»', o: ['Отметить «неизвестно»', 'Отметить «не применимо»', 'Выбрать «нет ответа»', 'Удалить форму'] },
    { q: 'Чем отличается черновик от завершённой формы?', a: 'Черновик не входит в показатели и отчёты, пока его не завершат', o: ['Ничем', 'Черновик не входит в показатели и отчёты, пока его не завершат', 'Черновик видит только автор', 'Черновик удаляется через 30 дней'] },
    { q: 'ИИ заполнил форму из документа. Что нужно сделать врачу?', a: 'Сверить значения по цитатам и сохранить форму', o: ['Ничего, ИИ не ошибается', 'Сверить значения по цитатам и сохранить форму', 'Удалить форму и внести заново', 'Отправить документ координатору'] },
    { q: 'Как исправить уже завершённую и заблокированную форму?', a: 'Попросить руководителя разблокировать с указанием причины', o: ['Создать новую форму', 'Попросить руководителя разблокировать с указанием причины', 'Изменить в выгрузке Excel', 'Никак'] },
    { q: 'Кому видны изменения карточки пациента?', a: 'Все изменения с причиной попадают в журнал аудита', o: ['Никому', 'Только автору', 'Все изменения с причиной попадают в журнал аудита', 'Только администратору ИТ'] },
    { q: 'Пришёл запрос по данным от монитора. Что делать?', a: 'Проверить по первичному документу и ответить в запросе', o: ['Игнорировать', 'Проверить по первичному документу и ответить в запросе', 'Удалить запрос', 'Изменить значение без проверки'] }
  ],
  shuffle: list => list.map(x => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map(x => x[1]),
  questions(reg) {
    const fields = (reg.eventTypes || []).flatMap(et => (et.sections || []).flatMap(s => s.fields || []).map(f => ({ ...f, form: et.name })));
    const defined = fields.filter(f => f.def && String(f.def).length > 15);
    const own = this.shuffle(defined).slice(0, 5).map(f => {
      const others = this.shuffle(defined.filter(x => x.key !== f.key && x.def !== f.def)).slice(0, 3).map(x => x.def);
      return others.length >= 2 ? { q: `Какое определение у поля «${f.label}» (форма «${f.form}»)?`, a: f.def, o: this.shuffle([f.def, ...others]) } : null;
    }).filter(Boolean);
    const withOptions = fields.filter(f => f.type === 'select' && (f.options || []).length >= 3);
    const opt = this.shuffle(withOptions).slice(0, Math.max(0, 3 - own.length)).map(f => {
      const right = f.options[Math.floor(Math.random() * f.options.length)];
      const wrong = ['другое (вписать текстом)', 'по усмотрению врача', 'не заполняется'];
      return { q: `Поле «${f.label}»: какой вариант есть в словаре регистра?`, a: String(right), o: this.shuffle([String(right), ...wrong]) };
    });
    const general = this.shuffle(this.GENERAL).slice(0, 10 - own.length - opt.length);
    return this.shuffle([...general, ...own, ...opt]).map(x => ({ ...x, o: x.o.includes(x.a) ? x.o : this.shuffle([x.a, ...x.o.slice(0, 3)]) }));
  },
  async status(regId, userId = Auth.user.id) {
    const list = (await DB.all('saved')).filter(s => s.kind === 'certification' && s.registryId === regId && s.userId === userId && s.passed).sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const last = list[0];
    return last && last.validUntil >= today() ? last : null;
  }
};

Routes.certify = async (main, regId = '') => {
  const regs = await Data.registries();
  const reg = regs.find(r => r.id === regId) || regs[0];
  if (!reg) { main.innerHTML = '<div class="head"><h1>Аттестация регистратора</h1></div>' + emptyState('Нет регистров.'); return; }
  const current = await Registrar.status(reg.id);
  const all = (await DB.all('saved')).filter(s => s.kind === 'certification' && s.registryId === reg.id);
  const users = await Data.users();
  const qs = Registrar.questions(reg);
  main.innerHTML = `<div class="head"><h1>Аттестация регистратора</h1>${regSelect(regs, reg.id, 'ctReg', false)}</div>
    <div class="card"><p>Ежегодная проверка знания правил ввода и словаря регистра «${esc(reg.name)}». 10 вопросов, зачёт от 8 правильных, действует год. Так данные разных врачей и центров остаются сопоставимыми.</p>
      <p>${current ? `<span class="okt">Аттестация действует до ${fmtDate(current.validUntil)}</span> (результат ${current.score} из ${current.total}).` : '<span class="warnt">Действующей аттестации нет.</span>'}</p></div>
    <form class="card" id="ctForm">${qs.map((x, i) => `<fieldset class="sec"><legend>${i + 1}. ${esc(x.q)}</legend>${x.o.map((o, j) => `<label class="chk"><input type="radio" name="q${i}" value="${j}"> ${esc(o)}</label>`).join('<br>')}</fieldset>`).join('')}
      <div class="row"><button class="btn primary" id="ctGo" type="submit">Проверить ответы</button></div><div id="ctOut" role="status"></div></form>
    ${can('users') && all.length ? `<div class="card"><h3>Результаты сотрудников</h3><table class="tbl small"><thead><tr><th>Сотрудник</th><th>Дата</th><th>Результат</th><th>Действует до</th></tr></thead><tbody>
      ${all.sort((a, b) => String(b.at).localeCompare(String(a.at))).map(x => `<tr><td>${esc(users.find(u => u.id === x.userId)?.name || x.userId)}</td><td>${fmtDate(x.at)}</td><td>${x.score} из ${x.total} ${x.passed ? '<span class="okt">зачёт</span>' : '<span class="bad">нет</span>'}</td><td>${x.passed ? fmtDate(x.validUntil) : ''}</td></tr>`).join('')}</tbody></table></div>` : ''}`;
  $('#ctReg', main).onchange = e => go('certify/' + e.target.value);
  $('#ctForm', main).onsubmit = async event => {
    event.preventDefault();
    const answers = qs.map((x, i) => $(`input[name="q${i}"]:checked`, main));
    if (answers.some(a => !a)) return toast('Ответьте на все вопросы', 'err');
    let score = 0;
    qs.forEach((x, i) => {
      const box = $$(`input[name="q${i}"]`, main);
      const ok = x.o[Number(answers[i].value)] === x.a;
      if (ok) score++;
      box.forEach(input => { input.disabled = true; const label = input.closest('label'); if (x.o[Number(input.value)] === x.a) label.classList.add('okt'); else if (input.checked) label.classList.add('bad'); });
    });
    const passed = score >= Math.ceil(qs.length * 0.8);
    await DB.put('saved', { kind: 'certification', registryId: reg.id, userId: Auth.user.id, score, total: qs.length, passed, at: today(), validUntil: passed ? addDays(today(), 365) : '' }, 'аттестация регистратора');
    $('#ctGo', main).remove();
    $('#ctOut', main).innerHTML = `<p class="${passed ? 'okt' : 'bad'}"><b>${score} из ${qs.length}.</b> ${passed ? 'Зачёт, аттестация действует год.' : 'Не зачтено: правильные ответы отмечены зелёным. Попробуйте ещё раз.'}</p><button class="btn" type="button" id="ctAgain">Пройти заново</button>`;
    $('#ctAgain', main).onclick = () => Routes.certify(main, reg.id);
  };
};
ROUTE_GROUP.certify = 'Работа';
NAV_ICONS.certify = NAV_ICONS.certify || '✓';
{
  const previous = navGroups;
  navGroups = async function () {
    const groups = await previous();
    const work = groups.find(g => g.id === 'work');
    if (work?.items && can('enter') && !work.items.some(x => x.r === 'certify')) {
      const sep = work.items.findIndex(x => x.sep !== undefined);
      work.items.splice(sep < 0 ? work.items.length : sep, 0, { r: 'certify', t: 'Аттестация регистратора', i: '✓' });
    }
    return groups;
  };
}
{
  const dictionary = Routes.dictionary;
  Routes.dictionary = async (main, regId = '') => {
    const hash = location.hash;
    await dictionary(main, regId);
    const regs = await Data.registries();
    const reg = regs.find(r => r.id === regId) || regs[0];
    if (location.hash !== hash) return;
    if (reg && !$('#burdenCard', main)) $('.head', main)?.insertAdjacentHTML('afterend', Registrar.burdenCard(reg));
  };
}
