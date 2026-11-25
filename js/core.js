/* AddAll 2.0: ядро (утилиты, хранилище, авторизация, роли, аудит, роутер) */
'use strict';

/* ---------- утилиты ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const RICH_TAGS = new Set('a b blockquote br code del div em h1 h2 h3 h4 h5 h6 hr i li mark ol p pre s small span strike strong sub sup table tbody td th thead tfoot tr u ul'.split(' '));
const RICH_REMOVE = new Set(['script', 'style', 'iframe', 'object', 'embed', 'template']);
function safeRichHTML(html) {
  const template = document.createElement('template');
  template.innerHTML = String(html || '');
  const clean = parent => {
    for (const child of [...parent.children]) {
      const tag = child.localName;
      if (child.namespaceURI !== 'http://www.w3.org/1999/xhtml' || RICH_REMOVE.has(tag)) { child.remove(); continue; }
      clean(child);
      if (!RICH_TAGS.has(tag)) { child.replaceWith(...child.childNodes); continue; }
      const classes = [...child.classList].filter(name => ['cite', 'miss', 'muted'].includes(name));
      const ref = tag === 'span' && classes.includes('cite') ? child.getAttribute('data-ref') : null;
      const href = tag === 'a' ? child.getAttribute('href') : null;
      const spans = ['th', 'td'].includes(tag) ? ['colspan', 'rowspan'].map(name => [name, child.getAttribute(name)]) : [];
      for (const attr of [...child.attributes]) child.removeAttribute(attr.name);
      if (classes.length) child.className = classes.join(' ');
      if (ref && /^[A-Za-z0-9_.-]{1,100}$/.test(ref)) {
        child.setAttribute('data-ref', ref);
        child.setAttribute('contenteditable', 'false');
      }
      if (href && /^(https?:|mailto:)/i.test(href.trim())) {
        child.setAttribute('href', href.trim());
        child.setAttribute('rel', 'noopener noreferrer');
      }
      for (const [name, value] of spans) if (/^[1-9][0-9]?$/.test(value || '')) child.setAttribute(name, value);
    }
  };
  clean(template.content);
  return template.innerHTML;
}
function bindRichPaste(editor) {
  editor.addEventListener('paste', event => {
    const formatted = event.clipboardData?.getData('text/html');
    if (!formatted) return;
    event.preventDefault();
    document.execCommand('insertHTML', false, safeRichHTML(formatted));
  });
  editor.addEventListener('drop', event => { event.preventDefault(); });
}
const nowISO = () => new Date().toISOString();
const localDateISO = (d) => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
const today = () => localDateISO(new Date());
function calendarDay(value) {
  if (typeof value !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) return '';
  const day = new Date(value);
  return Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === value ? value : '';
}
function clinicalTime(value) {
  return typeof value === 'string' && /^(?:[01][0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9])?$/.test(value) ? value : '';
}
function clinicalDateTime(value) {
  if (typeof value !== 'string') return '';
  const match = value.trim().match(/^([0-9]{4}-[0-9]{2}-[0-9]{2})[T ](.+)$/);
  return match && calendarDay(match[1]) && clinicalTime(match[2]) ? match[1] + 'T' + match[2] : '';
}
function clinicalDay(value) {
  const text = String(value ?? '').trim();
  const m = text.match(/^([0-9]{1,2})[./-]([0-9]{1,2})[./-]([0-9]{4})$/);
  return calendarDay(m ? m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0') : text);
}
const fmtDate = (d) => {
  if (!d) return '';
  const x = new Date(d);
  if (isNaN(x)) return esc(d);
  return x.toLocaleDateString('ru-RU', /^\d{4}-\d{2}-\d{2}$/.test(d) ? { timeZone: 'UTC' } : undefined);
};
const fmtDT = (d) => { if (!d) return ''; const x = new Date(d); return x.toLocaleDateString('ru-RU') + ' ' + x.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }); };
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
const addDays = (d, n) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + Number(n)); return x.toISOString().slice(0, 10); };
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-zа-я0-9]+/gi, '_').replace(/^_|_$/g, '').slice(0, 40) || uid('f_');
const clone = (o) => JSON.parse(JSON.stringify(o));

function toast(msg, type = 'ok') {
  const t = document.createElement('div');
  t.className = 'toast ' + type; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2600);
}

function download(name, content, mime = 'text/plain') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime + ';charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function toCSV(rows, cols) {
  const q = value => {
    const text = value == null ? '' : Array.isArray(value) ? value.join('; ') : String(value);
    const cell = typeof value !== 'number' && /^(?:\s*[=+@-]|\t|\r)/.test(text) ? "'" + text : text;
    return /[",;\r\n]/.test(cell) ? '"' + cell.replace(/"/g, '""') + '"' : cell;
  };
  return '﻿' + [cols.map(c => q(c.label)).join(';'), ...rows.map(r => cols.map(c => q(r[c.key])).join(';'))].join('\n');
}

function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const first = text.split('\n')[0];
  const delim = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur.replace(/\r$/, '')); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur.replace(/\r$/, '')); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim() !== ''));
}

/* ---------- хранилище (IndexedDB) ---------- */
const DB_VERSION = 9;
const STORES = ['users', 'registries', 'patients', 'events', 'mdt', 'proms', 'audit', 'settings', 'saved', 'queries', 'trials', 'alloc', 'screening', 'journals', 'jrecs', 'files', 'comments', 'refs', 'docs', 'doctpl', 'coverage', 'tasks', 'recon', 'releases', 'periodApprovals', 'secondEntries', 'datarequests'];
/* учебный режим: отдельная база-песочница с вымышленными пациентами */
const TRAIN = (() => { try { return localStorage.getItem('addall2.mode') === 'train'; } catch (e) { return false; } })();
const DB = {
  db: null,
  open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(TRAIN ? 'addall2_train' : 'addall2', DB_VERSION);
      r.onupgradeneeded = () => { const d = r.result; STORES.forEach(s => { if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' }); }); };
      r.onsuccess = () => { this.db = r.result; this.db.onversionchange = () => { try { this.db.close(); } catch (e) {} document.body.innerHTML = '<div style="font:16px Segoe UI,Arial;padding:40px">База AddAll очищается или обновляется в другой вкладке. <a href="index.html">Открыть заново</a></div>'; }; res(); };
      r.onerror = () => rej(r.error);
    });
  },
  tx(store, mode, fn) {
    return new Promise((res, rej) => {
      const t = this.db.transaction(store, mode); const s = t.objectStore(store);
      const out = fn(s); t.oncomplete = () => res(out && out.result !== undefined ? out.result : out); t.onerror = () => rej(t.error);
    });
  },
  all(store) { return new Promise((res, rej) => { const r = this.db.transaction(store).objectStore(store).getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
  get(store, id) { return new Promise((res, rej) => { const r = this.db.transaction(store).objectStore(store).get(id); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
  rawPut(store, obj) {
    return this.tx(store, 'readwrite', s => {
      if (store === 'patients' && !obj.seq) {
        const patients = s.getAll();
        patients.onsuccess = () => {
          obj.seq = patients.result.reduce((max, p) => Math.max(max, Number(p.seq) || 0), 0) + 1;
          s.put(obj);
        };
      } else s.put(obj);
    });
  },
  rawDel(store, id) { return this.tx(store, 'readwrite', s => { s.delete(id); }); },
  clear(store) { return this.tx(store, 'readwrite', s => { s.clear(); }); },
  /* запись с аудитом */
  async put(store, obj, action) {
    const before = obj.id ? await this.get(store, obj.id) : null;
    if (!obj.id) obj.id = uid(store.slice(0, 2) + '_');
    if (store === 'events' && obj.patientId && before?.episodeCenter == null && obj.episodeCenter == null) {
      const patient = await this.get('patients', obj.patientId);
      if (patient) obj.episodeCenter = patient.center || '';
    }
    if (store === 'patients') {
      obj.enrollmentCenter = before?.enrollmentCenter ?? before?.center ?? obj.center ?? '';
      /* в серверной версии ID выдаёт сервер: он видит все учреждения и проверяет уникальность */
      if (typeof NET !== 'undefined' && NET.on) { if (before?.pid) obj.pid = before.pid; }
      else obj.pid = PID.assign(obj, before, await this.all('patients'));
    }
    obj.updatedAt = nowISO(); obj.updatedBy = Auth.user?.id || null;
    if (!before) { obj.createdAt = obj.createdAt || obj.updatedAt; obj.createdBy = obj.createdBy || obj.updatedBy; }
    if (typeof FIRE !== 'undefined' && FIRE.on && store === 'patients' && !obj.seq) {
      obj.seq = (await this.all('patients')).reduce((max, p) => Math.max(max, Number(p.seq) || 0), 0) + 1;
    }
    await this.rawPut(store, obj);
    if (store !== 'audit') await Audit.log(action || (before ? 'изменение' : 'создание'), store, obj.id, before, obj);
    return obj;
  },
  async del(store, id) {
    const before = await this.get(store, id);
    await this.rawDel(store, id);
    await Audit.log('удаление', store, id, before, null);
  }
};

/* ---------- журнал аудита ---------- */
const Audit = {
  async log(action, store, recId, before, after) {
    const diff = {};
    if (before && after) {
      const a = before.data || before, b = after.data || after;
      const skip = ['updatedAt', 'updatedBy', 'pass', 'salt', 'seq', 'ptr', 'rev'];
      Object.keys({ ...a, ...b }).forEach(k => {
        if (skip.includes(k)) return;
        if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) diff[k] = [a[k], b[k]];
      });
      /* у записи с полем data изменения вне data (ФИО, даты, статус) тоже попадают в журнал, с пометкой «карточка:» */
      if (before.data || after.data) Object.keys({ ...before, ...after }).forEach(k => {
        if (k === 'data' || skip.includes(k) || k === 'createdAt' || k === 'createdBy') return;
        if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) diff['карточка: ' + k] = [before[k], after[k]];
      });
      if (!Object.keys(diff).length) return;
    }
    await DB.rawPut('audit', {
      id: uid('au_'), ts: nowISO(), user: Auth.user?.id || 'система', userName: Auth.user?.name || 'система',
      action, store, recId, diff: before && after ? diff : null,
      snapshot: !before ? null : (after ? null : (before.blob ? { ...before, blob: '[файл]' } : before))
    });
  }
};

/* ---------- роли и права ---------- */
const ROLES = {
  admin: { name: 'Администратор', perms: ['view', 'enter', 'edit', 'delete', 'export', 'analyse', 'design', 'users', 'mdt', 'proms', 'audit', 'query', 'lock', 'trials', 'randomise'] },
  lead: { name: 'Руководитель регистра', perms: ['view', 'enter', 'edit', 'delete', 'export', 'analyse', 'design', 'mdt', 'proms', 'audit', 'query', 'lock', 'trials', 'randomise'] },
  surgeon: { name: 'Врач (ввод данных)', perms: ['view', 'enter', 'edit', 'mdt', 'proms', 'analyse', 'randomise'] },
  researcher: { name: 'Исследователь', perms: ['view', 'export', 'analyse'] },
  monitor: { name: 'Монитор', perms: ['view', 'audit', 'analyse', 'query'] },
  resident: { name: 'Резидент', perms: ['view', 'enter'] },
  viewer: { name: 'Только просмотр', perms: ['view'] },
  datamanager: { name: 'Регистратор данных', perms: ['view', 'enter', 'edit', 'proms'] },
  manager: { name: 'Руководство учреждения', perms: ['view', 'analyse', 'approve'] },
  auditor: { name: 'Внешний аудитор (на срок проверки)', perms: ['view', 'audit', 'query'] },
  authority: { name: 'Орган здравоохранения (только отчёты)', perms: ['national'] },
  sponsor: { name: 'Фарма / спонсор (только отчёты и заявки)', perms: ['national', 'datareq'] },
  itadmin: { name: 'ИТ-администратор (без медицинских данных)', perms: ['users'] }
};
/* исследователь работает с обезличенными данными; орган здравоохранения и фарма видят только официальные отчёты */
const PSEUDO_ROLES = ['researcher', 'authority', 'sponsor'];
const isPseudo = () => PSEUDO_ROLES.includes(Auth.user?.role);

/* ID пациента AddAll: «AA-XXXX-XXXX-K», 8 случайных знаков алфавита Крокфорда и контрольный знак Luhn mod 32.
   Выдаётся при создании карточки и не меняется; один ИИН получает один ID во всех регистрах.
   Из ID нельзя восстановить личность: он служит кодом для обезличенной работы и выгрузок. */
const PID = {
  A: '0123456789ABCDEFGHJKMNPQRSTVWXYZ',
  check(body) {
    let factor = 2, sum = 0;
    for (let i = body.length - 1; i >= 0; i--) { let add = factor * PID.A.indexOf(body[i]); factor = factor === 2 ? 1 : 2; add = Math.floor(add / 32) + (add % 32); sum += add; }
    return PID.A[(32 - (sum % 32)) % 32];
  },
  valid(v) { const m = /^AA-([0-9A-HJKMNP-TV-Z]{4})-([0-9A-HJKMNP-TV-Z]{4})-([0-9A-HJKMNP-TV-Z])$/.exec(String(v || '').toUpperCase()); return !!m && PID.check(m[1] + m[2]) === m[3]; },
  make() { const b = [...crypto.getRandomValues(new Uint8Array(8))].map(x => PID.A[x % 32]).join(''); return `AA-${b.slice(0, 4)}-${b.slice(4)}-${PID.check(b)}`; },
  iin(v) { const d = String(v || '').replace(/\D/g, ''); return d.length === 12 ? d : ''; },
  /* ID для карточки: прежний, ID того же ИИН из другого регистра или новый уникальный */
  assign(obj, before, patients) {
    if (before?.pid) return before.pid;
    const key = PID.iin(obj.iin), same = key && patients.find(p => p.id !== obj.id && p.pid && PID.iin(p.iin) === key);
    if (same) return same.pid;
    const used = new Set(patients.filter(p => p.id !== obj.id).map(p => p.pid));
    if (PID.valid(obj.pid) && !used.has(obj.pid)) return obj.pid;
    let pid; do pid = PID.make(); while (used.has(pid));
    return pid;
  },
  show: p => p?.pid || (p?.seq ? 'ID ' + p.seq : '')
};
const PERM_NAMES = { view: 'Просмотр', enter: 'Ввод', edit: 'Правка', delete: 'Удаление', export: 'Экспорт', analyse: 'Анализ', design: 'Конструктор', users: 'Пользователи', mdt: 'МДК', proms: 'Опросники', audit: 'Аудит', query: 'Запросы', lock: 'Блокировка', trials: 'Исследования', randomise: 'Рандомизация' };
const can = (p) => !!Auth.user && (ROLES[Auth.user.role]?.perms || []).includes(p);

/* ---------- авторизация (локальная) ---------- */
async function hashPass(pass, salt) {
  const data = new TextEncoder().encode(salt + '::' + pass);
  if (window.crypto?.subtle) {
    const h = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 5381; for (const b of data) h = ((h << 5) + h + b) >>> 0; return 'x' + h.toString(16);
}
async function checkOwnPass(u, pass) { return (await hashPass(pass, u.salt)) === u.pass; }
async function setUserPassword(user, pass) {
  user.salt = uid('s');
  user.pass = await hashPass(pass, user.salt);
  user.passChangedAt = nowISO();
}
const Auth = {
  user: null,
  async login(login, pass) {
    const users = await DB.all('users');
    this.lastErr = '';
    const all = users.filter(x => x.login.toLowerCase() === String(login).trim().toLowerCase());
    const u = all.find(x => x.active !== false);
    if (!u) { const w = all[0]; this.lastErr = w?.status === 'pending' ? 'pending' : w?.status === 'rejected' ? 'rejected' : w ? 'off' : ''; return false; }
    if (u.lockedUntil && u.lockedUntil > nowISO()) { this.lastErr = 'locked'; this.lockedUntil = u.lockedUntil; return false; }
    if (u.expiresAt && u.expiresAt < today()) { this.lastErr = 'expired'; return false; }
    if (await hashPass(pass, u.salt) !== u.pass) {
      u.failCount = (u.failCount || 0) + 1;
      if (u.failCount >= 3) { u.lockedUntil = new Date(Date.now() + 15 * 60000).toISOString(); u.failCount = 0; this.lastErr = 'locked'; this.lockedUntil = u.lockedUntil; } else this.lastErr = 'bad' + (3 - u.failCount);
      await DB.rawPut('users', u);
      await DB.rawPut('audit', { id: uid('au_'), ts: nowISO(), user: u.id, userName: u.name, action: u.lockedUntil > nowISO() ? 'блокировка после 3 неудачных входов' : 'неудачный вход', store: 'users', recId: u.id }); return false; }
    if (u.failCount || u.lockedUntil) { u.failCount = 0; delete u.lockedUntil; }
    const pd = Number(Settings.data?.passDays || 0);
    if (pd && (!u.passChangedAt || addDays(u.passChangedAt.slice(0, 10), pd) < today())) u.mustChange = true;
    u.lastLogin = nowISO(); await DB.rawPut('users', u);
    this.user = u; sessionStorage.setItem('addall2_uid', u.id);
    await DB.rawPut('audit', { id: uid('au_'), ts: nowISO(), user: u.id, userName: u.name, action: 'вход', store: 'users', recId: u.id });
    return true;
  },
  async restore() { const id = sessionStorage.getItem('addall2_uid'); if (id) { const u = await DB.get('users', id); if (u && u.active !== false) this.user = u; } },
  async logout() { if (this.user) await DB.rawPut('audit', { id: uid('au_'), ts: nowISO(), user: this.user.id, userName: this.user.name, action: 'выход', store: 'users', recId: this.user.id }); this.user = null; sessionStorage.removeItem('addall2_uid'); location.hash = ''; App.boot(); },
  async createUser({ name, login, pass, role, position, code }) {
    const user = { name, login: login.trim(), role, position: position || '', code: code || '', active: true };
    await setUserPassword(user, pass);
    return DB.put('users', user);
  }
};

/* ---------- настройки ---------- */
const Settings = {
  data: {},
  async load() { const s = await DB.get('settings', 'main'); this.data = s || { id: 'main', center: '', department: '', anonCodes: true }; },
  async save() { await DB.put('settings', this.data, 'настройки'); }
};

/* ---------- модальные окна ---------- */
function modal(html, { wide = false, full = false, onClose } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap' + (full ? ' full' : '');
  wrap.innerHTML = `<div class="modal ${wide ? 'wide' : ''} ${full ? 'full' : ''}"><button class="modal-x" title="Закрыть">×</button>${html}</div>`;
  document.body.appendChild(wrap);
  const close = () => { wrap.remove(); onClose && onClose(); };
  wrap.querySelector('.modal-x').onclick = close;
  wrap.addEventListener('mousedown', e => { if (e.target === wrap && !full) close(); });
  wrap.close = close;
  return wrap;
}
function confirmBox(text) {
  return new Promise(res => {
    const m = modal(`<h3>Подтверждение</h3><p>${esc(text)}</p><div class="row end"><button class="btn" data-a="0">Отмена</button><button class="btn danger" data-a="1">Да</button></div>`, { onClose: () => res(false) });
    m.querySelectorAll('[data-a]').forEach(b => b.onclick = () => { m.remove(); res(b.dataset.a === '1'); });
  });
}
function promptBox(title, value = '') {
  return new Promise(res => {
    const m = modal(`<h3>${esc(title)}</h3><input class="inp" id="pb" value="${esc(value)}"><div class="row end"><button class="btn" data-a="0">Отмена</button><button class="btn primary" data-a="1">OK</button></div>`, { onClose: () => res(null) });
    const i = m.querySelector('#pb'); i.focus(); i.select();
    i.onkeydown = e => { if (e.key === 'Enter') { m.remove(); res(i.value); } };
    m.querySelectorAll('[data-a]').forEach(b => b.onclick = () => { m.remove(); res(b.dataset.a === '1' ? i.value : null); });
  });
}

/* ---------- роутер и каркас (дизайн AddAll v12: шапка + меню с группами) ---------- */
const Routes = {};
const ROUTE_GROUP = { home: 'Главная', patients: 'Пациенты', patient: 'Пациенты', mdt: 'Работа', journals: 'Работа', journal: 'Работа', queries: 'Работа', me: 'Работа',
  registries: 'Регистры', registry: 'Регистры', list: 'Регистры', trials: 'Наука', proms: 'Наука', analytics: 'Наука', report: 'Наука', writing: 'Наука', library: 'Наука', dictionary: 'Наука', quality: 'Наука',
  admin: 'Администрирование', io: 'Администрирование', audit: 'Администрирование', doctpl: 'Администрирование' };
/* единый набор линейных иконок меню (вместо символов шрифта) */
const NAV_ICONS = {
  patients: '<path d="M4 6h16M4 12h16M4 18h10"/>', list: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
  registries: '<ellipse cx="12" cy="5.5" rx="7.5" ry="2.5"/><path d="M4.5 5.5v13c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-13M4.5 12c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5"/>',
  add: '<path d="M12 5v14M5 12h14"/>', queries: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>', me: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>',
  mydata: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 20h14"/>', delegates: '<path d="M7 7h12M15.5 3.5L19 7l-3.5 3.5M17 17H5M8.5 13.5L5 17l3.5 3.5"/>',
  training: '<path d="M3 9l9-5 9 5-9 5-9-5z"/><path d="M7 11.2V16c1.5 1.3 3.2 2 5 2s3.5-.7 5-2v-4.8"/>',
  trials: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6A2 2 0 0 0 19 18l-5-9V3"/><path d="M7.5 14h9"/>',
  proms: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3"/>',
  analytics: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>', report: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  dashboard: '<rect x="3" y="3" width="7.5" height="9" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="5" rx="1.5"/><rect x="13.5" y="11" width="7.5" height="10" rx="1.5"/><rect x="3" y="15" width="7.5" height="6" rx="1.5"/>',
  writing: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>', library: '<path d="M5 4h4v16H5zM10 4h4v16h-4zM15 5l3.8-1 3 15.5-3.8 1z"/>',
  dictionary: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/>',
  quality: '<path d="M12 3l7 3v6c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/>',
  surgeon: '<circle cx="12" cy="9" r="5.5"/><path d="M8.5 13.5L7 21l5-2.5 5 2.5-1.5-7.5"/>', regdocs: '<path d="M7 8V3h10v5M7 17H4v-7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7h-3"/><path d="M7 14h10v7H7z"/>',
  admin: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  io: '<path d="M8 3v18M4 7l4-4 4 4M16 21V3M12 17l4 4 4-4"/>', audit: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  doctpl: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h2M9 17h6"/>',
  dsr: '<path d="M12 3l7 3v6c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V6z"/><circle cx="12" cy="10" r="2.2"/><path d="M8.5 16c.7-1.6 2-2.4 3.5-2.4s2.8.8 3.5 2.4"/>',
  mdt: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c.5-3.4 3-5.3 6-5.3s5.5 1.9 6 5.3"/><path d="M16 4.8a3.2 3.2 0 0 1 0 6.4M18.2 14.9c1.6.8 2.5 2.4 2.8 5.1"/>',
  referrals: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12h7M12.5 8.5L16 12l-3.5 3.5"/>',
  journal: '<rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M3.5 9.5h17M9.5 9.5V20"/>', journals: '<path d="M12 5v14M5 12h14"/>',
  home: '<path d="M4 11l8-7 8 7v9H4z"/>', _: '<circle cx="12" cy="12" r="2.5"/>'
};
function navIcon(it) {
  const base = String(it.r || '').split('/')[0];
  const k = it.add ? 'add' : it.r === 'registries/new' ? 'add' : base === 'patients' && String(it.r).includes('/') ? 'registries' : base;
  return `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${NAV_ICONS[k] || NAV_ICONS._}</svg>`;
}
async function navGroups() {
  const [regs, journals, pts, qs] = await Promise.all([Data.registries(), DB.all('journals'), Data.patients(), DB.all('queries')]);
  const openQ = qs.filter(q => q.status !== 'закрыт').length;
  return [
    { id: 'home', t: 'Главная', r: 'home' },
    { id: 'work', t: 'Работа', items: [
      typeof DocumentInbox !== 'undefined' && DocumentInbox.available() && { r: 'inbox', t: 'Документы из хранилища' },
      can('mdt') && { r: 'mdt', t: 'МДК / консилиумы', i: '◎' },
      { sep: 'Журналы' }, ...journals.sort((a, b) => (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name)).map(j => ({ r: 'journal/' + j.id, t: j.name, i: j.icon || '▦' })),
      can('design') && { r: 'journals', t: 'Создать журнал', i: '+', add: true },
      { sep: 'Контроль' }, typeof NET !== 'undefined' && NET.on && { r: 'registrywork', t: 'Работа с качеством регистра' }, { r: 'queries', t: 'Запросы по данным', i: '⚑', badge: openQ }, { r: 'me', t: 'Мои задачи', i: '☑' }] },
    { id: 'patients', t: 'Пациенты', r: 'patients', cnt: pts.filter(p => typeof visibleP !== 'function' || visibleP(p)).length },
    { id: 'regs', t: 'Регистры', items: [...regs.sort((a, b) => a.name.localeCompare(b.name)).flatMap(r => [{ r: 'patients/' + r.id, t: r.name, i: '▤', cnt: pts.filter(p => p.registryId === r.id).length, tag: r.status === 'на одобрении' ? 'на одобрении' : '' },
      ...(r.lists || []).map(l => ({ r: 'list/' + r.id + '/' + l.id, t: l.name, i: '↳', d: 1 }))]),
      { sep: '' }, can('design') ? { r: 'registries', t: 'Регистры и конструктор', i: '⚙' } : { r: 'registries', t: 'Все регистры', i: '▤' }, { r: 'registries/new', t: can('design') ? 'Создать регистр' : 'Предложить регистр', i: '+', add: true }] },
    { id: 'sci', t: 'Наука', items: [{ r: 'trials', t: 'Исследования', i: '⚖' }, can('proms') && { r: 'proms', t: 'Анкеты (PROMs)', i: '✎' }, can('analyse') && { r: 'analytics', t: 'Аналитика', i: '◭' }, can('analyse') && { r: 'report', t: 'Годовой отчёт', i: '▣' },
      { sep: 'Материалы' }, { r: 'writing', t: 'Рукописи', i: '✍' }, { r: 'library', t: 'Литература', i: '❝' }, { r: 'dictionary', t: 'Словарь данных', i: '§' }, { r: 'quality', t: 'Качество данных', i: '✓' }] },
    { id: 'adm', t: 'Администрирование', items: [can('users') && typeof NET !== 'undefined' && NET.on && { r: 'admin-center', t: 'Кабинет администратора', i: '⚙' }, can('users') && { r: 'admin', t: 'Пользователи и настройки', i: '⚙' }, can('export') && { r: 'io', t: 'Импорт и экспорт', i: '⇅' }, can('audit') && { r: 'audit', t: 'Журнал аудита', i: '⌚' }, can('design') && { r: 'doctpl', t: 'Шаблоны документов', i: '▧' }] }
  ].map(g => g.items ? { ...g, items: g.items.filter(Boolean) } : g).filter(g => !g.items || g.items.some(x => x.r));
}
const initials = (n) => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase();

const App = {
  async boot() {
    if (!DB.db) await DB.open();
    await Settings.load();
    const users = await DB.all('users');
    if (!users.length) return Pages.setup();
    await Auth.restore();
    if (!Auth.user) return Pages.login();
    await this.shell();
    window.onhashchange = () => this.route();
    this.route();
  },
  async shell() {
    document.body.className = 'shell';
    document.body.innerHTML = `
      <header class="top2"><div class="t2-row">
        <a class="t2-brand" href="#home"><img src="media/addall-icon.svg" alt=""><span class="wm">Add<i>All</i></span><span class="sub"><b>${esc(Settings.data.department || 'Платформа регистров')}</b><em>${esc(Settings.data.center || 'локальная версия')}</em></span></a>
        <button class="cmdk" id="cmdk"><span>⌕ Поиск пациентов и разделов</span><kbd>Ctrl K</kbd></button>
        <div class="top-r">
          <button class="aipill ${AI.ready() ? 'on' : ''}" id="aiPill" title="Настройки ИИ"><span class="tgl"><i></i></span><span>ИИ ${AI.ready() ? (AI.local() ? 'локально' : 'вкл.') : 'выкл.'}</span></button>
          <button class="aibtn" id="aiBtn"><b>✦</b> Ассистент</button>
          <button class="iconbtn" id="bell" title="Уведомления">🔔<span class="bdg" id="bellN" style="display:none"></span></button>
          <button class="iconbtn" id="theme" title="Тема">${document.documentElement.dataset.theme === 'dark' ? '☀' : '☾'}</button>
          <button class="user" id="userBtn"><span class="av">${esc(initials(Auth.user.name))}</span><span class="un"><b>${esc(Auth.user.name)}</b><em>${esc(ROLES[Auth.user.role]?.name || '')}</em></span><span class="muted">▾</span></button>
        </div></div>
        <nav class="mnav"><div class="mnav-in" id="mnav"></div></nav>
      </header>
      <div class="workspace"><main id="main"></main></div>`;
    $('#cmdk').onclick = () => Cmd.open();
    $('#theme').onclick = () => { const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = t; try { localStorage.setItem('addall2.theme', t); } catch (e) { } $('#theme').textContent = t === 'dark' ? '☀' : '☾'; };
    $('#aiPill').onclick = () => can('users') ? go('admin') : toast(AI.ready() ? 'ИИ подключён' : 'ИИ не настроен: обратитесь к администратору');
    $('#aiBtn').onclick = () => Assistant.toggle();
    $('#bell').onclick = (e) => { e.stopPropagation(); Bell.open(); };
    $('#userBtn').onclick = (e) => { e.stopPropagation(); popMenu($('#userBtn'), `<div class="pop umenu"><div class="mn-sep">${esc(Auth.user.name)}</div><button class="mn-it" id="umProf"><i>☺</i><span>Мой профиль</span></button><a class="mn-it" href="#me"><i>☑</i><span>Мои задачи</span></a>${can('users') ? '<a class="mn-it" href="#admin"><i>⚙</i><span>Настройки</span></a>' : ''}<button class="mn-it" id="umOut"><i>⎋</i><span>Выйти</span></button></div>`, m => { $('#umOut', m).onclick = () => Auth.logout(); $('#umProf', m).onclick = () => { m.remove?.(); profileDialog(); }; }); };
    if (!App.keysBound) { App.keysBound = true; document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); Cmd.open(); } if (e.key === 'Escape') { $$('.pop.floating').forEach(p => p.remove()); } }); document.addEventListener('click', () => $$('.pop.floating').forEach(p => p.remove())); }
    await this.nav();
    Bell.refresh();
    /* автоматический выход при бездействии */
    const mins = Number(Settings.data.idleMinutes ?? 30);
    if (mins > 0 && !App.idleBound) { App.idleBound = true; let t; const reset = () => { clearTimeout(t); t = setTimeout(() => { if (Auth.user) { toast('Сеанс завершён из-за бездействия'); Auth.logout(); } }, mins * 60000); }; ['click', 'keydown', 'mousemove'].forEach(ev => document.addEventListener(ev, reset, { passive: true })); reset(); }
  },
  async nav() {
    const groups = await navGroups(); App.groups = groups;
    /* пока меню собиралось, пользователь мог выйти: экрана с меню уже нет */
    if (!$('#mnav')) return;
    const cur = (location.hash.slice(1) || 'home');
    const curG = ROUTE_GROUP[cur.split('/')[0]];
    $('#mnav').innerHTML = groups.map(g => g.items
      ? `<button class="mn-g ${curG === g.t ? 'on' : ''}" data-g="${g.id}">${esc(g.t)}${g.items.some(x => x.badge) ? `<span class="badge">${g.items.reduce((s, x) => s + (x.badge || 0), 0)}</span>` : ''} <span class="cv">▾</span></button>`
      : `<a class="mn-g ${curG === g.t ? 'on' : ''}" href="#${g.r}">${esc(g.t)}${g.cnt != null ? ` <span class="cnt">${g.cnt}</span>` : ''}</a>`).join('');
    $$('#mnav [data-g]').forEach(b => b.onclick = (e) => {
      e.stopPropagation(); const g = groups.find(x => x.id === b.dataset.g);
      const was = b.classList.contains('open'); $$('.pop.floating').forEach(p => p.remove()); $$('.mn-g.open').forEach(x => x.classList.remove('open')); if (was) return;
      b.classList.add('open');
      popMenu(b, `<div class="pop mn-pop">${g.items.map(it => it.sep != null ? (it.sep ? `<div class="mn-sep">${esc(it.sep)}</div>` : '<hr>') : `<a class="mn-it ${it.add ? 'add' : ''} ${'#' + it.r === location.hash ? 'on' : ''}" href="#${it.r}" style="--d:${it.d || 0}"><i>${navIcon(it)}</i><span>${esc(it.t)}</span>${it.tag ? `<em class="tag warnt">${esc(it.tag)}</em>` : ''}${it.badge ? `<em class="badge">${it.badge}</em>` : it.cnt != null ? `<em class="cnt">${it.cnt}</em>` : ''}</a>`).join('')}</div>`, null, () => b.classList.remove('open'));
    });
  },
  async route() {
    const [r, ...args] = (location.hash.slice(1) || 'home').split('/');
    $$('.pop.floating').forEach(p => p.remove());
    const main = $('#main'); if (!main || !Auth.user) return;
    main.innerHTML = '<div class="loading">Загрузка…</div>';
    const fn = Routes[r] || Routes.home;
    try { await fn(main, ...args.map(decodeURIComponent)); }
    catch (e) { console.error(e); main.innerHTML = `<div class="card err" style="margin-top:20px"><b>Ошибка:</b> ${esc(e.message)}</div>`; }
    const h1 = $('.head h1', main), grp = ROUTE_GROUP[r];
    if (h1 && grp && !$('.kicker', main)) h1.insertAdjacentHTML('beforebegin', `<div class="kicker">${esc(grp)}</div>`);
    if (!$('.foot', main)) main.insertAdjacentHTML('beforeend', `<div class="foot"><img src="media/addall-icon.svg" alt=""><b>AddAll 2.0</b><span>Внеси всё. Честные данные.</span><span class="r">${esc([Settings.data.department, Settings.data.center].filter(Boolean).join(' · ') || 'Локальная версия')}</span><img class="logo-ink" src="media/nroc-logo.png" alt=""></div>`);
    main.scrollTop = 0;
    this.nav(); Bell.refresh();
  }
};
const go = (h) => { if (location.hash === '#' + h) App.route(); else location.hash = h; };

/* всплывающее меню под элементом */
function popMenu(anchor, html, bind, onClose) {
  $$('.pop.floating').forEach(p => p.remove());
  const wrap = document.createElement('div'); wrap.innerHTML = html; const pop = wrap.firstElementChild; pop.classList.add('floating');
  const r = anchor.getBoundingClientRect(); pop.style.position = 'fixed'; pop.style.top = (r.bottom + 4) + 'px';
  document.body.appendChild(pop);
  const w = pop.offsetWidth; pop.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
  pop.addEventListener('click', e => { if (e.target.closest('a')) { pop.remove(); onClose && onClose(); } e.stopPropagation(); });
  const obs = new MutationObserver(() => { if (!document.body.contains(pop)) { onClose && onClose(); obs.disconnect(); } }); obs.observe(document.body, { childList: true });
  bind && bind(pop); return pop;
}

/* ---------- палитра команд (Ctrl+K) ---------- */
const Cmd = {
  async open() {
    const [pts, regs, js] = await Promise.all([Data.patients(), Data.registries(), DB.all('journals')]);
    const pages = (App.groups || []).flatMap(g => g.items ? g.items.filter(x => x.r).map(x => ({ t: x.t, s: g.t, r: x.r })) : [{ t: g.t, s: 'Раздел', r: g.r }]);
    const dim = document.createElement('div'); dim.className = 'cmd-dim';
    const box = document.createElement('div'); box.className = 'cmd';
    box.innerHTML = `<input placeholder="Пациент (ФИО, № ИБ), регистр, раздел…" autofocus><div class="cmd-l"></div>`;
    document.body.append(dim, box);
    const close = () => { dim.remove(); box.remove(); };
    dim.onclick = close;
    const inp = $('input', box), list = $('.cmd-l', box); let items = [], sel = 0;
    const draw = () => {
      const q = inp.value.trim().toLowerCase();
      const P = pts.filter(p => typeof visibleP !== 'function' || visibleP(p)).filter(p => q && (pname(p) + ' ' + (p.localId || '') + ' ' + (p.iin || '')).toLowerCase().includes(q)).slice(0, 8).map(p => ({ g: 'Пациенты', t: pname(p), s: '№ ' + (p.localId || ''), r: 'patient/' + p.id }));
      const R = regs.filter(r => !q || r.name.toLowerCase().includes(q)).slice(0, 6).map(r => ({ g: 'Регистры', t: r.name, s: 'регистр', r: 'patients/' + r.id }));
      const J = js.filter(j => !q || j.name.toLowerCase().includes(q)).slice(0, 6).map(j => ({ g: 'Журналы', t: j.name, s: 'журнал', r: 'journal/' + j.id }));
      const S = pages.filter(x => !q || x.t.toLowerCase().includes(q)).slice(0, 10).map(x => ({ g: 'Разделы', t: x.t, s: x.s, r: x.r }));
      items = [...P, ...R, ...J, ...S]; sel = 0;
      let lastG = ''; list.innerHTML = items.map((it, i) => `${it.g !== lastG ? `<div class="cmd-g">${esc(lastG = it.g)}</div>` : ''}<button class="cmd-i ${i === sel ? 'on' : ''}" data-i="${i}"><b>${esc(it.t)}</b><em>${esc(it.s)}</em></button>`).join('') || '<div class="cmd-g">Ничего не найдено</div>';
      $$('.cmd-i', list).forEach(b => b.onclick = () => { close(); go(items[b.dataset.i].r); });
    };
    inp.oninput = draw; draw(); inp.focus();
    inp.onkeydown = e => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, Math.min(items.length - 1, sel + (e.key === 'ArrowDown' ? 1 : -1))); $$('.cmd-i', list).forEach((b, i) => b.classList.toggle('on', i === sel)); $$('.cmd-i', list)[sel]?.scrollIntoView({ block: 'nearest' }); }
      if (e.key === 'Enter' && items[sel]) { close(); go(items[sel].r); }
    };
  }
};

/* ---------- уведомления ---------- */
const Bell = {
  async items() {
    const [qs, proms, pts, regs, evs, mdt, jr, js] = await Promise.all([DB.all('queries'), DB.all('proms'), Data.patients(), Data.registries(), Data.events(), DB.all('mdt'), DB.all('jrecs'), DB.all('journals')]);
    const vis = new Set(pts.filter(p => typeof visibleP !== 'function' || visibleP(p)).map(p => p.id));
    const P = (id) => { const p = pts.find(x => x.id === id); return p ? pname(p) : '?'; };
    const out = [];
    qs.filter(q => q.status !== 'закрыт' && vis.has(q.patientId) && (q.to === Auth.user.id || (can('query') && q.status === 'отвечен'))).forEach(q => out.push({ k: 'due', t: `Запрос: ${q.fieldLabel}`, s: P(q.patientId) + ' · ' + q.status, r: 'queries' }));
    proms.filter(x => !x.doneAt && x.due <= today() && vis.has(x.patientId)).slice(0, 15).forEach(x => out.push({ k: x.due < addDays(today(), -14) ? 'due' : 'warn', t: `Анкета: ${x.instrumentName}`, s: P(x.patientId) + ' · срок ' + fmtDate(x.due), r: 'patient/' + x.patientId }));
    if (typeof overdueFollowups === 'function') regs.forEach(r => overdueFollowups(r, pts.filter(p => vis.has(p.id)), evs).slice(0, 10).forEach(o => out.push({ k: 'warn', t: 'Просрочено наблюдение', s: pname(o.p) + ' · +' + o.overdue + ' дн', r: 'patient/' + o.p.id })));
    mdt.filter(m => m.date >= today() && m.date <= addDays(today(), 7)).forEach(m => out.push({ k: 'info', t: `МДК ${fmtDate(m.date)}`, s: (m.cases || []).length + ' пациентов в повестке', r: 'mdt/' + m.id }));
    jr.forEach(x => { const j = js.find(y => y.id === x.journalId); const dk = j?.dateKey; if (dk && x.data?.[dk] === today()) out.push({ k: 'info', t: `${j.name}: сегодня`, s: x.data[j.titleKey] || '', r: 'journal/' + j.id }); });
    return out;
  },
  async refresh() { try { const n = (await this.items()).filter(x => x.k !== 'info').length; const b = $('#bellN'); if (b) { b.style.display = n ? '' : 'none'; b.textContent = n > 99 ? '99+' : n; } } catch (e) { } },
  async open() {
    const it = await this.items();
    popMenu($('#bell'), `<div class="pop bellpop"><div class="mn-sep">Уведомления</div>${it.map(x => `<a class="bi" href="#${x.r}"><span class="pod ${x.k === 'due' ? 'due' : x.k === 'warn' ? 'warn' : ''}">${x.k === 'info' ? '◎' : '!'}</span><span class="bi-t"><b>${esc(x.t)}</b><span>${esc(x.s)}</span></span></a>`).join('') || '<div class="bnone">Ничего срочного.</div>'}</div>`);
    const p = $('.bellpop'); if (p) { const r = $('#bell').getBoundingClientRect(); p.style.left = Math.max(8, r.right - 380) + 'px'; }
  }
};

/* доступ к регистрам: администратор видит всё; остальные: регистры своего отделения (в своём центре),
   регистры, открытые всему учреждению, свои, те, куда пригласили, и выданные администратором */
const REGS = new Map();
function regAccess(r, u = Auth.user) {
  if (!u || !r || u.active === false) return null;
  if (u.role === 'admin') return 'admin';
  if ((r.deniedMembers || []).includes(u.id)) return null;
  if (r.createdBy === u.id || r.proposedBy === u.id) return 'owner';
  if ((r.members || []).includes(u.id)) return 'member';
  if ((u.regAccess || []).includes(r.id)) return 'grant';
  if (r.status === 'на одобрении') return null;
  const sc = r.scope || 'dept', sameC = typeof NET !== 'undefined' && NET.on ? (r.center || '') === (u.center || '') : !r.center || !u.center || r.center === u.center;
  if (sc === 'center' && sameC && (!(typeof NET !== 'undefined' && NET.on) || !!u.center)) return 'center';
  if (sc === 'dept' && r.dept && u.dept && r.dept === u.dept && sameC) return 'dept';
  return null;
}
function regAllowed(x) { if (Auth.user?.role === 'admin') return true; const r = typeof x === 'string' ? REGS.get(x) : x; return !!regAccess(r); }
function regManage(r) { const u = Auth.user; if (!u || !r) return false; if (u.role === 'admin') return true; if ((r.deniedMembers || []).includes(u.id)) return false; if (r.createdBy === u.id) return true; return u.role === 'lead' && !!r.dept && r.dept === u.dept && (!(typeof NET !== 'undefined' && NET.on) || (r.center || '') === (u.center || '')); }
async function loadRegs() {
  const all = await DB.all('registries'); let users = null;
  for (const r of all) if (!r.dept) {
    users = users || await DB.all('users'); const c = users.find(x => x.id === (r.proposedBy || r.createdBy));
    r.dept = c?.dept || Settings.data.department || ''; r.center = r.center || c?.center || ''; r.scope = r.scope || 'dept'; if (r.dept && !(typeof NET !== 'undefined' && NET.on)) await DB.rawPut('registries', r);
  }
  REGS.clear(); all.forEach(r => REGS.set(r.id, r)); return all;
}
/* ---------- кэш данных ---------- */
const Data = {
  async allRegistries() { return loadRegs(); },
  async registries() { return (await loadRegs()).filter(r => regAllowed(r)).sort((a, b) => a.name.localeCompare(b.name)); },
  async patients(regId) { await loadRegs(); const p = (await DB.all('patients')).filter(x => regAllowed(x.registryId)); return regId ? p.filter(x => x.registryId === regId) : p; },
  async events(regId) { await loadRegs(); const e = (await DB.all('events')).filter(x => regAllowed(x.registryId)); return regId ? e.filter(x => x.registryId === regId) : e; },
  async users() { return DB.all('users'); }
};
