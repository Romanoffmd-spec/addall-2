/* Structure files move forms and definitions, without users or clinical records. */
'use strict';

const SchemaTransfer = {
  properties: ['eventTypes', 'patientFields', 'indicators', 'instruments', 'schedules', 'episode', 'keyDates', 'crossChecks', 'followupEvery'],

  export(reg) {
    const schema = { format: 'addall-schema/1', source_version: reg.version || 1, name: reg.name, description: reg.description || '' };
    for (const key of this.properties) if (Object.hasOwn(reg, key)) schema[key] = reg[key];
    return schema;
  },

  parse(input) {
    const reg = input?.schema || input;
    if (!reg || (reg.format && reg.format !== 'addall-schema/1') || typeof reg.name !== 'string'
      || !reg.name.trim() || !Array.isArray(reg.eventTypes) || !reg.eventTypes.length || reg.eventTypes.length > 120) {
      throw new Error('Файл не содержит структуру регистра AddAll');
    }
    const code = /^[A-Za-zА-Яа-яЁё0-9_][A-Za-zА-Яа-яЁё0-9_-]{0,79}$/;
    const reserved = new Set(['__proto__', 'constructor', 'prototype', '_na', '_center']);
    const valid = key => typeof key === 'string' && code.test(key) && !reserved.has(key);
    const label = (value, max = 200) => typeof value === 'string' ? value.trim().slice(0, max) : '';
    const filter = (obj, fields) => Object.fromEntries(Object.entries(obj).filter(([key]) => fields.includes(key)));
    let count = 0, formulas = 0;
    const fields = (list, seen, depth = 0) => {
      if (list == null) return [];
      if (!Array.isArray(list) || depth > 4) throw new Error('Неверная структура вложенных полей');
      return list.map(item => {
        if (!item || !valid(item.key) || seen.has(item.key) || !Object.hasOwn(FIELD_TYPES, item.type)
          || !label(item.label) || ++count > 3500) throw new Error('Проверьте повторяющиеся коды и типы полей');
        seen.add(item.key);
        const row = { key: item.key, type: item.type, label: label(item.label), unit: label(item.unit, 80),
          options: Array.isArray(item.options) ? item.options.filter(value => typeof value === 'string').slice(0, 2000) : [],
          required: item.required === true, key_: item.key_ === true, sensitive: item.sensitive === true,
          help: label(item.help, 2000), warn: label(item.warn, 2000), def: label(item.def, 4000),
          standard: label(item.standard), standardCode: label(item.standardCode),
          carry: item.carry === true, search: item.search === true };
        for (const key of ['min', 'max', 'step']) if (item[key] !== '' && item[key] != null && Number.isFinite(Number(item[key]))) row[key] = Number(item[key]);
        if (item.optionCodes && typeof item.optionCodes === 'object') {
          row.optionCodes = Object.fromEntries(Object.entries(item.optionCodes).filter(([choice, value]) =>
            row.options.includes(choice) && typeof value === 'string' && /^[a-zA-Z0-9_.-]{1,80}$/.test(value)));
        }
        if (item.showIf && valid(item.showIf.key) && Object.hasOwn(OPS, item.showIf.op)) row.showIf = filter(item.showIf, ['key', 'op', 'value']);
        if (item.type === 'group') {
          row.itemLabel = label(item.itemLabel);
          row.subfields = fields(item.subfields, new Set(), depth + 1);
        }
        if (item.type === 'calc' && (label(item.formula, 4000) || label(item.formulaDraft, 4000))) {
          row.formulaDraft = label(item.formula, 4000) || label(item.formulaDraft, 4000);
          formulas++;
        }
        if (Object.hasOwn(DIAGRAMS, item.diagram)) row.diagram = item.diagram;
        return row;
      });
    };
    const ids = new Set();
    const eventTypes = reg.eventTypes.map(type => {
      if (!type || !valid(type.id) || ids.has(type.id) || !label(type.name) || !Array.isArray(type.sections)) throw new Error('Проверьте коды и названия форм');
      ids.add(type.id);
      const seen = new Set();
      const result = { id: type.id, name: label(type.name), color: /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(type.color || '') ? type.color : '#888888',
        dateLabel: label(type.dateLabel) || 'Дата', single: type.single === true,
        sections: type.sections.map(section => ({ id: uid('s_'), title: label(section?.title) || 'Основное', note: label(section?.note, 2000),
          fields: fields(section?.fields, seen) })) };
      if (type.expect && Number.isFinite(Number(type.expect.days))) result.expect = Episodes.rule({ expect: type.expect });
      return result;
    });
    const patients = fields(reg.patientFields, new Set());
    const only = (list, max) => Array.isArray(list) ? list.filter(item => item && typeof item === 'object').slice(0, max) : [];
    const schema = { name: label(reg.name), description: label(reg.description, 4000), version: 1, status: 'черновик', scope: 'members',
      eventTypes, patientFields: patients,
      indicators: only(reg.indicators, 200).filter(item => valid(item.id) && ids.has(item.et) && item.num).map(item => filter(item,
        ['id', 'name', 'et', 'num', 'denom', 'kind', 'measure', 'lowerBetter', 'target', 'ref'])),
      instruments: only(reg.instruments, 200).filter(item => valid(item.id) && Array.isArray(item.items)).map(item => ({
        id: item.id, name: label(item.name), note: label(item.note, 2000),
        items: only(item.items, 250).filter(question => valid(question.key)).map(question => ({ key: question.key, label: label(question.label),
          options: only(question.options, 100).filter(opt => Number.isFinite(Number(opt.s))).map(opt => ({ l: label(opt.l), s: Number(opt.s) })) })),
        bands: only(item.bands, 50).map(band => ({ min: Number(band.min), max: Number(band.max), l: label(band.l) }))
      })),
      schedules: only(reg.schedules, 150).filter(item => valid(item.id) && ids.has(item.anchorEt)).map(item => filter(item, ['id', 'instrument', 'anchorEt', 'offsets', 'condition'])),
      crossChecks: only(reg.crossChecks, 150).filter(item => valid(item.id) && ids.has(item.form) && ids.has(item.related) && Object.hasOwn(ClinicalRules.types, item.kind))
        .map(item => filter(item, ['id', 'form', 'related', 'kind', 'label'])),
      followupEvery: Number(reg.followupEvery) || 0,
      episode: { opener: ids.has(reg.episode?.opener) || reg.episode?.opener === Episodes.PATIENT ? reg.episode.opener : ids.has(reg.keyDates?.start) ? reg.keyDates.start : eventTypes[0].id,
        ...(ids.has(reg.episode?.anchorForm) ? { anchorForm: reg.episode.anchorForm } : {}) },
      keyDates: Object.fromEntries(Object.entries(reg.keyDates || {}).filter(([, value]) => ids.has(value)))
    };
    return { schema, count, formulas };
  },

  pick() {
    if (!can('design')) return;
    const file = document.createElement('input');
    file.type = 'file';
    file.accept = '.json';
    file.onchange = async () => {
      const selected = file.files[0];
      if (!selected) return;
      try {
        if (selected.size > 4 * 1024 * 1024) throw new Error('Слишком большой файл структуры');
        const { schema, count, formulas } = this.parse(JSON.parse(await selected.text()));
        const box = modal(`<h2>Предпросмотр структуры</h2><p>Форм ${schema.eventTypes.length}, полей ${count}, показателей ${schema.indicators.length}.</p>
          ${formulas ? '<p>Формул для ручной проверки ' + formulas + '. Откройте каждую в редакторе, проверьте и сохраните.</p>' : ''}
          <label for="schemaImportName">Название нового регистра</label><input id="schemaImportName" class="inp" value="${esc(schema.name)}">
          <button class="btn primary" id="schemaImportConfirm">Создать черновик регистра</button>`);
        $('#schemaImportConfirm', box).onclick = async () => {
          const name = $('#schemaImportName', box).value.trim();
          if (!name) return toast('Введите название', 'err');
          try {
            const reg = await DB.put('registries', { ...schema, name, dept: Auth.user.dept || '', center: Auth.user.center || '' }, 'импорт структуры регистра');
            box.close();
            go('registry/' + reg.id);
          } catch (error) { toast(error.message, 'err'); }
        };
      } catch (error) { toast(error.message || 'Не удалось прочитать структуру', 'err'); }
    };
    file.click();
  }
};
