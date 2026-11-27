/* AddAll 2.0: резервные копии серверной базы на странице «Импорт и экспорт» (только администратор, серверный режим).
   Копии снимает и проверяет сервер (server/backups.js). Подключается после modules.js. */
'use strict';

{
  const io = Routes.io;
  Routes.io = async (main, ...rest) => {
    await io(main, ...rest);
    if (typeof NET === 'undefined' || !NET.on || !can('users') || $('#bkCard', main)) return;
    const card = document.createElement('div');
    card.className = 'card';
    card.id = 'bkCard';
    main.append(card);
    const size = b => b == null ? '' : b > 1e9 ? (b / 1e9).toFixed(1) + ' ГБ' : (b / 1e6).toFixed(1) + ' МБ';
    const draw = async () => {
      try {
        const st = await NET.call('GET', 'backup');
        card.innerHTML = `<h3>Резервные копии сервера</h3>
          <p>${st.enabled ? `Копия снимается автоматически раз в ${st.hours} ч и сразу проверяется: копия открывается как отдельная база, проверяется целостность, число записей и все вложения. Хранится ${st.keep} последних копий.` : 'Автоматические копии выключены (ADDALL_BACKUP=0).'}</p>
          <p>${st.lastOk ? `Последняя проверенная копия: <b>${fmtDT(st.lastOk.finishedAt)}</b>, ${st.lastOk.records} записей, ${size(st.lastOk.size)}.` : '<span class="warnt">Проверенных копий ещё нет.</span>'}
          ${st.last && !st.last.ok ? `<br><span class="bad">Последняя попытка не удалась: ${esc(st.last.problem || '')}</span>` : ''}</p>
          <p class="muted small">Папка копий: ${esc(st.dir)}. Лучше держать её на другом диске или в сетевом хранилище: задаётся переменной ADDALL_BACKUP_DIR.</p>
          ${st.list.length ? `<table class="tbl small"><thead><tr><th>Когда</th><th>Проверка</th><th>Записей</th><th>Размер</th><th>Файл</th></tr></thead><tbody>
          ${st.list.map(x => `<tr><td>${fmtDT(x.finishedAt || x.startedAt)}</td><td>${x.ok ? '<span class="okt">восстановление проверено</span>' : '<span class="bad">' + esc(x.problem || 'ошибка') + '</span>'}</td><td>${x.records ?? ''}</td><td>${size(x.size)}</td><td class="mono">${esc(x.file || '')}</td></tr>`).join('')}</tbody></table>` : ''}
          <div class="row"><button class="btn" id="bkRun">Сделать копию сейчас</button></div>
          <p class="muted small">Восстановление: остановите сервер, замените data/addall.sqlite выбранной копией, верните папку incoming-files из папки копий и запустите сервер.</p>`;
        $('#bkRun', card).onclick = async () => {
          const button = $('#bkRun', card); button.disabled = true; button.textContent = 'Снимаю и проверяю копию…';
          try { await NET.call('POST', 'backup', {}); toast('Копия создана и проверена'); } catch (e) { toast(e.message, 'err'); }
          draw();
        };
      } catch (e) { card.innerHTML = '<h3>Резервные копии сервера</h3><p class="warnt">' + esc(e.message) + '</p>'; }
    };
    draw();
  };
}
