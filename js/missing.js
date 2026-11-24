/* AddAll 2.11: явные причины пропуска значения.
   У обязательных и желательных полей можно отметить: "неизвестно", "не применимо", "нет в документе".
   Отметка хранится в данных события как _na: { ключ поля: код причины } и не подменяет само значение.
   Полнота считает поле с причиной отвеченным; показатель качества исключает "не применимо" из знаменателя,
   а "неизвестно" и "нет в документе" показывает как случаи без ответа. Подключается после worklist.js, до net.js. */
'use strict';

const NA_REASONS = { unk: 'неизвестно', na: 'не применимо', nodoc: 'нет в документе' };

{
  const _render = renderEventForm;
  const bindings = new WeakMap();
  renderEventForm = function (root, reg, patient, et, data, eventDate, users, eventKey) {
    bindings.get(root)?.abort();
    const controller = new AbortController();
    bindings.set(root, controller);
    const { signal } = controller;
    let read = _render(root, reg, patient, et, data, eventDate, users);
    if (root.dataset.ro) return read;
    const na = { ...((data && data._na) || {}) };
    const autosaveKey = eventKey && ['addall2', 'autosave', TRAIN ? 'train' : 'main', Auth.user?.id, reg.id, patient.id, et.id, eventKey].join('.');
    const dialog = root.closest('.modal');
    const dateInput = dialog?.querySelector('#evDate');
    const checkedInput = dialog?.querySelector('#evOut30Checked');
    const storage = () => typeof NET !== 'undefined' && NET.on ? sessionStorage : localStorage;
    const current = () => ({ data: { ...readForm(root), _na: { ...na } }, date: dateInput?.value, checkedOn: checkedInput?.value });
    const initial = JSON.stringify(current());
    const saveLocal = () => {
      if (!autosaveKey) return;
      try { storage().setItem(autosaveKey, JSON.stringify({ at: nowISO(), ...current() })); } catch (e) { }
    };
    if (autosaveKey) {
      dateInput?.addEventListener('change', saveLocal, { signal });
      checkedInput?.addEventListener('change', saveLocal, { signal });
    }
    const fields = formFields(et).filter(f => f.type !== 'calc' && f.type !== 'yesno' && (f.required || f.key_));
    const paint = (w, k) => {
      const r = na[k]; let chip = w.querySelector('.na-chip');
      if (r) { if (!chip) { chip = document.createElement('span'); chip.className = 'na-chip'; w.appendChild(chip); } chip.textContent = 'Нет значения: ' + NA_REASONS[r]; w.classList.add('has-na'); }
      else { if (chip) chip.remove(); w.classList.remove('has-na'); }
    };
    const decorate = () => fields.forEach(f => {
      const w = root.querySelector(`[data-wrap="${f.key}"]`); if (!w) return;
      const lab = w.querySelector('.flab'); if (!lab || w.querySelector('.na-btn')) return;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'na-btn'; b.textContent = 'нет значения'; b.title = 'Отметить причину, по которой значения нет';
      b.setAttribute('aria-label', 'Причина отсутствия значения: ' + f.label);
      b.onclick = (e) => {
        e.preventDefault(); e.stopPropagation();
        $$('.na-pop').forEach(x => x.remove());
        const pop = document.createElement('div'); pop.className = 'na-pop'; pop.setAttribute('role', 'menu');
        pop.innerHTML = Object.entries(NA_REASONS).map(([k, t]) => `<button type="button" role="menuitem" data-na="${k}" class="${na[f.key] === k ? 'on' : ''}">${t}</button>`).join('') + (na[f.key] ? '<button type="button" role="menuitem" data-na="">снять отметку</button>' : '');
        w.appendChild(pop); const first = pop.querySelector('button'); if (first) first.focus();
        pop.onclick = (ev) => { const x = ev.target.closest('[data-na]'); if (!x) return; ev.stopPropagation(); if (x.dataset.na) { na[f.key] = x.dataset.na; /* значение и причина пропуска не могут быть одновременно: поле очищается */ w.querySelectorAll('[data-k]').forEach(el => { if (el.matches('input:not([type=radio]):not([type=checkbox]),select,textarea')) el.value = ''; }); w.querySelectorAll('input[type=radio],input[type=checkbox]').forEach(i => { i.checked = false; }); root.dispatchEvent(new Event('input')); } else delete na[f.key]; pop.remove(); paint(w, f.key); saveLocal(); b.focus(); };
        pop.onkeydown = (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); pop.remove(); b.focus(); } };
      };
      lab.appendChild(b); paint(w, f.key);
    });
    decorate();
    const onChange = e => {
      const w = e.target.closest?.('[data-wrap]');
      if (w && na[w.dataset.wrap] && !isEmpty(readForm(root)[w.dataset.wrap])) {
        delete na[w.dataset.wrap];
        paint(w, w.dataset.wrap);
      }
      saveLocal();
    };
    root.addEventListener('input', onChange, { signal });
    root.addEventListener('change', onChange, { signal });

    try {
      const saved = autosaveKey && JSON.parse(storage().getItem(autosaveKey) || 'null');
      if (saved?.data && JSON.stringify({ data: saved.data, date: saved.date, checkedOn: saved.checkedOn }) !== initial) {
        const bar = document.createElement('div');
        bar.className = 'card warn autosave-bar';
        bar.innerHTML = `Есть несохранённый ввод от ${fmtDT(saved.at)}. <button type="button" class="btn xs primary" data-as="1">Восстановить</button> <button type="button" class="btn xs" data-as="0">Удалить</button>`;
        root.prepend(bar);
        bar.onclick = e => {
          const button = e.target.closest('[data-as]');
          if (!button) return;
          e.stopPropagation();
          if (button.dataset.as === '0') {
            try { storage().removeItem(autosaveKey); } catch (error) { }
            bar.remove();
            return;
          }
          for (const key of Object.keys(na)) delete na[key];
          Object.assign(na, saved.data._na || {});
          if (dateInput && saved.date !== undefined) dateInput.value = saved.date;
          if (checkedInput && saved.checkedOn !== undefined) checkedInput.value = saved.checkedOn;
          read = _render(root, reg, patient, et, { ...(data || {}), ...saved.data }, dateInput?.value || eventDate, users);
          decorate();
          toast('Ввод восстановлен, проверьте и сохраните');
        };
      }
    } catch (error) { }

    const result = () => {
      const r = read();
      const keep = Object.fromEntries(Object.entries(na).filter(([key]) => isEmpty(r.data[key])));
      if (Object.keys(keep).length) { r.data._na = keep; r.all._na = keep; }
      return r;
    };
    result.saveAutosave = saveLocal;
    result.clearAutosave = () => {
      if (autosaveKey) try { storage().removeItem(autosaveKey); } catch (error) { }
    };
    return result;
  };
}

document.addEventListener('click', (e) => { if (!e.target.closest || (!e.target.closest('.na-pop') && !e.target.closest('.na-btn'))) $$('.na-pop').forEach(x => x.remove()); });

/* полнота: поле с причиной пропуска считается отвеченным */
{
  const _comp = completeness;
  completeness = function (et, vals) {
    const r = _comp(et, vals); const na = vals && vals._na; if (!na) return r;
    const miss = r.missing.filter(lbl => { const f = formFields(et).find(x => x.label === lbl); return !(f && na[f.key]); });
    const filled = r.total - miss.length;
    return { total: r.total, filled, pct: r.total ? Math.round(filled / r.total * 100) : 100, missing: miss, reasons: Object.keys(na).length };
  };
}

/* значение в просмотре карты */
if (typeof EN === 'object') Object.assign(EN, { 'нет значения': 'no value', 'неизвестно': 'unknown', 'не применимо': 'not applicable', 'нет в документе': 'not in source document', 'снять отметку': 'clear' });
