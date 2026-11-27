/* AddAll 2.0: «Документы из хранилища» в учебном режиме.
   На сервере документы приходят из общих папок: каждая папка привязана к своему регистру и учреждению, ИИ читает документ,
   раскладывает его по формам регистра с цитатами, находит пациента по № ИБ; координатор проверяет и сохраняет.
   Здесь та же страница и то же окно проверки работают без сервера: учебные выписки вымышленных пациентов лежат в двух
   «папках» (двух регистрах), разбор делает демонстрационный ИИ, решения пишутся в учебную базу.
   В рабочем режиме файл ничего не меняет. Подключается после aidemo.js. */
'use strict';

const TrainInbox = {
  key: 'addall2.train.inbox',
  on: () => typeof TRAIN !== 'undefined' && TRAIN,
  state() { try { return JSON.parse(localStorage.getItem(this.key) || 'null'); } catch (e) { return null; } },
  save(s) { try { localStorage.setItem(this.key, JSON.stringify(s)); } catch (e) { } },
  ru: d => d ? d.split('-').reverse().join('.') : '',
  TEXT: [[/диагноз/i, 'Рак сигмовидной кишки'], [/^операция$|вид операции|procedure/i, 'Лапароскопическая резекция сигмовидной кишки'], [/мкб/i, 'C18.7']],

  /* строка «Подпись: значение» для учебной выписки */
  line(f, v) {
    if (v == null || v === '' || (Array.isArray(v) && !v.length) || typeof v === 'object' && !Array.isArray(v)) return '';
    if (f.type === 'date') v = this.ru(v);
    if (Array.isArray(v)) v = v.join(', ');
    return `${f.label}: ${v}`;
  },
  /* правдоподобные числа для учебных документов (генератор берёт любые из допустимого диапазона) */
  REAL: [[/^рост/i, 155, 190, 0], [/^вес|масса тела/i, 52, 105, 1], [/рэа|cea/i, 1.5, 18, 1], [/длительн/i, 90, 260, 0], [/кровопотер/i, 50, 400, 0],
    [/койко|дней|сутк/i, 4, 14, 0], [/лимфоуз.*(исслед|удал|всего)/i, 12, 28, 0], [/лимфоуз.*(пораж|метаст|положит)/i, 0, 4, 0], [/^возраст/i, 42, 79, 0], [/расстоян|от края|см от/i, 3, 12, 0]],
  real(f, v) {
    if (f.type !== 'number') return v;
    const hit = this.REAL.find(([re]) => re.test(f.label));
    if (!hit) return v;
    const [, lo, hi, dp] = hit, x = Number((lo + Math.random() * (hi - lo)).toFixed(dp));
    return Math.min(isEmpty(f.max) ? Infinity : Number(f.max), Math.max(isEmpty(f.min) ? -Infinity : Number(f.min), x));
  },
  textFor(f) { const hit = this.TEXT.find(([re]) => re.test(f.label) || re.test(f.key)); return hit ? hit[1] : ''; },

  /* учебный документ по формам регистра: шапка с пациентом и 2-3 формы со своими датами */
  document(reg, patient, offset) {
    const forms = (reg.eventTypes || []).filter(et => formFields(et).filter(f => ['number', 'select', 'yesno', 'icd10'].includes(f.type) && !f.showIf?.key).length >= 2).slice(0, 3);
    const out = [`ВЫПИСНОЙ ЭПИКРИЗ (учебный документ, вымышленный пациент)`, `Номер истории болезни: ${patient.localId}`, `Фамилия: ${patient.lastName}`, `Имя: ${patient.firstName}`,
      `Дата рождения: ${this.ru(patient.birthDate)}`, `Пол: ${patient.sex}`, ''];
    const used = new Set();
    forms.forEach((et, i) => {
      const date = addDays(today(), -offset - 30 + i * 6);
      const label = et.dateLabel && !used.has(et.dateLabel) ? et.dateLabel : 'Дата (' + et.name + ')';
      used.add(label);
      out.push(et.name.toUpperCase(), `${label}: ${this.ru(date)}`);
      const fields = formFields(et).filter(f => !f.showIf?.key && !['calc', 'group', 'complist', 'user', 'file', 'image', 'patient'].includes(f.type));
      const data = SYN.fill(fields, { date, users: [], people: [], patient });
      for (const f of fields.slice(0, 9)) {
        const v = ['text', 'textarea'].includes(f.type) ? this.textFor(f) : this.real(f, data[f.key]);
        const l = this.line(f, v); if (l) out.push(l);
      }
      out.push('');
    });
    out.push('Выписан в удовлетворительном состоянии. Рекомендовано наблюдение.');
    return out.join('\n');
  },

  async parse(item) {
    const reg = await DB.get('registries', item.registryId);
    if (!reg) throw new Error('Регистр не найден');
    const prompt = DocumentSchema.extract(reg, [], null), doc = { text: item.document.text };
    /* демонстрационный ИИ отвечает сразу, без паузы, чтобы очередь открывалась мгновенно */
    const raw = AI.parse(AI.cfg().provider === 'demo' ? AIDemo.answer(prompt, doc) : await AI.call(prompt, doc));
    return { ...item, raw: { events: raw.events || [], warnings: raw.warnings || [] }, status: 'review', processedAt: nowISO(), schemaVersion: reg.version || 1, error: '' };
  },

  /* две «общие папки» с автопилотом и ручные загрузки. Ночью ИИ сам разобрал документы из папок: завёл новых пациентов,
     дополнил карточку знакомого пациента и разнёс выписку, которая подходит к обоим регистрам, в оба. Ручные загрузки и
     документ без даты рождения ждут координатора. */
  seed() { return (this.seeding ||= this.build().finally(() => { this.seeding = null; })); },
  async build() {
    let st = this.state();
    const regsNow = await DB.all('registries');
    if (st && st.v === 3 && st.sources.every(s => regsNow.some(r => r.id === s.registryId))) return st;
    let regs = regsNow.filter(r => !r.archivedAt && (r.eventTypes || []).length);
    if (regs.length < 2 && typeof TEMPLATES === 'object' && TEMPLATES.surgaudit) {
      const r = TEMPLATES.surgaudit.make();
      Object.assign(r, { id: 'training-audit', name: 'Учебный хирургический аудит', createdBy: TRAIN_USER.id, center: TRAIN_USER.center, dept: TRAIN_USER.dept, status: 'активен' });
      await DB.rawPut('registries', r); regs.push(r);
    }
    regs = [...regs.filter(r => r.id === 'training-example'), ...regs.filter(r => r.id !== 'training-example')].slice(0, 2);
    const center = TRAIN_USER.center, patients = await DB.all('patients');
    const sources = regs.map((reg, i) => ({ id: 'tsrc' + i, name: 'Общая папка «' + (i ? 'Хирургия' : 'Колопроктология') + '», автопилот ИИ', registryId: reg.id, center, lastScanAt: nowISO(), auto: true }));
    const night = new Date(); night.setHours(3, 0, 0, 0); if (night > new Date()) night.setDate(night.getDate() - 1);
    const at = minutes => new Date(night.getTime() + minutes * 60000).toISOString();
    const people = [['Сейткали', 'Ерлан', 'М'], ['Абенова', 'Динара', 'Ж'], ['Ким', 'Сергей', 'М'], ['Жумабаева', 'Асель', 'Ж'], ['Петров', 'Алексей', 'М'], ['Оспанова', 'Гульнар', 'Ж'], ['Нуриев', 'Тимур', 'М']];
    const items = [];
    let n = 0;
    const person = known => { const [ln, fn, sex] = people[n % people.length]; return known || { localId: 'ИБ-' + (4100 + n), lastName: ln, firstName: fn, sex, birthDate: addDays(today(), -(19000 + n * 1700)) }; };
    const add = (reg, src, patient, extra = {}) => {
      let text = extra.text || this.document(reg, patient, n * 3);
      if (extra.noBirth) text = text.replace(/^Дата рождения:.*\n/m, '');
      const item = { id: 'tin_' + (++n), filename: `Выписка ${patient.localId}.txt`, registryId: reg.id, center, patientNumber: patient.localId, encounter: '',
        source: src?.id || 'upload', sourceName: src?.name || '', manual: !src, receivedAt: src ? at(-60 + n * 7) : new Date(Date.now() - n * 600e3).toISOString(),
        status: 'waiting', document: { text, pages: [text], ocrPages: [] }, ...extra.meta };
      items.push(item);
      return item;
    };
    const [r0, r1] = regs, known = patients.find(p => p.registryId === r0.id && p.localId && p.center === center);
    /* папка «Колопроктология»: знакомый пациент, новый пациент, выписка сразу для двух регистров, документ без даты рождения */
    if (known) add(r0, sources[0], known);
    add(r0, sources[0], person());
    if (r1) {
      const both = person();
      const text = this.document(r0, both, n * 3) + '\n' + this.document(r1, both, n * 3 + 1).split('\n').slice(7).join('\n');
      const first = add(r0, sources[0], both, { text, meta: { routedTo: [r0.id, r1.id], routed: true } });
      add(r1, sources[0], both, { text, meta: { routedFrom: first.id, routed: true, sourceName: sources[0].name } });
      add(r1, sources[1], person());
    }
    add(r0, sources[0], person(), { noBirth: true });
    /* ручные загрузки: их подтверждает координатор */
    add(r0, null, person());
    if (known) add(r0, null, known);
    st = { v: 3, sources, items };
    for (const [i, item] of st.items.entries()) { try { st.items[i] = await this.parse(item); } catch (e) { st.items[i] = { ...item, status: 'error', error: e.message }; } }
    for (const [i, item] of st.items.entries()) {
      if (item.status !== 'review' || item.manual) continue;
      try { st.items[i] = await this.auto(item, at(5 + i * 4)); } catch (e) { st.items[i] = { ...item, autoNote: e.message }; }
    }
    this.save(st);
    return st;
  },

  /* учебный автопилот: тот же порядок, что у фонового разбора на сервере */
  async auto(item, stamp) {
    const reg = await DB.get('registries', item.registryId);
    const text = item.document.text, grab = label => (text.match(new RegExp('^' + label + ':\\s*(.+)$', 'm')) || [])[1]?.trim() || '';
    const number = item.patientNumber || grab('Номер истории болезни');
    if (!number) return { ...item, autoNote: 'В документе не найден № истории болезни' };
    const same = p => String(p.localId || '').trim().toUpperCase() === number.toUpperCase() && p.center === item.center;
    const all = await DB.all('patients'), here = all.filter(p => p.registryId === reg.id && same(p));
    if (here.length > 1) return { ...item, autoNote: 'В регистре несколько карточек с № ИБ ' + number };
    let patient = here[0], created = false;
    if (!patient) {
      const twin = all.find(same);
      const birth = grab('Дата рождения').split('.').reverse().join('-');
      const base = twin ? { lastName: twin.lastName, firstName: twin.firstName, middleName: twin.middleName || '', birthDate: twin.birthDate, sex: twin.sex }
        : { lastName: grab('Фамилия'), firstName: grab('Имя'), middleName: '', birthDate: calendarDay(birth) || '', sex: grab('Пол') };
      if (!base.lastName || !base.birthDate || !['М', 'Ж'].includes(base.sex)) return { ...item, autoNote: 'Для новой карточки в документе не найдены фамилия, дата рождения или пол' };
      patient = await DB.put('patients', { registryId: reg.id, center: item.center, localId: number, ...base, createdBy: 'ai-intake', aiCreated: true, aiCheck: 'ожидает',
        aiAutoAt: stamp, intakeId: item.id, intakeFile: item.filename, ...(twin?.pid ? { pid: twin.pid } : {}) }, 'карточка создана ИИ из документа');
      created = true;
    }
    const events = (await DB.all('events')).filter(e => e.patientId === patient.id);
    const opener = Episodes.isPatient(reg) ? '' : Episodes.opener(reg);
    const source = { fileName: item.filename, intakeId: item.id };
    const added = [], skipped = [], ids = [], made = [];
    const proposals = (item.raw?.events || []).slice().sort((a, b) => (b.type === opener) - (a.type === opener));
    for (const proposal of proposals) {
      const form = etById(reg, proposal?.type);
      if (!form) continue;
      const date = calendarDay(proposal.event_date);
      if (!date) { skipped.push(form.name + ': нет даты'); continue; }
      const fields = formFields(form).filter(f => f.type !== 'calc');
      const { out } = AI.normalize(fields, [], proposal.fields);
      const evidence = AI.fieldEvidence(out, proposal.evidence, source, item.document);
      const keys = Object.keys(out).filter(k => evidence[k]?.verified);
      if (!keys.length) { skipped.push(form.name + ': нет значений с цитатой'); continue; }
      let anchor = null;
      if (opener && form.id !== opener) {
        const openers = [...made, ...events].filter(e => e.type === opener);
        anchor = openers.filter(e => e.date <= date).sort((a, b) => String(b.date).localeCompare(String(a.date)))[0]
          || openers.filter(e => e.date > date && e.date <= addDays(date, 180)).sort((a, b) => String(a.date).localeCompare(String(b.date)))[0];
        if (!anchor) { skipped.push(form.name + ': не найден эпизод'); continue; }
      }
      const before = [...made, ...events].find(e => e.type === form.id && (form.single || (e.date === date && (e.anchorEventId || '') === (anchor?.id || ''))));
      if (before && (before.locked || before.status !== 'черновик' || made.includes(before))) { skipped.push(form.name + ': уже есть в регистре'); continue; }
      const fresh = keys.filter(k => isEmpty(before?.data?.[k]));
      if (!fresh.length) { skipped.push(form.name + ': уже заполнено'); continue; }
      const data = { ...(before?.data || {}) }; fresh.forEach(k => { data[k] = out[k]; });
      const dateEvidence = AI.fieldEvidence({ date }, { date: proposal.date_evidence }, source, item.document).date;
      const saved = await DB.put('events', { ...before, patientId: patient.id, registryId: reg.id, type: form.id, date: before?.date || date, data, status: 'черновик',
        schemaVersion: reg.version, intakeId: item.id, intakeFile: item.filename, aiSource: true, aiAuto: true, aiAutoAt: stamp, aiCheck: 'ожидает', aiFields: fresh,
        aiEvidence: { ...(before?.aiEvidence || {}), ...Object.fromEntries(fresh.map(k => [k, evidence[k]])) }, ...(dateEvidence ? { dateEvidence } : {}),
        ...(anchor ? { anchorEventId: anchor.id } : {}), createdBy: before?.createdBy || 'ai-intake' }, 'черновик заполнен ИИ из документа');
      made.push(saved); ids.push(saved.id);
      added.push({ type: form.id, name: form.name, date: saved.date, fields: fresh.length, eventId: saved.id, updated: !!before });
    }
    if (!ids.length) return { ...item, autoNote: skipped.length ? 'ИИ не смог записать: ' + skipped.join('; ') : 'В документе не найдено данных для форм регистра' };
    return { ...item, status: 'accepted', auto: true, decidedBy: 'ai-intake', decidedAt: stamp, patientId: patient.id, newPatient: created, eventIds: ids, autoSummary: { added, skipped } };
  },

  candidates: async item => (await DB.all('patients')).filter(p => item.patientNumber && p.registryId === item.registryId && p.center === item.center
    && String(p.localId || '').trim().toUpperCase() === item.patientNumber.trim().toUpperCase()).map(p => p.id),

  async handle(method, path, body) {
    const st = await this.seed();
    const url = new URL(path, 'https://x/'), parts = url.pathname.split('/').filter(Boolean);
    const regs = await DB.all('registries');
    if (method === 'GET' && parts.length === 1) {
      const q = url.searchParams, status = q.get('status') || 'all';
      let rows = st.items.filter(x => (status === 'all' || (status === 'pending' ? ['waiting', 'review', 'error'] : ['accepted', 'rejected']).includes(x.status))
        && (!q.get('registryId') || x.registryId === q.get('registryId')) && (!q.get('center') || x.center === q.get('center')));
      const offset = Number(q.get('offset') || 0), limit = 50;
      return { rows: rows.slice(offset, offset + limit).map(({ document, raw, ...x }) => x), total: rows.length, limit, offset, enabled: true, health: '',
        sources: st.sources, registries: regs.filter(r => (r.eventTypes || []).length).map(r => ({ id: r.id, name: r.name, centers: [TRAIN_USER.center], archived: !!r.archivedAt })) };
    }
    const id = parts[1], item = st.items.find(x => x.id === id);
    const keep = () => this.save(st);
    if (method === 'POST' && id === 'upload') {
      const bin = atob(body.base64 || ''), bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
      const file = new File([bytes], body.filename || 'документ.txt', { type: /\.txt$/i.test(body.filename) ? 'text/plain' : '' });
      const doc = await AI.readFile(file);
      const text = doc.text || '';
      if (st.items.some(x => x.registryId === body.registryId && x.document?.text === text)) return { duplicate: true };
      const next = { id: 'tin_' + Date.now().toString(36), filename: body.filename, registryId: body.registryId, center: body.center, patientNumber: body.patientNumber || '', encounter: body.encounter || '',
        manual: true, receivedAt: nowISO(), status: 'waiting', document: { text, pages: doc.pages?.length ? doc.pages : [text], ocrPages: [] } };
      try { st.items.unshift(text ? await this.parse(next) : { ...next, status: 'error', error: 'В учебном режиме разбираются файлы с текстом (TXT, DOCX, PDF с текстом)' }); }
      catch (e) { st.items.unshift({ ...next, status: 'error', error: e.message }); }
      keep(); return { duplicate: false };
    }
    if (!item) throw new Error('Документ не найден');
    if (method === 'GET') return { ...item, candidates: await this.candidates(item) };
    const action = parts[2];
    if (action === 'retry') { Object.assign(item, await this.parse(item)); keep(); return { ok: true }; }
    if (action === 'reject') { Object.assign(item, { status: 'rejected', reason: body.reason, decidedAt: nowISO() }); keep(); return { ok: true }; }
    if (action === 'apply') {
      const reg = await DB.get('registries', item.registryId), patient = await DB.get('patients', body.patientId);
      if (!patient || patient.registryId !== reg.id) throw new Error('Выберите пациента из этого регистра');
      const text = item.document.text, ids = [];
      for (const r of body.records || []) {
        const before = r.id ? await DB.get('events', r.id) : null;
        const aiEvidence = Object.fromEntries(Object.entries(r.aiEvidence || {}).filter(([k, e]) => e?.quote && text.includes(e.quote) && JSON.stringify(e.value) === JSON.stringify(r.data[k]))
          .map(([k, e]) => [k, { ...e, fileName: item.filename, intakeId: item.id, verified: true }]));
        const saved = await DB.put('events', { ...before, patientId: patient.id, registryId: reg.id, type: r.type, date: before?.date || r.date, data: r.data, status: 'черновик',
          schemaVersion: reg.version, intakeId: item.id, aiSource: true, aiEvidence: { ...(before?.aiEvidence || {}), ...aiEvidence }, ...(r.anchorEventId ? { anchorEventId: r.anchorEventId } : {}),
          ...(r.dateEvidence ? { dateEvidence: r.dateEvidence } : {}) }, 'принятие полей из документа');
        ids.push(saved.id);
      }
      Object.assign(item, { status: 'accepted', patientId: patient.id, decidedAt: nowISO(), eventIds: ids }); keep();
      return { ok: true };
    }
    throw new Error('Неизвестное действие');
  }
};

if (TrainInbox.on()) {
  const available = DocumentInbox.available.bind(DocumentInbox);
  DocumentInbox.available = () => TrainInbox.on() ? ['admin', 'lead', 'datamanager'].includes(Auth.user?.role) : available();
  DocumentInbox.file = async id => { const item = (TrainInbox.state()?.items || []).find(x => x.id === id); if (!item) throw new Error('Исходный документ недоступен'); return new Blob([item.document.text], { type: 'text/plain' }); };
  if (typeof NET === 'object') {
    const call = NET.call.bind(NET);
    NET.call = function (method, path, body) { return /^intake(\/|\?|$)/.test(path) ? TrainInbox.handle(method, path, body) : call(method, path, body); };
  }
  /* «Документы из хранилища» в меню «Работа» учебного режима */
  const groups = navGroups;
  navGroups = async function () {
    const g = await groups();
    const work = g.find(x => x.id === 'work');
    if (work?.items && DocumentInbox.available() && !work.items.some(x => x.r === 'inbox')) work.items.splice(1, 0, { r: 'inbox', t: 'Документы из хранилища', i: '⇣' });
    return g;
  };
}
