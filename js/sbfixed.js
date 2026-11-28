/* AddAll 2.0: постоянные пункты внизу боковой панели, над «Учебным режимом».
   Порядок: Простое меню врача, Заявки на данные, Отчёт обратной связи, Руководство пользователя, Учебный режим.
   Пункты убираются из групп меню и всегда видны (если доступны пользователю). Подключается последним. */
'use strict';

const SBFixed = {
  ORDER: ['navmode', 'datarequests', 'feedback', 'manual'],
  items: [],
  render() {
    const foot = document.querySelector('#sb .sb-foot'); if (!foot) return;
    let box = foot.querySelector('#sbFixed');
    if (!box) { box = document.createElement('div'); box.id = 'sbFixed'; box.className = 'sb-fixed'; foot.prepend(box); }
    const cur = (location.hash.slice(1) || 'home').split('/')[0];
    box.innerHTML = this.items.map(it => `<a class="sb-it ${cur === it.r ? 'on' : ''}" href="#${it.r}" title="${esc(it.t)}"><i>${navIcon(it)}</i><span>${esc(it.t)}</span></a>`).join('');
    box.querySelectorAll('a').forEach(a => a.addEventListener('click', () => SB.mobile(false)));
  }
};

{
  const previous = navGroups;
  navGroups = async function () {
    const groups = await previous();
    const found = {};
    for (const g of groups) {
      if (!g.items) continue;
      g.items = g.items.filter(x => { if (x && x.r && SBFixed.ORDER.includes(x.r)) { found[x.r] = found[x.r] || x; return false; } return true; });
      /* лишние разделители после удаления */
      g.items = g.items.filter((x, i, a) => !(x.sep != null && (i === a.length - 1 || a[i + 1]?.sep != null)));
    }
    SBFixed.items = SBFixed.ORDER.filter(r => found[r]).map(r => found[r]);
    return groups.filter(g => !g.items || g.items.some(x => x.r));
  };
}
{
  const render = SB.render.bind(SB);
  SB.render = function () { render(); SBFixed.render(); };
}
