/* AddAll 2.0: литература (DOI, PubMed, RIS/BibTeX, стили) и рукописи с цитатами */
'use strict';

const Lib = {
  au: (a) => (a.family || '') + (a.given ? ' ' + a.given : ''),
  ini: (g, dots = false) => String(g || '').split(/[\s-]+/).filter(Boolean).map(x => x[0].toUpperCase() + (dots ? '.' : '')).join(dots ? ' ' : ''),
  fmt(r, style = 'vancouver') {
    const A = r.authors || [];
    if (style === 'apa') {
      const au = A.length ? A.slice(0, 20).map(a => `${a.family}, ${this.ini(a.given, true)}`).join(', ').replace(/, ([^,]+)$/, A.length > 1 ? ', & $1' : ', $1') : '';
      return `${esc(au)} (${esc(r.year || 'б. г.')}). ${esc(r.title || '')}. <i>${esc(r.journal || '')}</i>${r.volume ? `, <i>${esc(r.volume)}</i>` : ''}${r.issue ? `(${esc(r.issue)})` : ''}${r.pages ? `, ${esc(r.pages)}` : ''}.${r.doi ? ` https://doi.org/${esc(r.doi)}` : ''}`;
    }
    if (style === 'gost') {
      const au = A.slice(0, 3).map(a => `${a.family} ${this.ini(a.given, true)}`).join(', ') + (A.length > 3 ? ' [и др.]' : '');
      return `${esc(au)} ${esc(r.title || '')} // ${esc(r.journal || '')}. ${esc(r.year || '')}.${r.volume ? ` Т. ${esc(r.volume)},` : ''}${r.issue ? ` № ${esc(r.issue)}.` : ''}${r.pages ? ` С. ${esc(r.pages)}.` : ''}${r.doi ? ` DOI: ${esc(r.doi)}.` : ''}`;
    }
    const au = A.length > 6 ? A.slice(0, 6).map(a => `${a.family} ${this.ini(a.given)}`).join(', ') + ', et al' : A.map(a => `${a.family} ${this.ini(a.given)}`).join(', ');
    return `${esc(au)}. ${esc(r.title || '')}. ${esc(r.journal || '')}. ${esc(r.year || '')}${r.volume ? `;${esc(r.volume)}` : ''}${r.issue ? `(${esc(r.issue)})` : ''}${r.pages ? `:${esc(r.pages)}` : ''}.${r.doi ? ` doi:${esc(r.doi)}` : ''}${r.pmid ? ` PMID: ${esc(r.pmid)}` : ''}`;
  },
  inText(r, n, style) { if (style === 'apa') { const A = r.authors || []; const f = A[0]?.family || '?'; return `(${f}${A.length > 2 ? ' et al.' : A.length === 2 ? ' & ' + A[1].family : ''}, ${r.year || 'б. г.'})`; } return `[${n}]`; },
  async fromDoi(doi) {
    doi = String(doi).trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '');
    const r = await fetch('https://api.crossref.org/works/' + encodeURIComponent(doi)); if (!r.ok) throw new Error('DOI не найден в Crossref');
    const m = (await r.json()).message;
    return { type: 'article', title: (m.title || [''])[0], authors: (m.author || []).map(a => ({ family: a.family || a.name || '', given: a.given || '' })), journal: (m['container-title'] || [''])[0], year: String((m.issued?.['date-parts']?.[0] || [''])[0] || ''), volume: m.volume || '', issue: m.issue || '', pages: m.page || '', doi: m.DOI || doi, url: m.URL || '' };
  },
  async fromPmids(ids) {
    const r = await fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(',')}`); if (!r.ok) throw new Error('PubMed недоступен');
    const j = await r.json();
    return ids.map(id => j.result?.[id]).filter(Boolean).map(s => ({ type: 'article', title: String(s.title || '').replace(/\.$/, ''), authors: (s.authors || []).filter(a => a.authtype === 'Author').map(a => { const [f, ...g] = a.name.split(' '); return { family: f, given: g.join(' ') }; }), journal: s.source || s.fulljournalname || '', year: String(s.pubdate || '').slice(0, 4), volume: s.volume || '', issue: s.issue || '', pages: s.pages || '', pmid: String(s.uid), doi: (s.articleids || []).find(x => x.idtype === 'doi')?.value || '' }));
  },
  async searchPubmed(q) {
    const r = await fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=20&term=${encodeURIComponent(q)}`); const j = await r.json();
    const ids = j.esearchresult?.idlist || []; return ids.length ? this.fromPmids(ids) : [];
  },
  parseRIS(t) {
    return t.split(/\nER\s+-.*\n?/).map(b => { const r = { authors: [], type: 'article' }; b.split('\n').forEach(l => { const m = l.match(/^([A-Z][A-Z0-9])\s+-\s?(.*)$/); if (!m) return; const [, k, v] = m; if (['AU', 'A1'].includes(k)) { const [f, g] = v.split(','); r.authors.push({ family: (f || '').trim(), given: (g || '').trim() }); } else if (['TI', 'T1'].includes(k)) r.title = v.trim(); else if (['JO', 'JF', 'T2'].includes(k)) r.journal = r.journal || v.trim(); else if (['PY', 'Y1'].includes(k)) r.year = v.slice(0, 4); else if (k === 'VL') r.volume = v; else if (k === 'IS') r.issue = v; else if (k === 'SP') r.pages = v + (r.pages || ''); else if (k === 'EP') r.pages = (r.pages || '') + '-' + v; else if (k === 'DO') r.doi = v.trim(); else if (k === 'AB') r.abstract = v; }); return r; }).filter(r => r.title);
  },
  parseBib(t) {
    return t.split(/@\w+\s*\{/).slice(1).map(b => { const g = (k) => { const m = b.match(new RegExp(k + '\\s*=\\s*[{"]([^]*?)[}"]\\s*,?\\s*\\n', 'i')); return m ? m[1].replace(/[{}]/g, '').trim() : ''; };
      return { type: 'article', title: g('title'), journal: g('journal') || g('booktitle'), year: g('year'), volume: g('volume'), issue: g('number'), pages: g('pages').replace('--', '-'), doi: g('doi'), authors: g('author').split(/\s+and\s+/).filter(Boolean).map(a => { const [f, gv] = a.includes(',') ? a.split(',') : [a.split(' ').pop(), a.split(' ').slice(0, -1).join(' ')]; return { family: f.trim(), given: (gv || '').trim() }; }) }; }).filter(r => r.title);
  },
  toRIS(rs) { return rs.map(r => ['TY  - JOUR', ...(r.authors || []).map(a => `AU  - ${a.family}, ${a.given}`), `TI  - ${r.title}`, `JO  - ${r.journal || ''}`, `PY  - ${r.year || ''}`, r.volume && `VL  - ${r.volume}`, r.issue && `IS  - ${r.issue}`, r.pages && `SP  - ${r.pages}`, r.doi && `DO  - ${r.doi}`, 'ER  - '].filter(Boolean).join('\n')).join('\n\n'); },
  toBib(rs) { return rs.map((r, i) => `@article{${slug((r.authors?.[0]?.family || 'ref') + (r.year || i))},\n  author = {${(r.authors || []).map(a => `${a.family}, ${a.given}`).join(' and ')}},\n  title = {${r.title}},\n  journal = {${r.journal || ''}},\n  year = {${r.year || ''}},\n  volume = {${r.volume || ''}},\n  number = {${r.issue || ''}},\n  pages = {${r.pages || ''}},\n  doi = {${r.doi || ''}}\n}`).join('\n\n'); },
  async addMany(list) { const ex = await DB.all('refs'); let n = 0; for (const r of list) { if (ex.some(x => (r.doi && x.doi && x.doi.toLowerCase() === r.doi.toLowerCase()) || (r.pmid && x.pmid === r.pmid) || (x.title || '').toLowerCase() === (r.title || '').toLowerCase())) continue; await DB.put('refs', r, 'добавление источника'); n++; } return n; }
};

Routes.library = async (main) => {
  const refs = (await DB.all('refs')).sort((a, b) => (b.year || '').localeCompare(a.year || ''));
  const st = Routes.library.st || (Routes.library.st = { q: '', style: 'vancouver' });
  main.innerHTML = `<div class="head"><div><h1>Литература</h1><div class="sub">Общая библиотека источников: по DOI (Crossref), PMID и поиску PubMed, импорт RIS и BibTeX из Zotero, EndNote, Mendeley. Источники цитируются в рукописях.</div></div>
    <div class="row"><select class="inp" id="lbS">${[['vancouver', 'Vancouver'], ['apa', 'APA 7'], ['gost', 'ГОСТ Р 7.0.5']].map(([k, l]) => `<option value="${k}" ${st.style === k ? 'selected' : ''}>${l}</option>`).join('')}</select><button class="btn" id="lbX">Экспорт RIS</button><button class="btn" id="lbB">BibTeX</button><button class="btn primary" id="lbAdd">+ Добавить</button></div></div>
    <div class="card"><div class="row"><input class="inp" id="lbQ" placeholder="Поиск по библиотеке" value="${esc(st.q)}" style="flex:1"><input class="inp" id="lbPm" placeholder="Поиск в PubMed: например, total neoadjuvant therapy rectal cancer" style="flex:2"><button class="btn" id="lbPmGo">Искать в PubMed</button></div><div id="lbPmR"></div></div>
    <div class="card"><h3>В библиотеке: ${refs.length}</h3><div id="lbL"></div></div>`;
  const draw = () => { const q = st.q.toLowerCase(); const L = refs.filter(r => !q || JSON.stringify(r).toLowerCase().includes(q));
    $('#lbL').innerHTML = L.map(r => `<div class="ref"><div class="row between"><div style="flex:1">${Lib.fmt(r, st.style)}</div><div class="row">${r.doi ? `<a class="btn xs" target="_blank" href="https://doi.org/${esc(r.doi)}">DOI</a>` : ''}${r.pmid ? `<a class="btn xs" target="_blank" href="https://pubmed.ncbi.nlm.nih.gov/${esc(r.pmid)}">PubMed</a>` : ''}<button class="btn xs" data-ed="${r.id}">✎</button><button class="btn xs" data-del="${r.id}">×</button></div></div></div>`).join('') || '<p class="muted">Пусто.</p>';
    $$('[data-del]', main).forEach(b => b.onclick = async () => { if (await confirmBox('Удалить источник?')) { await DB.del('refs', b.dataset.del); App.route(); } });
    $$('[data-ed]', main).forEach(b => b.onclick = () => refDialog(refs.find(r => r.id === b.dataset.ed))); };
  draw();
  $('#lbQ').oninput = e => { st.q = e.target.value; draw(); };
  $('#lbS').onchange = e => { st.style = e.target.value; draw(); };
  $('#lbX').onclick = () => download('library.ris', Lib.toRIS(refs), 'application/x-research-info-systems');
  $('#lbB').onclick = () => download('library.bib', Lib.toBib(refs), 'text/plain');
  $('#lbAdd').onclick = () => {
    const m = modal(`<h3>Добавить источники</h3><div class="fld"><label class="flab">DOI или PMID (по одному в строке)</label><textarea class="inp" id="la_ids" rows="4" placeholder="10.1016/S1470-2045(20)30555-6&#10;33301740"></textarea></div><div class="row"><button class="btn primary" id="la_go">Найти и добавить</button><button class="btn" id="la_man">Вручную</button></div>
      <hr><div class="fld"><label class="flab">Импорт RIS или BibTeX (файл или вставить текст)</label><input type="file" id="la_f" accept=".ris,.bib,.txt"><textarea class="inp" id="la_t" rows="5" placeholder="TY  - JOUR ... или @article{...}"></textarea></div><button class="btn" id="la_imp">Импортировать</button><div id="la_r"></div>`, { wide: true });
    $('#la_f', m).onchange = async e => $('#la_t', m).value = await e.target.files[0].text();
    $('#la_go', m).onclick = async () => { const ids = $('#la_ids', m).value.split(/\s+/).filter(Boolean); const out = []; const errs = [];
      for (const id of ids) { try { if (/^\d{5,9}$/.test(id)) out.push(...await Lib.fromPmids([id])); else out.push(await Lib.fromDoi(id)); } catch (e) { errs.push(id + ': ' + e.message); } }
      const n = await Lib.addMany(out); $('#la_r', m).innerHTML = `<p>Добавлено: <b>${n}</b>${errs.length ? `<br><span class="bad">${esc(errs.join('; '))}</span>` : ''}</p>`; if (n) setTimeout(() => { m.close(); App.route(); }, 700); };
    $('#la_imp', m).onclick = async () => { const t = $('#la_t', m).value; const L = /@\w+\s*\{/.test(t) ? Lib.parseBib(t) : Lib.parseRIS(t); const n = await Lib.addMany(L); toast(`Импортировано: ${n} из ${L.length}`); m.close(); App.route(); };
    $('#la_man', m).onclick = () => { m.close(); refDialog(null); };
  };
  $('#lbPmGo').onclick = async () => { const q = $('#lbPm').value.trim(); if (!q) return; $('#lbPmR').innerHTML = '<p class="muted">Ищу…</p>';
    try { const L = await Lib.searchPubmed(q); $('#lbPmR').innerHTML = L.map((r, i) => `<div class="ref row between"><div style="flex:1">${Lib.fmt(r)}</div><button class="btn xs" data-pa="${i}">+ в библиотеку</button></div>`).join('') || '<p class="muted">Ничего не найдено</p>';
      $$('[data-pa]', main).forEach(b => b.onclick = async () => { const n = await Lib.addMany([L[b.dataset.pa]]); b.textContent = n ? '✓ добавлено' : 'уже есть'; b.disabled = true; }); }
    catch (e) { $('#lbPmR').innerHTML = `<p class="bad">${esc(e.message)}. Нужен интернет.</p>`; } };
};
function refDialog(r) {
  r = r ? clone(r) : { type: 'article', authors: [] };
  const m = modal(`<h3>Источник</h3><div class="grid"><div class="fld wide"><label class="flab">Название</label><input class="inp" id="rf_t" value="${esc(r.title || '')}"></div>
    <div class="fld wide"><label class="flab">Авторы (по строке: Фамилия, Имя)</label><textarea class="inp" id="rf_a" rows="3">${esc((r.authors || []).map(a => `${a.family}, ${a.given}`).join('\n'))}</textarea></div>
    ${[['journal', 'Журнал'], ['year', 'Год'], ['volume', 'Том'], ['issue', 'Номер'], ['pages', 'Страницы'], ['doi', 'DOI'], ['pmid', 'PMID']].map(([k, l]) => `<div class="fld"><label class="flab">${l}</label><input class="inp" data-rk="${k}" value="${esc(r[k] || '')}"></div>`).join('')}
    <div class="fld wide"><label class="flab">Заметки</label><textarea class="inp" id="rf_n" rows="2">${esc(r.note || '')}</textarea></div></div><div class="row end"><button class="btn primary" id="rf_ok">Сохранить</button></div>`, { wide: true });
  $('#rf_ok', m).onclick = async () => { r.title = $('#rf_t', m).value.trim(); r.authors = $('#rf_a', m).value.split('\n').filter(Boolean).map(l => { const [f, g] = l.split(','); return { family: f.trim(), given: (g || '').trim() }; }); $$('[data-rk]', m).forEach(i => r[i.dataset.rk] = i.value.trim()); r.note = $('#rf_n', m).value; if (!r.title) return toast('Нужно название', 'err'); await DB.put('refs', r, 'источник'); m.close(); App.route(); };
}

/* ---------- рукописи ---------- */
const MS_KINDS = {
  article: { name: 'Оригинальная статья (IMRaD)', secs: ['Аннотация', 'Введение', 'Материалы и методы', 'Результаты', 'Обсуждение', 'Заключение'] },
  protocol: { name: 'Протокол исследования (SPIRIT)', secs: ['Резюме', 'Обоснование', 'Цели и задачи', 'Дизайн исследования', 'Участники: критерии включения и исключения', 'Вмешательства', 'Исходы', 'Размер выборки', 'Рандомизация и сокрытие', 'Сбор и управление данными', 'Статистический анализ', 'Этика и согласие', 'Мониторинг и безопасность'] },
  case: { name: 'Клинический случай (CARE)', secs: ['Аннотация', 'Введение', 'Описание случая', 'Обсуждение', 'Заключение', 'Согласие пациента'] },
  thesis: { name: 'Тезисы', secs: ['Цель', 'Материалы и методы', 'Результаты', 'Выводы'] },
  free: { name: 'Свободный документ', secs: ['Текст'] }
};
Routes.writing = async (main, id) => {
  if (id) return msEditor(main, id);
  const docs = (await DB.all('docs')).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  main.innerHTML = `<div class="head"><div><h1>Рукописи</h1><div class="sub">Статьи, протоколы (SPIRIT), клинические случаи (CARE), тезисы. Разделы, цитаты из библиотеки, автоматический список литературы, выгрузка в Word.</div></div><button class="btn primary" id="msNew">+ Новый документ</button></div>
    ${docs.length ? `<table class="tbl hover"><thead><tr><th>Документ</th><th>Тип</th><th>Слов</th><th>Изменён</th></tr></thead><tbody>${docs.map(d => `<tr data-id="${d.id}"><td><b>${esc(d.title)}</b><div class="muted">${esc(d.authors || '')}</div></td><td>${esc(MS_KINDS[d.kind]?.name || '')}</td><td>${(d.sections || []).reduce((s, x) => s + (x.html || '').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length, 0)}</td><td class="muted">${fmtDT(d.updatedAt)}</td></tr>`).join('')}</tbody></table>` : emptyState('Документов пока нет.')}`;
  $$('tr[data-id]', main).forEach(tr => tr.onclick = () => go('writing/' + tr.dataset.id));
  $('#msNew').onclick = () => { const m = modal(`<h3>Новый документ</h3><div class="fld"><label class="flab">Название</label><input class="inp" id="mn_t"></div><div class="tpls">${Object.entries(MS_KINDS).map(([k, t], i) => `<label class="tpl"><input type="radio" name="mk" value="${k}" ${i === 0 ? 'checked' : ''}><b>${esc(t.name)}</b><span class="muted">${esc(t.secs.join(' · '))}</span></label>`).join('')}</div><div class="row end"><button class="btn primary" id="mn_ok">Создать</button></div>`, { wide: true });
    $('#mn_ok', m).onclick = async () => { const k = $('input[name=mk]:checked', m).value; const d = await DB.put('docs', { title: $('#mn_t', m).value.trim() || 'Без названия', kind: k, style: 'vancouver', authors: Auth.user.name, sections: MS_KINDS[k].secs.map(t => ({ id: uid('sc'), title: t, html: '' })) }, 'создание рукописи'); m.close(); go('writing/' + d.id); }; };
};
async function msEditor(main, id) {
  const d = await DB.get('docs', id); if (!d) return go('writing');
  const refs = await DB.all('refs'); let cur = 0, dirty = false, timer;
  const order = () => { const seen = []; d.sections.forEach(s => (safeRichHTML(s.html).match(/data-ref="([^"]+)"/g) || []).forEach(m => { const r = m.slice(10, -1); if (!seen.includes(r)) seen.push(r); })); return seen; };
  const renum = () => { const o = order(); $$('.rt .cite').forEach(c => { const r = refs.find(x => x.id === c.dataset.ref); c.textContent = r ? Lib.inText(r, o.indexOf(c.dataset.ref) + 1, d.style) : '[?]'; }); };
  const save = async () => { d.sections[cur].html = safeRichHTML($('#rtE').innerHTML); await DB.put('docs', d, 'правка рукописи'); dirty = false; $('#msSt').textContent = 'сохранено ' + new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }); };
  main.innerHTML = `<div class="head"><div><a class="muted" href="#writing">← Рукописи</a><h1 contenteditable="true" id="msT">${esc(d.title)}</h1><div class="sub"><span contenteditable="true" id="msA">${esc(d.authors || '')}</span> · ${esc(MS_KINDS[d.kind]?.name || '')} · <span id="msSt" class="muted"></span></div></div>
    <div class="row"><select class="inp" id="msS">${[['vancouver', 'Vancouver'], ['apa', 'APA 7'], ['gost', 'ГОСТ Р 7.0.5']].map(([k, l]) => `<option value="${k}" ${d.style === k ? 'selected' : ''}>${l}</option>`).join('')}</select><button class="btn" id="msW">Word (.docx)</button>${AI.ready() ? '<button class="btn ai" id="msAI">✦ ИИ: правка раздела</button>' : ''}<button class="btn danger" id="msDel">Удалить</button></div></div>
    <div class="ms"><div class="card"><h3>Разделы</h3><div id="msL"></div><button class="btn xs" id="msAdd">+ Раздел</button><hr><div class="muted small" id="msWc"></div></div>
      <div><div class="rtbar">${[['bold', '<b>Ж</b>'], ['italic', '<i>К</i>'], ['underline', '<u>Ч</u>'], ['superscript', 'x²'], ['subscript', 'x₂'], ['insertUnorderedList', '•'], ['insertOrderedList', '1.'], ['h3', 'Подзаг.'], ['hl', '<mark>выдел.</mark>'], ['removeFormat', '⌫']].map(([c, l]) => `<button data-c="${c}">${l}</button>`).join('')}</div><div class="rt" id="rtE" contenteditable="true"></div>
        <div class="card" style="margin-top:12px"><h3>Список литературы</h3><div id="msRefs"></div></div></div>
      <div class="card"><h3>Цитировать</h3><input class="inp" id="msQ" placeholder="Поиск в библиотеке"><div id="msLib" style="max-height:60vh;overflow:auto;margin-top:8px"></div><a class="btn xs" href="#library" style="margin-top:8px">Открыть библиотеку</a></div></div>`;
  const drawSecs = () => { $('#msL').innerHTML = d.sections.map((s, i) => `<div class="row" style="flex-wrap:nowrap"><button class="ms-sec ${i === cur ? 'on' : ''}" data-s="${i}">${esc(s.title)}</button><button class="btn xs" data-sr="${i}">✎</button><button class="btn xs" data-sx="${i}">×</button></div>`).join('');
    const wc = d.sections.reduce((s, x) => s + (i => (x.html || '').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length)(), 0); $('#msWc').textContent = `Слов: ${wc}`; };
  const drawRefs = () => { const o = order(); $('#msRefs').innerHTML = o.length ? `<ol>${o.map(rid => { const r = refs.find(x => x.id === rid); return `<li>${r ? Lib.fmt(r, d.style) : '[удалён]'}</li>`; }).join('')}</ol>` : '<p class="muted small">Вставьте цитату из панели справа: поставьте курсор и нажмите на источник.</p>'; };
  bindRichPaste($('#rtE'));
  const load = () => { $('#rtE').innerHTML = safeRichHTML(d.sections[cur]?.html); renum(); };
  const drawLib = () => { const q = $('#msQ').value.toLowerCase(); $('#msLib').innerHTML = refs.filter(r => !q || JSON.stringify(r).toLowerCase().includes(q)).slice(0, 60).map(r => `<button class="mn-it" data-ins="${r.id}" style="white-space:normal"><span style="white-space:normal">${esc((r.authors?.[0]?.family || '') + ' ' + (r.year || ''))}: ${esc((r.title || '').slice(0, 90))}</span></button>`).join('') || '<p class="muted small">Библиотека пуста.</p>';
    $$('[data-ins]', main).forEach(b => b.onmousedown = e => { e.preventDefault(); const sel = getSelection(); if (!sel.rangeCount || !$('#rtE').contains(sel.anchorNode)) { $('#rtE').focus(); } document.execCommand('insertHTML', false, `<span class="cite" contenteditable="false" data-ref="${b.dataset.ins}">[?]</span>&nbsp;`); d.sections[cur].html = $('#rtE').innerHTML; renum(); drawRefs(); dirty = true; clearTimeout(timer); timer = setTimeout(save, 1500); }); };
  drawSecs(); load(); drawRefs(); drawLib();
  $('#msQ').oninput = drawLib;
  $('#rtE').oninput = () => { dirty = true; $('#msSt').textContent = 'есть изменения'; clearTimeout(timer); timer = setTimeout(() => { save(); drawSecs(); drawRefs(); }, 1500); };
  $$('.rtbar [data-c]', main).forEach(b => b.onmousedown = e => { e.preventDefault(); const c = b.dataset.c; if (c === 'h3') document.execCommand('formatBlock', false, 'h3'); else if (c === 'hl') document.execCommand('hiliteColor', false, 'yellow'); else document.execCommand(c); $('#rtE').dispatchEvent(new Event('input')); });
  $('#msL').onclick = async e => { const t = e.target.dataset; if (t.s != null) { if (dirty) await save(); cur = Number(t.s); drawSecs(); load(); } if (t.sr != null) { const n = await promptBox('Название раздела', d.sections[t.sr].title); if (n) { d.sections[t.sr].title = n; await save(); drawSecs(); } } if (t.sx != null && d.sections.length > 1 && await confirmBox('Удалить раздел?')) { d.sections.splice(t.sx, 1); cur = 0; await DB.put('docs', d); drawSecs(); load(); drawRefs(); } };
  $('#msAdd').onclick = async () => { const n = await promptBox('Название раздела', 'Новый раздел'); if (!n) return; if (dirty) await save(); d.sections.push({ id: uid('sc'), title: n, html: '' }); cur = d.sections.length - 1; await DB.put('docs', d); drawSecs(); load(); };
  $('#msT').onblur = async () => { d.title = $('#msT').textContent.trim(); await DB.put('docs', d); }; $('#msA').onblur = async () => { d.authors = $('#msA').textContent.trim(); await DB.put('docs', d); };
  $('#msS').onchange = async e => { d.style = e.target.value; await save(); renum(); drawRefs(); };
  $('#msW').onclick = async () => { if (dirty) await save(); const o = order();
    const html = `<h1>${esc(d.title)}</h1><p><i>${esc(d.authors || '')}</i></p>${d.sections.map(s => `<h2>${esc(s.title)}</h2>${safeRichHTML(s.html).replace(/<span class="cite"[^>]*data-ref="([^"]+)"[^>]*>[^<]*<\/span>/g, (m, rid) => { const r = refs.find(x => x.id === rid); return r ? Lib.inText(r, o.indexOf(rid) + 1, d.style) : '[?]'; })}`).join('')}<h2>Список литературы</h2><ol>${o.map(rid => { const r = refs.find(x => x.id === rid); return `<li>${r ? Lib.fmt(r, d.style) : ''}</li>`; }).join('')}</ol>`;
    Office.docx(slug(d.title) + '.docx', html, { size: 12, margin: 1134 }); };
  if ($('#msAI')) $('#msAI').onclick = async () => { const ins = await promptBox('Что сделать с разделом? (например: сократить до 250 слов, улучшить стиль, проверить логику)', 'Улучши научный стиль, сохрани смысл и цитаты'); if (!ins) return; toast('ИИ работает…');
    try { const t = await AI.call(`Ты научный редактор хирургической статьи. Задача: ${ins}. Раздел «${d.sections[cur].title}». Сохрани все элементы <span class="cite" ...>...</span> без изменений. Не используй длинные тире. Верни только HTML раздела без пояснений.\n\n${$('#rtE').innerHTML}`, { text: '' });
      const prev = $('#rtE').innerHTML; $('#rtE').innerHTML = safeRichHTML(t.replace(/^```html?|```$/g, '')); renum(); await save(); toast('Готово. Ctrl+Z не вернёт, но предыдущая версия в журнале аудита.'); Audit.log('ИИ-правка рукописи', 'docs', d.id, { html: prev }, { html: d.sections[cur].html }); }
    catch (e) { toast(e.message, 'err'); } };
  $('#msDel').onclick = async () => { if (await confirmBox('Удалить документ?')) { await DB.del('docs', d.id); go('writing'); } };
  window.onbeforeunload = () => dirty ? true : undefined;
}
