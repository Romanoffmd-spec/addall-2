/* Пошаговый гайд для учебной базы. */
'use strict';

const TrainingGuide = {
  key: 'addall2.trainingGuide.v1',
  index: -1,
  running: false,
  patientRoute: '',
  target: null,
  root: null,
  steps: [
    { title: 'Начните с главной', text: 'Нажмите «Главная» в меню. Пройдём по рабочим экранам на вымышленных данных.', target: '#sbnav a[href="#home"], .sb-burger', next: 'Открыть главную', route: 'home' },
    { title: 'Главная', page: 'home', text: 'Здесь собраны задачи, полнота записей и показатели качества. На плитке показано, сколько случаев учтено. По нажатию открывается список пациентов.', target: '#main .qi-btn, #main .head', route: 'registries' },
    { title: 'Регистры и конструктор', page: 'registries', text: 'Кнопка «Создать регистр» открывает выбор шаблона. В конструкторе меняют формы, обязательные поля и показатели. Можно создать свой регистр или использовать учебный пример.', target: '#newReg, #propReg, #main .head', route: 'training', next: 'К генератору' },
    { title: 'Генератор пациентов', page: 'training', text: 'Выберите регистр и число пациентов. Генератор заполнит его собственные формы и создаст события. Попробуйте сгенерировать несколько пациентов и откройте их список.', target: '#trMake, #main .head', avoid: '#trControls', route: 'patients', next: 'К списку пациентов' },
    { title: 'Список пациентов', page: 'patients', text: 'Фильтры под заголовками помогают найти пациентов. «+ Пациент» открывает новую карточку. Нажмите на строку, чтобы открыть существующую учебную карточку.', target: '#plist tr[data-id], #newP, #main .head', next: 'Открыть карточку' },
    { title: 'Карточка и события', page: 'patient', text: 'Сверху данные пациента, ниже его события и документы. Выберите тип рядом с «Добавить событие». В форме можно сохранить черновик и указать причины пропусков.', target: '#main .addev, #main .phead', route: 'out30' },
    { title: 'Исходы 30 дней', page: 'out30', text: 'Здесь видно, по каким операциям пора уточнить исход. Откройте нужную строку через «Заполнить» или «Дополнить» и укажите дату проверки.', target: '#main [data-fill], #main .tabs', route: 'queries' },
    { title: 'Запросы по данным', page: 'queries', text: 'Запрос связывает вопрос с конкретной записью. Откройте запрос, проверьте поле и оставьте ответ. Очередь показывает статус каждого запроса.', target: '#main .head', route: 'analytics' },
    { title: 'Аналитика', page: 'analytics', text: 'Выберите регистр, задайте когорту и вид анализа. Нажмите «Построить». Анализ использует выбранную выборку, поэтому сначала проверьте фильтры.', target: '#aRun, #main .head', route: 'coverage' },
    { title: 'Охват регистра', page: 'coverage', text: 'Выберите период, учреждение и событие. Сравните число пациентов в регистре с независимым источником за тот же период.', target: '#covExpected, #main .head', route: 'report' },
    { title: 'Годовой отчёт', page: 'report', text: 'Здесь собраны сводка регистра и показатели за период. Гайд можно запустить повторно из верхней учебной полосы.', target: '#main .head', next: 'Завершить гайд' }
  ],

  remembered() {
    try { return localStorage.getItem(this.key) === 'done'; } catch (error) { return false; }
  },
  start() {
    if (!TRAIN) return;
    this.index = 0;
    this.running = true;
    this.patientRoute = '';
    this.draw(true);
  },
  close() {
    this.running = false;
    this.root?.remove();
    this.root = null;
    this.target = null;
    try { localStorage.setItem(this.key, 'done'); } catch (error) { }
    $('#trGuide')?.focus({ preventScroll: true });
  },
  routeName() { return location.hash.slice(1).split('/')[0] || 'home'; },
  onPage(step) {
    const route = this.routeName();
    return !step.page || step.page === route || (step.page === 'registries' && route === 'registry');
  },
  find(selector) {
    if (!selector) return null;
    for (const candidate of selector.split(',')) {
      const node = $$(candidate.trim()).find(element => {
        const rect = element.getBoundingClientRect();
        return element.getClientRects().length && rect.right > 0 && rect.left < innerWidth && getComputedStyle(element).visibility !== 'hidden';
      });
      if (node) return node;
    }
    return null;
  },
  patient() {
    const row = $('#plist tr[data-id]');
    if (row?.dataset.id) return 'patient/' + encodeURIComponent(row.dataset.id);
    return this.patientRoute || '';
  },
  next() {
    const current = this.steps[this.index];
    if (!current || this.index === this.steps.length - 1) { this.close(); return; }
    let route = this.index === 4 ? this.patient() : current.route;
    if (this.index === 4 && !route) { this.index++; route = 'out30'; }
    if (route?.startsWith('patient/')) this.patientRoute = route;
    this.index++;
    this.root?.remove();
    if (route && location.hash !== '#' + route) go(route);
    else this.draw(true);
  },
  back() {
    if (this.index <= 0) return;
    this.index--;
    const step = this.steps[this.index];
    const route = step.page === 'patient' ? this.patientRoute : step.page;
    if (route && location.hash !== '#' + route) go(route);
    else this.draw(true);
  },
  onRoute() {
    if (!TRAIN || !Auth.user || !$('#trainBar')) return;
    if (!this.running) {
      if (this.index < 0 && !this.remembered()) this.start();
      return;
    }
    const route = this.routeName();
    if (this.index === 3 && route === 'patients') this.index = 4;
    if (this.index === 4 && route === 'patient') {
      this.patientRoute = location.hash.slice(1);
      this.index = 5;
    }
    this.draw(true);
  },
  draw(focus = false) {
    if (!this.running) return;
    const step = this.steps[this.index];
    if (!step) return;
    if (!this.root?.isConnected) {
      this.root = document.createElement('div');
      this.root.className = 'training-guide';
      document.body.append(this.root);
    }
    const active = this.onPage(step);
    const title = 'trainingGuideTitle';
    const body = 'trainingGuideText';
    const returnToStep = !active && step.page && step.page !== 'patient';
    const nextLabel = returnToStep ? 'Открыть раздел' : this.index === 4 && !this.patient() ? 'Дальше' : step.next || 'Дальше';
    this.root.innerHTML = `<div class="training-spot" aria-hidden="true"></div>
      <section class="training-callout" role="dialog" aria-labelledby="${title}" aria-describedby="${body}">
        <div class="training-callout-top"><span>Шаг ${this.index + 1} из ${this.steps.length}</span><button type="button" class="btn xs" id="trainGuideSkip" aria-label="Закрыть гайд">Закрыть</button></div>
        <h2 id="${title}">${esc(step.title)}</h2><p id="${body}">${esc(step.text)}</p>
        <div class="training-callout-actions">${this.index > 0 ? '<button type="button" class="btn" id="trainGuideBack">Назад</button>' : ''}<button type="button" class="btn primary" id="trainGuideNext">${nextLabel}</button></div>
      </section>`;
    $('#trainGuideSkip', this.root).onclick = () => this.close();
    $('#trainGuideNext', this.root).onclick = () => returnToStep ? go(step.page) : this.next();
    const back = $('#trainGuideBack', this.root);
    if (back) back.onclick = () => this.back();
    this.target = active ? this.find(step.target) : null;
    if (this.target && focus) this.target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    this.position();
    if (focus) $('#trainGuideNext', this.root).focus({ preventScroll: true });
  },
  refreshTarget() {
    const step = this.steps[this.index];
    if (!this.running || !this.root?.isConnected || !this.onPage(step)) return;
    this.target = this.find(step.target);
    this.position();
  },
  position() {
    if (!this.root?.isConnected) return;
    const box = $('.training-callout', this.root), spot = $('.training-spot', this.root);
    const target = this.target?.isConnected && this.target.getBoundingClientRect();
    const width = box.offsetWidth, height = box.offsetHeight;
    const boundary = 12, gap = 18;
    const clamp = (n, min, max) => Math.max(min, Math.min(n, Math.max(min, max)));
    let side = 'none', left = (innerWidth - width) / 2, top = (innerHeight - height) / 2;
    spot.hidden = !target || target.bottom <= 0 || target.top >= innerHeight;
    if (!spot.hidden) {
      const blocker = this.find(this.steps[this.index].avoid)?.getBoundingClientRect() || target;
      const halfX = (target.left + target.right) / 2, halfY = (target.top + target.bottom) / 2;
      Object.assign(spot.style, { left: (target.left - 4) + 'px', top: (target.top - 4) + 'px', width: (target.width + 8) + 'px', height: (target.height + 8) + 'px' });
      if (blocker.right + gap + width + boundary <= innerWidth) {
        side = 'left'; left = blocker.right + gap; top = halfY - height / 2;
      } else if (blocker.left >= width + gap + boundary) {
        side = 'right'; left = blocker.left - gap - width; top = halfY - height / 2;
      } else {
        left = halfX - width / 2;
        if (blocker.bottom + gap + height + boundary <= innerHeight || blocker.top < height + gap + boundary) { side = 'top'; top = blocker.bottom + gap; }
        else { side = 'bottom'; top = blocker.top - height - gap; }
      }
      left = clamp(left, boundary, innerWidth - width - boundary);
      top = clamp(top, boundary, innerHeight - height - boundary);
      const offset = side === 'top' || side === 'bottom' ? clamp(halfX - left, 18, width - 18) : clamp(halfY - top, 18, height - 18);
      box.style.setProperty('--guide-arrow', offset + 'px');
    }
    box.dataset.side = side;
    box.style.left = left + 'px'; box.style.top = top + 'px';
  }
};

if (TRAIN) {
  const renderRoute = App.route.bind(App);
  App.route = async function (...args) {
    await renderRoute(...args);
    const button = $('#trGuide');
    if (button) button.onclick = () => TrainingGuide.start();
    TrainingGuide.onRoute();
  };
  const renderNav = App.nav.bind(App);
  App.nav = async function (...args) {
    await renderNav(...args);
    TrainingGuide.refreshTarget();
  };
  addEventListener('resize', () => TrainingGuide.refreshTarget());
  document.addEventListener('scroll', () => TrainingGuide.position(), true);
  document.addEventListener('click', event => {
    if (!TrainingGuide.running || !(event.target instanceof Element)) return;
    if (TrainingGuide.index === 0 && event.target.closest('a[href="#home"]')) {
      setTimeout(() => { if (TrainingGuide.running && TrainingGuide.index === 0) TrainingGuide.next(); }, 0);
    } else if (event.target.closest('#sbBurger')) {
      setTimeout(() => TrainingGuide.draw(), 100);
    }
  }, true);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && TrainingGuide.running) {
      event.preventDefault();
      event.stopImmediatePropagation();
      TrainingGuide.close();
    }
  }, true);
}
