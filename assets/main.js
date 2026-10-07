const filters = document.querySelector('[data-filters]');
if (filters) {
  const input = document.querySelector('#search');
  const cards = [...document.querySelectorAll('.post-card')];
  const buttons = [...document.querySelectorAll('.category-button')];
  const empty = document.querySelector('#empty-state');
  const reset = document.querySelector('#reset-filters');
  let category = '';
  function update() {
    const query = input.value.trim().toLocaleLowerCase();
    let count = 0;
    for (const card of cards) {
      card.hidden = Boolean((category && card.dataset.category !== category) || (query && !card.dataset.search.includes(query)));
      if (!card.hidden) count++;
    }
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.category === category));
    empty.hidden = count > 0;
    reset.hidden = !category && !query;
    document.querySelector('#results-count').textContent = `找到 ${count} 篇文章`;
  }
  filters.hidden = false;
  input.addEventListener('input', update);
  for (const button of buttons) button.addEventListener('click',()=>{category=button.dataset.category;update();});
  reset.addEventListener('click',()=>{category='';input.value='';update();input.focus();});
}
