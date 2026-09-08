/* MSInstall — « L'application Muse Square » sur le téléphone (owner 08/09).
   Un seul bouton, « Installer », montré seulement là où il installe pour de vrai : navigateurs Chromium
   (Chrome, Edge, Samsung, Opera) sur Android et sur ordinateur, via beforeinstallprompt → feuille native.
   iPhone / iPad : RIEN. Apple n'offre aucune API d'installation ; les consignes affichées (08/09) ont été
   retirées le jour même — « une consigne qui ressemble à un menu et ne réagit pas trompe » (owner). Le
   geste reste possible dans Safari (Partager → Sur l'écran d'accueil), montré au client à l'onboarding.
   Firefox et app déjà installée (display-mode standalone) : rien.
   Deux montages : la section Compte (mountButton) et la bandelette au-dessus de la barre basse (mountStrip,
   < 768 px, fermeture mémorisée 14 jours). Styles inline : HTML injecté. */
(function () {
  "use strict";
  var deferred = null, installed = false, forced = null, mounts = [];
  var ua = navigator.userAgent || "";
  var standalone = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
  /* Fermeture de la bandelette : mémorisée par appareil, expire après 14 jours (usage des invites d'installation).
     Nouvelle clé le 08/09 : les fermetures de la première version ne comptent plus. */
  var STRIP_KEY = "ms-install-strip-dismissed-at", STRIP_TTL = 14 * 24 * 3600 * 1000;

  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); deferred = e; refresh(); });
  window.addEventListener("appinstalled", function () { installed = true; deferred = null; refresh(); });

  function mode() {
    if (forced) return forced;
    if (standalone || installed) return "none";
    if (deferred) return "prompt";
    return "none";
  }

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

  function render(m) {
    var show = mode() !== "none";
    if (m.kind === "button") {
      m.el.innerHTML = show ? buttonHtml() : "";
      if (m.section) m.section.hidden = !show;
    } else if (m.kind === "strip") {
      var dismissed = false;
      try { var at = parseInt(localStorage.getItem(STRIP_KEY) || "0", 10); dismissed = at > 0 && (Date.now() - at) < STRIP_TTL; } catch (e) {}
      var narrow = window.innerWidth < 768;
      var on = show && !dismissed && narrow;
      if (!on) { m.el.innerHTML = ""; m.el.hidden = true; return; }
      m.el.hidden = false;
      m.el.innerHTML =
        '<div style="position:fixed;left:0;right:0;bottom:calc(var(--ms-bb-h,0px) + env(safe-area-inset-bottom,0px));z-index:69;background:#fff;border-top:1px solid rgba(17,24,39,.1);padding:10px 12px 10px 16px;display:flex;align-items:center;gap:12px;">' +
          '<img src="' + (m.icon || "/icons/pwa/icon-192.png") + '" alt="" width="36" height="36" style="width:36px;height:36px;border-radius:8px;flex:none;" />' +
          '<span style="flex:1;font-size:14px;color:#111827;font-weight:600;">Muse Square</span>' + buttonHtml("height:36px;padding:0 16px;") +
          '<button type="button" data-ms-install-dismiss aria-label="Fermer" style="width:36px;height:36px;border:0;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;flex:none;">' + SVG_X + '</button>' +
        '</div>';
    }
    var b = m.el.querySelector("[data-ms-install]"); if (b) b.addEventListener("click", onInstallClick);
    var d = m.el.querySelector("[data-ms-install-dismiss]"); if (d) d.addEventListener("click", function () { try { localStorage.setItem(STRIP_KEY, String(Date.now())); } catch (e) {} render(m); });
  }
  function refresh() { for (var i = 0; i < mounts.length; i++) render(mounts[i]); }

  window.MSInstall = {
    mode: mode,
    /* Section Compte : el reçoit le bouton ; section (optionnel) est masquée quand rien ne peut agir. */
    mountButton: function (el, opts) { var m = { kind: "button", el: el, section: opts && opts.section }; mounts.push(m); render(m); return m; },
    /* Bandelette au-dessus de la barre basse, téléphone seulement. */
    mountStrip: function (el, opts) { var m = { kind: "strip", el: el, icon: opts && opts.icon }; mounts.push(m); render(m); window.addEventListener("resize", function () { render(m); }); return m; },
    /* Harnais : forcer un mode ("prompt" | "none") pour vérifier les rendus sans le navigateur cible. */
    force: function (m) { forced = m; refresh(); },
    reset: function () { try { localStorage.removeItem(STRIP_KEY); } catch (e) {} refresh(); }
  };
})();
