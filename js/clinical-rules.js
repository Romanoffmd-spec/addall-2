/* Rules defined by each registry for records in the same episode. */
'use strict';

const ClinicalRules = {
  types: { before: 'должно быть не позже', after: 'должно быть не раньше', requires: 'должна существовать запись не позже' },
  violations(reg, patient, candidate, records) {
    const rules = (reg.crossChecks || []).filter(rule => rule.form === candidate.type);
    if (!rules.length) return [];
    const relevant = records.filter(event => event.patientId === patient.id && event.id !== candidate.id
      && event.status !== 'черновик' && calendarDay(event.date));
    const current = { ...candidate, id: candidate.id || '__candidate', status: 'завершено' };
    const links = Episodes.link(reg, [...relevant, current]);
    const episode = links.get(current.id);
    const sameEpisode = event => Episodes.isPatient(reg) || (episode ? links.get(event.id) === episode : true);
    return rules.flatMap(rule => {
      const targets = relevant.filter(event => event.type === rule.related && sameEpisode(event));
      const satisfied = targets.some(event => rule.kind === 'before' ? current.date <= event.date : current.date >= event.date);
      if (satisfied || (!targets.length && rule.kind !== 'requires')) return [];
      return [{ id: rule.id, label: rule.label || (etById(reg, rule.form)?.name || '') + ' · ' + this.types[rule.kind] + ' · '
        + (etById(reg, rule.related)?.name || '') }];
    });
  },

  edit(reg, body, readOnly, changed) {
    reg.crossChecks ||= [];
    const options = form => reg.eventTypes.map(type => `<option value="${esc(type.id)}" ${type.id === form ? 'selected' : ''}>${esc(type.name)}</option>`).join('');
    const draw = () => {
      body.innerHTML = `<section class="card"><h3>Проверки между формами</h3><p>Правила применяются внутри эпизода. Если правило не выполняется, форму можно исправить, оставить черновиком или указать причину.</p>
        ` + reg.crossChecks.map((rule, index) => `<div class="grid sec" data-rule="${index}">
          <label>Форма<select class="inp" data-rule-key="form" ${readOnly ? 'disabled' : ''}>${options(rule.form)}</select></label>
          <label>Условие<select class="inp" data-rule-key="kind" ${readOnly ? 'disabled' : ''}>${Object.entries(this.types).map(([id, label]) => `<option value="${id}" ${rule.kind === id ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
          <label>Связанная форма<select class="inp" data-rule-key="related" ${readOnly ? 'disabled' : ''}>${options(rule.related)}</select></label>
          <label>Текст проверки<input class="inp" data-rule-key="label" value="${esc(rule.label || '')}" ${readOnly ? 'disabled' : ''}></label>
          ${readOnly ? '' : `<button class="btn danger" data-rule-remove="${index}">Убрать проверку</button>`}</div>`).join('')
        + (readOnly ? '' : '<button class="btn" id="newCrossCheck">Добавить проверку</button>') + '</section>';
      if (readOnly) return;
      $$('[data-rule-key]', body).forEach(input => input.onchange = () => {
        reg.crossChecks[+input.closest('[data-rule]').dataset.rule][input.dataset.ruleKey] = input.value.trim();
        changed();
      });
      $$('[data-rule-remove]', body).forEach(button => button.onclick = () => { reg.crossChecks.splice(+button.dataset.ruleRemove, 1); draw(); changed(); });
      $('#newCrossCheck', body).onclick = () => {
        if (reg.eventTypes.length < 2) return toast('Сначала добавьте две формы событий', 'err');
        reg.crossChecks.push({ id: uid('rule_'), form: reg.eventTypes[1].id, related: reg.eventTypes[0].id, kind: 'requires', label: '' });
        draw(); changed();
      };
    };
    draw();
  }
};

const RegistrySchema = {
  keys: ['eventTypes', 'patientFields', 'indicators', 'instruments', 'schedules', 'episode', 'keyDates', 'crossChecks'],
  snapshot(reg) {
    return clone({ version: reg.version || 1, ...Object.fromEntries(this.keys.map(key => [key, reg[key]])) });
  },
  publish(reg, original, date) {
    const schema = this.snapshot(reg);
    const prior = this.snapshot(original);
    const history = [...(original.schemaHistory || [])];
    if (!history.some(version => version.version === prior.version)) history.push({ ...prior, effectiveOn: original.schemaEffectiveOn || '' });
    return { ...reg, ...schema, version: prior.version + 1, schemaDraft: null, schemaHistory: history, schemaEffectiveOn: date };
  }
};
