/* MSInstall — « L'application Muse Square » sur le téléphone (owner 08/09).
   Un seul bouton, « Installer », qui n'apparaît que là où il peut agir :
   - navigateurs Chromium (Chrome, Edge, Samsung, Opera) : beforeinstallprompt → feuille native ;
   - iPhone / iPad (tous navigateurs = WebKit, sans API) : un panneau qui ne porte que les deux
     libellés d'Apple, « Partager » et « Sur l'écran d'accueil », avec leurs icônes ;
   - Firefox (aucun événement d'installation) et app déjà installée (display-mode standalone) : rien.
   Deux montages : la section Compte (mountButton) et la bandelette au-dessus de la barre basse
   (mountStrip, < 768 px, fermeture mémorisée par appareil). Styles inline : HTML injecté. */
(function () {
  "use strict";
  var deferred = null, installed = false, forced = null, mounts = [], panel = null;
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

  function openPanel(anchor) {
    closePanel();
    var wrap = document.createElement("div");
    wrap.setAttribute("data-ms-install-panel", "");
    wrap.style.cssText = "position:fixed;inset:0;z-index:90;background:rgba(17,24,39,.35);display:flex;align-items:flex-end;justify-content:center;";
    wrap.innerHTML =
      '<div role="dialog" aria-label="Sur l\'écran d\'accueil" style="width:100%;max-width:480px;background:#fff;border-radius:14px 14px 0 0;padding:18px 18px calc(18px + env(safe-area-inset-bottom,0px));box-shadow:0 -4px 24px rgba(16,24,40,.12);">' +
        '<div style="display:flex;align-items:center;gap:14px;padding:12px 6px;border-bottom:1px solid #F3F4F6;">' + SVG_SHARE + '<span style="font-size:16px;color:#111827;">Partager</span></div>' +
        '<div style="display:flex;align-items:center;gap:14px;padding:12px 6px;">' + SVG_ADD + '<span style="font-size:16px;color:#111827;">Sur l\'écran d\'accueil</span></div>' +
        '<button type="button" data-ms-install-close aria-label="Fermer" style="position:absolute;top:10px;right:10px;width:36px;height:36px;border:0;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;">' + SVG_X + '</button>' +
      '</div>';
    wrap.firstChild.style.position = "relative";
    wrap.addEventListener("click", function (e) { if (e.target === wrap || e.target.closest("[data-ms-install-close]")) closePanel(); });
    document.body.appendChild(wrap);
    panel = wrap;
  }
  function closePanel() { if (panel && panel.parentNode) panel.parentNode.removeChild(panel); panel = null; }

  function onInstallClick(ev) {
    var m = mode();
    if (m === "prompt" && deferred) {
      var p = deferred; deferred = null;
      p.prompt();
      if (p.userChoice && p.userChoice.then) p.userChoice.then(function () { refresh(); });
      return;
    }
    if (m === "ios" || (forced === "ios")) { openPanel(ev.currentTarget); }
  }

  function render(m) {
    var show = mode() !== "none";
    if (m.kind === "button") {
      m.el.innerHTML = show ? buttonHtml() : "";
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
          '<span style="flex:1;font-size:14px;color:#111827;font-weight:600;">Muse Square</span>' +
          buttonHtml("height:36px;padding:0 16px;") +
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
