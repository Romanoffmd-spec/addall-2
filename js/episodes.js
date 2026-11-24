/* AddAll: эпизод как единица учёта регистра.
   Регистр задаёт событие, которое открывает эпизод (операция в хирургическом аудите, диагноз в регистре заболевания,
   госпитализация в кардиологии), или считает случаем самого пациента (регистр длительного наблюдения, например диабет).
   Остальные события пациента относятся к эпизоду: явно (anchorEventId) или по дате.
   Охват, полнота наблюдения, очередь наблюдения и показатели считаются по эпизодам. Подключается после worklist.js, до coverage.js. */
'use strict';

const Episodes = {
  PATIENT: '__patient',
  isPatient(reg) { return reg?.episode?.opener === this.PATIENT; },
  opener(reg) {
    if (this.isPatient(reg)) return this.PATIENT;
    const id = reg?.episode?.opener || reg?.keyDates?.start || reg?.eventTypes?.[0]?.id || '';
    return etById(reg, id) ? id : (reg?.eventTypes?.[0]?.id || '');
  },
  openerName(reg) { return this.isPatient(reg) ? 'Пациент' : etById(reg, this.opener(reg))?.name || 'событие'; },
  /* эпизоды по дате. В продольном регистре один эпизод на пациента: дата включения это первая сохранённая запись. */
  list(reg, events, patients) {
    const own = events.filter(e => !e.registryId || e.registryId === reg.id);
    if (this.isPatient(reg)) {
      const first = new Map();
      for (const e of own) {
        if (!e.date || e.status === 'черновик') continue;
        const was = first.get(e.patientId);
        if (!was || e.date < was.date) first.set(e.patientId, { id: 'pt:' + e.patientId, patientId: e.patientId, date: e.date, patient: true, ownerId: e.ownerId || e.createdBy });
      }
      for (const p of patients || []) {
        if ((!p.registryId || p.registryId === reg.id) && !first.has(p.id) && p.createdAt) first.set(p.id, { id: 'pt:' + p.id, patientId: p.id, date: String(p.createdAt).slice(0, 10), patient: true, ownerId: p.createdBy });
      }
      return [...first.values()].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    }
    const type = this.opener(reg);
    return own.filter(e => e.type === type && e.date && e.status !== 'черновик')
      .sort((a, b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id)));
  },
  /* к какому эпизоду относится каждое событие: Map(id события -> id эпизода) */
  link(reg, events) {
    const out = new Map();
    if (this.isPatient(reg)) { for (const e of events) out.set(e.id, 'pt:' + e.patientId); return out; }
    const openers = this.list(reg, events);
    const openerIds = new Set(openers.map(e => e.id));
    const byId = new Map(events.map(e => [e.id, e]));
    const byPatient = new Map();
    for (const o of openers) {
      if (!byPatient.has(o.patientId)) byPatient.set(o.patientId, []);
      byPatient.get(o.patientId).push(o);
    }
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
      const anchor = e.anchorEventId && byId.get(e.anchorEventId);
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
  /* правило ожидания формы: первый срок через days после начала эпизода, дальше каждые every дней (если задано),
     допустимое окно window дней после срока (по умолчанию половина интервала, для однократной формы 0) */
  rule(et) {
    const x = et?.expect;
    if (!x || x.days === '' || x.days == null || !Number.isFinite(Number(x.days))) return null;
    const every = Number(x.every) > 0 ? Math.round(Number(x.every)) : 0;
    const window = x.window !== '' && x.window != null && Number(x.window) >= 0 ? Math.round(Number(x.window)) : (every ? Math.round(every / 2) : 0);
    return { days: Math.max(0, Math.round(Number(x.days))), every, window };
  },
  expected(reg) {
    const opener = this.opener(reg);
    return (reg.eventTypes || []).filter(et => et.id !== opener && this.rule(et));
  },
  /* подпись эпизода для выбора в форме */
  title(reg, ep, index) { return `${index + 1}. ${this.openerName(reg)} от ${fmtDate(ep.date)}`; }
};

/* Очередь наблюдения: задачи по каждому эпизоду и каждой ожидаемой форме.
   Состояния: done (форма есть), reason (закрыто с причиной), na (не применимо), wait (срок не наступил),
   open (срок наступил, идёт окно), partial (есть только черновик), overdue (окно прошло). Причины хранятся в разделе tasks. */
const FollowQ = {
  REASONS: { unreachable: 'не удалось связаться', refused: 'отказался', elsewhere: 'наблюдается в другом центре', na: 'не применимо' },
  AHEAD: 30,
  key: (episodeId, typeId, due) => `${episodeId}|${typeId}|${due}`,
  build(reg, events, patients, tasks, opts = {}) {
    const t0 = opts.today || today();
    const horizon = addDays(t0, this.AHEAD);
    const own = events.filter(e => !e.registryId || e.registryId === reg.id);
    const episodes = opts.episodes || Episodes.list(reg, own, patients);
    const link = Episodes.link(reg, own);
    const marks = new Map((tasks || []).filter(t => t.registryId === reg.id).map(t => [this.key(t.episodeId, t.typeId, t.due), t]));
    const out = [];
    for (const et of Episodes.expected(reg)) {
      const rule = Episodes.rule(et);
      const byEpisode = new Map();
      for (const e of own) {
        if (e.type !== et.id) continue;
        const ep = link.get(e.id); if (!ep) continue;
        if (!byEpisode.has(ep)) byEpisode.set(ep, []);
        byEpisode.get(ep).push(e);
      }
      for (const ep of episodes) {
        const list = (byEpisode.get(ep.id) || []).slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        const used = new Set();
        for (let k = 0; k < 400; k++) {
          const due = addDays(ep.date, rule.days + k * rule.every);
          /* повторяющиеся сроки показываем только до горизонта; однократный срок показываем всегда */
          if (rule.every && due > horizon) break;
          const reach = rule.every ? Math.max(rule.window, Math.floor(rule.every / 2)) : Infinity;
          const match = list.find(e => !used.has(e.id) && Math.abs(daysBetween(due, e.date || due)) <= reach) || null;
          if (match) used.add(match.id);
          const mark = marks.get(this.key(ep.id, et.id, due));
          let state;
          if (match && match.status !== 'черновик') state = 'done';
          else if (mark?.status === 'na') state = 'na';
          else if (mark?.status && this.REASONS[mark.status]) state = 'reason';
          else if (due > t0) state = 'wait';
          else if (match) state = 'partial';
          else if (daysBetween(due, t0) <= rule.window) state = 'open';
          else state = 'overdue';
          out.push({ reg, ep, et, k, due, state, event: match, mark, late: Math.max(0, daysBetween(addDays(due, rule.window), t0)) });
          if (!rule.every) break;
        }
      }
    }
    return out;
  },
  /* сводка по тем же задачам; «не применимо» исключается из знаменателя */
  summary(items) {
    const byType = new Map();
    for (const x of items) {
      if (!byType.has(x.et.id)) byType.set(x.et.id, { et: x.et, done: 0, missing: 0, partial: 0, wait: 0, reason: 0, na: 0 });
      const s = byType.get(x.et.id);
      if (x.state === 'done') s.done++;
      else if (x.state === 'wait') s.wait++;
      else if (x.state === 'na') s.na++;
      else if (x.state === 'reason') s.reason++;
      else if (x.state === 'partial') s.partial++;
      else s.missing++;
    }
    return [...byType.values()].map(s => ({ ...s, due: s.done + s.missing + s.partial + s.reason }));
  }
};
