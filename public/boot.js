// Runs first, in the page head (a file of its own: the Content Security Policy allows no inline scripts, #64).

// Apply the saved theme before the page is drawn (avoids a white flash in dark mode)
try {
  var th = localStorage.getItem('onlineifc.theme');
  document.documentElement.dataset.theme = th === 'dark' || th === 'light' ? th : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
} catch (e) { /* ignore */ }

// Phones land on the about page the first time; "Open Vispecta" there (?app) opens the viewer
// and is remembered, so later visits open the viewer straight away. Installed apps, links
// with a hash or a query and computers always open the viewer.
(function () {
  try {
    var KEY = 'onlineifc.openedApp';
    if (/[?&]app\b/.test(location.search)) {
      localStorage.setItem(KEY, '1');
      history.replaceState(null, '', location.pathname + location.hash);
      return;
    }
    var phone = matchMedia('(max-width: 760px) and (pointer: coarse)').matches;
    var installed = matchMedia('(display-mode: standalone)').matches;
    if (phone && !installed && !location.search && !location.hash && localStorage.getItem(KEY) !== '1') location.replace('./about/');
  } catch (e) { /* storage blocked: stay in the viewer */ }
})();
