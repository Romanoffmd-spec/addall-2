/* AddAll 2.0: работа через сервер. Если страница открыта с сервера (http://...),
   все данные идут в общую базу на сервере, вход проверяет сервер.
   Если открыт файл index.html напрямую, всё работает как раньше, в браузере.
   Учебный режим всегда остаётся в браузере (песочница). */
'use strict';

const NET = { on: /^https?:$/.test(location.protocol) && !TRAIN && !window.ADDALL_NO_SERVER, served: /^https?:$/.test(location.protocol) && !window.ADDALL_NO_SERVER };
NET.token = () => { try { return sessionStorage.getItem('addall2_tok') || ''; } catch (e) { return ''; } };
NET.setToken = (t) => { try { t ? sessionStorage.setItem('addall2_tok', t) : sessionStorage.removeItem('addall2_tok'); } catch (e) { } };
NET.call = async function (method, p, body) {
  const t = NET.token();
  const r = await fetch('api/' + p, { method, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  let j = null; try { j = await r.json(); } catch (e) { }
  if (r.status === 401 && Auth.user && !NET._expired) { NET._expired = true; NET.setToken(''); Auth.user = null; toast('Сессия истекла, войдите снова', 'err'); setTimeout(() => { NET._expired = false; location.hash = ''; App.boot(); }, 300); }
  if (!r.ok) throw new Error((j && j.err) || ('Сервер: ' + r.status));
  return j;
};
/* файлы (Blob) передаются как data URL */
NET.enc = async (o) => {
  if (!o || typeof o !== 'object') return o; const x = { ...o };
  for (const k of Object.keys(x)) if (typeof Blob !== 'undefined' && x[k] instanceof Blob) x[k] = { __blob: await new Promise(ok => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(x[k]); }), name: x[k].name };
  return x;
};
NET.dec = (o) => {
  if (!o || typeof o !== 'object') return o;
  for (const k of Object.keys(o)) { const v = o[k]; if (v && typeof v === 'object' && typeof v.__blob === 'string') { const [h, b64] = v.__blob.split(','); const mime = (h.match(/data:([^;]+)/) || [])[1] || 'application/octet-stream'; const bin = atob(b64 || ''); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); o[k] = new Blob([a], { type: mime }); } }
  return o;
};

if (NET.on) {
  const newPasswords = new WeakMap();
  setUserPassword = async (user, pass) => { newPasswords.set(user, pass); };
  NET.changePassword = async (user, old, pass) => {
    const result = await NET.call('POST', 'password', { old, pass });
    if (!result.ok) throw new Error(result.err);
    delete user.mustChange;
    Object.assign(user, result.user);
  };
  Object.assign(DB, {
    async open() { await NET.call('GET', 'ping'); this.db = { server: true }; },
    async all(store) { return (await NET.call('GET', 's/' + store) || []).map(NET.dec); },
    async get(store, id) { if (id == null) return undefined; const o = await NET.call('GET', 's/' + store + '/' + encodeURIComponent(id)); return o ? NET.dec(o) : undefined; },
    async rawPut(store, obj) {
      if (store === 'audit' && !NET.token()) return;
      const payload = await NET.enc(obj);
      if (store === 'users' && newPasswords.has(obj)) {
        payload._password = newPasswords.get(obj);
        newPasswords.delete(obj);
      }
      const saved = await NET.call('PUT', 's/' + store, payload);
      if (saved.rev != null) obj.rev = saved.rev;
      if (saved.seq != null) obj.seq = saved.seq;
    },
    async rawDel(store, id) { await NET.call('DELETE', 's/' + store + '/' + encodeURIComponent(id)); },
    async clear(store) { await NET.call('DELETE', 's/' + store); }
  });
  Auth.login = async function (login, pass) {
    this.lastErr = ''; this.applicationNumber = '';
    const r = await NET.call('POST', 'login', { login, pass });
    if (!r.ok) { this.lastErr = r.err || ''; if (r.lockedUntil) this.lockedUntil = r.lockedUntil; this.applicationNumber = r.applicationNumber || ''; return false; }
    NET.setToken(r.token); const u = r.user;
    const pd = Number(Settings.data?.passDays || 0);
    if (pd && (!u.passChangedAt || addDays(u.passChangedAt.slice(0, 10), pd) < today())) u.mustChange = true;
    this.user = u; sessionStorage.setItem('addall2_uid', u.id);
    return true;
  };
  Auth.restore = async function () { if (!NET.token()) return; try { const r = await NET.call('GET', 'me'); if (r && r.user) this.user = r.user; } catch (e) { NET.setToken(''); } };
  Auth.logout = async function () { try { await NET.call('POST', 'logout', {}); } catch (e) { } NET.setToken(''); this.user = null; sessionStorage.removeItem('addall2_uid'); location.hash = ''; App.boot(); };
  checkOwnPass = async (u, pass) => { try { return !!(await NET.call('POST', 'checkpass', { pass })).ok; } catch (e) { return false; } };
}

/* Учебная база получает только доступные схемы, если рабочая сессия ещё открыта. */
if (NET.served && TRAIN) {
  loadTrainingSource = async () => {
    if (!NET.token()) return [];
    const records = await NET.call('GET', 's/registries');
    return records.filter(record => Array.isArray(record.eventTypes));
  };
}

/* метка режима в шапке и на входе */
const _shellN = App.shell ? App.shell.bind(App) : null;
if (_shellN) App.shell = async function () { const r = await _shellN(); const s = $('.t2-brand .sub em'); if (s) s.textContent = NET.on ? (Settings.data.center || '') + ' · сервер' : (Settings.data.center || 'локальная версия'); return r; };
