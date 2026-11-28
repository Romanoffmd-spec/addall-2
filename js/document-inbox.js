/* Review documents received by the SQLite server. */
'use strict';

const DocumentInbox = {
  labels: { waiting: 'Ожидает разбора', review: 'На проверку', error: 'Ошибка разбора', accepted: 'Принят', rejected: 'Отклонён' },

  available() { return !TRAIN && typeof NET !== 'undefined' && NET.on && ['admin', 'lead'].includes(Auth.user?.role); },

  async file(id) {
    const response = await fetch('api/intake/' + encodeURIComponent(id) + '/file', { headers: { Authorization: 'Bearer ' + NET.token() } });
    if (!response.ok) throw new Error('Исходный документ недоступен');
    return response.blob();
  },

  async openSource(evidence, patientId) {
    try {
      const attachment = evidence.fileId && await DB.get('files', evidence.fileId);
      const blob = evidence.intakeId ? await this.file(evidence.intakeId) : attachment?.patientId === patientId ? attachment.blob : null;
      if (!blob) return toast('Исходный документ недоступен', 'err');
      const url = URL.createObjectURL(blob);
      const box = modal('<h2>' + esc(evidence.fileName || 'Исходный документ') + '</h2><div class="intake-file"></div>',
        { full: true, onClose: () => URL.revokeObjectURL(url) });
      const target = $('.intake-file', box);
      if (blob.type === 'application/pdf' || /^image\/(png|jpe?g|webp)$/.test(blob.type)) {
        const element = document.createElement(blob.type === 'application/pdf' ? 'iframe' : 'img');
        element.title = 'Исходный документ';
        element.alt = evidence.fileName || 'Исходный документ';
        element.src = url + (evidence.page ? '#page=' + evidence.page : '');
        target.append(element);
      } else if (blob.type === 'text/plain') {
        const element = document.createElement('pre');
        element.textContent = await blob.text();
        target.append(element);
      }
      const link = document.createElement('a');
      link.href = url;
      link.download = evidence.fileName || 'document';
      link.className = 'btn';
      link.textContent = 'Скачать исходный файл';
      target.append(link);
    } catch (error) { toast(error.message, 'err'); }
  },

  /* ФИО, дата рождения и пол для новой карточки: ИИ читает их из документа, врач проверяет в окне карточки.
     Внешний сервис ИИ получает текст только после согласия; локальная модель без вопроса. */
  async patientFrom(document) {
    const text = document?.text || (document?.pages || []).join('\n');
    if (!text || typeof AI !== 'object' || !AI.ready()) return {};
    if (!AI.local() && !(await confirmBox('Заполнить ФИО, дату рождения и пол из документа? Текст документа уйдёт во внешний сервис ИИ.'))) return {};
    const fields = [F('lastName', 'Фамилия'), F('firstName', 'Имя'), F('middleName', 'Отчество'), F('birthDate', 'Дата рождения', 'date'), F('sex', 'Пол', 'select', { options: ['М', 'Ж'] })];
    try {
      const raw = AI.parse(await AI.call(AI.prompt('Карточка пациента', AI.schemaOf(fields, []), null), { text }));
      const { out } = AI.normalize(fields, [], raw.fields || {});
      if (Object.keys(out).length) toast('ФИО, дата рождения и пол заполнены из документа. Проверьте перед сохранением');
      return out;
    } catch (error) { return {}; }
  },

  async action(id, action, body) {
    try {
      await NET.call('POST', 'intake/' + id + '/' + action, body || {});
      toast(action === 'apply' ? 'Поля сохранены в черновиках событий' : 'Решение сохранено');
      if (location.hash === '#inbox') await Routes.inbox($('#main'));
      return true;
    } catch (error) { toast(error.message, 'err'); return false; }
  },

  upload(registries, filter, refresh) {
    const selectable = registries.filter(reg => !reg.archived && reg.centers.length);
    const box = modal(`<h2>Загрузить документы</h2>
      <form id="inBatchForm">
      <div class="grid">
        <div class="fld"><label class="flab" for="inUploadReg">Регистр</label><select class="inp" id="inUploadReg" required><option value="">Выберите регистр</option>
          ${selectable.map(reg => `<option value="${esc(reg.id)}">${esc(reg.name)}</option>`).join('')}</select></div>
        <div class="fld"><label class="flab" for="inUploadCenter">Учреждение</label><select class="inp" id="inUploadCenter" required></select></div>
        <div class="fld"><label class="flab" for="inUploadNumber">№ ИБ, если известен</label><input class="inp" id="inUploadNumber" maxlength="120"></div>
        <div class="fld"><label class="flab" for="inUploadEpisode">Внешний номер эпизода, если известен</label><input class="inp" id="inUploadEpisode" maxlength="120"></div>
      </div>
      <p class="muted">Номера относятся ко всем выбранным файлам. Для документов разных пациентов оставьте оба номера пустыми и укажите пациента при проверке каждого документа.</p>
      <div class="fld"><label class="flab" for="inUploadFiles">Файлы</label><input class="inp" type="file" id="inUploadFiles" multiple required accept=".txt,.docx,.pdf,.jpg,.jpeg,.png,.webp">
        <span class="muted small">До 20 файлов за раз, каждый до 25 МБ.</span></div>
      <button class="btn primary" id="inUploadStart" type="submit">Отправить на разбор</button>
      <div id="inUploadStatus" role="status" class="muted"></div><ul id="inUploadResults"></ul>
      </form>`);
    const form = $('#inBatchForm', box), regInput = $('#inUploadReg', box), centerInput = $('#inUploadCenter', box);
    const fileInput = $('#inUploadFiles', box), status = $('#inUploadStatus', box), results = $('#inUploadResults', box);
    const showCenters = () => {
      const reg = selectable.find(item => item.id === regInput.value);
      const centers = reg?.centers || [];
      centerInput.replaceChildren(new Option('Выберите учреждение', ''), ...centers.map(center => new Option(center)));
      centerInput.value = centers.includes(filter.center) ? filter.center : centers.length === 1 ? centers[0] : '';
    };
    regInput.value = selectable.some(reg => reg.id === filter.registryId) ? filter.registryId : selectable.length === 1 ? selectable[0].id : '';
    regInput.onchange = showCenters;
    showCenters();
    form.onsubmit = async event => {
      event.preventDefault();
      const files = [...fileInput.files];
      const patientNumber = $('#inUploadNumber', box).value.trim(), encounter = $('#inUploadEpisode', box).value.trim();
      if (encounter && !patientNumber) return toast('Для внешнего эпизода укажите № ИБ', 'err');
      if (files.length > 20) return toast('Выберите до 20 файлов за раз', 'err');
      const scope = { registryId: regInput.value, center: centerInput.value, patientNumber, encounter };
      const controls = [...form.elements];
      controls.forEach(control => { control.disabled = true; });
      results.replaceChildren();
      let newCount = 0, duplicates = 0, failures = 0;
      try {
        for (const [index, file] of files.entries()) {
          status.textContent = 'Загрузка ' + (index + 1) + ' из ' + files.length;
          const result = document.createElement('li');
          try {
            if (!file.size || file.size > 25 * 1024 * 1024) throw new Error('Размер файла должен быть от 1 байта до 25 МБ');
            const reply = await NET.call('POST', 'intake/upload', { ...scope, filename: file.name, base64: await AI.b64(file) });
            result.textContent = file.name + (reply.duplicate ? ' · уже в очереди или рассмотрен' : ' · в очереди');
            if (reply.duplicate) duplicates++;
            else newCount++;
          } catch (error) {
            result.className = 'warnt';
            result.textContent = file.name + ' · ' + (error.message || 'Не удалось загрузить');
            failures++;
          }
          results.append(result);
        }
        status.textContent = newCount + ' добавлено · ' + duplicates + ' уже было · ' + failures + ' с ошибкой';
        if (!failures) fileInput.value = '';
        if (newCount) await refresh();
      } finally { controls.forEach(control => { control.disabled = false; }); }
    };
  },

  async open(id, selectedPatient) {
    const item = await NET.call('GET', 'intake/' + id);
    const reg = await DB.get('registries', item.registryId);
    const [patients, events, users] = await Promise.all([Data.patients(reg.id), Data.events(reg.id), DB.all('users')]);
    const candidate = selectedPatient || (item.candidates.length === 1 ? item.candidates[0] : '');
    const list = patients.filter(patient => patient.center === item.center && (typeof visibleP !== 'function' || visibleP(patient))
      && (!item.patientNumber || String(patient.localId || '').trim().toUpperCase() === item.patientNumber.trim().toUpperCase()));
    const source = { fileName: item.filename, intakeId: item.id };
    const box = modal(`<h2>${esc(item.filename)}</h2><p class="muted">${esc(item.center)} · ${esc(reg.name)}${item.patientNumber ? ' · № ИБ ' + esc(item.patientNumber) : ''}${item.encounter ? ' · эпизод источника ' + esc(item.encounter) : ''}</p>
      ${item.previousId ? '<p class="warnt">Это новая редакция документа. Проверьте отличия от значений в регистре.</p>' : ''}
      <div class="row"><button class="btn" id="inOriginal">Открыть исходный файл</button></div>
      <div class="fld"><label class="flab" for="inPatient">Пациент, которому относится документ</label>
      <select class="inp" id="inPatient"><option value="">Выберите пациента</option>${list.map(patient => `<option value="${esc(patient.id)}" ${patient.id === candidate ? 'selected' : ''}>${esc(pname(patient))} · ${esc(patient.localId || 'без № ИБ')}</option>`).join('')}</select>
      <span class="muted small">${selectedPatient ? 'Карточка создана. Проверьте пациента перед сохранением.' : candidate ? 'Найдено совпадение по номеру и учреждению. Подтвердите его перед сохранением.' : 'Однозначного совпадения нет. Проверьте оригинал и выберите пациента.'}</span>
      ${!item.candidates.length && can('edit') && !reg.archivedAt ? '<button class="btn xs" id="inNewPatient" type="button">Создать карточку пациента</button>' : ''}</div>
      <div class="intake-columns"><section><h3>Текст документа</h3><div id="inText" class="intake-text"></div></section>
      <section><h3>Поля регистра</h3><div id="inForms"></div></section></div>
      <div class="row between"><button class="btn" id="inReject">Отклонить документ</button><button class="btn primary" id="inApply">Сохранить выбранные поля</button></div>`, { full: true });
    $('#inOriginal', box).onclick = () => this.openSource(source);
    const newPatient = $('#inNewPatient', box);
    if (newPatient) newPatient.onclick = async () => patientDialog(null, [reg], reg.id, {
      center: item.center, patientNumber: item.patientNumber, prefill: await this.patientFrom(item.document), onCreated: async patientId => {
        box.close();
        await this.open(id, patientId);
      }
    });
    const text = $('#inText', box);
    const pages = item.document?.pages || [];
    text.innerHTML = pages.map((page, index) => `<section data-intake-page="${index + 1}"><b>Страница ${index + 1}${item.document.ocrPages?.includes(index + 1) ? ' · OCR' : ''}</b><pre>${esc(page)}</pre></section>`).join('')
      || '<p class="muted">Текст недоступен.</p>';
    const showQuote = (quote, page) => {
      const section = text.querySelector('[data-intake-page="' + (page || 1) + '"]');
      const pre = section?.querySelector('pre');
      if (!pre) return;
      for (const other of text.querySelectorAll('pre')) other.textContent = other.textContent;
      const content = pre.textContent, position = content.indexOf(quote);
      if (position >= 0) {
        const mark = document.createElement('mark');
        mark.textContent = quote;
        pre.replaceChildren(content.slice(0, position), mark, content.slice(position + quote.length));
        mark.scrollIntoView({ block: 'nearest' });
      } else section.scrollIntoView({ block: 'nearest' });
    };
    const proposals = (item.raw?.events || []).flatMap(proposal => {
      const form = etById(reg, proposal?.type);
      if (!form) return [];
      const fields = formFields(form).filter(field => field.type !== 'calc');
      const values = AI.normalize(fields, users, proposal.fields);
      const evidence = AI.fieldEvidence(values.out, proposal.evidence, source, item.document);
      const date = calendarDay(proposal.event_date);
      const dateSource = AI.fieldEvidence({ date }, { date: proposal.date_evidence }, source, item.document).date;
      return [{ form, fields, values, evidence, date, dateSource, original: proposal.fields || {} }];
    });
    const forms = $('#inForms', box);
    const patientInput = $('#inPatient', box);
    const serialize = value => typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
    const structured = new Set(['group', 'complist', 'multiselect']);
    const prepare = () => {
      const patient = list.find(record => record.id === patientInput.value);
      const own = events.filter(event => event.patientId === patient?.id);
      const episodes = Episodes.isPatient(reg) ? [] : Episodes.list(reg, own).filter(episode =>
        (episode.episodeCenter ?? item.center) === item.center);
      const bySource = item.encounter ? episodes.filter(episode => episode.externalEncounterId === item.encounter) : [];
      const availableEpisodes = item.encounter && bySource.length ? bySource : item.encounter ? episodes.filter(episode => !episode.externalEncounterId) : episodes;
      forms.innerHTML = (item.raw?.warnings?.length ? '<p class="warnt">' + esc(item.raw.warnings.join(' · ')) + '</p>' : '')
        + proposals.map((proposal, index) => {
          const { form, date, dateSource, fields, original, values, evidence } = proposal;
          const isOpener = form.id === Episodes.opener(reg);
          const eligible = own.filter(event => event.type === form.id && (event.episodeCenter ?? item.center) === item.center);
          const exact = item.encounter ? eligible.filter(event => event.externalEncounterId === item.encounter) : [];
          const same = isOpener && exact.length ? exact : eligible.filter(event => (form.single || event.date === date)
            && (!item.encounter || !event.externalEncounterId || event.externalEncounterId === item.encounter));
          const defaultAnchor = bySource.length === 1 ? bySource[0].id : !item.encounter && episodes.length === 1 ? episodes[0].id : '';
          const suggested = same.length === 1 && !same[0].locked
            && (!item.encounter || same[0].externalEncounterId === item.encounter) ? same[0] : null;
          const fieldRows = fields.filter(field => Object.hasOwn(original, field.key)).map(field => {
            const key = field.key, current = suggested?.data?.[key];
            const value = values.out[key] ?? original[key];
            const quote = evidence[key];
            const checked = quote?.verified && isEmpty(current) && Object.hasOwn(values.out, key);
            return `<div class="fld intake-proposal"><label class="chip"><input type="checkbox" data-in-take="${esc(key)}" ${checked ? 'checked' : ''}>${esc(field.label)}${field.required ? ' *' : ''}</label>
              <input class="inp" aria-label="${esc(field.label)}" data-in-value="${esc(key)}" value="${esc(serialize(value))}">
              ${!isEmpty(current) ? '<span class="muted small">Сейчас в регистре: ' + esc(serialize(current)) + '</span>' : ''}
              ${quote ? `<button class="btn xs" type="button" data-in-quote="${esc(quote.quote)}" data-in-page="${quote.page || 1}">${esc(quote.quote)}</button>` : '<span class="muted small">Цитата не подтверждена</span>'}</div>`;
          }).join('');
          return `<fieldset class="sec" data-in-event="${index}"><legend><label class="chip"><input type="checkbox" data-in-use checked>${esc(form.name)}</label></legend>
            <div class="fld"><label class="flab">${esc(form.dateLabel || 'Дата события')}<input class="inp" type="date" data-in-date value="${esc(date)}"></label>
            ${dateSource ? `<button class="btn xs" type="button" data-in-quote="${esc(dateSource.quote)}" data-in-page="${dateSource.page || 1}">${esc(dateSource.quote)}</button>` : '<span class="muted small">Проверьте дату в оригинале</span>'}</div>
            ${same.length ? `<div class="fld"><label>Запись в регистре<select class="inp" data-in-existing><option value="">Новая запись</option>${same.map(event => `<option value="${esc(event.id)}" ${event.locked ? 'disabled' : ''} ${suggested?.id === event.id ? 'selected' : ''}>${esc(fmtDate(event.date))} · ${esc(event.status)}${event.locked ? ' · заблокировано' : ''}</option>`).join('')}</select></label></div>` : ''}
            ${!isOpener && availableEpisodes.length ? `<div class="fld"><label>Эпизод<select class="inp" data-in-anchor><option value="">Выберите эпизод</option>
              ${availableEpisodes.map((episode, i) => `<option value="${esc(episode.id)}" ${(suggested?.anchorEventId || defaultAnchor) === episode.id ? 'selected' : ''}>${esc(Episodes.title(reg, episode, i))}${episode.externalEncounterId ? ' · ' + esc(episode.externalEncounterId) : ''}</option>`).join('')}</select></label></div>` : ''}
            ${fieldRows || '<p class="muted">Поля не предложены.</p>'}
            ${values.skipped.length ? '<p class="warnt">' + esc(values.skipped.join(' · ')) + '</p>' : ''}</fieldset>`;
        }).join('');
      if (!proposals.length) forms.innerHTML += '<p class="muted">События не найдены. Проверьте оригинал или отклоните документ.</p>';
      $$('[data-in-quote]', forms).forEach(button => button.onclick = () => showQuote(button.dataset.inQuote, button.dataset.inPage));
    };
    patientInput.onchange = prepare;
    prepare();
    $('#inReject', box).onclick = async () => {
      const reason = await promptBox('Почему документ отклонён?');
      if (reason && await this.action(id, 'reject', { reason })) box.close();
    };
    const button = $('#inApply', box);
    button.onclick = async () => {
      const patient = list.find(record => record.id === patientInput.value);
      if (!patient) return toast('Выберите пациента', 'err');
      const records = [];
      for (const fieldset of $$('[data-in-event]', forms)) {
        if (!$('[data-in-use]', fieldset).checked) continue;
        const proposal = proposals[Number(fieldset.dataset.inEvent)];
        const date = calendarDay($('[data-in-date]', fieldset).value);
        if (!date) return toast('Укажите дату для формы «' + proposal.form.name + '»', 'err');
        const anchorInput = $('[data-in-anchor]', fieldset);
        if (anchorInput && !anchorInput.value) return toast('Выберите эпизод для формы «' + proposal.form.name + '»', 'err');
        const current = events.find(event => event.id === $('[data-in-existing]', fieldset)?.value);
        if (current && current.date !== date) return toast('Дата выбранной записи отличается. Проверьте эпизод и дату', 'err');
        const chosen = {};
        for (const checkbox of $$('[data-in-take]:checked', fieldset)) {
          const key = checkbox.dataset.inTake;
          const input = $$('[data-in-value]', fieldset).find(element => element.dataset.inValue === key);
          const field = proposal.fields.find(item => item.key === key);
          const value = input.value.trim();
          if (!value) return toast('Укажите значение или снимите выбор: ' + field.label, 'err');
          try { chosen[key] = structured.has(field.type) ? JSON.parse(value) : value; }
          catch (error) { return toast('Проверьте список: ' + field.label, 'err'); }
        }
        if (!Object.keys(chosen).length) continue;
        const { out, skipped } = AI.normalize(proposal.fields, users, chosen);
        if (skipped.length) return toast(skipped[0], 'err');
        const data = { ...current?.data, ...out };
        const aiEvidence = { ...AI.matchingEvidence(data, current?.aiEvidence), ...AI.matchingEvidence(out, proposal.evidence) };
        const dateEvidence = date === proposal.date ? proposal.dateSource : undefined;
        records.push({ id: current?.id, rev: current?.rev, type: proposal.form.id, date,
          anchorEventId: anchorInput?.value || current?.anchorEventId, data, aiEvidence, dateEvidence });
      }
      if (!records.length) return toast('Выберите хотя бы одно поле', 'err');
      button.disabled = true;
      if (await this.action(id, 'apply', { patientId: patient.id, records })) box.close();
      else button.disabled = false;
    };
  }
};

Routes.inbox = async main => {
  if (!DocumentInbox.available()) {
    main.innerHTML = '<div class="head"><h1>Документы из хранилища</h1></div><p>Очередь доступна координатору на сервере AddAll.</p>';
    return;
  }
  try {
    const filter = Routes.inbox.filter ||= { status: 'all', offset: 0 };
    const { rows, enabled, health, sources, registries, total, limit, offset } = await NET.call('GET', 'intake?' + new URLSearchParams(filter));
    const regById = new Map(registries.map(reg => [reg.id, reg]));
    const centers = [...new Set([...registries.flatMap(reg => reg.centers), ...sources.map(source => source.center)])].sort((a, b) => a.localeCompare(b));
    main.innerHTML = `<div class="head"><h1>Документы из хранилища</h1><div class="row"><button class="btn" id="inRefresh">Обновить</button>
      ${registries.some(reg => !reg.archived && reg.centers.length) ? '<button class="btn primary" id="inUpload">Загрузить документы</button>' : ''}</div></div>
      <div class="card"><p>В очередь поступают документы из общих папок и ручных загрузок. Документы из папок с автопилотом ИИ разбирает сам: находит или заводит пациента, распределяет по регистрам и сохраняет черновики с цитатами, а врач проверяет их по сводке «Сводка автозаполнения». Остальные документы, и те, что ИИ не смог разобрать сам, подтверждает координатор: пациента, эпизод и поля.</p>
      <div class="row"><label for="inState">Состояние</label><select id="inState" class="inp">
        <option value="all">Все</option><option value="pending">К обработке</option><option value="closed">Рассмотренные</option></select>
        <label for="inFilterReg">Регистр</label><select id="inFilterReg" class="inp"><option value="">Все регистры</option>
          ${registries.map(reg => `<option value="${esc(reg.id)}">${esc(reg.name)}</option>`).join('')}</select>
        <label for="inFilterCenter">Учреждение</label><select id="inFilterCenter" class="inp"><option value="">Все учреждения</option>
          ${centers.map(center => `<option value="${esc(center)}">${esc(center)}</option>`).join('')}</select>
        ${offset > 0 ? '<button class="btn xs" id="inPrev">Назад</button>' : ''}<span class="muted">${rows.length ? offset + 1 : 0}-${offset + rows.length} из ${total}</span>
        ${offset + limit < total ? '<button class="btn xs" id="inNext">Дальше</button>' : ''}</div>
      ${!enabled ? '<p class="muted">Общая папка ещё не подключена.</p>' : `<details ${sources.some(source => source.health) ? 'open' : ''}><summary>Общие папки</summary><ul>
        ${sources.map(source => `<li>${esc(source.name)} · ${esc(regById.get(source.registryId)?.name || source.registryId)} · ${esc(source.center)} · 
          ${source.health ? '<span class="warnt">' + esc(source.health) + '</span>' : source.lastScanAt ? 'Последняя проверка ' + fmtDT(source.lastScanAt) : 'Ожидает проверки'}</li>`).join('')}</ul></details>`}
      ${health ? '<p class="warnt">' + esc(health) + '</p>' : ''}</div>
      ${rows.length ? `<table class="tbl"><thead><tr><th>Документ</th><th>Учреждение</th><th>Поступил</th><th>Состояние</th><th></th></tr></thead><tbody>
      ${rows.map(item => `<tr><td>${esc(item.filename)}${item.previousId ? ' · новая версия' : ''}<div class="muted small">${esc(item.patientNumber || '')}</div></td>
        <td>${esc(item.center)}<div class="muted small">${esc(regById.get(item.registryId)?.name || item.registryId)} · ${esc(item.manual ? 'Загрузка' : item.sourceName || 'Общая папка')}</div></td><td>${fmtDT(item.receivedAt)}</td><td>${esc(item.status === 'accepted' && item.decidedBy === 'ai-intake' ? 'Добавлено ИИ' : DocumentInbox.labels[item.status] || item.status)}${item.newPatient ? ' · новая карточка' : ''}
          ${item.autoSummary?.added?.length ? '<div class="muted small">' + esc(item.autoSummary.added.map(x => x.name + ' (' + x.fields + ')').join(', ')) + ' · ждёт проверки врачом</div>' : ''}
          ${item.status === 'review' && item.autoNote ? '<div class="warnt small">ИИ не записал сам: ' + esc(item.autoNote) + '</div>' : ''}
          ${item.error || item.reason ? '<div class="muted small">' + esc(item.error || item.reason) + '</div>' : ''}</td>
        <td>${item.status === 'review' ? `<button class="btn primary xs" data-in-open="${item.id}">Проверить</button>` : ''}
        ${['error', 'review'].includes(item.status) ? `<button class="btn xs" data-in-retry="${item.id}">Повторить разбор</button>` : ''}
        ${item.patientId ? `<a class="btn xs" href="#patient/${esc(item.patientId)}">Карточка пациента</a>` : ''}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">В очереди пока нет документов.</p>'}`;
    $('#inState', main).value = filter.status;
    $('#inState', main).onchange = event => { filter.status = event.target.value; filter.offset = 0; Routes.inbox(main); };
    for (const [selector, key] of [['#inFilterReg', 'registryId'], ['#inFilterCenter', 'center']]) {
      const input = $(selector, main);
      input.value = filter[key] || '';
      input.onchange = () => { filter[key] = input.value; filter.offset = 0; Routes.inbox(main); };
    }
    const upload = $('#inUpload', main);
    if (upload) upload.onclick = () => DocumentInbox.upload(registries, filter, () => {
      if (location.hash !== '#inbox') return;
      filter.offset = 0;
      return Routes.inbox(main);
    });
    if ($('#inPrev', main)) $('#inPrev', main).onclick = () => { filter.offset = offset - limit; Routes.inbox(main); };
    if ($('#inNext', main)) $('#inNext', main).onclick = () => { filter.offset = offset + limit; Routes.inbox(main); };
    $('#inRefresh', main).onclick = () => Routes.inbox(main);
    $$('[data-in-open]', main).forEach(button => button.onclick = () => DocumentInbox.open(button.dataset.inOpen).catch(error => toast(error.message, 'err')));
    $$('[data-in-retry]', main).forEach(button => button.onclick = () => DocumentInbox.action(button.dataset.inRetry, 'retry'));
  } catch (error) { main.innerHTML = '<div class="head"><h1>Документы из хранилища</h1></div><p class="warnt">' + esc(error.message) + '</p>'; }
};
