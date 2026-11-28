/* AddAll 2.0: выгрузки для партнёров.
   OMOP CDM 5.4, CDISC SDTM, агрегированная выгрузка с порогом малых групп (первичное и вторичное скрытие),
   манифест биообразцов и шаблоны выгрузки под получателя.
   Источник один: комплект RegistryExport.assemble, те же фильтры, обезличивание и выбор полей.
   Подключается после exports.js. */
'use strict';

const ExportPlus = {
  BASE: '2000-01-01',
  csv(rows, cols) {
    const q = v => { if (v == null) return ''; const s = String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    return [cols.join(','), ...rows.map(r => cols.map(c => q(r[c])).join(','))].join('\r\n') + '\r\n';
  },
  addDays(iso, n) { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + Number(n)); return d.toISOString().slice(0, 10); },
  /* дата события: настоящая при выгрузке с идентификаторами, иначе сдвинутая (2000-01-01 + день от начала наблюдения) */
  dater(bundle) {
    return (date, day) => bundle.identified ? (date ? String(date).slice(0, 10) : '') : day == null || day === '' ? '' : this.addDays(this.BASE, day);
  },
  dict(bundle) {
    const map = new Map();
    for (const d of bundle.tables.dictionary || []) {
      const key = d.form + '|' + (d.group || '') + '|' + d.field;
      if (!map.has(key) || (d.schema_version || 0) >= (map.get(key).schema_version || 0)) map.set(key, d);
    }
    return (form, group, field) => map.get(form + '|' + (group || '') + '|' + field) || {};
  },
  formName(bundle, id) { return (bundle.formNames || []).find(f => f.id === id)?.name || id; },
  value(v) { return v.value_number ?? v.value_text ?? v.value_json ?? ''; },
  isProcedureForm: name => /операц|вмешательств|резекц|эндоскоп|колоноскоп|биопси|surgery|operation|procedure/i.test(name),
  isComplication: (label, key) => /осложн|complication|clavien|несостоятельн/i.test(label + ' ' + key),
  negative: v => /^(нет|нет осложнений|не было|отсутствует|0|none|no)$/i.test(String(v).trim()),

  /* ---------- OMOP CDM 5.4 ---------- */
  omop(bundle) {
    const T = bundle.tables, date = this.dater(bundle), dict = this.dict(bundle);
    const personId = new Map(T.participants.map((p, i) => [p.participant_id, i + 1]));
    const ev = new Map(T.events.map(e => [e.event_id, e]));
    const evDate = e => e ? date(e.date, e.day) : '';
    const person = T.participants.map(p => {
      let year = '';
      if (bundle.identified && p.birth_date) year = String(p.birth_date).slice(0, 4);
      else if (p.age_years !== '' && p.age_years != null) {
        const first = T.events.filter(e => e.participant_id === p.participant_id).map(e => evDate(e)).filter(Boolean).sort()[0] || this.BASE;
        year = String(Number(first.slice(0, 4)) - Number(p.age_years));
      }
      return { person_id: personId.get(p.participant_id), gender_concept_id: p.sex === 'М' ? 8507 : p.sex === 'Ж' ? 8532 : 0, year_of_birth: year,
        race_concept_id: 0, ethnicity_concept_id: 0, person_source_value: p.participant_id, gender_source_value: p.sex || '' };
    });
    const visits = [], periods = new Map();
    T.events.forEach((e, i) => {
      const d = evDate(e); if (!d) return;
      const pid = personId.get(e.participant_id); if (!pid) return;
      e._visit = i + 1;
      visits.push({ visit_occurrence_id: i + 1, person_id: pid, visit_concept_id: 0, visit_start_date: d, visit_end_date: d, visit_type_concept_id: 32879, visit_source_value: this.formName(bundle, e.form) });
      const p = periods.get(pid) || { lo: d, hi: d }; if (d < p.lo) p.lo = d; if (d > p.hi) p.hi = d; periods.set(pid, p);
    });
    const observation_period = [...periods].map(([pid, p], i) => ({ observation_period_id: i + 1, person_id: pid, observation_period_start_date: p.lo, observation_period_end_date: p.hi, period_type_concept_id: 32879 }));
    const cond = [], proc = [], meas = [], obs = [];
    for (const e of T.events) {
      if (e._visit && this.isProcedureForm(this.formName(bundle, e.form))) proc.push({ procedure_occurrence_id: proc.length + 1, person_id: personId.get(e.participant_id), procedure_concept_id: 0, procedure_date: evDate(e), procedure_type_concept_id: 32879, visit_occurrence_id: e._visit, procedure_source_value: this.formName(bundle, e.form) });
    }
    for (const v of T.values) {
      if (v.missing_reason || v.value_number == null && v.value_text == null && v.value_json == null) continue;
      const pid = personId.get(v.participant_id); if (!pid) continue;
      const e = v.record_table === 'events' ? ev.get(v.record_id) : null;
      const d = e ? evDate(e) : observation_period.find(x => x.person_id === pid)?.observation_period_start_date || '';
      if (!d) continue;
      const def = dict(v.form, v.group, v.field), src = [v.form, v.group, v.field].filter(Boolean).join('/');
      const label = def.label || v.field, type = def.type || v.type;
      if (type === 'relative_day' || type === 'date' || type === 'datetime') continue;
      if (type === 'icd10') { cond.push({ condition_occurrence_id: cond.length + 1, person_id: pid, condition_concept_id: 0, condition_start_date: d, condition_type_concept_id: 32879, visit_occurrence_id: e?._visit || '', condition_source_value: String(v.value_text || '').slice(0, 50), condition_source_concept_id: 0 }); continue; }
      if (/операци|вмешательств/i.test(label) && type === 'select') { proc.push({ procedure_occurrence_id: proc.length + 1, person_id: pid, procedure_concept_id: 0, procedure_date: d, procedure_type_concept_id: 32879, visit_occurrence_id: e?._visit || '', procedure_source_value: String(v.value_text).slice(0, 50) }); continue; }
      if (typeof v.value_number === 'number') { meas.push({ measurement_id: meas.length + 1, person_id: pid, measurement_concept_id: 0, measurement_date: d, measurement_type_concept_id: 32879, value_as_number: v.value_number, unit_concept_id: 0, visit_occurrence_id: e?._visit || '', measurement_source_value: src.slice(0, 50), unit_source_value: def.unit || '' }); continue; }
      obs.push({ observation_id: obs.length + 1, person_id: pid, observation_concept_id: 0, observation_date: d, observation_type_concept_id: 32879, value_as_string: String(v.value_text ?? v.value_json ?? '').slice(0, 60), visit_occurrence_id: e?._visit || '', observation_source_value: src.slice(0, 50), value_source_value: v.value_code || '' });
    }
    const death = T.participants.filter(p => p.death_date || p.death_day !== '' && p.death_day != null)
      .map(p => ({ person_id: personId.get(p.participant_id), death_date: bundle.identified ? p.death_date : this.addDays(this.BASE, p.death_day), death_type_concept_id: 32879 }))
      .filter(x => x.death_date);
    /* заготовка сопоставления с OMOP Vocabularies (подходит для Usagi) */
    const seen = new Map();
    const note = (src, label, domain, n = 1) => { const k = domain + '|' + src; const r = seen.get(k) || { source_code: src, source_code_description: label, domain, frequency: 0, target_concept_id: '' }; r.frequency += n; seen.set(k, r); };
    cond.forEach(c => note(c.condition_source_value, c.condition_source_value, 'Condition'));
    proc.forEach(c => note(c.procedure_source_value, c.procedure_source_value, 'Procedure'));
    meas.forEach(c => note(c.measurement_source_value, c.unit_source_value ? 'unit: ' + c.unit_source_value : '', 'Measurement'));
    obs.forEach(c => note(c.observation_source_value, '', 'Observation'));
    return {
      person, observation_period, visit_occurrence: visits, condition_occurrence: cond, procedure_occurrence: proc, measurement: meas, observation: obs, death,
      source_to_concept_map: [...seen.values()].sort((a, b) => b.frequency - a.frequency)
    };
  },
  OMOP_COLS: {
    person: ['person_id', 'gender_concept_id', 'year_of_birth', 'race_concept_id', 'ethnicity_concept_id', 'person_source_value', 'gender_source_value'],
    observation_period: ['observation_period_id', 'person_id', 'observation_period_start_date', 'observation_period_end_date', 'period_type_concept_id'],
    visit_occurrence: ['visit_occurrence_id', 'person_id', 'visit_concept_id', 'visit_start_date', 'visit_end_date', 'visit_type_concept_id', 'visit_source_value'],
    condition_occurrence: ['condition_occurrence_id', 'person_id', 'condition_concept_id', 'condition_start_date', 'condition_type_concept_id', 'visit_occurrence_id', 'condition_source_value', 'condition_source_concept_id'],
    procedure_occurrence: ['procedure_occurrence_id', 'person_id', 'procedure_concept_id', 'procedure_date', 'procedure_type_concept_id', 'visit_occurrence_id', 'procedure_source_value'],
    measurement: ['measurement_id', 'person_id', 'measurement_concept_id', 'measurement_date', 'measurement_type_concept_id', 'value_as_number', 'unit_concept_id', 'visit_occurrence_id', 'measurement_source_value', 'unit_source_value'],
    observation: ['observation_id', 'person_id', 'observation_concept_id', 'observation_date', 'observation_type_concept_id', 'value_as_string', 'visit_occurrence_id', 'observation_source_value', 'value_source_value'],
    death: ['person_id', 'death_date', 'death_type_concept_id'],
    source_to_concept_map: ['source_code', 'source_code_description', 'domain', 'frequency', 'target_concept_id']
  },
  omopReadme(bundle, o) {
    return `Выгрузка AddAll в формате OMOP CDM 5.4: ${bundle.registry}
Сформирована: ${bundle.exported_at}
${bundle.identified ? 'Даты настоящие.' : 'Без прямых идентификаторов. Даты сдвинуты: 2000-01-01 соответствует первому дню наблюдения пациента, интервалы между событиями сохранены. Год рождения вычислен от возраста (возраст старше 90 лет записан как 90).'}

Таблицы (CSV, UTF-8, разделитель запятая): ${Object.keys(o).map(k => k + ' ' + o[k].length).join(', ')}.

Что нужно сделать получателю:
1. Сопоставить исходные значения со стандартными концептами OMOP (Athena, словари ICD10, SNOMED, LOINC). Все *_concept_id здесь равны 0, исходные значения в *_source_value.
   Список всех исходных значений с частотой: source_to_concept_map.csv (подходит для Usagi).
2. Тип записи *_type_concept_id = 32879 (Registry).
3. Пол: 8507 мужской, 8532 женский.
4. Формы с операциями и вмешательствами попали в procedure_occurrence, коды МКБ-10 в condition_occurrence, числа в measurement, остальное в observation.
`;
  },

  /* ---------- CDISC SDTM ---------- */
  sdtm(bundle) {
    const T = bundle.tables, date = this.dater(bundle), dict = this.dict(bundle);
    const STUDYID = (bundle.registry || 'ADDALL').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 12) || 'ADDALL';
    const usubj = id => STUDYID + '-' + id;
    const ev = new Map(T.events.map(e => [e.event_id, e]));
    const first = new Map();
    for (const e of T.events) { const d = date(e.date, e.day); if (d && (!first.has(e.participant_id) || d < first.get(e.participant_id))) first.set(e.participant_id, d); }
    const dy = (pid, d) => { const f = first.get(pid); if (!f || !d) return ''; const n = Math.round((new Date(d) - new Date(f)) / 864e5); return n >= 0 ? n + 1 : n; };
    const DM = T.participants.map(p => ({ STUDYID, DOMAIN: 'DM', USUBJID: usubj(p.participant_id), SUBJID: p.participant_id, RFSTDTC: first.get(p.participant_id) || '',
      SITEID: bundle.identified ? p.center || '' : '', AGE: p.age_years ?? '', AGEU: p.age_years !== '' && p.age_years != null ? 'YEARS' : '',
      SEX: p.sex === 'М' ? 'M' : p.sex === 'Ж' ? 'F' : 'U', DTHFL: p.death_date || p.death_day !== '' && p.death_day != null ? 'Y' : '',
      DTHDTC: bundle.identified ? p.death_date || '' : p.death_day !== '' && p.death_day != null ? this.addDays(this.BASE, p.death_day) : '' }));
    const visitNum = new Map();
    const SV = T.events.map(e => {
      const n = (visitNum.get(e.participant_id) || 0) + 1; visitNum.set(e.participant_id, n); e._vn = n;
      const d = date(e.date, e.day);
      return { STUDYID, DOMAIN: 'SV', USUBJID: usubj(e.participant_id), VISITNUM: n, VISIT: this.formName(bundle, e.form).slice(0, 40), SVSTDTC: d, SVSTDY: dy(e.participant_id, d) };
    });
    const seq = {}; const next = (dom, pid) => { const k = dom + pid; seq[k] = (seq[k] || 0) + 1; return seq[k]; };
    const PR = [], AE = [], MH = [], XF = [];
    for (const e of T.events) {
      if (!this.isProcedureForm(this.formName(bundle, e.form))) continue;
      const d = date(e.date, e.day);
      PR.push({ STUDYID, DOMAIN: 'PR', USUBJID: usubj(e.participant_id), PRSEQ: next('PR', e.participant_id), PRTRT: this.formName(bundle, e.form).slice(0, 200), PRSTDTC: d, PRSTDY: dy(e.participant_id, d), VISITNUM: e._vn });
    }
    const codes = new Map(), used = new Set();
    const testcd = (key, label) => {
      if (codes.has(key)) return codes.get(key);
      let base = String(key.split('/').pop()).replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8) || 'TEST';
      if (/^[0-9]/.test(base)) base = ('X' + base).slice(0, 8);
      let c = base, i = 1; while (used.has(c)) { const s = String(i++); c = base.slice(0, 8 - s.length) + s; }
      used.add(c); codes.set(key, { code: c, label: String(label).slice(0, 40) }); return codes.get(key);
    };
    for (const v of T.values) {
      if (v.missing_reason) continue;
      const val = this.value(v); if (val === '' || val == null) continue;
      const e = v.record_table === 'events' ? ev.get(v.record_id) : null;
      const d = e ? date(e.date, e.day) : first.get(v.participant_id) || '';
      const def = dict(v.form, v.group, v.field), label = def.label || v.field, type = def.type || v.type;
      if (['relative_day', 'date', 'datetime'].includes(type)) continue;
      const base = { STUDYID, USUBJID: usubj(v.participant_id) };
      if (type === 'icd10') { MH.push({ ...base, DOMAIN: 'MH', MHSEQ: next('MH', v.participant_id), MHTERM: String(val), MHCAT: this.formName(bundle, v.form).slice(0, 40), MHSTDTC: d, MHSTDY: dy(v.participant_id, d) }); continue; }
      if (this.isComplication(label, v.field)) {
        if (this.negative(val)) continue;
        const term = type === 'yesno' ? (val === 'да' ? label : '') : String(val);
        if (term) AE.push({ ...base, DOMAIN: 'AE', AESEQ: next('AE', v.participant_id), AETERM: term.slice(0, 200), AECAT: label.slice(0, 40), AESTDTC: d, AESTDY: dy(v.participant_id, d), VISITNUM: e?._vn || '' });
        continue;
      }
      const t = testcd([v.form, v.group, v.field].filter(Boolean).join('/'), label);
      XF.push({ ...base, DOMAIN: 'XF', XFSEQ: next('XF', v.participant_id), XFTESTCD: t.code, XFTEST: t.label, XFCAT: this.formName(bundle, v.form).slice(0, 40),
        XFORRES: String(val).slice(0, 200), XFORRESU: def.unit || '', XFSTRESC: String(val).slice(0, 200), XFSTRESN: typeof v.value_number === 'number' ? v.value_number : '',
        XFDTC: d, XFDY: dy(v.participant_id, d), VISITNUM: e?._vn || '' });
    }
    const domains = { DM, SV, MH, PR, AE, XF };
    const LBL = { STUDYID: 'Study Identifier', DOMAIN: 'Domain Abbreviation', USUBJID: 'Unique Subject Identifier', SUBJID: 'Subject Identifier for the Study', RFSTDTC: 'Subject Reference Start Date/Time',
      SITEID: 'Study Site Identifier', AGE: 'Age', AGEU: 'Age Units', SEX: 'Sex', DTHFL: 'Subject Death Flag', DTHDTC: 'Date/Time of Death', VISITNUM: 'Visit Number', VISIT: 'Visit Name',
      SVSTDTC: 'Start Date/Time of Visit', SVSTDY: 'Study Day of Start of Visit', MHSEQ: 'Sequence Number', MHTERM: 'Reported Term for the Medical History', MHCAT: 'Category for Medical History',
      MHSTDTC: 'Start Date/Time of Medical History Event', MHSTDY: 'Study Day of Start of Event', PRSEQ: 'Sequence Number', PRTRT: 'Reported Name of Procedure', PRSTDTC: 'Start Date/Time of Procedure',
      PRSTDY: 'Study Day of Start of Procedure', AESEQ: 'Sequence Number', AETERM: 'Reported Term for the Adverse Event', AECAT: 'Category for Adverse Event', AESTDTC: 'Start Date/Time of Adverse Event',
      AESTDY: 'Study Day of Start of Adverse Event', XFSEQ: 'Sequence Number', XFTESTCD: 'Short Name of Finding', XFTEST: 'Name of Finding', XFCAT: 'Category (AddAll form)', XFORRES: 'Result in Original Units',
      XFORRESU: 'Original Units', XFSTRESC: 'Result in Standard Format', XFSTRESN: 'Numeric Result in Standard Units', XFDTC: 'Date/Time of Collection', XFDY: 'Study Day of Collection' };
    const COLS = {
      DM: ['STUDYID', 'DOMAIN', 'USUBJID', 'SUBJID', 'RFSTDTC', 'SITEID', 'AGE', 'AGEU', 'SEX', 'DTHFL', 'DTHDTC'],
      SV: ['STUDYID', 'DOMAIN', 'USUBJID', 'VISITNUM', 'VISIT', 'SVSTDTC', 'SVSTDY'],
      MH: ['STUDYID', 'DOMAIN', 'USUBJID', 'MHSEQ', 'MHTERM', 'MHCAT', 'MHSTDTC', 'MHSTDY'],
      PR: ['STUDYID', 'DOMAIN', 'USUBJID', 'PRSEQ', 'PRTRT', 'PRSTDTC', 'PRSTDY', 'VISITNUM'],
      AE: ['STUDYID', 'DOMAIN', 'USUBJID', 'AESEQ', 'AETERM', 'AECAT', 'AESTDTC', 'AESTDY', 'VISITNUM'],
      XF: ['STUDYID', 'DOMAIN', 'USUBJID', 'XFSEQ', 'XFTESTCD', 'XFTEST', 'XFCAT', 'XFORRES', 'XFORRESU', 'XFSTRESC', 'XFSTRESN', 'XFDTC', 'XFDY', 'VISITNUM']
    };
    const NUM = new Set(['AGE', 'VISITNUM', 'SVSTDY', 'MHSEQ', 'MHSTDY', 'PRSEQ', 'PRSTDY', 'AESEQ', 'AESTDY', 'XFSEQ', 'XFSTRESN', 'XFDY']);
    const variables = Object.entries(COLS).flatMap(([dom, cols]) => cols.map((c, i) => ({ domain: dom, order: i + 1, variable: c, label: LBL[c] || c, type: NUM.has(c) ? 'Num' : 'Char' })));
    const tests = [...codes].map(([key, t]) => ({ XFTESTCD: t.code, XFTEST: t.label, source: key }));
    return { STUDYID, domains, COLS, variables, tests };
  },
  sdtmReadme(bundle, s) {
    return `Выгрузка AddAll в структуре CDISC SDTM: ${bundle.registry}
Сформирована: ${bundle.exported_at}
STUDYID: ${s.STUDYID}
${bundle.identified ? 'Даты настоящие.' : 'Без прямых идентификаторов. Даты сдвинуты: 2000-01-01 соответствует первому дню наблюдения пациента. --DY считается от первой формы пациента (RFSTDTC = день 1).'}

Домены: ${Object.entries(s.domains).map(([k, v]) => k + ' ' + v.length).join(', ')}.
DM: демография. SV: визиты (каждая форма AddAll). MH: диагнозы МКБ-10. PR: формы с операциями и вмешательствами.
AE: поля об осложнениях со значением, отличным от «нет». XF: остальные показатели (собственный домен, имена тестов в sdtm_tests.csv).
Описание переменных: sdtm_variables.csv.

Для подачи в FDA или PMDA данные переводят в формат SAS XPORT v5, например в R:
  library(haven); for (d in c('dm','sv','mh','pr','ae','xf')) write_xpt(read.csv(paste0(d, '.csv'), stringsAsFactors = FALSE), paste0(d, '.xpt'), version = 5, name = toupper(d))
Перед подачей проверьте набор валидатором (Pinnacle 21 Community) и при необходимости сопоставьте показатели XF со стандартными доменами (LB, VS, RS, TU, TR).
`;
  },

  /* ---------- агрегированная выгрузка с порогом ---------- */
  /* m: матрица счётчиков; возвращает матрицу признаков скрытия. Первичное: 0 < x < k. Вторичное: в строке или столбце
     не должно остаться ровно одной скрытой ячейки, иначе её вычисляют из итога; скрываем следующую наименьшую. Итоги меньше k тоже скрыты. */
  suppress(m, k) {
    const R = m.length, C = m[0]?.length || 0;
    const hide = m.map(r => r.map(x => x > 0 && x < k));
    const fix = (cells) => {
      const hidden = cells.filter(c => hide[c[0]][c[1]]);
      if (hidden.length !== 1) return false;
      const cand = cells.filter(c => !hide[c[0]][c[1]] && m[c[0]][c[1]] > 0).sort((a, b) => m[a[0]][a[1]] - m[b[0]][b[1]]);
      if (!cand.length) return false;
      hide[cand[0][0]][cand[0][1]] = true; return true;
    };
    for (let guard = 0; guard < 50; guard++) {
      let changed = false;
      for (let i = 0; i < R; i++) changed = fix(m[i].map((_, j) => [i, j])) || changed;
      for (let j = 0; j < C; j++) changed = fix(m.map((_, i) => [i, j])) || changed;
      if (!changed) break;
    }
    return hide;
  },
  aggregate(bundle, k = 5) {
    const T = bundle.tables, dict = this.dict(bundle);
    const ev = new Map(T.events.map(e => [e.event_id, e]));
    const year = e => e?.date ? String(e.date).slice(0, 4) : '';
    const firstYear = new Map();
    for (const e of [...T.events].sort((a, b) => String(a.date).localeCompare(String(b.date)))) if (year(e) && !firstYear.has(e.participant_id)) firstYear.set(e.participant_id, year(e));
    const years = [...new Set(T.events.map(year).filter(Boolean))].sort();
    const out = [];
    const cell = (x, h) => h ? '<' + k : x;
    const table = (title, unit, rowNames, m) => {
      const rt = m.map(r => r.reduce((s, x) => s + x, 0)), ct = years.map((_, j) => m.reduce((s, r) => s + r[j], 0));
      const hide = this.suppress(m, k), all = rt.reduce((s, x) => s + x, 0);
      out.push([title + ' (' + unit + ')'], ['', ...years, 'Всего']);
      rowNames.forEach((n, i) => out.push([n, ...m[i].map((x, j) => cell(x, hide[i][j])), cell(rt[i], rt[i] > 0 && rt[i] < k)]));
      out.push(['Всего', ...ct.map(x => cell(x, x > 0 && x < k)), cell(all, all > 0 && all < k)], []);
    };
    /* пациенты: новые по году начала наблюдения и полу */
    const sexes = ['М', 'Ж'];
    table('Новые пациенты по полу', 'пациентов', ['мужчины', 'женщины'], sexes.map(s => years.map(y => T.participants.filter(p => p.sex === s && firstYear.get(p.participant_id) === y).length)));
    /* категориальные поля: число записей по году записи */
    const groups = new Map();
    for (const v of T.values) {
      const def = dict(v.form, v.group, v.field), type = def.type || v.type;
      if (def.sensitive || !['select', 'yesno', 'multiselect'].includes(type) || v.missing_reason) continue;
      const key = v.form + '|' + (v.group || '') + '|' + v.field;
      const e = v.record_table === 'events' ? ev.get(v.record_id) : null;
      const y = e ? year(e) : firstYear.get(v.participant_id);
      if (!y || v.value_text == null) continue;
      if (!groups.has(key)) groups.set(key, { def, form: v.form, counts: new Map(), nums: null });
      const g = groups.get(key), val = String(v.value_text);
      if (!g.counts.has(val)) g.counts.set(val, new Map());
      const seen = g.counts.get(val); seen.set(y, (seen.get(y) || 0) + 1);
    }
    for (const g of groups.values()) {
      const opts = g.def.type === 'yesno' ? ['да', 'нет', 'неизвестно'] : (() => { try { return JSON.parse(g.def.options || '[]'); } catch { return []; } })();
      const names = [...g.counts.keys()].sort((a, b) => (opts.indexOf(a) + 1 || 999) - (opts.indexOf(b) + 1 || 999));
      table(this.formName(bundle, g.form) + ': ' + (g.def.label || g.def.field), 'записей', names, names.map(n => years.map(y => g.counts.get(n).get(y) || 0)));
    }
    /* числа: n и медиана (IQR) по годам, только если n не меньше порога; минимум и максимум не выводятся */
    const numeric = new Map();
    for (const v of T.values) {
      if (typeof v.value_number !== 'number' || v.missing_reason) continue;
      const def = dict(v.form, v.group, v.field); if (def.sensitive || def.type === 'relative_day') continue;
      const e = v.record_table === 'events' ? ev.get(v.record_id) : null;
      const y = e ? year(e) : firstYear.get(v.participant_id); if (!y) continue;
      const key = v.form + '|' + (v.group || '') + '|' + v.field;
      if (!numeric.has(key)) numeric.set(key, { def, form: v.form, by: new Map() });
      const g = numeric.get(key); if (!g.by.has(y)) g.by.set(y, []); g.by.get(y).push(v.value_number);
    }
    if (numeric.size) out.push(['Числовые показатели: n; медиана (Q1-Q3). При n меньше порога значения скрыты'], ['Показатель', ...years]);
    const f = x => String(Math.round(x * 10) / 10).replace('.', ',');
    for (const g of numeric.values()) {
      out.push([this.formName(bundle, g.form) + ': ' + (g.def.label || g.def.field) + (g.def.unit ? ', ' + g.def.unit : ''), ...years.map(y => {
        const a = g.by.get(y) || []; if (!a.length) return '';
        if (a.length < k) return '<' + k;
        return `${a.length}; ${f(Stats.q(a, 0.5))} (${f(Stats.q(a, 0.25))}-${f(Stats.q(a, 0.75))})`;
      })]);
    }
    return out;
  },
  aggregateReadme(bundle, k) {
    return [['Агрегированная выгрузка AddAll'], ['Регистр', bundle.registry], ['Сформирована', bundle.exported_at], ['Порог малых групп', k],
      ['Период', (bundle.filters.from || '...') + ' - ' + (bundle.filters.to || '...')], ['Учреждение', bundle.filters.center || 'все доступные'], [],
      ['Файл не содержит сведений об отдельных пациентах: только счёт по группам и медианы.'],
      ['Ячейки меньше порога показаны как «<' + k + '». Дополнительно скрыты соседние ячейки, чтобы скрытое значение нельзя было вычислить из итогов строки или столбца.'],
      ['Год берётся по дате записи; для пациентов по году начала наблюдения.'],
      ['Черновики ' + (bundle.filters.drafts ? 'включены.' : 'не включены.')]];
  },

  /* ---------- манифест биообразцов ---------- */
  MANIFEST_COLS: ['participant_id', 'sample_id', 'sample_type', 'source', 'collection_date', 'collection_day', 'volume', 'unit', 'storage_location', 'storage_temperature', 'consent', 'status', 'shipped_to'],
  manifest(bundle) {
    const T = bundle.tables, form = 'biosample';
    const map = { bs_id: 'sample_id', bs_type: 'sample_type', bs_source: 'source', bs_volume: 'volume', bs_unit: 'unit', bs_box: 'storage_location', bs_temp: 'storage_temperature', bs_consent: 'consent', bs_status: 'status', bs_to: 'shipped_to' };
    const rows = T.events.filter(e => e.form === form).map(e => {
      const r = { participant_id: e.participant_id, collection_date: bundle.identified ? e.date : '', collection_day: e.day ?? '' };
      for (const v of T.values.filter(x => x.record_table === 'events' && x.record_id === e.event_id)) if (map[v.field]) r[map[v.field]] = this.value(v);
      return r;
    });
    return { rows, noConsent: rows.filter(r => r.consent !== 'да').length };
  },

  /* ---------- шаблоны получателей ---------- */
  BUILTIN: [
    { id: 'journal', name: 'Журнал: данные к статье', format: 'xlsx', privacy: 'coded', drafts: false, stablePid: false, hint: 'Обезличенный комплект без черновиков. «Таблица 1» и схема отбора STROBE строятся в Аналитике.' },
    { id: 'stat', name: 'Статистик: SPSS', format: 'spss', privacy: 'coded', drafts: false, stablePid: false, hint: 'CSV по формам и синтаксис SPSS с метками.' },
    { id: 'omop', name: 'Научный центр: OMOP CDM', format: 'omop', privacy: 'coded', drafts: false, stablePid: true, hint: 'Сдвинутые даты, постоянный код пациента для повторных передач.' },
    { id: 'sdtm', name: 'Научный центр или спонсор: CDISC SDTM', format: 'sdtm', privacy: 'coded', drafts: false, stablePid: true, hint: 'Домены DM, SV, MH, PR, AE, XF и описание переменных.' },
    { id: 'lab', name: 'Лаборатория или биобанк: список образцов', format: 'manifest', privacy: 'coded', drafts: true, stablePid: true, hint: 'Постоянный код пациента, чтобы результаты лаборатории можно было вернуть в регистр.' },
    { id: 'moh', name: 'Минздрав: агрегированные данные, порог 5', format: 'aggregate', privacy: 'coded', drafts: false, stablePid: false, minCell: 5, hint: 'Только числа по группам, группы меньше 5 скрыты.' },
    { id: 'intl', name: 'Международный регистр: агрегированные данные, порог 10', format: 'aggregate', privacy: 'coded', drafts: false, stablePid: false, minCell: 10, hint: 'Только числа по группам, группы меньше 10 скрыты.' },
    { id: 'redcap', name: 'Партнёр на REDCap', format: 'redcap', privacy: 'coded', drafts: false, stablePid: false, hint: 'Словарь данных и файл импорта REDCap.' }
  ],
  async presets(regId) {
    const own = (await DB.all('saved')).filter(s => s.kind === 'exportPreset' && s.registryId === regId);
    return [...this.BUILTIN.map(p => ({ ...p, builtin: true })), ...own.map(s => ({ ...s.preset, id: s.id, name: s.name, own: true }))];
  }
};

/* форматы в общей кнопке выгрузки */
{
  const previous = RegistryExport.downloadBundle.bind(RegistryExport);
  RegistryExport.downloadBundle = function (bundle, format, fileName) {
    const X = ExportPlus;
    if (format === 'omop') {
      const o = X.omop(bundle);
      return download(fileName + '_omop.zip', Office.zip([...Object.entries(o).map(([name, rows]) => ({ name: name + '.csv', data: X.csv(rows, X.OMOP_COLS[name]) })),
        { name: 'README.txt', data: X.omopReadme(bundle, o) }]), 'application/zip');
    }
    if (format === 'sdtm') {
      const s = X.sdtm(bundle);
      return download(fileName + '_sdtm.zip', Office.zip([...Object.entries(s.domains).map(([d, rows]) => ({ name: d.toLowerCase() + '.csv', data: X.csv(rows, s.COLS[d]) })),
        { name: 'sdtm_variables.csv', data: X.csv(s.variables, ['domain', 'order', 'variable', 'label', 'type']) },
        { name: 'sdtm_tests.csv', data: X.csv(s.tests, ['XFTESTCD', 'XFTEST', 'source']) },
        { name: 'README.txt', data: X.sdtmReadme(bundle, s) }]), 'application/zip');
    }
    if (format === 'aggregate') {
      const k = bundle.minCell || 5;
      return Office.book(fileName + '_aggregate_k' + k + '.xlsx', [{ name: 'README', rows: X.aggregateReadme(bundle, k) }, { name: 'Агрегированные', rows: X.aggregate(bundle, k) }]);
    }
    if (format === 'manifest') {
      const m = X.manifest(bundle);
      if (!m.rows.length) throw new Error('В регистре нет формы «Биообразец» или образцов за выбранный период. Форма добавляется на странице «Биобанк»');
      if (m.noConsent) toast('Образцов без отметки о согласии: ' + m.noConsent + '. Проверьте перед отправкой', 'err');
      return Office.book(fileName + '_samples_manifest.xlsx', [{ name: 'Manifest', rows: [X.MANIFEST_COLS, ...m.rows.map(r => X.MANIFEST_COLS.map(c => r[c] ?? ''))] }]);
    }
    return previous(bundle, format, fileName);
  };
}

/* панель шаблонов на странице выгрузки регистра */
{
  const page = Routes['registry-export'];
  Routes['registry-export'] = async (main, ...rest) => {
    const hash = location.hash;
    await page(main, ...rest);
    if (location.hash !== hash || !$('#bxReg', main) || $('#bxPresets', main)) return;
    const card = $('#bxReg', main).closest('section');
    card.insertAdjacentHTML('beforebegin', `<section class="card" id="bxPresets"><h2>Шаблон под получателя</h2>
      <p class="muted">Шаблон сразу выставляет состав, формат и порог. Свои шаблоны сохраняются для регистра и доступны коллегам.</p>
      <div class="row"><div class="fld"><label for="bxPreset">Кому выгружаем</label><select class="inp" id="bxPreset"></select></div>
      <button class="btn primary" id="bxPresetGo">Выгрузить по шаблону</button><button class="btn" id="bxPresetSave">Сохранить текущие настройки как шаблон</button>
      <button class="btn" id="bxPresetDel" hidden>Удалить шаблон</button></div><p class="muted small" id="bxPresetHint"></p></section>`);
    let list = [];
    const fill = async () => {
      list = await ExportPlus.presets($('#bxReg', main).value);
      $('#bxPreset', main).innerHTML = '<option value="">Выберите получателя</option>' + list.map(p => `<option value="${esc(p.id)}">${esc(p.name)}${p.own ? ' (свой)' : ''}</option>`).join('');
      $('#bxPresetHint', main).textContent = ''; $('#bxPresetDel', main).hidden = true;
    };
    await fill();
    $('#bxReg', main).addEventListener('change', fill);
    const current = () => list.find(p => p.id === $('#bxPreset', main).value);
    $('#bxPreset', main).onchange = () => {
      const p = current(); $('#bxPresetDel', main).hidden = !p?.own;
      $$('[data-bx]', main).forEach(b => b.classList.toggle('primary', !!p && b.dataset.bx === p.format));
      if (!p) { $('#bxPresetHint', main).textContent = ''; return; }
      const priv = $('#bxPrivacy', main);
      if ([...priv.options].some(o => o.value === p.privacy)) priv.value = p.privacy; else priv.value = 'coded';
      $('#bxDrafts', main).checked = !!p.drafts; $('#bxPid', main).checked = !!p.stablePid;
      if (p.minCell) $('#bxMin', main).value = p.minCell;
      if (main.bxSetFields) main.bxSetFields(p.fields || null);
      $('#bxPresetHint', main).textContent = (p.hint || '') + ' Формат: ' + ($(`[data-bx="${p.format}"]`, main)?.textContent.trim() || p.format) + '.';
    };
    $('#bxPresetGo', main).onclick = () => {
      const p = current(); if (!p) return toast('Выберите получателя', 'err');
      $(`[data-bx="${p.format}"]`, main)?.click();
    };
    $('#bxPresetSave', main).onclick = async () => {
      const format = await pickOne('Формат для шаблона', $$('[data-bx]', main).map(b => ({ v: b.dataset.bx, t: b.textContent.trim() })), current()?.format);
      if (!format) return;
      const name = await promptBox('Название шаблона (например, «НИИ онкологии, ежеквартально»)', ''); if (!name) return;
      const preset = { format, privacy: $('#bxPrivacy', main).value, drafts: $('#bxDrafts', main).checked, stablePid: $('#bxPid', main).checked,
        minCell: Number($('#bxMin', main).value) || 5, fields: main.bxFields || null, hint: 'Свой шаблон.' };
      await DB.put('saved', { registryId: $('#bxReg', main).value, kind: 'exportPreset', name, preset });
      toast('Шаблон сохранён'); await fill();
    };
    $('#bxPresetDel', main).onclick = async () => {
      const p = current(); if (!p?.own || !await confirmBox('Удалить шаблон «' + p.name + '»?')) return;
      await DB.del('saved', p.id); toast('Шаблон удалён'); await fill();
    };
  };
}

/* выбор одного варианта в окне */
function pickOne(title, options, value) {
  return new Promise(resolve => {
    let done = false;
    const finish = v => { if (done) return; done = true; resolve(v); };
    const box = modal(`<h3>${esc(title)}</h3><div class="rchk">${options.map(o => `<label class="chk"><input type="radio" name="pk1" value="${esc(o.v)}" ${o.v === value ? 'checked' : ''}>${esc(o.t)}</label>`).join('')}</div>
      <div class="row end"><button class="btn" data-pk="0">Отмена</button><button class="btn primary" data-pk="1">Выбрать</button></div>`, { onClose: () => finish(null) });
    $('[data-pk="0"]', box).onclick = () => box.close();
    $('[data-pk="1"]', box).onclick = () => { const v = $('input:checked', box)?.value || null; finish(v); box.close(); };
  });
}
