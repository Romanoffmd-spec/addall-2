/* AddAll 2.0: регулярные отчёты обратной связи.
   После окончания каждого квартала врач получает уведомление о готовом отчёте: его показатели за квартал,
   общая доля по регистру, 95% ДИ Уилсона, оценка с поправкой на надёжность (Dimick 2010) и сравнение с прошлым кварталом.
   Руководитель и менеджер учреждения видят такой же отчёт по своему учреждению среди всех учреждений.
   Вывод «выше» или «ниже» делается только когда 95% ДИ не включает общую долю. */
'use strict';

const Feedback = {
  /* закрытые кварталы, последний первым */
  quarters(n = 4, at = today()) {
    let y = Number(at.slice(0, 4)), q = Math.floor((Number(at.slice(5, 7)) - 1) / 3); /* текущий квартал 0..3, он ещё не закрыт */
    const out = [];
    for (let i = 0; i < n; i++) {
      q -= 1; if (q < 0) { q = 3; y -= 1; }
      const m1 = String(q * 3 + 1).padStart(2, '0'), m3 = q * 3 + 3, last = new Date(Date.UTC(y, m3, 0)).getUTCDate();
      out.push({ id: `${y}-Q${q + 1}`, name: `${['I', 'II', 'III', 'IV'][q]} квартал ${y}`, from: `${y}-${m1}-01`, to: `${y}-${String(m3).padStart(2, '0')}-${last}` });
    }
    return out;
  },
  prev(qu) { const all = Feedback.quarters(8, qu.to.slice(0, 8) + '28'); return all.find(x => x.to < qu.from) || null; },
  pct: v => v == null ? '' : (Math.round(v * 1000) / 10).toLocaleString('ru-RU') + '%',
  seenKey: () => 'addall2_fb_seen_' + (Auth.user?.id || ''),
  seen() { try { return localStorage.getItem(Feedback.seenKey()) || ''; } catch (e) { return ''; } },
  markSeen(id) { try { localStorage.setItem(Feedback.seenKey(), id); } catch (e) { } },
  forCenter: () => ['lead', 'manager', 'admin'].includes(Auth.user?.role) && !!Auth.user?.center,
  forDoctor: () => can('enter') || ['lead', 'surgeon', 'resident'].includes(Auth.user?.role),

  verdict(num, den, p, lowerBetter) {
    if (!den || p == null) return { t: 'нет данных', c: 'muted' };
    const ci = Stats.wilson(num, den);
    if (ci.lo > p) return { t: lowerBetter ? 'выше общей доли (хуже)' : 'выше общей доли (лучше)', c: lowerBetter ? 'bad' : 'ok' };
    if (ci.hi < p) return { t: lowerBetter ? 'ниже общей доли (лучше)' : 'ниже общей доли (хуже)', c: lowerBetter ? 'ok' : 'bad' };
    return { t: 'в пределах случайных колебаний', c: '' };
  },

  /* показатели одного регистра за квартал: по врачу (по полю «врач» формы показателя) и по учреждению */
  async registry(reg, qu, users) {
    const base = { from: qu.from, to: qu.to, eventType: Episodes.opener(reg) };
    const all = await Period.collect(reg, base);
    const me = Auth.user, out = { reg, doctor: [], center: [] };
    const centers = Feedback.forCenter() ? await National.centers(reg) : [];
    const byCenter = new Map();
    for (const c of centers) byCenter.set(c, await Period.collect(reg, { ...base, center: c }));
    for (const ind of National.props(reg)) {
      const tot = all.results.find(x => x.id === ind.id);
      if (!tot?.den) continue;
      const p = tot.num / tot.den;
      const et = etById(reg, ind.et), uf = formFields(et || {}).find(f => f.type === 'user');
      if (uf && !Episodes.rule(et) && Feedback.forDoctor()) {
        const ids = [...new Set(all.cohortEvents.filter(e => e.type === ind.et).map(e => e.data?.[uf.key]).filter(Boolean))];
        const units = ids.map(id => { const x = evalIndicator(ind, all.cohortEvents.filter(e => e.type === ind.et && e.data?.[uf.key] === id), all.patients, reg); return { id, num: x.num || 0, den: x.den || 0 }; }).filter(u => u.den);
        const adj = Reliability.adjust(units), mine = adj.rows.find(u => u.id === me.id);
        if (mine) out.doctor.push({ ind, num: mine.num, den: mine.den, obs: mine.obs, adj: mine.adj, p, n: units.length });
      }
      if (byCenter.size) {
        const units = [...byCenter].map(([c, d]) => { const x = d.results.find(y => y.id === ind.id); return { id: c, num: x?.num || 0, den: x?.den || 0 }; }).filter(u => u.den);
        const adj = Reliability.adjust(units), mine = adj.rows.find(u => u.id === me.center);
        if (mine) out.center.push({ ind, num: mine.num, den: mine.den, obs: mine.obs, adj: mine.adj, p, n: units.length });
      }
    }
    return out;
  },

  async build(qu) {
    const regs = (await Data.registries()).filter(r => !r.archivedAt && National.props(r).length);
    const users = await Data.users();
    const parts = [];
    for (const reg of regs) { const r = await Feedback.registry(reg, qu, users); if (r.doctor.length || r.center.length) parts.push(r); }
    const pq = Feedback.prev(qu), prevParts = new Map();
    if (pq) for (const reg of regs) prevParts.set(reg.id, await Feedback.registry(reg, pq, users));
    return { qu, pq, parts, prevParts };
  },

  rows(list, prevList, small, who = 'Ваша доля') {
    const f = Feedback.pct;
    return `<table class="tbl"><thead><tr><th>Показатель</th><th>Случаев</th><th>Событий</th><th>${who}</th><th>95% ДИ</th><th>С поправкой на надёжность</th><th>Общая доля</th><th>Вывод</th><th>Прошлый квартал</th></tr></thead><tbody>${list.map(x => {
      const ci = Stats.wilson(x.num, x.den), v = Feedback.verdict(x.num, x.den, x.p, x.ind.lowerBetter), old = prevList?.find(y => y.ind.id === x.ind.id);
      return `<tr class="${x.den < small ? 'muted' : ''}"><td><b>${esc(x.ind.name)}</b>${x.den < small ? ' <span class="tag warnt">мало случаев</span>' : ''}</td><td>${x.den}</td><td>${x.num}</td><td>${f(x.obs)}</td><td>${f(ci.lo)}-${f(ci.hi)}</td><td>${x.adj == null ? '' : f(x.adj)}</td><td>${f(x.p)}</td><td class="${v.c}">${v.t}</td><td>${old ? `${f(old.obs)} (${old.num} из ${old.den})` : 'нет данных'}</td></tr>`;
    }).join('')}</tbody></table>`;
  },

  html(rep) {
    const { qu, pq, parts, prevParts } = rep;
    if (!parts.length) return `<p class="muted">За ${esc(qu.name)} нет ваших случаев в показателях регистров. Отчёт строится по показателям вида «доля», в форме которых есть поле с выбором врача.</p>`;
    return parts.map(r => {
      const small = National.minCell(r.reg), old = prevParts.get(r.reg.id);
      return `<section class="fb-reg"><h2>${esc(r.reg.name)}</h2>
        ${r.doctor.length ? `<h3>Ваши результаты</h3>${Feedback.rows(r.doctor, old?.doctor, small)}<p class="muted small">Сравнение с ${r.doctor[0].n} врачами регистра за тот же период.</p>` : ''}
        ${r.center.length ? `<h3>Учреждение: ${esc(Auth.user.center)}</h3>${Feedback.rows(r.center, old?.center, small, 'Доля учреждения')}<p class="muted small">Сравнение с ${r.center[0].n} учреждениями.</p>` : ''}</section>`;
    }).join('') + `<div class="card small"><b>Как читать.</b> Вывод «выше» или «ниже» ставится только если 95% доверительный интервал Уилсона не включает общую долю регистра; иначе разница может быть случайной. Оценка с поправкой на надёжность сдвигает долю к общей, когда случаев мало (Dimick, Staiger, Birkmeyer, Health Serv Res 2010). Поправки на тяжесть пациентов здесь нет, её показывает раздел «Модель риска».${pq ? ` Прошлый квартал: ${esc(pq.name)}.` : ''}</div>`;
  }
};

Routes.feedback = async (main, qid = '') => {
  const qs = Feedback.quarters(8);
  let qu = qs.find(x => x.id === qid) || qs[0], rep = null, note = '';
  /* без выбранного квартала показывается последний закрытый квартал, где есть ваши случаи */
  if (!qid) for (const x of qs) { const r = await Feedback.build(x); if (r.parts.length) { if (x.id !== qs[0].id) note = `За ${qs[0].name} ваших случаев нет, показан ${x.name}.`; qu = x; rep = r; break; } }
  main.innerHTML = `<div class="head"><h1>Отчёт обратной связи</h1><div class="row"><select class="inp" id="fbQ" aria-label="Квартал">${qs.map(x => `<option value="${x.id}" ${x.id === qu.id ? 'selected' : ''}>${x.name}</option>`).join('')}</select><button class="btn" id="fbSave">Сохранить отчёт</button></div></div>
    <div class="card"><p>Каждый квартал отчёт собирается автоматически: после окончания квартала приходит уведомление. В отчёте ваши показатели за квартал рядом с общими по регистру${Feedback.forCenter() ? ' и показатели вашего учреждения среди других учреждений' : ''}.</p></div>
    <div id="fbBody"><p class="muted">Собираю отчёт…</p></div>`;
  $('#fbQ', main).onchange = e => go('feedback/' + e.target.value);
  if (!rep) rep = await Feedback.build(qu);
  const box = $('#fbBody', main); if (!box) return;
  box.innerHTML = (note ? `<p class="muted">${esc(note)}</p>` : '') + Feedback.html(rep);
  if (!qid || qu.id === qs[0].id) { Feedback.markSeen(qs[0].id); if (typeof Bell === 'object') Bell.refresh(); }
  $('#fbSave', main).onclick = () => download(`Отчёт обратной связи ${qu.name}.html`, `<!doctype html><meta charset="utf-8"><title>Отчёт обратной связи ${esc(qu.name)}</title><style>body{font-family:Arial,sans-serif;margin:24px;color:#1b2340}table{border-collapse:collapse;width:100%;margin:8px 0}td,th{border-bottom:1px solid #dde;padding:5px 7px;text-align:left;font-size:13px}.bad{color:#b42318}.ok{color:#18794e}.muted{color:#667}.tag{font-size:11px;border:1px solid #cc9;border-radius:6px;padding:0 4px}</style><h1>Отчёт обратной связи: ${esc(qu.name)}</h1><p>${esc(Auth.user.name || '')}${Auth.user.center ? ', ' + esc(Auth.user.center) : ''}. Сформирован ${fmtDate(today())}.</p>${Feedback.html(rep)}`, 'text/html');
};

ROUTE_GROUP.feedback = 'Работа';
NAV_ICONS.feedback = NAV_ICONS.feedback || NAV_ICONS.report || NAV_ICONS.me;
{
  const previous = navGroups;
  navGroups = async function () {
    const groups = await previous();
    if (!Feedback.forDoctor() && !Feedback.forCenter()) return groups;
    const target = groups.find(g => g.id === 'work') || groups.find(g => g.items);
    if (target?.items && !target.items.some(x => x && x.r === 'feedback')) target.items.push({ r: 'feedback', t: 'Отчёт обратной связи', i: '▣' });
    return groups;
  };
}
/* уведомление о готовом квартальном отчёте */
if (typeof Bell === 'object') {
  const previous = Bell.items.bind(Bell);
  Bell.items = async function () {
    const out = await previous();
    const qu = Feedback.quarters(1)[0];
    if ((Feedback.forDoctor() || Feedback.forCenter()) && Feedback.seen() !== qu.id) out.unshift({ k: 'warn', t: 'Готов отчёт обратной связи', s: qu.name, r: 'feedback' });
    return out;
  };
}
if (typeof TRAINING_CHAPTERS !== 'undefined' && typeof TrainingGuide === 'object') {
  const end = TRAINING_CHAPTERS.findIndex(c => c.id === 'end');
  TRAINING_CHAPTERS.splice(end < 0 ? TRAINING_CHAPTERS.length : end, 0,
    { id: 'feedback', name: 'Отчёт обратной связи', page: 'feedback', go: 'feedback', steps: [
      { t: '#fbQ', title: 'Квартальный отчёт', text: 'После окончания каждого квартала приходит уведомление о готовом отчёте. Здесь ваши показатели за квартал рядом с общими по регистру и с прошлым кварталом. «Выше» или «ниже» пишется только когда разница не объясняется случайностью.' }
    ] });
  TrainingGuide.steps = TRAINING_CHAPTERS.flatMap((chapter, c) => chapter.steps.map((step, i) => ({ ...step, chapter, c, i })));
}
