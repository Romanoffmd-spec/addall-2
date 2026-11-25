/* AddAll 2.0: заполнение форм из документов с помощью ИИ */
'use strict';

const AI = {
  cfg() { return Settings.data.ai || { provider: 'none' }; },
  ready() { const c = this.cfg(); return c.provider && c.provider !== 'none'; },
  local() { return this.cfg().provider === 'ollama'; },

  /* ---------- чтение документов ---------- */
  async readFile(file) {
    const name = file.name.toLowerCase();
    if (name.endsWith('.txt') || name.endsWith('.csv') || name.endsWith('.md') || file.type.startsWith('text/')) return { text: await file.text() };
    if (name.endsWith('.docx')) return { text: await this.docxText(file) };
    if (name.endsWith('.pdf')) { const out = { pdf: await this.b64(file) }; try { out.pages = await this.pdfPages(file); out.text = out.pages.join('\n\n').trim(); } catch (e) { console.warn('pdf text', e); } return out; }
    if (file.type.startsWith('image/')) return { image: await this.b64(file), mime: file.type };
    throw new Error('Формат не поддерживается: используйте DOCX, TXT, PDF или фото документа');
  },
  /* текст из PDF локально (pdf.js), без отправки куда-либо */
  async pdfPages(file) {
    if (!window.pdfjsLib) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'lib/pdf.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    const lib = window.pdfjsLib; lib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';
    const pdf = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
    const pages = [];
    for (let i = 1; i <= Math.min(pdf.numPages, 60); i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      pages.push(content.items.map(item => item.str + (item.hasEOL ? '\n' : ' ')).join('').trim());
    }
    return pages;
  },
  b64(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(file); }); },
  /* DOCX = ZIP; достаём word/document.xml без внешних библиотек */
  async docxText(file) {
    const buf = new Uint8Array(await file.arrayBuffer()), dv = new DataView(buf.buffer);
    let eocd = -1; for (let i = buf.length - 22; i >= Math.max(0, buf.length - 70000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('Файл DOCX повреждён');
    let p = dv.getUint32(eocd + 16, true); const n = dv.getUint16(eocd + 10, true);
    for (let k = 0; k < n; k++) {
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), loc = dv.getUint32(p + 42, true);
      const fname = new TextDecoder().decode(buf.slice(p + 46, p + 46 + nlen));
      if (fname === 'word/document.xml') {
        const start = loc + 30 + dv.getUint16(loc + 26, true) + dv.getUint16(loc + 28, true);
        let data = buf.slice(start, start + csize);
        if (method === 8) data = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
        const xml = new TextDecoder().decode(data);
        return xml.replace(/<w:tab\/>/g, '\t').replace(/<\/w:p>/g, '\n').replace(/<w:br[^>]*\/>/g, '\n').replace(/<\/w:tc>/g, ' | ').replace(/<[^>]+>/g, '')
          .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/\n{3,}/g, '\n\n').trim();
      }
      p += 46 + nlen + elen + clen;
    }
    throw new Error('В DOCX не найден текст');
  },

  /* ---------- схема для модели ---------- */
  schemaOf(fields, users) { return DocumentSchema.fields(fields, users); },
  prompt(title, schema, dateLabel) {
    return `Ты помощник клинического регистра. Извлеки из медицинского документа значения для формы «${title}».
Правила:
- Заполняй поле только если значение прямо указано в документе или однозначно следует из текста. Не угадывай. Нет данных: не включай поле.
- Для полей с "allowed" используй строго одно из разрешённых значений (для multiselect массив из них).
- Даты в формате YYYY-MM-DD. Числа без единиц измерения.
- Для каждого заполненного поля дай короткую цитату-доказательство из документа (до 12 слов).
${dateLabel ? `- Отдельно определи дату события «${dateLabel}» (event_date), если она есть.` : ''}
Поля формы (JSON):
${JSON.stringify(schema)}
Ответ: только JSON без пояснений, формат:
{"event_date": "YYYY-MM-DD или null", "fields": {"код_поля": значение}, "evidence": {"код_поля": "цитата"}, "warnings": ["что вызвало сомнение"]}`;
  },

  /* ---------- вызов модели ---------- */
  async call(prompt, doc) {
    const c = this.cfg();
    if (c.provider === 'anthropic') {
      const content = [];
      if (doc.pdf) content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: doc.pdf } });
      if (doc.image) content.push({ type: 'image', source: { type: 'base64', media_type: doc.mime, data: doc.image } });
      content.push({ type: 'text', text: prompt + (doc.text && !doc.pdf ? '\n\nДОКУМЕНТ:\n' + doc.text : '') });
      const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': c.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: c.model || 'claude-sonnet-5-5', max_tokens: 4000, messages: [{ role: 'user', content }] }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error?.message || 'Ошибка API ' + r.status);
      return j.content.map(x => x.text || '').join('');
    }
    if (c.provider === 'ollama') {
      if (doc.pdf && !doc.text) throw new Error('В PDF нет текстового слоя (скан). Для локальной модели сохраните страницы как изображения или вставьте текст.');
      const msg = { role: 'user', content: prompt + (doc.text ? '\n\nДОКУМЕНТ:\n' + doc.text : '') }; if (doc.image) msg.images = [doc.image];
      const r = await fetch((c.url || 'http://localhost:11434').replace(/\/$/, '') + '/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: c.model || 'qwen2.5:7b', messages: [msg], stream: false, format: 'json',
        /* рассуждающие модели (Qwen3, DeepSeek-R1) без рассуждений отвечают в разы быстрее; окно 32 тыс. токенов, чтобы выписка не обрезалась */
        ...(/qwen3|deepseek-r1|magistral|gpt-oss/i.test(c.model || '') ? { think: false } : {}), options: { temperature: 0, num_ctx: Number(c.ctx) || 32768 } }) });
      if (!r.ok) throw new Error('Ollama: ' + r.status + ' ' + (await r.text()).slice(0, 200));
      return (await r.json()).message?.content || '';
    }
    if (c.provider === 'openai') {
      const content = [{ type: 'text', text: prompt + (doc.text ? '\n\nДОКУМЕНТ:\n' + doc.text : '') }];
      if (doc.image) content.push({ type: 'image_url', image_url: { url: `data:${doc.mime};base64,${doc.image}` } });
      if (doc.pdf && !doc.text) throw new Error('В PDF нет текстового слоя. Вставьте текст или фото.');
      const r = await fetch((c.url || '').replace(/\/$/, '') + '/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + (c.key || '') }, body: JSON.stringify({ model: c.model, temperature: 0, messages: [{ role: 'user', content }] }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error?.message || 'Ошибка API ' + r.status);
      return j.choices[0].message.content;
    }
    throw new Error('ИИ не настроен: «Пользователи и настройки» → «ИИ-ассистент»');
  },
  parse(txt) { const m = String(txt).match(/\{[\s\S]*\}/); if (!m) throw new Error('Модель не вернула JSON'); return JSON.parse(m[0]); },

  /* ---------- нормализация ответа под поля ---------- */
  normalize(fields, users, raw) {
    const out = {}, skipped = [];
    const byKey = new Map(fields.map(f => [f.key, f]));
    const normalized = value => String(value).trim().toLowerCase();
    const pickOpt = (options, value) => options?.find(option => normalized(option) === normalized(value));
    for (const [key, value] of Object.entries(raw || {})) {
      const field = byKey.get(key);
      if (!field || field.type === 'calc' || isEmpty(value)) continue;
      let result = value;
      switch (field.type) {
        case 'number':
          result = FX.num(value);
          if (result != null && (!validNumericStep(field, result) || (!isEmpty(field.min) && result < Number(field.min))
            || (!isEmpty(field.max) && result > Number(field.max)))) result = null;
          break;
        case 'date':
          result = calendarDay(value);
          break;
        case 'time':
          result = clinicalTime(value);
          break;
        case 'datetime':
          result = clinicalDateTime(value);
          break;
        case 'select':
          result = pickOpt(field.options, value);
          break;
        case 'multiselect': {
          const picks = [].concat(value).map(option => pickOpt(field.options, option));
          result = picks.every(option => option != null) ? [...new Set(picks)] : null;
          break;
        }
        case 'yesno':
          result = /^(да|yes|true|1)$/i.test(String(value)) ? 'да' : /^(нет|no|false|0)$/i.test(String(value)) ? 'нет'
            : /^(неизвестно|unknown)$/i.test(String(value)) ? 'неизвестно' : null;
          break;
        case 'user': {
          const matches = users.filter(user => user.active !== false && (user.id === value || normalized(user.name) === normalized(value)));
          result = matches.length === 1 ? matches[0].id : null;
          break;
        }
        case 'complist': {
          const entries = [].concat(value);
          if (entries.some(entry => !entry?.name || !CD_GRADES.includes(entry.grade) || (entry.date && !calendarDay(entry.date)))) {
            skipped.push(field.label + ': уточните степень и дату осложнений');
            continue;
          }
          result = entries.map(entry => ({ name: String(entry.name), grade: entry.grade, date: entry.date || '' }));
          break;
        }
        case 'text':
        case 'textarea':
          result = ['number', 'string'].includes(typeof value) ? String(value) : null;
          break;
      }
      if (isEmpty(result)) skipped.push(field.label + ': значение требует проверки');
      else Object.defineProperty(out, key, { value: result, enumerable: true, configurable: true, writable: true });
    }
    return { out, skipped };
  },

  eventDate: calendarDay,

  documentSource(doc, text, file) {
    return !text || text === doc.text?.trim() ? file : {};
  },

  fieldEvidence(values, quotes, source, doc = {}) {
    const simplify = text => String(text).normalize('NFKC').replace(/\s+/g, ' ').trim();
    const text = simplify(doc.text || '');
    const evidence = [];
    for (const [key, value] of Object.entries(values)) {
      const quote = quotes?.[key];
      if (typeof quote === 'string' && quote.trim()) {
        const excerpt = simplify(quote);
        if (text && !text.includes(excerpt)) continue;
        const page = doc.pages?.findIndex(pageText => simplify(pageText).includes(excerpt));
        evidence.push([key, { quote: quote.trim(), value, ...source, verified: !!text && !doc.ocrPages?.includes((page ?? -1) + 1), ...(source.fileName && page >= 0 ? { page: page + 1 } : {}) }]);
      }
    }
    return Object.fromEntries(evidence);
  },

  matchingEvidence(values, evidence) {
    return Object.fromEntries(Object.entries(evidence || {}).filter(([key, item]) =>
      item?.quote && Object.hasOwn(values, key) && JSON.stringify(values[key]) === JSON.stringify(item.value)));
  },

  /* ---------- окно «из документа» ---------- */
  dialog({ title, fields, users, dateLabel, onApply }) {
    if (!this.ready()) {
      const m = modal(`<h3>ИИ не настроен</h3><p>Чтобы заполнять формы из документов, подключите модель в разделе «Пользователи и настройки» → «ИИ-ассистент». Рекомендуется локальная модель (Ollama): данные пациентов не покидают компьютер.</p><div class="row end">${can('users') ? '<a class="btn primary" href="#admin">Открыть настройки</a>' : ''}</div>`);
      $('a', m)?.addEventListener('click', () => m.close()); return;
    }
    const m = modal(`<h2>Заполнить из документа</h2><p class="muted">${esc(title)}. Вставьте текст (выписка, протокол операции, гистология, МРТ) или загрузите файл: DOCX, TXT, PDF, фото. ${this.local() ? 'Модель локальная: данные не покидают компьютер.' : '<b class="bad">Внимание: документ уйдёт во внешний сервис ИИ. Удалите ФИО и номер ИБ из текста, если это не разрешено.</b>'}</p>
      <textarea class="inp" id="ai_t" rows="12" placeholder="Вставьте текст документа сюда"></textarea>
      <div class="row between"><div class="row"><input type="file" id="ai_f" accept=".docx,.txt,.pdf,image/*"><span class="muted" id="ai_fn"></span></div>
      <div class="row"><label class="chip"><input type="checkbox" id="ai_ow">перезаписывать уже заполненные поля</label><button class="btn primary" id="ai_go">Извлечь</button></div></div>
      <div id="ai_res"></div>`, { wide: true });
    let doc = {}, file = {};
    $('#ai_f', m).onchange = async e => {
      const selected = e.target.files[0];
      if (!selected) return;
      try {
        doc = await this.readFile(selected);
        file = { fileName: selected.name };
        $('#ai_t', m).value = doc.text || '';
        $('#ai_fn', m).textContent = doc.pdf ? 'PDF загружен' : doc.image ? 'Изображение загружено' : 'Текст извлечён';
      } catch (error) { toast(error.message, 'err'); }
    };
    $('#ai_go', m).onclick = async () => {
      const text = $('#ai_t', m).value.trim(); const d = { ...doc, text: text || doc.text };
      if (!d.text && !d.pdf && !d.image) return toast('Вставьте текст или загрузите файл', 'err');
      const btn = $('#ai_go', m); btn.disabled = true; btn.textContent = 'ИИ читает документ…';
      try {
        const raw = this.parse(await this.call(this.prompt(title, this.schemaOf(fields, users), dateLabel), d));
        const { out, skipped } = this.normalize(fields, users, raw.fields);
        const date = dateLabel ? this.eventDate(raw.event_date) : '';
        const source = this.documentSource(doc, text, file);
        const evidence = this.fieldEvidence(out, raw.evidence, source, { text: d.text, pages: source.fileName ? d.pages : null });
        const keys = Object.keys(out);
        $('#ai_res', m).innerHTML = `<h3>Найдено полей: ${keys.length}</h3><table class="tbl small"><tbody>${dateLabel ? `<tr><td><b>${esc(dateLabel)}</b></td><td>${date ? fmtDate(date) : 'Дата не найдена'}</td><td></td></tr>` : ''}${keys.map(k => { const f = fields.find(x => x.key === k); return `<tr><td><label class="chip"><input type="checkbox" data-take="${k}" checked><b>${esc(f.label)}</b></label></td><td>${showVal(f, out[k], users)}</td><td class="muted">${esc(evidence[k]?.quote || (raw.evidence?.[k] ? 'Цитата не найдена' : ''))}</td></tr>`; }).join('')}</tbody></table>
          ${skipped.length || (raw.warnings || []).length ? `<div class="miss">Не подставлено или под сомнением: ${esc([...skipped, ...(raw.warnings || [])].join('; '))}</div>` : ''}
          <div class="row end"><button class="btn primary" id="ai_ok">Подставить в форму</button></div>`;
        $('#ai_ok', m).onclick = () => {
          const take = Object.fromEntries($$('[data-take]:checked', m).map(input => [input.dataset.take, out[input.dataset.take]]));
          onApply(take, date || null, $('#ai_ow', m).checked, this.matchingEvidence(take, evidence));
          m.close();
          Audit.log('ИИ-заполнение', 'events', '-', null, null);
        };
      } catch (er) { $('#ai_res', m).innerHTML = `<div class="card err">${esc(er.message)}${/fetch|network|Failed/i.test(er.message) ? '<br>Проверьте, что модель запущена и доступна. Для Ollama задайте переменную окружения OLLAMA_ORIGINS=* и перезапустите Ollama.' : ''}</div>`; }
      btn.disabled = false; btn.textContent = 'Извлечь';
    };
  },

  /* ---------- разбор целого документа на пациента и несколько событий ---------- */
  async fullParse(reg, patient, preFile, sourceFileId) {
    if (!this.ready()) return this.dialog({ title: '', fields: [], users: [] });
    const users = await Data.users();
    const core = [F('localId', 'Номер истории болезни'), F('lastName', 'Фамилия'), F('firstName', 'Имя'), F('middleName', 'Отчество'), F('birthDate', 'Дата рождения', 'date'), F('sex', 'Пол', 'select', { options: ['М', 'Ж'] }), F('phone', 'Телефон')];
    const m = modal(`<h2>${patient ? 'Разобрать документ: ' + esc(pname(patient)) : 'Новый пациент из документа'}</h2>
      <p class="muted">Выписка, протоколы, гистология, МРТ: ИИ сам определит, какие события регистра «${esc(reg.name)}» описаны в документе, и заполнит их. Вы проверите всё перед сохранением. ${this.local() ? 'Модель локальная.' : '<b class="bad">Документ уйдёт во внешний сервис ИИ.</b>'}</p>
      <textarea class="inp" id="fp_t" rows="10" placeholder="Вставьте текст документа"></textarea>
      <div class="row between"><input type="file" id="fp_f" accept=".docx,.txt,.pdf,image/*"><button class="btn primary" id="fp_go">Разобрать</button></div><div id="fp_res"></div>`, { full: true });
    let doc = {}, file = {};
    const loadFile = async (selected, fileId) => {
      if (!selected) return;
      try {
        doc = await this.readFile(selected);
        file = { fileName: selected.name, ...(fileId ? { fileId } : {}) };
        const input = $('#fp_t', m);
        input.value = doc.text || '';
        input.placeholder = 'Файл «' + selected.name + '» загружен';
      } catch (error) { toast(error.message, 'err'); }
    };
    $('#fp_f', m).onchange = e => loadFile(e.target.files[0]);
    if (preFile) await loadFile(preFile, sourceFileId);
    $('#fp_go', m).onclick = async () => {
      const text = $('#fp_t', m).value.trim();
      const d = { ...doc, text: text || doc.text };
      if (!d.text && !d.pdf && !d.image) return toast('Нужен текст или файл', 'err');
      const source = this.documentSource(doc, text, file);
      const btn = $('#fp_go', m); btn.disabled = true; btn.textContent = 'ИИ читает документ…';
      const prompt = DocumentSchema.extract(reg, users, patient ? null : [...core, ...(reg.patientFields || [])]);
      try {
        const raw = this.parse(await this.call(prompt, d));
        const pt = patient ? null : this.normalize([...core, ...(reg.patientFields || [])], users, raw.patient || {});
        const evs = (raw.events || []).flatMap(e => {
          const et = etById(reg, e.type);
          if (!et) return [];
          const { out, skipped } = this.normalize(formFields(et), users, e.fields);
          return [{ et, date: this.eventDate(e.event_date), data: out, skipped, evidence: this.fieldEvidence(out, e.evidence, source, { text: d.text, pages: source.fileName ? d.pages : null }) }];
        });
        $('#fp_res', m).innerHTML = `${pt ? `<fieldset class="sec"><legend>Пациент</legend><div class="grid">${core.map(f => `<div class="fld"><label class="flab">${esc(f.label)}</label><input class="inp ${pt.out[f.key] ? 'aiv' : ''}" data-pc="${f.key}" value="${esc(pt.out[f.key] ?? '')}"></div>`).join('')}</div></fieldset>` : ''}
          ${evs.map((e, i) => `<fieldset class="sec" style="border-left:4px solid ${e.et.color}"><legend><label class="chip"><input type="checkbox" data-ei="${i}" checked><b>${esc(e.et.name)}</b></label></legend>
            <div class="row"><label class="flab" for="fp_date_${i}">${esc(e.et.dateLabel || 'Дата')}</label><input class="inp" type="date" id="fp_date_${i}" data-ed="${i}" value="${esc(e.date)}">${e.date ? '' : '<span class="fhint">Дата не найдена. Укажите её или снимите галочку с события.</span>'}</div>
            <table class="tbl small"><tbody>${Object.entries(e.data).map(([k, v]) => { const f = formFields(e.et).find(x => x.key === k); return `<tr><td><b>${esc(f.label)}</b></td><td class="aiv">${showVal(f, v, users)}</td><td class="muted">${esc(e.evidence[k]?.quote || '')}</td></tr>`; }).join('') || '<tr><td class="muted">поля не найдены</td></tr>'}</tbody></table>
            ${e.skipped.length ? `<div class="miss">Не подставлено: ${esc(e.skipped.join('; '))}</div>` : ''}</fieldset>`).join('') || '<div class="card">ИИ не нашёл событий этого регистра в документе.</div>'}
          ${(raw.warnings || []).length ? `<div class="miss">${esc(raw.warnings.join('; '))}</div>` : ''}
          <div class="row end sticky-bottom"><button class="btn primary" id="fp_ok">Сохранить в регистр</button></div>`;
        const saveButton = $('#fp_ok', m);
        saveButton.onclick = async () => {
          const selected = [];
          for (const [index, event] of evs.entries()) {
            if (!$(`[data-ei="${index}"]`, m).checked) continue;
            const input = $(`[data-ed="${index}"]`, m);
            const date = this.eventDate(input.value);
            if (!date) {
              input.focus();
              return toast('Укажите дату события «' + event.et.name + '» или снимите с него галочку', 'err');
            }
            selected.push({ ...event, date });
          }
          saveButton.disabled = true;
          try {
            let p = patient;
            if (!p) {
              const v = k => $(`[data-pc="${k}"]`, m).value.trim();
              if (!v('localId') || !v('lastName') || !this.eventDate(v('birthDate')) || !['М', 'Ж'].includes(v('sex'))) return toast('Проверьте № ИБ, фамилию, дату рождения (ГГГГ-ММ-ДД) и пол (М/Ж)', 'err');
              const ex = (await Data.patients(reg.id)).find(x => x.localId === v('localId'));
              p = ex || await DB.put('patients', { registryId: reg.id, localId: v('localId'), lastName: v('lastName'), firstName: v('firstName'), middleName: v('middleName'), birthDate: v('birthDate'), sex: v('sex'), phone: v('phone'), center: Auth.user.center || '', data: Object.fromEntries((reg.patientFields || []).map(f => [f.key, pt.out[f.key]]).filter(x => x[1] != null)), consent: '' }, 'создание пациента (ИИ)');
            }
            const existing = (await Data.events(reg.id)).filter(x => x.patientId === p.id);
            let created = 0, merged = 0;
            for (const event of selected) {
              const { et, date, data, evidence } = event;
              const same = existing.find(x => x.type === et.id && (et.single || x.date === date));
              if (same) {
                if (same.locked) continue;
                const accepted = Object.fromEntries(Object.entries(data).filter(([key]) => isEmpty(same.data?.[key])));
                if (!Object.keys(accepted).length) continue;
                const combined = { ...same.data, ...accepted };
                const aiEvidence = { ...this.matchingEvidence(combined, same.aiEvidence), ...this.matchingEvidence(accepted, evidence) };
                same.data = combined;
                same.status = validateEvent(et, computeValues(reg, p, et, combined, same.date)).length ? 'черновик' : 'завершено';
                if (Object.keys(aiEvidence).length) same.aiEvidence = aiEvidence;
                else delete same.aiEvidence;
                await DB.put('events', same, 'дополнение события (ИИ)');
                merged++;
              } else {
                const status = validateEvent(et, computeValues(reg, p, et, data, date)).length ? 'черновик' : 'завершено';
                const saved = await DB.put('events', { patientId: p.id, registryId: reg.id, type: et.id, date, data, status,
                  schemaVersion: reg.version, aiSource: true, ...(Object.keys(evidence).length ? { aiEvidence: evidence } : {}) }, 'создание события (ИИ)');
                existing.push(saved);
                created++;
              }
            }
            await Proms.autoSchedule(p, reg);
            m.close();
            toast(`Создано событий: ${created}, дополнено: ${merged}. Незаполненные обязательные поля сохранены как черновики.`);
            go('patient/' + p.id);
          } catch (error) { toast(error.message, 'err'); }
          finally { saveButton.disabled = false; }
        };
      } catch (er) { $('#fp_res', m).innerHTML = `<div class="card err">${esc(er.message)}</div>`; }
      btn.disabled = false; btn.textContent = 'Разобрать';
    };
  },

  /* ---------- настройки ---------- */
  settingsCard() {
    const c = this.cfg();
    return `<div class="card"><h3>ИИ-ассистент (заполнение из документов)</h3><div class="grid">
      <div class="fld"><label class="flab">Провайдер</label><select class="inp" id="ai_p"><option value="none">выключен</option><option value="ollama" ${c.provider === 'ollama' ? 'selected' : ''}>Локальная модель (Ollama), данные не покидают ПК</option><option value="anthropic" ${c.provider === 'anthropic' ? 'selected' : ''}>Claude API (Anthropic)</option><option value="openai" ${c.provider === 'openai' ? 'selected' : ''}>OpenAI-совместимый сервер (в т.ч. сервер ННОЦ)</option></select></div>
      <div class="fld"><label class="flab">Модель</label><input class="inp" id="ai_m" value="${esc(c.model || '')}" placeholder="qwen3.5:9b / claude-sonnet-5-5"></div>
      <div class="fld"><label class="flab">Адрес сервера</label><input class="inp" id="ai_u" value="${esc(c.url || '')}" placeholder="http://localhost:11434"></div>
      <div class="fld"><label class="flab">API-ключ</label><input class="inp" type="password" id="ai_k" value="${esc(c.key || '')}" placeholder="не нужен для Ollama"></div></div>
      <p class="help">Локально: установите Ollama, выполните <span class="mono">ollama pull qwen2.5:7b</span> (для фото документов: <span class="mono">qwen2.5vl:7b</span>). Ключ хранится только в этом браузере.</p>
      <div class="row"><button class="btn" id="ai_s">Сохранить</button><button class="btn" id="ai_test">Проверить связь</button><span id="ai_tr" class="muted"></span></div></div>`;
  },
  bindSettings() {
    const save = async () => { Settings.data.ai = { provider: $('#ai_p').value, model: $('#ai_m').value.trim(), url: $('#ai_u').value.trim(), key: $('#ai_k').value.trim() }; await DB.rawPut('settings', Settings.data); };
    $('#ai_s').onclick = async () => { await save(); toast('Сохранено'); };
    $('#ai_test').onclick = async () => { await save(); $('#ai_tr').textContent = 'проверяю…'; try { const t = await this.call('Ответь JSON: {"ok": true}', { text: '' }); $('#ai_tr').innerHTML = /ok/.test(t) ? '<b class="good">работает</b>' : esc(t.slice(0, 80)); } catch (e) { $('#ai_tr').innerHTML = `<span class="bad">${esc(e.message)}</span>`; } };
  }
};

/* ---------- окно выбора нескольких значений (чекбоксы) ---------- */
function pickValues(title, options, selected) {
  return new Promise(res => {
    const sel = new Set(selected && selected.length ? selected : []);
    const m = modal(`<h3>${esc(title)}</h3><input class="inp" id="pv_q" placeholder="Поиск"><div class="row" style="margin:8px 0"><button class="btn xs" id="pv_all">Выбрать все</button><button class="btn xs" id="pv_none">Снять все</button><span class="muted">Ничего не выбрано = без фильтра</span></div>
      <div class="pv-list">${options.map(o => `<label class="pv"><input type="checkbox" value="${esc(o.v)}" ${sel.has(String(o.v)) ? 'checked' : ''}><span>${esc(o.l)}</span>${o.n != null ? `<small class="muted">${o.n}</small>` : ''}</label>`).join('') || '<p class="muted">Нет вариантов</p>'}</div>
      <div class="row end"><button class="btn" id="pv_x">Отмена</button><button class="btn primary" id="pv_ok">Применить</button></div>`, { onClose: () => res(null) });
    $('#pv_q', m).oninput = e => { const q = e.target.value.toLowerCase(); $$('.pv', m).forEach(l => l.style.display = l.textContent.toLowerCase().includes(q) ? '' : 'none'); };
    $('#pv_all', m).onclick = () => $$('.pv input', m).forEach(i => { if (i.closest('.pv').style.display !== 'none') i.checked = true; });
    $('#pv_none', m).onclick = () => $$('.pv input', m).forEach(i => i.checked = false);
    $('#pv_x', m).onclick = () => { m.remove(); res(null); };
    $('#pv_ok', m).onclick = () => { const v = $$('.pv input:checked', m).map(i => i.value); m.remove(); res(v); };
  });
}
/* варианты значений поля: из списка + реально встречающиеся в данных */
function valueOptions(f, users, seen = []) {
  const cnt = {}; seen.forEach(v => [].concat(v).forEach(x => { if (!isEmpty(x)) cnt[x] = (cnt[x] || 0) + 1; }));
  let base = [];
  if (f.type === 'user') base = users.map(u => ({ v: u.id, l: u.name }));
  else if (f.type === 'yesno') base = ['да', 'нет', 'неизвестно'].map(x => ({ v: x, l: x }));
  else if (f.key === 'sex') base = ['М', 'Ж'].map(x => ({ v: x, l: x }));
  else base = (f.options || []).map(x => ({ v: x, l: x }));
  Object.keys(cnt).forEach(k => { if (!base.some(b => String(b.v) === k)) base.push({ v: k, l: k }); });
  return base.map(b => ({ ...b, n: cnt[b.v] || 0 }));
}
