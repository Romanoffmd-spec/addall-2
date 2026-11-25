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

  /* две «общие папки», два регистра; пять выписок: одна про пациента, который уже есть в регистре, остальные новые */
  async seed() {
    let st = this.state();
    const regsNow = await DB.all('registries');
    if (st && st.v === 2 && st.sources.every(s => regsNow.some(r => r.id === s.registryId))) return st;
    let regs = regsNow.filter(r => !r.archivedAt && (r.eventTypes || []).length);
    if (regs.length < 2 && typeof TEMPLATES === 'object' && TEMPLATES.surgaudit) {
      const r = TEMPLATES.surgaudit.make();
      Object.assign(r, { id: 'training-audit', name: 'Учебный хирургический аудит', createdBy: TRAIN_USER.id, center: TRAIN_USER.center, dept: TRAIN_USER.dept, status: 'активен' });
      await DB.rawPut('registries', r); regs.push(r);
    }
    regs = [...regs.filter(r => r.id === 'training-example'), ...regs.filter(r => r.id !== 'training-example')].slice(0, 2);
    const center = TRAIN_USER.center, patients = await DB.all('patients');
    const names = [['Сейткали', 'Ерлан', 'М'], ['Абенова', 'Динара', 'Ж'], ['Ким', 'Сергей', 'М'], ['Жумабаева', 'Асель', 'Ж'], ['Петров', 'Алексей', 'М']];
    const items = [], sources = regs.map((reg, i) => ({ id: 'tsrc' + i, name: 'Общая папка «' + (i ? 'Хирургия' : 'Колопроктология') + '»', registryId: reg.id, center, lastScanAt: nowISO() }));
    let n = 0;
    for (const [ri, reg] of regs.entries()) {
      const known = patients.find(p => p.registryId === reg.id && p.localId && p.center === center);
      for (let k = 0; k < (ri ? 2 : 3); k++) {
        const [ln, fn, sex] = names[n % names.length];
        const patient = k === 0 && known ? known : { localId: 'ИБ-' + (4100 + n), lastName: ln, firstName: fn, sex, birthDate: addDays(today(), -(19000 + n * 1700)) };
        const text = this.document(reg, patient, n * 3);
        items.push({ id: 'tin_' + (++n), filename: `Выписка ${patient.localId}.txt`, registryId: reg.id, center, patientNumber: patient.localId, encounter: '',
          source: sources[ri].id, sourceName: sources[ri].name, receivedAt: new Date(Date.now() - n * 3600e3).toISOString(), status: 'waiting',
          document: { text, pages: [text], ocrPages: [] } });
      }
    }
    st = { v: 2, sources, items };
    for (const [i, item] of st.items.entries()) { try { st.items[i] = await this.parse(item); } catch (e) { st.items[i] = { ...item, status: 'error', error: e.message }; } }
    this.save(st);
    return st;
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
