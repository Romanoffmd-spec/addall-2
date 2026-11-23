/* AddAll 2.11: явные причины пропуска значения.
   У обязательных и желательных полей можно отметить: "неизвестно", "не применимо", "нет в документе".
   Отметка хранится в данных события как _na: { ключ поля: код причины } и не подменяет само значение.
   Полнота считает поле с причиной отвеченным; показатель качества исключает "не применимо" из знаменателя,
   а "неизвестно" и "нет в документе" показывает как случаи без ответа. Подключается после worklist.js, до net.js. */
'use strict';

const NA_REASONS = { unk: 'неизвестно', na: 'не применимо', nodoc: 'нет в документе' };

{
  const _render = renderEventForm;
  renderEventForm = function (root, reg, patient, et, data, eventDate, users) {
    let read = _render(root, reg, patient, et, data, eventDate, users);
    /* 2.11: автосохранение несохранённого ввода в этом браузере (на случай закрытия окна или сбоя) */
    const AK = 'addall2.autosave.' + (Auth.user?.id || '') + '.' + (patient?.id || 'new') + '.' + (et?.id || '');
    let tmr = null; const saveLocal = () => { clearTimeout(tmr); tmr = setTimeout(() => { try { localStorage.setItem(AK, JSON.stringify({ at: nowISO(), data: readForm(root) })); } catch (e) { } }, 800); };
    try {
      const prev = JSON.parse(localStorage.getItem(AK) || 'null');
      if (prev && prev.data && JSON.stringify(prev.data) !== JSON.stringify(Object.fromEntries(Object.entries(data || {}).filter(([k]) => k !== '_na'))) && Object.values(prev.data).some(v => !isEmpty(v)) && !root.dataset.ro) {
        const bar = document.createElement('div'); bar.className = 'card warn autosave-bar';
        bar.innerHTML = `Есть несохранённый ввод от ${fmtDT(prev.at)}. <button type="button" class="btn xs primary" data-as="1">Восстановить</button> <button type="button" class="btn xs" data-as="0">Удалить</button>`;
        root.prepend(bar);
        bar.onclick = (e) => { const b = e.target.closest('[data-as]'); if (!b) return; e.stopPropagation();
          if (b.dataset.as === '1') { read = _render(root, reg, patient, et, { ...(data || {}), ...prev.data }, eventDate, users); decorate(); toast('Ввод восстановлен, проверьте и сохраните'); }
          else { try { localStorage.removeItem(AK); } catch (x) { } bar.remove(); } };
      }
    } catch (e) { }
    root.addEventListener('input', saveLocal); root.addEventListener('change', saveLocal);
    const na = { ...((data && data._na) || {}) };
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
        pop.onclick = (ev) => { const x = ev.target.closest('[data-na]'); if (!x) return; ev.stopPropagation(); if (x.dataset.na) { na[f.key] = x.dataset.na; /* значение и причина пропуска не могут быть одновременно: поле очищается */ w.querySelectorAll('[data-k]').forEach(el => { if (el.matches('input:not([type=radio]):not([type=checkbox]),select,textarea')) el.value = ''; }); w.querySelectorAll('input[type=radio],input[type=checkbox]').forEach(i => { i.checked = false; }); root.dispatchEvent(new Event('input')); } else delete na[f.key]; pop.remove(); paint(w, f.key); b.focus(); };
        pop.onkeydown = (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); pop.remove(); b.focus(); } };
      };
      lab.appendChild(b); paint(w, f.key);
    });
    decorate();
    /* ввели значение: отметка о пропуске снимается */
    root.addEventListener('input', (e) => { const w = e.target.closest && e.target.closest('[data-wrap]'); if (w && na[w.dataset.wrap]) { delete na[w.dataset.wrap]; paint(w, w.dataset.wrap); } });
    root.addEventListener('change', (e) => { const w = e.target.closest && e.target.closest('[data-wrap]'); if (w && na[w.dataset.wrap] && !e.target.closest('.na-pop')) { delete na[w.dataset.wrap]; paint(w, w.dataset.wrap); } });
    return function () {
      clearTimeout(tmr); try { localStorage.removeItem(AK); } catch (e) { }
      const r = read(); const keep = {};
      Object.entries(na).forEach(([k, v]) => { if (isEmpty(r.data[k])) keep[k] = v; });
      if (Object.keys(keep).length) r.data._na = keep; else delete r.data._na;
      return r;
    };
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
