(function () {
  var T = {
    da: { title: 'Station 0+404 ligger ikke på linjeføringen.', open: 'Åbn Vispecta', about: 'Om Vispecta', doc: 'Siden findes ikke – Vispecta' },
    de: { title: 'Station 0+404 liegt nicht auf der Achse.', open: 'Vispecta öffnen', about: 'Über Vispecta', doc: 'Seite nicht gefunden – Vispecta' }
  };
  var lang = '';
  try { lang = localStorage.getItem('onlineifc.lang') || ''; } catch (e) { /* ignore */ }
  if (!T[lang]) lang = (navigator.language || 'en').slice(0, 2).toLowerCase();
  var d = T[lang];
  if (d) {
    document.documentElement.lang = lang;
    document.title = d.doc;
    var els = document.querySelectorAll('[data-t]');
    for (var i = 0; i < els.length; i++) { var k = els[i].getAttribute('data-t'); if (d[k]) els[i].textContent = d[k]; }
  }
})();
