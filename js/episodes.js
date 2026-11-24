/* AddAll: эпизод как единица учёта регистра.
   Регистр задаёт событие, которое открывает эпизод (операция в хирургическом аудите, диагноз в регистре заболевания,
   госпитализация в кардиологии). Остальные события пациента относятся к эпизоду: явно (anchorEventId) или по дате.
   Охват, полнота наблюдения и показатели считаются по эпизодам. Подключается после worklist.js, до coverage.js. */
'use strict';

const Episodes = {
  opener(reg) {
    const id = reg?.episode?.opener || reg?.keyDates?.start || reg?.eventTypes?.[0]?.id || '';
    return etById(reg, id) ? id : (reg?.eventTypes?.[0]?.id || '');
  },
  openerName(reg) { return etById(reg, this.opener(reg))?.name || 'событие'; },
  /* сохранённые события, открывающие эпизод, по дате */
  list(reg, events) {
    const type = this.opener(reg);
    return events.filter(e => (!e.registryId || e.registryId === reg.id) && e.type === type && e.date && e.status !== 'черновик')
      .sort((a, b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id)));
  },
  /* к какому эпизоду относится каждое событие: Map(id события -> id события, открывшего эпизод) */
  link(reg, events) {
    const openers = this.list(reg, events);
    const openerIds = new Set(openers.map(e => e.id));
    const byId = new Map(events.map(e => [e.id, e]));
    const byPatient = new Map();
    for (const o of openers) {
      if (!byPatient.has(o.patientId)) byPatient.set(o.patientId, []);
      byPatient.get(o.patientId).push(o);
    }
    const out = new Map();
    const byDate = e => {
      const list = byPatient.get(e.patientId) || [];
      if (!list.length) return null;
      if (!e.date) return list[list.length - 1].id;
      let before = null;
      for (const o of list) if (o.date <= e.date) before = o;
      /* событие раньше первого эпизода (например, неоадъювантная терапия до операции) относится к ближайшему следующему */
      return (before || list.find(o => o.date > e.date) || list[0]).id;
    };
    for (const e of events) {
      if (openerIds.has(e.id)) { out.set(e.id, e.id); continue; }
      let anchor = e.anchorEventId && byId.get(e.anchorEventId);
      if (anchor && anchor.patientId === e.patientId) {
        if (openerIds.has(anchor.id)) { out.set(e.id, anchor.id); continue; }
        const viaAnchor = byDate(anchor);
        if (viaAnchor) { out.set(e.id, viaAnchor); continue; }
      }
      const id = byDate(e);
      if (id) out.set(e.id, id);
    }
    return out;
  },
  /* формы, которые ожидаются в каждом эпизоде через заданное число дней */
  expected(reg) {
    const opener = this.opener(reg);
    return (reg.eventTypes || []).filter(et => et.id !== opener && et.expect && Number.isFinite(Number(et.expect.days)));
  },
  /* сводка полноты по эпизодам за период: какие формы есть, каких нет, у каких срок не наступил */
  completeness(reg, events, episodes) {
    const link = this.link(reg, events);
    const t0 = today();
    return this.expected(reg).map(et => {
      const has = new Set(events.filter(e => e.type === et.id && e.status !== 'черновик').map(e => link.get(e.id)).filter(Boolean));
      let done = 0, missing = 0, wait = 0;
      for (const ep of episodes) {
        if (has.has(ep.id)) done++;
        else if (addDays(ep.date, Number(et.expect.days)) > t0) wait++;
        else missing++;
      }
      return { et, done, missing, wait, due: done + missing };
    });
  },
  /* подпись эпизода для выбора в форме */
  title(reg, ep, index) { return `${index + 1}. ${this.openerName(reg)} от ${fmtDate(ep.date)}`; }
};
