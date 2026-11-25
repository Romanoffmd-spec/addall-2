/* AddAll 2.0: выгрузка регистра в форматы статистических программ и других регистров.
   Источник один: комплект RegistryExport.assemble (те же фильтры, обезличивание и выбор полей).
   SPSS, Stata, R, SAS: по таблице CSV на каждую форму (одна строка = одно событие) и файл с метками переменных и значений.
   REDCap: словарь данных (Data Dictionary) и файл импорта с повторяющимися формами.
   CDISC ODM 1.3.2: структура и данные (ClinicalData) в одном XML.
   Вложенные группы в плоские таблицы не попадают: они есть в values.csv обычного комплекта. Подключается после registry-export.js. */
'use strict';

const ExportFormats = {
  /* имя переменной для статистических программ: латиница, цифры, подчёркивание, до 32 знаков, без повторов */
  namer() {
    const used = new Set();
    return raw => {
      let n = String(raw || 'v').replace(/[^A-Za-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '') || 'v';
      if (!/^[A-Za-z]/.test(n)) n = 'v_' + n;
      n = n.slice(0, 32); let k = n, i = 2;
      while (used.has(k.toLowerCase())) { const s = '_' + i++; k = n.slice(0, 32 - s.length) + s; }
      used.add(k.toLowerCase()); return k;
    };
  },
  opts(d) { try { return d.options ? JSON.parse(d.options) : []; } catch (e) { return []; } },
  coded: d => ['select', 'yesno'].includes(d.type),
  choices(d) { return d.type === 'yesno' ? ['да', 'нет', 'неизвестно'] : ExportFormats.opts(d); },

  /* плоские таблицы: участники и по таблице на форму, только поля верхнего уровня */
  flat(bundle) {
    const t = bundle.tables, dict = t.dictionary.filter(d => !d.group && d.type !== 'group');
    const val = v => v.value_number !== undefined && v.value_number !== '' ? v.value_number : v.value_text !== undefined ? v.value_text : v.value_json ?? '';
    const byRecord = new Map();
    for (const v of t.values) {
      if (v.group) continue;
      const k = v.record_table + '|' + v.record_id;
      if (!byRecord.has(k)) byRecord.set(k, {});
      const row = byRecord.get(k), x = val(v);
      if (x === '' || x == null) continue;
      row[v.field] = row[v.field] != null && v.type === 'multiselect' ? row[v.field] + '; ' + x : x;
    }
    const forms = [], seen = new Map();
    for (const d of dict) { if (!seen.has(d.form)) { seen.set(d.form, []); forms.push(d.form); } if (!seen.get(d.form).some(x => x.field === d.field)) seen.get(d.form).push(d); }
    const out = [];
    const pCols = ['participant_id', ...Object.keys(t.participants[0] || { participant_id: '', sex: '' }).filter(k => k !== 'participant_id')];
    const pFields = seen.get('_participant') || [];
    out.push({ name: 'participants', title: 'Пациенты', base: pCols.map(k => ({ key: k, label: { participant_id: 'Код пациента', sex: 'Пол', local_id: '№ ИБ', name: 'ФИО', birth_date: 'Дата рождения', phone: 'Телефон', email: 'Почта', iin: 'ИИН', center: 'Учреждение' }[k] || k, type: k === 'birth_date' ? 'date' : 'text' })),
      fields: pFields, rows: t.participants.map(p => ({ ...p, ...(byRecord.get('participants|' + p.participant_id) || {}) })) });
    const formName = new Map((bundle.formNames || []).map(x => [x.id, x.name]));
    for (const form of forms.filter(f => f !== '_participant')) {
      const evs = t.events.filter(e => e.form === form);
      if (!evs.length) continue;
      const dateKey = evs.some(e => e.date) ? 'date' : 'day';
      out.push({ name: form, title: formName.get(form) || form,
        base: [{ key: 'participant_id', label: 'Код пациента', type: 'text' }, { key: 'event_id', label: 'Код события', type: 'text' }, { key: 'episode_id', label: 'Код эпизода', type: 'text' },
          { key: dateKey, label: dateKey === 'date' ? 'Дата события' : 'День от первого события', type: dateKey === 'date' ? 'date' : 'number' }, { key: 'status', label: 'Статус', type: 'text' }],
        fields: seen.get(form), rows: evs.map(e => ({ ...e, ...(byRecord.get('events|' + e.event_id) || {}) })) });
    }
    /* коды для вариантов ответа: 1..n по порядку вариантов в форме */
    for (const tab of out) {
      const name = ExportFormats.namer();
      tab.cols = [...tab.base.map(b => ({ ...b, var: name(b.key) })), ...tab.fields.map(d => ({ key: d.field, label: d.label || d.field, type: d.type, var: name(d.field), unit: d.unit, choices: ExportFormats.coded(d) ? ExportFormats.choices(d) : null }))];
      tab.data = tab.rows.map(r => tab.cols.map(c => {
        const v = r[c.key];
        if (v == null || v === '') return '';
        if (c.choices) { const i = c.choices.indexOf(String(v)); return i < 0 ? '' : i + 1; }
        return v;
      }));
    }
    return out;
  },
  csv(tab) {
    const q = v => { const s = String(v ?? ''); return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    return '﻿' + [tab.cols.map(c => c.var), ...tab.data].map(r => r.map(q).join(';')).join('\r\n');
  },
  isNum(tab, i) { const c = tab.cols[i]; if (c.choices) return true;
    if (['text', 'textarea', 'multiselect', 'date', 'datetime', 'time', 'icd10', 'icdo', 'user'].includes(c.type) || ['participant_id', 'event_id', 'episode_id', 'iin', 'phone', 'email', 'local_id', 'name', 'center'].includes(c.key)) return false;
    return tab.data.every(r => r[i] === '' || typeof r[i] === 'number' || /^-?\d+([.]\d+)?$/.test(String(r[i]))); },
  esc1: s => String(s ?? '').replace(/'/g, "''").replace(/[\r\n]+/g, ' ').slice(0, 250),
  esc2: s => String(s ?? '').replace(/"/g, "'").replace(/[\r\n]+/g, ' ').slice(0, 79),

  spss(tabs) {
    return tabs.map(tab => `* ${tab.title}.\nGET DATA /TYPE=TXT /FILE='${tab.name}.csv' /ENCODING='UTF8' /DELCASE=LINE /DELIMITERS=";" /QUALIFIER='"' /ARRANGEMENT=DELIMITED /FIRSTCASE=2
  /VARIABLES=${tab.cols.map((c, i) => `\n  ${c.var} ${ExportFormats.isNum(tab, i) ? 'F12.4' : 'A255'}`).join('')}.
DATASET NAME ${tab.name.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 60) || 'data'}.
VARIABLE LABELS${tab.cols.map(c => `\n  ${c.var} '${ExportFormats.esc1(c.label + (c.unit ? ', ' + c.unit : ''))}'`).join('')}.
${tab.cols.filter(c => c.choices).map(c => `VALUE LABELS ${c.var}${c.choices.map((o, i) => ` ${i + 1} '${ExportFormats.esc1(o)}'`).join('')}.`).join('\n')}
EXECUTE.\n`).join('\n');
  },
  stata(tabs) {
    return tabs.map(tab => `* ${tab.title}\nimport delimited using "${tab.name}.csv", delimiter(";") varnames(1) encoding("utf-8") stringcols(_all) clear
${tab.cols.map((c, i) => ExportFormats.isNum(tab, i) ? `destring ${c.var.toLowerCase()}, replace` : '').filter(Boolean).join('\n')}
${tab.cols.map(c => `label variable ${c.var.toLowerCase()} "${ExportFormats.esc2(c.label)}"`).join('\n')}
${tab.cols.filter(c => c.choices).map(c => `label define ${c.var.toLowerCase().slice(0, 28)}_l ${c.choices.map((o, i) => `${i + 1} "${ExportFormats.esc2(o)}"`).join(' ')}, replace\nlabel values ${c.var.toLowerCase()} ${c.var.toLowerCase().slice(0, 28)}_l`).join('\n')}
save "${tab.name}.dta", replace\n`).join('\n');
  },
  r(tabs) {
    const s = x => '"' + String(x ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
    return `# Чтение выгрузки AddAll в R. Метки переменных хранятся в атрибуте "label".\n` + tabs.map(tab => `${tab.name.replace(/[^A-Za-z0-9_]/g, '_')} <- local({
  d <- read.csv(${s(tab.name + '.csv')}, sep = ";", fileEncoding = "UTF-8-BOM", stringsAsFactors = FALSE, check.names = FALSE)
${tab.cols.filter(c => c.choices).map(c => `  d[[${s(c.var)}]] <- factor(d[[${s(c.var)}]], levels = ${c.choices.length ? '1:' + c.choices.length : 'integer(0)'}, labels = c(${c.choices.map(s).join(', ')}))`).join('\n')}
  labels <- c(${tab.cols.map(c => `${s(c.var)} = ${s(c.label)}`).join(', ')})
  for (v in names(labels)) if (v %in% names(d)) attr(d[[v]], "label") <- labels[[v]]
  d
})\n`).join('\n');
  },
  sas(tabs) {
    return tabs.map(tab => `/* ${tab.title} */
proc format;${tab.cols.filter(c => c.choices).map(c => `\n  value ${c.var.slice(0, 28).replace(/\d+$/, '')}f ${c.choices.map((o, i) => `${i + 1}='${ExportFormats.esc1(o)}'`).join(' ')};`).join('')}
run;
proc import datafile="${tab.name}.csv" out=${tab.name.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 32)} dbms=dlm replace; delimiter=';'; getnames=yes; guessingrows=max; run;
data ${tab.name.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 32)}; set ${tab.name.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 32)};
${tab.cols.map(c => `  label ${c.var}='${ExportFormats.esc1(c.label)}';`).join('\n')}
${tab.cols.filter(c => c.choices).map(c => `  format ${c.var} ${c.var.slice(0, 28).replace(/\d+$/, '')}f.;`).join('\n')}
run;\n`).join('\n');
  },

  /* REDCap: словарь данных и данные с повторяющимися формами (repeating instruments) */
  redcap(tabs, identified) {
    const head = ['Variable / Field Name', 'Form Name', 'Section Header', 'Field Type', 'Field Label', 'Choices, Calculations, OR Slider Labels', 'Field Note', 'Text Validation Type OR Show Slider Number', 'Text Validation Min', 'Text Validation Max', 'Identifier?', 'Branching Logic (Show field only if...)', 'Required Field?', 'Custom Alignment', 'Question Number (surveys only)', 'Matrix Group Name', 'Matrix Ranking?', 'Field Annotation'];
    const q = v => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const line = r => r.map(q).join(',');
    const dict = [head], names = new Set(['record_id']);
    const instr = t => t.name === 'participants' ? 'participant' : ('f_' + t.name).toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 50);
    dict.push(['record_id', 'participant', '', 'text', 'Record ID', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    const varOf = new Map();
    for (const tab of tabs) {
      for (const c of tab.cols) {
        if (c.key === 'participant_id') continue;
        let v = (tab.name === 'participants' ? '' : tab.name.slice(0, 12) + '_') + c.var; v = v.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^[^a-z]+/, 'v_').slice(0, 26);
        let k = v, i = 2; while (names.has(k)) k = v.slice(0, 23) + '_' + i++; names.add(k); varOf.set(tab.name + '|' + c.key, k);
        const type = c.choices ? 'dropdown' : c.type === 'multiselect' || c.type === 'text' || c.type === 'textarea' ? 'notes' : 'text';
        const valid = c.choices ? '' : c.type === 'date' && identified ? 'date_ymd' : ['number', 'calc'].includes(c.type) || c.key === 'day' || c.type === 'date' ? 'number' : '';
        dict.push([k, instr(tab), '', type, c.label + (c.unit ? ', ' + c.unit : ''), c.choices ? c.choices.map((o, j) => `${j + 1}, ${String(o).replace(/[|,]/g, ' ')}`).join(' | ') : '', '', valid, '', '', identified && ['name', 'iin', 'phone', 'email', 'birth_date', 'local_id'].includes(c.key) ? 'y' : '', '', '', '', '', '', '', c.type === 'calc' ? 'расчётное поле AddAll, значение импортировано' : '']);
      }
    }
    const cols = ['record_id', 'redcap_repeat_instrument', 'redcap_repeat_instance', ...[...varOf.values()]];
    const rows = [cols];
    const pTab = tabs.find(t => t.name === 'participants');
    for (const r of pTab?.data || []) {
      const row = { record_id: r[0] };
      pTab.cols.forEach((c, i) => { const v = varOf.get('participants|' + c.key); if (v) row[v] = r[i]; });
      rows.push(cols.map(c => row[c] ?? ''));
    }
    for (const tab of tabs.filter(t => t.name !== 'participants')) {
      const count = new Map();
      for (const r of tab.data) {
        const pid = r[0], n = (count.get(pid) || 0) + 1; count.set(pid, n);
        const row = { record_id: pid, redcap_repeat_instrument: instr(tab), redcap_repeat_instance: n };
        tab.cols.forEach((c, i) => { const v = varOf.get(tab.name + '|' + c.key); if (v) row[v] = r[i]; });
        rows.push(cols.map(c => row[c] ?? ''));
      }
    }
    return { dictionary: '﻿' + dict.map(line).join('\r\n'), data: '﻿' + rows.map(line).join('\r\n'),
      repeating: 'Включите в проекте REDCap повторяющиеся инструменты (Repeating instruments) для форм: ' + tabs.filter(t => t.name !== 'participants').map(instr).join(', ') };
  },

  /* CDISC ODM 1.3.2: метаданные и клинические данные */
  odm(tabs, bundle) {
    const x = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const oid = s => String(s).replace(/[^A-Za-z0-9_.-]/g, '_');
    const forms = tabs.filter(t => t.name !== 'participants');
    const dtype = (tab, i) => tab.cols[i].choices ? 'integer' : tab.cols[i].type === 'date' && bundle.identified ? 'date' : ExportFormats.isNum(tab, i) ? 'float' : 'text';
    const all = [tabs.find(t => t.name === 'participants'), ...forms].filter(Boolean);
    const meta = all.map(tab => {
      const items = tab.cols.map((c, i) => ({ c, i })).filter(({ c }) => c.key !== 'participant_id');
      return { tab, items, ig: `IG.${oid(tab.name)}` };
    });
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ODM xmlns="http://www.cdisc.org/ns/odm/v1.3" ODMVersion="1.3.2" FileType="Snapshot" FileOID="AddAll.${oid(bundle.registry)}.${Date.now()}" CreationDateTime="${new Date().toISOString()}" Originator="AddAll 2.0">
 <Study OID="ST.AddAll"><GlobalVariables><StudyName>${x(bundle.registry)}</StudyName><StudyDescription>${x(bundle.registry)}</StudyDescription><ProtocolName>${x(bundle.registry)}</ProtocolName></GlobalVariables>
  <MetaDataVersion OID="MDV.${bundle.schema_version}" Name="Версия схемы ${bundle.schema_version}">
   <Protocol>${meta.map(m => `<StudyEventRef StudyEventOID="SE.${oid(m.tab.name)}" Mandatory="No"/>`).join('')}</Protocol>
${meta.map(m => `   <StudyEventDef OID="SE.${oid(m.tab.name)}" Name="${x(m.tab.title)}" Repeating="${m.tab.name === 'participants' ? 'No' : 'Yes'}" Type="Common"><FormRef FormOID="F.${oid(m.tab.name)}" Mandatory="Yes"/></StudyEventDef>
   <FormDef OID="F.${oid(m.tab.name)}" Name="${x(m.tab.title)}" Repeating="No"><ItemGroupRef ItemGroupOID="${m.ig}" Mandatory="Yes"/></FormDef>
   <ItemGroupDef OID="${m.ig}" Name="${x(m.tab.title)}" Repeating="No">${m.items.map(({ c }) => `<ItemRef ItemOID="IT.${oid(m.tab.name)}.${c.var}" Mandatory="No"/>`).join('')}</ItemGroupDef>
${m.items.map(({ c, i }) => `   <ItemDef OID="IT.${oid(m.tab.name)}.${c.var}" Name="${x(c.var)}" DataType="${dtype(m.tab, i)}"><Question><TranslatedText xml:lang="ru">${x(c.label)}</TranslatedText></Question>${c.choices ? `<CodeListRef CodeListOID="CL.${oid(m.tab.name)}.${c.var}"/>` : ''}</ItemDef>`).join('\n')}
${m.items.filter(({ c }) => c.choices).map(({ c }) => `   <CodeList OID="CL.${oid(m.tab.name)}.${c.var}" Name="${x(c.label)}" DataType="integer">${c.choices.map((o, j) => `<CodeListItem CodedValue="${j + 1}"><Decode><TranslatedText xml:lang="ru">${x(o)}</TranslatedText></Decode></CodeListItem>`).join('')}</CodeList>`).join('\n')}`).join('\n')}
  </MetaDataVersion>
 </Study>
 <ClinicalData StudyOID="ST.AddAll" MetaDataVersionOID="MDV.${bundle.schema_version}">
${(() => {
  const subjects = new Map();
  for (const m of meta) {
    const count = new Map();
    m.tab.data.forEach(r => {
      const pid = r[0], n = (count.get(pid) || 0) + 1; count.set(pid, n);
      const items = m.items.filter(({ i }) => r[i] !== '' && r[i] != null).map(({ c, i }) => `<ItemData ItemOID="IT.${oid(m.tab.name)}.${c.var}" Value="${x(r[i])}"/>`).join('');
      if (!items) return;
      if (!subjects.has(pid)) subjects.set(pid, []);
      subjects.get(pid).push(`<StudyEventData StudyEventOID="SE.${oid(m.tab.name)}"${m.tab.name === 'participants' ? '' : ` StudyEventRepeatKey="${n}"`}><FormData FormOID="F.${oid(m.tab.name)}"><ItemGroupData ItemGroupOID="${m.ig}">${items}</ItemGroupData></FormData></StudyEventData>`);
    });
  }
  return [...subjects].map(([pid, evs]) => `  <SubjectData SubjectKey="${x(pid)}">${evs.join('')}</SubjectData>`).join('\n');
})()}
 </ClinicalData>
</ODM>`;
    return xml;
  },

  readme(kind, bundle, extra = '') {
    return `Выгрузка AddAll: ${bundle.registry}\nСформирована: ${bundle.exported_at}\nФормат: ${kind}\n${bundle.identified ? 'С идентификаторами пациентов: храните на защищённом носителе.' : 'Без прямых идентификаторов: даты заменены днями от первого события.'}\n\nКаждая форма в отдельном CSV (UTF-8, разделитель ;), одна строка = одно событие. participant_id связывает таблицы.\nВарианты ответа закодированы числами 1, 2, 3 по порядку вариантов в форме; расшифровка в файле с метками.\nВложенные группы (например, список осложнений) в плоские таблицы не входят: они есть в values.csv обычного комплекта (ZIP с CSV).\n${extra}`;
  }
};

{
  const previous = RegistryExport.downloadBundle.bind(RegistryExport);
  RegistryExport.downloadBundle = function (bundle, format, fileName) {
    const F = ExportFormats;
    if (!['spss', 'stata', 'r', 'sas', 'redcap', 'odm'].includes(format)) return previous(bundle, format, fileName);
    const tabs = F.flat(bundle), csvs = tabs.map(t => ({ name: t.name + '.csv', data: F.csv(t) }));
    if (format === 'odm') return download(fileName + '_odm.xml', F.odm(tabs, bundle), 'application/xml');
    if (format === 'redcap') {
      const rc = F.redcap(tabs, bundle.identified);
      return download(fileName + '_redcap.zip', Office.zip([{ name: 'data_dictionary.csv', data: rc.dictionary }, { name: 'import_data.csv', data: rc.data },
        { name: 'README.txt', data: F.readme('REDCap', bundle, 'Сначала загрузите data_dictionary.csv (Designer → Data Dictionary), затем import_data.csv (Data Import Tool).\n' + rc.repeating) }]), 'application/zip');
    }
    const script = { spss: ['read_spss.sps', F.spss(tabs)], stata: ['read_stata.do', F.stata(tabs)], r: ['read_r.R', F.r(tabs)], sas: ['read_sas.sas', F.sas(tabs)] }[format];
    const name = { spss: 'SPSS', stata: 'Stata', r: 'R', sas: 'SAS' }[format];
    return download(`${fileName}_${format}.zip`, Office.zip([...csvs, { name: script[0], data: script[1] }, { name: 'README.txt', data: F.readme(name, bundle, `Откройте ${script[0]} в ${name} из этой же папки.`) }]), 'application/zip');
  };
  /* названия форм для заголовков таблиц */
  const assemble = RegistryExport.assemble.bind(RegistryExport);
  RegistryExport.assemble = function (ds, ...rest) {
    const b = assemble(ds, ...rest);
    b.formNames = (ds.reg.eventTypes || []).map(et => ({ id: et.id, name: et.name }));
    return b;
  };
}
