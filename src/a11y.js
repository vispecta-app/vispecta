// Accessibility (#62): roles, states and keyboard use for the parts of the page that are built as
// plain buttons and divs – the toolbar menus, the tabs of the left panel and the 3D view – and
// names for controls that only have a symbol or a tooltip.
//
// Kept apart from main.js: it watches the DOM (menus that open and close, tabs that change, cards
// that are rendered again) and keeps the ARIA attributes in step, so the rest of the code does not
// have to think about them.

/**
 * ctx: { t, canvas (the 3D view's canvas), closeMenus() }.
 */
export function initA11y({ t, canvas, closeMenus }) {
  // ------------------------------------------------------------------ menus
  // menu buttons say they open a menu and whether it is open; the items are menu items, and the
  // arrow keys, Home and End move between them
  const menus = () => [...document.querySelectorAll('.menu')].filter((m) => m.querySelector(':scope > .menu-btn'));
  const items = (pop) => [...pop.querySelectorAll('.menu-item, button, [tabindex="0"]')].filter((el) => !el.disabled && !el.hidden && el.getClientRects().length > 0);
  const markItems = (pop) => {
    for (const el of pop.querySelectorAll('.menu-item, :scope > button')) {
      const check = el.querySelector('.mi-check');
      if (check) { el.setAttribute('role', 'menuitemcheckbox'); el.setAttribute('aria-checked', String(/[☑✓✔]/.test(check.textContent))); }
      else el.setAttribute('role', 'menuitem');
      el.tabIndex = -1;
    }
    for (const sep of pop.querySelectorAll('.menu-sep')) sep.setAttribute('role', 'separator');
    for (const head of pop.querySelectorAll('.menu-head')) head.setAttribute('role', 'presentation');
  };
  for (const m of menus()) {
    const btn = m.querySelector(':scope > .menu-btn'), pop = m.querySelector(':scope > .menu-pop');
    if (!pop) continue;
    const id = `menu-${btn.dataset.menu || Math.random().toString(36).slice(2)}`;
    pop.id ||= id;
    pop.setAttribute('role', 'menu');
    btn.setAttribute('aria-haspopup', 'menu');
    btn.setAttribute('aria-controls', pop.id);
    btn.setAttribute('aria-expanded', 'false');
    // the visible text names the menu; the tooltip describes it
    if (btn.title) btn.setAttribute('aria-description', btn.title);
    new MutationObserver(() => {
      const open = !pop.hidden;
      btn.setAttribute('aria-expanded', String(open));
      if (open) markItems(pop);
    }).observe(pop, { attributes: true, attributeFilter: ['hidden'] });
    btn.addEventListener('keydown', (e) => {
      if (!['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) return;
      e.preventDefault();
      if (pop.hidden) btn.click();
      requestAnimationFrame(() => { const list = items(pop); (e.key === 'ArrowUp' ? list.at(-1) : list[0])?.focus(); });
    });
    pop.addEventListener('keydown', (e) => {
      const list = items(pop);
      const i = list.indexOf(document.activeElement);
      let next = null;
      if (e.key === 'ArrowDown') next = list[(i + 1) % list.length];
      else if (e.key === 'ArrowUp') next = list[(i - 1 + list.length) % list.length];
      else if (e.key === 'Home') next = list[0];
      else if (e.key === 'End') next = list.at(-1);
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenus(); btn.focus(); return; }
      else if (e.key === 'Tab') { closeMenus(); return; }
      if (next) { e.preventDefault(); next.focus(); }
    });
  }

  // ------------------------------------------------------------------- tabs
  const tablist = document.querySelector('nav.tabs .tab-row');
  if (tablist) {
    tablist.setAttribute('role', 'tablist');
    const tabs = [...tablist.querySelectorAll('.tab')];
    const sync = () => {
      for (const tab of tabs) {
        const on = tab.classList.contains('active');
        tab.setAttribute('aria-selected', String(on));
        tab.tabIndex = on ? 0 : -1;
      }
    };
    for (const tab of tabs) {
      const panel = document.getElementById(`tab-${tab.dataset.tab}`);
      tab.id ||= `tabbtn-${tab.dataset.tab}`;
      tab.setAttribute('role', 'tab');
      if (panel) { tab.setAttribute('aria-controls', panel.id); panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', tab.id); }
      new MutationObserver(sync).observe(tab, { attributes: true, attributeFilter: ['class'] });
      tab.addEventListener('keydown', (e) => {
        const i = tabs.indexOf(tab);
        const go = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
        if (go === undefined) return;
        e.preventDefault();
        const next = tabs[(go + tabs.length) % tabs.length];
        next.click();
        next.focus();
      });
    }
    sync();
  }

  // ------------------------------------------------------ the 3D view and the page
  canvas?.setAttribute('role', 'img');
  const relabel = () => {
    canvas?.setAttribute('aria-label', t('a11y.canvas'));
    tablist?.setAttribute('aria-label', t('a11y.tabs'));
    document.querySelector('#left-panel')?.setAttribute('aria-label', t('a11y.left'));
    document.querySelector('#right-panel')?.setAttribute('aria-label', t('a11y.right'));
    document.querySelector('header.toolbar')?.setAttribute('aria-label', t('a11y.toolbar'));
    // names taken from tooltips follow the language too
    for (const el of document.querySelectorAll('[data-a11y-title]')) el.removeAttribute('aria-label');
  };
  relabel();

  // ----------------------------------------- names for symbol buttons and tooltip-only fields
  // A button whose text is only a symbol (✎ ✕ ⤢ ▸ …) and a field with no label of its own get
  // their tooltip as their accessible name. Cards are rendered again often: watched.
  const named = (el) => el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby');
  const fix = (root) => {
    for (const b of root.querySelectorAll('button[title]')) {
      if (named(b)) continue;
      const text = b.textContent.replace(/\s+/g, '');
      if (!/[\p{L}\p{N}]{2,}/u.test(text)) { b.setAttribute('aria-label', b.title); b.dataset.a11yTitle = ''; }
    }
    // a row on a card: a <label> text next to its field (not wrapped around it)
    for (const f of root.querySelectorAll('.card-row > input, .card-row > select, .card-row > textarea')) {
      if (named(f) || f.labels?.length) continue;
      const lab = f.parentElement.querySelector(':scope > label');
      if (lab && !lab.control && lab.textContent.trim()) { f.setAttribute('aria-label', lab.textContent.trim()); f.dataset.a11yTitle = ''; }
    }
    for (const f of root.querySelectorAll('input[title], select[title], textarea[title]')) {
      if (named(f) || f.labels?.length) continue;
      f.setAttribute('aria-label', f.title);
      f.dataset.a11yTitle = '';
    }
  };
  fix(document);
  let pending = false;
  new MutationObserver(() => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; fix(document); });
  }).observe(document.body, { childList: true, subtree: true });

  // ------------------------------------------------ the toolbar scrolls sideways on phones
  // a fade at the edge that has more buttons, so it is clear the bar scrolls
  const bar = document.querySelector('header.toolbar');
  if (bar) {
    const edges = () => {
      bar.classList.toggle('more-left', bar.scrollLeft > 4);
      bar.classList.toggle('more-right', bar.scrollLeft + bar.clientWidth < bar.scrollWidth - 4);
    };
    bar.addEventListener('scroll', edges, { passive: true });
    window.addEventListener('resize', edges);
    new ResizeObserver(edges).observe(bar);
    edges();
  }
  return { relabel: () => { relabel(); fix(document); } };
}
