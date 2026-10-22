/* Transitions.dev orchestration adapted for native details and existing controls.
 * CSS recipes: https://github.com/Jakubantalik/transitions.dev
 */
(() => {
  'use strict';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const duration = (element, name, fallback) => {
    if (reduced.matches) return 0;
    const value = getComputedStyle(element).getPropertyValue(name).trim();
    const number = parseFloat(value);
    return Number.isFinite(number) ? number * (value.endsWith('ms') ? 1 : 1000) : fallback;
  };

  function accordion(details, index) {
    const head = details.querySelector(':scope > summary');
    if (!head || details.classList.contains('t-acc')) return;
    const panel = document.createElement('div');
    const inner = document.createElement('div');
    panel.className = 't-acc-panel';
    inner.className = 't-acc-panel-inner';
    panel.id = `${details.id || `disclosure-${index}`}-panel`;
    while (head.nextSibling) inner.append(head.nextSibling);
    panel.append(inner);
    details.append(panel);
    details.classList.add('t-acc');
    head.setAttribute('aria-controls', panel.id);
    head.querySelector('.principle-icon, .setup-toggle-icon')?.classList.add('t-acc-chevron');
    let timer, closing = false;
    function state(open) {
      details.dataset.open = String(open);
      head.setAttribute('aria-expanded', String(open));
      panel.inert = !open;
    }
    state(details.open);
    function setOpen(open) {
      clearTimeout(timer);
      closing = !open;
      if (open) {
        details.open = true;
        void panel.offsetHeight;
        state(true);
      } else {
        if (panel.contains(document.activeElement)) head.focus({preventScroll: true});
        state(false);
        const finish = () => { details.open = false; closing = false; };
        const ms = duration(details, '--acc-collapse', 250);
        if (ms) timer = setTimeout(finish, ms);
        else finish();
      }
      // Existing media handlers also pause during the closing animation.
      details.dispatchEvent(new Event('toggle'));
    }
    head.addEventListener('click', event => {
      event.preventDefault();
      setOpen(details.dataset.open !== 'true');
    });
    details.addEventListener('toggle', () => {
      if (!closing && details.open !== (details.dataset.open === 'true')) setOpen(details.open);
    });
    reduced.addEventListener('change', () => {
      if (reduced.matches && closing) { clearTimeout(timer); details.open = false; closing = false; }
    });
  }

  function slidingTabs(bar) {
    if (bar.classList.contains('t-tabs')) return;
    const tabs = [...bar.querySelectorAll(':scope > button')];
    if (!tabs.length) return;
    bar.classList.add('t-tabs');
    tabs.forEach(tab => tab.classList.add('t-tab'));
    const pill = document.createElement('span');
    pill.className = 't-tabs-pill';
    pill.setAttribute('aria-hidden', 'true');
    bar.prepend(pill);
    const active = () => tabs.find(tab => tab.getAttribute('aria-selected') === 'true' || tab.getAttribute('aria-pressed') === 'true') || tabs[0];
    function move(animate) {
      const tab = active();
      if (!tab.offsetWidth) return;
      if (!animate) pill.style.transition = 'none';
      pill.style.transform = `translateX(${tab.offsetLeft}px)`;
      pill.style.width = `${tab.offsetWidth}px`;
      pill.style.top = `${tab.offsetTop}px`;
      pill.style.height = `${tab.offsetHeight}px`;
      if (!animate) { void pill.offsetWidth; pill.style.transition = ''; }
    }
    const observer = new MutationObserver(() => move(true));
    tabs.forEach(tab => observer.observe(tab, {attributes: true, attributeFilter: ['aria-selected', 'aria-pressed']}));
    const resize = new ResizeObserver(() => move(false));
    resize.observe(bar);
    tabs.forEach(tab => resize.observe(tab));
    document.fonts?.ready.then(() => move(false));
    move(false);
  }

  const panelFrames = new WeakMap();
  function reveal(panel) {
    cancelAnimationFrame(panelFrames.get(panel));
    panel.classList.add('t-panel-slide');
    panel.dataset.open = 'false';
    panel.style.transition = 'none';
    void panel.offsetHeight;
    panel.style.transition = '';
    if (reduced.matches) panel.dataset.open = 'true';
    else panelFrames.set(panel, requestAnimationFrame(() => { panel.dataset.open = 'true'; }));
  }
  window.PageMotion = {duration, reduced, accordion, slidingTabs, reveal};
})();

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('details.research-toggle, details.friction-detail').forEach(PageMotion.accordion);
});
document.addEventListener('DOMContentLoaded', () => document.querySelectorAll('.experiment-toolbar .tabs').forEach(PageMotion.slidingTabs));
