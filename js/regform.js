/* AddAll 2.0: регистрация и счётчики на странице входа.
   1) Учреждение и отделение: в списках то, что добавил администратор; если своего нет, «Нет в списке» и поле для названия.
   2) Незаполненные обязательные поля подсвечиваются красным с подсказкой под полем.
   3) Почта: принимается любая (рабочая или личная).
   4) Счётчики «сотрудников / пациентов»: карточки с иконками и плавным счётом.
   Подключается последним, после fire.js и всех обёрток Pages.login. */
'use strict';

const RegForm = {
  OTHER: '__other',
  ICONS: {
    users: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    patients: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v16H4z"/><path d="M12 8v8M8 12h8"/></svg>'
  },
  /* счётчики: иконка, число с плавным счётом, подпись */
  counters(box) {
    const wrap = box.querySelector('.lcount'); if (!wrap || wrap.dataset.rf) return;
    wrap.dataset.rf = '1'; wrap.classList.add('lcount2');
    [...wrap.children].forEach((tile, i) => {
      const b = tile.querySelector('b'); if (!b) return;
      tile.insertAdjacentHTML('afterbegin', `<span class="lc-ic">${i ? this.ICONS.patients : this.ICONS.users}</span>`);
      const n = Number(b.textContent) || 0;
      if (n > 0 && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const t0 = performance.now(), d = 900;
        const step = t => { const k = Math.min(1, (t - t0) / d); b.textContent = Math.round(n * (1 - Math.pow(1 - k, 3))).toLocaleString('ru-RU'); if (k < 1) requestAnimationFrame(step); };
        b.textContent = '0'; requestAnimationFrame(step);
      } else b.textContent = n.toLocaleString('ru-RU');
    });
  },
  /* учреждение и отделение «нет в списке» */
  other(box) {
    const os = box.querySelector('#r_dep__org'), ds = box.querySelector('#r_dep');
    if (!os || !ds || os.dataset.rf) return;
    os.dataset.rf = '1';
    const ofld = os.closest('.fld'), dfld = ds.closest('.fld');
    if (os.options.length === 1 && !os.options[0].value) os.options[0].remove();
    os.add(new Option('Моего учреждения нет в списке', this.OTHER));
    ofld.insertAdjacentHTML('beforeend', `<input class="inp rf-x" id="r_org_x" placeholder="Название учреждения" style="display:none">
      <span class="fhint">В списке учреждения, подключённые к AddAll. Если вашего нет, выберите «нет в списке» и укажите название: заявку рассмотрит администратор.</span>`);
    dfld.insertAdjacentHTML('beforeend', '<input class="inp rf-x" id="r_dep_x" placeholder="Название отделения" style="display:none">');
    const ox = box.querySelector('#r_org_x'), dx = box.querySelector('#r_dep_x');
    const addOpt = () => { if (![...ds.options].some(o => o.value === this.OTHER)) ds.add(new Option('Моего отделения нет в списке', this.OTHER)); };
    const sync = () => {
      const orgOther = os.value === this.OTHER;
      ox.style.display = orgOther ? '' : 'none';
      ds.style.display = orgOther ? 'none' : '';
      dx.style.display = orgOther || ds.value === this.OTHER ? '' : 'none';
    };
    const prev = os.onchange;
    os.onchange = e => { if (os.value !== this.OTHER && prev) prev.call(os, e); addOpt(); sync(); };
    ds.addEventListener('change', sync);
    if (!os.value) os.value = this.OTHER;
    addOpt(); sync();
  },
  /* подсветка пропущенных полей */
  mark(el, msg) {
    const host = el.closest('.fld') || el.closest('label.chk') || el.parentElement;
    host.classList.add('f-bad');
    if (!host.querySelector('.ferr')) host.insertAdjacentHTML('beforeend', `<span class="ferr" role="alert">${esc(msg)}</span>`);
  },
  clear(box) { box.querySelectorAll('.f-bad').forEach(h => { h.classList.remove('f-bad'); h.querySelector('.ferr')?.remove(); }); },
  check(box) {
    this.clear(box);
    const $b = id => box.querySelector('#' + id), val = id => ($b(id)?.value || '').trim();
    const bad = [];
    const need = (id, msg, ok) => { const el = $b(id); if (el && el.offsetParent !== null && !ok) { this.mark(el, msg); bad.push(el); } };
    need('r_ln', 'Укажите фамилию', val('r_ln'));
    need('r_fn', 'Укажите имя', val('r_fn'));
    const os = $b('r_dep__org'), orgOther = os && os.value === this.OTHER;
    need('r_dep__org', 'Выберите учреждение', !os || os.value);
    need('r_org_x', 'Укажите название учреждения', val('r_org_x'));
    need('r_dep', 'Выберите отделение', val('r_dep'));
    need('r_dep_x', 'Укажите название отделения', val('r_dep_x'));
    need('r_pos', 'Выберите должность', val('r_pos'));
    need('r_lg', 'Придумайте логин или укажите почту', val('r_lg'));
    need('r_em', 'Укажите электронную почту', /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(val('r_em')));
    const ph = val('r_ph'); need('r_ph', 'Телефон в формате +77011234567, без пробелов', !ph || /^\+\d{10,15}$/.test(ph.replace(/[\s()-]/g, '')));
    const pw = $b('r_pw')?.value || '';
    need('r_pw', 'Минимум 8 символов, буквы и цифры', pw.length >= 8 && (typeof passScore !== 'function' || passScore(pw) >= 2));
    need('r_pw2', 'Пароли не совпадают', pw && pw === ($b('r_pw2')?.value || ''));
    const ok = $b('r_ok'); if (ok && !ok.checked) { this.mark(ok, 'Подтвердите обязательство'); bad.push(ok); }
    if (bad.length) {
      toast(bad.length === 1 ? 'Заполните поле, выделенное красным' : 'Заполните поля, выделенные красным: ' + bad.length, 'err');
      bad[0].scrollIntoView({ block: 'center', behavior: 'smooth' }); setTimeout(() => bad[0].focus({ preventScroll: true }), 300);
      return false;
    }
    return { orgOther, deptOther: orgOther || val('r_dep') === this.OTHER, org: val('r_org_x'), dept: val('r_dep_x') };
  },
  form(box) {
    if (typeof Settings === 'object' && Settings.data) Settings.data.blockFreeMail = false;
    const em = box.querySelector('#r_em');
    if (em) {
      const f = em.closest('.fld'), lab = f.querySelector('.flab'), hint = f.querySelector('.fhint');
      if (lab) lab.innerHTML = 'Электронная почта <i class="req">*</i>';
      em.placeholder = 'name@example.com';
      if (hint) hint.textContent = 'Подойдёт любая почта, рабочая или личная.';
    }
    this.other(box);
    const ph = box.querySelector('#r_ph'); if (ph) ph.addEventListener('blur', () => { ph.value = ph.value.replace(/[\s()-]/g, ''); });
    box.addEventListener('input', e => { const h = e.target.closest('.f-bad'); if (h) { h.classList.remove('f-bad'); h.querySelector('.ferr')?.remove(); } });
    box.addEventListener('change', e => { const h = e.target.closest('.f-bad'); if (h) { h.classList.remove('f-bad'); h.querySelector('.ferr')?.remove(); } });
    const go = box.querySelector('#r_go'); if (!go || go.dataset.rf) return;
    go.dataset.rf = '1';
    const prev = go.onclick;
    go.onclick = async e => {
      const r = this.check(box); if (!r) return;
      const os = box.querySelector('#r_dep__org'), ds = box.querySelector('#r_dep'), ce = box.querySelector('#r_ce'), cm = box.querySelector('#r_cm');
      const keep = { org: os?.value, dept: ds?.value, note: cm?.value };
      /* значения «не из списка» подставляем как обычный выбор, чтобы заявка дошла до администратора с названием */
      const put = (sel, text) => { if (!sel) return; let o = [...sel.options].find(x => x.value === text); if (!o) { o = new Option(text, text); sel.add(o); } sel.value = text; };
      if (r.orgOther) { put(os, r.org); if (ce) { if (ce.tagName === 'SELECT') put(ce, r.org); else ce.value = r.org; } }
      if (r.deptOther) put(ds, r.dept);
      if (cm && (r.orgOther || r.deptOther)) cm.value = [`Нет в списке: ${r.orgOther ? 'учреждение «' + r.org + '», ' : ''}отделение «${r.dept}».`, keep.note].filter(Boolean).join(' ');
      try { if (prev) await prev.call(go, e); }
      finally {
        if (document.body.contains(go)) {
          if (os && keep.org === this.OTHER) os.value = this.OTHER;
          if (ds && keep.dept === this.OTHER) ds.value = this.OTHER;
          if (cm) cm.value = keep.note || '';
        }
      }
    };
  }
};

{
  const previous = Pages.login;
  Pages.login = async function (mode = 'login', ...args) {
    const r = await previous.call(this, mode, ...args);
    const box = document.querySelector('.auth-box');
    if (box && mode === 'login') RegForm.counters(box);
    if (box && mode === 'reg') RegForm.form(box);
    return r;
  };
}
