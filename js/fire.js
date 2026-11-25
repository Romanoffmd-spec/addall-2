/* AddAll 2.11: онлайн-версия на Firebase (GitHub Pages + Firestore + Firebase Authentication).
   Включается, только если в js/firebase-config.js задан window.ADDALL_FIREBASE и страница открыта не с localhost.
   Тогда все хранилища лежат в Firestore (коллекция s_<хранилище>, документ { v: JSON }), вход идёт через Firebase Authentication,
   а доступ к данным закрыт правилами Firestore (firestore.rules): читать и писать может только активный участник (members/<uid>).
   Учебный режим остаётся в браузере. Подключается после missing.js, до net.js. */
'use strict';

const FIRE = {
  cfg: (typeof window !== 'undefined' && window.ADDALL_FIREBASE) || null,
  on: false, app: null, sec: null, fs: null, auth: null, user: null, boot: false,
  cache: {}, unsub: {}, ready: {},
  SDK: '10.12.2',
  DOMAIN: 'addall2.kz', /* логин без @ превращается в адрес login@addall2.kz для Firebase Authentication */
  email(login) { const l = String(login || '').trim().toLowerCase(); return l.includes('@') ? l : l + '@' + this.DOMAIN; },
  col(store) { return this.fs.collection('s_' + store); },
  load(src) { return new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('Не удалось загрузить ' + src)); document.head.appendChild(s); }); },
  async sdk() {
    if (window.firebase && firebase.firestore) return;
    const b = `https://www.gstatic.com/firebasejs/${this.SDK}/`;
    await this.load(b + 'firebase-app-compat.js');
    await Promise.all([this.load(b + 'firebase-auth-compat.js'), this.load(b + 'firebase-firestore-compat.js')]);
  },
  /* у пользователя роль лежит ещё и отдельным полем: правила Firestore не дают сотруднику изменить её в своей записи */
  enc(o, store) { const d = { v: JSON.stringify(o), at: new Date().toISOString(), by: Auth.user?.id || null }; if (store === 'users') d.role = !FIRE.mem || FIRE.mem.admin ? (o.role || '') : (FIRE.mem.role || ''); return d; },
  dec(d) { try { const o = d && d.v ? NET.dec(JSON.parse(d.v)) : undefined; if (o && d.role && typeof d.role === 'string') o.role = d.role; return o; } catch (e) { return undefined; } },
  signedIn() { return !!(this.auth && this.auth.currentUser); },
  stop() { Object.values(this.unsub).forEach(f => { try { f(); } catch (e) { } }); this.unsub = {}; this.cache = {}; this.ready = {}; },
  /* подписка на хранилище: данные приходят в память и обновляются в реальном времени */
  watch(store) {
    if (this.ready[store]) return this.ready[store];
    this.ready[store] = new Promise((ok, no) => {
      let first = true;
      this.unsub[store] = this.col(store).onSnapshot(snap => {
        const m = this.cache[store] || (this.cache[store] = new Map());
        snap.docChanges().forEach(ch => { if (ch.type === 'removed') m.delete(ch.doc.id); else m.set(ch.doc.id, this.dec(ch.doc.data())); });
        if (first) { first = false; ok(); }
      }, err => { delete this.ready[store]; if (first) { first = false; no(err); } });
    });
    return this.ready[store];
  },
  pending: [], /* записи до создания первого администратора (мастер первого запуска) */
  mem: null, /* запись участника (members/<uid>): роль и доступ задаёт только администратор */
  /* хэш и соль пароля в Firestore не хранятся: пароль проверяет Firebase Authentication */
  strip(store, o) { if (store !== 'users' || !o) return o; const c = { ...o }; delete c.pass; delete c.salt; return c; }
};
FIRE.on = !!FIRE.cfg && /^https:$/.test(location.protocol) && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && !TRAIN;

if (FIRE.on) {
  /* сервер AddAll здесь не используется */
  window.ADDALL_NO_SERVER = true;

  Object.assign(DB, {
    async open() {
      await FIRE.sdk();
      FIRE.app = firebase.apps.length ? firebase.app() : firebase.initializeApp(FIRE.cfg);
      FIRE.fs = firebase.firestore(); FIRE.auth = firebase.auth();
      try { await FIRE.fs.enablePersistence({ synchronizeTabs: true }); } catch (e) { }
      await new Promise(ok => { const u = FIRE.auth.onAuthStateChanged(x => { u(); ok(); }); });
      try { FIRE.boot = (await FIRE.fs.doc('meta/boot').get()).exists; } catch (e) { FIRE.boot = false; }
      this.db = { firebase: true };
    },
    async all(store) {
      if (!FIRE.signedIn()) return store === 'users' && FIRE.boot ? [{ id: '_boot', login: '', active: false }] : FIRE.pending.filter(x => x.store === store).map(x => x.obj);
      try { await FIRE.watch(store); } catch (e) { return []; }
      return [...(FIRE.cache[store] || new Map()).values()].filter(Boolean);
    },
    async get(store, id) {
      if (id == null) return undefined;
      if (!FIRE.signedIn()) { const p = FIRE.pending.find(x => x.store === store && x.obj.id === id); return p ? p.obj : undefined; }
      if (FIRE.ready[store]) { await FIRE.ready[store]; return (FIRE.cache[store] || new Map()).get(String(id)); }
      try { const d = await FIRE.col(store).doc(String(id)).get(); return d.exists ? FIRE.dec(d.data()) : undefined; } catch (e) { return undefined; }
    },
    async rawPut(store, obj) {
      if (!FIRE.signedIn()) { FIRE.pending = FIRE.pending.filter(x => !(x.store === store && x.obj.id === obj.id)); FIRE.pending.push({ store, obj }); return; }
      const clean = FIRE.strip(store, obj);
      /* сотрудник (не администратор) пишет свою запись только со своей ролью из записи участника */
      if (store === 'users' && FIRE.mem && !FIRE.mem.admin && FIRE.mem.role) clean.role = FIRE.mem.role;
      const o = await NET.enc(clean);
      await FIRE.col(store).doc(String(obj.id)).set(FIRE.enc(o, store));
      const m = FIRE.cache[store]; if (m) m.set(String(obj.id), clean);
    },
    async rawDel(store, id) { await FIRE.col(store).doc(String(id)).delete(); const m = FIRE.cache[store]; if (m) m.delete(String(id)); },
    async clear(store) {
      const snap = await FIRE.col(store).get(); let b = FIRE.fs.batch(), n = 0;
      for (const d of snap.docs) { b.delete(d.ref); if (++n === 400) { await b.commit(); b = FIRE.fs.batch(); n = 0; } }
      if (n) await b.commit(); if (FIRE.cache[store]) FIRE.cache[store].clear();
    }
  });

  /* пароль в открытом виде нужен только для создания или смены учётной записи Firebase; храним его в памяти до записи пользователя */
  const _hash = hashPass; let lastPass = null;
  hashPass = async function (pass, salt) { lastPass = { pass, salt }; return _hash(pass, salt); };

  /* участник (members/<uid>) определяет, пускают ли правила Firestore к данным */
  const memberOf = (u) => ({ userId: u.id, active: u.active !== false && !['pending', 'rejected'].includes(u.status), admin: u.role === 'admin', role: u.role || '', login: u.login, at: new Date().toISOString() });

  const _put = DB.put.bind(DB);
  DB.put = async function (store, obj, action) {
    if (store === 'users' && obj && obj.id !== '_boot') {
      const pp = lastPass && lastPass.salt === obj.salt ? lastPass.pass : null;
      if (!FIRE.signedIn() && !FIRE.boot && pp) {
        /* мастер первого запуска: первый администратор */
        if (!obj.id) obj.id = uid('us_');
        const cr = await FIRE.auth.createUserWithEmailAndPassword(FIRE.email(obj.login), pp);
        obj.fireUid = cr.user.uid;
        const b = FIRE.fs.batch();
        b.set(FIRE.fs.doc('members/' + cr.user.uid), { ...memberOf({ ...obj, role: 'admin' }), admin: true, active: true });
        b.set(FIRE.fs.doc('meta/boot'), { at: new Date().toISOString(), by: cr.user.uid });
        await b.commit(); FIRE.boot = true;
        for (const x of FIRE.pending.splice(0)) await DB.rawPut(x.store, x.obj);
      } else if (FIRE.signedIn() && pp && !obj.fireUid) {
        /* новый пользователь, созданный администратором: отдельный экземпляр приложения, чтобы не выйти из своей учётной записи */
        FIRE.sec = FIRE.sec || firebase.initializeApp(FIRE.cfg, 'addall-sec');
        const cr = await FIRE.sec.auth().createUserWithEmailAndPassword(FIRE.email(obj.login), pp);
        obj.fireUid = cr.user.uid; await FIRE.sec.auth().signOut();
      } else if (FIRE.signedIn() && pp && obj.fireUid && obj.fireUid === FIRE.auth.currentUser.uid) {
        await FIRE.auth.currentUser.updatePassword(pp);
      } else if (FIRE.signedIn() && pp && obj.fireUid) {
        toast(obj.login.includes('@') ? 'Новый пароль отправлен письмом на ' + obj.login : 'В онлайн-версии сменить чужой пароль нельзя: пользователь меняет его сам после входа', obj.login.includes('@') ? '' : 'err');
        if (obj.login.includes('@')) try { await FIRE.auth.sendPasswordResetEmail(obj.login); } catch (e) { }
      }
      lastPass = null;
      const r = await _put(store, obj, action);
      if (obj.fireUid && FIRE.signedIn()) { try { await FIRE.fs.doc('members/' + obj.fireUid).set(memberOf(obj), { merge: true }); } catch (e) { } }
      return r;
    }
    return _put(store, obj, action);
  };

  const _login = Auth.login.bind(Auth);
  Auth.login = async function (login, pass) {
    this.lastErr = '';
    try { await FIRE.auth.signInWithEmailAndPassword(FIRE.email(login), pass); }
    catch (e) { this.lastErr = /too-many/.test(e.code || '') ? 'locked' : 'bad'; if (this.lastErr === 'locked') this.lockedUntil = new Date(Date.now() + 15 * 60000).toISOString(); return false; }
    FIRE.stop();
    let mem = null; try { mem = (await FIRE.fs.doc('members/' + FIRE.auth.currentUser.uid).get()).data(); } catch (e) { }
    if (!mem || !mem.active) { await FIRE.auth.signOut(); this.lastErr = 'pending'; return false; }
    FIRE.mem = mem;
    /* пароль уже проверил Firebase: общий вход получает одноразовый хэш только в памяти этой вкладки */
    const all = await DB.all('users'), lg = String(login).trim().toLowerCase();
    const u = all.find(x => mem.userId && x.id === mem.userId) || all.find(x => x.login && x.login.toLowerCase() === lg && x.active !== false);
    if (!u || (u.login || '').toLowerCase() !== lg) { await FIRE.auth.signOut(); return false; }
    u.salt = 'fb' + uid('s'); u.pass = await _hash(pass, u.salt); u.failCount = 0; delete u.lockedUntil;
    if (!(await _login(login, pass)) || !this.user || (mem.userId && this.user.id !== mem.userId)) { this.user = null; sessionStorage.removeItem('addall2_uid'); await FIRE.auth.signOut(); return false; }
    if (mem.role && ROLES[mem.role]) this.user.role = mem.role;
    if (mem.admin) FIRE.sync().catch(() => { });
    return true;
  };
  const _restore = Auth.restore.bind(Auth);
  Auth.restore = async function () {
    if (!FIRE.signedIn() || !sessionStorage.getItem('addall2_uid')) return;
    let mem = null; try { mem = (await FIRE.fs.doc('members/' + FIRE.auth.currentUser.uid).get()).data(); } catch (e) { }
    if (!mem || !mem.active) { sessionStorage.removeItem('addall2_uid'); return; }
    FIRE.mem = mem;
    /* номер пользователя в вкладке нельзя подменить: он берётся из записи участника */
    if (mem.userId) sessionStorage.setItem('addall2_uid', mem.userId);
    await _restore();
    if (this.user && mem.role && ROLES[mem.role]) this.user.role = mem.role;
    if (this.user && mem.admin) FIRE.sync().catch(() => { });
  };
  /* проверка своего пароля (смена пароля и подтверждения) через Firebase, без хэша в базе */
  checkOwnPass = async (u, pass) => { try { const cu = FIRE.auth.currentUser; await cu.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(cu.email, pass)); return true; } catch (e) { return false; } };
  /* при входе администратора: убрать старые хэши паролей из базы и записать роли в записи участников */
  FIRE.sync = async function () {
    if (FIRE._synced) return; FIRE._synced = true;
    for (const x of await DB.all('users')) {
      if (!x || x.id === '_boot') continue;
      /* роль задаёт запись участника; у старых записей без роли «администратор» без флага администратора не принимается */
      if (x.fireUid) {
        let m = null; try { m = (await FIRE.fs.doc('members/' + x.fireUid).get()).data(); } catch (e) { }
        if (m) {
          const r = typeof m.role === 'string' && ROLES[m.role] ? m.role : x.role === 'admin' && !m.admin ? 'viewer' : (ROLES[x.role] ? x.role : 'viewer');
          x.role = r;
          if (m.role !== r || m.userId !== x.id) { try { await FIRE.fs.doc('members/' + x.fireUid).set({ role: r, userId: x.id }, { merge: true }); } catch (e) { } }
        }
      }
      if (x.id !== Auth.user?.id) { try { await DB.rawPut('users', x); } catch (e) { } }
    }
  };
  Auth.logout = async function () {
    if (this.user) { try { await DB.rawPut('audit', { id: uid('au_'), ts: nowISO(), user: this.user.id, userName: this.user.name, action: 'выход', store: 'users', recId: this.user.id }); } catch (e) { } }
    FIRE.stop(); try { await FIRE.auth.signOut(); } catch (e) { }
    this.user = null; sessionStorage.removeItem('addall2_uid'); location.hash = ''; App.boot();
  };

  /* мастер первого запуска: текст про хранение и лишние для онлайн-версии пункты */
  const _psetup = Pages.setup;
  Pages.setup = function () {
    const r = _psetup.apply(this, arguments);
    const fix = () => {
      document.querySelectorAll('.auth p.muted').forEach(p => { if (p.textContent.includes('только в этом браузере')) p.textContent = 'Первый запуск онлайн-версии. Создайте администратора платформы. Данные хранятся в Firebase (проект addall-2), доступ только у пользователей, которых заведёт администратор. Только тестовые данные, без реальных пациентов.'; });
      const sr = document.getElementById('s_restore'); if (sr) sr.style.display = 'none';
      document.querySelectorAll('.auth label').forEach(l => { if (/регистрироваться самим/.test(l.textContent)) l.style.display = 'none'; });
    };
    fix(); setTimeout(fix, 0);
    return r;
  };

  /* на странице входа: без самостоятельной регистрации (учётные записи создаёт администратор), сброс пароля письмом */
  const _plogin = Pages.login;
  Pages.login = async function (mode = 'login') {
    Settings.data.selfReg = false; if (mode === 'reg') mode = 'login';
    const r = await _plogin.call(this, mode);
    if (mode === 'forgot' && $('#f_go')) $('#f_go').onclick = async () => {
      const lg = $('#f_login').value.trim(); if (!lg) return toast('Введите логин или e-mail', 'err');
      if (!lg.includes('@')) return toast('Письмо можно отправить только на e-mail. Если логин без @, пароль задаёт администратор.', 'err');
      try { await FIRE.auth.sendPasswordResetEmail(lg); } catch (e) { }
      toast('Если такой e-mail зарегистрирован, на него придёт ссылка для смены пароля'); Pages.login('login');
    };
    return r;
  };
}
