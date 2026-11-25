/* AddAll 2.0: демонстрационный ИИ для учебного режима.
   Работает только в учебном режиме (TRAIN) и только если там не подключена настоящая модель.
   Ответы собираются правилами из того, что AddAll передаёт модели: поиск строк «Поле: значение» в учебном документе,
   ключевые слова в вопросе, заготовленные шаблоны. Это показ того, как устроены ИИ-функции, а не настоящая модель:
   данные никуда не отправляются. В рабочем режиме этот файл ничего не меняет. Подключается после aibuild.js. */
'use strict';

const AIDemo = {
  on: () => typeof TRAIN !== 'undefined' && TRAIN,
  norm: s => String(s ?? '').normalize('NFKC').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim(),
  between(text, start, end) { const i = text.indexOf(start); if (i < 0) return ''; const j = end ? text.indexOf(end, i + start.length) : -1; return text.slice(i + start.length, j < 0 ? undefined : j); },
  json(text, start, end) { try { return JSON.parse(AIDemo.between(text, start, end).trim()); } catch (e) { return null; } },
  day(v) {
    const s = String(v || ''); let m = s.match(/(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
  },
  /* строки документа вида «Подпись: значение» */
  lines(text) {
    return String(text || '').split(/\r?\n|(?<=\.)\s+(?=[А-ЯA-Z])/).map(l => l.trim()).filter(Boolean)
      .map(l => { const i = l.indexOf(':'); return i > 0 ? { raw: l, label: AIDemo.norm(l.slice(0, i)), value: l.slice(i + 1).trim().replace(/[.;]\s*$/, '') } : null; }).filter(Boolean);
  },
  find(lines, label) { const n = AIDemo.norm(label); return lines.find(l => l.label === n) || lines.find(l => l.label.includes(n) || (n.length > 5 && n.includes(l.label))); },
  coerce(f, v) {
    const t = f.type, s = String(v).trim();
    if (t === 'number' || t === 'integer') { const n = Number(s.replace(',', '.').match(/-?\d+([.]\d+)?/)?.[0]); return Number.isFinite(n) ? n : null; }
    if (t === 'date') return AIDemo.day(s);
    if (t === 'yesno') return /^да\b/i.test(s) ? 'да' : /^нет\b/i.test(s) ? 'нет' : null;
    if (t === 'select') return (f.allowed || []).find(o => AIDemo.norm(o) === AIDemo.norm(s)) || (f.allowed || []).find(o => AIDemo.norm(s).includes(AIDemo.norm(o))) || null;
    if (t === 'multiselect') { const picks = (f.allowed || []).filter(o => AIDemo.norm(s).includes(AIDemo.norm(o))); return picks.length ? picks : null; }
    if (['text', 'textarea', 'icd10', 'icdo'].includes(t)) return s;
    return null;
  },
  extractFields(schema, lines) {
    const fields = {}, evidence = {};
    for (const f of schema || []) {
      if (['calc', 'group', 'complist', 'user', 'file', 'image'].includes(f.type)) continue;
      const hit = AIDemo.find(lines, f.label); if (!hit) continue;
      const v = AIDemo.coerce(f, hit.value); if (v == null || v === '') continue;
      fields[f.key] = v; evidence[f.key] = hit.raw.slice(0, 160);
    }
    return { fields, evidence };
  },
  firstDate(text) { const m = String(text).match(/\b(\d{1,2}[./]\d{1,2}[./]\d{4}|\d{4}-\d{2}-\d{2})\b/); return m ? { day: AIDemo.day(m[1]), quote: m[0] } : null; },

  /* ---------- ответы по видам запросов ---------- */
  extractOne(prompt, doc) {
    const schema = AIDemo.json(prompt, 'Поля формы (JSON):\n', '\nОтвет:');
    const lines = AIDemo.lines(doc.text);
    const { fields, evidence } = AIDemo.extractFields(schema, lines);
    /* дата события: строка с подписью даты этой формы, иначе первая дата документа, кроме даты рождения */
    const label = AIDemo.between(prompt, 'дату события «', '»'), own = label && lines.find(l => l.label === AIDemo.norm(label));
    const d = own && AIDemo.day(own.value) ? { day: AIDemo.day(own.value) } : AIDemo.firstDate(lines.filter(l => !/рожд/.test(l.label)).map(l => l.raw).join('\n'));
    return { event_date: d?.day || null, fields, evidence, warnings: ['Демонстрационный ИИ учебного режима: значения найдены по строкам «Поле: значение»'] };
  },
  extractAll(prompt, doc) {
    const schema = AIDemo.json(prompt, 'Схема (JSON): ', '\nТолько JSON');
    const lines = AIDemo.lines(doc.text), d = AIDemo.firstDate(lines.filter(l => !/рожд/.test(l.label)).map(l => l.raw).join('\n'));
    const events = [];
    for (const et of schema?.event_types || []) {
      const { fields, evidence } = AIDemo.extractFields(et.fields, lines);
      /* дата события: строка с подписью даты этой формы («Дата операции: …»), иначе первая дата документа, кроме даты рождения */
      const own = lines.find(l => (et.date_meaning && l.label === AIDemo.norm(et.date_meaning)) || l.label === AIDemo.norm('Дата (' + et.name + ')'));
      const day = own && AIDemo.day(own.value);
      if (Object.keys(fields).length >= 2) events.push({ type: et.type, event_date: day || d?.day || null, date_evidence: day ? own.raw : d?.quote || '', fields, evidence });
    }
    const out = { events: events.slice(0, 3), warnings: ['Демонстрационный ИИ учебного режима'] };
    if (schema?.patient) out.patient = AIDemo.extractFields(schema.patient, lines).fields;
    return out;
  },
  check(prompt, doc) {
    const rows = AIDemo.json(prompt, 'Поля формы:\n') || [];
    const lines = AIDemo.lines(doc.text);
    const file = AIDemo.between(doc.text, '=== Файл: ', ' ===') || 'документ';
    return { items: rows.map(r => {
      const hit = AIDemo.find(lines, r.label);
      if (!hit) return { field: r.field, status: 'нет_в_документах', note: 'Демо: строки с этим полем в документе нет' };
      const same = AIDemo.norm(hit.value) === AIDemo.norm(r.value) || (Number.isFinite(Number(r.value)) && Number(String(hit.value).replace(',', '.').match(/-?\d+([.]\d+)?/)?.[0]) === Number(r.value));
      return { field: r.field, status: same ? 'подтверждено' : 'расхождение', doc_value: hit.value, quote: hit.raw.slice(0, 160), file };
    }) };
  },
  build(prompt) {
    const previous = AIDemo.json(prompt, 'Вот текущая структура регистра в JSON:\n', '\nИзмени её');
    const ask = AIDemo.between(prompt, '«', '»'), q = AIDemo.norm(ask);
    const F = (key, label, type, extra = {}) => ({ key, label, type, ...extra });
    if (previous) {
      const reg = previous;
      const add = q.match(/добав\S*\s+(.+)/), del = q.match(/убер\S*\s+(.+)/);
      if (add) { const label = add[1].replace(/^(поле|шкалу|графу)\s+/, ''); const last = reg.eventTypes[reg.eventTypes.length - 1]; last.sections[last.sections.length - 1].fields.push(F('f_' + (reg.eventTypes.reduce((n, e) => n + e.sections.reduce((m, s) => m + s.fields.length, 0), 0) + 1), label.charAt(0).toUpperCase() + label.slice(1), /шкал|балл|score/i.test(label) ? 'number' : 'text')); }
      if (del) { const w = AIDemo.norm(del[1]).slice(0, 6); reg.eventTypes = reg.eventTypes.filter(e => !AIDemo.norm(e.name).includes(w)); reg.eventTypes.forEach(e => e.sections.forEach(s => { s.fields = s.fields.filter(f => !AIDemo.norm(f.label).includes(w)); })); }
      return reg;
    }
    const has = (...w) => w.some(x => q.includes(x));
    const ets = [{ id: 'enrol', name: 'Включение в регистр', dateLabel: 'Дата включения', single: true, sections: [{ title: 'Диагноз и состояние', fields: [
      F('dx', 'Диагноз (МКБ-10)', 'icd10', { required: true, def: 'Основной диагноз при включении' }),
      F('asa', 'ASA', 'select', { options: ['I', 'II', 'III', 'IV', 'V'] }), F('ecog', 'ECOG', 'select', { options: ['0', '1', '2', '3', '4'] }),
      F('height', 'Рост', 'number', { unit: 'см' }), F('weight', 'Вес', 'number', { unit: 'кг' }), F('bmi', 'ИМТ', 'calc', { formula: 'bmi(height, weight)' })] }] }];
    if (has('мрт', 'стадир')) ets.push({ id: 'mri', name: 'МРТ', dateLabel: 'Дата МРТ', sections: [{ title: 'Стадия', fields: [F('ct', 'cT', 'select', { options: ['T1', 'T2', 'T3', 'T4a', 'T4b'] }), F('cn', 'cN', 'select', { options: ['N0', 'N1', 'N2'] }), F('crm', 'CRM поражена', 'yesno'), F('emvi', 'EMVI', 'yesno')] }] });
    if (has('tnt', 'хими', 'лучев', 'терап')) ets.push({ id: 'therapy', name: 'Курс лечения', dateLabel: 'Дата начала', sections: [{ title: 'Лечение', fields: [F('scheme', 'Схема', 'text'), F('completed', 'Курс завершён полностью', 'yesno'), F('tox3', 'Токсичность 3-4 степени (CTCAE)', 'yesno')] }] });
    if (has('ответ', 'watch', 'эндоскоп')) ets.push({ id: 'response', name: 'Оценка ответа', dateLabel: 'Дата оценки', expect: { days: 90, every: 0, mode: 'at' }, sections: [{ title: 'Ответ', fields: [F('ccr', 'Полный клинический ответ', 'yesno', { required: true }), F('tactic', 'Тактика', 'select', { options: ['watch and wait', 'операция', 'продолжение лечения'] })] }] });
    if (has('операц', 'хирург', 'резекц', 'грыж', 'вмешат') || ets.length === 1) ets.push({ id: 'surgery', name: 'Операция', dateLabel: 'Дата операции', sections: [{ title: 'Операция', fields: [F('op', 'Вид операции', 'text', { required: true }), F('access', 'Доступ', 'select', { options: ['открытый', 'лапароскопический', 'робот'] }), F('dur', 'Длительность', 'number', { unit: 'мин' }), F('comp', 'Осложнения', 'complist')] }, { title: 'Исход госпитализации', fields: [F('leak', 'Несостоятельность анастомоза', 'yesno'), F('readm', 'Повторная госпитализация в 30 дней', 'yesno'), F('death30', 'Смерть в 30 дней', 'yesno')] }] });
    if (has('морфолог', 'гистолог', 'ypt', 'pcr')) ets.push({ id: 'path', name: 'Патоморфология', dateLabel: 'Дата заключения', sections: [{ title: 'Заключение', fields: [F('ypt', 'ypT', 'select', { options: ['T0', 'T1', 'T2', 'T3', 'T4'] }), F('ypn', 'ypN', 'select', { options: ['N0', 'N1', 'N2'] }), F('lnn', 'Удалено лимфоузлов', 'number')] }] });
    ets.push({ id: 'followup', name: 'Наблюдение', dateLabel: 'Дата контакта', expect: { days: 90, every: 90, mode: 'at' }, sections: [{ title: 'Статус', fields: [F('status', 'Статус', 'select', { options: ['жив', 'умер', 'потерян для наблюдения'], required: true }), F('recur', 'Рецидив или повторный рост', 'yesno'), ...(has('lars', 'функц') ? [F('lars', 'Шкала LARS', 'number', { min: 0, max: 42 })] : [])] }] });
    const head = ask.split(/[:;.,(]/)[0].trim().slice(0, 80);
    const name = head.length > 8 ? (/^регистр/i.test(head) ? head.charAt(0).toUpperCase() + head.slice(1) : 'Регистр: ' + head) : 'Новый регистр';
    const indicators = [];
    if (ets.some(e => e.id === 'surgery')) indicators.push({ id: 'i_leak', name: 'Несостоятельность анастомоза', et: 'surgery', num: { key: 'leak', op: 'eq', value: 'да' }, denom: null, lowerBetter: true });
    indicators.push({ id: 'i_recur', name: 'Рецидив или повторный рост', et: 'followup', num: { key: 'recur', op: 'eq', value: 'да' }, denom: null, lowerBetter: true });
    return { name, description: 'Собрано демонстрационным ИИ учебного режима по ключевым словам описания. Настоящая модель соберёт структуру точнее.', patientFields: [], eventTypes: ets, indicators, keyDates: { start: 'enrol' } };
  },
  ask(prompt) {
    const q = AIDemo.norm(AIDemo.between(prompt, 'Вопрос: «', '»'));
    const cat = AIDemo.json(prompt, 'Формы и поля (код, подпись, тип, варианты): ', '\nОператоры') || [];
    const conds = [], special = [];
    if (/женщ/.test(q)) conds.push({ et: '_p', key: 'sex', op: 'eq', value: 'Ж' });
    if (/мужч/.test(q)) conds.push({ et: '_p', key: 'sex', op: 'eq', value: 'М' });
    if (/умер|умерш|смерт/.test(q)) special.push('dead'); else if (/живы|жив\b/.test(q)) special.push('alive');
    if (/срок|исход|наблюден/.test(q) && /не внес|нет|неизвест|не уточн/.test(q)) special.push('followup_missing');
    if (/черновик/.test(q)) special.push('drafts');
    if (/запрос/.test(q)) special.push('open_queries');
    for (const form of cat) for (const [key, label, type, options] of form.fields || []) {
      if (type === 'yesno' && q.includes(AIDemo.norm(label).split(' ')[0]) && AIDemo.norm(label).split(' ')[0].length > 5) conds.push({ et: form.form, key, op: 'eq', value: /без|нет\b/.test(q) ? 'нет' : 'да' });
      for (const o of options || []) if (String(o).length > 3 && q.includes(AIDemo.norm(o))) conds.push({ et: form.form, key, op: 'eq', value: o });
    }
    const y = q.match(/(20\d\d)/);
    return { conds: conds.slice(0, 4), special, from: y ? `${y[1]}-01-01` : null, to: y ? `${y[1]}-12-31` : null,
      explain: 'Демонстрационный ИИ понял вопрос по ключевым словам. Проверьте условия ниже.', unsupported: conds.length || special.length || y ? '' : 'Демо понимает простые вопросы: пол, живые или умершие, год, варианты ответов полей, «срок наблюдения наступил, исход не внесён», черновики, запросы.' };
  },
  summary(prompt) {
    let facts = null; try { facts = JSON.parse(prompt.slice(prompt.lastIndexOf('\n{') + 1)); } catch (e) { }
    if (!facts) return { text: 'Демо: сводку пересказать не удалось.' };
    const bad = (facts.checks || []).filter(c => !c.ok);
    return { text: `За ${facts.period} в регистре «${facts.registry}» ${facts.cases} случаев${facts.previous ? `, в прошлом квартале было ${facts.previous.cases}` : ''}. ${bad.length ? `Не пройдено проверок: ${bad.length}, например: ${bad[0].text.toLowerCase()}.` : 'Все проверки периода пройдены.'} ${facts.tasks?.length ? `В первую очередь: ${facts.tasks[0].charAt(0).toLowerCase() + facts.tasks[0].slice(1)}.` : 'Срочных задач нет.'} (Пересказ демонстрационного ИИ учебного режима.)` };
  },
  ideas(prompt) {
    const rows = AIDemo.json(prompt, 'частые значения):\n', '\nОтвет только JSON') || [];
    const outcome = rows.filter(r => r[3] === 'yesno' || /осложн|рецид|смерт|несостоят|ответ|повтор/i.test(r[2])).sort((a, b) => b[4] - a[4]);
    let factor = rows.filter(r => ['select', 'number', 'calc'].includes(r[3]) && !outcome.includes(r)).sort((a, b) => b[4] - a[4]);
    /* если исходов в данных ещё нет, берутся пары заполненных полей (связь двух показателей) */
    if (!outcome.length && factor.length > 2) { outcome.push(...factor.slice(-2)); factor = factor.slice(0, -2); }
    const ideas = [];
    for (const o of outcome.slice(0, 3)) for (const x of factor.slice(0, 2)) ideas.push({
      title: o[3] === 'yesno' ? `${x[2]} как фактор риска: ${o[2].charAt(0).toLowerCase() + o[2].slice(1)} (данные регистра)` : `Связь показателей «${x[2]}» и «${o[2]}» по данным регистра`,
      question: `Связан ли показатель «${x[2]}» с исходом «${o[2]}»?`, design: 'ретроспективное когортное исследование, логистическая регрессия', fields: [x[0], o[0]], outcome: o[0],
      why: 'Тема подобрана демонстрационным ИИ по самым заполненным полям регистра.', limits: 'одноцентровые данные, возможны неучтённые факторы' });
    return { ideas: ideas.slice(0, 5) };
  },
  mm(prompt, doc) {
    const forms = AIDemo.json(prompt, 'формы по датам): ', '\n') || [];
    const lines = String(doc.text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const timeline = forms.map(f => {
      const vals = Object.entries(f.values || {}).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join('; ');
      const quote = lines.find(l => vals && Object.values(f.values || {}).some(v => String(v).length > 2 && l.includes(String(v)))) || '';
      return { date: f.date, what: `${f.form}${vals ? ': ' + vals : ''}`, source: quote ? (AIDemo.between(doc.text, '=== Файл: ', ' ===') || 'документ') : 'форма регистра', quote: quote.split(/\s+/).slice(0, 20).join(' ') };
    });
    return { timeline, summary: 'Хронология собрана демонстрационным ИИ из форм регистра и строк учебного документа. Настоящая модель опишет течение случая своими словами.',
      questions: ['Были ли факторы риска учтены при выборе тактики?', 'Когда появились первые признаки осложнения и когда оно было распознано?', 'Соответствовало ли лечение осложнения принятым рекомендациям?', 'Можно ли было предотвратить осложнение?', 'Что изменить в работе отделения по итогам разбора?'] };
  },
  brief(prompt) {
    let ctx = {}; try { ctx = JSON.parse(prompt.slice(prompt.indexOf('{', prompt.indexOf('JSON')))); } catch (e) { }
    return [`• Просроченных форм наблюдения: ${(ctx.overdue_followups || []).length}.`, `• Анкет пациентов к отправке: ${ctx.proms_due ?? 0}.`, `• Открытых запросов по данным: ${ctx.open_queries ?? 0}.`, '• (Брифинг демонстрационного ИИ учебного режима.)'].join('\n');
  },
  answer(prompt, doc) {
    if (/Ответь JSON: \{"ok": true\}/.test(prompt)) return '{"ok": true}';
    if (prompt.includes('Поля формы (JSON):')) return JSON.stringify(AIDemo.extractOne(prompt, doc));
    if (prompt.includes('Схема (JSON):')) return JSON.stringify(AIDemo.extractAll(prompt, doc));
    if (prompt.includes('Сверь значения формы')) return JSON.stringify(AIDemo.check(prompt, doc));
    if (prompt.includes('методист клинических регистров')) return JSON.stringify(AIDemo.build(prompt));
    if (prompt.includes('Переведи вопрос врача')) return JSON.stringify(AIDemo.ask(prompt));
    if (prompt.includes('Перескажи сводку')) return JSON.stringify(AIDemo.summary(prompt));
    if (prompt.includes('научный руководитель клинического регистра')) return JSON.stringify(AIDemo.ideas(prompt));
    if (prompt.includes('(M&M)')) return JSON.stringify(AIDemo.mm(prompt, doc));
    if (prompt.includes('брифинг')) return AIDemo.brief(prompt);
    if (prompt.includes('ассистент хирурга')) return 'Это демонстрационный ИИ учебного режима. С настоящей моделью ассистент отвечает на вопросы по данным регистра: сколько пациентов, какие формы не внесены, что изменилось. Попробуйте «Вопрос к регистру», «ИИ-сверку» и «Регистр из описания»: они показаны на учебных данных.';
    throw new Error('В учебном режиме эта функция ИИ не показывается. Подключите модель в рабочем режиме.');
  },

  /* учебный документ для сверки и разбора: значения сохранённой формы, одно значение намеренно отличается */
  async seedDoc() {
    if (!AIDemo.on() || AIDemo._seeded) return; AIDemo._seeded = true;
    const files = await DB.all('files');
    if (files.some(f => f.demoDoc)) return;
    /* в пустой учебной базе создаётся вымышленный пациент с заполненной формой */
    if (!(await DB.all('events')).some(e => e.status !== 'черновик')) {
      const reg = (await DB.get('registries', 'training-example')) || (await DB.all('registries'))[0];
      const et = reg && (reg.eventTypes || []).find(x => formFields(x).filter(f => ['number', 'select', 'yesno'].includes(f.type) && !f.showIf?.key).length >= 4);
      if (et) {
        const data = {};
        for (const f of formFields(et).filter(f => !f.showIf?.key)) {
          if (f.type === 'number') data[f.key] = !isEmpty(f.min) && !isEmpty(f.max) ? Math.round((Number(f.min) + Number(f.max)) / 2) : 60;
          else if (f.type === 'select' && f.options?.length) data[f.key] = f.options[Math.min(1, f.options.length - 1)];
          else if (f.type === 'yesno') data[f.key] = 'нет';
        }
        const p = await DB.put('patients', { registryId: reg.id, lastName: 'Демонстрационный', firstName: 'Пациент', birthDate: '1962-04-15', sex: 'М', localId: 'ДЕМО-1', demoPatient: true, center: TRAIN_USER.center, consent: 'да', vital: 'жив', data: {} }, 'учебный пациент для демонстрации ИИ');
        await DB.put('events', { patientId: p.id, registryId: reg.id, type: et.id, date: addDays(today(), -40), data, status: 'завершено', schemaVersion: reg.version }, 'учебная форма для демонстрации ИИ');
      }
    }
    for (const reg of await DB.all('registries')) {
      const events = (await DB.all('events')).filter(e => e.registryId === reg.id && e.status !== 'черновик').sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      for (const ev of events) {
        const et = (reg.eventTypes || []).find(x => x.id === ev.type); if (!et) continue;
        const fs = formFields(et).filter(f => ['number', 'select', 'yesno', 'text'].includes(f.type) && !isEmpty(ev.data?.[f.key]) && !f.showIf?.key);
        if (fs.length < 3) continue;
        const p = await DB.get('patients', ev.patientId); if (!p) continue;
        let changed = false;
        const rows = fs.slice(0, 10).map(f => {
          let v = ev.data[f.key];
          if (!changed && f.type === 'number') { v = Number(v) + 3; changed = true; }
          return `${f.label}: ${v}`;
        });
        const d = ev.date ? ev.date.split('-').reverse().join('.') : '';
        const text = `ВЫПИСНОЙ ЭПИКРИЗ (учебный документ, вымышленный пациент)\nДата: ${d}\n${et.name}.\n${rows.join('\n')}\nВыписан в удовлетворительном состоянии.`;
        await DB.put('files', { patientId: p.id, registryId: reg.id, name: 'Выписка (учебная).txt', type: 'text/plain', size: text.length, blob: new Blob([text], { type: 'text/plain' }), demoDoc: true, eventId: ev.id }, 'учебный документ для демонстрации ИИ');
        return;
      }
    }
  }
};

if (AIDemo.on()) {
  const cfg = AI.cfg.bind(AI);
  AI.cfg = function () { const c = cfg(); return c.provider && c.provider !== 'none' ? c : { provider: 'demo', model: 'демо' }; };
  AI.local = function () { const p = this.cfg().provider; return p === 'ollama' || p === 'demo'; };
  const call = AI.call.bind(AI);
  AI.call = async function (prompt, doc = {}) {
    if (this.cfg().provider !== 'demo') return call(prompt, doc);
    if (!AIDemo._told) { AIDemo._told = true; toast('Учебный режим: работает демонстрационный ИИ, ответы собираются по правилам'); }
    await new Promise(r => setTimeout(r, 400));
    return AIDemo.answer(prompt, doc || {});
  };
  const boot = App.boot.bind(App);
  App.boot = async function () { const r = await boot(); try { await AIDemo.seedDoc(); } catch (e) { } return r; };
}

if (typeof TRAINING_CHAPTERS !== 'undefined' && typeof TrainingGuide === 'object') {
  const at = TRAINING_CHAPTERS.findIndex(c => c.id === 'regsummary');
  TRAINING_CHAPTERS.splice(at < 0 ? TRAINING_CHAPTERS.length - 1 : at, 0, { id: 'aidemo', name: 'ИИ-помощник: что он умеет', page: 'home', go: 'home', steps: [
    { t: '#aiPill', title: 'ИИ в AddAll', text: 'ИИ помогает, но не решает за врача. Он заполняет формы из выписок с цитатой к каждому значению, сверяет готовые формы с документами, отвечает на вопросы к регистру, собирает новый регистр по описанию, готовит черновик разбора к M&M и предлагает темы для статей. Всё, что предлагает ИИ, врач проверяет и подтверждает.' },
    { t: '#aiPill', title: 'Демонстрационный ИИ', text: 'В учебном режиме работает демонстрационный ИИ: ответы собираются по правилам из учебных данных, ничего никуда не отправляется. Так видно, как устроена каждая функция. В рабочем режиме подключается настоящая модель: локальная на сервере учреждения (данные не покидают его) или внешний сервис.' },
    { t: '#hNewAI', title: 'Пациент из документа', text: 'Загрузите выписку: ИИ создаст карточку и события, а у каждого значения покажет цитату из документа. Для пробы у одного учебного пациента во вкладке «Файлы» лежит «Выписка (учебная)»: её можно скачать и загрузить сюда.' },
    { t: '#aiPill', title: 'Где искать', text: '«Работа» → «Сводка регистра», «Вопрос к регистру», «ИИ-сверка с документами», «Точность автозаполнения». «Регистры» → «Регистр из описания». «Наука» → «Идеи для исследований». «Пакет к M&M» → «Черновик разбора». Каждой функции посвящена своя глава гайда.' }
  ] });
  TrainingGuide.steps = TRAINING_CHAPTERS.flatMap((chapter, c) => chapter.steps.map((step, i) => ({ ...step, chapter, c, i })));
}
