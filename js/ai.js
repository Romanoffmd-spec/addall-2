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
    if (name.endsWith('.pdf')) { const out = { pdf: await this.b64(file) }; try { out.text = await this.pdfText(file); } catch (e) { console.warn('pdf text', e); } return out; }
    if (file.type.startsWith('image/')) return { image: await this.b64(file), mime: file.type };
    throw new Error('Формат не поддерживается: используйте DOCX, TXT, PDF или фото документа');
  },
  /* текст из PDF локально (pdf.js), без отправки куда-либо */
  async pdfText(file) {
    if (!window.pdfjsLib) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'lib/pdf.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    const lib = window.pdfjsLib; lib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';
    const pdf = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise; let out = '';
    for (let i = 1; i <= Math.min(pdf.numPages, 60); i++) { const pg = await pdf.getPage(i); const tc = await pg.getTextContent(); out += tc.items.map(x => x.str + (x.hasEOL ? '\n' : ' ')).join('') + '\n\n'; }
    return out.replace(/[ \t]+\n/g, '\n').trim();
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
  schemaOf(fields, users) {
    return fields.filter(f => f.type !== 'calc').map(f => {
      const d = { key: f.key, label: f.label, type: f.type };
      if (f.unit) d.unit = f.unit;
      if (['select', 'multiselect'].includes(f.type)) d.allowed = f.options;
      if (f.type === 'complist') { d.format = '[{"name": "осложнение", "grade": "I|II|IIIa|IIIb|IVa|IVb|V", "date": "YYYY-MM-DD или пусто"}]'; d.suggested_names = f.options; }
      if (f.type === 'yesno') d.allowed = ['да', 'нет', 'неизвестно'];
      if (f.type === 'date') d.format = 'YYYY-MM-DD';
      if (f.type === 'user') d.allowed = users.filter(u => u.active !== false).map(u => u.name);
      if (f.def) d.definition = f.def;
      return d;
    });
  },
  prompt(title, schema, dateLabel) {
    return `Ты помощник хирургического регистра. Извлеки из медицинского документа значения для формы «${title}».
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
      const r = await fetch((c.url || 'http://localhost:11434').replace(/\/$/, '') + '/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: c.model || 'qwen2.5:7b', messages: [msg], stream: false, format: 'json', options: { temperature: 0 } }) });
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
    const byKey = Object.fromEntries(fields.map(f => [f.key, f]));
    const pickOpt = (opts, v) => { const s = String(v).trim().toLowerCase(); return opts.find(o => o.toLowerCase() === s) || opts.find(o => o.toLowerCase().startsWith(s) || s.startsWith(o.toLowerCase())); };
    Object.entries(raw || {}).forEach(([k, v]) => {
      const f = byKey[k]; if (!f || f.type === 'calc' || v == null || v === '' || (Array.isArray(v) && !v.length)) return;
      let val = v;
      if (f.type === 'number') { val = FX.num(v); if (val == null) return skipped.push(f.label); }
      if (f.type === 'date') { val = String(v).slice(0, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) return skipped.push(f.label); }
      if (f.type === 'select') { val = pickOpt(f.options, v); if (!val) return skipped.push(`${f.label}: «${v}» нет в списке`); }
      if (f.type === 'multiselect') { val = [].concat(v).map(x => pickOpt(f.options, x)).filter(Boolean); if (!val.length) return; }
      if (f.type === 'yesno') { val = /^(да|yes|true|1)$/i.test(String(v)) ? 'да' : /^(нет|no|false|0)$/i.test(String(v)) ? 'нет' : 'неизвестно'; }
      if (f.type === 'user') { const s = String(v).toLowerCase(); const u = users.find(x => x.name.toLowerCase() === s) || users.find(x => s && x.name.toLowerCase().split(' ')[0] === s.split(' ')[0]); if (!u) return skipped.push(`${f.label}: «${v}» нет среди пользователей`); val = u.id; }
      if (f.type === 'complist') { val = [].concat(v).filter(x => x && x.name).map(x => ({ name: String(x.name), grade: CD_GRADES.includes(x.grade) ? x.grade : 'I', date: /^\d{4}-\d{2}-\d{2}$/.test(x.date || '') ? x.date : '' })); if (!val.length) return; }
      if (f.type === 'text' || f.type === 'textarea') val = String(v);
      out[k] = val;
    });
    return { out, skipped };
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
    let doc = {};
    $('#ai_f', m).onchange = async e => { try { const f = e.target.files[0]; doc = await this.readFile(f); if (doc.text) $('#ai_t', m).value = doc.text; $('#ai_fn', m).textContent = doc.pdf ? 'PDF загружен' : doc.image ? 'Изображение загружено' : 'Текст извлечён'; } catch (er) { toast(er.message, 'err'); } };
    $('#ai_go', m).onclick = async () => {
      const text = $('#ai_t', m).value.trim(); const d = { ...doc, text: text || doc.text };
      if (!d.text && !d.pdf && !d.image) return toast('Вставьте текст или загрузите файл', 'err');
      const btn = $('#ai_go', m); btn.disabled = true; btn.textContent = 'ИИ читает документ…';
      try {
        const raw = this.parse(await this.call(this.prompt(title, this.schemaOf(fields, users), dateLabel), d));
        const { out, skipped } = this.normalize(fields, users, raw.fields);
        const keys = Object.keys(out);
        $('#ai_res', m).innerHTML = `<h3>Найдено полей: ${keys.length}</h3><table class="tbl small"><tbody>${raw.event_date && dateLabel ? `<tr><td><b>${esc(dateLabel)}</b></td><td>${fmtDate(raw.event_date)}</td><td></td></tr>` : ''}${keys.map(k => { const f = fields.find(x => x.key === k); return `<tr><td><label class="chip"><input type="checkbox" data-take="${k}" checked><b>${esc(f.label)}</b></label></td><td>${showVal(f, out[k], users)}</td><td class="muted">${esc(raw.evidence?.[k] || '')}</td></tr>`; }).join('')}</tbody></table>
          ${skipped.length || (raw.warnings || []).length ? `<div class="miss">Не подставлено или под сомнением: ${esc([...skipped, ...(raw.warnings || [])].join('; '))}</div>` : ''}
          <div class="row end"><button class="btn primary" id="ai_ok">Подставить в форму</button></div>`;
        $('#ai_ok', m).onclick = () => { const take = {}; $$('[data-take]:checked', m).forEach(c => take[c.dataset.take] = out[c.dataset.take]); onApply(take, /^\d{4}-\d{2}-\d{2}$/.test(raw.event_date || '') ? raw.event_date : null, $('#ai_ow', m).checked); m.close(); Audit.log('ИИ-заполнение', 'events', '-', null, null); };
      } catch (er) { $('#ai_res', m).innerHTML = `<div class="card err">${esc(er.message)}${/fetch|network|Failed/i.test(er.message) ? '<br>Проверьте, что модель запущена и доступна. Для Ollama задайте переменную окружения OLLAMA_ORIGINS=* и перезапустите Ollama.' : ''}</div>`; }
      btn.disabled = false; btn.textContent = 'Извлечь';
    };
  },

  /* ---------- разбор целого документа на пациента и несколько событий ---------- */
  async fullParse(reg, patient, preFile) {
    if (!this.ready()) return this.dialog({ title: '', fields: [], users: [] });
    const users = await Data.users();
    const core = [F('localId', 'Номер истории болезни'), F('lastName', 'Фамилия'), F('firstName', 'Имя'), F('middleName', 'Отчество'), F('birthDate', 'Дата рождения', 'date'), F('sex', 'Пол', 'select', { options: ['М', 'Ж'] }), F('phone', 'Телефон')];
    const m = modal(`<h2>${patient ? 'Разобрать документ: ' + esc(pname(patient)) : 'Новый пациент из документа'}</h2>
      <p class="muted">Выписка, протоколы, гистология, МРТ: ИИ сам определит, какие события регистра «${esc(reg.name)}» описаны в документе, и заполнит их. Вы проверите всё перед сохранением. ${this.local() ? 'Модель локальная.' : '<b class="bad">Документ уйдёт во внешний сервис ИИ.</b>'}</p>
      <textarea class="inp" id="fp_t" rows="10" placeholder="Вставьте текст документа"></textarea>
      <div class="row between"><input type="file" id="fp_f" accept=".docx,.txt,.pdf,image/*"><button class="btn primary" id="fp_go">Разобрать</button></div><div id="fp_res"></div>`, { full: true });
    let doc = {};
    $('#fp_f', m).onchange = async e => { try { doc = await this.readFile(e.target.files[0]); if (doc.text) $('#fp_t', m).value = doc.text; } catch (er) { toast(er.message, 'err'); } };
    if (preFile) { try { doc = await this.readFile(preFile); if (doc.text) $('#fp_t', m).value = doc.text; else $('#fp_t', m).placeholder = 'Файл «' + preFile.name + '» загружен'; } catch (er) { toast(er.message, 'err'); } }
    $('#fp_go', m).onclick = async () => {
      const d = { ...doc, text: $('#fp_t', m).value.trim() || doc.text }; if (!d.text && !d.pdf && !d.image) return toast('Нужен текст или файл', 'err');
      const btn = $('#fp_go', m); btn.disabled = true; btn.textContent = 'ИИ читает документ…';
      const schema = { patient: patient ? undefined : this.schemaOf([...core, ...(reg.patientFields || [])], users), event_types: reg.eventTypes.map(et => ({ type: et.id, name: et.name, date_meaning: et.dateLabel, repeatable: !et.single, fields: this.schemaOf(formFields(et), users) })) };
      const prompt = `Ты помощник хирургического регистра «${reg.name}». Разбери медицинский документ на события регистра.
Правила:
- Используй только типы событий из списка. Создавай событие, только если документ его действительно описывает. Одно и то же событие не дублируй.
- Заполняй поле, только если значение прямо указано или однозначно следует из текста. Не угадывай.
- Для полей с "allowed" строго одно из значений (multiselect: массив). Даты YYYY-MM-DD. Числа без единиц.
- Для каждого события дай дату (event_date) по смыслу date_meaning.
Схема (JSON): ${JSON.stringify(schema)}
Ответ: только JSON:
{${patient ? '' : '"patient": {"код_поля": значение}, '}"events": [{"type": "код_типа", "event_date": "YYYY-MM-DD", "fields": {"код_поля": значение}, "evidence": {"код_поля": "цитата до 12 слов"}}], "warnings": ["..."]}`;
      try {
        const raw = this.parse(await this.call(prompt, d));
        const pt = patient ? null : this.normalize([...core, ...(reg.patientFields || [])], users, raw.patient || {});
        const evs = (raw.events || []).map(e => { const et = etById(reg, e.type); if (!et) return null; const n = this.normalize(formFields(et), users, e.fields); return { et, date: /^\d{4}-\d{2}-\d{2}$/.test(e.event_date || '') ? e.event_date : '', data: n.out, skipped: n.skipped, evidence: e.evidence || {} }; }).filter(Boolean);
        $('#fp_res', m).innerHTML = `${pt ? `<fieldset class="sec"><legend>Пациент</legend><div class="grid">${core.map(f => `<div class="fld"><label class="flab">${esc(f.label)}</label><input class="inp ${pt.out[f.key] ? 'aiv' : ''}" data-pc="${f.key}" value="${esc(pt.out[f.key] ?? '')}"></div>`).join('')}</div></fieldset>` : ''}
          ${evs.map((e, i) => `<fieldset class="sec" style="border-left:4px solid ${e.et.color}"><legend><label class="chip"><input type="checkbox" data-ei="${i}" checked><b>${esc(e.et.name)}</b></label></legend>
            <div class="row"><label class="flab">${esc(e.et.dateLabel || 'Дата')}</label><input class="inp" type="date" data-ed="${i}" value="${esc(e.date)}"></div>
            <table class="tbl small"><tbody>${Object.entries(e.data).map(([k, v]) => { const f = formFields(e.et).find(x => x.key === k); return `<tr><td><b>${esc(f.label)}</b></td><td class="aiv">${showVal(f, v, users)}</td><td class="muted">${esc(e.evidence[k] || '')}</td></tr>`; }).join('') || '<tr><td class="muted">поля не найдены</td></tr>'}</tbody></table>
            ${e.skipped.length ? `<div class="miss">Не подставлено: ${esc(e.skipped.join('; '))}</div>` : ''}</fieldset>`).join('') || '<div class="card">ИИ не нашёл событий этого регистра в документе.</div>'}
          ${(raw.warnings || []).length ? `<div class="miss">${esc(raw.warnings.join('; '))}</div>` : ''}
          <div class="row end sticky-bottom"><button class="btn primary" id="fp_ok">Сохранить в регистр</button></div>`;
        $('#fp_ok', m).onclick = async () => {
          let p = patient;
          if (!p) {
            const v = k => $(`[data-pc="${k}"]`, m).value.trim();
            if (!v('localId') || !v('lastName') || !/^\d{4}-\d{2}-\d{2}$/.test(v('birthDate')) || !['М', 'Ж'].includes(v('sex'))) return toast('Проверьте № ИБ, фамилию, дату рождения (ГГГГ-ММ-ДД) и пол (М/Ж)', 'err');
            const ex = (await Data.patients(reg.id)).find(x => x.localId === v('localId'));
            p = ex || await DB.put('patients', { registryId: reg.id, localId: v('localId'), lastName: v('lastName'), firstName: v('firstName'), middleName: v('middleName'), birthDate: v('birthDate'), sex: v('sex'), phone: v('phone'), center: Auth.user.center || '', data: Object.fromEntries((reg.patientFields || []).map(f => [f.key, pt.out[f.key]]).filter(x => x[1] != null)), consent: '' }, 'создание пациента (ИИ)');
          }
          const existing = (await Data.events(reg.id)).filter(x => x.patientId === p.id);
          let created = 0, merged = 0;
          for (let i = 0; i < evs.length; i++) {
            if (!$(`[data-ei="${i}"]`, m).checked) continue;
            const e = evs[i], date = $(`[data-ed="${i}"]`, m).value || today();
            const same = existing.find(x => x.type === e.et.id && (e.et.single || x.date === date));
            if (same) { if (same.locked) continue; Object.entries(e.data).forEach(([k, v]) => { if (isEmpty(same.data?.[k])) same.data[k] = v; }); same.status = validateEvent(e.et, computeValues(reg, p, e.et, same.data, same.date)).length ? 'черновик' : 'завершено'; await DB.put('events', same, 'дополнение события (ИИ)'); merged++; }
            else { await DB.put('events', { patientId: p.id, registryId: reg.id, type: e.et.id, date, data: e.data, status: validateEvent(e.et, computeValues(reg, p, e.et, e.data, date)).length ? 'черновик' : 'завершено', schemaVersion: reg.version, aiSource: true }, 'создание события (ИИ)'); created++; }
          }
          await Proms.autoSchedule(p, reg);
          m.close(); toast(`Создано событий: ${created}, дополнено: ${merged}. Незаполненные обязательные поля сохранены как черновики.`); go('patient/' + p.id);
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
      <div class="fld"><label class="flab">Модель</label><input class="inp" id="ai_m" value="${esc(c.model || '')}" placeholder="qwen2.5:7b / claude-sonnet-5-5"></div>
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
