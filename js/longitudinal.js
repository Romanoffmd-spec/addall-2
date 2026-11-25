/* Additional types of registry quality indicator. */
'use strict';

const RegistryMeasure = {
  types: { proportion: 'Доля', change: 'Среднее изменение', rate: 'Частота на единицу наблюдения', time: 'Время до события' },

  summary(result, format = value => Number(value).toLocaleString('ru-RU', { maximumFractionDigits: 2 })) {
    return result.value == null ? (result.den && result.kind === 'time' ? 'медиана не достигнута' : 'нет данных')
      : format(result.value) + (result.unit ? ' ' + result.unit : '');
  },

  evaluate(indicator, events, patients, reg, options) {
    const kind = indicator.kind;
    const configs = indicator.measure || {};
    const byPatient = new Map(patients.filter(p => !p.registryId || p.registryId === reg.id).map(p => [p.id, p]));
    const form = etById(reg, indicator.et);
    const asOf = options.today || today();
    const complete = events.filter(event => byPatient.has(event.patientId) && (!event.registryId || event.registryId === reg.id)
      && event.status !== 'черновик' && calendarDay(event.date) && event.date <= asOf);
    const cohort = options.episodes || Episodes.list(reg, complete, [...byPatient.values()]);
    const links = Episodes.link(reg, complete);
    const known = new Map(cohort.map(ep => [ep.id, []]));
    const number = value => !isEmpty(value) && Number.isFinite(Number(value)) ? Number(value) : null;
    const denIds = [], numIds = [], missIds = [], pairs = [];
    let num = 0, den = 0, value = null, unit = '';
    for (const event of complete) {
      const list = known.get(links.get(event.id));
      if (list) list.push(event);
    }
    const values = event => computeValues(reg, byPatient.get(event.patientId), form, event.data, event.date);

    if (kind === 'rate') {
      const scale = [100, 1000, 10000].includes(configs.scale) ? configs.scale : 1000;
      unit = 'на ' + scale + ' дней наблюдения';
      for (const event of complete.filter(event => event.type === indicator.et)) {
        const data = values(event);
        if (indicator.denom?.key && !condOK(indicator.denom, data)) continue;
        const exposure = number(data[configs.exposure]);
        const count = configs.count ? number(data[configs.count]) : (!isEmpty(data[indicator.num?.key]) && data[indicator.num?.key] !== 'неизвестно') ? Number(condOK(indicator.num, data)) : null;
        if (exposure == null || exposure <= 0 || count == null || count < 0 || !Number.isInteger(count)) { missIds.push(event.id); continue; }
        den += exposure;
        num += count;
        denIds.push(event.id);
        if (count > 0) numIds.push(event.id);
        pairs.push({ id: event.id, exposure, count });
      }
      value = den ? scale * num / den : null;
    } else {
      for (const episode of cohort) {
        const timeline = known.get(episode.id).slice().sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
        const selected = timeline.filter(event => event.type === indicator.et && (!indicator.denom?.key || condOK(indicator.denom, values(event))));
        if (kind === 'change') {
          const measures = selected.map(event => ({ event, value: number(values(event)[configs.field]) })).filter(row => row.value != null);
          const first = measures[0], last = measures[measures.length - 1];
          if (!first || first.event.date === last.event.date) { missIds.push(episode.anchorEventId || episode.id); continue; }
          const change = last.value - first.value;
          denIds.push(last.event.id);
          pairs.push({ id: last.event.id, from: first.event.id, before: first.value, after: last.value, change });
        } else {
          const assessments = selected.filter(event => event.date >= episode.date && (indicator.num?.key ? (!isEmpty(values(event)[indicator.num.key]) && values(event)[indicator.num.key] !== 'неизвестно') : true));
          const outcome = assessments.find(event => !indicator.num?.key || condOK(indicator.num, values(event)));
          const observed = outcome || assessments[assessments.length - 1];
          if (!observed) { missIds.push(episode.anchorEventId || episode.id); continue; }
          denIds.push(observed.id);
          if (outcome) numIds.push(outcome.id);
          pairs.push({ id: observed.id, t: daysBetween(episode.date, observed.date), e: !!outcome });
        }
      }
      den = pairs.length;
      if (kind === 'change') {
        unit = formFields(form).find(field => field.key === configs.field)?.unit || '';
        num = pairs.reduce((sum, row) => sum + row.change, 0);
        value = den ? num / den : null;
      } else {
        unit = 'дн.';
        num = numIds.length;
        value = den ? Stats.km(pairs).median : null;
      }
    }
    const result = { kind, unit, value, num, den, miss: missIds.length, na: 0, pct: null, inputs: pairs };
    Object.defineProperties(result, { denIds: { value: denIds }, numIds: { value: numIds }, missIds: { value: missIds },
      reasonIds: { value: [] }, naIds: { value: [] } });
    return result;
  }
};
