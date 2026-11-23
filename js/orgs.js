/* AddAll 2.0: справочник учреждений, отделений и должностей.
   Администратор добавляет и включает их по мере подключения; при регистрации и в профилях
   выбирают из списков: сначала учреждение, затем отделения именно этого учреждения. */
'use strict';

const orgName = (o) => (o && o.name) || '';
function orgsMigrate(d) {
  const main = d.center || '';
  const dl = [...new Set([d.department, ...(d.departments || [])].filter(Boolean))];
  const o = main ? [{ id: uid('og'), name: main, on: true, depts: dl.map(n => ({ name: n, on: true })) }] : [];
  (d.centers || []).forEach(c => { if (c && c !== main) o.push({ id: uid('og'), name: c, on: true, depts: [] }); });
  return o;
}
const orgs = () => Settings.data.orgs || orgsMigrate(Settings.data);
const orgsOn = () => orgs().filter(o => o.on !== false);
const deptsOf = (org) => ((orgs().find(o => o.name === org) || {}).depts || []).filter(x => x.on !== false).map(x => x.name);
const posList = () => (Settings.data.positions || POSITIONS.filter(p => p !== 'Другое').map(n => ({ name: n, on: true }))).filter(x => x.on !== false).map(x => x.name);
function orgsSync(d = Settings.data) {
  const on = (d.orgs || []).filter(o => o.on !== false);
  d.centers = on.map(o => o.name);
  d.departments = [...new Set(on.flatMap(o => o.depts.filter(x => x.on !== false).map(x => x.name)))];
  if (!d.center && on[0]) d.center = on[0].name;
}
async function orgsSave() { orgsSync(); await Settings.save(); }

const _sload = Settings.load;
Settings.load = async function () {
  await _sload.call(this);
  if (!this.data.orgs && this.data.center) { this.data.orgs = orgsMigrate(this.data); orgsSync(this.data); await DB.rawPut('settings', this.data); }
};

/* ---------- выбор: учреждение, затем отделение ---------- */
const orgOfDept = (dep, pref) => { const l = orgsOn(); if (pref && l.some(o => o.name === pref)) return pref; const f = l.find(o => o.depts.some(x => x.name === dep)); return f ? f.name : (Auth.user?.center && l.some(o => o.name === Auth.user.center) ? Auth.user.center : orgName(l[0])); };
const deptOpts = (org, cur, any) => { const l = deptsOf(org); const extra = cur && !l.includes(cur) ? `<option selected>${esc(cur)}</option>` : '';
  return (any ? '<option value="">все отделения</option>' : `<option value="">${l.length ? 'выберите отделение' : 'в этом учреждении пока нет отделений'}</option>`) + extra + l.map(d => `<option ${d === cur ? 'selected' : ''}>${esc(d)}</option>`).join(''); };
deptSelect = function (cur, id, any) {
  const org = orgOfDept(cur), l = orgsOn();
  return `<div class="cas"><select class="inp org-sel" id="${id}__org" title="Учреждение">${l.length ? '' : '<option value="">учреждений пока нет</option>'}${l.map(o => `<option ${o.name === org ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select><select class="inp" id="${id}">${deptOpts(org, cur, any)}</select></div>`;
};
const _bindDept = bindDept;
bindDept = function (root, id) {
  const os = $('#' + id + '__org', root), ds = $('#' + id, root); if (!os || !ds) return _bindDept(root, id);
  const fl = ds.closest('.fld'), lab = fl && $('.flab', fl);
  if (fl && lab && os.parentElement.classList.contains('cas')) { const cw = os.parentElement; const f2 = document.createElement("div"); f2.className = "fld"; f2.innerHTML = `<label class="flab">Учреждение${$('.req', lab) ? ' <i class="req">*</i>' : ''}</label>`; f2.append(os); fl.before(f2); cw.classList.remove("cas"); }
  const ce = $('#' + id.replace(/_dep$/, '_ce'), root);
  const syncCe = () => { if (!ce) return; if (ce.tagName === 'SELECT' && ![...ce.options].some(o => o.value === os.value)) ce.add(new Option(os.value, os.value)); ce.value = os.value; };
  if (ce && ce.closest('.fld')) ce.closest('.fld').style.display = 'none';
  if (ce && ce.value && [...os.options].some(o => o.value === ce.value) && os.value !== ce.value) { os.value = ce.value; ds.innerHTML = deptOpts(os.value, ds.value); }
  if (!ce && Auth.user && Auth.user.role !== 'admin') os.disabled = true;
  syncCe();
  os.onchange = () => { ds.innerHTML = deptOpts(os.value, ''); syncCe(); };
};
posSelect = function (cur, id) {
  const l = posList(), extra = cur && !l.includes(cur) ? `<option selected>${esc(cur)}</option>` : '';
  return `<select class="inp" id="${id}"><option value="">${l.length ? 'выберите должность' : 'список должностей пуст'}</option>${extra}${l.map(p => `<option ${p === cur ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select><input type="hidden" id="${id}_o">`;
};

/* ---------- первый запуск: только своё учреждение и отделение ---------- */
const _setupO = Pages.setup;
Pages.setup = function () {
  _setupO.call(Pages);
  const ta = $('#s_depts'); if (ta) { ta.value = ''; ta.closest('.fld').style.display = 'none'; }
  const c = $('#s_center'), d = $('#s_dep'); if (c) c.placeholder = 'Например: ННОЦ'; if (d) { d.placeholder = 'Например: Колопроктология'; d.closest('.fld').insertAdjacentHTML('afterend', '<p class="fhint" style="grid-column:1/-1">Другие учреждения, отделения и должности администратор добавляет позже: Администрирование → Учреждения, отделения, должности. При регистрации сотрудники выбирают из этих списков.</p>'); }
  const btn = $('#s_go'), orig = btn.onclick;
  btn.onclick = async () => {
    const cn = c.value.trim(), dn = d.value.trim();
    if (!cn || !dn) return toast('Укажите учреждение и отделение', 'err');
    const _put = DB.rawPut; DB.rawPut = async (st, o) => { if (st === 'settings') { o.orgs = [{ id: uid('og'), name: cn, on: true, depts: [{ name: dn, on: true }] }]; o.positions = POSITIONS.filter(p => p !== 'Другое').map(n => ({ name: n, on: true })); orgsSync(o); } return _put.call(DB, st, o); };
    try { await orig(); } finally { DB.rawPut = _put; }
    if (Auth.user) { Auth.user.center = cn; Auth.user.dept = dn; await DB.rawPut('users', Auth.user); }
  };
};

/* ---------- администрирование ---------- */
const _admO = Routes.admin;
Routes.admin = async (main) => {
  await _admO(main);
  if (!can('users')) return;
  const users = await DB.all('users');
  if (!Settings.data.orgs) Settings.data.orgs = orgs();
  if (!Settings.data.positions) Settings.data.positions = POSITIONS.filter(p => p !== 'Другое').map(n => ({ name: n, on: true }));
  ['st_cl', 'st_d', 'st_depts'].forEach(id => { const el = $('#' + id); if (el && el.closest('.fld')) el.closest('.fld').style.display = 'none'; });
  const sb = $('#st_s'); if (sb) { const sv = sb.onclick; sb.onclick = async () => { if ($('#st_cl')) $('#st_cl').value = orgsOn().map(o => o.name).join('\n'); if ($('#st_depts')) $('#st_depts').value = (Settings.data.departments || []).join('\n'); if ($('#st_d')) $('#st_d').value = Settings.data.department || ''; await sv(); }; }
  const card = document.createElement('div'); card.className = 'card orgcard'; card.id = 'orgCard';
  const first = $('.card', main); first ? first.before(card) : main.append(card);
  const cntU = (org, dep) => users.filter(u => (org == null || (u.center || Settings.data.center) === org) && (dep == null || u.dept === dep)).length;
  const draw = () => {
    const O = Settings.data.orgs, P = Settings.data.positions;
    card.innerHTML = `<h3>Учреждения, отделения, должности</h3><p class="muted small">Из этих списков выбирают при регистрации и в профилях: сначала учреждение, затем отделение этого учреждения. Выключенные не видны в списках, но данные и пользователи сохраняются.</p>
      <div class="orgs">${O.map((o, i) => `<div class="org ${o.on === false ? 'off' : ''}" data-o="${i}">
        <div class="org-h"><label class="chk" title="Учреждение включено"><input type="checkbox" data-a="oon" ${o.on !== false ? 'checked' : ''}> вкл.</label><b class="org-n" data-a="oren" title="Переименовать">${esc(o.name)}</b><span class="muted small">${o.depts.length} отд. · ${cntU(o.name)} сотр.</span><button class="btn xs danger" data-a="odel" title="Удалить учреждение">×</button></div>
        <div class="chips">${o.depts.map((d, j) => `<span class="chipx ${d.on === false ? 'off' : ''}" data-d="${j}"><input type="checkbox" data-a="don" ${d.on !== false ? 'checked' : ''} title="Включено"><span data-a="dren" title="Переименовать">${esc(d.name)}</span><em>${cntU(o.name, d.name) || ''}</em><button data-a="ddel" title="Удалить">×</button></span>`).join('') || '<span class="muted small">Отделений нет</span>'}</div>
        <div class="row"><input class="inp sm" data-a="dnew" placeholder="Новое отделение"><button class="btn xs" data-a="dadd">+ отделение</button></div></div>`).join('')}</div>
      <div class="row"><input class="inp sm" id="oNew" placeholder="Новое учреждение"><button class="btn sm primary" id="oAdd">+ учреждение</button></div>
      <hr><h4>Должности</h4><div class="chips">${P.map((p, j) => `<span class="chipx ${p.on === false ? 'off' : ''}" data-p="${j}"><input type="checkbox" data-a="pon" ${p.on !== false ? 'checked' : ''}><span data-a="pren" title="Переименовать">${esc(p.name)}</span><em>${users.filter(u => u.position === p.name).length || ''}</em><button data-a="pdel">×</button></span>`).join('')}</div>
      <div class="row"><input class="inp sm" id="pNew" placeholder="Новая должность"><button class="btn xs" id="pAdd">+ должность</button></div>`;
  };
  draw();
  const save = async () => { await orgsSave(); draw(); };
  card.onchange = async e => {
    const a = e.target.dataset.a, oi = e.target.closest('[data-o]')?.dataset.o, O = Settings.data.orgs;
    if (a === 'oon') { O[oi].on = e.target.checked; await save(); }
    if (a === 'don') { O[oi].depts[e.target.closest('[data-d]').dataset.d].on = e.target.checked; await save(); }
    if (a === 'pon') { Settings.data.positions[e.target.closest('[data-p]').dataset.p].on = e.target.checked; await save(); }
  };
  card.onkeydown = e => { if (e.key !== 'Enter') return; if (e.target.dataset.a === 'dnew') e.target.nextElementSibling.click(); if (e.target.id === 'oNew') $('#oAdd').click(); if (e.target.id === 'pNew') $('#pAdd').click(); };
  card.onclick = async e => {
    const a = e.target.dataset.a, oe = e.target.closest('[data-o]'), O = Settings.data.orgs, o = oe ? O[oe.dataset.o] : null;
    const rename = async (obj, kind, apply) => { const n = (await promptBox('Новое название: ' + kind, obj.name) || '').trim(); if (!n || n === obj.name) return; const old = obj.name; obj.name = n; for (const u of users) if (apply(u, old, n)) await DB.rawPut('users', u); await save(); };
    if (e.target.id === 'oAdd') { const n = $('#oNew').value.trim(); if (!n) return; if (O.some(x => x.name.toLowerCase() === n.toLowerCase())) return toast('Такое учреждение уже есть', 'err'); O.push({ id: uid('og'), name: n, on: true, depts: [] }); await save(); toast('Учреждение добавлено: теперь добавьте его отделения'); }
    if (e.target.id === 'pAdd') { const n = $('#pNew').value.trim(); if (!n) return; if (Settings.data.positions.some(x => x.name === n)) return toast('Уже есть', 'err'); Settings.data.positions.push({ name: n, on: true }); await save(); }
    if (a === 'dadd' && o) { const inp = $('[data-a=dnew]', oe), n = inp.value.trim(); if (!n) return; if (o.depts.some(x => x.name.toLowerCase() === n.toLowerCase())) return toast('Такое отделение уже есть', 'err'); o.depts.push({ name: n, on: true }); await save(); }
    if (a === 'oren' && o) await rename(o, 'учреждение', (u, old, n) => { if (u.center === old) { u.center = n; return true; } });
    if (a === 'dren' && o) { const d = o.depts[e.target.closest('[data-d]').dataset.d]; await rename(d, 'отделение', (u, old, n) => { if (u.dept === old && (u.center || Settings.data.center) === o.name) { u.dept = n; return true; } }); }
    if (a === 'pren') { const p = Settings.data.positions[e.target.closest('[data-p]').dataset.p]; await rename(p, 'должность', (u, old, n) => { if (u.position === old) { u.position = n; return true; } }); }
    if (a === 'odel' && o) { const k = cntU(o.name); if (!(await confirmBox(`Удалить учреждение «${o.name}»${k ? ` (у ${k} сотрудников оно указано; у них останется старое название)` : ''}? Лучше выключить, если оно может понадобиться.`))) return; O.splice(oe.dataset.o, 1); await save(); }
    if (a === 'ddel' && o) { const j = e.target.closest('[data-d]').dataset.d, d = o.depts[j], k = cntU(o.name, d.name); if (!(await confirmBox(`Удалить отделение «${d.name}»${k ? ` (сотрудников: ${k})` : ''}?`))) return; o.depts.splice(j, 1); await save(); }
    if (a === 'pdel') { const j = e.target.closest('[data-p]').dataset.p; if (!(await confirmBox(`Удалить должность «${Settings.data.positions[j].name}»?`))) return; Settings.data.positions.splice(j, 1); await save(); }
  };
};

if (typeof EN === 'object') Object.assign(EN, { 'Учреждения, отделения, должности': 'Institutions, departments, positions', 'Учреждение и отделение': 'Institution and department', '+ учреждение': '+ institution', '+ отделение': '+ department', '+ должность': '+ position', 'Должности': 'Positions' });
