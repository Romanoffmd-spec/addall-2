/* Quality and research flows on the SQLite server. */
'use strict';

Routes.registrywork = async (main, regId = '', mode = 'audit') => {
  const regs = await Data.registries();
  const reg = regs.find(item => item.id === regId) || regs[0];
  if (!reg || typeof NET === 'undefined' || !NET.on) {
    main.innerHTML = '<div class="head"><h1>Работа с качеством регистра</h1></div><p>Этот раздел доступен через сервер AddAll.</p>';
    return;
  }
  const modes = { audit: 'Проверка выборки', research: 'Данные для исследований', improvement: 'План улучшений', ...(['admin','lead'].includes(Auth.user.role) ? { transfer: 'Передача наблюдения' } : {}) };
  if (!Object.hasOwn(modes, mode)) mode = 'audit';
  const path = 'workflow/' + encodeURIComponent(reg.id) + '/' + mode;
  const manage = regManage(reg) && ['admin', 'lead'].includes(Auth.user.role);
  const state = { pending: 'ожидается', approved: 'одобрено', rejected: 'отклонено',
    open: 'новый', investigating: 'проверяется', action: 'план действий', resolved: 'закрыт' };
  const button = (label, labelId) => '<button class="btn xs" data-work-open="' + esc(labelId) + '">' + label + '</button>';
  const put = async (action, body) => {
    try { await NET.call('POST', path + '/' + action, body); toast('Сохранено'); App.route(); return true; }
    catch (error) { toast(error.message, 'err'); return false; }
  };
  main.innerHTML = `<div class="head"><h1>Работа с качеством регистра</h1>${regSelect(regs, reg.id, 'rwReg', false)}</div>
    <div class="tabs">${Object.entries(modes).map(([id, label]) => `<a class="${id === mode ? 'on' : ''}" href="#registrywork/${esc(reg.id)}/${id}">${label}</a>`).join('')}</div>
    <div id="rwBody" class="card"></div>`;
  $('#rwReg', main).onchange = event => go('registrywork/' + event.target.value + '/' + mode);
  const container = $('#rwBody', main);
  const result = await NET.call('GET', path);

  if (mode === 'audit') {
    const reviewers = manage ? (await Data.users()).filter(user => user.active !== false && ['admin', 'lead', 'monitor'].includes(user.role)) : [];
    container.innerHTML = `<h2>Проверка выборки</h2><p>Проверяющий заполняет выбранные поля по первичному документу. Значения регистра откроются после ответа.</p>
      ${manage ? '<button class="btn primary" id="rwNew">Создать выборку</button>' : ''}
      ${result.map(sample => {
        const fields = sample.cases.flatMap(test => test.results || []);
        const disagreements = fields.filter(field => !field.equal).length;
        return `<section class="sec"><b>${esc(etById(reg, sample.form)?.name || 'Выборка')}</b> · ${esc(sample.reviewerName)}
          <p>Проверено ${sample.cases.filter(test => test.completedAt).length} из ${sample.cases.length}. Расхождения ${disagreements} из ${fields.length} полей.</p>
          ${sample.cases.map(test => `<div class="row"><span>${fmtDate(test.date)} · ${test.completedAt ? 'проверено' : 'ожидается'}</span>
            ${test.completedAt || sample.reviewer === Auth.user.id ? button(test.completedAt ? 'Сравнить' : 'Проверить', sample.id + '/' + test.eventId) : ''}</div>`).join('')}</section>`;
      }).join('') || '<p class="muted">Выборок пока нет.</p>'}`;
    if ($('#rwNew', container)) $('#rwNew', container).onclick = () => {
      const box = modal(`<h3>Новая выборка</h3><label>Форма<select class="inp" id="rwForm">${reg.eventTypes.map(form => `<option value="${esc(form.id)}">${esc(form.name)}</option>`).join('')}</select></label>
        <label>Проверяющий<select class="inp" id="rwReviewer">${reviewers.map(user => `<option value="${esc(user.id)}">${esc(user.name)}</option>`).join('')}</select></label>
        <label>Размер выборки<input class="inp" id="rwCount" type="number" min="1" max="100" value="10"></label>
        <div id="rwFields"></div><button class="btn primary" id="rwSave">Назначить проверку</button>`);
      const draw = () => $('#rwFields', box).innerHTML = formFields(etById(reg, $('#rwForm', box).value)).filter(field => ['text', 'number', 'date', 'select', 'yesno'].includes(field.type))
        .map(field => `<label class="chip"><input type="checkbox" data-rw-field value="${esc(field.key)}" ${field.required ? 'checked' : ''}>${esc(field.label)}</label>`).join('');
      $('#rwForm', box).onchange = draw;
      draw();
      $('#rwSave', box).onclick = async () => {
        if (await put('new', { form: $('#rwForm', box).value, reviewer: $('#rwReviewer', box).value,
          count: Number($('#rwCount', box).value), fields: $$('[data-rw-field]:checked', box).map(input => input.value) })) box.close();
      };
    };
    $$('[data-work-open]', container).forEach(control => control.onclick = async () => {
      const [sampleId, eventId] = control.dataset.workOpen.split('/');
      const sample = result.find(item => item.id === sampleId), test = sample.cases.find(item => item.eventId === eventId);
      const patient = await DB.get('patients', test.patientId);
      const box = modal(`<h3>Проверка записи</h3><p>${esc(pname(patient))} · ${fmtDate(test.date)}</p>
        ${test.sourceId ? '<button class="btn" id="rwSource">Открыть документ</button>' : ''}
        ${test.fields.map((field, index) => {
          const row = test.results?.find(result => result.key === field.key);
          return `<div class="fld"><label class="flab">${esc(field.label)}</label>
            ${row ? '<p>Запись регистра: ' + esc(field.value ?? 'пусто') + ' · Проверяющий: ' + esc(row.review || 'пусто') + (row.equal ? ' · совпало' : ' · расхождение') + '</p>'
              : `<input class="inp" data-rw-value="${index}" placeholder="Пусто, если в источнике отсутствует">`}</div>`;
        }).join('')}${test.completedAt ? '' : '<button class="btn primary" id="rwSubmit">Сравнить с регистром</button>'}`);
      if ($('#rwSource', box)) $('#rwSource', box).onclick = () => DocumentInbox.openSource({ intakeId: test.sourceId, fileName: 'Первичный документ' });
      if ($('#rwSubmit', box)) $('#rwSubmit', box).onclick = async () => {
        const values = Object.fromEntries($$('[data-rw-value]', box).map(field => [test.fields[+field.dataset.rwValue].key, field.value]));
        if (await put('submit/' + sampleId, { eventId, values })) box.close();
      };
    });
  }

  if (mode === 'research') {
    container.innerHTML = `<h2>Данные для исследований</h2><p>Набор формируется из выбранной официальной версии отчёта. ФИО, местные номера, календарные даты и свободный текст в него не входят.</p>
      ${result.releases.length ? '<button class="btn primary" id="rwRequest">Запросить набор</button>' : '<p>Сначала выпустите официальный отчёт.</p>'}
      ${result.requests.map(item => `<section class="sec"><b>${esc(item.requesterName)}</b> · ${state[item.status]}
        <p>${esc(item.purpose)}</p>${item.reason ? '<p>' + esc(item.reason) + '</p>' : ''}
        ${item.status === 'approved' ? button('Скачать набор', item.id)
          : manage && item.requester !== Auth.user.id && item.status === 'pending' ? button('Рассмотреть', item.id) : ''}</section>`).join('')}`;
    if ($('#rwRequest', container)) $('#rwRequest', container).onclick = () => {
      const box = modal(`<h3>Заявка на исследовательский набор</h3><label>Версия отчёта<select class="inp" id="rwRelease">
        ${result.releases.map(item => `<option value="${esc(item.id)}">${fmtDate(item.from)} - ${fmtDate(item.to)} · v${item.version}</option>`).join('')}</select></label>
        <label>Цель<textarea class="inp" id="rwPurpose" maxlength="1500"></textarea></label><button class="btn primary" id="rwSend">Отправить заявку</button>`);
      $('#rwSend', box).onclick = async () => { if (await put('new', { release: $('#rwRelease', box).value, purpose: $('#rwPurpose', box).value })) box.close(); };
    };
    $$('[data-work-open]', container).forEach(control => control.onclick = async () => {
      const item = result.requests.find(row => row.id === control.dataset.workOpen);
      try {
        if (item.status === 'approved') {
          const dataset = await NET.call('GET', path + '/export/' + item.id);
          return download('addall-study-v' + dataset.version + '.json', JSON.stringify(dataset, null, 2), 'application/json');
        }
        const box = modal('<h3>Решение по заявке</h3><select class="inp" id="rwDecision"><option value="approved">Одобрить</option><option value="rejected">Отклонить</option></select><textarea class="inp" id="rwReason" aria-label="Основание решения"></textarea><button class="btn primary" id="rwSave">Сохранить</button>');
        $('#rwSave', box).onclick = async () => { if (await put('decide/' + item.id, { status: $('#rwDecision', box).value, reason: $('#rwReason', box).value })) box.close(); };
      } catch (error) { toast(error.message, 'err'); }
    });
  }

  if (mode === 'transfer') {
    const patients = (await Data.patients(reg.id)).filter(patient => Auth.user.role === 'admin'
      || (patient.followupCenter || patient.center) === Auth.user.center);
    container.innerHTML = `<h2>Передача наблюдения</h2><p>После согласия принимающего учреждения оно сможет продолжить наблюдение. Учреждение прежних случаев сохранится.</p>
      <button class="btn primary" id="rwTransfer">Передать наблюдение</button>
      ${result.map(item => `<section class="sec"><b>${esc(item.from)} → ${esc(item.to)}</b> · ${item.status === 'accepted' ? 'принято' : state[item.status]}
        ${item.patientId ? `<a href="#patient/${esc(item.patientId)}">${esc(item.label)}</a>` : ''}
        ${item.status === 'pending' && (Auth.user.center === item.to || Auth.user.role === 'admin') ? button('Рассмотреть', item.id) : ''}</section>`).join('')}`;
    $('#rwTransfer', container).onclick = () => {
      const box = modal(`<h3>Передать наблюдение</h3><label>Пациент<select class="inp" id="rwPatient">
        ${patients.map(patient => `<option value="${esc(patient.id)}">${esc(pname(patient))} · ${esc(patient.localId)}</option>`).join('')}</select></label>
        <label>Принимающее учреждение<select class="inp" id="rwTo">${centers().map(name => `<option>${esc(name)}</option>`).join('')}</select></label>
        <label>Причина<textarea class="inp" maxlength="400" id="rwWhyTransfer"></textarea></label><button class="btn primary" id="rwSave">Сохранить запрос</button>`);
      $('#rwSave', box).onclick = async () => {
        if (await put('new', { patientId: $('#rwPatient', box).value, to: $('#rwTo', box).value, reason: $('#rwWhyTransfer', box).value })) box.close();
      };
    };
    $$('[data-work-open]', container).forEach(control => control.onclick = () => {
      const item = result.find(row => row.id === control.dataset.workOpen);
      const box = modal(`<h3>Решение по передаче</h3><p>${esc(item.from)} → ${esc(item.to)}</p><p>${esc(item.reason)}</p>
        <label>Решение<select class="inp" id="rwTransferDecision"><option value="accepted">Принять наблюдение</option><option value="rejected">Отклонить</option></select></label>
        <label>Комментарий<textarea class="inp" id="rwTransferNote"></textarea></label><button class="btn primary" id="rwSave">Сохранить</button>`);
      $('#rwSave', box).onclick = async () => {
        if (await put('decide/' + item.id, { status: $('#rwTransferDecision', box).value, reason: $('#rwTransferNote', box).value })) box.close();
      };
    });
  }

  if (mode === 'improvement') {
    container.innerHTML = `<h2>План улучшений</h2><p>Откройте разбор показателя, назначьте ответственного и сохраните план повторного измерения.</p>
      ${manage ? '<button class="btn primary" id="rwCase">Открыть разбор</button>' : ''}
      ${result.map(item => `<section class="sec"><b>${esc(item.title)}</b> · ${esc(item.center)} · ${state[item.status]}
        <p>${esc(item.owner)}${item.deadline ? ' · до ' + fmtDate(item.deadline) : ''}</p><p>${esc(item.plan || '')}</p>
        ${manage ? button('Обновить', item.id) : ''}</section>`).join('')}`;
    const edit = (item = {}) => {
      const input = (key, label, type = 'text') => `<label>${label}<input class="inp" id="rw_${key}" type="${type}" value="${esc(item[key] || '')}"></label>`;
      const box = modal(`<h3>Разбор показателя</h3>${input('title', 'Показатель или сигнал')}${input('center', 'Учреждение')}${input('owner', 'Ответственный')}
        ${input('deadline', 'Дата повторной проверки', 'date')}<label>Этап<select class="inp" id="rw_status">${['open', 'investigating', 'action', 'resolved']
          .map(id => `<option value="${id}" ${item.status === id ? 'selected' : ''}>${state[id]}</option>`).join('')}</select></label>
        <label>План или итог<textarea class="inp" id="rw_plan">${esc(item.plan || '')}</textarea></label><button class="btn primary" id="rwSave">Сохранить</button>`);
      $('#rwSave', box).onclick = async () => {
        const data = Object.fromEntries(['title', 'center', 'owner', 'deadline', 'status', 'plan'].map(key => [key, $('#rw_' + key, box).value]));
        if (await put('save' + (item.id ? '/' + item.id : ''), data)) box.close();
      };
    };
    if (manage) $('#rwCase', container).onclick = () => edit();
    $$('[data-work-open]', container).forEach(control => control.onclick = () => edit(result.find(item => item.id === control.dataset.workOpen)));
  }
};

ROUTE_GROUP.registrywork = 'Работа';
