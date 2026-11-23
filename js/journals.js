/* AddAll 2.0: конструктор журналов (планировщик, МДГ, M&M, ротации, отделение, цели, публикации и любые свои)
   виды: таблица, доска (канбан), календарь, лента (диаграмма Ганта) */
'use strict';

const J = (key, label, type = 'text', extra = {}) => F(key, label, type, extra);
const JVIEWS = { table: 'Таблица', board: 'Доска', calendar: 'Календарь', timeline: 'Лента' };
const JTEMPLATES = {
  blank: { name: 'Пустой журнал', icon: '▦', color: '#3346B0', desc: '', fields: [J('title', 'Название', 'text', { required: true }), J('date', 'Дата', 'date'), J('status', 'Статус', 'select', { options: ['новое', 'в работе', 'готово'] })], titleKey: 'title', dateKey: 'date', groupKey: 'status', views: ['table', 'board', 'calendar'] },
  planner: { name: 'Планировщик', icon: '▣', color: '#3346B0', desc: 'Госпитализации и операции. Отдельно от регистра: запись на дату, план операции, статус.',
    fields: [J('patient', 'Пациент из регистра', 'patient'), J('fio', 'ФИО', 'text', { required: true }), J('adm', 'Дата поступления', 'date', { required: true }), J('opdate', 'Дата операции', 'date'), J('op', 'Планируемая операция'), J('surgeon', 'Хирург', 'user'), J('resident', 'Резидент'),
      J('status', 'Статус', 'select', { options: ['записан', 'поступил', 'прооперирован', 'выписан', 'отменён'], required: true }), J('dis', 'Дата выписки', 'date'), J('note', 'Примечание', 'textarea')],
    titleKey: 'fio', dateKey: 'adm', endKey: 'dis', groupKey: 'status', views: ['calendar', 'table', 'board'] },
  mdg: { name: 'МДГ', icon: '◎', color: '#0E7F7A', desc: 'Мультидисциплинарная группа: кто ждёт обсуждения и какие решения приняты.',
    fields: [J('patient', 'Пациент из регистра', 'patient'), J('fio', 'ФИО', 'text', { required: true }), J('date', 'Дата МДГ', 'date', { required: true }), J('stage', 'Статус', 'select', { options: ['ожидает обсуждения', 'обсуждён', 'решение выполняется', 'закрыт'], required: true }),
      J('dx', 'Диагноз'), J('question', 'Вопрос', 'textarea'), J('decision', 'Решение', 'textarea'), J('dtype', 'Тип решения', 'select', { options: ['операция', 'неоадъювантная терапия', 'адъювантная терапия', 'watch and wait', 'дообследование', 'системная терапия', 'паллиатив', 'наблюдение'] }), J('lead', 'Докладчик', 'user')],
    titleKey: 'fio', dateKey: 'date', groupKey: 'stage', views: ['table', 'board', 'calendar'] },
  mm: { name: 'M&M', icon: '⚠', color: '#C2410C', desc: 'Разборы осложнений и летальности (Morbidity & Mortality).',
    fields: [J('date', 'Дата разбора', 'date', { required: true }), J('patient', 'Пациент из регистра', 'patient'), J('fio', 'Пациент (ФИО)', 'text', { required: true }), J('kind', 'Тип случая', 'select', { options: ['осложнение', 'летальность', 'почти ошибка (near miss)', 'повторная операция'], required: true }),
      J('cd', 'Clavien-Dindo', 'select', { options: ['I', 'II', 'IIIa', 'IIIb', 'IVa', 'IVb', 'V'] }), J('what', 'Что произошло', 'textarea'), J('why', 'Анализ причин', 'textarea'), J('avoid', 'Предотвратимость', 'select', { options: ['предотвратимо', 'возможно предотвратимо', 'непредотвратимо'] }),
      J('lessons', 'Выводы и меры', 'textarea'), J('speaker', 'Докладчик', 'user'), J('status', 'Статус', 'select', { options: ['запланирован', 'разобран'], required: true })],
    titleKey: 'fio', dateKey: 'date', groupKey: 'status', views: ['table', 'board', 'calendar'] },
  rot: { name: 'Ротации', icon: '⇄', color: '#6B55D6', desc: 'Кто из резидентов и когда работает в отделении.',
    fields: [J('resident', 'Резидент', 'text', { required: true }), J('from', 'Начало', 'date', { required: true }), J('to', 'Окончание', 'date', { required: true }), J('status', 'Статус', 'select', { options: ['подтверждено', 'под вопросом'] }), J('year', 'Год обучения', 'select', { options: ['1', '2', '3', '4'] }), J('note', 'Примечание')],
    titleKey: 'resident', dateKey: 'from', endKey: 'to', groupKey: 'resident', views: ['timeline', 'table'] },
  ward: { name: 'Отделение', icon: '🛏', color: '#0E7F7A', desc: 'Монитор отделения: кто лежит, этап, контрольные анализы.',
    fields: [J('bed', 'Палата / койка'), J('patient', 'Пациент из регистра', 'patient'), J('fio', 'ФИО', 'text', { required: true }), J('adm', 'Поступил', 'date', { required: true }), J('opdate', 'Дата операции', 'date'), J('pod', 'Сутки после операции', 'calc', { formula: 'opdate ? days(opdate, today()) : null' }),
      J('phase', 'Этап', 'select', { options: ['до операции', 'после операции', 'реанимация', 'к выписке'], required: true }), J('crp', 'СРБ', 'number', { unit: 'мг/л' }), J('wbc', 'Лейкоциты', 'number', { unit: '×10⁹/л' }), J('note', 'Задачи на сегодня', 'textarea'), J('dis', 'Выписан', 'date')],
    titleKey: 'fio', dateKey: 'adm', endKey: 'dis', groupKey: 'phase', views: ['board', 'table'] },
  goals: { name: 'Цели команды', icon: '◉', color: '#067647', desc: 'Цели сектора: исследования, статьи, проекты.',
    fields: [J('goal', 'Цель', 'text', { required: true }), J('kind', 'Тип', 'select', { options: ['исследование', 'статья', 'доклад', 'проект', 'обучение'] }), J('due', 'Срок', 'date'), J('owner', 'Ответственный', 'user'), J('status', 'Статус', 'select', { options: ['план', 'в работе', 'выполнено'], required: true }), J('note', 'Комментарий', 'textarea')],
    titleKey: 'goal', dateKey: 'due', groupKey: 'status', views: ['board', 'table', 'calendar'] },
  pubs: { name: 'Публикации', icon: '❝', color: '#3647A8', desc: 'Статьи, тезисы и доклады сектора.',
    fields: [J('title', 'Название', 'text', { required: true }), J('authors', 'Авторы', 'textarea'), J('venue', 'Журнал / конференция'), J('year', 'Год', 'number'), J('kind', 'Тип', 'select', { options: ['статья', 'тезисы', 'доклад', 'глава', 'патент'] }), J('doi', 'DOI'), J('pmid', 'PMID'), J('status', 'Статус', 'select', { options: ['в работе', 'подана', 'на рецензии', 'принята', 'опубликована'] })],
    titleKey: 'title', groupKey: 'status', views: ['table', 'board'] }
};
const jReg = (j) => ({ id: 'j_' + j.id, eventTypes: [{ id: 'rec', sections: [{ title: j.name, fields: j.fields }] }], patientFields: [] });
const jEt = (j) => ({ id: 'rec', name: j.name, sections: [{ id: 's', title: j.name, fields: j.fields }] });

Routes.journals = async (main) => {
  const [js, recs] = await Promise.all([DB.all('journals'), DB.all('jrecs')]);
  main.innerHTML = `<div class="head"><div><h1>Журналы</h1><div class="sub">Свои журналы отделения без привязки к схеме регистра: планировщик, МДГ, M&M, ротации, монитор отделения, цели, публикации. Каждый журнал можно смотреть таблицей, доской, календарём или лентой.</div></div>${can('design') ? '<button class="btn primary" id="jNew">+ Журнал</button>' : ''}</div>
    ${js.length ? `<div class="cards">${js.map(j => `<div class="card reg" style="border-top:3px solid ${j.color}"><h3><a href="#journal/${j.id}">${esc(j.icon || '▦')} ${esc(j.name)}</a></h3><p class="muted">${esc(j.desc || '')}</p><div class="row between"><span>${recs.filter(r => r.journalId === j.id).length} записей</span><span class="muted">${(j.views || []).map(v => JVIEWS[v]).join(' · ')}</span></div></div>`).join('')}</div>` : emptyState('Журналов пока нет.', can('design') ? '<button class="btn primary" onclick="$(\'#jNew\').click()">Создать журнал</button>' : '')}`;
  if ($('#jNew')) $('#jNew').onclick = () => {
    const m = modal(`<h3>Новый журнал</h3><label class="flab">Шаблон</label><div class="tpls">${Object.entries(JTEMPLATES).map(([k, t], i) => `<label class="tpl"><input type="radio" name="jt" value="${k}" ${i === 0 ? 'checked' : ''}><b>${esc(t.icon)} ${esc(t.name)}</b><span class="muted">${esc(t.desc || 'Название, дата, статус. Остальное добавите сами.')}</span></label>`).join('')}</div><div class="row end"><button class="btn primary" id="jt_ok">Создать</button></div>`, { wide: true });
    $('#jt_ok', m).onclick = async () => { const t = clone(JTEMPLATES[$('input[name=jt]:checked', m).value]); const j = await DB.put('journals', { ...t, order: js.length }, 'создание журнала'); m.close(); go('journal/' + j.id); };
  };
};

Routes.journal = async (main, id, view) => {
  const j = await DB.get('journals', id); if (!j) return go('journals');
  const [all, users, patients] = await Promise.all([DB.all('jrecs'), Data.users(), Data.patients()]);
  window.__PTS = patients;
  if (view === 'settings') return journalSettings(main, j);
  const st = Routes.journal.st?.[id] || ((Routes.journal.st = Routes.journal.st || {})[id] = { view: (j.views || ['table'])[0], q: '', from: '', to: '', sort: null, month: today().slice(0, 7), gStart: addDays(today(), -60) });
  if (view && JVIEWS[view]) st.view = view;
  const recs = all.filter(r => r.journalId === id);
  const fld = (k) => j.fields.find(f => f.key === k);
  const val = (r, k) => { const f = fld(k); const v = r.data?.[k]; if (!f) return v; if (f.type === 'user') return users.find(u => u.id === v)?.name || ''; if (f.type === 'patient') { const p = patients.find(x => x.id === v); return p ? pname(p) : ''; } if (f.type === 'date') return fmtDate(v); return Array.isArray(v) ? v.join(', ') : v ?? ''; };
  const title = (r) => String(r.data?.[j.titleKey] ?? val(r, j.fields[0]?.key) ?? 'без названия') || 'без названия';
  const filtered = () => recs.filter(r => (!st.q || JSON.stringify(r.data).toLowerCase().includes(st.q.toLowerCase()) || title(r).toLowerCase().includes(st.q.toLowerCase())) && (!j.dateKey || ((!st.from || (r.data?.[j.dateKey] || '') >= st.from) && (!st.to || (r.data?.[j.dateKey] || '') <= st.to))));
  main.innerHTML = `<div class="head"><div><h1>${esc(j.icon || '')} ${esc(j.name)}</h1><div class="sub">${esc(j.desc || '')}</div></div>
    <div class="row"><div class="vseg">${(j.views || ['table']).map(v => `<button data-jv="${v}" class="${st.view === v ? 'on' : ''}">${JVIEWS[v]}</button>`).join('')}</div>
    <input class="inp" id="jq" placeholder="Поиск" value="${esc(st.q)}" style="width:180px"><button class="btn" id="jx">Excel</button>${can('design') ? `<a class="btn" href="#journal/${id}/settings">⚙ Настроить</a>` : ''}${can('enter') ? '<button class="btn primary" id="jadd">+ Добавить</button>' : ''}</div></div>
    ${j.dateKey ? `<div class="row" style="margin-bottom:12px"><span class="muted">${esc(fld(j.dateKey)?.label || 'Дата')}:</span><input class="inp" type="date" id="jf" value="${esc(st.from)}"> – <input class="inp" type="date" id="jt" value="${esc(st.to)}"><span class="muted" id="jcount"></span></div>` : ''}
    <div id="jbody"></div>`;
  const openRec = (r, preset) => recDialog(j, r || { journalId: id, data: { ...(preset || {}) } }, users, patients);
  const draw = () => {
    const list = filtered(); if ($('#jcount')) $('#jcount').textContent = `${list.length} из ${recs.length}`;
    const body = $('#jbody');
    if (st.view === 'table') {
      const cols = j.fields.filter(f => f.type !== 'textarea').slice(0, 9);
      let L = [...list]; if (st.sort) { const [k, dir] = st.sort; L.sort((a, b) => String(a.data?.[k] ?? '').localeCompare(String(b.data?.[k] ?? ''), 'ru', { numeric: true }) * dir); } else if (j.dateKey) L.sort((a, b) => String(b.data?.[j.dateKey] || '').localeCompare(String(a.data?.[j.dateKey] || '')));
      body.innerHTML = L.length ? `<table class="tbl hover"><thead><tr>${cols.map(c => `<th data-s="${c.key}" style="cursor:pointer">${esc(c.label)}${st.sort?.[0] === c.key ? (st.sort[1] > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead><tbody>${L.map(r => `<tr data-id="${r.id}">${cols.map(c => `<td>${c.type === 'patient' && r.data?.[c.key] ? `<a href="#patient/${r.data[c.key]}" onclick="event.stopPropagation()">${esc(val(r, c.key))}</a>` : esc(val(r, c.key))}</td>`).join('')}</tr>`).join('')}</tbody></table>` : emptyState('Здесь пока пусто.');
      $$('th[data-s]', body).forEach(th => th.onclick = () => { st.sort = [th.dataset.s, st.sort?.[0] === th.dataset.s ? -st.sort[1] : 1]; draw(); });
      $$('tr[data-id]', body).forEach(tr => tr.onclick = () => openRec(recs.find(x => x.id === tr.dataset.id)));
    }
    if (st.view === 'board') {
      const g = fld(j.groupKey); if (!g) { body.innerHTML = '<div class="card">Для доски выберите поле группировки в настройках журнала.</div>'; return; }
      const cols = g.type === 'user' ? users.map(u => ({ v: u.id, l: u.name })) : (g.options || []).map(o => ({ v: o, l: o }));
      cols.push({ v: '', l: 'без значения' });
      body.innerHTML = `<div class="board">${cols.map(c => { const L = list.filter(r => String(r.data?.[g.key] || '') === String(c.v)); if (!c.v && !L.length) return ''; return `<div class="bcol" data-v="${esc(c.v)}"><div class="bcol-h"><span>${esc(c.l)}</span><span class="muted">${L.length}</span></div>${L.map(r => `<div class="bcard" draggable="true" data-id="${r.id}"><b>${esc(title(r))}</b><span>${esc([j.dateKey && val(r, j.dateKey), ...j.fields.filter(f => ![j.titleKey, j.groupKey, j.dateKey].includes(f.key) && !isEmpty(r.data?.[f.key]) && f.type !== 'textarea').slice(0, 2).map(f => val(r, f.key))].filter(Boolean).join(' · '))}</span></div>`).join('')}</div>`; }).join('')}</div>`;
      $$('.bcard', body).forEach(c => { c.onclick = () => openRec(recs.find(x => x.id === c.dataset.id)); c.ondragstart = e => e.dataTransfer.setData('text/plain', c.dataset.id); });
      $$('.bcol', body).forEach(col => { col.ondragover = e => { e.preventDefault(); col.classList.add('over'); }; col.ondragleave = () => col.classList.remove('over');
        col.ondrop = async e => { e.preventDefault(); col.classList.remove('over'); if (!can('edit')) return toast('Нет права на правку', 'err'); const r = recs.find(x => x.id === e.dataTransfer.getData('text/plain')); if (!r) return; r.data[g.key] = col.dataset.v; await DB.put('jrecs', r, 'перемещение на доске'); draw(); }; });
    }
    if (st.view === 'calendar') {
      if (!j.dateKey) { body.innerHTML = '<div class="card">Для календаря выберите поле даты в настройках.</div>'; return; }
      const [y, mo] = st.month.split('-').map(Number); const first = new Date(y, mo - 1, 1); const start = addDays(`${y}-${String(mo).padStart(2, '0')}-01`, -((first.getDay() + 6) % 7));
      const cells = [...Array(42)].map((_, i) => addDays(start, i));
      body.innerHTML = `<div class="row" style="margin-bottom:8px"><button class="btn sm" id="cp">‹</button><b style="min-width:150px;text-align:center">${first.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</b><button class="btn sm" id="cn">›</button><button class="btn sm" id="ct">Сегодня</button><span class="muted small">«+» в дне добавляет запись на эту дату. Записи можно перетаскивать.</span></div>
        <div class="calg">${['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(d => `<div class="calh">${d}</div>`).join('')}${cells.map(d => `<div class="cald ${d.slice(0, 7) !== st.month ? 'out' : ''} ${d === today() ? 'today' : ''}" data-d="${d}"><span class="dn">${Number(d.slice(8))}</span>${can('enter') ? '<button class="plus" data-plus="' + d + '">+</button>' : ''}${list.filter(r => r.data?.[j.dateKey] === d).map(r => `<span class="ce" draggable="true" data-id="${r.id}" style="background:${j.color}22;color:${j.color}">${esc(title(r))}</span>`).join('')}</div>`).join('')}</div>`;
      $('#cp').onclick = () => { const d = new Date(y, mo - 2, 1); st.month = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); draw(); };
      $('#cn').onclick = () => { const d = new Date(y, mo, 1); st.month = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); draw(); };
      $('#ct').onclick = () => { st.month = today().slice(0, 7); draw(); };
      $$('.ce', body).forEach(c => { c.onclick = () => openRec(recs.find(x => x.id === c.dataset.id)); c.ondragstart = e => e.dataTransfer.setData('text/plain', c.dataset.id); });
      $$('[data-plus]', body).forEach(b => b.onclick = () => openRec(null, { [j.dateKey]: b.dataset.plus }));
      $$('.cald', body).forEach(c => { c.ondragover = e => e.preventDefault(); c.ondrop = async e => { e.preventDefault(); const r = recs.find(x => x.id === e.dataTransfer.getData('text/plain')); if (!r || !can('edit')) return; r.data[j.dateKey] = c.dataset.d; await DB.put('jrecs', r, 'перенос даты'); draw(); }; });
    }
    if (st.view === 'timeline') {
      if (!j.dateKey || !j.endKey) { body.innerHTML = '<div class="card">Для ленты нужны поля начала и окончания (настройки журнала).</div>'; return; }
      const from = st.gStart.slice(0, 7) + '-01', months = [...Array(12)].map((_, i) => { const d = new Date(from); d.setMonth(d.getMonth() + i); return d; });
      const t0 = new Date(from).getTime(), t1 = new Date(months[11].getFullYear(), months[11].getMonth() + 1, 1).getTime();
      const pos = (d) => Math.max(0, Math.min(100, (new Date(d).getTime() - t0) / (t1 - t0) * 100));
      const gk = j.groupKey || j.titleKey; const groups = [...new Set(list.map(r => String(val(r, gk) || '—')))].sort();
      const hue = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
      body.innerHTML = `<div class="row" style="margin-bottom:8px"><button class="btn sm" id="gp">‹</button><b>${months[0].toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })} – ${months[11].toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</b><button class="btn sm" id="gn">›</button>
        <span class="muted small">Сейчас: ${list.filter(r => r.data?.[j.dateKey] <= today() && (r.data?.[j.endKey] || '9') >= today()).map(r => esc(val(r, gk))).join(', ') || 'никого'}</span></div>
        <div class="gantt"><div class="gscale"><div></div><div class="gmon">${months.map(m => `<div>${m.toLocaleDateString('ru-RU', { month: 'short' })}<br>${m.getFullYear()}</div>`).join('')}</div></div>
        ${groups.map(g => `<div class="gr"><div class="gl">${esc(g)}</div><div class="gtrack">${today() >= from ? `<div class="gtoday" style="left:${pos(today())}%"></div>` : ''}${list.filter(r => String(val(r, gk) || '—') === g && r.data?.[j.dateKey]).map(r => { const a = pos(r.data[j.dateKey]), b = pos(r.data[j.endKey] || r.data[j.dateKey]); if (b <= 0 || a >= 100) return ''; const dd = daysBetween(r.data[j.dateKey], r.data[j.endKey] || r.data[j.dateKey]); return `<div class="gbar" data-id="${r.id}" style="left:${a}%;width:${Math.max(1.5, b - a)}%;background:hsl(${hue(g)} 65% 50%)" title="${esc(fmtDate(r.data[j.dateKey]))} – ${esc(fmtDate(r.data[j.endKey]))}">${Math.round(dd / 30.4) >= 1 ? Math.round(dd / 30.4) + ' мес' : dd + ' дн'}</div>`; }).join('')}</div></div>`).join('') || '<div class="bnone" style="padding:20px">Нет записей</div>'}</div>`;
      $('#gp').onclick = () => { st.gStart = addDays(st.gStart, -90); draw(); }; $('#gn').onclick = () => { st.gStart = addDays(st.gStart, 90); draw(); };
      $$('.gbar', body).forEach(b => b.onclick = () => openRec(recs.find(x => x.id === b.dataset.id)));
    }
  };
  draw();
  $$('[data-jv]', main).forEach(b => b.onclick = () => { st.view = b.dataset.jv; $$('[data-jv]', main).forEach(x => x.classList.toggle('on', x === b)); draw(); });
  $('#jq').oninput = e => { st.q = e.target.value; draw(); };
  if ($('#jf')) { $('#jf').onchange = e => { st.from = e.target.value; draw(); }; $('#jt').onchange = e => { st.to = e.target.value; draw(); }; }
  if ($('#jadd')) $('#jadd').onclick = () => openRec(null);
  $('#jx').onclick = () => Office.xlsx(slug(j.name) + '_' + today() + '.xlsx', j.name, [j.fields.map(f => f.label), ...filtered().map(r => j.fields.map(f => { const v = val(r, f.key); return v; }))]);
};

async function recDialog(j, r, users, patients) {
  const isNew = !r.id; const ro = !isNew && !can('edit');
  const m = modal(`<div class="evhead" style="border-color:${j.color}"><h2>${esc(j.name)}</h2><div class="muted">${isNew ? 'Новая запись' : 'Запись от ' + fmtDT(r.createdAt)}</div></div><div id="jrForm"></div>
    <div class="row between"><div>${!isNew && can('delete') ? '<button class="btn danger" id="jrDel">Удалить</button>' : ''}</div>${ro ? '' : '<button class="btn primary" id="jrOk">Сохранить</button>'}</div>`, { wide: true });
  window.__PTS = patients;
  const read = renderEventForm($('#jrForm', m), jReg(j), null, jEt(j), r.data || {}, (r.data?.[j.dateKey]) || today(), users);
  if (ro) $$('input,select,textarea', m).forEach(x => x.disabled = true);
  if ($('#jrOk', m)) $('#jrOk', m).onclick = async () => {
    const { data, all } = read(); const errs = validateEvent(jEt(j), all); if (errs.length) return toast(errs[0], 'err');
    r.data = data; r.patientId = data.patient || r.patientId || null; await DB.put('jrecs', r, isNew ? 'запись в журнал' : 'правка записи журнала'); m.close(); toast('Сохранено'); App.route();
  };
  if ($('#jrDel', m)) $('#jrDel', m).onclick = async () => { if (await confirmBox('Удалить запись?')) { await DB.del('jrecs', r.id); m.close(); App.route(); } };
}

function journalSettings(main, j) {
  let dirty = false;
  const draw = () => {
    const dates = j.fields.filter(f => f.type === 'date'), groups = j.fields.filter(f => ['select', 'user', 'text', 'yesno'].includes(f.type));
    main.innerHTML = `<div class="head"><div><a class="muted" href="#journal/${j.id}">← ${esc(j.name)}</a><h1>Настройка журнала</h1></div><div class="row"><button class="btn primary" id="jsS">Сохранить</button></div></div>
      <div class="card"><div class="grid">
        <div class="fld"><label class="flab">Название</label><input class="inp" id="js_n" value="${esc(j.name)}"></div>
        <div class="fld"><label class="flab">Значок</label><input class="inp" id="js_i" value="${esc(j.icon || '')}" maxlength="2"></div>
        <div class="fld"><label class="flab">Цвет</label><input class="inp" type="color" id="js_c" value="${esc(j.color || '#3346B0')}"></div>
        <div class="fld wide"><label class="flab">Описание</label><input class="inp" id="js_d" value="${esc(j.desc || '')}"></div>
        <div class="fld"><label class="flab">Заголовок записи</label><select class="inp" id="js_t">${j.fields.map(f => `<option value="${f.key}" ${j.titleKey === f.key ? 'selected' : ''}>${esc(f.label)}</option>`).join('')}</select></div>
        <div class="fld"><label class="flab">Дата (календарь, начало ленты)</label><select class="inp" id="js_dk"><option value="">нет</option>${dates.map(f => `<option value="${f.key}" ${j.dateKey === f.key ? 'selected' : ''}>${esc(f.label)}</option>`).join('')}</select></div>
        <div class="fld"><label class="flab">Окончание (лента)</label><select class="inp" id="js_ek"><option value="">нет</option>${dates.map(f => `<option value="${f.key}" ${j.endKey === f.key ? 'selected' : ''}>${esc(f.label)}</option>`).join('')}</select></div>
        <div class="fld"><label class="flab">Группировка (доска, строки ленты)</label><select class="inp" id="js_gk"><option value="">нет</option>${groups.map(f => `<option value="${f.key}" ${j.groupKey === f.key ? 'selected' : ''}>${esc(f.label)}</option>`).join('')}</select></div>
        <div class="fld wide"><label class="flab">Виды</label><div class="chips">${Object.entries(JVIEWS).map(([k, v]) => `<label class="chip"><input type="checkbox" data-view="${k}" ${(j.views || []).includes(k) ? 'checked' : ''}>${v}</label>`).join('')}</div></div>
      </div></div>
      <div class="card"><h3>Поля</h3><table class="tbl fields"><tbody>${j.fields.map((f, i) => `<tr><td><b>${esc(f.label)}</b>${f.required ? ' <i class="req">*</i>' : ''}<div class="muted mono">${esc(f.key)}</div></td><td>${esc(FIELD_TYPES[f.type] || f.type)}</td><td class="nowrap"><button class="btn xs" data-e="${i}">✎</button><button class="btn xs" data-u="${i}">↑</button><button class="btn xs danger" data-x="${i}">×</button></td></tr>`).join('')}</tbody></table><button class="btn sm" id="jsAdd">+ Поле</button></div>
      <div class="card"><button class="btn danger" id="jsDel">Удалить журнал</button></div>`;
    const rd = () => { Object.assign(j, { name: $('#js_n').value, icon: $('#js_i').value, color: $('#js_c').value, desc: $('#js_d').value, titleKey: $('#js_t').value, dateKey: $('#js_dk').value, endKey: $('#js_ek').value, groupKey: $('#js_gk').value, views: $$('[data-view]:checked').map(x => x.dataset.view) }); dirty = true; };
    $$('input,select', main).forEach(x => x.onchange = rd);
    $('#jsS').onclick = async () => { rd(); if (!j.views.length) j.views = ['table']; await DB.put('journals', j, 'настройка журнала'); toast('Сохранено'); go('journal/' + j.id); };
    $('#jsAdd').onclick = () => fieldDialog(jReg(j), jEt(j), null, f => { rd(); j.fields.push(f); draw(); });
    main.onclick = async e => { const d = e.target.dataset; if (d.e) fieldDialog(jReg(j), jEt(j), j.fields[d.e], f => { rd(); j.fields[d.e] = f; draw(); }); if (d.u && d.u > 0) { rd(); [j.fields[d.u - 1], j.fields[d.u]] = [j.fields[d.u], j.fields[d.u - 1]]; draw(); } if (d.x && await confirmBox('Удалить поле?')) { rd(); j.fields.splice(d.x, 1); draw(); } };
    $('#jsDel').onclick = async () => { const n = (await DB.all('jrecs')).filter(r => r.journalId === j.id).length; if (!(await confirmBox(`Удалить журнал «${j.name}»${n ? ` и ${n} записей` : ''}?`))) return; for (const r of (await DB.all('jrecs')).filter(r => r.journalId === j.id)) await DB.del('jrecs', r.id); await DB.del('journals', j.id); go('journals'); };
  };
  draw();
}
