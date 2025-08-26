(function () {
  function send(name, props = {}) {
    if (window.plausible) window.plausible(name, { props });
  }
  // Drapeaux data-kpi="..."
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-kpi]');
    if (!el) return;
    send(el.getAttribute('data-kpi'));
  });
  // Téléchargements PDF
  document.querySelectorAll('a[href$=".pdf"]').forEach((a) => {
    a.addEventListener('click', () => send('download_pdf', { href: a.getAttribute('href') }));
  });
  // Calendly (widget)
  window.addEventListener('message', function (e) {
    if (e?.data?.event === 'calendly.event_scheduled') { send('calendly_booked'); }
  });
})();
