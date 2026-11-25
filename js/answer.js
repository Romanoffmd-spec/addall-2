/* Patient-facing screen without registry credentials or patient identifiers. */
'use strict';

(async () => {
  const title = document.querySelector('#surveyTitle'), status = document.querySelector('#surveyStatus');
  const form = document.querySelector('#surveyForm');
  const token = location.hash.slice(1);
  const call = async (action, data = {}) => {
    const response = await fetch('api/survey/' + action, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, ...data }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.err || 'Опросник недоступен');
    return result;
  };
  try {
    const survey = await call('view');
    title.textContent = survey.name;
    status.textContent = survey.note || '';
    survey.items.forEach((question, index) => {
      const group = document.createElement('fieldset');
      group.className = 'sec';
      const legend = document.createElement('legend');
      legend.textContent = question.label;
      group.append(legend);
      question.options.forEach((option, value) => {
        const choice = document.createElement('label');
        choice.className = 'chip';
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'q' + index;
        input.value = value;
        input.required = true;
        choice.append(input, option);
        group.append(choice);
      });
      form.append(group);
    });
    const button = document.createElement('button');
    button.className = 'btn primary';
    button.textContent = 'Отправить ответы';
    form.append(button);
    form.hidden = false;
    form.onsubmit = async event => {
      event.preventDefault();
      button.disabled = true;
      try {
        const fields = new FormData(form);
        await call('submit', { answers: survey.items.map((_, i) => Number(fields.get('q' + i))) });
        form.hidden = true;
        form.replaceChildren();
        status.textContent = 'Спасибо. Ваши ответы сохранены.';
        history.replaceState(null, '', location.pathname);
      } catch (error) { status.textContent = error.message; button.disabled = false; }
    };
  } catch (error) { status.textContent = error.message; }
})();
