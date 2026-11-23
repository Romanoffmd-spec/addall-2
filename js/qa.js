/* AddAll 2.0: запросы по данным (data queries), верификация (SDV), блокировка событий */
'use strict';

const QA = {
  async forEvent(evId) { return (await DB.all('queries')).filter(q => q.eventId === evId); },
  async raise(ev, f, patient) {
    const m = modal(`<h3>Запрос по полю «${esc(f.label)}»</h3><p class="muted">${esc(pname(patient))} · № ИБ ${esc(patient.localId)}</p>
      <div class="fld"><label class="flab">Вопрос к тому, кто вносил данные</label><textarea class="inp" id="q_t" rows="3" placeholder="Например: по протоколу операции кровопотеря 400 мл, в регистре 150. Уточните."></textarea></div>
      <div class="row">${['Проверьте значение', 'Значение не заполнено', 'Противоречит другому полю', 'Нет в первичной документации'].map(t => `<button class="btn xs" data-qt="${t}">${t}</button>`).join('')}</div>
      <div class="row end"><button class="btn primary" id="q_ok">Создать запрос</button></div>`);
    $$('[data-qt]', m).forEach(b => b.onclick = () => { $('#q_t', m).value = b.dataset.qt + '. '; $('#q_t', m).focus(); });
    return new Promise(res => {
      $('#q_ok', m).onclick = async () => {
        const t = $('#q_t', m).value.trim(); if (!t) return toast('Напишите вопрос', 'err');
        await DB.put('queries', { eventId: ev.id, patientId: ev.patientId, registryId: ev.registryId, fieldKey: f.key, fieldLabel: f.label, valueAtRaise: ev.data?.[f.key] ?? null, status: 'открыт', to: ev.createdBy || null, thread: [{ by: Auth.user.id, name: Auth.user.name, ts: nowISO(), text: t }] }, 'запрос по данным');
        m.close(); toast('Запрос создан'); res(true);
      };
    });
  },
  async reply(q, text, newStatus) {
    q.thread.push({ by: Auth.user.id, name: Auth.user.name, ts: nowISO(), text });
    q.status = newStatus || (q.status === 'открыт' ? 'отвечен' : q.status);
    if (q.status === 'закрыт') { q.closedBy = Auth.user.id; q.closedAt = nowISO(); }
    await DB.put('queries', q, 'ответ на запрос');
  },
  threadHTML(q, users) {
    return `<div class="qbox ${q.status === 'закрыт' ? 'closed' : ''}" data-q="${q.id}"><div class="row between"><b>⚑ ${esc(q.fieldLabel)}</b><span class="tag ${q.status === 'закрыт' ? 'okt' : q.status === 'отвечен' ? '' : 'warnt'}">${esc(q.status)}</span></div>
      ${q.thread.map(t => `<div class="qmsg"><b>${esc(t.name)}</b> <span class="muted">${fmtDT(t.ts)}</span><div>${esc(t.text)}</div></div>`).join('')}
      ${q.status !== 'закрыт' ? `<div class="row"><input class="inp" data-qr placeholder="Ответ или комментарий" style="flex:1"><button class="btn xs" data-qs="reply">Ответить</button>${can('query') ? '<button class="btn xs" data-qs="close">Закрыть</button>' : ''}</div>` : ''}</div>`;
  },
  bind(root, list, after) {
    root.querySelectorAll('[data-qs]').forEach(b => b.onclick = async () => {
      const box = b.closest('[data-q]'), q = list.find(x => x.id === box.dataset.q), txt = $('[data-qr]', box).value.trim();
      if (b.dataset.qs === 'reply' && !txt) return toast('Напишите ответ', 'err');
      await this.reply(q, txt || 'Закрыт после проверки', b.dataset.qs === 'close' ? 'закрыт' : (Auth.user.id === q.thread[0].by ? 'открыт' : 'отвечен'));
      after && after();
    });
  }
};

/* панель запросов, блокировки и верификации внутри окна события */
async function eventQA(m, p, reg, et, ev, refresh) {
  if (!ev.id) return;
  const users = await Data.users();
  let list = await QA.forEvent(ev.id);
  const draw = () => {
    /* отметки на полях */
    formFields(et).forEach(f => {
      const w = $(`[data-wrap="${f.key}"]`, m); if (!w) return;
      const open = list.filter(q => q.fieldKey === f.key && q.status !== 'закрыт');
      w.classList.toggle('has-query', !!open.length);
      const lab = $('.flab', w); $('.qflag', lab)?.remove();
      if (open.length || can('query')) lab.insertAdjacentHTML('beforeend', `<button type="button" class="qflag ${open.length ? 'on' : ''}" data-qf="${f.key}" title="${open.length ? 'Открытых запросов: ' + open.length : 'Создать запрос по полю'}">⚑${open.length ? open.length : ''}</button>`);
    });
    $('#evQA', m).innerHTML = list.length ? `<fieldset class="sec"><legend>Запросы по данным (${list.filter(q => q.status !== 'закрыт').length} открыто)</legend>${list.sort((a, b) => (a.status === 'закрыт') - (b.status === 'закрыт')).map(q => QA.threadHTML(q, users)).join('')}</fieldset>` : '';
    QA.bind($('#evQA', m), list, async () => { list = await QA.forEvent(ev.id); draw(); });
    $$('[data-qf]', m).forEach(b => b.onclick = async (e) => {
      e.preventDefault(); e.stopPropagation();
      const f = formFields(et).find(x => x.key === b.dataset.qf);
      const open = list.filter(q => q.fieldKey === f.key && q.status !== 'закрыт');
      if (open.length && !can('query')) { $('#evQA', m).scrollIntoView({ behavior: 'smooth' }); return; }
      if (await QA.raise(ev, f, p)) { list = await QA.forEvent(ev.id); draw(); }
    });
  };
  draw();
  /* верификация и блокировка */
  const bar = $('#evStatus', m);
  const st = () => { bar.innerHTML = `${ev.verified ? `<span class="tag okt" title="${esc(fmtDT(ev.verifiedAt))}">✓ проверено с первичной документацией</span>` : ''}${ev.locked ? `<span class="tag lockt">🔒 заблокировано</span>` : ''}
    ${can('query') ? `<button class="btn xs" id="evSDV">${ev.verified ? 'Снять отметку проверки' : '✓ Проверено (SDV)'}</button>` : ''}${can('lock') ? `<button class="btn xs" id="evLock">${ev.locked ? 'Разблокировать' : '🔒 Заблокировать'}</button>` : ''}`;
    if ($('#evSDV', m)) $('#evSDV', m).onclick = async () => { ev.verified = !ev.verified; ev.verifiedBy = Auth.user.id; ev.verifiedAt = nowISO(); await DB.put('events', ev, ev.verified ? 'верификация (SDV)' : 'снятие верификации'); st(); };
    if ($('#evLock', m)) $('#evLock', m).onclick = async () => {
      if (ev.locked) { const why = await promptBox('Причина разблокировки (попадёт в журнал аудита)'); if (!why) return; ev.locked = false; ev.unlockReason = why; await DB.put('events', ev, 'разблокировка: ' + why); m.close(); refresh(); }
      else { if (list.some(q => q.status !== 'закрыт') && !(await confirmBox('Есть открытые запросы. Всё равно заблокировать?'))) return; ev.locked = true; ev.lockedBy = Auth.user.id; ev.lockedAt = nowISO(); await DB.put('events', ev, 'блокировка'); m.close(); refresh(); }
    };
  };
  st();
}

/* страница всех запросов */
Routes.queries = async (main, tab = 'open') => {
  const [qs, patients, regs, users] = await Promise.all([DB.all('queries'), Data.patients(), Data.registries(), Data.users()]);
  const list = qs.filter(q => tab === 'all' ? true : tab === 'mine' ? q.to === Auth.user.id && q.status !== 'закрыт' : tab === 'closed' ? q.status === 'закрыт' : q.status !== 'закрыт').sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  const n = (f) => qs.filter(f).length;
  main.innerHTML = `<div class="head"><h1>Запросы по данным</h1></div>
    <div class="tiles"><div class="tile ${n(q => q.status === 'открыт') ? 'warn' : ''}"><b>${n(q => q.status === 'открыт')}</b><span>открыто, ждут ответа</span></div><div class="tile"><b>${n(q => q.status === 'отвечен')}</b><span>отвечено, ждут проверки</span></div><div class="tile"><b>${n(q => q.status === 'закрыт')}</b><span>закрыто</span></div><div class="tile"><b>${n(q => q.to === Auth.user.id && q.status !== 'закрыт')}</b><span>адресовано мне</span></div></div>
    <div class="tabs"><a href="#queries/open" class="${tab === 'open' ? 'on' : ''}">Активные</a><a href="#queries/mine" class="${tab === 'mine' ? 'on' : ''}">Мне</a><a href="#queries/closed" class="${tab === 'closed' ? 'on' : ''}">Закрытые</a><a href="#queries/all" class="${tab === 'all' ? 'on' : ''}">Все</a></div>
    ${list.length ? `<table class="tbl hover"><thead><tr><th>Пациент</th><th>Поле</th><th>Вопрос</th><th>Последнее</th><th>Статус</th></tr></thead><tbody>${list.map(q => { const p = patients.find(x => x.id === q.patientId); const last = q.thread[q.thread.length - 1];
      return `<tr data-id="${q.patientId}" data-ev="${q.eventId}"><td><b>${esc(p ? pname(p) : '?')}</b><div class="muted">${esc(regs.find(r => r.id === q.registryId)?.name || '')}</div></td><td><b>${esc(q.fieldLabel)}</b></td><td>${esc(q.thread[0].text)}<div class="muted">${esc(q.thread[0].name)}, ${fmtDT(q.thread[0].ts)}</div></td><td>${esc(last.text)}<div class="muted">${esc(last.name)}</div></td><td><span class="tag ${q.status === 'закрыт' ? 'okt' : q.status === 'отвечен' ? '' : 'warnt'}">${esc(q.status)}</span></td></tr>`; }).join('')}</tbody></table>` : emptyState('Запросов нет.')}
    <p class="muted">Запрос создаётся из окна события: значок ⚑ рядом с названием поля (роли: администратор, руководитель, монитор). Открывайте строку, чтобы перейти к событию.</p>`;
  $$('tr[data-id]', main).forEach(tr => tr.onclick = async () => { Routes.patient.openEvent = tr.dataset.ev; go('patient/' + tr.dataset.id); });
};
