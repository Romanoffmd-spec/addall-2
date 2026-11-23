/* AddAll 2.11: честные показатели качества.
   Доверительный интервал Уилсона, нейтральный цвет, когда данных мало или интервал задевает цель,
   словесный вывод, число случаев без ответа и переход к пациентам из любого показателя.
   Подключается после ui.js и до net.js. */
const QI = {
  MIN_N: 10, /* меньше 10 случаев в знаменателе: вывод не делаем */
  Z: 1.96,
  _ctx: {}, _seq: 0,

  wilson(num, den) {
    if (!den) return null;
    const z = this.Z, p = num / den, z2 = z * z;
    const d = 1 + z2 / den, c = (p + z2 / (2 * den)) / d;
    const h = z * Math.sqrt(p * (1 - p) / den + z2 / (4 * den * den)) / d;
    return [Math.max(0, (c - h) * 100), Math.min(100, (c + h) * 100)];
  },
  n1(v) { return (Math.round(v * 10) / 10).toLocaleString(typeof LANG !== 'undefined' && LANG === 'en' ? 'en-US' : 'ru-RU'); },
  hasTarget(i) { return i.target !== '' && i.target != null && !isNaN(Number(i.target)); },
  tgtTxt(i) { return this.hasTarget(i) ? `цель ${i.lowerBetter ? '≤' : '≥'} ${i.target}%` : ''; },

  /* вывод: cls = ok | due | few | '' */
  verdict(i, x) {
    if (!x || !x.den) return { cls: '', txt: x && x.miss ? 'поле показателя не заполнено' : 'пока нет случаев', key: 'none' };
    if (x.den < this.MIN_N) return { cls: 'few', txt: `мало случаев для вывода (нужно от ${this.MIN_N})`, key: 'few' };
    if (!this.hasTarget(i)) return { cls: '', txt: 'цель не задана', key: 'notgt' };
    const t = Number(i.target), ci = this.wilson(x.num, x.den), lo = ci[0], hi = ci[1];
    const better = i.lowerBetter ? hi < t : lo > t, worse = i.lowerBetter ? lo > t : hi < t;
    if (better) return { cls: 'ok', txt: 'лучше цели', key: 'better' };
    if (worse) return { cls: 'due', txt: 'хуже цели', key: 'worse' };
    return { cls: '', txt: 'не отличается от цели', key: 'same' };
  },

  /* запоминаем контекст для перехода к пациентам */
  keep(reg, ind, x, events, patients) { const k = 'q' + (++this._seq); this._ctx[k] = { reg, ind, x, events, patients }; return k; },

  /* плитка для главной */
  tile(reg, i, x, events, patients) {
    const v = this.verdict(i, x), ci = x.den ? this.wilson(x.num, x.den) : null, k = this.keep(reg, i, x, events, patients);
    const big = !x.den ? '<b class="nd">нет данных</b>' : v.key === 'few' ? `<b class="qi-few">${x.num} из ${x.den}</b>` : `<b>${this.n1(x.pct)}%</b>`;
    const sub = !x.den ? '' : v.key === 'few' ? `<em>${this.n1(x.pct)}%, интервал слишком широкий</em>` : `<em>${x.num} из ${x.den} · 95% ДИ ${this.n1(ci[0])}-${this.n1(ci[1])}%</em>`;
    const tg = this.tgtTxt(i);
    return `<button type="button" class="qi qi-btn ${v.cls}" data-qi="${k}" title="Показать пациентов">
      <span class="qi-l">${esc(i.name)}</span>${big}${sub}
      <span class="qi-v">${esc(v.txt)}${tg ? ' · ' + tg : ''}</span>
      ${x.miss ? `<span class="qi-m">ещё ${x.miss} без ответа, не учтены</span>` : ''}
    </button>`;
  },

  /* ячейка таблицы (аналитика, годовой отчёт, хирурги) */
  cell(reg, i, x, events, patients, opts = {}) {
    if (!x || !x.den) return `<td class="muted">${x && x.miss ? `нет ответа: ${x.miss}` : 'нет данных'}</td>`;
    const v = this.verdict(i, x), ci = this.wilson(x.num, x.den), k = this.keep(reg, i, x, events, patients);
    const cls = v.cls === 'ok' ? 'good' : v.cls === 'due' ? 'bad' : '';
    return `<td class="${cls}"><a href="javascript:void 0" data-qi="${k}" class="qi-a"><b>${this.n1(x.pct)}%</b></a> <span class="muted">${x.num}/${x.den}</span>${opts.ci === false ? '' : `<div class="muted small">ДИ ${this.n1(ci[0])}-${this.n1(ci[1])}%${v.key === 'few' ? ', мало случаев' : ''}</div>`}${x.miss ? `<div class="muted small">без ответа: ${x.miss}</div>` : ''}</td>`;
  },

  /* окно со списком пациентов */
  drill(k) {
    const c = this._ctx[k]; if (!c) return;
    const { reg, ind, x, events, patients } = c, v = this.verdict(ind, x);
    const evById = new Map(events.map(e => [e.id, e]));
    const ci = x.den ? this.wilson(x.num, x.den) : null;
    const list = (ids, title, hint) => {
      const rows = ids.map(id => evById.get(id)).filter(Boolean).map(e => { const p = patients.find(y => y.id === e.patientId); return { e, p }; })
        .sort((a, b) => String(b.e.date || '').localeCompare(String(a.e.date || '')));
      return `<h4 style="margin:16px 0 6px">${title} <span class="muted">${rows.length}</span></h4>${hint ? `<p class="muted small" style="margin:0 0 6px">${hint}</p>` : ''}
        ${rows.length ? `<table class="tbl small"><tbody>${rows.map(r => `<tr><td><a href="#patient/${r.p ? r.p.id : ''}" data-close>${esc(r.p ? pname(r.p) : '?')}</a></td><td>${fmtDate(r.e.date)}</td><td class="muted">${esc(r.e.status || '')}</td></tr>`).join('')}</tbody></table>` : '<p class="muted small">нет</p>'}`;
    };
    const numIds = x.numIds || [], denIds = x.denIds || [];
    const restIds = denIds.filter(id => !numIds.includes(id));
    const m = modal(`<h3>${esc(ind.name)}</h3>
      <p class="muted">${esc(reg.name)} · расчёт на ${fmtDate(today())} · без поправки на риск</p>
      <div class="qi-sum"><b>${x.den ? this.n1(x.pct) + '%' : 'нет данных'}</b><span>${x.num} из ${x.den}${ci ? ` · 95% ДИ ${this.n1(ci[0])}-${this.n1(ci[1])}%` : ''}</span><span class="qi-v">${esc(v.txt)}${this.tgtTxt(ind) ? ' · ' + this.tgtTxt(ind) : ''}</span></div>
      ${x.miss ? list(x.missIds || [], 'Нет ответа в поле показателя', 'Эти случаи не вошли в расчёт. Заполните поле, чтобы цифра стала точнее.') : ''}
      ${list(numIds, 'Событие наступило (числитель)')}
      ${list(restIds, 'Событие не наступило')}
      <p class="small" style="margin-top:14px"><b>Обоснование цели:</b> ${ind.ref ? esc(ind.ref) : (this.hasTarget(ind) ? '<span class="bad">источник цели не указан. Укажите его в настройке показателя, иначе цель нельзя защитить перед проверяющими.</span>' : 'цель не задана.')}</p>
      <p class="muted small">Интервал Уилсона 95%. При знаменателе меньше ${this.MIN_N} вывод о соответствии цели не делается.</p>`, { wide: true });
    m.querySelectorAll('[data-close]').forEach(a => a.addEventListener('click', () => m.close()));
  }
};

document.addEventListener('click', (e) => {
  const t = e.target.closest && e.target.closest('[data-qi]');
  if (!t) return;
  e.preventDefault(); QI.drill(t.dataset.qi);
});

if (typeof EN === 'object') Object.assign(EN, {
  'нет данных': 'no data', 'лучше цели': 'better than target', 'хуже цели': 'worse than target',
  'не отличается от цели': 'not different from target', 'цель не задана': 'no target set',
  'Показать пациентов': 'Show patients', 'Событие не наступило': 'Event did not occur',
  'Событие наступило (числитель)': 'Event occurred (numerator)', 'Нет ответа в поле показателя': 'No answer in indicator field'
});
