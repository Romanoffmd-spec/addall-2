/* AddAll 2.0: клинические исследования (протокол, критерии, рандомизация, визиты, CONSORT) */
'use strict';

const Trials = {
  rnd(n) { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; },
  block(t) {
    const sum = t.arms.reduce((s, a) => s + a.ratio, 0);
    const sizes = t.blocks.filter(b => b % sum === 0); const size = sizes[this.rnd(sizes.length)] || sum;
    const out = []; t.arms.forEach(a => { for (let i = 0; i < a.ratio * size / sum; i++) out.push(a.name); });
    for (let i = out.length - 1; i > 0; i--) { const j = this.rnd(i + 1); [out[i], out[j]] = [out[j], out[i]]; }
    return out;
  },
  stratumValue(s, p, events, reg) {
    if (s.src === '_sex') return p.sex || '';
    if (s.src === '_center') return p.center || '';
    const [etId, key] = s.src.split('.');
    const et = etById(reg, etId); const e = events.filter(x => x.patientId === p.id && x.type === etId).sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
    if (!e || !et) return '';
    const v = computeValues(reg, p, et, e.data, e.date)[key]; return isEmpty(v) ? '' : String(v);
  },
  stratumOptions(s, reg) {
    if (s.src === '_sex') return ['М', 'Ж'];
    if (s.src === '_center') return centers();
    const [etId, key] = s.src.split('.'); const f = formFields(etById(reg, etId)).find(x => x.key === key);
    return f?.type === 'yesno' ? ['да', 'нет'] : f?.options || [];
  },
  async allocate(t, patient, stratumVals) {
    const key = t.strata.length ? stratumVals.join(' | ') : 'все';
    t.seq = t.seq || {}; t.ptr = t.ptr || {};
    t.seq[key] = t.seq[key] || []; t.ptr[key] = t.ptr[key] || 0;
    while (t.ptr[key] >= t.seq[key].length) t.seq[key].push(...this.block(t));
    const arm = t.seq[key][t.ptr[key]]; t.ptr[key]++;
    const all = (await DB.all('alloc')).filter(a => a.trialId === t.id);
    await DB.put('trials', t, 'рандомизация: продвижение последовательности');
    return DB.put('alloc', { trialId: t.id, patientId: patient.id, arm, stratum: key, date: today(), seqNo: all.length + 1, by: Auth.user.id }, 'рандомизация');
  }
};

Routes.trials = async (main, id, tab = 'participants') => {
  if (id) return trialPage(main, id, tab);
  const [trials, allocs, regs] = await Promise.all([DB.all('trials'), DB.all('alloc'), Data.registries()]);
  main.innerHTML = `<div class="head"><h1>Клинические исследования</h1>${can('trials') ? '<button class="btn primary" id="tNew">+ Исследование</button>' : ''}</div>
    ${trials.length ? `<div class="cards">${trials.map(t => { const n = allocs.filter(a => a.trialId === t.id).length; return `<div class="card reg"><h3><a href="#trials/${t.id}">${esc(t.acronym ? t.acronym + ': ' : '')}${esc(t.name)}</a></h3><p class="muted">${esc(regs.find(r => r.id === t.registryId)?.name || '')} · ${t.arms.map(a => esc(a.name)).join(' / ')}</p>
      <div class="bar"><i style="width:${t.target ? Math.min(100, n / t.target * 100) : 0}%;background:#3b6fd4"></i><span>${n}${t.target ? ' из ' + t.target : ''} рандомизировано</span></div><p><span class="tag">${esc(t.status || 'набор')}</span></p></div>`; }).join('')}</div>`
      : emptyState('Исследований пока нет. Здесь ведутся проспективные исследования с рандомизацией на базе регистра: критерии включения, блочная стратифицированная рандомизация со скрытым распределением, визиты с окнами, журнал скрининга и CONSORT.')}`;
  if ($('#tNew')) $('#tNew').onclick = () => trialDialog(null, regs);
};

function trialDialog(t, regs) {
  if (!regs.length) return toast('Сначала создайте регистр', 'err');
  const x = t ? clone(t) : { name: '', acronym: '', registryId: regs[0].id, arms: [{ name: 'Группа A', ratio: 1 }, { name: 'Группа B', ratio: 1 }], blocks: [4, 6], strata: [], inclusion: [], exclusion: [], visits: [], target: '', status: 'набор', design: 'открытое' };
  const locked = !!t?.seq && Object.keys(t.seq).length;
  const m = modal(`<h2>${t ? 'Протокол исследования' : 'Новое исследование'}</h2><div class="grid">
    <div class="fld wide"><label class="flab">Название</label><input class="inp" id="t_n" value="${esc(x.name)}"></div>
    <div class="fld"><label class="flab">Краткое название</label><input class="inp" id="t_a" value="${esc(x.acronym || '')}"></div>
    <div class="fld"><label class="flab">Регистр (источник данных)</label>${regSelect(regs, x.registryId, 't_r', false).replace('<select', `<select ${t ? 'disabled' : ''}`)}</div>
    <div class="fld"><label class="flab">Дизайн</label><select class="inp" id="t_d">${['открытое', 'слепое для оценщика исходов', 'двойное слепое'].map(d => `<option ${x.design === d ? 'selected' : ''}>${d}</option>`).join('')}</select></div>
    <div class="fld"><label class="flab">Целевая выборка</label><input class="inp" type="number" id="t_tg" value="${esc(x.target)}"></div>
    <div class="fld"><label class="flab">Статус</label><select class="inp" id="t_s">${['набор', 'набор приостановлен', 'набор завершён', 'закрыто'].map(d => `<option ${x.status === d ? 'selected' : ''}>${d}</option>`).join('')}</select></div>
    <div class="fld wide"><label class="flab">Группы (по строке: название : доля)</label><textarea class="inp mono" id="t_arms" rows="3" ${locked ? 'disabled' : ''}>${esc(x.arms.map(a => `${a.name} : ${a.ratio}`).join('\n'))}</textarea>${locked ? '<div class="help">После начала рандомизации группы и блоки менять нельзя.</div>' : ''}</div>
    <div class="fld"><label class="flab">Размеры блоков (через запятую)</label><input class="inp" id="t_b" value="${esc(x.blocks.join(', '))}" ${locked ? 'disabled' : ''}><div class="help">Должны делиться на сумму долей. Разные размеры скрывают последовательность.</div></div>
    <div class="fld wide"><label class="flab">Стратификация (до 3 факторов)</label><div class="chips" id="t_str"></div></div>
    <div class="fld wide"><label class="flab">Критерии включения (по строке; все должны быть «да»)</label><textarea class="inp" id="t_inc" rows="4">${esc(x.inclusion.join('\n'))}</textarea></div>
    <div class="fld wide"><label class="flab">Критерии исключения (по строке; все должны быть «нет»)</label><textarea class="inp" id="t_exc" rows="4">${esc(x.exclusion.join('\n'))}</textarea></div>
    <div class="fld wide"><label class="flab">Визиты (по строке: название ; день от рандомизации ; окно ± дней ; тип события регистра)</label><textarea class="inp mono" id="t_v" rows="5" placeholder="Исходный ; 0 ; 3 ; enrol&#10;Операция ; 84 ; 21 ; surgery&#10;30 дней после операции ; 114 ; 7 ; followup">${esc(x.visits.map(v => `${v.name} ; ${v.day} ; ${v.window} ; ${v.et || ''}`).join('\n'))}</textarea><div class="help" id="t_ets"></div></div>
    </div><div class="row end"><button class="btn primary" id="t_ok">Сохранить протокол</button></div>`, { wide: true });
  const drawStr = () => {
    const reg = regs.find(r => r.id === $('#t_r', m).value);
    const opts = [{ v: '_sex', l: 'Пол' }, ...(centers().length ? [{ v: '_center', l: 'Центр' }] : []), ...reg.eventTypes.flatMap(et => formFields(et).filter(f => ['select', 'yesno'].includes(f.type)).map(f => ({ v: et.id + '.' + f.key, l: et.name + ' › ' + f.label })))];
    $('#t_str', m).innerHTML = opts.map(o => `<label class="chip"><input type="checkbox" value="${o.v}" data-l="${esc(o.l)}" ${x.strata.some(s => s.src === o.v) ? 'checked' : ''} ${locked ? 'disabled' : ''}>${esc(o.l)}</label>`).join('');
    $('#t_ets', m).textContent = 'Коды типов событий: ' + reg.eventTypes.map(e => `${e.id} (${e.name})`).join(', ');
  };
  drawStr(); $('#t_r', m).onchange = drawStr;
  $('#t_ok', m).onclick = async () => {
    const lines = id => $('#' + id, m).value.split('\n').map(s => s.trim()).filter(Boolean);
    const arms = lines('t_arms').map(l => { const [n, r] = l.split(':'); return { name: n.trim(), ratio: Math.max(1, parseInt(r) || 1) }; });
    const blocks = $('#t_b', m).value.split(/[,; ]+/).map(Number).filter(n => n > 0);
    const sum = arms.reduce((s, a) => s + a.ratio, 0);
    if (!$('#t_n', m).value.trim() || arms.length < 2) return toast('Нужно название и минимум 2 группы', 'err');
    if (!blocks.some(b => b % sum === 0)) return toast(`Размер блока должен делиться на ${sum}`, 'err');
    const strata = $$('#t_str input:checked', m).slice(0, 3).map(i => ({ src: i.value, label: i.dataset.l }));
    const visits = lines('t_v').map(l => { const [n, d, w, e] = l.split(';').map(s => (s || '').trim()); return { name: n, day: Number(d) || 0, window: Number(w) || 0, et: e || '' }; });
    Object.assign(x, { name: $('#t_n', m).value.trim(), acronym: $('#t_a', m).value.trim(), registryId: $('#t_r', m).value, design: $('#t_d', m).value, target: $('#t_tg', m).value === '' ? '' : Number($('#t_tg', m).value), status: $('#t_s', m).value, inclusion: lines('t_inc'), exclusion: lines('t_exc'), visits });
    if (!locked) Object.assign(x, { arms, blocks: blocks.filter(b => b % sum === 0), strata });
    const s = await DB.put('trials', x, t ? 'изменение протокола' : 'создание исследования'); m.close(); toast('Сохранено'); go('trials/' + s.id);
  };
}

async function trialPage(main, id, tab) {
  const t = await DB.get('trials', id); if (!t) return go('trials');
  const [reg, patients, events, allocsAll, screenAll, users] = await Promise.all([DB.get('registries', t.registryId), Data.patients(t.registryId), Data.events(t.registryId), DB.all('alloc'), DB.all('screening'), Data.users()]);
  const allocs = allocsAll.filter(a => a.trialId === id).sort((a, b) => a.seqNo - b.seqNo), screen = screenAll.filter(s => s.trialId === id);
  const tabs = { participants: 'Участники', randomise: 'Скрининг и рандомизация', visits: 'Визиты', consort: 'CONSORT', protocol: 'Протокол' };
  main.innerHTML = `<div class="head"><div><a href="#trials" class="muted">← Все исследования</a><h1>${esc(t.acronym ? t.acronym + ': ' : '')}${esc(t.name)}</h1><div class="muted">${esc(t.design)} · ${t.arms.map(a => `${esc(a.name)} (${a.ratio})`).join(' : ')} · блоки ${t.blocks.join('/')} · ${t.strata.length ? 'страты: ' + t.strata.map(s => esc(s.label)).join(', ') : 'без стратификации'}</div></div>
    <div class="row"><span class="tag">${esc(t.status)}</span><b>${allocs.length}${t.target ? ' / ' + t.target : ''}</b></div></div>
    <div class="tabs">${Object.entries(tabs).map(([k, v]) => `<a href="#trials/${id}/${k}" class="${k === tab ? 'on' : ''}">${v}</a>`).join('')}</div><div id="tBody"></div>`;
  const body = $('#tBody');
  const visitStatus = (a) => (t.visits || []).map(v => {
    const due = addDays(a.date, v.day), lo = addDays(due, -v.window), hi = addDays(due, v.window);
    const ev = v.et ? events.find(e => e.patientId === a.patientId && e.type === v.et && e.date >= lo && e.date <= hi) : null;
    const late = v.et ? events.find(e => e.patientId === a.patientId && e.type === v.et && e.date > hi) : null;
    const st = ev ? 'в окне' : late ? 'вне окна' : today() > hi ? 'пропущен' : today() >= lo ? 'сейчас' : 'предстоит';
    return { v, due, lo, hi, st, ev };
  });
  const VC = { 'в окне': 'okt', 'вне окна': 'warnt', 'пропущен': 'badt', 'сейчас': 'nowt', 'предстоит': '' };

  if (tab === 'participants') {
    const byArm = {}; allocs.forEach(a => byArm[a.arm] = (byArm[a.arm] || 0) + 1);
    body.innerHTML = `<div class="tiles">${t.arms.map(a => `<div class="tile"><b>${byArm[a.name] || 0}</b><span>${esc(a.name)}</span></div>`).join('')}<div class="tile"><b>${screen.length}</b><span>прошли скрининг</span></div></div>
      ${allocs.length ? `<table class="tbl hover"><thead><tr><th>№</th><th>Пациент</th><th>Группа</th><th>Страта</th><th>Дата</th><th>Визиты</th></tr></thead><tbody>${allocs.map(a => { const p = patients.find(x => x.id === a.patientId); const vs = visitStatus(a);
        return `<tr data-id="${a.patientId}"><td>${a.seqNo}</td><td><b>${esc(p ? pname(p) : '?')}</b><div class="muted mono">${esc(p?.localId || '')}</div></td><td><b>${esc(a.arm)}</b></td><td class="muted">${esc(a.stratum)}</td><td>${fmtDate(a.date)}</td><td>${vs.map(x => `<span class="tag ${VC[x.st]}" title="${esc(x.v.name)}: ${fmtDate(x.lo)} – ${fmtDate(x.hi)}">${esc(x.v.name)}</span>`).join(' ')}</td></tr>`; }).join('')}</tbody></table>` : emptyState('Пока никто не рандомизирован.')}`;
    $$('tr[data-id]', body).forEach(tr => tr.onclick = () => go('patient/' + tr.dataset.id));
  }

  if (tab === 'randomise') {
    if (!can('randomise')) { body.innerHTML = '<div class="card err">Нет права на рандомизацию.</div>'; return; }
    if (t.status !== 'набор') { body.innerHTML = `<div class="card err">Статус исследования «${esc(t.status)}»: рандомизация закрыта.</div>`; return; }
    const free = patients.filter(p => !allocs.some(a => a.patientId === p.id));
    body.innerHTML = `<div class="card"><div class="fld"><label class="flab">Пациент из регистра «${esc(reg.name)}»</label><input class="inp" id="r_p" list="r_pl" placeholder="№ ИБ или ФИО"><datalist id="r_pl">${free.map(p => `<option value="${esc(p.localId)} · ${esc(pname(p))}">`).join('')}</datalist></div><div id="r_form"></div></div>`;
    $('#r_p').onchange = () => {
      const q = $('#r_p').value.split(' · ')[0].trim(); const p = free.find(x => x.localId === q); if (!p) return;
      if ($('#r_form').dataset.pid === p.id) return; $('#r_form').dataset.pid = p.id;
      const sv = t.strata.map(s => Trials.stratumValue(s, p, events, reg));
      $('#r_form').innerHTML = `<h3>${esc(pname(p))}, ${FX.age(p.birthDate)} лет</h3>
        <table class="tbl"><thead><tr><th>Критерий</th><th>Ответ</th></tr></thead><tbody>
        ${t.inclusion.map((c, i) => `<tr><td><b>Включение:</b> ${esc(c)}</td><td><div class="seg" data-crit="inc${i}"><label><input type="radio" name="inc${i}" value="да"><span>да</span></label><label><input type="radio" name="inc${i}" value="нет"><span>нет</span></label></div></td></tr>`).join('')}
        ${t.exclusion.map((c, i) => `<tr><td><b>Исключение:</b> ${esc(c)}</td><td><div class="seg" data-crit="exc${i}"><label><input type="radio" name="exc${i}" value="да"><span>да</span></label><label><input type="radio" name="exc${i}" value="нет"><span>нет</span></label></div></td></tr>`).join('')}
        <tr><td><b>Подписанное информированное согласие на исследование</b></td><td><div class="seg"><label><input type="radio" name="ic" value="да"><span>да</span></label><label><input type="radio" name="ic" value="нет"><span>нет</span></label></div></td></tr></tbody></table>
        ${t.strata.length ? `<h4>Страты</h4><div class="grid">${t.strata.map((s, i) => `<div class="fld"><label class="flab">${esc(s.label)}</label><select class="inp" data-st="${i}"><option value=""></option>${Trials.stratumOptions(s, reg).map(o => `<option ${sv[i] === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>${sv[i] ? '<div class="help">из данных регистра</div>' : '<div class="help bad">нет в регистре, выберите вручную</div>'}</div>`).join('')}</div>` : ''}
        <div class="row between"><span id="r_msg"></span><div class="row"><button class="btn" id="r_scr">Записать в журнал скрининга</button><button class="btn primary" id="r_go">⚖ Рандомизировать</button></div></div>`;
      const check = () => {
        const inc = t.inclusion.map((_, i) => $(`input[name=inc${i}]:checked`)?.value), exc = t.exclusion.map((_, i) => $(`input[name=exc${i}]:checked`)?.value), ic = $('input[name=ic]:checked')?.value;
        const reasons = []; inc.forEach((v, i) => { if (v !== 'да') reasons.push((v ? 'не выполнен' : 'не отмечен') + ': ' + t.inclusion[i]); }); exc.forEach((v, i) => { if (v !== 'нет') reasons.push((v ? 'есть' : 'не отмечен') + ': ' + t.exclusion[i]); }); if (ic !== 'да') reasons.push('нет согласия');
        const st = t.strata.map((_, i) => $(`[data-st="${i}"]`).value); if (st.some(v => !v)) reasons.push('не указаны страты');
        return { reasons, st, eligible: !reasons.length };
      };
      $('#r_form').onchange = () => { const c = check(); $('#r_msg').innerHTML = c.eligible ? '<b class="good">Подходит, можно рандомизировать</b>' : `<span class="bad">${esc(c.reasons.slice(0, 3).join('; '))}</span>`; $('#r_go').disabled = !c.eligible; };
      $('#r_go').disabled = true;
      $('#r_scr').onclick = async () => { const c = check(); await DB.put('screening', { trialId: id, patientId: p.id, date: today(), eligible: c.eligible, reasons: c.reasons, randomised: false }, 'скрининг'); toast('Записано в журнал скрининга'); App.route(); };
      $('#r_go').onclick = async () => {
        const c = check(); if (!c.eligible) return;
        if (!(await confirmBox(`Рандомизировать ${pname(p)}? Отменить распределение будет нельзя.`))) return;
        const a = await Trials.allocate(t, p, c.st);
        await DB.put('screening', { trialId: id, patientId: p.id, date: today(), eligible: true, reasons: [], randomised: true }, 'скрининг');
        modal(`<div style="text-align:center;padding:20px"><div class="muted">Пациент № ${a.seqNo}: ${esc(pname(p))}</div><h1 style="font-size:34px;margin:16px 0">${esc(a.arm)}</h1><div class="muted">Страта: ${esc(a.stratum)} · ${fmtDT(nowISO())} · ${esc(Auth.user.name)}</div></div>`, { onClose: () => App.route() });
      };
    };
  }

  if (tab === 'visits') {
    const rows = allocs.flatMap(a => visitStatus(a).map(x => ({ ...x, a }))).filter(x => ['сейчас', 'пропущен', 'предстоит'].includes(x.st)).sort((a, b) => a.lo.localeCompare(b.lo));
    body.innerHTML = rows.length ? `<table class="tbl hover"><thead><tr><th>Пациент</th><th>Группа</th><th>Визит</th><th>Окно</th><th>Статус</th></tr></thead><tbody>${rows.slice(0, 300).map(x => { const p = patients.find(y => y.id === x.a.patientId); return `<tr data-id="${x.a.patientId}"><td><b>${esc(p ? pname(p) : '?')}</b></td><td>${esc(x.a.arm)}</td><td>${esc(x.v.name)}${x.v.et ? ` <span class="muted">(${esc(etById(reg, x.v.et)?.name || x.v.et)})</span>` : ''}</td><td>${fmtDate(x.lo)} – ${fmtDate(x.hi)}</td><td><span class="tag ${VC[x.st]}">${esc(x.st)}</span></td></tr>`; }).join('')}</tbody></table>` : emptyState('Нет предстоящих или пропущенных визитов.');
    $$('tr[data-id]', body).forEach(tr => tr.onclick = () => go('patient/' + tr.dataset.id));
  }

  if (tab === 'consort') {
    const excl = screen.filter(s => !s.eligible), reasons = {}; excl.forEach(s => s.reasons.forEach(r => reasons[r] = (reasons[r] || 0) + 1));
    const lastV = (t.visits || []).slice(-1)[0];
    body.innerHTML = `<div class="consort">
      <div class="cbox">Прошли скрининг<br><b>${new Set(screen.map(s => s.patientId)).size}</b></div><div class="carrow">↓</div>
      <div class="crow"><div class="cbox">Рандомизировано<br><b>${allocs.length}</b></div><div class="cbox side">Исключены<br><b>${excl.length}</b>${Object.entries(reasons).map(([r, n]) => `<div class="small">${esc(r)}: ${n}</div>`).join('')}</div></div><div class="carrow">↓</div>
      <div class="crow">${t.arms.map(arm => { const A = allocs.filter(a => a.arm === arm.name); const done = lastV ? A.filter(a => visitStatus(a).slice(-1)[0]?.st === 'в окне').length : null; const miss = lastV ? A.filter(a => visitStatus(a).slice(-1)[0]?.st === 'пропущен').length : null;
        return `<div class="cbox">${esc(arm.name)}<br><b>${A.length}</b>${lastV ? `<div class="small">завершили «${esc(lastV.name)}»: ${done}</div><div class="small">потеряны / пропуск: ${miss}</div>` : ''}</div>`; }).join('')}</div></div>
      <p class="muted">Схема по CONSORT 2010. Причины исключения берутся из журнала скрининга.</p>`;
  }

  if (tab === 'protocol') {
    body.innerHTML = `<div class="card"><h3>Критерии включения</h3><ol>${t.inclusion.map(c => `<li>${esc(c)}</li>`).join('') || '<li class="muted">не заданы</li>'}</ol><h3>Критерии исключения</h3><ol>${t.exclusion.map(c => `<li>${esc(c)}</li>`).join('') || '<li class="muted">не заданы</li>'}</ol>
      <h3>Визиты</h3><table class="tbl small"><tbody>${(t.visits || []).map(v => `<tr><td><b>${esc(v.name)}</b></td><td>день ${v.day} ± ${v.window}</td><td>${esc(etById(reg, v.et)?.name || '')}</td></tr>`).join('') || '<tr><td class="muted">не заданы</td></tr>'}</tbody></table>
      <div class="row">${can('trials') ? '<button class="btn" id="tEdit">Изменить протокол</button>' : ''}${can('lock') ? '<button class="btn" id="tSeq">Экспорт последовательности (для статистика)</button>' : ''}<button class="btn" id="tAl">Экспорт распределения CSV</button></div>
      <p class="muted">Последовательность рандомизации скрыта от исследователей: следующее назначение неизвестно до момента рандомизации. Каждый экспорт записывается в журнал аудита.</p></div>`;
    if ($('#tEdit')) $('#tEdit').onclick = async () => trialDialog(t, await Data.registries());
    if ($('#tSeq')) $('#tSeq').onclick = async () => { if (!(await confirmBox('Экспорт раскроет будущие назначения. Продолжить?'))) return; const rows = Object.entries(t.seq || {}).flatMap(([k, arr]) => arr.map((a, i) => ({ k, i: i + 1, a, used: i < (t.ptr?.[k] || 0) ? 'да' : '' }))); download('sequence_' + slug(t.name) + '.csv', toCSV(rows, [{ key: 'k', label: 'Страта' }, { key: 'i', label: '№' }, { key: 'a', label: 'Группа' }, { key: 'used', label: 'Использовано' }]), 'text/csv'); await Audit.log('экспорт последовательности рандомизации', 'trials', t.id, null, null); };
    $('#tAl').onclick = async () => { download('allocation_' + slug(t.name) + '.csv', toCSV(allocs.map(a => ({ ...a, localId: patients.find(p => p.id === a.patientId)?.localId })), [{ key: 'seqNo', label: '№' }, { key: 'localId', label: 'local_id' }, { key: 'arm', label: 'Группа' }, { key: 'stratum', label: 'Страта' }, { key: 'date', label: 'Дата' }]), 'text/csv'); await Audit.log('экспорт распределения', 'trials', t.id, null, null); };
  }
}
