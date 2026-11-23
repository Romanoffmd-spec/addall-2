/* AddAll 2.0: настоящие DOCX и XLSX без библиотек, экспорт CDISC ODM, шаблоны документов, файлы и комментарии пациента */
'use strict';

const Office = {
  /* ---------- ZIP (метод store) ---------- */
  crcT: null,
  crc(u8) { if (!this.crcT) { this.crcT = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; this.crcT[n] = c >>> 0; } } let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = this.crcT[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; },
  zip(files) { /* files: [{name, data(string|Uint8Array)}] */
    const enc = new TextEncoder(), parts = [], central = []; let off = 0;
    files.forEach(f => {
      const name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = this.crc(data);
      const h = new DataView(new ArrayBuffer(30)); h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
      central.push(new Uint8Array(c.buffer), name); off += 30 + name.length + data.length;
    });
    const csize = central.reduce((s, x) => s + x.length, 0);
    const e = new DataView(new ArrayBuffer(22)); e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csize, true); e.setUint32(16, off, true);
    return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: 'application/zip' });
  },
  x(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ''); },

  /* ---------- XLSX ---------- */
  xlsx(filename, sheetName, rows) {
    const col = (i) => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
    const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>${rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => { const ref = col(ci) + (ri + 1); if (v == null || v === '') return ''; if (typeof v === 'number' && isFinite(v)) return `<c r="${ref}"${ri === 0 ? ' s="1"' : ''}><v>${v}</v></c>`; return `<c r="${ref}" t="inlineStr"${ri === 0 ? ' s="1"' : ''}><is><t xml:space="preserve">${this.x(Array.isArray(v) ? v.join('; ') : v)}</t></is></c>`; }).join('')}</row>`).join('')}</sheetData><autoFilter ref="A1:${col(Math.max(0, (rows[0] || []).length - 1))}${Math.max(1, rows.length)}"/></worksheet>`;
    const files = [
      { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>' },
      { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${this.x(String(sheetName || 'Данные').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${this.x(String(sheetName || 'Данные').replace(/[\\/?*[\]:']/g, ' ').slice(0, 31))}'!$A$1:$${col(Math.max(0, (rows[0] || []).length - 1))}$${Math.max(1, rows.length)}</definedName></definedNames></workbook>` },
      { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
      { name: 'xl/styles.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>' },
      { name: 'xl/worksheets/sheet1.xml', data: sheet }
    ];
    download(filename, this.zip(files));
  },

  /* ---------- DOCX (поля 1,27 см, Times New Roman 10,5) ---------- */
  docx(filename, html, { font = 'Times New Roman', size = 10.5, margin = 720 } = {}) {
    const box = document.createElement('div'); box.innerHTML = html;
    const runs = (node, st = {}) => {
      let out = '';
      node.childNodes.forEach(n => {
        if (n.nodeType === 3) { const t = n.textContent; if (!t) return; out += `<w:r><w:rPr>${st.b ? '<w:b/>' : ''}${st.i ? '<w:i/>' : ''}${st.u ? '<w:u w:val="single"/>' : ''}${st.sup ? '<w:vertAlign w:val="superscript"/>' : ''}${st.sub ? '<w:vertAlign w:val="subscript"/>' : ''}${st.hl ? '<w:highlight w:val="yellow"/>' : ''}</w:rPr><w:t xml:space="preserve">${this.x(t)}</w:t></w:r>`; return; }
        if (n.nodeType !== 1) return; const tg = n.tagName;
        if (tg === 'BR') { out += '<w:r><w:br/></w:r>'; return; }
        const s2 = { ...st }; if (/^(B|STRONG)$/.test(tg)) s2.b = 1; if (/^(I|EM)$/.test(tg)) s2.i = 1; if (tg === 'U') s2.u = 1; if (tg === 'SUP') s2.sup = 1; if (tg === 'SUB') s2.sub = 1; if (tg === 'MARK' || n.style?.backgroundColor === 'yellow') s2.hl = 1;
        out += runs(n, s2);
      });
      return out;
    };
    const para = (inner, { style, align, numText } = {}) => `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${align ? `<w:jc w:val="${align}"/>` : ''}<w:spacing w:after="80"/></w:pPr>${numText ? `<w:r><w:t xml:space="preserve">${this.x(numText)}</w:t></w:r>` : ''}${inner}</w:p>`;
    const blocks = (root) => {
      let out = '';
      root.childNodes.forEach(n => {
        if (n.nodeType === 3) { if (n.textContent.trim()) out += para(runs({ childNodes: [n] })); return; }
        if (n.nodeType !== 1) return; const tg = n.tagName, al = n.style?.textAlign === 'center' ? 'center' : n.style?.textAlign === 'right' ? 'right' : n.style?.textAlign === 'justify' ? 'both' : '';
        if (/^H[1-3]$/.test(tg)) out += para(runs(n), { style: 'Heading' + tg[1], align: al });
        else if (tg === 'P' || tg === 'DIV' && !n.querySelector('p,h1,h2,h3,table,ul,ol,div')) out += para(runs(n), { align: al });
        else if (tg === 'PRE') String(n.textContent).split('\n').forEach(l => out += para(`<w:r><w:t xml:space="preserve">${this.x(l)}</w:t></w:r>`));
        else if (tg === 'UL' || tg === 'OL') [...n.children].forEach((li, i) => out += para(runs(li), { numText: tg === 'OL' ? `${i + 1}. ` : '• ' }));
        else if (tg === 'TABLE') {
          const rows = [...n.querySelectorAll('tr')];
          out += `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(b => `<w:${b} w:val="single" w:sz="4" w:color="000000"/>`).join('')}</w:tblBorders></w:tblPr>${rows.map(tr => `<w:tr>${[...tr.children].map(td => `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr>${para(runs(td, td.tagName === 'TH' ? { b: 1 } : {}))}</w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>${para('')}`;
        }
        else if (tg === 'HR') out += para('');
        else out += blocks(n);
      });
      return out;
    };
    const hp = Math.round(size * 2);
    const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${blocks(box)}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="${margin}" w:right="${margin}" w:bottom="${margin}" w:left="${margin}" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}" w:eastAsia="${font}"/><w:sz w:val="${hp}"/><w:szCs w:val="${hp}"/><w:lang w:val="ru-RU"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="252" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
      <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
      ${[1, 2, 3].map(l => `<w:style w:type="paragraph" w:styleId="Heading${l}"><w:name w:val="heading ${l}"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="${240 - l * 40}" w:after="80"/><w:outlineLvl w:val="${l - 1}"/></w:pPr><w:rPr><w:b/><w:sz w:val="${hp + (4 - l) * 4}"/></w:rPr></w:style>`).join('')}</w:styles>`;
    download(filename, this.zip([
      { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>' },
      { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
      { name: 'word/_rels/document.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
      { name: 'word/document.xml', data: doc }, { name: 'word/styles.xml', data: styles }
    ]));
  },

  /* ---------- CDISC ODM 1.3.2 ---------- */
  odm(reg) {
    const dt = (f) => ({ number: 'float', date: 'date', yesno: 'text', calc: 'text' })[f.type] || 'text';
    const cl = [], items = [];
    const allF = [{ id: 'patient', name: 'Карточка пациента', fields: reg.patientFields || [] }, ...reg.eventTypes.map(et => ({ id: et.id, name: et.name, et }))];
    reg.eventTypes.forEach(et => formFields(et).forEach(f => { items.push({ f, oid: `IT.${et.id}.${f.key}` }); if ((f.options || []).length || f.type === 'yesno') cl.push({ oid: `CL.${et.id}.${f.key}`, opts: f.type === 'yesno' ? ['да', 'нет', 'неизвестно'] : f.options }); }));
    (reg.patientFields || []).forEach(f => { items.push({ f, oid: `IT.patient.${f.key}` }); if ((f.options || []).length) cl.push({ oid: `CL.patient.${f.key}`, opts: f.options }); });
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ODM xmlns="http://www.cdisc.org/ns/odm/v1.3" ODMVersion="1.3.2" FileType="Snapshot" FileOID="AddAll.${this.x(reg.id)}" CreationDateTime="${nowISO()}" Originator="AddAll 2.0">
 <Study OID="ST.${this.x(reg.id)}"><GlobalVariables><StudyName>${this.x(reg.name)}</StudyName><StudyDescription>${this.x(reg.description || '')}</StudyDescription><ProtocolName>${this.x(reg.name)}</ProtocolName></GlobalVariables>
  <MetaDataVersion OID="MDV.${reg.version}" Name="v${reg.version}">
   <Protocol>${reg.eventTypes.map(et => `<StudyEventRef StudyEventOID="SE.${et.id}" Mandatory="No"/>`).join('')}</Protocol>
   ${reg.eventTypes.map(et => `<StudyEventDef OID="SE.${et.id}" Name="${this.x(et.name)}" Repeating="${et.single ? 'No' : 'Yes'}" Type="Common"><FormRef FormOID="F.${et.id}" Mandatory="Yes"/></StudyEventDef>`).join('\n   ')}
   ${reg.eventTypes.map(et => `<FormDef OID="F.${et.id}" Name="${this.x(et.name)}" Repeating="No">${(et.sections || []).map((s, i) => `<ItemGroupRef ItemGroupOID="IG.${et.id}.${i}" Mandatory="No"/>`).join('')}</FormDef>`).join('\n   ')}
   ${reg.eventTypes.map(et => (et.sections || []).map((s, i) => `<ItemGroupDef OID="IG.${et.id}.${i}" Name="${this.x(s.title)}" Repeating="No">${(s.fields || []).map(f => `<ItemRef ItemOID="IT.${et.id}.${f.key}" Mandatory="${f.required ? 'Yes' : 'No'}"/>`).join('')}</ItemGroupDef>`).join('\n   ')).join('\n   ')}
   ${items.map(({ f, oid }) => `<ItemDef OID="${oid}" Name="${this.x(f.key)}" DataType="${dt(f)}"><Question><TranslatedText xml:lang="ru">${this.x(f.label)}</TranslatedText></Question>${f.def ? `<Description><TranslatedText xml:lang="ru">${this.x(f.def)}</TranslatedText></Description>` : ''}${f.unit ? `<MeasurementUnitRef MeasurementUnitOID="MU.${this.x(f.unit)}"/>` : ''}${cl.some(c => c.oid === oid.replace('IT.', 'CL.')) ? `<CodeListRef CodeListOID="${oid.replace('IT.', 'CL.')}"/>` : ''}</ItemDef>`).join('\n   ')}
   ${cl.map(c => `<CodeList OID="${c.oid}" Name="${c.oid}" DataType="text">${c.opts.map(o => `<CodeListItem CodedValue="${this.x(o)}"><Decode><TranslatedText xml:lang="ru">${this.x(o)}</TranslatedText></Decode></CodeListItem>`).join('')}</CodeList>`).join('\n   ')}
  </MetaDataVersion></Study></ODM>`;
    download(slug(reg.name) + '_odm.xml', xml.replace(/<MeasurementUnitRef[^>]*\/>/g, ''), 'application/xml');
  }
};

/* ---------- шаблоны документов ---------- */
const DOC_STARTERS = {
  op: { name: 'Протокол операции', body: `<h2 style="text-align:center">ПРОТОКОЛ ОПЕРАЦИИ</h2>\n<p><b>Пациент:</b> {{fio}}, {{age}} лет, № ИБ {{localId}}</p>\n<p><b>Дата операции:</b> {{surgery.date}}</p>\n<p><b>Диагноз:</b> </p>\n<p><b>Операция:</b> {{surgery.procedure}}, доступ: {{surgery.approach}}</p>\n<p><b>Ход операции:</b> </p>\n<p><b>Кровопотеря:</b> {{surgery.blood_loss}} мл. <b>Длительность:</b> {{surgery.op_time}} мин.</p>\n<p><b>Хирург:</b> {{surgery.surgeon}}</p>` },
  dis: { name: 'Выписной эпикриз (черновик)', body: `<h2 style="text-align:center">ВЫПИСНОЙ ЭПИКРИЗ</h2>\n<p><b>Пациент:</b> {{fio}}, {{dob}} г.р., № ИБ {{localId}}</p>\n<p><b>Операция:</b> {{surgery.date}}, {{surgery.procedure}}</p>\n<p><b>Послеоперационный период:</b> осложнения: {{surgery.complications}}; койко-день после операции: {{surgery.los}}</p>\n<p><b>Гистологическое заключение:</b> {{path.pt}} {{path.pn}}, {{path.r}}, лимфоузлов {{path.ln_total}}</p>\n<p><b>Рекомендации:</b> </p>\n<p>Лечащий врач: {{user}}  ____________  {{today}}</p>` },
  ref: { name: 'Письмо врачу ПМСП', body: `<p style="text-align:right">Врачу ПМСП</p>\n<p>Уважаемый коллега!</p>\n<p>Сообщаем, что пациент {{fio}}, {{dob}} г.р., находился на лечении в {{center}}.</p>\n<p>{{summary}}</p>\n<p>Рекомендации: </p>\n<p>С уважением, {{user}}, {{today}}</p>` }
};
function fillTemplate(body, p, reg, events, users) {
  const ev = (et) => events.filter(e => e.patientId === p.id && e.type === et).sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
  const summary = events.filter(e => e.patientId === p.id).sort((a, b) => (a.date || '').localeCompare(b.date || '')).map(e => { const et = etById(reg, e.type); if (!et) return ''; const v = computeValues(reg, p, et, e.data, e.date); return `${et.name} (${fmtDate(e.date)}): ` + formFields(et).filter(f => (f.required || f.key_) && !isEmpty(v[f.key])).slice(0, 8).map(f => `${f.label}: ${showVal(f, v[f.key], users).replace(/<[^>]+>/g, ' ')}`).join('; '); }).filter(Boolean).join('. ');
  const base = { fio: pname(p), dob: fmtDate(p.birthDate), age: FX.age(p.birthDate) ?? '', localId: p.localId, sex: p.sex, today: fmtDate(today()), user: Auth.user.name, center: Settings.data.center || '', department: Settings.data.department || '', summary };
  return body.replace(/\{\{\s*([\wЀ-ӿ.]+)\s*\}\}/g, (m, k) => {
    if (k in base) return esc(base[k]);
    const [etId, key] = k.split('.'); const et = etById(reg, etId); const e = ev(etId); if (!et || !e) return '<mark>нет данных</mark>';
    if (key === 'date') return fmtDate(e.date);
    const f = formFields(et).find(x => x.key === key); const v = computeValues(reg, p, et, e.data, e.date)[key];
    return isEmpty(v) ? '<mark>не указано</mark>' : f ? showVal(f, v, users).replace(/<div[^>]*>|<\/div>|<span[^>]*>|<\/span>/g, ' ') : esc(v);
  });
}
Routes.doctpl = async (main, id) => {
  const [tpls, regs] = await Promise.all([DB.all('doctpl'), Data.registries()]);
  if (!id) {
    main.innerHTML = `<div class="head"><div><h1>Шаблоны документов</h1><div class="sub">Протоколы операций, эпикризы, письма, протоколы МДГ: текст с подстановками {{поле}} из карточки пациента. Документ формируется из карточки («Документы»), печатается или скачивается в Word (.docx, поля 1,27 см, Times New Roman 10,5).</div></div><button class="btn primary" id="dtNew">+ Шаблон</button></div>
      ${tpls.length ? `<table class="tbl hover"><thead><tr><th>Шаблон</th><th>Регистр</th><th>Изменён</th></tr></thead><tbody>${tpls.map(t => `<tr data-id="${t.id}"><td><b>${esc(t.name)}</b></td><td>${esc(regs.find(r => r.id === t.registryId)?.name || 'любой')}</td><td class="muted">${fmtDT(t.updatedAt)}</td></tr>`).join('')}</tbody></table>` : emptyState('Шаблонов пока нет.')}`;
    $$('tr[data-id]', main).forEach(tr => tr.onclick = () => go('doctpl/' + tr.dataset.id));
    $('#dtNew').onclick = () => { const m = modal(`<h3>Новый шаблон</h3><div class="tpls">${Object.entries({ blank: { name: 'Пустой' }, ...DOC_STARTERS }).map(([k, t], i) => `<label class="tpl"><input type="radio" name="ds" value="${k}" ${i === 0 ? 'checked' : ''}><b>${esc(t.name)}</b></label>`).join('')}</div><div class="row end"><button class="btn primary" id="ds_ok">Создать</button></div>`);
      $('#ds_ok', m).onclick = async () => { const k = $('input[name=ds]:checked', m).value; const t = await DB.put('doctpl', { name: k === 'blank' ? 'Новый шаблон' : DOC_STARTERS[k].name, registryId: regs[0]?.id || '', body: k === 'blank' ? '<p>{{fio}}, {{age}} лет</p>' : DOC_STARTERS[k].body }, 'создание шаблона'); m.close(); go('doctpl/' + t.id); }; };
    return;
  }
  const t = await DB.get('doctpl', id); if (!t) return go('doctpl');
  const reg = () => regs.find(r => r.id === $('#dt_r').value);
  const ph = () => { const r = reg(); return [['fio', 'ФИО'], ['dob', 'дата рождения'], ['age', 'возраст'], ['localId', '№ ИБ'], ['sex', 'пол'], ['today', 'сегодня'], ['user', 'текущий врач'], ['center', 'учреждение'], ['summary', 'краткая сводка событий'], ...(r ? r.eventTypes.flatMap(et => [[et.id + '.date', et.name + ': дата'], ...formFields(et).map(f => [et.id + '.' + f.key, et.name + ': ' + f.label])]) : [])]; };
  main.innerHTML = `<div class="head"><div><a class="muted" href="#doctpl">← Шаблоны</a><h1>${esc(t.name)}</h1></div><div class="row"><button class="btn danger" id="dt_del">Удалить</button><button class="btn primary" id="dt_s">Сохранить</button></div></div>
    <div class="cols"><div class="card"><div class="grid"><div class="fld"><label class="flab">Название</label><input class="inp" id="dt_n" value="${esc(t.name)}"></div><div class="fld"><label class="flab">Регистр</label>${regSelect(regs, t.registryId, 'dt_r', false)}</div></div>
      <div class="rtbar">${[['bold', 'Ж'], ['italic', 'К'], ['underline', 'Ч'], ['justifyCenter', '≡'], ['insertUnorderedList', '•']].map(([c, l]) => `<button data-c="${c}">${l}</button>`).join('')}<button data-c="hiliteColor">выделить</button></div>
      <div class="rt" id="dt_b" contenteditable="true">${t.body}</div></div>
      <div class="card"><h3>Подстановки</h3><input class="inp" id="dt_q" placeholder="Поиск поля"><div id="dt_ph" style="max-height:60vh;overflow:auto;margin-top:8px"></div></div></div>`;
  const drawPh = () => { const q = $('#dt_q').value.toLowerCase(); $('#dt_ph').innerHTML = ph().filter(([k, l]) => !q || (k + l).toLowerCase().includes(q)).map(([k, l]) => `<button class="mn-it" data-k="${k}"><span>${esc(l)}</span><em class="cnt mono">{{${esc(k)}}}</em></button>`).join(''); $$('[data-k]', $('#dt_ph')).forEach(b => b.onmousedown = e => { e.preventDefault(); $('#dt_b').focus(); document.execCommand('insertText', false, `{{${b.dataset.k}}}`); }); };
  drawPh(); $('#dt_q').oninput = drawPh; $('#dt_r').onchange = drawPh;
  $$('.rtbar [data-c]', main).forEach(b => b.onmousedown = e => { e.preventDefault(); document.execCommand(b.dataset.c, false, b.dataset.c === 'hiliteColor' ? 'yellow' : null); });
  $('#dt_s').onclick = async () => { Object.assign(t, { name: $('#dt_n').value, registryId: $('#dt_r').value, body: $('#dt_b').innerHTML }); await DB.put('doctpl', t, 'изменение шаблона'); toast('Сохранено'); };
  $('#dt_del').onclick = async () => { if (await confirmBox('Удалить шаблон?')) { await DB.del('doctpl', t.id); go('doctpl'); } };
};
async function docFromTemplate(p, reg, events, users) {
  const tpls = (await DB.all('doctpl')).filter(t => !t.registryId || t.registryId === reg.id);
  if (!tpls.length) return toast(can('design') ? 'Создайте шаблон: Администрирование → Шаблоны документов' : 'Шаблонов документов пока нет', 'err');
  const m = modal(`<h2>Документ по шаблону</h2><div class="row"><select class="inp" id="df_t">${tpls.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select><button class="btn" id="df_go">Сформировать</button></div>
    <p class="muted small">Подставленные значения можно править прямо в тексте. «Нет данных» выделено жёлтым.</p><div class="rt" id="df_b" contenteditable="true"></div>
    <div class="row end"><button class="btn" id="df_p">Печать / PDF</button><button class="btn primary" id="df_w">Word (.docx)</button></div>`, { full: true });
  const gen = () => { const t = tpls.find(x => x.id === $('#df_t', m).value); $('#df_b', m).innerHTML = fillTemplate(t.body, p, reg, events, users); };
  gen(); $('#df_go', m).onclick = gen; $('#df_t', m).onchange = gen;
  $('#df_p', m).onclick = () => printDoc($('#df_t', m).selectedOptions[0].textContent, $('#df_b', m).innerHTML);
  $('#df_w', m).onclick = () => { Office.docx(slug($('#df_t', m).selectedOptions[0].textContent + '_' + p.localId) + '.docx', $('#df_b', m).innerHTML); Audit.log('документ Word', 'patients', p.id, null, null); };
}

/* ---------- файлы и комментарии пациента ---------- */
const PFiles = {
  async card(p, reg) {
    const [files, cm] = await Promise.all([DB.all('files'), DB.all('comments')]);
    const F_ = files.filter(f => f.patientId === p.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), C_ = cm.filter(c => c.patientId === p.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return `<div class="card files"><div class="row between"><h3>Файлы (${F_.length})</h3>${can('enter') ? '<label class="btn xs">+ Загрузить<input type="file" id="pfUp" multiple hidden></label>' : ''}</div>
      ${F_.map(f => `<div class="fi"><span>${/pdf/.test(f.type) ? '📄' : /image/.test(f.type) ? '🖼' : '📎'}</span><a href="javascript:void 0" data-fo="${f.id}">${esc(f.name)}</a><span class="muted small">${Math.round(f.size / 1024)} КБ</span>${AI.ready() && can('enter') ? `<button class="btn xs ai" data-fai="${f.id}" title="Разобрать файл ИИ">✦</button>` : ''}${can('delete') ? `<button class="btn xs" data-fd="${f.id}">×</button>` : ''}</div>`).join('') || ('<p class="muted small">Протоколы, выписки, гистология, снимки: ' + (typeof NET !== 'undefined' && NET.on ? 'хранятся на сервере.' : 'хранятся только в этом браузере.') + '</p>')}</div>
      <div class="card"><h3>Комментарии (${C_.length})</h3>${C_.map(c => `<div class="cmt"><b>${esc(c.name)}</b> <span class="muted small">${fmtDT(c.createdAt)}</span><div>${esc(c.text)}</div></div>`).join('') || '<p class="muted small">Пока нет.</p>'}
      <div class="row" style="margin-top:8px"><input class="inp" id="pcT" placeholder="Комментарий для коллег" style="flex:1"><button class="btn sm" id="pcA">Добавить</button></div></div>`;
  },
  bind(root, p, reg) {
    const up = $('#pfUp', root); if (up) up.onchange = async () => { for (const f of up.files) await DB.put('files', { patientId: p.id, name: f.name, type: f.type, size: f.size, blob: f }, 'загрузка файла'); toast('Загружено'); App.route(); };
    $$('[data-fo]', root).forEach(a => a.onclick = async () => { const f = await DB.get('files', a.dataset.fo); window.open(URL.createObjectURL(f.blob), '_blank'); });
    $$('[data-fd]', root).forEach(b => b.onclick = async () => { if (await confirmBox('Удалить файл?')) { await DB.del('files', b.dataset.fd); App.route(); } });
    $$('[data-fai]', root).forEach(b => b.onclick = async () => { const f = await DB.get('files', b.dataset.fai); AI.fullParse(reg, p, new File([f.blob], f.name, { type: f.type })); });
    const ca = $('#pcA', root); if (ca) ca.onclick = async () => { const t = $('#pcT', root).value.trim(); if (!t) return; await DB.put('comments', { patientId: p.id, text: t, name: Auth.user.name }, 'комментарий'); App.route(); };
  }
};
