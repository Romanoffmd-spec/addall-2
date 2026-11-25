/* Linked registry exports that preserve repeats and recorded missing values. */
'use strict';

const RegistryExport = {
  tables: {
    participants: ['participant_id', 'sex', 'local_id', 'name', 'birth_date', 'phone', 'email', 'iin', 'center'],
    episodes: ['episode_id', 'participant_id', 'event_id', 'date', 'day', 'center'],
    events: ['event_id', 'participant_id', 'episode_id', 'form', 'date', 'day', 'status', 'schema_version', 'revision', 'verified', 'file_evidence_count'],
    values: ['record_table', 'record_id', 'participant_id', 'form', 'schema_version', 'group', 'field', 'type',
      'item', 'value_number', 'value_text', 'value_code', 'value_json', 'missing_reason'],
    questionnaires: ['questionnaire_id', 'participant_id', 'instrument', 'offset_days', 'score', 'status', 'date', 'day'],
    questionnaire_answers: ['questionnaire_id', 'field', 'score'],
    dictionary: ['schema_version', 'form', 'section', 'group', 'field', 'label', 'type', 'unit', 'required', 'minimum', 'maximum', 'step',
      'options', 'option_codes', 'standard', 'standard_code', 'definition', 'condition', 'formula', 'sensitive'],
    quality_measures: ['schema_version', 'indicator', 'name', 'type', 'form', 'definition']
  },
  safeField(field) {
    return !field.sensitive && ['number', 'integer', 'calc', 'yesno', 'select', 'multiselect', 'icd10', 'icdo', 'date', 'datetime', 'time', 'group'].includes(field.type);
  },
  sanitized(field, value, base, clinical) {
    if (isEmpty(value)) return null;
    if (clinical) return value;
    if (!this.safeField(field)) return null;
    if (['number', 'integer', 'calc'].includes(field.type)) return typeof value === 'number' && Number.isFinite(value) ? value : null;
    if (field.type === 'yesno') return ['да', 'нет', 'неизвестно'].includes(value) ? value : null;
    if (field.type === 'select') return (field.options || []).includes(value) ? value : null;
    if (field.type === 'multiselect') return Array.isArray(value) ? value.filter(item => (field.options || []).includes(item)) : null;
    if (field.type === 'icd10') return /^\s*[A-Z][0-9]{2}(?:\.[0-9A-Z]+)?(?:\s|$)/i.exec(String(value))?.[0].trim() || null;
    if (field.type === 'icdo') return /^\s*[0-9]{4}\/[0-9](?:\s|$)/.exec(String(value))?.[0].trim() || null;
    if (field.type === 'date' || field.type === 'datetime') {
      const day = calendarDay(String(value).slice(0, 10));
      return base && day ? daysBetween(base, day) : null;
    }
    if (field.type === 'time') return null;
    return null;
  },

  fieldKey(form, group, field) {
    return [form, ...group, field].join('/');
  },

  sensitiveKeys(reg) {
    const keys = new Set();
    const scan = (form, group, list) => {
      for (const field of list || []) {
        const key = [...group, field.key];
        if (field.sensitive) keys.add([form, ...key].join('/'));
        if (field.type === 'group') scan(form, key, field.subfields);
      }
    };
    for (const schema of [reg, ...(reg.schemaHistory || [])]) {
      scan('_participant', [], schema.patientFields);
      for (const form of schema.eventTypes || []) scan(form.id, [], formFields(form));
    }
    return keys;
  },

  dictionary(reg, versions, clinical, selected = null) {
    const output = [], sensitive = this.sensitiveKeys(reg);
    const collect = (form, section, path, list, version) => {
      for (const field of list || []) {
        const key = this.fieldKey(form, path, field.key);
        if (!clinical && (!this.safeField(field) || sensitive.has(key))) continue;
        if (selected && !selected.has(key) && field.type !== 'group') continue;
        output.push({ schema_version: version, form, section, group: path.join('.'), field: field.key, label: field.label,
          type: !clinical && ['date', 'datetime'].includes(field.type) ? 'relative_day' : field.type,
          unit: !clinical && ['date', 'datetime'].includes(field.type) ? 'days_from_participant_anchor' : field.unit,
          required: !!field.required, minimum: field.min, maximum: field.max, step: field.step,
          options: field.options?.length ? JSON.stringify(field.options) : '', option_codes: field.optionCodes ? JSON.stringify(field.optionCodes) : '', standard: field.standard, standard_code: field.standardCode,
          definition: field.def, condition: field.showIf?.key ? JSON.stringify(field.showIf) : '', formula: field.formula, sensitive: !!field.sensitive });
        if (field.type === 'group') collect(form, section, [...path, field.key], field.subfields, version);
      }
    };
    for (const version of versions) {
      const schema = version === (reg.version || 1) ? reg : reg.schemaHistory?.find(item => item.version === version);
      if (!schema) continue;
      collect('_participant', '', [], schema.patientFields, version);
      for (const form of schema.eventTypes || []) {
        for (const section of form.sections || []) collect(form.id, section.title, [], section.fields, version);
      }
    }
    return output;
  },

  assemble(ds, questionnaires, options = {}) {
    const { reg } = ds;
    const clinical = options.identified === true;
    const selected = options.fields ? new Set(options.fields) : null;
    const sensitive = this.sensitiveKeys(reg);
    const rows = Object.fromEntries(Object.keys(this.tables).map(name => [name, []]));
    const identities = new Map(ds.patients.filter(visibleP).map(patient => [patient.id, patient]));
    const known = ds.events.filter(event => identities.has(event.patientId));
    const byId = new Map(known.map(event => [event.id, event]));
    const episodes = Episodes.list(reg, known, [...identities.values()]);
    const episodeMap = new Map(episodes.map(episode => [episode.id, episode]));
    const links = Episodes.link(reg, known);
    const centerOf = event => event.episodeCenter ?? identities.get(event.patientId)?.center ?? '';
    const valid = date => (!options.from || date >= options.from) && (!options.to || date <= options.to);
    const events = known.filter(event => valid(event.date) && (!options.center || centerOf(event) === options.center)
      && (options.drafts || event.status !== 'черновик'));
    const participants = new Set(events.map(event => event.patientId));
    if (!options.from && !options.to) {
      for (const patient of identities.values()) if (!options.center || patient.center === options.center) participants.add(patient.id);
    }
    const alias = (array, prefix) => new Map([...array].sort().map((id, i) => [id, clinical ? id : prefix + String(i + 1).padStart(5, '0')]));
    /* код участника: постоянный ID AddAll по выбору, иначе новые коды для этого файла */
    const participantIds = options.stablePid && !clinical
      ? new Map([...participants].map(id => [id, identities.get(id)?.pid || alias(participants, 'P').get(id)]))
      : alias(participants, 'P');
    const episodeIds = alias(new Set(events.map(event => links.get(event.id)).filter(Boolean)), 'EP');
    const eventIds = alias(events.map(event => event.id), 'EV');
    const dateBase = new Map();
    for (const episode of episodes) {
      if (!dateBase.has(episode.patientId) && calendarDay(episode.date)) dateBase.set(episode.patientId, episode.date);
    }
    for (const event of [...known].sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
      if (!dateBase.has(event.patientId) && calendarDay(event.date)) dateBase.set(event.patientId, event.date);
    }
    const relative = (patientId, value) => dateBase.has(patientId) && calendarDay(String(value || '').slice(0, 10))
      ? daysBetween(dateBase.get(patientId), String(value).slice(0, 10)) : null;
    function putValue(value, output) {
      if (typeof value === 'number') output.value_number = value;
      else if (typeof value === 'string') output.value_text = value;
      else if (value != null) output.value_json = JSON.stringify(value);
      rows.values.push(output);
    }
    const values = (fields, data, context, group = [], itemPath = []) => {
      for (const field of fields || []) {
        const key = this.fieldKey(context.form, group, field.key);
        if (!clinical && (!this.safeField(field) || sensitive.has(key))) continue;
        if (selected && !selected.has(key) && field.type !== 'group') continue;
        const raw = data[field.key];
        if (field.type === 'group') {
          if (Array.isArray(raw)) raw.forEach((groupRow, i) => {
            if (groupRow && typeof groupRow === 'object') values(field.subfields, groupRow, context, [...group, field.key], [...itemPath, i + 1]);
          });
          if (!data._na?.[field.key] || selected && !selected.has(key)) continue;
        }
        const reason = data._na?.[field.key] || '';
        if (!reason && !isEmpty(field.showIf?.key) && !condOK(field.showIf, data) && isEmpty(raw)) continue;
        const value = field.type === 'group' ? null : this.sanitized(field, raw, dateBase.get(context.patientId), clinical);
        const { patientId, ...meta } = context;
        const base = { ...meta, participant_id: participantIds.get(patientId), group: group.join('.'), field: field.key, type: field.type,
          item: itemPath.join('.'), missing_reason: reason || (isEmpty(raw) ? 'not_recorded' : value == null ? 'withheld_or_invalid' : '') };
        const code = choice => field.type === 'yesno' ? { 'да': 'yes', 'нет': 'no', 'неизвестно': 'unknown' }[choice]
          : typeof choice === 'string' && Object.hasOwn(field.optionCodes || {}, choice) ? field.optionCodes[choice] : undefined;
        if (field.type === 'multiselect' && Array.isArray(value) && value.length) {
          value.forEach((choice, i) => putValue(choice, { ...base, item: [...itemPath, i + 1].join('.'), value_code: code(choice) }));
        } else putValue(value, { ...base, value_code: code(value) });
      }
    };
    const version = reg.version || 1;
    for (const id of participants) {
      const patient = identities.get(id), participant_id = participantIds.get(id);
      rows.participants.push({ participant_id, sex: patient.sex,
        ...(clinical ? { local_id: patient.localId, name: pname(patient), birth_date: patient.birthDate, phone: patient.phone, email: patient.email,
          iin: patient.iin, center: patient.center } : {}) });
      values(reg.patientFields, patient.data || {}, { patientId: id, record_table: 'participants', record_id: participant_id, form: '_participant', schema_version: version });
    }
    for (const [id, episode_id] of episodeIds) {
      const episode = episodeMap.get(id);
      if (!episode) continue;
      rows.episodes.push({ episode_id, participant_id: participantIds.get(episode.patientId), event_id: eventIds.get(episode.anchorEventId || episode.id),
        date: clinical ? episode.date : '', day: relative(episode.patientId, episode.date), center: clinical ? centerOf(episode) : '' });
    }
    const versions = new Set([version]);
    for (const event of events) {
      const schemaVersion = event.schemaVersion || version;
      versions.add(schemaVersion);
      const older = schemaVersion === version ? null : reg.schemaHistory?.find(item => item.version === schemaVersion);
      const schema = older ? { ...reg, ...older } : reg;
      const form = etById(schema, event.type);
      const event_id = eventIds.get(event.id);
      rows.events.push({ event_id, participant_id: participantIds.get(event.patientId), episode_id: episodeIds.get(links.get(event.id)), form: event.type,
        date: clinical ? event.date : '', day: relative(event.patientId, event.date), status: event.status, schema_version: schemaVersion,
        revision: event.rev ?? '', verified: !!event.verified, file_evidence_count: Object.keys(event.aiEvidence || {}).length });
      const data = form ? computeValues(schema, identities.get(event.patientId), form, event.data, event.date) : (event.data || {});
      const fields = formFields(form);
      const reference = { patientId: event.patientId, record_table: 'events', record_id: event_id, form: event.type, schema_version: schemaVersion };
      values(fields, data, reference);
      if (clinical) {
        const keys = new Set(fields.map(field => field.key));
        const oldData = Object.fromEntries(Object.entries(event.data || {}).filter(([key]) => !keys.has(key) && !key.startsWith('_')));
        values(Object.keys(oldData).map(key => ({ key, type: 'legacy' })), oldData, reference);
      }
    }
    const surveys = questionnaires.filter(entry => entry.registryId === reg.id && participants.has(entry.patientId)
      && valid((entry.doneAt || entry.due || '').slice(0, 10)) && (!options.center || !entry.anchorEventId || centerOf(byId.get(entry.anchorEventId) || entry) === options.center));
    const surveyIds = alias(surveys.map(survey => survey.id), 'Q');
    for (const entry of surveys) {
      const questionnaire_id = surveyIds.get(entry.id);
      const when = (entry.doneAt || entry.due || '').slice(0, 10);
      rows.questionnaires.push({ questionnaire_id, participant_id: participantIds.get(entry.patientId), instrument: entry.instrumentName || entry.instrumentId,
        offset_days: entry.offset, score: entry.score, status: entry.doneAt ? 'completed' : 'due', date: clinical ? when : '', day: relative(entry.patientId, when) });
      for (const [field, score] of Object.entries(entry.answers || {})) {
        if (typeof score === 'number' && Number.isFinite(score)) rows.questionnaire_answers.push({ questionnaire_id, field, score });
      }
    }
    rows.dictionary = this.dictionary(reg, versions, clinical, selected);
    rows.quality_measures = (reg.indicators || []).map(indicator => ({
      schema_version: version, indicator: indicator.id, name: indicator.name, type: indicator.kind || 'proportion',
      form: indicator.et, definition: JSON.stringify({ numerator: indicator.num, denominator: indicator.denom, measure: indicator.measure, reference: indicator.ref })
    }));
    return { format: 'addall-registry-package/1', registry: reg.name, exported_at: nowISO(), schema_version: version,
      identified: clinical, filters: { from: options.from || null, to: options.to || null, center: options.center || null, drafts: !!options.drafts, stablePid: !!options.stablePid, fields: options.fields || null }, tables: rows };
  },

  downloadBundle(bundle, format, fileName) {
    if (format === 'json') return download(fileName + '.json', JSON.stringify(bundle, null, 2), 'application/json');
    if (format === 'xlsx') {
      const sheets = Object.entries(this.tables).map(([name, columns]) => ({ name,
        rows: [columns, ...bundle.tables[name].map(row => columns.map(key => row[key] ?? ''))] }));
      sheets.unshift({ name: 'manifest', rows: [['parameter', 'value'], ...Object.entries(bundle).filter(([key]) => key !== 'tables')
        .map(([key, value]) => [key, typeof value === 'object' ? JSON.stringify(value) : value])] });
      if (sheets.some(sheet => sheet.rows.length > 1048576)) throw new Error('Лист слишком большой для Excel. Выберите ZIP с CSV или ограничьте период');
      return Office.book(fileName + '.xlsx', sheets);
    }
    const files = Object.entries(this.tables).map(([name, columns]) => ({ name: name + '.csv',
      data: toCSV(bundle.tables[name], columns.map(key => ({ key, label: key }))) }));
    const { tables, ...manifest } = bundle;
    files.push({ name: 'manifest.json', data: JSON.stringify(manifest, null, 2) },
      { name: 'README.txt', data: 'UTF-8 CSV, разделитель ;. participant_id связывает пациентов и события, episode_id связывает события с эпизодами. values.csv хранит по строке на значение; group и item задают вложенные записи. day и даты в режиме без идентификаторов отсчитываются от начала наблюдения пациента. Словарь и причины пропусков включены. CSV можно импортировать в R, Python, SPSS или Stata, задав UTF-8 и разделитель ;.' });
    return download(fileName + '.zip', Office.zip(files), 'application/zip');
  }
};

Routes['registry-export'] = async (main, regId = '') => {
  if (!can('export')) {
    main.innerHTML = '<div class="head"><h1>Выгрузка регистра</h1></div><p>Доступ к выгрузке ограничен вашей ролью.</p>';
    return;
  }
  const regs = await Data.registries();
  const initial = regs.find(reg => reg.id === regId) || regs[0];
  if (!initial) { main.innerHTML = '<div class="head"><h1>Выгрузка регистра</h1></div><p>Нет доступных регистров.</p>'; return; }
  main.innerHTML = `<div class="head"><h1>Выгрузка регистра</h1><a href="#io" class="btn">Импорт и плоские таблицы</a></div>
    <section class="card"><p>В комплект входят пациенты, эпизоды, все повторные формы, вложенные значения, причины пропусков, анкеты и словарь с версиями.</p>
      <div class="grid">${regSelect(regs, initial.id, 'bxReg', false)}
      <div class="fld"><label for="bxFrom">С даты события</label><input type="date" class="inp" id="bxFrom"></div>
      <div class="fld"><label for="bxTo">По дату события включительно</label><input type="date" class="inp" id="bxTo"></div>
      <div class="fld"><label for="bxCenter">Учреждение</label><select class="inp" id="bxCenter"><option value="">Все доступные</option>
      ${centers().map(center => `<option value="${esc(center)}">${esc(center)}</option>`).join('')}</select></div>
      <div class="fld"><label for="bxPrivacy">Состав</label><select class="inp" id="bxPrivacy"><option value="coded">Без прямых идентификаторов</option>
      ${can('users') ? '<option value="clinical">С идентификаторами пациентов</option>' : ''}</select></div>
      <label class="chk"><input type="checkbox" id="bxDrafts">Включить черновики</label>
      <label class="chk" title="Постоянный ID пациента AddAll одинаков во всех выгрузках: данные разных выгрузок можно связать. Без отметки коды пациентов новые в каждом файле: так безопаснее для передачи наружу"><input type="checkbox" id="bxPid">Код пациента: постоянный ID AddAll (для связи выгрузок)</label></div>
      <div class="row"><button class="btn" id="bxChooseFields">Выбрать поля</button><span id="bxFieldNote" class="muted">Все разрешённые поля</span></div>
      <p class="muted">В режиме без идентификаторов исключаются номера карт, ФИО, контакты, свободный текст и поля, помеченные как чувствительные. Даты заменяются днями от начала наблюдения.</p>
      <div class="row"><button class="btn primary" data-bx="xlsx">Excel</button><button class="btn" data-bx="csv">ZIP с CSV</button><button class="btn" data-bx="json">JSON</button></div>
      <p id="bxSummary" role="status"></p></section>`;
  let chosenFields = null;
  const readField = id => $('#' + id, main);
  const reset = () => { chosenFields = null; readField('bxFieldNote').textContent = 'Все разрешённые поля'; };
  readField('bxReg').onchange = reset;
  readField('bxPrivacy').onchange = reset;
  readField('bxChooseFields').onclick = async () => {
    const reg = regs.find(item => item.id === readField('bxReg').value);
    const identified = can('users') && readField('bxPrivacy').value === 'clinical';
    const versions = [...new Set([reg.version || 1, ...(reg.schemaHistory || []).map(item => item.version)])];
    const group = value => value ? value.split('.') : [];
    const dict = RegistryExport.dictionary(reg, versions, identified);
    const items = new Map(dict.filter(field => field.type !== 'group').map(field => [
      RegistryExport.fieldKey(field.form, group(field.group), field.field), field
    ]));
    const selection = new Set(chosenFields || items.keys());
    const box = modal(`<h3>Поля выгрузки</h3><p>Коды связи и основные сведения события добавляются автоматически.</p>
      <label for="bxFieldSearch">Поиск поля</label><input class="inp" id="bxFieldSearch">
      <div class="rchk" id="bxFieldRows"></div><div class="row"><button class="btn" id="bxFieldsAll">Все разрешённые</button>
      <button class="btn primary" id="bxFieldsSave">Применить выбор</button></div>`, { wide: true });
    const draw = () => {
      const search = $('#bxFieldSearch', box).value.trim().toLowerCase();
      $('#bxFieldRows', box).innerHTML = [...items].filter(([key, field]) => (key + ' ' + field.label).toLowerCase().includes(search))
        .map(([key, field]) => `<label class="chk"><input type="checkbox" data-bx-field value="${esc(key)}" ${selection.has(key) ? 'checked' : ''}>
          ${esc(field.label)} <span class="muted small">${esc(key)}</span></label>`).join('');
    };
    $('#bxFieldSearch', box).oninput = draw;
    $('#bxFieldRows', box).onchange = event => {
      if (!event.target.matches('[data-bx-field]')) return;
      if (event.target.checked) selection.add(event.target.value);
      else selection.delete(event.target.value);
    };
    $('#bxFieldsAll', box).onclick = () => { reset(); box.close(); };
    $('#bxFieldsSave', box).onclick = () => {
      chosenFields = [...selection];
      readField('bxFieldNote').textContent = 'Выбрано полей: ' + chosenFields.length;
      box.close();
    };
    draw();
  };
  $$('[data-bx]', main).forEach(button => button.onclick = async () => {
    const from = $('#bxFrom', main).value, to = $('#bxTo', main).value;
    if (from && to && from > to) return toast('Дата начала позже даты окончания', 'err');
    const identified = can('users') && $('#bxPrivacy', main).value === 'clinical';
    if (identified && !await confirmBox('В комплект войдут идентификаторы пациентов. Подтвердите выгрузку для внутренней работы.')) return;
    button.disabled = true;
    try {
      const [ds, proms] = await Promise.all([loadReg($('#bxReg', main).value), DB.all('proms')]);
      const bundle = RegistryExport.assemble(ds, proms, { from, to, center: $('#bxCenter', main).value, drafts: $('#bxDrafts', main).checked, stablePid: $('#bxPid', main).checked, identified, fields: chosenFields });
      await Audit.log('выгрузка комплекта ' + button.dataset.bx + (identified ? ' (с идентификаторами)' : ''), 'registries', ds.reg.id, null, null);
      RegistryExport.downloadBundle(bundle, button.dataset.bx, slug(ds.reg.name) + '_registry_' + today());
      $('#bxSummary', main).textContent = 'Пациентов ' + bundle.tables.participants.length + ', событий ' + bundle.tables.events.length + ', анкет ' + bundle.tables.questionnaires.length;
    } catch (error) { toast(error.message, 'err'); }
    finally { button.disabled = false; }
  });
};
ROUTE_GROUP['registry-export'] = 'Администрирование';
