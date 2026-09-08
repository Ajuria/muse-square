/* MSInstall — « L'application Muse Square » sur le téléphone (owner 08/09).
   - Navigateurs Chromium (Chrome, Edge, Samsung, Opera) : un bouton « Installer » → feuille d'installation native.
   - iPhone / iPad (WebKit, aucune API d'installation, aucun bouton possible) : PAS de bouton — les deux étapes
     d'Apple, affichées telles quelles avec leurs icônes : 1 Partager · 2 Sur l'écran d'accueil (Chrome iOS :
     « Ajouter à l'écran d'accueil »). Rien d'écrit par nous. C'est le motif standard des apps web sur iOS.
   - Firefox (aucun événement) et app déjà installée (display-mode standalone) : rien.
   Deux montages : la section Compte (mountButton) et la bandelette au-dessus de la barre basse (mountStrip,
   < 768 px, fermeture mémorisée par appareil). Styles inline : HTML injecté. */
(function () {
  "use strict";
  var deferred = null, installed = false, forced = null, mounts = [];
  var ua = navigator.userAgent || "";
  var isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var standalone = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
  var STRIP_KEY = "ms-install-strip-dismissed";

  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); deferred = e; refresh(); });
  window.addEventListener("appinstalled", function () { installed = true; deferred = null; refresh(); });

  function mode() {
    if (forced) return forced;
    if (standalone || installed) return "none";
    if (deferred) return "prompt";
    if (isIOS) return "ios";
    return "none";
  }

  var SVG_SHARE = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1D3BB3" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3"/><path d="m8 7 4-4 4 4"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/></svg>';
  var SVG_ADD = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1D3BB3" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>';
  var SVG_X = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6B7280" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';

  function buttonHtml(extra) {
    return '<button type="button" data-ms-install style="display:inline-flex;align-items:center;justify-content:center;height:40px;padding:0 18px;border:1px solid #111827;border-radius:2px;background:#111827;color:#fff;font:600 14px/1 inherit;cursor:pointer;' + (extra || "") + '">Installer</button>';
  }

  function onInstallClick() {
    if (mode() === "prompt" && deferred) {
      var p = deferred; deferred = null;
      p.prompt();
      if (p.userChoice && p.userChoice.then) p.userChoice.then(function () { refresh(); });
    }
  }

  /* iPhone : les deux étapes d'Apple, numérotées, libellé du navigateur ouvert. compact = bandelette. */
  function stepsHtml(compact) {
    var step2 = /CriOS/.test(ua) ? "Ajouter à l'écran d'accueil" : "Sur l'écran d'accueil";
    var num = function (n) { return '<span style="flex:none;width:20px;height:20px;border-radius:50%;background:#EEF2FF;color:#1D3BB3;font-size:11px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;">' + n + '</span>'; };
    var row = function (n, svg, txt) { return '<div style="display:flex;align-items:center;gap:10px;padding:' + (compact ? '3px 0' : '10px 0') + ';font-size:' + (compact ? '13px' : '15px') + ';color:#111827;">' + num(n) + svg + '<span>' + txt + '</span></div>'; };
    return '<div style="display:flex;flex-direction:column;' + (compact ? 'gap:2px;' : 'gap:0;') + '">' + row(1, SVG_SHARE, "Partager") + row(2, SVG_ADD, step2) + '</div>';
  }

  function render(m) {
    var show = mode() !== "none";
    if (m.kind === "button") {
      m.el.innerHTML = !show ? "" : (mode() === "ios" ? stepsHtml(false) : buttonHtml());
      if (m.section) m.section.hidden = !show;
    } else if (m.kind === "strip") {
      var dismissed = false;
      try { dismissed = localStorage.getItem(STRIP_KEY) === "1"; } catch (e) {}
      var narrow = window.innerWidth < 768;
      var on = show && !dismissed && narrow;
      if (!on) { m.el.innerHTML = ""; m.el.hidden = true; return; }
      m.el.hidden = false;
      m.el.innerHTML =
        '<div style="position:fixed;left:0;right:0;bottom:calc(var(--ms-bb-h,0px) + env(safe-area-inset-bottom,0px));z-index:69;background:#fff;border-top:1px solid rgba(17,24,39,.1);padding:10px 12px 10px 16px;display:flex;align-items:center;gap:12px;">' +
          '<img src="' + (m.icon || "/icons/pwa/icon-192.png") + '" alt="" width="36" height="36" style="width:36px;height:36px;border-radius:8px;flex:none;" />' +
          (mode() === "ios"
            ? '<div style="flex:1;min-width:0;">' + stepsHtml(true) + '</div>'
            : '<span style="flex:1;font-size:14px;color:#111827;font-weight:600;">Muse Square</span>' + buttonHtml("height:36px;padding:0 16px;")) +
          '<button type="button" data-ms-install-dismiss aria-label="Fermer" style="width:36px;height:36px;border:0;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;flex:none;">' + SVG_X + '</button>' +
        '</div>';
    }
    var b = m.el.querySelector("[data-ms-install]"); if (b) b.addEventListener("click", onInstallClick);
    var d = m.el.querySelector("[data-ms-install-dismiss]"); if (d) d.addEventListener("click", function () { try { localStorage.setItem(STRIP_KEY, "1"); } catch (e) {} render(m); });
  }
  function refresh() { for (var i = 0; i < mounts.length; i++) render(mounts[i]); }

  window.MSInstall = {
    mode: mode,
    /* Section Compte : el reçoit le bouton ; section (optionnel) est masquée quand rien ne peut agir. */
    mountButton: function (el, opts) { var m = { kind: "button", el: el, section: opts && opts.section }; mounts.push(m); render(m); return m; },
    /* Bandelette au-dessus de la barre basse, téléphone seulement. */
    mountStrip: function (el, opts) { var m = { kind: "strip", el: el, icon: opts && opts.icon }; mounts.push(m); render(m); window.addEventListener("resize", function () { render(m); }); return m; },
    /* Harnais : forcer un mode ("prompt" | "ios" | "none") pour vérifier les rendus sans le navigateur cible. */
    force: function (m) { forced = m; refresh(); },
    reset: function () { try { localStorage.removeItem(STRIP_KEY); } catch (e) {} refresh(); }
  };
})();
