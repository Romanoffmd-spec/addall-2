/* AddAll 2.0: обмен данными по стандартам HL7.
   FHIR R4: выгрузка регистра пакетом Bundle (Patient, Observation, Condition, QuestionnaireResponse) и загрузка такого пакета.
   HL7 версии 2: загрузка сообщений ADT (данные пациента, сегмент PID) и ORU (результаты анализов, сегменты OBR/OBX)
   с сопоставлением кодов анализов полям формы. Импортированные события сохраняются черновиками до проверки врачом.
   Подключается после scales.js, до net.js. */
'use strict';

const Interop = {
  FIELD_SYS: regId => 'urn:addall:field:' + regId,
  PID_SYS: 'urn:addall:pid',
  IIN_SYS: 'urn:kz:iin',
  ICD_SYS: 'http://hl7.org/fhir/sid/icd-10',
  sexOut: s => s === 'М' ? 'male' : s === 'Ж' ? 'female' : 'unknown',
  sexIn: s => /^(male|m|м)$/i.test(String(s || '')) ? 'М' : /^(female|f|ж)$/i.test(String(s || '')) ? 'Ж' : '',
  iin: v => { const d = String(v || '').replace(/\D/g, ''); return d.length === 12 ? d : ''; },

  /* ---------- FHIR R4: выгрузка ---------- */
  value(f, v) {
    if (v == null || v === '' || (Array.isArray(v) && !v.length)) return null;
    if (f.type === 'number' || (f.type === 'calc' && typeof v === 'number')) return Number.isFinite(Number(v)) ? { valueQuantity: { value: Number(v), ...(f.unit ? { unit: f.unit } : {}) } } : null;
    if (f.type === 'yesno') return v === 'да' ? { valueBoolean: true } : v === 'нет' ? { valueBoolean: false } : { valueString: String(v) };
    if (f.type === 'date') return { valueDateTime: String(v) };
    if (['group', 'complist', 'file', 'image'].includes(f.type) || typeof v === 'object' && !Array.isArray(v)) return { valueString: JSON.stringify(v).slice(0, 4000) };
    if (Array.isArray(v)) return { valueCodeableConcept: { coding: v.map(x => ({ display: String(x) })), text: v.join('; ') } };
    if (f.type === 'select') return { valueCodeableConcept: { text: String(v) } };
    return { valueString: String(v) };
  },
  async bundle(reg, { identifiers = false } = {}) {
    const [patients, events, proms] = await Promise.all([Data.patients(reg.id), Data.events(reg.id), DB.all('proms')]);
    const vis = patients.filter(p => typeof visibleP !== 'function' || visibleP(p));
    const ref = new Map(vis.map((p, i) => [p.id, 'Patient/' + (p.pid || 'p' + (i + 1))]));
    const entries = [];
    for (const p of vis) {
      const r = { resourceType: 'Patient', id: ref.get(p.id).slice(8), identifier: [{ system: Interop.PID_SYS, value: p.pid || ref.get(p.id).slice(8) }],
        gender: Interop.sexOut(p.sex), birthDate: identifiers ? p.birthDate || undefined : (p.birthDate ? p.birthDate.slice(0, 4) : undefined) };
      if (identifiers) {
        if (Interop.iin(p.iin)) r.identifier.push({ system: Interop.IIN_SYS, value: Interop.iin(p.iin) });
        r.name = [{ family: p.lastName || undefined, given: [p.firstName, p.middleName].filter(Boolean) }];
      }
      if (p.vital === 'умер') r.deceasedDateTime = p.deathDate || undefined; else if (p.vital === 'жив') r.deceasedBoolean = false;
      entries.push(r);
    }
    for (const e of events.filter(x => ref.has(x.patientId) && x.status !== 'черновик')) {
      const et = etById(reg, e.type); if (!et) continue;
      for (const f of formFields(et)) {
        const v = e.data?.[f.key];
        if (f.type === 'icd10' && v) {
          entries.push({ resourceType: 'Condition', id: `c-${e.id}-${f.key}`, subject: { reference: ref.get(e.patientId) }, recordedDate: e.date,
            code: { coding: [{ system: Interop.ICD_SYS, code: String(v).split(/\s/)[0] }], text: String(v) } });
          continue;
        }
        const val = Interop.value(f, v); if (!val) continue;
        entries.push({ resourceType: 'Observation', id: `o-${e.id}-${f.key}`, status: 'final', subject: { reference: ref.get(e.patientId) }, effectiveDateTime: e.date,
          category: [{ text: et.name }], code: { coding: [{ system: Interop.FIELD_SYS(reg.id), code: f.key, display: f.label }], text: f.label }, ...val });
      }
    }
    for (const x of proms.filter(y => y.registryId === reg.id && y.doneAt && ref.has(y.patientId))) {
      entries.push({ resourceType: 'QuestionnaireResponse', id: 'q-' + x.id, status: 'completed', subject: { reference: ref.get(x.patientId) }, authored: x.doneAt,
        questionnaire: 'urn:addall:instrument:' + x.instrumentId, item: [...Object.entries(x.answers || {}).map(([k, s]) => ({ linkId: k, answer: [{ valueInteger: Number(s) }] })), ...(x.score != null ? [{ linkId: 'score', text: x.instrumentName, answer: [{ valueDecimal: x.score }] }] : [])] });
    }
    return { resourceType: 'Bundle', type: 'collection', timestamp: new Date().toISOString(), meta: { tag: [{ system: 'urn:addall:registry', code: reg.id, display: reg.name }] },
      entry: entries.map(resource => ({ fullUrl: 'urn:addall:' + resource.resourceType + '/' + resource.id, resource })) };
  },

  /* ---------- FHIR R4: загрузка ---------- */
  readFhir(text) {
    let json; try { json = JSON.parse(text); } catch (e) { json = String(text).split('\n').filter(l => l.trim()).map(l => JSON.parse(l)); }
    const list = Array.isArray(json) ? json : json.resourceType === 'Bundle' ? (json.entry || []).map(x => x.resource) : [json];
    const res = list.filter(r => r && r.resourceType);
    const pats = res.filter(r => r.resourceType === 'Patient').map(r => {
      const ids = r.identifier || [], nm = (r.name || [])[0] || {};
      return { key: 'Patient/' + r.id, iin: Interop.iin(ids.find(i => i.system === Interop.IIN_SYS || Interop.iin(i.value))?.value), pid: ids.find(i => i.system === Interop.PID_SYS)?.value || '',
        localId: ids.find(i => i.system !== Interop.IIN_SYS && i.system !== Interop.PID_SYS)?.value || '', lastName: nm.family || '', firstName: (nm.given || [])[0] || '', middleName: (nm.given || [])[1] || '',
        birthDate: /^\d{4}-\d{2}-\d{2}$/.test(r.birthDate || '') ? r.birthDate : '', sex: Interop.sexIn(r.gender), vital: r.deceasedDateTime || r.deceasedBoolean === true ? 'умер' : r.deceasedBoolean === false ? 'жив' : '', deathDate: (r.deceasedDateTime || '').slice(0, 10) };
    });
    const obs = res.filter(r => ['Observation', 'Condition'].includes(r.resourceType)).map(r => {
      const c = (r.code?.coding || [])[0] || {};
      const value = r.resourceType === 'Condition' ? (c.code || r.code?.text || '') : r.valueQuantity ? r.valueQuantity.value : r.valueBoolean != null ? (r.valueBoolean ? 'да' : 'нет')
        : r.valueCodeableConcept ? (r.valueCodeableConcept.text || (r.valueCodeableConcept.coding || []).map(x => x.display || x.code).join('; ')) : r.valueDateTime ?? r.valueString ?? r.valueInteger ?? '';
      return { patient: r.subject?.reference || '', date: String(r.effectiveDateTime || r.recordedDate || r.onsetDateTime || r.effectivePeriod?.start || '').slice(0, 10),
        code: r.resourceType === 'Condition' ? 'icd10:' + (c.code || '') : (c.code || r.code?.text || ''), label: r.code?.text || c.display || c.code || '', unit: r.valueQuantity?.unit || '', value, kind: r.resourceType };
    });
    return { patients: pats, results: obs };
  },

  /* ---------- HL7 v2: ADT и ORU ---------- */
  readV2(text) {
    const segs = String(text).replace(/\r\n?/g, '\n').split('\n').map(s => s.trim()).filter(Boolean);
    const pats = [], results = [];
    let cur = null, fs = '|', cs = '^', obrDate = '';
    const date = v => { const d = String(v || '').replace(/\D/g, ''); return d.length >= 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : ''; };
    for (const line of segs) {
      if (line.startsWith('MSH')) { fs = line[3] || '|'; cs = line[4] || '^'; cur = null; obrDate = ''; continue; }
      const f = line.split(fs), comp = (i, j = 0) => String(f[i] || '').split('~')[0].split(cs)[j] || '';
      if (f[0] === 'PID') {
        const idList = String(f[3] || '').split('~').map(x => x.split(cs));
        const iin = Interop.iin(idList.find(x => Interop.iin(x[0]) && (!x[4] || /^(NI|NNKAZ|SS|IIN)$/i.test(x[4])))?.[0]);
        const local = idList.find(x => x[0] && Interop.iin(x[0]) !== iin)?.[0] || '';
        cur = { key: 'v2:' + (iin || local || pats.length), iin, localId: local, pid: '', lastName: comp(5, 0), firstName: comp(5, 1), middleName: comp(5, 2), birthDate: date(f[7]), sex: Interop.sexIn(f[8]), vital: String(f[30] || '').toUpperCase() === 'Y' ? 'умер' : '', deathDate: date(f[29]) };
        if (!pats.some(p => p.key === cur.key)) pats.push(cur);
      } else if (f[0] === 'OBR') obrDate = date(f[7]);
      else if (f[0] === 'OBX' && cur) {
        const raw = String(f[5] || '').split(cs)[0], num = Number(String(raw).replace(',', '.'));
        results.push({ patient: cur.key, date: date(f[14]) || obrDate, code: comp(3, 0) || comp(3, 1), label: comp(3, 1) || comp(3, 0), unit: comp(6, 0), value: f[2] === 'NM' && Number.isFinite(num) ? num : raw, kind: 'OBX' });
      }
    }
    return { patients: pats, results };
  },

  /* сопоставление с пациентами регистра: по ИИН, затем по ID AddAll, затем по № ИБ в своём учреждении */
  match(existing, x) {
    return (x.iin && existing.find(p => Interop.iin(p.iin) === x.iin)) || (x.pid && existing.find(p => p.pid === x.pid))
      || (x.localId && existing.find(p => p.localId === x.localId && (p.center || '') === (Auth.user.center || ''))) || null;
  },

  async apply(reg, parsed, et, map, source) {
    const existing = await Data.patients(reg.id), byKey = new Map();
    let made = 0, found = 0, evs = 0;
    for (const x of parsed.patients) {
      let p = Interop.match(existing, x);
      if (p) found++;
      else {
        p = await DB.put('patients', { registryId: reg.id, localId: x.localId || '', lastName: x.lastName, firstName: x.firstName, middleName: x.middleName, birthDate: x.birthDate, sex: x.sex,
          iin: x.iin, idType: x.iin ? 'ИИН' : '', center: Auth.user.center || '', consent: '', vital: x.vital || 'жив', deathDate: x.deathDate || '', data: {}, importedFrom: source });
        existing.push(p); made++;
      }
      byKey.set(x.key, p);
    }
    const groups = new Map();
    for (const r of parsed.results) {
      const target = map[r.code]; const p = byKey.get(r.patient);
      if (!target || !p) continue;
      const k = p.id + '|' + (r.date || today());
      if (!groups.has(k)) groups.set(k, { p, date: r.date || today(), data: {} });
      groups.get(k).data[target] = r.value;
    }
    for (const g of groups.values()) {
      await DB.put('events', { patientId: g.p.id, registryId: reg.id, type: et.id, date: g.date, data: g.data, status: 'черновик', schemaVersion: reg.version, importedFrom: source }, 'импорт ' + source);
      evs++;
    }
    try { await Audit.log(`импорт ${source}: пациентов новых ${made}, найдено ${found}, событий ${evs}`, 'registries', reg.id); } catch (e) { }
    return { made, found, evs };
  }
};

Routes.interop = async (main) => {
  if (!can('export')) { main.innerHTML = '<div class="head"><h1>Обмен данными: FHIR и HL7</h1></div><p>Доступ ограничен вашей ролью.</p>'; return; }
  const regs = (await Data.registries()).filter(r => !r.archivedAt);
  main.innerHTML = `<div class="head"><h1>Обмен данными: FHIR и HL7</h1></div>
    <div class="card"><p>HL7 FHIR и HL7 версии 2 это международные стандарты обмена медицинскими данными. Через них регистр получает данные из больничных систем (МИС, лаборатория) без ручного ввода и отдаёт данные в другие системы. Постоянное подключение к МИС и ДАМУ настраивается при развёртывании на сервере; здесь можно загрузить и выгрузить файлы.</p></div>
    <div class="cols"><div class="card"><h3>Выгрузка FHIR R4</h3>${regSelect(regs, '', 'ioReg', false)}
      <label class="row"><input type="checkbox" id="ioIds" ${can('users') ? '' : 'disabled'}> с ФИО и ИИН (только для внутренней передачи)</label>
      <button class="btn primary" id="ioOut">Скачать пакет FHIR (JSON)</button>
      <p class="muted small">Пациенты (Patient) с постоянным ID AddAll, поля форм (Observation), диагнозы МКБ-10 (Condition), анкеты (QuestionnaireResponse). Черновики не выгружаются.</p></div>
    <div class="card"><h3>Загрузка FHIR или HL7 v2</h3>${regSelect(regs, '', 'inReg', false)}
      <div class="fld"><label class="flab" for="inEt">Форма, в которую попадут результаты</label><select class="inp" id="inEt"></select></div>
      <input type="file" id="inFile" accept=".json,.ndjson,.hl7,.txt"><div id="inMap"></div>
      <p class="muted small">FHIR: Bundle или NDJSON (Patient, Observation, Condition). HL7 v2: сообщения ADT (сегмент PID) и ORU (OBR, OBX). Пациенты ищутся по ИИН, затем по ID AddAll, затем по № ИБ; новые создаются. События сохраняются черновиками, врач проверяет и завершает их.</p></div></div>`;
  if (!regs.length) return;
  const fillEt = () => { const r = regs.find(x => x.id === $('#inReg', main).value); $('#inEt', main).innerHTML = (r?.eventTypes || []).map(e => `<option value="${esc(e.id)}">${esc(e.name)}</option>`).join(''); $('#inMap', main).innerHTML = ''; };
  fillEt(); $('#inReg', main).onchange = fillEt; $('#inEt', main).onchange = () => { $('#inMap', main).innerHTML = ''; $('#inFile', main).value = ''; };
  $('#ioOut', main).onclick = async () => {
    const reg = regs.find(x => x.id === $('#ioReg', main).value), ids = $('#ioIds', main).checked && can('users');
    if (ids && !await confirmBox('В пакет попадут ФИО и ИИН. Передавайте его только по защищённому каналу. Продолжить?')) return;
    const b = await Interop.bundle(reg, { identifiers: ids });
    download(`FHIR ${reg.name} ${today()}.json`, JSON.stringify(b, null, 1), 'application/fhir+json');
    try { await Audit.log(`выгрузка FHIR${ids ? ' с идентификаторами' : ''}: ресурсов ${b.entry.length}`, 'registries', reg.id); } catch (e) { }
    toast(`Выгружено ресурсов: ${b.entry.length}`);
  };
  $('#inFile', main).onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    const text = await file.text(), reg = regs.find(x => x.id === $('#inReg', main).value), et = etById(reg, $('#inEt', main).value);
    let parsed, source;
    try { if (/^\s*MSH/.test(text)) { parsed = Interop.readV2(text); source = 'HL7 v2'; } else { parsed = Interop.readFhir(text); source = 'FHIR'; } }
    catch (error) { $('#inMap', main).innerHTML = `<p class="bad">Файл не распознан: ${esc(error.message)}</p>`; e.target.value = ''; return; }
    const fields = formFields(et).filter(f => !['calc', 'group', 'complist', 'file', 'image'].includes(f.type));
    const codes = [...new Map(parsed.results.map(r => [r.code, r])).values()];
    const guess = r => (fields.find(f => f.key === r.code) || fields.find(f => r.code.startsWith('icd10:') && f.type === 'icd10') || fields.find(f => f.label.toLowerCase() === String(r.label).toLowerCase()))?.key || '';
    const existing = await Data.patients(reg.id);
    const found = parsed.patients.filter(x => Interop.match(existing, x)).length;
    $('#inMap', main).innerHTML = `<p><b>${source}:</b> пациентов ${parsed.patients.length} (уже в регистре ${found}, новых ${parsed.patients.length - found}), результатов ${parsed.results.length}.</p>
      ${codes.length ? `<table class="tbl"><thead><tr><th>Код</th><th>Название</th><th>Пример</th><th>Поле формы «${esc(et.name)}»</th></tr></thead><tbody>${codes.map((r, i) => `<tr><td class="mono">${esc(r.code)}</td><td>${esc(r.label)}</td><td>${esc(String(r.value))} ${esc(r.unit)}</td>
        <td><select class="inp" data-map="${i}"><option value="">не переносить</option>${fields.map(f => `<option value="${esc(f.key)}" ${guess(r) === f.key ? 'selected' : ''}>${esc(f.label)}${f.unit ? ', ' + esc(f.unit) : ''}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table>` : ''}
      <div class="row end"><button class="btn primary" id="inGo">Загрузить</button></div>`;
    $('#inGo', main).onclick = async () => {
      const map = {}; $$('[data-map]', main).forEach(s => { if (s.value) map[codes[Number(s.dataset.map)].code] = s.value; });
      $('#inGo', main).disabled = true;
      const r = await Interop.apply(reg, parsed, et, map, source);
      $('#inMap', main).innerHTML = `<p class="ok">Готово: новых пациентов ${r.made}, найдено в регистре ${r.found}, событий-черновиков ${r.evs}. Проверьте черновики в карточках пациентов.</p>`;
      e.target.value = '';
    };
  };
};

ROUTE_GROUP.interop = 'Администрирование';
NAV_ICONS.interop = NAV_ICONS.interop || NAV_ICONS.io || NAV_ICONS.me;
{
  const previous = navGroups;
  navGroups = async function () {
    const groups = await previous();
    const adm = groups.find(g => g.id === 'adm');
    if (adm?.items && can('export') && !adm.items.some(x => x && x.r === 'interop')) {
      const at = adm.items.findIndex(x => x && x.r === 'io');
      adm.items.splice(at < 0 ? adm.items.length : at + 1, 0, { r: 'interop', t: 'Обмен FHIR и HL7', i: '⇄' });
    }
    return groups;
  };
}
