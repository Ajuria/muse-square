/* ms-loader.js — canonical Muse Square page loader.
 *
 * ONE loader shared by every app surface: the branded gif + a page-specific, rotating label that
 * reflects the work actually being done (not a generic "Chargement…"). Pages call
 * MSLoader.html(pageKey) wherever they used to hand-roll a loader; a single global ticker rotates
 * every visible label through its page's message list, so call sites never manage their own interval.
 *
 * Styling lives in global.css (.ms-loader / .ms-loader__gif / .ms-loader__msg) so it's consistent and
 * uses the brand font. See also src/layouts/BaseLayout.astro (corner loader now app-suppressed).
 */
(function () {
  // Central per-page message map. Keep each list SHORT (2-4) and true to that page's real work.
  var MSGS = {
    pulse: [
      "Analyse de votre environnement…",
      "Recherche du contexte local (web)…",
      "Comparaison à vos jours similaires…",
      "Consolidation de votre veille…",
    ],
    monitor: [
      "Chargement de votre suivi…",
      "Analyse des risques du jour…",
      "Recherche du contexte local…",
      "Consolidation de vos signaux…",
    ],
    insight: [
      "Lecture du signal…",
      "Analyse de vos ventes…",
      "Recherche de vos jours similaires…",
      "Recherche du contexte local (web)…",
    ],
    days: [
      "Chargement de vos journées…",
      "Analyse des opportunités…",
      "Lecture de votre calendrier…",
    ],
    month: [
      "Chargement du mois…",
      "Analyse des tendances…",
      "Consolidation du calendrier…",
    ],
    competitor: [
      "Chargement du profil concurrent…",
      "Analyse de la pression concurrentielle…",
    ],
    events: [
      "Chargement des événements…",
      "Analyse du paysage événementiel…",
    ],
    suivis: [
      "Chargement de vos suivis…",
      "Lecture de vos engagements…",
    ],
    engagement: [
      "Chargement de l’évolution…",
      "Mesure de vos progrès…",
    ],
    reactions: [
      "Chargement des réactions…",
    ],
    "family-report": [
      "Génération du rapport…",
      "Consolidation des données…",
    ],
    prompt: [
      "Analyse en cours…",
      "Recherche du contexte…",
      "Rédaction de la réponse…",
    ],
    "default": ["Chargement…"],
  };

  function escAttr(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  }

  // Returns the loader markup as a string (for the many innerHTML call sites).
  // opts.size overrides the gif height (px); opts.padding overrides vertical padding.
  function html(key, opts) {
    opts = opts || {};
    var k = MSGS[key] ? key : "default";
    var first = MSGS[k][0];
    var gifStyle = opts.size ? ' style="height:' + Number(opts.size) + 'px;"' : "";
    var wrapStyle = opts.padding != null ? ' style="padding:' + escAttr(opts.padding) + ';"' : "";
    return (
      '<div class="ms-loader"' + wrapStyle + ' role="status" aria-live="polite">' +
      '<img class="ms-loader__gif"' + gifStyle + ' src="/icons/load/ms_load_icon.gif" alt="" />' +
      '<div class="ms-loader__msg" data-ms-loader="' + escAttr(k) + '" data-ms-i="0">' + first + "</div>" +
      "</div>"
    );
  }

  // Convenience: inject into a container and return it.
  function mount(container, key, opts) {
    if (!container) return null;
    container.innerHTML = html(key, opts);
    return container;
  }

  // Single global ticker: advance every visible loader label to the next message in its page's list.
  // Per-element index kept in data-ms-i so multiple loaders stay independent.
  function tick() {
    var els = document.querySelectorAll(".ms-loader__msg[data-ms-loader]");
    for (var n = 0; n < els.length; n++) {
      var el = els[n];
      var key = el.getAttribute("data-ms-loader");
      var msgs = MSGS[key] || MSGS["default"];
      if (!msgs || msgs.length < 2) continue;
      var i = (parseInt(el.getAttribute("data-ms-i") || "0", 10) + 1) % msgs.length;
      el.setAttribute("data-ms-i", String(i));
      el.textContent = msgs[i];
    }
  }
  if (!window.__msLoaderTicker) {
    window.__msLoaderTicker = window.setInterval(tick, 1800);
  }

  window.MSLoader = { html: html, mount: mount, msgs: MSGS };
})();
