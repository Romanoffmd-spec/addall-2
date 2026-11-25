/* AddAll 2.0: функции по образцу Dendrite Intellect Web
   страницы формы и сводка, владелец записи и делегаты, учебный режим, генератор пациентов,
   сообщение дня, отчёт хирурга и сертификат, экспорт моих данных, документы регистра,
   схемы-рисунки, запросы субъектов данных, XmR, таблица дожития, хронологии */
'use strict';

Object.assign(ROUTE_GROUP, { surgeon: 'Наука', regdocs: 'Наука', mydata: 'Работа', delegates: 'Работа', dsr: 'Администрирование', training: 'Работа' });

/* ---------- меню ---------- */
const _navGroups = navGroups;
navGroups = async function () {
  const g = await _navGroups();
  const add = (id, items) => { const x = g.find(y => y.id === id); if (x && x.items) x.items.push(...items.filter(Boolean)); };
  add('work', [{ sep: 'Мои данные' }, { r: 'mydata', t: 'Экспорт моих данных', i: '⇩' }, { r: 'delegates', t: 'Делегаты (ввод за врача)', i: '⇄' }, { r: 'training', t: 'Учебный режим', i: '✎' }]);
  add('sci', [{ sep: 'Отчёты' }, can('analyse') && { r: 'surgeon', t: 'Отчёт хирурга и сертификат', i: '☆' }, { r: 'regdocs', t: 'Документы регистров', i: '⎙' }]);
  add('adm', [can('users') && { r: 'dsr', t: 'Запросы субъектов данных', i: '⚖' }]);
  return g;
};

/* ---------- общие помощники ---------- */
const wilson = (k, n, z = 1.959963984540054) => { if (!n) return { p: null, lo: null, hi: null }; const p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), r = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return { p, lo: Math.max(0, (c - r) / d), hi: Math.min(1, (c + r) / d) }; };
const pc1 = x => x == null ? '-' : (Math.round(x * 1000) / 10).toString().replace('.', ',') + '%';
const yearsBack = (n) => { const d = new Date(); d.setFullYear(d.getFullYear() - n); return localDateISO(d); };
function sheetName(s, used) { let n = String(s || 'Лист').replace(/[\\/?*[\]:']/g, ' ').slice(0, 28) || 'Лист'; let k = n, i = 2; while (used.has(k)) k = n.slice(0, 26) + ' ' + i++; used.add(k); return k; }

/* XLSX с несколькими листами */
Office.book = function (filename, sheets) {
  const col = (i) => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const used = new Set(); sheets = sheets.map(s => ({ ...s, name: sheetName(s.name, used) }));
  const sx = (rows) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>${rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => { const ref = col(ci) + (ri + 1); if (v == null || v === '') return ''; if (typeof v === 'number' && isFinite(v)) return `<c r="${ref}"${ri === 0 ? ' s="1"' : ''}><v>${v}</v></c>`; return `<c r="${ref}" t="inlineStr"${ri === 0 ? ' s="1"' : ''}><is><t xml:space="preserve">${this.x(Array.isArray(v) ? v.join('; ') : typeof v === 'object' ? JSON.stringify(v) : v)}</t></is></c>`; }).join('')}</row>`).join('')}</sheetData></worksheet>`;
  const files = [
    { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${this.x(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>' },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sx(s.rows) }))
  ];
  download(filename, this.zip(files));
};

/* ================= ДЕЛЕГАТЫ: ввод данных за врача ================= */
/* у врача хранится список делегатов: [{ userId, at, confirmedAt }]; подтверждение раз в год */
const Deleg = {
  active(d) { return d && d.confirmedAt && addDays(d.confirmedAt.slice(0, 10), 365) >= today(); },
  async grantorsOf(uid_) { return (await DB.all('users')).filter(u => u.active !== false && (u.delegates || []).some(d => d.userId === uid_ && this.active(d))); },
  async ownerChoices() {
    const me = Auth.user; const gr = await this.grantorsOf(me.id);
    let list = [me, ...gr];
    if (['admin', 'lead'].includes(me.role)) list = list.concat((await Data.users()).filter(u => u.active !== false && ['admin', 'lead', 'surgeon'].includes(u.role)));
    return [...new Map(list.map(u => [u.id, u])).values()];
  }
};
Routes.delegates = async (main) => {
  const users = (await DB.all('users')).filter(u => u.active !== false); const me = users.find(u => u.id === Auth.user.id) || Auth.user;
  const mine = me.delegates || []; const gr = await Deleg.grantorsOf(me.id);
  main.innerHTML = `<div class="head"><h1>Делегаты</h1></div>
    <p class="muted">Делегат (ассистент, резидент, медсестра, координатор) вносит данные в регистр от имени врача. Запись принадлежит врачу и попадает в его отчёт. Доступ делегата нужно подтверждать раз в год, иначе он прекращается сам.</p>
    <div class="card"><div class="row between"><h3>Мои делегаты (${mine.length})</h3><div class="row"><select class="inp" id="dgU"><option value="">выберите сотрудника</option>${users.filter(u => u.id !== me.id && !mine.some(d => d.userId === u.id)).map(u => `<option value="${u.id}">${esc(u.name)}${u.position ? ' · ' + esc(u.position) : ''}</option>`).join('')}</select><button class="btn primary" id="dgAdd">Добавить</button></div></div>
      <table class="tbl"><thead><tr><th>Сотрудник</th><th>Должность</th><th>Добавлен</th><th>Подтверждён</th><th>Статус</th><th></th></tr></thead><tbody>${mine.map((d, i) => { const u = users.find(x => x.id === d.userId); const act = Deleg.active(d); const soon = act && addDays(d.confirmedAt.slice(0, 10), 335) < today(); return `<tr><td><b>${esc(u?.name || '?')}</b></td><td>${esc(u?.position || '')}</td><td>${fmtDate(d.at?.slice(0, 10))}</td><td>${fmtDate(d.confirmedAt?.slice(0, 10))}</td><td>${act ? (soon ? '<span class="tag warnt">истекает</span>' : '<span class="tag okt">действует</span>') : '<span class="bad">истёк</span>'}</td><td class="nowrap"><button class="btn xs" data-dc="${i}">Подтвердить на год</button><button class="btn xs" data-dx="${i}">Убрать</button></td></tr>`; }).join('') || '<tr><td colspan="6" class="muted">Делегатов нет</td></tr>'}</tbody></table>
      ${mine.length ? '<button class="btn sm" id="dgAll">Подтвердить всех на год</button>' : ''}</div>
    <div class="card"><h3>Я делегат для</h3>${gr.length ? gr.map(u => `<div class="rq"><span class="av">${esc(initials(u.name))}</span><div class="rq-b"><b>${esc(u.name)}</b><span class="muted small">${esc(u.position || '')}</span></div></div>`).join('') : '<p class="muted">Никто из врачей пока не назначил вас делегатом.</p>'}<p class="fhint">В форме события поле «Владелец записи» позволяет выбрать врача, за которого вы вносите данные.</p></div>`;
  const save = async (msg) => { me.delegates = mine; await DB.put('users', me, msg); Object.assign(Auth.user, me); toast('Сохранено'); App.route(); };
  $('#dgAdd').onclick = () => { const v = $('#dgU').value; if (!v) return toast('Выберите сотрудника', 'err'); mine.push({ userId: v, at: nowISO(), confirmedAt: nowISO() }); save('назначен делегат'); };
  $$('[data-dc]').forEach(b => b.onclick = () => { mine[b.dataset.dc].confirmedAt = nowISO(); save('делегат подтверждён'); });
  $$('[data-dx]').forEach(b => b.onclick = () => { mine.splice(b.dataset.dx, 1); save('делегат убран'); });
  if ($('#dgAll')) $('#dgAll').onclick = () => { mine.forEach(d => d.confirmedAt = nowISO()); save('делегаты подтверждены'); };
};

/* ================= ФОРМА СОБЫТИЯ: шапка, страницы, сводка, владелец ================= */
const _eventDialog = eventDialog;
eventDialog = async function (p, reg, ev) {
  await _eventDialog(p, reg, ev);
  const m = [...document.querySelectorAll('.modal-wrap.full')].pop(); if (!m) return;
  const et = etById(reg, ev.type); const form = $('#evForm', m); if (!et || !form) return;
  const users = await Data.users(); const isNew = !ev.id; const ro = !!form.dataset.ro;
  /* закреплённая шапка с пациентом и навигацией */
  const bar = document.createElement('div'); bar.className = 'evbar';
  const owners = ro ? [] : await Deleg.ownerChoices();
  if (!ev.ownerId) ev.ownerId = ev.createdBy || Auth.user.id;
  const ownerName = (users.find(u => u.id === ev.ownerId) || {}).name || '';
  bar.innerHTML = `<div class="evpt"><b>${esc(pname(p))}</b> <span>№ ${esc(p.localId)}</span> <span>ДР ${fmtDate(p.birthDate)}</span> <span>${esc(p.sex || '')}</span>${p.vital === 'умер' ? ' <span class="bad">умер</span>' : ''}
      <span class="evown">Владелец записи: ${owners.length > 1 ? `<select class="inp xs" id="evOwner">${owners.map(u => `<option value="${u.id}" ${u.id === ev.ownerId ? 'selected' : ''}>${esc(u.name)}${u.id === Auth.user.id ? ' (я)' : ''}</option>`).join('')}</select>` : `<b>${esc(ownerName || Auth.user.name)}</b>`}</span></div>
    <div class="evnav" id="evNav"></div>`;
  form.before(bar);
  if ($('#evOwner', m)) $('#evOwner', m).onchange = e => { ev.ownerId = e.target.value; };
  /* новый случай: проверка, что открыт нужный пациент */
  if (isNew) {
    const cf = document.createElement('div'); cf.className = 'evconfirm';
    cf.innerHTML = `Проверьте пациента: <b>${esc(pname(p))}</b>, № ${esc(p.localId)}, ${fmtDate(p.birthDate)}, ${esc(p.sex || '')}. <button class="btn xs primary" id="cfOk">Да, верно</button> <button class="btn xs" id="cfEd">Изменить данные пациента</button>`;
    bar.after(cf);
    $('#cfOk', m).onclick = () => cf.remove();
    $('#cfEd', m).onclick = async () => { patientDialog(p, await Data.registries()); };
  }
  /* страницы и вкладки: раздел с флагом tab показывается вкладкой на странице предыдущего */
  const sum = document.createElement('div'); sum.className = 'evsum'; sum.style.display = 'none'; form.after(sum);
  const tabs = document.createElement('div'); tabs.className = 'evtabs'; form.before(tabs);
  const SEC = et.sections || []; const nSec = SEC.length;
  const grp = []; SEC.forEach((s, i) => grp.push(i && s.tab ? grp[i - 1] : (i ? grp[i - 1] + 1 : 0)));
  const G = nSec ? grp[nSec - 1] + 1 : 0;
  let paged = (localStorage.getItem('addall2.paged') ?? (G >= 3 || nSec >= 3 ? '1' : '0')) === '1', page = 0, fromSum = false;
  const secs = () => $$(':scope > fieldset.sec', form);
  const curVals = () => { const cur = readForm(form); return { cur, all: computeValues(reg, p, et, cur, $('#evDate', m)?.value || ev.date) }; };
  const missingOn = (i) => { const { cur, all } = curVals(); const ff = (SEC[i]?.fields || []).filter(f => f.type !== 'calc' && condOK(f.showIf, all) && isEmpty(cur[f.key])); return { req: ff.filter(f => f.required), des: ff.filter(f => !f.required && f.key_) }; };
  const leaveOK = async (to) => {
    if (!paged || ro || page >= nSec || to === page) return true;
    const mi = missingOn(page);
    if (mi.req.length) return confirmBox(`На этой странице не заполнены обязательные вопросы: ${mi.req.map(f => '«' + f.label + '»').join(', ')}. Перейти всё равно? Запись сохранится как черновик.`);
    if (mi.des.length) toast(`Желательно заполнить: ${mi.des.slice(0, 3).map(f => f.label).join(', ')}${mi.des.length > 3 ? '…' : ''}`);
    return true;
  };
  const drawSum = () => {
    const { cur, all } = curVals(); let miss = 0, des = 0;
    sum.innerHTML = `<h3>Сводка: все ответы</h3>${SEC.map((s, i) => `<div class="sumsec"><div class="sumh">${esc(s.title)} <button class="btn xs" data-sp="${i}">Открыть страницу</button></div><table class="tbl small"><tbody>${(s.fields || []).filter(f => condOK(f.showIf, all)).map(f => {
      const v = f.type === 'calc' ? all[f.key] : cur[f.key]; const need = (f.required || f.key_) && f.type !== 'calc' && isEmpty(v); if (need) f.required ? miss++ : des++;
      return `<tr><td>${esc(f.label)}${f.required ? ' <i class="req">*</i>' : ''}</td><td>${isEmpty(v) ? (need ? `<a href="javascript:void 0" class="missd ${f.required ? '' : 'des'}" data-jump="${f.key}" data-pg="${i}">${f.required ? 'Не заполнено' : 'Желательно заполнить'}</a>` : '<span class="muted">-</span>') : showVal(f, v, users)}</td></tr>`; }).join('')}</tbody></table></div>`).join('')}`;
    sum.insertAdjacentHTML('afterbegin', `<div class="${miss ? 'qbox' : des ? 'warnbox' : 'okbox'}">${miss ? `Не заполнено обязательных: <b>${miss}</b>${des ? `, желательных: <b>${des}</b>` : ''}. Нажмите на ссылку, чтобы перейти к вопросу.` : des ? `Обязательные заполнены. Желательных не хватает: <b>${des}</b>.` : 'Все обязательные и желательные поля заполнены.'}</div>`);
  };
  const legend = '<span class="evleg"><i class="l-un"></i>без ответа <i class="l-an"></i>отвечено <i class="l-rq"></i>обязательный <i class="l-ds"></i>желательный</span>';
  const apply = () => {
    const S = secs(); const n = S.length; if (page > n) page = n;
    const onSum = page === n && paged; const g = onSum ? -1 : grp[page]; const inG = SEC.map((s, i) => i).filter(i => grp[i] === g);
    S.forEach((f, i) => f.style.display = !paged || i === page ? '' : 'none');
    sum.style.display = onSum ? '' : 'none'; if (onSum) drawSum();
    tabs.innerHTML = paged && !onSum && inG.length > 1 ? inG.map(i => `<button class="evtab${i === page ? ' on' : ''}" data-tb="${i}">${esc(SEC[i].title)}</button>`).join('') : '';
    const nextSame = paged && !onSum && grp[page + 1] === g;
    const firstOf = gg => grp.indexOf(gg);
    $('#evNav', m).innerHTML = `${paged && n > 1 ? `<button class="btn xs" data-nv="prev" ${page === 0 ? 'disabled' : ''}>‹ Назад</button>
      <select class="inp xs" id="evPg">${Array.from({ length: G }, (_, gg) => `<option value="${firstOf(gg)}" ${gg === g ? 'selected' : ''}>${esc(SEC[firstOf(gg)]?.title || 'Страница ' + (gg + 1))}</option>`).join('')}<option value="${n}" ${onSum ? 'selected' : ''}>Сводка</option></select>
      <span class="muted">${onSum ? 'Сводка' : `Страница ${g + 1} из ${G}${inG.length > 1 ? ` · вкладка ${inG.indexOf(page) + 1} из ${inG.length}` : ''}`}</span>
      <button class="btn xs" data-nv="next" ${onSum ? 'disabled' : ''}>${nextSame ? 'Следующая вкладка ›' : page === n - 1 ? 'К сводке ›' : 'Далее ›'}</button>` : `<button class="btn xs" data-nv="sum">Сводка</button>`}
      ${fromSum && !onSum ? '<button class="btn xs primary" data-nv="back">Вернуться к сводке</button>' : ''}
      ${n > 1 ? `<button class="btn xs" data-nv="mode">${paged ? 'Вся форма сразу' : 'По страницам'}</button>` : ''}${legend}`;
    if (!paged && sum.dataset.open === '1') { sum.style.display = ''; drawSum(); }
  };
  const goTo = async (to, keepSum) => { if (!(await leaveOK(to))) return; page = to; if (!keepSum) fromSum = false; apply(); m.querySelector('.modal').scrollTop = 0; };
  bar.onclick = async e => {
    const b = e.target.closest('[data-nv]'); if (!b) return; const n = secs().length; const v = b.dataset.nv;
    if (v === 'prev') return goTo(Math.max(0, page - 1));
    if (v === 'next') return goTo(Math.min(n, page + 1));
    if (v === 'mode') { paged = !paged; localStorage.setItem('addall2.paged', paged ? '1' : '0'); sum.dataset.open = '0'; }
    if (v === 'sum') { if (paged) return goTo(n); sum.dataset.open = sum.dataset.open === '1' ? '0' : '1'; if (sum.dataset.open !== '1') sum.style.display = 'none'; }
    if (v === 'back') { page = n; fromSum = false; if (!paged) sum.dataset.open = '1'; }
    apply();
  };
  bar.onchange = e => { if (e.target.id === 'evPg') goTo(Number(e.target.value)); };
  tabs.onclick = e => { const t = e.target.closest('[data-tb]'); if (t) goTo(Number(t.dataset.tb), true); };
  const jump = (key, pg) => { page = pg; apply(); const w = $(`[data-wrap="${key}"]`, form); if (w) { w.scrollIntoView({ block: 'center' }); w.classList.add('flash'); setTimeout(() => w.classList.remove('flash'), 1600); $('input,select,textarea', w)?.focus(); } };
  sum.onclick = e => {
    const j = e.target.closest('[data-jump],[data-sp]'); if (!j) return;
    fromSum = true; if (!paged) { sum.dataset.open = '0'; sum.style.display = 'none'; }
    if (j.dataset.jump) jump(j.dataset.jump, Number(j.dataset.pg)); else { page = Number(j.dataset.sp); apply(); }
  };
  new MutationObserver(() => apply()).observe(form, { childList: true });
  apply();
  if (window.__evJump) { const k = window.__evJump; window.__evJump = null; const i = SEC.findIndex(s => (s.fields || []).some(f => f.key === k)); if (i >= 0) setTimeout(() => jump(k, i), 50); }
};

/* ================= СООБЩЕНИЕ ДНЯ, СРОКИ ДОСТУПА ================= */
const _home = Routes.home;
Routes.home = async (main) => {
  await _home(main);
  const s = Settings.data, u = Auth.user; let h = '';
  const hid = (() => { try { return localStorage.getItem('addall2.motdHide.' + u.id); } catch (e) { return ''; } })();
  if (s.motd && s.motd.text && hid !== s.motd.at) h += `<div class="card motd"><div class="row between"><h3>Сообщение дня</h3><span class="muted small">${fmtDT(s.motd.at)}</span></div><div class="motd-t">${esc(s.motd.text).replace(/\n/g, '<br>')}</div><label class="chk small"><input type="checkbox" id="motdHide"> <span>Больше не показывать это сообщение</span></label></div>`;
  const pd = Number(s.passDays || 0); const pe = pd && u.passChangedAt ? addDays(u.passChangedAt.slice(0, 10), pd) : '';
  if (pe || u.expiresAt) h += `<div class="acc-exp muted small">${pe ? `Пароль действует до <b>${fmtDate(pe)}</b>` : ''}${pe && u.expiresAt ? ' · ' : ''}${u.expiresAt ? `учётная запись действует до <b>${fmtDate(u.expiresAt)}</b>` : ''}</div>`;
  if (TRAIN) h = `<div class="card trainc"><b>Учебный режим.</b> Отдельная база с вымышленными пациентами: здесь можно учиться и ошибаться. Настоящие данные не затрагиваются. <a href="#training">Генератор пациентов и выход</a></div>` + h;
  if (h) { const k = $('.kicker', main); (k || main.firstElementChild)?.insertAdjacentHTML(k ? 'afterend' : 'beforebegin', `<div class="dd-top">${h}</div>`); if (!k && !main.querySelector('.dd-top')) main.insertAdjacentHTML('afterbegin', `<div class="dd-top">${h}</div>`); }
  const mh = $('#motdHide', main); if (mh) mh.onchange = () => { try { localStorage.setItem('addall2.motdHide.' + u.id, s.motd.at); } catch (e) {} mh.closest('.motd').remove(); };
};

/* настройки администратора: сообщение дня, срок пароля; срок учётной записи в карточке пользователя */
const _admin2 = Routes.admin;
Routes.admin = async (main) => {
  await _admin2(main);
  const s = Settings.data;
  const card = `<div class="card"><h3>Сообщение дня и безопасность входа</h3><div class="grid">
    <div class="fld wide"><label class="flab">Сообщение дня (видят все на главной после входа)</label><textarea class="inp" id="md_t" rows="3" placeholder="Например: 1 декабря выгрузка данных для годового отчёта, проверьте полноту записей">${esc(s.motd?.text || '')}</textarea></div>
    <div class="fld"><label class="flab">Срок действия пароля, дней (0 = бессрочно)</label><input class="inp" type="number" id="md_pd" value="${esc(s.passDays || 0)}" min="0"></div>
    <div class="fld"><label class="flab">Блокировка входа</label><div class="calc">после 3 неудачных попыток на 15 минут</div></div>
  </div><div class="row"><button class="btn primary" id="md_s">Сохранить</button>${s.motd?.text ? '<button class="btn" id="md_x">Убрать сообщение</button>' : ''}</div></div>`;
  const anchor = $$('.card', main).find(c => /Учреждение/.test($('h3', c)?.textContent || '')); (anchor || main.lastElementChild).insertAdjacentHTML('afterend', card);
  $('#md_s').onclick = async () => { const t = $('#md_t').value.trim(); s.motd = t ? { text: t, at: s.motd?.text === t ? s.motd.at : nowISO() } : null; s.passDays = Number($('#md_pd').value || 0); await Settings.save(); toast('Сохранено'); };
  if ($('#md_x')) $('#md_x').onclick = async () => { s.motd = null; await Settings.save(); App.route(); };
  /* в таблице пользователей: блокировка и снятие */
  const users = await DB.all('users');
  users.filter(u => u.lockedUntil && u.lockedUntil > nowISO()).forEach(u => { const b = $(`[data-ue="${u.id}"]`, main); if (b) b.insertAdjacentHTML('beforebegin', `<button class="btn xs" data-unl="${u.id}" title="Заблокирован до ${fmtDT(u.lockedUntil)}">Снять блокировку</button>`); });
  $$('[data-unl]', main).forEach(b => b.onclick = async () => { const u = users.find(x => x.id === b.dataset.unl); delete u.lockedUntil; u.failCount = 0; await DB.put('users', u, 'снята блокировка входа'); App.route(); });
};

/* ================= СТРАНИЦА ВХОДА: счётчики, блокировка, учебный режим ================= */
const _login2 = Pages.login;
Pages.login = async function (mode = 'login', ...args) {
  await _login2.call(Pages, mode, ...args);
  const box = $('.auth-box'); if (!box) return;
  if (mode === 'login') {
    const [us, pts] = await Promise.all([DB.all('users'), DB.all('patients')]);
    $('.auth-brand', box).nextElementSibling?.insertAdjacentHTML('afterend', `<div class="lcount"><div><b>${us.filter(u => u.active !== false).length}</b><span>зарегистрировано сотрудников</span></div><div><b>${pts.length}</b><span>пациентов в регистрах</span></div></div>`);
    box.insertAdjacentHTML('beforeend', `<p class="fhint" style="text-align:center">Вводите пароль внимательно: после 3 неудачных попыток вход блокируется на 15 минут.</p><button class="linkbtn" id="trTgl">${TRAIN ? 'Выйти из учебного режима' : 'Учебный режим (вымышленные пациенты)'}</button>`);
    $('#trTgl').onclick = () => setTraining(!TRAIN);
  }
  if (TRAIN) box.insertAdjacentHTML('afterbegin', '<div class="trainflag">Учебный режим</div>');
};

/* ================= УЧЕБНЫЙ РЕЖИМ ================= */
const TRAIN_USER = { id: 'training-admin', login: 'training', name: 'Учебный пользователь', role: 'admin', active: true, center: 'Учебный центр', dept: 'Учебное отделение' };

function trainingDB(name, create = false) {
  return new Promise((resolve, reject) => {
    const request = create ? indexedDB.open(name, DB_VERSION) : indexedDB.open(name);
    request.onupgradeneeded = () => {
      if (!create) { request.transaction.abort(); return; }
      for (const store of STORES) if (!request.result.objectStoreNames.contains(store)) request.result.createObjectStore(store, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => create ? reject(request.error) : resolve(null);
    request.onblocked = () => reject(new Error('Закройте другие вкладки AddAll и попробуйте снова'));
  });
}

async function addTrainingSchemas(target, templates) {
  if (!templates.length) return 0;
  return new Promise((resolve, reject) => {
    const tx = target.transaction('registries', 'readwrite');
    const store = tx.objectStore('registries');
    let added = 0;
    for (const template of templates) {
      if (!template.id || !Array.isArray(template.eventTypes)) continue;
      const lookup = store.get(template.id);
      lookup.onsuccess = () => {
        if (lookup.result) return;
        const reg = { id: template.id, createdBy: TRAIN_USER.id, center: TRAIN_USER.center, dept: TRAIN_USER.dept,
          scope: 'dept', status: 'активен' };
        for (const key of ['name', 'description', 'version', 'patientFields', 'eventTypes', 'indicators', 'instruments', 'schedules', 'keyDates', 'followupEvery']) {
          if (Object.hasOwn(template, key)) reg[key] = template[key];
        }
        reg.lists = (template.lists || []).map(list => list.manual ? { ...list, manual: [] } : list);
        store.put(reg);
        added++;
      };
    }
    tx.oncomplete = () => resolve(added);
    tx.onabort = () => reject(tx.error);
  });
}

async function loadTrainingSource() {
  const liveId = sessionStorage.getItem('addall2.trainingSourceUser');
  if (!liveId) return [];
  const base = await trainingDB('addall2');
  if (!base) return [];
  const read = (table, id) => new Promise((resolve, reject) => {
    const store = base.transaction(table).objectStore(table), request = id ? store.get(id) : store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    const [user, registries] = await Promise.all([read('users', liveId), read('registries')]);
    if (!user || user.active === false) return [];
    const previous = Auth.user;
    Auth.user = user;
    try { return registries.filter(regAccess); }
    finally { Auth.user = previous; }
  } finally { base.close(); }
}

let switchingTraining = false;
async function setTraining(on) {
  if (switchingTraining) return;
  switchingTraining = true;
  try {
    if (on && Auth.user) {
      const templates = await Data.registries();
      const target = await trainingDB('addall2_train', true);
      try { await addTrainingSchemas(target, templates); } finally { target.close(); }
      sessionStorage.setItem('addall2.trainingSourceUser', Auth.user.id);
    }
    localStorage.setItem('addall2.mode', on ? 'train' : 'live');
    sessionStorage.removeItem('addall2_uid');
    location.hash = '';
    location.reload();
  } catch (error) { toast(error.message, 'err'); }
  finally { switchingTraining = false; }
}

async function seedTraining() {
  if (!(await DB.get('users', TRAIN_USER.id))) {
    await DB.rawPut('users', { ...TRAIN_USER });
    await DB.rawPut('users', { id: 'training-doctor', login: 'training-doctor', name: 'Учебный врач', role: 'surgeon', active: true, center: TRAIN_USER.center, dept: TRAIN_USER.dept });
  }
  if (!(await DB.get('settings', 'main'))) {
    await DB.rawPut('settings', { id: 'main', center: TRAIN_USER.center, department: TRAIN_USER.dept, centers: [TRAIN_USER.center], departments: [TRAIN_USER.dept], anonCodes: true });
  }
  if ((await DB.all('registries')).length) return;
  try { await addTrainingSchemas(DB.db, await loadTrainingSource()); } catch (error) { }
  if (!(await DB.all('registries')).length) {
    const sample = TEMPLATES.colorectal.make();
    Object.assign(sample, { id: 'training-example', name: 'Учебный колоректальный регистр', createdBy: TRAIN_USER.id, center: TRAIN_USER.center, dept: TRAIN_USER.dept, status: 'активен' });
    await DB.rawPut('registries', sample);
  }
}

if (TRAIN) {
  Auth.restore = async function () {
    this.user = { ...TRAIN_USER };
    sessionStorage.setItem('addall2_uid', TRAIN_USER.id);
  };
  Auth.logout = () => setTraining(false);
}

const _boot = App.boot.bind(App);
App.boot = async function () {
  if (TRAIN && !App._seeded) { App._seeded = true; if (!DB.db) await DB.open(); await seedTraining(); document.documentElement.classList.add('train'); }
  return _boot();
};
const _route2 = App.route.bind(App);
App.route = async function (...a) {
  const r = await _route2(...a);
  if (TRAIN && Auth.user && !$('#trainBar')) document.body.insertAdjacentHTML('afterbegin', `<div id="trainBar">Учебный режим: вымышленные данные в отдельной базе <button type="button" id="trGuide">Пошаговый гайд</button><button type="button" onclick="setTraining(false)">Выйти</button></div>`);
  return r;
};

/* генератор вымышленных пациентов */
const SYN = {
  ln: ['Ахметов', 'Сериков', 'Иванов', 'Ким', 'Нурланов', 'Петров', 'Жумабаев', 'Смагулов', 'Ли', 'Оспанов', 'Каримов', 'Тлеубаев', 'Сидоров', 'Абдрахманов', 'Есенов'],
  fn: { М: ['Арман', 'Ерлан', 'Сергей', 'Данияр', 'Алексей', 'Бауыржан', 'Тимур', 'Олжас'], Ж: ['Айгерим', 'Мария', 'Динара', 'Елена', 'Асель', 'Гульнара', 'Ольга', 'Жанна'] },
  rnd: (a) => a[Math.floor(Math.random() * a.length)], rint: (a, b) => a + Math.floor(Math.random() * (b - a + 1)),
  icd: ['C18.7', 'C20', 'C19', 'C18.2', 'K57.3', 'K40.9', 'C21.0'],
  value(f, ctx) {
    const { date, users, people, patient } = ctx;
    const r = this.rnd, ri = this.rint, options = f.options || [];
    switch (f.type) {
      case 'select': return options.length ? r(options) : '';
      case 'multiselect': {
        if (!options.length) return [];
        const answers = options.filter(() => Math.random() < .35).slice(0, 2);
        return answers.length ? answers : [r(options)];
      }
      case 'yesno': return Math.random() < .3 ? 'да' : 'нет';
      case 'number': {
        const lo = f.min === '' || f.min == null ? (Number.isFinite(Number(f.max)) && f.max !== '' ? Math.min(0, Number(f.max) - 20) : 0) : Number(f.min);
        const hi = f.max === '' || f.max == null ? lo + 100 : Number(f.max);
        if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo) return '';
        const step = Number(f.step);
        if (step > 0) {
          const base = isEmpty(f.min) ? 0 : lo;
          const count = ri(Math.ceil((lo - base) / step), Math.floor((hi - base) / step + 1e-8));
          return Number((base + count * step).toFixed(10));
        }
        const rounded = Math.round((lo + Math.random() * (hi - lo)) * 10) / 10;
        return Math.min(hi, Math.max(lo, rounded));
      }
      case 'date': return [addDays(date, ri(-7, 4)), today()].sort()[0];
      case 'time':
      case 'datetime': {
        const clock = String(ri(8, 18)).padStart(2, '0') + ':' + String(ri(0, 59)).padStart(2, '0');
        return f.type === 'time' ? clock : date + 'T' + clock;
      }
      case 'user': return users.length ? r(users).id : '__ext';
      case 'icd10': return options.length ? r(options) : r(this.icd);
      case 'icdo': {
        const codes = (window.ICDO || []).slice(0, 18);
        return options.length ? r(options) : (codes.length ? r(codes)[0] : '8010/3');
      }
      case 'patient': {
        const others = people.filter(p => p.id !== patient?.id);
        return others.length ? r(others).id : '';
      }
      case 'complist': return (f.required || Math.random() < .3)
        ? [{ name: options.length ? r(options) : 'Учебное осложнение', grade: r(['I', 'II', 'IIIa', 'IIIb']), date: [addDays(date, ri(1, 10)), today()].sort()[0] }]
        : [];
      case 'group': return Array.from({ length: ri(1, 3) }, () => this.fill(f.subfields || [], ctx));
      case 'textarea':
      case 'text': return 'Учебное значение: ' + f.label + ' ' + ri(1, 99);
      default: return '';
    }
  },
  fill(fields, ctx) {
    const data = {};
    for (const f of fields) {
      if (f.type === 'calc' || (!f.required && !f.key_ && Math.random() < .12)) continue;
      data[f.key] = this.value(f, ctx);
    }
    const values = { ...(ctx.patient?.data || {}), birthDate: ctx.patient?.birthDate, sex: ctx.patient?.sex, eventDate: ctx.date, ...data };
    for (const f of fields) if (f.type === 'calc' && f.formula) values[f.key] = data[f.key] = evalFormula(f.formula, values);
    return Object.fromEntries(fields.filter(f => Object.hasOwn(data, f.key) && condOK(f.showIf, values)).map(f => [f.key, data[f.key]]));
  },
  async make(reg, n, scenario = 'regular') {
    const users = (await Data.users()).filter(user => user.active !== false);
    const types = reg.eventTypes || [];
    const date = today();
    const people = [];
    const center = Auth.user.center || reg.center || centers()[0] || '';
    /* сценарий «несколько учреждений»: разные по объёму учебные больницы для экрана сравнения */
    const pool = scenario === 'multi' ? [['Учебная больница А', .45], ['Учебная больница Б', .3], ['Учебная больница В', .15], ['Учебная больница Г', .1]] : null;
    const pickCenter = () => { let r = Math.random(); for (const [c, w] of pool) { if ((r -= w) < 0) return c; } return pool[0][0]; };
    for (let i = 0; i < n; i++) {
      const sex = Math.random() < .5 ? 'М' : 'Ж';
      const genderedName = this.rnd(this.ln) + (sex === 'Ж' ? 'а' : '');
      const id = uid('tp_');
      people.push(await DB.put('patients', {
        id, registryId: reg.id, localId: 'T-' + id.slice(3), lastName: genderedName + ' (учебный)', firstName: this.rnd(this.fn[sex]),
        sex, birthDate: addDays(date, -this.rint(6600, 31000)), consent: 'получено', vital: 'жив', center: pool ? pickCenter() : center, data: {}, synthetic: true
      }, 'учебный пациент'));
    }

    const start = Out30.startType(reg);
    const outcome = Out30.form(reg, start);
    const opener = Episodes.opener(reg);
    const startType = Episodes.isPatient(reg) ? reg.episode?.anchorForm || types[0]?.id : opener;
    for (const [patientIndex, patient] of people.entries()) {
      patient.data = this.fill(reg.patientFields || [], { date, users, people, patient });
      if (Object.keys(patient.data).length) await DB.put('patients', patient, 'поля учебного пациента');
      const longest = Math.max(0, ...Episodes.expected(reg).map(type => {
        const rule = Episodes.rule(type);
        return rule.days + rule.every;
      }));
      let day = addDays(date, -this.rint(30, 240) - longest - types.length * 25);
      const startDate = addDays(day, types.findIndex(type => type.id === startType) * 14);
      let anchor = null, episode = null;
      for (const type of types) {
        const rule = type.id !== startType && Episodes.rule(type);
        const repeats = !type.single && rule?.every ? 2 : type.single === false && /наблюд|контрол|follow/i.test(type.name) ? this.rint(1, 3) : 1;
        if (scenario === 'quality' && rule && patientIndex % 3 === 0) continue;
        for (let index = 0; index < repeats; index++) {
          const expected = rule ? addDays(episode?.date || startDate, rule.days + index * rule.every) : '';
          const proposed = type.id === startType ? startDate : expected || day;
          const eventDate = proposed <= date ? proposed : date;
          const data = this.fill(formFields(type), { date: eventDate, users, people, patient });
          const values = computeValues(reg, patient, type, data, eventDate);
          const status = validateEvent(type, values).length || (scenario === 'quality' && rule && patientIndex % 3 === 1) ? 'черновик' : 'завершено';
          const record = { patientId: patient.id, registryId: reg.id, type: type.id, date: eventDate, data, status,
            schemaVersion: reg.version, ownerId: Auth.user.id, synthetic: true };
          if (expected) record.followDue = expected;
          if (episode && type.id !== startType && !Episodes.isPatient(reg)) record.anchorEventId = episode.id;
          if (outcome?.type.id === type.id && status !== 'черновик') {
            const opDate = outcome.inline ? eventDate : anchor?.date;
            if (opDate) {
              const due = addDays(opDate, Out30.DAYS);
              if (due <= date) record.out30CheckedOn = eventDate > due ? eventDate : due;
              if (!outcome.inline) record.anchorEventId = anchor.id;
            }
          }
          const saved = await DB.put('events', record, 'учебное событие');
          if (type.id === start) anchor = saved;
          if (type.id === startType) episode = saved;
          day = addDays(day, this.rint(5, 25));
        }
      }
    }
    return people.length;
  }
};

Routes.training = async (main, regId = '') => {
  const regs = await Data.registries();
  const selected = regs.find(r => r.id === regId)?.id || regs[0]?.id || '';
  main.innerHTML = `<div class="head"><h1>Учебный режим</h1></div>
    <div class="card"><p>Песочница хранит вымышленные карточки отдельно. Здесь можно пройти рабочие сценарии, создавать регистры и менять их формы.</p>
      <div class="row"><button class="btn ${TRAIN ? '' : 'primary'}" id="trGo">${TRAIN ? 'Вернуться в рабочую базу' : 'Перейти в учебный режим'}</button>
      ${TRAIN ? '<button class="btn" id="trGuideStart">Начать пошаговый гайд</button>' : ''}</div></div>
    ${TRAIN ? `<div class="card"><h3>Генератор вымышленных пациентов</h3>
      <p class="muted">Для каждого выбранного регистра генератор использует его типы событий, варианты ответов, диапазоны, условия полей и вложенные записи.</p>
      ${regs.length ? `<div class="row" id="trControls">
        <label for="trReg">Регистр</label><select class="inp" id="trReg">${regs.map(reg => `<option value="${esc(reg.id)}" ${selected === reg.id ? 'selected' : ''}>${esc(reg.name)}</option>`).join('')}<option value="__all">Все учебные регистры</option></select>
        <label for="trN">Пациентов на регистр</label><input class="inp" type="number" id="trN" value="25" min="1" max="500" style="max-width:100px">
        <label for="trScenario">Сценарий</label><select class="inp" id="trScenario"><option value="regular">Обычное наблюдение</option><option value="quality">Учебная проверка качества</option><option value="multi">Несколько учреждений (для сравнения)</option></select>
        <button class="btn primary" id="trMake">Сгенерировать</button></div>` : '<a class="btn primary" href="#registries/new">Создать регистр</a>'}</div>
    <div class="card"><h3>Учебные данные</h3><div class="row"><button class="btn danger" id="trClr">Очистить пациентов</button><button class="btn" id="trSync">Добавить схемы из рабочей базы</button></div></div>` : ''}`;
  $('#trGo', main).onclick = () => setTraining(!TRAIN);
  if (!TRAIN) return;
  $('#trGuideStart', main).onclick = () => TrainingGuide.start();
  const make = $('#trMake', main);
  if (make) make.onclick = async () => {
    const chosen = $('#trReg', main).value;
    const targets = chosen === '__all' ? regs : regs.filter(reg => reg.id === chosen);
    const count = $('#trN', main).valueAsNumber;
    if (!targets.length || !Number.isInteger(count) || count < 1 || count > 500) return toast('Выберите регистр и число пациентов от 1 до 500', 'err');
    make.disabled = true;
    let total = 0;
    try {
      for (const [index, target] of targets.entries()) {
        make.textContent = `Создаю… ${index + 1} из ${targets.length}`;
        total += await SYN.make(target, count, $('#trScenario', main).value);
      }
      toast(`Создано учебных пациентов: ${total}`);
      go(chosen === '__all' ? 'patients' : 'patients/' + targets[0].id);
    } catch (error) { toast(`Генерация остановлена. Создано в завершённых пакетах: ${total}. ${error.message}`, 'err'); }
    finally { make.disabled = false; make.textContent = 'Сгенерировать'; }
  };
  $('#trClr', main).onclick = async () => {
    if (!(await confirmBox('Удалить всех учебных пациентов и связанные записи?'))) return;
    for (const store of ['events', 'proms', 'patients', 'mdt', 'queries', 'alloc', 'screening', 'files', 'comments', 'coverage']) await DB.clear(store);
    toast('Учебные пациенты удалены'); App.route();
  };
  $('#trSync', main).onclick = async () => {
    try {
      const added = await addTrainingSchemas(DB.db, await loadTrainingSource());
      toast(added ? 'Добавлено схем: ' + added : 'Нет новых доступных схем');
      App.route();
    } catch (error) { toast(error.message, 'err'); }
  };
};

/* ================= ОТЧЁТ ХИРУРГА (как публичные отчёты NBSR) И СЕРТИФИКАТ ================= */
Routes.surgeon = async (main, regId = '', userId = '') => {
  const regs = await Data.registries(); const reg0 = regs.find(r => r.id === regId) || regs[0];
  if (!reg0) { main.innerHTML = '<div class="head"><h1>Отчёт хирурга</h1></div>' + emptyState('Нет регистров.'); return; }
  const ds = await loadReg(reg0.id); const reg = ds.reg; const users = ds.users;
  const cfg = reg.surgeonReport = Object.assign({ et: reg.keyDates?.start || reg.eventTypes[0]?.id, ukey: '', okey: '', oop: 'eq', oval: '', proc: '', los: '', thr: 40, years: 4, alertPct: 0.5 }, reg.surgeonReport || {});
  const etF = (t) => formFields(etById(reg, cfg.et) || {}).filter(f => !t || t.includes(f.type));
  if (!cfg.ukey) cfg.ukey = (etF(['user'])[0] || {}).key || '';
  if (!cfg.proc) cfg.proc = (etF(['select']).find(f => /^операц|вмешат|процедур|вид операц/i.test(f.label)) || etF(['select'])[0] || {}).key || '';
  if (!cfg.los) cfg.los = (etF(['number', 'calc']).find(f => /койк|госпит|LOS|дн/i.test(f.label)) || {}).key || '';
  if (!cfg.okey) { const o = etF(['yesno', 'select']).find(f => /летальн|смерт|умер|исход/i.test(f.label)); if (o) { cfg.okey = o.key; cfg.oval = o.type === 'yesno' ? 'да' : ''; } }
  const uf = etF(['user']).find(f => f.key === cfg.ukey);
  const rows = rowsFor(ds, cfg.et);
  const surgeons = [...new Set(rows.map(r => r.v[cfg.ukey]).filter(v => v && !USER_SPECIAL[v]))].map(id => users.find(u => u.id === id)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
  const me = Auth.user.id; const sel = userId || (surgeons.some(u => u.id === me) ? me : surgeons[0]?.id || '');
  const fo = (t, k, s) => `<select class="inp" data-sc="${k}"><option value="">-</option>${etF(t).map(f => `<option value="${f.key}" ${s === f.key ? 'selected' : ''}>${esc(f.label)}</option>`).join('')}</select>`;
  main.innerHTML = `<div class="head"><h1>Отчёт хирурга</h1><div class="row">${regSelect(regs, reg.id, 'regSel', false)}<select class="inp" id="srU">${surgeons.map(u => `<option value="${u.id}" ${u.id === sel ? 'selected' : ''}>${esc(u.name)}</option>`).join('') || '<option value="">нет данных</option>'}</select><button class="btn" id="srCert">Сертификат</button><button class="btn" id="srHtml">Опубликовать (HTML)</button><button class="btn" id="srPrint">Печать</button></div></div>
    <details class="card srcfg"><summary>Настройка отчёта (для всех хирургов регистра)</summary><div class="grid">
      <div class="fld"><label class="flab">Форма-операция</label><select class="inp" data-sc="et">${reg.eventTypes.map(e => `<option value="${e.id}" ${cfg.et === e.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select></div>
      <div class="fld"><label class="flab">Поле «Хирург»</label>${fo(['user'], 'ukey', cfg.ukey)}</div>
      <div class="fld"><label class="flab">Вид операции (для распределения)</label>${fo(['select', 'text', 'icd10'], 'proc', cfg.proc)}</div>
      <div class="fld"><label class="flab">Койко-дни</label>${fo(['number', 'calc'], 'los', cfg.los)}</div>
      <div class="fld"><label class="flab">Исход для сравнения (например, летальность)</label><div class="row">${fo(null, 'okey', cfg.okey)}<select class="inp" data-sc="oop">${Object.entries(OPS).map(([k, v]) => `<option value="${k}" ${cfg.oop === k ? 'selected' : ''}>${v}</option>`).join('')}</select><input class="inp" data-sc="oval" value="${esc(cfg.oval)}" placeholder="значение"></div></div>
      <div class="fld"><label class="flab">Рекомендуемый минимум операций в год</label><input class="inp" type="number" data-sc="thr" value="${esc(cfg.thr)}"></div>
      <div class="fld"><label class="flab">Период, лет</label><input class="inp" type="number" data-sc="years" value="${esc(cfg.years)}" min="1" max="10"></div>
      <div class="fld"><label class="flab">Контрольный порог регистра, % (необязательно)</label><input class="inp" type="number" step="0.1" data-sc="alertPct" value="${esc(cfg.alertPct)}"></div>
    </div><div class="row"><button class="btn primary" id="srSave">Сохранить настройку</button></div><p class="fhint">Статус хирурга считается по точному биномиальному критерию против частоты регистра (95% и 99,8% границы, HQIP). Контрольный порог в процентах необязателен: это отдельное правило регистра, оно показывается отдельной строкой.</p></details>
    <div id="srOut"></div>`;
  $('#regSel').onchange = e => go('surgeon/' + e.target.value);
  $('#srU').onchange = e => go('surgeon/' + reg.id + '/' + e.target.value);
  $('#srSave').onclick = async () => { $$('[data-sc]').forEach(el => cfg[el.dataset.sc] = el.type === 'number' ? Number(el.value) : el.value); await DB.put('registries', reg, 'настройка отчёта хирурга'); toast('Сохранено'); App.route(); };
  if (!sel || !uf) { $('#srOut').innerHTML = `<div class="card muted">${uf ? 'В этой форме пока нет операций с указанным хирургом.' : 'В форме нет поля типа «Сотрудник». Выберите форму и поле в настройке.'}</div>`; return; }
  const R = surgeonStats(ds, cfg, sel);
  const u = users.find(x => x.id === sel);
  $('#srOut').innerHTML = surgeonHTML(reg, cfg, u, R, true);
  const html = () => surgeonHTML(reg, cfg, u, R, false);
  $('#srPrint').onclick = () => { const w = window.open('', '_blank'); w.document.write(`<html><head><meta charset="utf-8"><title>Отчёт хирурга</title><style>${SR_CSS}</style></head><body>${html()}</body></html>`); w.document.close(); setTimeout(() => w.print(), 400); };
  $('#srHtml').onclick = () => download(`отчёт_${slug(u.name)}_${today()}.html`, `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(reg.name)}: ${esc(u.name)}</title><style>${SR_CSS}</style></head><body>${html()}<p class="foot">Опубликовано из AddAll 2.0 · ${fmtDate(today())}</p></body></html>`, 'text/html');
  $('#srCert').onclick = () => certificate(reg, u, R);
};
function surgeonStats(ds, cfg, uid_) {
  const from = yearsBack(Number(cfg.years) || 4); const rows = rowsFor(ds, cfg.et).filter(r => r.e.date >= from);
  const mine = rows.filter(r => r.v[cfg.ukey] === uid_);
  const o = { key: cfg.okey, op: cfg.oop || 'eq', value: cfg.oval || '' };
  const outc = (rs) => cfg.okey ? rs.filter(r => condOK(o, r.v)).length : null;
  const k = outc(mine), K = outc(rows);
  const byYear = {}; mine.forEach(r => { const y = r.e.date.slice(0, 4); byYear[y] = (byYear[y] || 0) + 1; });
  const proc = {}; if (cfg.proc) mine.forEach(r => { const v = r.v[cfg.proc] || 'не указано'; proc[v] = (proc[v] || 0) + 1; });
  const losV = cfg.los ? mine.map(r => Number(r.v[cfg.los])).filter(x => !isNaN(x) && x !== 0) : [];
  const losAll = cfg.los ? rows.map(r => Number(r.v[cfg.los])).filter(x => !isNaN(x) && x !== 0) : [];
  let ct = 0, cf = 0; const et = etById(ds.reg, cfg.et); mine.forEach(r => { const c = completeness(et, r.v); ct += c.total; cf += c.filled; });
  const ci = wilson(k || 0, mine.length), ciAll = wilson(K || 0, rows.length);
  const thrPct = Number(cfg.alertPct || 0) / 100; const rate = mine.length ? (k || 0) / mine.length : 0;
  /* 2.11: статус по точному биномиальному критерию против частоты регистра (границы 95% и 99,8%, HQIP 2017) */
  const p0 = rows.length ? (K || 0) / rows.length : 0;
  const pHi = cfg.okey && mine.length ? Stats.bupper(k || 0, mine.length, p0) : 1, pLo = cfg.okey && mine.length ? Stats.bcdf(k || 0, mine.length, p0) : 1;
  const status = !cfg.okey || !mine.length ? 'ok' : pHi < 0.001 ? 'outlier' : pHi < 0.025 ? 'alert' : pLo < 0.025 ? 'better' : 'ok';
  const overThr = cfg.okey && thrPct > 0 && rate > thrPct;
  /* 2.11: достижимый ориентир лучших (Achievable Benchmark of Care, Kiefe 1998): хирурги ранжируются по скорректированной доле (k+1)/(n+2),
     лучшие берутся, пока их пациенты не составят не менее 10% всех; ориентир = сумма исходов / сумма операций этих хирургов */
  let abc = null;
  if (cfg.okey && rows.length) {
    const by = {}; rows.forEach(r => { const u = r.v[cfg.ukey]; if (!u) return; by[u] = by[u] || { n: 0, k: 0 }; by[u].n++; if (condOK(o, r.v)) by[u].k++; });
    const list = Object.values(by).map(x => ({ ...x, apf: (x.k + 1) / (x.n + 2) })).sort((a, b) => a.apf - b.apf);
    const need = Math.ceil(rows.length * 0.1); let sn = 0, sk = 0, m = 0; for (const x of list) { if (sn >= need) break; sn += x.n; sk += x.k; m++; }
    if (list.length >= 2 && sn) abc = { rate: sk / sn, k: sk, n: sn, providers: m, of: list.length };
  }
  const hospitals = [...new Set(mine.map(r => r.p.center).filter(Boolean))];
  return { n: mine.length, N: rows.length, k, K, ci, ciAll, byYear, proc, los: Stats.summary(losV), losAll: Stats.summary(losAll), comp: ct ? Math.round(cf / ct * 100) : 100, pHi, overThr, p0, abc, perYear: Math.round(mine.length / (Number(cfg.years) || 4) * 10) / 10, status, hospitals, from };
}
const SR_CSS = `body{font-family:'IBM Plex Sans',Arial,sans-serif;color:#1b2340;margin:24px;max-width:1000px}.srh{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;border-bottom:3px solid #1F2F84;padding-bottom:10px;margin-bottom:14px}.srh h2{margin:0;color:#1F2F84}.srk{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin:12px 0}.srk>div{border:1px solid #d8dcec;border-radius:10px;padding:10px 12px}.srk b{display:block;font-size:24px;color:#1F2F84}.srk span{font-size:12px;color:#5a6280}.srt{width:100%;border-collapse:collapse;margin:8px 0}.srt td,.srt th{border-bottom:1px solid #e3e6f2;padding:6px 8px;text-align:left;font-size:13.5px}.srst{padding:8px 12px;border-radius:8px;margin:10px 0}.srst.ok{background:#e8f6ee}.srst.alert{background:#fff4dc}.srst.outlier{background:#fde6e6}.srbar{display:flex;align-items:center;gap:8px}.srbar i{display:block;height:10px;background:#1F2F84;border-radius:4px}.muted{color:#6b7392}.foot{color:#8a90a8;font-size:12px;margin-top:20px}h3{color:#1F2F84;margin:18px 0 6px}`;
function surgeonHTML(reg, cfg, u, R, inApp) {
  const of = cfg.okey ? fieldsOf(reg, cfg.et).find(f => f.key === cfg.okey) : null;
  const years = Object.keys(R.byYear).sort(); const maxY = Math.max(1, ...Object.values(R.byYear)); const maxP = Math.max(1, ...Object.values(R.proc));
  const st = { ok: 'Частота исхода статистически не отличается от регистра (в пределах 95% границы).', better: 'Частота исхода ниже, чем в регистре (за пределами 95% границы снизу).', alert: 'Предупреждение: частота исхода выше регистра за пределами 95% границы (точный биномиальный критерий, p < 0,025). Рекомендуется разбор.', outlier: 'Тревога: частота исхода выше регистра за пределами 99,8% границы (p < 0,001). Нужен разбор практики за весь период.' }[R.status];
  return `<div class="${inApp ? 'card ' : ''}srep"><style>${inApp ? SR_CSS.replace(/body\{[^}]*\}/, '').replace(/(^|\})([^{@]+)\{/g, (m, a, b) => a + b.split(',').map(x => '.srep ' + x.trim()).join(',') + '{') : ''}</style>
    <div class="srh"><div><div class="muted">${esc(reg.name)} · отчёт по результатам хирурга</div><h2>${esc(u.name)}</h2><div class="muted">${esc([u.position, u.dept, ...(R.hospitals || [])].filter(Boolean).join(' · '))}</div></div><div class="muted">Период: ${fmtDate(R.from)} - ${fmtDate(today())}</div></div>
    <div class="srk"><div><b>${R.n}</b><span>операций за период</span></div><div><b>${R.perYear}</b><span>в среднем в год${cfg.thr ? ` (рекомендуемо ≥ ${cfg.thr})` : ''}</span></div>${of ? `<div><b>${pc1(R.ci.p)}</b><span>${esc(of.label)}: ${R.k} из ${R.n}<br>95% ДИ ${pc1(R.ci.lo)} - ${pc1(R.ci.hi)}</span></div><div><b>${pc1(R.ciAll.p)}</b><span>по регистру: ${R.K} из ${R.N}</span></div>${R.abc ? `<div><b>${pc1(R.abc.rate)}</b><span>ориентир лучших (ABC): ${R.abc.providers} из ${R.abc.of} хирургов, ${R.abc.k} из ${R.abc.n}</span></div>` : ''}` : ''}${R.los.n ? `<div><b>${R.los.median}</b><span>койко-дней, медиана (регистр ${R.losAll.median})</span></div>` : ''}<div><b>${R.comp}%</b><span>полнота данных</span></div></div>
    ${cfg.thr && R.perYear < cfg.thr ? `<div class="srst alert">Объём ниже рекомендуемого минимума ${cfg.thr} операций в год.</div>` : ''}
    ${of ? `<div class="srst ${R.status === 'better' ? 'ok' : R.status}">${st}</div>` : ''}${of && R.overThr ? `<div class="srst alert">Частота выше контрольного порога регистра ${cfg.alertPct}% (порог задан руководителем регистра, это не статистический критерий).</div>` : ''}
    <h3>Операции по годам</h3><table class="srt"><tbody>${years.map(y => `<tr><td style="width:70px">${y}</td><td><div class="srbar"><i style="width:${R.byYear[y] / maxY * 100}%"></i>${R.byYear[y]}</div></td></tr>`).join('') || '<tr><td class="muted">нет</td></tr>'}</tbody></table>
    ${Object.keys(R.proc).length ? `<h3>Виды операций</h3><table class="srt"><tbody>${Object.entries(R.proc).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${esc(k)}</td><td style="width:55%"><div class="srbar"><i style="width:${v / maxP * 100}%"></i>${v}</div></td></tr>`).join('')}</tbody></table>` : ''}
    <p class="muted">95% доверительный интервал по методу Уилсона. Сравнение с частотой всего регистра за тот же период и по той же форме: точный односторонний биномиальный критерий, пороги 95% (предупреждение) и 99,8% (тревога) по руководству HQIP. Ориентир лучших: метод Achievable Benchmark of Care (Kiefe 1998), лучшие хирурги, на которых приходится не менее 10% операций. Без поправки на риск.</p></div>`;
}
function certificate(reg, u, R) {
  const w = window.open('', '_blank');
  w.document.write(`<html><head><meta charset="utf-8"><title>Сертификат участника регистра</title><style>@page{size:A4 landscape;margin:14mm}body{font-family:'Times New Roman',serif;color:#1b2340}.c{border:6px double #1F2F84;padding:40px 60px;text-align:center;min-height:150mm}h1{font-size:34px;color:#1F2F84;margin:10px 0 4px;letter-spacing:.04em}h2{font-size:28px;margin:22px 0 4px}p{font-size:17px;line-height:1.5}.r{display:flex;justify-content:space-between;margin-top:50px;font-size:15px}.s{border-top:1px solid #333;width:240px;padding-top:4px}</style></head><body><div class="c">
    <div>${esc(Settings.data.center || '')}${Settings.data.department ? ' · ' + esc(Settings.data.department) : ''}</div>
    <h1>СЕРТИФИКАТ</h1><div>участника клинического регистра</div><h2>${esc(u.name)}</h2><div>${esc(u.position || '')}</div>
    <p>подтверждает участие в регистре <b>«${esc(reg.name)}»</b><br>за период с ${fmtDate(R.from)} по ${fmtDate(today())}: внесено <b>${R.n}</b> операций, полнота данных <b>${R.comp}%</b>.</p>
    <p>Сертификат предназначен для портфолио аттестации и подтверждения непрерывного аудита собственной практики.</p>
    <div class="r"><div>Дата выдачи: ${fmtDate(today())}</div><div class="s">Руководитель регистра</div></div></div></body></html>`);
  w.document.close(); setTimeout(() => w.print(), 400);
}

/* ================= ЭКСПОРТ МОИХ ДАННЫХ (Export My Data) ================= */
function flattenGroups(fields, list, parentRef, prefix, out) {
  (fields || []).filter(f => f.type === 'group').forEach(g => {
    const name = prefix ? prefix + ' › ' + (g.itemLabel || g.label) : (g.itemLabel || g.label);
    out[name] = out[name] || { fields: g.subfields.filter(x => x.type !== 'group'), rows: [] };
    list.forEach(({ ref, data }) => (data[g.key] || []).forEach((it, i) => {
      const r2 = ref + '.' + (i + 1); out[name].rows.push({ ref: r2, parent: ref, it });
      flattenGroups(g.subfields, [{ ref: r2, data: it }], r2, name, out);
    }));
  });
}
Routes.mydata = async (main) => {
  const regs = await Data.registries();
  main.innerHTML = `<div class="head"><h1>Экспорт моих данных</h1></div>
    <div class="card"><p class="muted">Выгрузка в Excel всех ваших записей регистра за выбранный период: отдельные листы для пациентов, для каждого типа события и для каждой группы вложенных записей (например, анастомозы внутри операции). Делегаты выгружают записи врачей, за которых вносили данные.</p>
    <div class="grid"><div class="fld"><label class="flab">Регистр</label>${regSelect(regs, regs[0]?.id, 'mdReg', false)}</div>
      <div class="fld"><label class="flab">С</label><input class="inp" type="date" id="mdFrom"></div><div class="fld"><label class="flab">По</label><input class="inp" type="date" id="mdTo" value="${today()}"></div>
      <div class="fld"><label class="flab">Какие записи</label><select class="inp" id="mdScope"><option value="mine">мои (я владелец или вносил)</option>${can('export') ? '<option value="all">все доступные мне</option>' : ''}</select></div>
      <div class="fld"><label class="flab">Персональные данные</label><select class="inp" id="mdPii"><option value="0">без прямых идентификаторов</option>${can('users') ? '<option value="1">с идентификаторами пациентов</option>' : ''}</select></div></div>
    <button class="btn primary" id="mdGo">Скачать Excel</button></div>
    <div class="card"><p class="muted small">Скачанный файл содержит данные пациентов. Храните его в защищённом месте учреждения и удаляйте, когда он больше не нужен.</p></div>`;
  $('#mdGo').onclick = async () => {
    const ds = await loadReg($('#mdReg').value); const reg = ds.reg; const from = $('#mdFrom').value, to = $('#mdTo').value; const me = Auth.user.id; const pii = can('users') && $('#mdPii').value === '1';
    const ev = ds.events.filter(e => (!from || e.date >= from) && (!to || e.date <= to) && ($('#mdScope').value === 'all' || e.ownerId === me || e.createdBy === me));
    if (!ev.length) return toast('Нет записей за выбранный период', 'err');
    if (!pii) {
      const ids = new Set(ev.map(event => event.patientId));
      const dataset = RegistryExport.assemble({ ...ds, events: ev, patients: ds.patients.filter(p => ids.has(p.id)) }, [],
        { from, to, drafts: true, identified: false });
      RegistryExport.downloadBundle(dataset, 'xlsx', slug(reg.name) + '_my_' + today());
      await Audit.log('экспорт моих данных без прямых идентификаторов', 'registries', reg.id, null, null);
      return;
    }
    if (!await confirmBox('В выгрузку войдут идентификаторы пациентов. Продолжить?')) return;
    const pIds = new Set(ev.map(e => e.patientId)); const P = ds.patients.filter(p => pIds.has(p.id));
    const sheets = [{ name: 'Пациенты', rows: [['ID', '№ ИБ', ...(pii ? ['Фамилия', 'Имя', 'Отчество', 'Дата рождения'] : ['Год рождения']), 'Пол', 'Центр', 'Статус', 'Дата смерти', ...(reg.patientFields || []).map(f => f.label)], ...P.map(p => [p.id, p.localId, ...(pii ? [p.lastName, p.firstName, p.middleName, p.birthDate] : [Number((p.birthDate || '').slice(0, 4)) || '']), p.sex, p.center || '', p.vital || '', p.deathDate || '', ...(reg.patientFields || []).map(f => valStr(f, p.data?.[f.key], ds.users))])] }];
    const groups = {};
    reg.eventTypes.forEach(et => {
      const E = ev.filter(e => e.type === et.id); if (!E.length) return; const ff = formFields(et).filter(f => f.type !== 'group');
      sheets.push({ name: et.name, rows: [['ID события', 'ID пациента', '№ ИБ', 'Дата', 'Владелец', 'Статус', ...ff.map(f => f.label)], ...E.map(e => { const p = ds.patients.find(x => x.id === e.patientId); const v = computeValues(reg, p, et, e.data, e.date); return [e.id, e.patientId, p?.localId || '', e.date, ds.users.find(u => u.id === (e.ownerId || e.createdBy))?.name || '', e.status || '', ...ff.map(f => f.type === 'complist' ? (v[f.key] || []).map(c => c.name + ' (' + c.grade + ')').join('; ') : valStr(f, v[f.key], ds.users))]; })] });
      flattenGroups(formFields(et), E.map(e => ({ ref: e.id, data: e.data || {} })), '', et.name, groups);
    });
    Object.entries(groups).forEach(([name, g]) => { if (g.rows.length) sheets.push({ name, rows: [['Код записи', 'Родитель (событие или запись)', ...g.fields.map(f => f.label)], ...g.rows.map(r => [r.ref, r.parent, ...g.fields.map(f => valStr(f, r.it[f.key], ds.users))])] }); });
    Office.book(`${slug(reg.name)}_мои_данные_${today()}.xlsx`, sheets);
    await DB.rawPut('audit', { id: uid('au_'), ts: nowISO(), user: me, userName: Auth.user.name, action: `экспорт моих данных: ${ev.length} событий`, store: 'events', recId: reg.id });
  };
};

/* ================= ДОКУМЕНТЫ РЕГИСТРА (Download Document) ================= */
Routes.regdocs = async (main, regId = '') => {
  const regs = await Data.registries(); const reg = regs.find(r => r.id === regId) || regs[0];
  if (!reg) { main.innerHTML = '<div class="head"><h1>Документы регистров</h1></div>' + emptyState('Нет регистров.'); return; }
  const files = (await DB.all('files')).filter(f => f.registryDoc === reg.id).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  main.innerHTML = `<div class="head"><h1>Документы регистра</h1><div class="row">${regSelect(regs, reg.id, 'regSel', false)}</div></div>
    <div class="card"><h3>Создаются автоматически</h3><div class="row"><button class="btn" id="rdForm">Бумажная форма регистра (печать / PDF)</button><a class="btn" href="#dictionary/${reg.id}">Словарь данных</a><button class="btn" id="rdGuide">Краткая инструкция по заполнению</button></div>
      <p class="fhint">Бумажная форма повторяет все вопросы регистра: её распечатывают для заполнения в операционной и потом переносят в систему.</p></div>
    <div class="card"><div class="row between"><h3>Загруженные документы (${files.length})</h3>${can('design') ? '<label class="btn sm">+ Загрузить (протокол, инструкция, согласие)<input type="file" id="rdUp" multiple hidden></label>' : ''}</div>
      ${files.map(f => `<div class="fi"><span>${/pdf/.test(f.type) ? '📄' : /word|docx/.test(f.type + f.name) ? '📝' : '📎'}</span><a href="javascript:void 0" data-ro="${f.id}">${esc(f.name)}</a><span class="muted small">${Math.round(f.size / 1024)} КБ · ${fmtDate(f.createdAt?.slice(0, 10))}</span>${can('design') ? `<button class="btn xs" data-rx="${f.id}">×</button>` : ''}</div>`).join('') || '<p class="muted">Пока ничего не загружено. Обычно здесь лежат протокол регистра, формы согласия, инструкции и обучающие материалы.</p>'}</div>`;
  $('#regSel').onchange = e => go('regdocs/' + e.target.value);
  $('#rdForm').onclick = () => paperForm(reg);
  $('#rdGuide').onclick = () => quickGuide(reg);
  const up = $('#rdUp'); if (up) up.onchange = async () => { for (const f of up.files) await DB.put('files', { registryDoc: reg.id, name: f.name, type: f.type, size: f.size, blob: f }, 'документ регистра'); toast('Загружено'); App.route(); };
  $$('[data-ro]').forEach(a => a.onclick = async () => { const f = await DB.get('files', a.dataset.ro); window.open(URL.createObjectURL(f.blob), '_blank'); });
  $$('[data-rx]').forEach(b => b.onclick = async () => { if (await confirmBox('Удалить документ?')) { await DB.del('files', b.dataset.rx); App.route(); } });
};
function paperFields(fields, d = 0) {
  return (fields || []).map(f => {
    let a = '';
    if (['select', 'multiselect'].includes(f.type)) a = (f.options || []).map(o => `<span class="pb">☐ ${esc(o)}</span>`).join(' ');
    else if (f.type === 'yesno') a = '<span class="pb">☐ да</span> <span class="pb">☐ нет</span> <span class="pb">☐ неизвестно</span>';
    else if (f.type === 'calc') a = '<span class="muted">рассчитывается автоматически</span>';
    else if (f.type === 'date') a = '__ . __ . ______';
    else if (f.type === 'complist') a = '<div class="ln"></div><span class="muted">осложнение · Clavien-Dindo I / II / IIIa / IIIb / IVa / IVb / V · дата</span>';
    else if (f.type === 'group') return `<tr><td colspan="2" style="padding-left:${d * 16 + 4}px"><b>${esc(f.label)}</b> <span class="muted">(повторить для каждой записи: ${esc(f.itemLabel || 'запись')})</span></td></tr>${paperFields(f.subfields, d + 1)}`;
    else a = `<div class="ln"></div>${f.unit ? ` <span class="muted">${esc(f.unit)}</span>` : ''}`;
    return `<tr><td style="padding-left:${d * 16 + 4}px">${esc(f.label)}${f.required ? ' *' : ''}${f.showIf?.key ? `<div class="muted small">если ${esc(f.showIf.key)} ${OPS[f.showIf.op] || ''} ${esc(f.showIf.value || '')}</div>` : ''}${f.warn ? `<div class="wr">${esc(f.warn)}</div>` : ''}</td><td>${a}</td></tr>`;
  }).join('');
}
function paperForm(reg) {
  const w = window.open('', '_blank');
  w.document.write(`<html><head><meta charset="utf-8"><title>${esc(reg.name)}: бумажная форма</title><style>@page{size:A4;margin:12.7mm}body{font-family:'Times New Roman',serif;font-size:10.5pt;color:#111}h1{font-size:15pt;margin:0}h2{font-size:12.5pt;border-bottom:2px solid #1F2F84;margin:16px 0 4px;color:#1F2F84;page-break-after:avoid}h3{font-size:11pt;margin:10px 0 2px}table{width:100%;border-collapse:collapse}td{border-bottom:1px solid #ccc;padding:4px;vertical-align:top}td:first-child{width:42%}.pb{display:inline-block;margin:0 10px 2px 0;white-space:nowrap}.ln{display:inline-block;border-bottom:1px solid #555;width:70%;height:14px}.muted{color:#666}.small{font-size:8.5pt}.wr{color:#b00;font-size:9pt}.hdr td{border:1px solid #999;padding:6px}</style></head><body>
    <h1>${esc(reg.name)}</h1><div class="muted">Бумажная форма регистра · версия схемы ${reg.version || 1} · ${esc(Settings.data.center || '')}</div>
    <table class="hdr" style="margin-top:8px"><tr><td>№ ИБ: </td><td>ФИО: </td><td>Дата рождения: </td><td>Пол: М / Ж</td></tr></table>
    ${(reg.patientFields || []).length ? `<h2>Карточка пациента</h2><table>${paperFields(reg.patientFields)}</table>` : ''}
    ${reg.eventTypes.map(et => `<h2>${esc(et.name)} · ${esc(et.dateLabel || 'Дата')}: __ . __ . ______</h2>${(et.sections || []).map(s => `<h3>${esc(s.title)}</h3>${s.note ? `<div class="wr">${esc(s.note)}</div>` : ''}<table>${paperFields(s.fields)}</table>`).join('')}`).join('')}
    <p class="muted small">* обязательный вопрос</p></body></html>`);
  w.document.close(); setTimeout(() => w.print(), 400);
}
function quickGuide(reg) {
  const w = window.open('', '_blank');
  w.document.write(`<html><head><meta charset="utf-8"><title>Инструкция: ${esc(reg.name)}</title><style>body{font-family:Arial,sans-serif;max-width:820px;margin:24px auto;line-height:1.5;color:#1b2340}h1{color:#1F2F84}li{margin:4px 0}.k{background:#eef1fb;border-radius:6px;padding:1px 6px}</style></head><body>
    <h1>Краткая инструкция: ${esc(reg.name)}</h1>
    <ol><li>Откройте AddAll и войдите под своим логином. После 3 неверных паролей вход блокируется на 15 минут: обратитесь к администратору.</li>
    <li>Пациенты: <span class="k">Пациенты → ${esc(reg.name)}</span>. Цвет строки: зелёная: запись полная, жёлтая: неполная или черновик, красная: пациент умер.</li>
    <li>Новый пациент: <span class="k">+ Пациент</span> или <span class="k">✦ Пациент из документа</span> (ИИ заполнит поля из выписки).</li>
    <li>В карточке пациента нажмите тип события: ${reg.eventTypes.map(e => `<span class="k">${esc(e.name)}</span>`).join(', ')}.</li>
    <li>Форма разбита на страницы: <span class="k">Назад</span> / <span class="k">Далее</span>, список страниц вверху. Поле с зелёной полосой заполнено, с серой нет. Красная звёздочка: обязательный вопрос.</li>
    <li>Последняя страница <span class="k">Сводка</span> показывает все ответы. Красная ссылка «Не заполнено» ведёт прямо к вопросу, затем <span class="k">Вернуться к сводке</span>.</li>
    <li>Вложенные записи (например, анастомозы или лимфоузлы внутри операции) добавляются кнопкой <span class="k">+</span> в самом поле.</li>
    <li>Если вносите данные за врача, выберите его в поле <span class="k">Владелец записи</span>. Врач назначает делегатов в разделе <span class="k">Работа → Делегаты</span>.</li>
    <li>Не хватает данных: <span class="k">Сохранить черновик</span>. Полную запись: <span class="k">Сохранить</span>.</li>
    <li>Свои данные можно в любой момент выгрузить: <span class="k">Работа → Экспорт моих данных</span>.</li>
    <li>Потренироваться без риска: <span class="k">Работа → Учебный режим</span>.</li></ol></body></html>`);
  w.document.close();
}

/* ================= РИСУНОК-СХЕМА В КАРТОЧКЕ ПАЦИЕНТА ================= */
const SCHEMES = {
  blank: { n: 'Чистый лист', svg: '' },
  colon: { n: 'Толстая кишка (отделы)', svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 450"><g fill="none" stroke="#555" stroke-width="22" stroke-linecap="round" stroke-linejoin="round" opacity=".55"><path d="M170 380 L150 120 Q150 70 200 70 L400 70 Q450 70 450 120 L450 260 Q450 300 420 320 Q380 340 330 330 L310 350 Q300 400 300 430"/></g><g font-family="Arial" font-size="15" fill="#333"><text x="85" y="390">слепая</text><text x="60" y="240">восходящая</text><text x="85" y="95">печёночный изгиб</text><text x="250" y="52">поперечная ободочная</text><text x="420" y="95">селезёночный изгиб</text><text x="465" y="200">нисходящая</text><text x="355" y="360">сигмовидная</text><text x="320" y="425">прямая кишка</text></g></svg>` },
  abdomen: { n: 'Передняя брюшная стенка', svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 450"><g fill="none" stroke="#666" stroke-width="2" opacity=".7"><path d="M170 30 Q130 200 160 430 L440 430 Q470 200 430 30 Z"/><path d="M300 30 L300 430" stroke-dasharray="6 6"/><path d="M155 170 L445 170 M150 300 L450 300" stroke-dasharray="6 6"/><circle cx="300" cy="240" r="8"/></g><g font-family="Arial" font-size="13" fill="#555"><text x="190" y="110">правое подреберье</text><text x="320" y="110">левое подреберье</text><text x="200" y="240">правый фланк</text><text x="330" y="240">левый фланк</text><text x="185" y="370">правая подвздошная</text><text x="320" y="370">левая подвздошная</text></g></svg>` },
  pelvis: { n: 'Таз: лимфоузлы (схема станций)', svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 450"><g fill="none" stroke="#666" stroke-width="2" opacity=".7"><path d="M120 60 Q60 250 200 420 L400 420 Q540 250 480 60"/><path d="M300 40 L300 200 M300 200 L200 330 M300 200 L400 330 M240 270 L180 360 M360 270 L420 360"/></g><g font-family="Arial" font-size="13" fill="#555"><text x="310" y="120">аорта / нижняя брыжеечная</text><text x="140" y="300">общие подвздошные</text><text x="120" y="380">внутренние подвздошные (263)</text><text x="380" y="380">запирательные (283)</text></g></svg>` }
};
function drawingDialog(p, reg) {
  const m = modal(`<h3>Схема / рисунок</h3><div class="row"><select class="inp" id="dwBg">${Object.entries(SCHEMES).map(([k, s]) => `<option value="${k}">${s.n}</option>`).join('')}<option value="img">Своё изображение…</option></select><input type="file" id="dwImg" accept="image/*" hidden>
    <span class="dwc">${['#d32f2f', '#1F2F84', '#2e7d32', '#111'].map((c, i) => `<button class="dwcol${i ? '' : ' on'}" data-c="${c}" style="background:${c}"></button>`).join('')}</span>
    <select class="inp xs" id="dwW"><option value="3">тонко</option><option value="6" selected>средне</option><option value="12">толсто</option></select>
    <button class="btn xs" id="dwT">Текст</button><button class="btn xs" id="dwU">Отменить</button><button class="btn xs" id="dwX">Очистить</button></div>
    <div class="dwbox"><canvas id="dwCv" width="1200" height="900"></canvas></div>
    <div class="row between"><input class="inp" id="dwN" placeholder="Подпись к рисунку" value="Схема ${fmtDate(today())}"><button class="btn primary" id="dwS">Сохранить в карточку</button></div>`, { wide: true });
  const cv = $('#dwCv', m), ctx = cv.getContext('2d'); let bg = null, color = '#d32f2f', width = 6, strokes = [], cur = null, textMode = false;
  const redraw = () => { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); if (bg) ctx.drawImage(bg, 0, 0, cv.width, cv.height); strokes.forEach(s => { if (s.text) { ctx.fillStyle = s.c; ctx.font = `${s.w * 5 + 14}px Arial`; ctx.fillText(s.text, s.x, s.y); return; } ctx.strokeStyle = s.c; ctx.lineWidth = s.w; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); s.pts.forEach((pt, i) => i ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1])); ctx.stroke(); }); };
  const setBg = (k) => { if (k === 'img') return $('#dwImg', m).click(); const s = SCHEMES[k].svg; if (!s) { bg = null; redraw(); return; } const im = new Image(); im.onload = () => { bg = im; redraw(); }; im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s); };
  $('#dwBg', m).onchange = e => setBg(e.target.value);
  $('#dwImg', m).onchange = e => { const f = e.target.files[0]; if (!f) return; const im = new Image(); im.onload = () => { bg = im; redraw(); }; im.src = URL.createObjectURL(f); };
  $$('.dwcol', m).forEach(b => b.onclick = () => { color = b.dataset.c; $$('.dwcol', m).forEach(x => x.classList.toggle('on', x === b)); });
  $('#dwW', m).onchange = e => width = Number(e.target.value);
  $('#dwT', m).onclick = () => { textMode = !textMode; $('#dwT', m).classList.toggle('primary', textMode); };
  $('#dwU', m).onclick = () => { strokes.pop(); redraw(); };
  $('#dwX', m).onclick = () => { strokes = []; redraw(); };
  const pos = e => { const r = cv.getBoundingClientRect(); const t = e.touches ? e.touches[0] : e; return [(t.clientX - r.left) * cv.width / r.width, (t.clientY - r.top) * cv.height / r.height]; };
  const down = async e => { e.preventDefault(); const pt = pos(e); if (textMode) { const t = await promptBox('Текст на схеме'); if (t) { strokes.push({ text: t, x: pt[0], y: pt[1], c: color, w: width }); redraw(); } return; } cur = { c: color, w: width, pts: [pt] }; strokes.push(cur); };
  const move = e => { if (!cur) return; e.preventDefault(); cur.pts.push(pos(e)); redraw(); };
  const up = () => { cur = null; };
  cv.addEventListener('mousedown', down); cv.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
  cv.addEventListener('touchstart', down, { passive: false }); cv.addEventListener('touchmove', move, { passive: false }); cv.addEventListener('touchend', up);
  redraw();
  $('#dwS', m).onclick = () => cv.toBlob(async b => { const name = ($('#dwN', m).value.trim() || 'Схема') + '.png'; await DB.put('files', { patientId: p.id, name, type: 'image/png', size: b.size, blob: b, drawing: true }, 'схема в карточке'); m.close(); toast('Схема сохранена в файлы пациента'); App.route(); }, 'image/png');
}
const _pfBind = PFiles.bind.bind(PFiles);
PFiles.bind = function (root, p, reg) {
  _pfBind(root, p, reg);
  if (!can('enter')) return;
  const h = $('.files .row', root); if (h && !$('#pfDraw', root)) { h.lastElementChild?.insertAdjacentHTML('beforebegin', '<button class="btn xs" id="pfDraw">✎ Схема</button>'); $('#pfDraw', root).onclick = () => drawingDialog(p, reg); }
};

/* ================= ЗАПРОСЫ СУБЪЕКТОВ ДАННЫХ ================= */
Routes.dsr = async (main) => {
  const S = Settings.data; S.dsr = S.dsr || [];
  const st = { 'получен': 'warnt', 'в работе': 'warnt', 'выполнен': 'okt', 'отклонён': '' };
  main.innerHTML = `<div class="head"><h1>Запросы субъектов данных</h1><button class="btn primary" id="dsN">+ Запрос</button></div>
    <p class="muted">Журнал обращений пациентов и сотрудников по их персональным данным: доступ к данным, исправление, удаление, отказ от участия в регистре. Срок ответа считается от даты получения (по умолчанию 30 дней).</p>
    <table class="tbl"><thead><tr><th>Получен</th><th>Заявитель</th><th>Тип</th><th>Суть</th><th>Срок</th><th>Статус</th><th></th></tr></thead><tbody>${S.dsr.slice().reverse().map(r => { const due = addDays(r.at, 30); const late = r.status !== 'выполнен' && r.status !== 'отклонён' && due < today(); return `<tr><td>${fmtDate(r.at)}</td><td><b>${esc(r.who)}</b><div class="muted small">${esc(r.kind)}${r.patient ? ' · ' + esc(r.patient) : ''}</div></td><td>${esc(r.type)}</td><td>${esc(r.text)}</td><td class="${late ? 'bad' : ''}">${fmtDate(due)}</td><td><span class="tag ${st[r.status] || ''}">${esc(r.status)}</span></td><td><button class="btn xs" data-de="${r.id}">✎</button></td></tr>`; }).join('') || '<tr><td colspan="7" class="muted">Запросов нет</td></tr>'}</tbody></table>`;
  const dlg = (r) => { const x = r ? clone(r) : { id: uid('ds'), at: today(), status: 'получен', kind: 'пациент', type: 'доступ к данным' };
    const m = modal(`<h3>Запрос субъекта данных</h3><div class="grid">
      <div class="fld"><label class="flab">Дата получения</label><input class="inp" type="date" id="d_at" value="${esc(x.at)}"></div>
      <div class="fld"><label class="flab">Заявитель</label><input class="inp" id="d_w" value="${esc(x.who || '')}"></div>
      <div class="fld"><label class="flab">Кто это</label><select class="inp" id="d_k">${['пациент', 'законный представитель', 'сотрудник', 'врач', 'другое'].map(o => `<option ${x.kind === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
      <div class="fld"><label class="flab">№ ИБ пациента (если есть)</label><input class="inp" id="d_p" value="${esc(x.patient || '')}"></div>
      <div class="fld"><label class="flab">Тип запроса</label><select class="inp" id="d_t">${['доступ к данным', 'исправление', 'удаление / отзыв согласия', 'ограничение обработки', 'копия данных', 'другое'].map(o => `<option ${x.type === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
      <div class="fld"><label class="flab">Статус</label><select class="inp" id="d_s">${Object.keys(st).map(o => `<option ${x.status === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
      <div class="fld wide"><label class="flab">Суть запроса и что сделано</label><textarea class="inp" id="d_x" rows="3">${esc(x.text || '')}</textarea></div>
      <div class="fld"><label class="flab">Личность подтверждена</label><select class="inp" id="d_id"><option value="нет">нет</option><option ${x.idOk === 'да' ? 'selected' : ''}>да</option></select></div></div>
      <div class="row end"><button class="btn primary" id="d_ok">Сохранить</button></div>`, { wide: true });
    $('#d_ok', m).onclick = async () => { Object.assign(x, { at: $('#d_at', m).value, who: $('#d_w', m).value.trim(), kind: $('#d_k', m).value, patient: $('#d_p', m).value.trim(), type: $('#d_t', m).value, status: $('#d_s', m).value, text: $('#d_x', m).value.trim(), idOk: $('#d_id', m).value });
      if (!x.who) return toast('Укажите заявителя', 'err'); const i = S.dsr.findIndex(y => y.id === x.id); if (i >= 0) S.dsr[i] = x; else S.dsr.push(x); await Settings.save();
      await DB.rawPut('audit', { id: uid('au_'), ts: nowISO(), user: Auth.user.id, userName: Auth.user.name, action: `запрос субъекта данных: ${x.type}, ${x.status}`, store: 'settings', recId: x.id }); m.close(); App.route(); }; };
  $('#dsN').onclick = () => dlg(null);
  $$('[data-de]').forEach(b => b.onclick = () => dlg(S.dsr.find(r => r.id === b.dataset.de)));
};

/* ================= УВЕДОМЛЕНИЯ: делегаты, пропуски в моих записях, резервная копия ================= */
const _bell3 = Bell.items.bind(Bell);
Bell.items = async function () {
  const out = await _bell3(); const me = Auth.user; if (!me) return out;
  const exp = (me.delegates || []).filter(d => !Deleg.active(d) || addDays(d.confirmedAt.slice(0, 10), 335) < today());
  if (exp.length) out.unshift({ k: 'warn', t: `Подтвердите делегатов: ${exp.length}`, s: 'доступ делегатов нужно подтверждать раз в год', r: 'delegates' });
  const [regs, ev, pts] = await Promise.all([Data.registries(), Data.events(), Data.patients()]);
  let miss = 0; ev.filter(e => (e.ownerId || e.createdBy) === me.id).forEach(e => { const r = regs.find(x => x.id === e.registryId); const et = r && etById(r, e.type); const p = pts.find(x => x.id === e.patientId); if (et && p && (e.status === 'черновик' || completeness(et, computeValues(r, p, et, e.data, e.date)).missing.length)) miss++; });
  if (miss) out.push({ k: 'warn', t: `Неполные записи: ${miss}`, s: 'в ваших записях есть пропуски или черновики', r: 'me' });
  if (can('export') && !TRAIN && !(typeof NET !== 'undefined' && NET.on)) { const lb = Settings.data.lastBackup; if (!lb || addDays(lb.slice(0, 10), 7) < today()) out.push({ k: lb ? 'warn' : 'due', t: lb ? 'Резервная копия старше 7 дней' : 'Резервная копия ещё не делалась', s: lb ? 'последняя: ' + fmtDate(lb.slice(0, 10)) : 'данные хранятся только в этом браузере', r: 'io' }); }
  return out;
};
const _download = download;
download = function (name, ...a) { const r = _download(name, ...a); if (/^addall2_backup_/.test(String(name)) && !TRAIN) { Settings.data.lastBackup = nowISO(); Settings.save(); } return r; };

/* ================= АНАЛИТИКА: XmR, таблица дожития, хронологии, несколько когорт ================= */
Object.assign(ANALYSES, { xmr: 'XmR: индивидуальные значения и скользящий размах', life: 'Таблица дожития (актуарный метод)', swim: 'Хронологии пациентов и интервалы между событиями', multi: 'Несколько когорт на одном графике' });
const ANCFG = {
  xmr: (reg, c, etO, fO) => `<label class="flab">Форма</label><select class="inp" data-k="et">${etO(c.et)}</select><label class="flab">Числовой показатель</label><select class="inp" data-k="num">${fO(c.et, c.num, ['number', 'calc'])}</select><div class="help">Каждая точка: одно событие по дате. Границы X: среднее ± 2,66 × средний скользящий размах. Отмечаются точки вне границ и сдвиг: 8 и более точек подряд по одну сторону от среднего.</div>`,
  life: (reg, c, etO) => `<label class="flab">Точка отсчёта</label><select class="inp" data-k="et">${etO(c.et)}</select><label class="flab">Интервал, месяцев</label><select class="inp" data-k="iv">${[3, 6, 12].map(x => `<option ${String(c.iv || 6) === String(x) ? 'selected' : ''}>${x}</option>`).join('')}</select><div class="help">Конечная точка: смерть (статус пациента «умер» и дата смерти). Цензурирование: дата последнего события пациента.</div>`,
  swim: (reg, c, etO) => `<label class="flab">Точка отсчёта</label><select class="inp" data-k="et">${etO(c.et)}</select><div class="help">Каждая строка: пациент. Отметки: его события по дням от точки отсчёта. Ниже таблица интервалов (медиана дней) до каждого типа события.</div>`,
  multi: (reg, c, etO, fO) => `<label class="flab">Форма</label><select class="inp" data-k="et">${etO(c.et)}</select><label class="flab">Когорты по полю</label><select class="inp" data-k="grp"><option value="_sex" ${c.grp === '_sex' ? 'selected' : ''}>Пол</option>${centers().length ? `<option value="_center" ${c.grp === '_center' ? 'selected' : ''}>Центр</option>` : ''}${fO(c.et, c.grp, ['select', 'yesno', 'user'])}</select><label class="flab">Показатель</label><select class="inp" data-k="mm"><option value="n">число событий по годам</option><option value="rate" ${c.mm === 'rate' ? 'selected' : ''}>доля исхода по годам, %</option><option value="mean" ${c.mm === 'mean' ? 'selected' : ''}>среднее числового поля по годам</option></select><label class="flab">Исход (для доли) или числовое поле (для среднего)</label><div class="row"><select class="inp" data-k="mkey">${fO(c.et, c.mkey)}</select><select class="inp" data-k="mop">${Object.entries(OPS).map(([k, v]) => `<option value="${k}" ${c.mop === k ? 'selected' : ''}>${v}</option>`).join('')}</select><input class="inp" data-k="mval" value="${esc(c.mval || '')}" placeholder="значение"></div>`
};
const _analytics = Routes.analytics;
Routes.analytics = async (main, regId) => {
  await _analytics(main, regId);
  const st = Routes.analytics.st; const regs = await Data.registries(); const reg = regs.find(r => r.id === st.reg); if (!reg) return;
  const etO = (sel, withP) => `${withP ? `<option value="_p">Карточка пациента</option>` : ''}${reg.eventTypes.map(e => `<option value="${e.id}" ${sel === e.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}`;
  const fO = (et, sel, types) => fieldsOf(reg, et).filter(f => !types || types.includes(f.type)).map(f => `<option value="${f.key}" ${sel === f.key ? 'selected' : ''}>${esc(f.label)}</option>`).join('');
  const put = () => { if (!ANCFG[st.type]) return; st.cfg.et = st.cfg.et || reg.keyDates?.start || reg.eventTypes[0].id; $('#aCfg').innerHTML = ANCFG[st.type](reg, st.cfg, etO, fO); };
  $('#aType').addEventListener('change', put); $('#aCfg').addEventListener('change', e => { if (e.target.dataset.k === 'et' && ANCFG[st.type]) { st.cfg.et = e.target.value; put(); } });
  put();
};
const _runAnalysis = runAnalysis;
runAnalysis = function (ds, st, out) {
  if (!ANCFG[st.type]) return _runAnalysis(ds, st, out);
  const { reg, users } = ds, c = st.cfg; const pts = new Set(cohortPatients(ds, st.cohort).map(p => p.id));
  const rows = (et) => rowsFor(ds, et).filter(r => pts.has(r.p.id));
  let h = '';
  try {
    if (st.type === 'xmr') {
      const f = fieldsOf(reg, c.et).find(x => x.key === c.num); if (!f) throw new Error('Выберите числовой показатель');
      const R = rows(c.et).filter(r => r.e.date && !isEmpty(r.v[f.key]) && !isNaN(Number(r.v[f.key]))).sort((a, b) => a.e.date.localeCompare(b.e.date));
      if (R.length < 3) throw new Error('Нужно хотя бы 3 значения');
      const x = R.map(r => Number(r.v[f.key])); const mr = x.slice(1).map((v, i) => Math.abs(v - x[i]));
      const mean = x.reduce((s, v) => s + v, 0) / x.length, mrb = mr.reduce((s, v) => s + v, 0) / mr.length;
      const ucl = mean + 2.66 * mrb, lcl = mean - 2.66 * mrb, mucl = 3.267 * mrb;
      const sd = Math.sqrt(x.reduce((s, v) => s + (v - mean) ** 2, 0) / (x.length - 1)); const srt = [...x].sort((a, b) => a - b); const pq = q => Math.round(Stats.q(srt, q) * 100) / 100;
      let run = 0, side = 0; const shift = new Set();
      x.forEach((v, i) => { const s = v > mean ? 1 : v < mean ? -1 : 0; if (s && s === side) run++; else { side = s; run = s ? 1 : 0; } if (run >= 8) for (let j = i - run + 1; j <= i; j++) shift.add(j); });
      const r1 = n => Math.round(n * 100) / 100;
      const svgX = Chart.line(`X-карта: ${f.label}`, [{ n: f.label, pts: x.map((v, i) => ({ x: i, y: v, mark: v > ucl || v < lcl || shift.has(i) })) }], { xl: 'Событие по порядку дат', yl: f.unit || '', fmtX: i => R[i]?.e.date?.slice(2, 7) || '', hlines: [{ y: r1(mean), label: 'среднее', c: '#333' }, { y: r1(ucl), label: 'ВКГ', c: '#d9534f' }, { y: r1(lcl), label: 'НКГ', c: '#d9534f' }] });
      const svgM = Chart.line('MR-карта: скользящий размах', [{ n: 'MR', pts: mr.map((v, i) => ({ x: i + 1, y: v, mark: v > mucl })) }], { xl: '', yl: f.unit || '', fmtX: i => R[i]?.e.date?.slice(2, 7) || '', ymin: 0, hlines: [{ y: r1(mrb), label: 'средний MR', c: '#333' }, { y: r1(mucl), label: 'ВКГ', c: '#d9534f' }] });
      const outN = x.filter(v => v > ucl || v < lcl).length;
      h = chartBox('XmR ' + f.label, svgX, R.map((r, i) => ({ d: r.e.date, v: x[i], mr: i ? mr[i - 1] : '' })), [{ key: 'd', label: 'Дата' }, { key: 'v', label: f.label }, { key: 'mr', label: 'MR' }]) + chartBox('MR ' + f.label, svgM) +
        `<div class="card"><table class="tbl"><tbody><tr><td>n</td><td><b>${x.length}</b></td></tr><tr><td>Среднее ± σ</td><td><b>${r1(mean)} ± ${r1(sd)}</b></td></tr><tr><td>Медиана [P10; P90]</td><td><b>${pq(.5)} [${pq(.1)}; ${pq(.9)}]</b></td></tr><tr><td>Границы X (ВКГ / НКГ)</td><td>${r1(ucl)} / ${r1(lcl)}</td></tr><tr><td>Точек вне границ</td><td>${outN ? `<b class="bad">${outN}</b>` : '0'}</td></tr><tr><td>Сдвиг (≥ 8 точек по одну сторону)</td><td>${shift.size ? `<b class="bad">да, ${shift.size} точек</b>` : 'нет'}</td></tr></tbody></table></div>`;
    }
    if (st.type === 'life') {
      const iv = Number(c.iv || 6); const R = rows(c.et).filter(r => r.e.date);
      const first = {}; R.forEach(r => { if (!first[r.p.id] || r.e.date < first[r.p.id].e.date) first[r.p.id] = r; });
      const subj = Object.values(first).map(r => { const p = r.p; const last = ds.events.filter(e => e.patientId === p.id && e.date).map(e => e.date).sort().pop() || r.e.date; const dead = p.vital === 'умер' && p.deathDate; const end = dead ? p.deathDate : (p.vital === 'умер' ? last : last); const m_ = Math.max(0, (new Date(end) - new Date(r.e.date)) / (30.44 * 864e5)); return { t: m_, d: !!(p.vital === 'умер') }; });
      if (!subj.length) throw new Error('Нет пациентов с точкой отсчёта');
      const maxT = Math.max(...subj.map(s => s.t)); const tab = []; let S = 1, varSum = 0;
      for (let a = 0; a <= maxT; a += iv) {
        const atRisk = subj.filter(s => s.t >= a).length; if (!atRisk) break;
        const d = subj.filter(s => s.d && s.t >= a && s.t < a + iv).length, cz = subj.filter(s => !s.d && s.t >= a && s.t < a + iv).length;
        const eff = atRisk - cz / 2, q = eff > 0 ? d / eff : 0; S = S * (1 - q); if (eff > 0 && q < 1) varSum += q / (eff * (1 - q));
        tab.push({ a, b: a + iv, atRisk, d, cz, eff: Math.round(eff * 10) / 10, q, S, se: S * Math.sqrt(varSum) });
      }
      const svg = Chart.line('Актуарная выживаемость', [{ n: 'выживаемость, %', pts: [{ x: 0, y: 100 }, ...tab.map(r => ({ x: r.b, y: Math.round(r.S * 1000) / 10 }))] }], { xl: 'Месяцы', yl: '%', ymin: 0, ymax: 100, step: true });
      h = chartBox('Таблица дожития', svg, tab.map(r => ({ i: `${r.a}-${r.b}`, n: r.atRisk, d: r.d, c: r.cz, s: Math.round(r.S * 1000) / 10 })), [{ key: 'i', label: 'Интервал, мес' }, { key: 'n', label: 'Под риском' }, { key: 'd', label: 'Умерло' }, { key: 'c', label: 'Выбыло' }, { key: 's', label: 'Выживаемость, %' }]) +
        `<div class="card"><table class="tbl"><thead><tr><th>Интервал, мес</th><th>Под риском</th><th>Умерло</th><th>Выбыло под наблюдением</th><th>Эффективное n</th><th>Вероятность смерти</th><th>Кумулятивная выживаемость</th><th>SE</th></tr></thead><tbody>${tab.map(r => `<tr><td>${r.a}-${r.b}</td><td>${r.atRisk}</td><td>${r.d}</td><td>${r.cz}</td><td>${r.eff}</td><td>${pc1(r.q)}</td><td><b>${pc1(r.S)}</b></td><td>${pc1(r.se)}</td></tr>`).join('')}</tbody></table><p class="muted">Метод Катлера-Эдерера, SE по Гринвуду.</p></div>`;
    }
    if (st.type === 'swim') {
      const R = rows(c.et).filter(r => r.e.date); const first = {}; R.forEach(r => { if (!first[r.p.id] || r.e.date < first[r.p.id].e.date) first[r.p.id] = r; });
      const list = Object.values(first).slice(0, 60); if (!list.length) throw new Error('Нет пациентов с точкой отсчёта');
      const D = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
      const lanes = list.map(r => ({ p: r.p, t0: r.e.date, ev: ds.events.filter(e => e.patientId === r.p.id && e.date).map(e => ({ e, d: D(r.e.date, e.date), et: etById(reg, e.type) })).filter(x => x.et) }));
      const maxD = Math.max(30, ...lanes.flatMap(l => l.ev.map(x => x.d)), ...lanes.map(l => l.p.deathDate ? D(l.t0, l.p.deathDate) : 0));
      const W = 900, H = lanes.length * 16 + 50, X = d => 150 + Math.max(0, d) / maxD * (W - 170);
      const svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="IBM Plex Sans, Arial" font-size="10"><text x="10" y="14" font-size="13" font-weight="600">Хронологии пациентов (дни от точки отсчёта)</text>${[0, .25, .5, .75, 1].map(k => `<line x1="${X(maxD * k)}" y1="24" x2="${X(maxD * k)}" y2="${H - 14}" stroke="#e3e6f2"/><text x="${X(maxD * k)}" y="${H - 2}" text-anchor="middle" fill="#666">${Math.round(maxD * k)}</text>`).join('')}
        ${lanes.map((l, i) => { const y = 34 + i * 16; const last = Math.max(0, ...l.ev.map(x => x.d), l.p.deathDate ? D(l.t0, l.p.deathDate) : 0); return `<text x="146" y="${y + 3}" text-anchor="end" fill="#333">${esc((l.p.localId || '').slice(0, 14))}</text><line x1="${X(0)}" y1="${y}" x2="${X(last)}" y2="${y}" stroke="#b8c0dd" stroke-width="5" stroke-linecap="round"/>${l.ev.map(x => `<circle cx="${X(x.d)}" cy="${y}" r="4.2" fill="${x.et.color || '#1F2F84'}"><title>${esc(x.et.name)}: ${fmtDate(x.e.date)}</title></circle>`).join('')}${l.p.vital === 'умер' && l.p.deathDate ? `<text x="${X(D(l.t0, l.p.deathDate))}" y="${y + 4}" text-anchor="middle" font-size="12" fill="#d32f2f">✕</text>` : ''}`; }).join('')}</svg>`;
      const leg = reg.eventTypes.map(e => `<span class="lgd"><i style="background:${e.color || '#1F2F84'}"></i>${esc(e.name)}</span>`).join(' ') + ' <span class="lgd" style="color:#d32f2f">✕ смерть</span>';
      const iv = reg.eventTypes.filter(e => e.id !== c.et).map(e => { const ds_ = lanes.map(l => l.ev.filter(x => x.et.id === e.id && x.d >= 0).map(x => x.d).sort((a, b) => a - b)[0]).filter(v => v != null); const s = Stats.summary(ds_); return `<tr><td>${esc(e.name)}</td><td>${ds_.length} из ${lanes.length}</td><td>${s.n ? `<b>${s.median}</b> [${s.q1}; ${s.q3}]` : '-'}</td></tr>`; }).join('');
      h = chartBox('Хронологии', svg) + `<div class="card"><p>${leg}</p><h3>Интервал от точки отсчёта до первого события каждого типа, дней</h3><table class="tbl"><thead><tr><th>Событие</th><th>Есть у</th><th>Медиана [IQR]</th></tr></thead><tbody>${iv}</tbody></table>${list.length < Object.keys(first).length ? `<p class="muted">Показаны первые 60 из ${Object.keys(first).length} пациентов.</p>` : ''}</div>`;
    }
    if (st.type === 'multi') {
      const R = rows(c.et).filter(r => r.e.date); const f = fieldsOf(reg, c.et).find(x => x.key === c.grp);
      const gOf = r => c.grp === '_sex' ? r.p.sex : c.grp === '_center' ? (r.p.center || '-') : f?.type === 'user' ? (users.find(u => u.id === r.v[c.grp])?.name || '-') : (r.v[c.grp] ?? '-');
      const years = [...new Set(R.map(r => r.e.date.slice(0, 4)))].sort(); if (!years.length) throw new Error('Нет данных');
      const G = {}; R.forEach(r => { const g = String(gOf(r) || '-'); (G[g] = G[g] || []).push(r); });
      const names = Object.keys(G).sort((a, b) => G[b].length - G[a].length).slice(0, 6);
      const o = { key: c.mkey, op: c.mop || 'eq', value: c.mval || '' };
      const val = (rs) => c.mm === 'rate' ? (rs.length ? Math.round(rs.filter(r => condOK(o, r.v)).length / rs.length * 1000) / 10 : null) : c.mm === 'mean' ? (() => { const v = rs.map(r => Number(r.v[c.mkey])).filter(x => !isNaN(x)); return v.length ? Math.round(v.reduce((s, x) => s + x, 0) / v.length * 10) / 10 : null; })() : rs.length;
      const PAL_ = ['#1F2F84', '#d9534f', '#3c9d5d', '#f0ad4e', '#7b4bb7', '#16a2b8'];
      const series = names.map((n, i) => ({ n, c: PAL_[i], pts: years.map((y, j) => ({ x: j, y: val(G[n].filter(r => r.e.date.startsWith(y))) })).filter(p => p.y != null) }));
      const svg = Chart.line(`${ANALYSES.multi}`, series, { xl: 'Год', yl: c.mm === 'rate' ? '%' : c.mm === 'mean' ? '' : 'n', fmtX: i => years[i] || '', ymin: 0 });
      h = chartBox('Несколько когорт', svg, names.flatMap(n => years.map(y => ({ g: n, y, v: val(G[n].filter(r => r.e.date.startsWith(y))) }))), [{ key: 'g', label: 'Когорта' }, { key: 'y', label: 'Год' }, { key: 'v', label: 'Значение' }]) +
        `<div class="card"><table class="tbl"><thead><tr><th>Когорта</th>${years.map(y => `<th>${y}</th>`).join('')}<th>Всего</th></tr></thead><tbody>${names.map(n => `<tr><td><b>${esc(n)}</b></td>${years.map(y => `<td>${val(G[n].filter(r => r.e.date.startsWith(y))) ?? '-'}</td>`).join('')}<td><b>${val(G[n]) ?? '-'}</b></td></tr>`).join('')}</tbody></table></div>`;
    }
  } catch (e) { h = `<div class="card err">${esc(e.message)}</div>`; }
  out.innerHTML = `<p class="muted">Когорта: ${pts.size} пациентов</p>` + h;
};

/* ================= ЛИЧНЫЕ ЗАДАЧИ: ссылка на свой отчёт ================= */
const _me = Routes.me;
Routes.me = async (main) => { await _me(main); const h = $('.head', main); if (h && can('analyse')) h.insertAdjacentHTML('beforeend', '<div class="row"><a class="btn" href="#surgeon">Мой отчёт хирурга</a><a class="btn" href="#mydata">Экспорт моих данных</a></div>'); };

/* ================= РЕГИСТРАЦИЯ: делегат и обращение ================= */
const _login3 = Pages.login;
Pages.login = async function (mode = 'login', ...args) {
  await _login3.call(Pages, mode, ...args);
  if (mode !== 'reg') return;
  const ln = $('#r_ln')?.closest('.grid'); if (ln) ln.insertAdjacentHTML('beforebegin', `<div class="fld" style="max-width:200px"><label class="flab">Обращение</label><select class="inp" id="r_tt"><option></option>${['Д-р', 'Проф.', 'Г-н', 'Г-жа'].map(o => `<option>${o}</option>`).join('')}</select></div>`);
  const rl = $('.roles'); if (rl) rl.nextElementSibling.insertAdjacentHTML('afterend', `<label class="chk" style="margin-top:6px"><input type="checkbox" id="r_dg"> <span>Я делегат: буду вносить данные за врача</span></label><div class="fld" id="r_dgw" style="display:none"><label class="flab">За какого врача (ФИО)</label><input class="inp" id="r_dgn"></div>`);
  if ($('#r_dg')) $('#r_dg').onchange = e => $('#r_dgw').style.display = e.target.checked ? '' : 'none';
  /* дописываем поля в комментарий заявки, чтобы администратор их видел */
  const go_ = $('#r_go'); const orig = go_.onclick;
  go_.onclick = async () => { const cm = $('#r_cm'); const add = [$('#r_tt').value ? 'Обращение: ' + $('#r_tt').value : '', $('#r_dg')?.checked ? 'Делегат для врача: ' + ($('#r_dgn').value || 'не указан') : ''].filter(Boolean).join('; '); if (add && !cm.value.includes(add)) cm.value = (cm.value ? cm.value + '; ' : '') + add; return orig(); };
};

/* срок учётной записи в карточке пользователя (администратор) */
const _userDialog = userDialog;
userDialog = async function (u, approving) {
  await _userDialog(u, approving);
  const m = [...document.querySelectorAll('.modal-wrap')].pop(); if (!m || !$('#u_ok', m)) return;
  $('#u_or', m).closest('.fld').insertAdjacentHTML('afterend', `<div class="fld"><label class="flab">Доступ действует до (пусто = бессрочно)</label><input class="inp" type="date" id="u_exp" value="${esc(u?.expiresAt || '')}"></div>`);
  const ok = $('#u_ok', m); const orig = ok.onclick;
  ok.onclick = async () => { const exp = $('#u_exp', m).value; if (u) u.expiresAt = exp; return orig(); };
};
