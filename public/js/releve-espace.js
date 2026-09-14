// MSReleve — LE RELEVÉ DE L'ESPACE, la marche dans le magasin (docs/marche-guidee-spec.md, owner 11-12/09).
//
// Ce module est le proto `tools/proto/releve-espace-proto.html` (v2, vérifié au harnais déterministe le
// 12/09) DEVENU une page de l'app : la détection d'arrêt, le viseur, la bande des cartes, les problèmes
// affichés dans le viseur et la page de fin sont PORTÉS À L'IDENTIQUE — mêmes seuils, même hystérésis,
// mêmes identifiants de nœuds — pour que la vérification du 12/09 continue de valoir. Ce qui change, et
// c'est tout ce qui change :
//   · les pôles ne sont plus une liste tapée dans les réglages : ce sont CEUX DU COMPTE, avec leurs
//     composants de la version courante, posés par la page (`window.MSReleve.poles`) ;
//   · une photo gardée s'ENVOIE (le proto n'écrivait rien) : l'exploitant touche le composant, le POST
//     part par le foyer unique `MSPhotoCapture.envoyer` (public/js/photo-capture.js) ;
//   · AU POINT FOCAL, UNE VRAIE PHOTO EST DÉCLENCHÉE (owner 14/09) : `ImageCapture.takePhoto()` sur le
//     flux déjà autorisé, donc le pipeline photo de l'appareil et non une image du flux vidéo. L'image
//     du flux est gardée d'abord et remplacée à l'arrivée ; si takePhoto manque ou échoue, elle reste.
//     Et le plafond de taille est celui du MODÈLE qui lit la photo (2 576 px / 4 784 jetons), plus le
//     1 600 px du proto — qui jetait du détail sous le palier de l'API ;
//   · les chaînes visibles viennent du foyer du lexique (EVOL_COPY, `releve_*`), jamais du module.
//
// CE QUI N'EST PAS DANS CET INCRÉMENT (spec § 9 point 4, et il faut le savoir avant de marcher) :
// `walk_id`, `seq`, `t_offset_s` ne partent pas encore (les colonnes existent, la route ne les prend
// pas), il n'y a pas de `families_share`, pas de table des marches, et SURTOUT la clé de composant
// n'est pas CRÉÉE à l'arrivée de la photo (spec § 6) : la route refuse une clé hors de la version
// (`component_key inconnu pour cette version`), donc une photo se rattache à un composant DÉJÀ
// déclaré. Sur le compte de l'owner, les 52 composants du plan le sont.
//
// Harnais (inchangés depuis le proto) : window.__releveSource (un canvas au lieu de la caméra),
// __releveStep(dt) (un pas d'analyse à dt imposé), __releveState(), __releveAttach(stream).
(function () {
  "use strict";
  var DEFAULTS = { tMove: 6, tStill: 2.5, stillMs: 1500, winMs: 1200, sharpMin: 100, brightMin: 40 };
  // ── LE PLAFOND D'UNE PHOTO EST CELUI DU MODÈLE QUI LA LIT (14/09) ────────────────────────────────
  // La route fait lire la photo par le rôle `packager` = claude-sonnet-5 (lib/ai/models.ts), donc le
  // palier HAUTE RÉSOLUTION de l'API : 2 576 px de grand côté, 4 784 jetons visuels, un jeton par
  // carreau de 28 px (⌈l/28⌉ × ⌈h/28⌉). Au-delà, l'API réduit elle-même — et une réduction côté API
  // rend le texte des étiquettes illisible. Le proto plafonnait à 1 600 px : sous le palier, donc du
  // détail jeté pour rien. On envoie la plus grande image qui tient sous LES DEUX bornes.
  // Borne de poids : PHOTO_MAX_BYTES = 1 500 000 o côté route ; la qualité descend d'un cran plutôt
  // que l'image, parce que les étiquettes se lisent à la RÉSOLUTION, pas au taux de compression.
  var CAP = { edge: 2576, tokens: 4784, patch: 28, marge: 0.98, bytes: 1400000 };
  function echelle(w, h) {
    if (!w || !h) return 1;
    var parJetons = Math.sqrt((CAP.tokens * CAP.patch * CAP.patch) / (w * h)) * CAP.marge;
    return Math.min(1, CAP.edge / Math.max(w, h), parJetons);
  }
  // Un data: URL sous la borne de poids. On baisse la qualité, jamais la taille.
  function encoder(cv) {
    var q = [0.82, 0.72, 0.62, 0.5], url = "";
    for (var i = 0; i < q.length; i++) {
      url = cv.toDataURL("image/jpeg", q[i]);
      if (url.length * 0.75 <= CAP.bytes) return url;
    }
    return url;
  }
  var LS = "ms-releve-reglages";
  var IN = window.MSReleve || {};
  var POLES = Array.isArray(IN.poles) ? IN.poles.filter(function (p) { return p && p.dispositif_id; }) : [];
  var C = IN.copy || {};
  var t = function (k) { return C[k] || ""; };
  var cfg = load();
  var $ = function (id) { return document.getElementById(id); };
  var video = $("cam"), ring = $("ring"), overlay = $("overlay"), idle = $("idle"), stage = $("stage"), mainBtn = $("mainBtn"), band = $("band");

  var run = { phase: "idle", startedAt: null, t0: 0, pole: null, items: [], switches: [], problems: [], seq: 0, camera: "none" };
  var det = { prev: null, state: "moving", stillAcc: 0, keptAt: 0, armed: true, best: null, problem: null, lastM: 0, lastS: 0, tick: 0, ticks: 0, lastError: null };

  function load() {
    var c = {}; try { c = JSON.parse(localStorage.getItem(LS) || "{}"); } catch (e) { c = {}; }
    return { tMove: num(c.tMove, DEFAULTS.tMove), tStill: num(c.tStill, DEFAULTS.tStill), stillMs: num(c.stillMs, DEFAULTS.stillMs), winMs: nonneg(c.winMs, DEFAULTS.winMs), sharpMin: nonneg(c.sharpMin, DEFAULTS.sharpMin), brightMin: nonneg(c.brightMin, DEFAULTS.brightMin) };
  }
  function num(v, d) { var n = Number(v); return isFinite(n) && n > 0 ? n : d; }
  function nonneg(v, d) { var n = Number(v); return isFinite(n) && n >= 0 ? n : d; }
  function save() { try { localStorage.setItem(LS, JSON.stringify(cfg)); } catch (e) {} }
  function now() { return performance.now(); }
  function tOff() { return run.t0 ? Math.round((det.tick || now()) - run.t0) / 1000 : 0; }
  function pad(n) { return n < 10 ? "0" + n : String(n); }
  function fmtT(s) { var m = Math.floor(s / 60); return m + ":" + pad(Math.floor(s - m * 60)); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]; }); }
  function nPhotos(n) { return n === 0 ? t("releve_aucune_photo") : n === 1 ? t("releve_une_photo") : t("releve_n_photos").replace("{n}", String(n)); }
  function poleByName(name) { for (var i = 0; i < POLES.length; i++) if (POLES[i].name === name) return POLES[i]; return null; }
  function compLabel(c) { return c.label || c.type_label_fr || c.component_key; }

  // ── pôles : ceux du compte, le geste décide (spec M5) ──────────────────────
  function renderPoles() {
    var nav = $("poles"); nav.innerHTML = "";
    POLES.forEach(function (p) {
      var b = document.createElement("button"); b.type = "button"; b.textContent = p.name;
      if (p.name === run.pole) b.className = "on";
      b.addEventListener("click", function () { switchPole(p.name); });
      nav.appendChild(b);
    });
    $("poleName").textContent = run.pole || "—";
    var n = run.items.filter(function (i) { return !i.removed && i.pole === run.pole; }).length;
    $("poleCount").hidden = !run.pole; $("poleCount").textContent = nPhotos(n);
  }
  function switchPole(p) {
    if (p === run.pole) return;
    if (run.phase === "running") run.switches.push({ t: tOff(), from: run.pole, to: p });
    run.pole = p; renderPoles();
  }

  // ── commencer / fin ────────────────────────────────────────────────────────
  var stream = null, timer = null;
  function start() {
    run.phase = "running";
    if (!run.startedAt) { run.startedAt = new Date().toISOString(); run.t0 = det.tick || now(); det.tick = run.t0; } else { det.tick = Math.max(det.tick || 0, now()); }
    mainBtn.textContent = t("releve_fin"); mainBtn.hidden = false; stage.hidden = false; $("poles").hidden = false; idle.style.display = "none"; $("summary").style.display = "none"; $("strip").style.display = ""; tickClock();
    if (window.__releveSource) { stream = true; run.camera = "injected"; return; }
    startCamera();
  }
  function stop() {
    run.phase = "ended"; mainBtn.hidden = true; stage.hidden = true; $("poles").hidden = true;
    if (timer) { clearInterval(timer); timer = null; }
    if (stream && stream.getTracks) { stream.getTracks().forEach(function (x) { x.stop(); }); }
    stream = null; video.srcObject = null; idle.style.display = "flex"; hideOverlay(); tickClock(); placeBand();
    showSummary();
  }
  mainBtn.addEventListener("click", function () { if (run.phase === "running") stop(); else start(); });
  $("sumBack").addEventListener("click", function () { start(); });

  function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { return useFallback("getUserMedia absent"); }
    // 3840 x 2160 DEMANDÉS (14/09) : le navigateur donne le plus proche que la caméra sache faire. Ça
    // ne sert pas l'analyse (elle travaille sur 64 px de gris) mais le REPLI, quand takePhoto() manque.
    navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 3840 }, height: { ideal: 2160 } } })
      .then(function (s) { attach(s); })
      .catch(function (e) { useFallback(e && e.name ? e.name : String(e)); });
  }
  // ── UNE VRAIE PHOTO AU POINT FOCAL (owner 14/09) ─────────────────────────────────────────────────
  // `ImageCapture.takePhoto()` prend une exposition par le PIPELINE PHOTO de l'appareil (résolution du
  // mode photo, exposition, traitement), pas une image du flux vidéo. Supporté par Safari depuis 18.4
  // et hérité par iOS (données de compatibilité MDN), Chrome depuis 60 ; absent ailleurs, d'où le repli.
  // Il ne demande aucun geste : l'autorisation du flux vaut déjà, et c'est ce qui permet de le déclencher
  // sur la détection d'arrêt. Le prix : quelques centaines de ms et, sur certains appareils, un
  // clignotement du viseur — c'est pourquoi l'image du flux est gardée D'ABORD et remplacée ensuite.
  var appareil = null;
  function attach(s) {
    stream = s; video.srcObject = s; run.camera = "stream"; video.play().catch(function () {});
    appareil = null;
    try {
      var piste = s.getVideoTracks ? s.getVideoTracks()[0] : null;
      if (piste && window.ImageCapture) { appareil = new window.ImageCapture(piste); run.camera = "stream+photo"; }
    } catch (e) { appareil = null; }
    hideOverlay(); requestWakeLock(); loop();
  }
  // Remplace l'image du flux par la vraie photo, quand elle arrive. Jamais bloquant : si takePhoto
  // échoue (absent, refusé, piste occupée), la photo du flux reste — rien n'est perdu.
  function vraiePhoto(it) {
    if (!appareil || !it) return;
    appareil.takePhoto()
      .then(function (blob) { return createImageBitmap(blob); })
      .then(function (bmp) {
        var w = bmp.width, h = bmp.height, k = echelle(w, h);
        full.width = Math.round(w * k); full.height = Math.round(h * k);
        fctx.drawImage(bmp, 0, 0, full.width, full.height);
        var mw = 320, mh = Math.round(mw * h / w); mid.width = mw; mid.height = mh; mctx.drawImage(bmp, 0, 0, mw, mh);
        var g = gray(mctx, mw, mh);
        it.dataUrl = encoder(full); it.w = full.width; it.h = full.height;
        it.sharp = Math.round(lapVar(g, mw, mh)); it.bright = Math.round(mean(g));
        it.source = "photo"; it.photo_w = w; it.photo_h = h;
        if (bmp.close) bmp.close();
        renderStrip();
      })
      .catch(function (e) { it.photo_echec = String(e && e.name || e); renderStrip(); });
  }
  function useFallback(reason) {
    run.camera = "file:" + reason; ring.style.display = "none";
    showOverlay(t("releve_camera_ko"), t("releve_camera_ko_texte"), true);
  }
  function requestWakeLock() { try { if (navigator.wakeLock) navigator.wakeLock.request("screen").catch(function () {}); } catch (e) {} }

  // ── viseur : un problème s'affiche DEDANS, et se règle d'un toucher ────────
  function showOverlay(titre, texte, withFile) { $("ovTitle").textContent = titre; $("ovText").textContent = texte; $("ovFile").hidden = !withFile; overlay.style.display = "flex"; }
  function hideOverlay() { overlay.style.display = "none"; }
  overlay.addEventListener("click", function (ev) {
    if (ev.target.closest("#ovFile")) return;
    if (det.problem && det.best) { var b = det.best; commit(b, true, det.problem.reason); det.problem.kept = true; run.problems.push(det.problem); det.problem = null; det.best = null; det.armed = false; hideOverlay(); ring.className = "kept"; }
  });
  stage.addEventListener("click", function (ev) {
    if (ev.target.closest("#overlay") || ev.target.closest("#poleChip")) return;
    if (run.phase !== "running" || !stream || !srcW()) return;
    commit(grab(), true, null); det.armed = false; ring.className = "kept";
  });

  // ── analyse — PORTÉE À L'IDENTIQUE du proto v2 (vérifiée le 12/09) ─────────
  var work = document.createElement("canvas"), wctx = work.getContext("2d", { willReadFrequently: true });
  var full = document.createElement("canvas"), fctx = full.getContext("2d");
  var mid = document.createElement("canvas"), mctx = mid.getContext("2d", { willReadFrequently: true });
  var W = 64;
  function src() { return window.__releveSource || video; }
  function srcW() { var v = src(); return v.videoWidth || v.width || 0; }
  function srcH() { var v = src(); return v.videoHeight || v.height || 0; }
  function gray(ctx, w, h) { var d = ctx.getImageData(0, 0, w, h).data, out = new Float32Array(w * h); for (var i = 0, j = 0; i < d.length; i += 4, j++) out[j] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; return out; }
  function motion(a, b) { if (!a || !b || a.length !== b.length) return 99; var s = 0; for (var i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; }
  function lapVar(g, w, h) { var n = 0, s = 0, s2 = 0; for (var y = 1; y < h - 1; y++) for (var x = 1; x < w - 1; x++) { var i = y * w + x; var v = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w]; s += v; s2 += v * v; n++; } var m = s / n; return s2 / n - m * m; }
  function mean(g) { var s = 0; for (var i = 0; i < g.length; i++) s += g[i]; return s / g.length; }

  var BAND_RATIO = 420 / 960;
  function placeBand() {
    var vw = srcW(), vh = srcH(), sw = stage.clientWidth, sh = stage.clientHeight;
    if (run.phase !== "running" || !stream || !vw || !vh || !sw || !sh) { band.style.display = "none"; return; }
    var k = Math.max(sw / vw, sh / vh), bh = Math.min(sh, vw * k * BAND_RATIO);
    band.style.top = Math.round((sh - bh) / 2) + "px"; band.style.height = Math.round(bh) + "px"; band.style.display = "block";
  }
  video.addEventListener("loadedmetadata", placeBand);
  window.addEventListener("resize", placeBand);

  function loop() {
    if (timer) return;
    timer = setInterval(function () { if (run.phase !== "running" || !stream || !srcW()) return; var x = now(); var dt = det.tick ? x - det.tick : 0; det.tick = x; step(x, dt); }, 120);
  }
  function step(x, dt) {
    det.ticks += 1; tickClock(); placeBand();
    try { analyse(x, dt); } catch (e) { det.lastError = String(e && e.message || e); if (window.console) console.error(e); }
  }
  function analyse(x, dt) {
    var vw = srcW(), vh = srcH(), h = Math.round(W * vh / vw);
    work.width = W; work.height = h; wctx.drawImage(src(), 0, 0, W, h);
    var g = gray(wctx, W, h);
    var m = motion(det.prev, g); det.prev = g;
    det.lastM = m; det.lastS = lapVar(g, W, h);

    if (m > cfg.tMove) {
      if (det.best && !det.problem) { commit(det.best, false, null); }
      if (det.problem) { run.problems.push(det.problem); det.problem = null; hideOverlay(); }
      det.best = null; det.armed = true; det.state = "moving"; det.stillAcc = 0; ring.className = ""; return;
    }
    if (!det.armed) return;
    if (det.problem) return;
    if (m < cfg.tStill) {
      det.stillAcc += dt;
      if (det.stillAcc < cfg.stillMs) { det.state = "settling"; ring.className = "settling"; return; }
      if (!det.best) { det.best = grab(); det.keptAt = x; det.state = "window"; return; }
      if (x - det.keptAt <= cfg.winMs) { var c = grab(); if (c.sharp > det.best.sharp * 1.1) det.best = c; return; }
      var reason = det.best.bright < cfg.brightMin ? "sombre" : det.best.sharp < cfg.sharpMin ? "floue" : null;
      if (reason) { det.problem = { t: tOff(), pole: run.pole, reason: reason, kept: false }; det.state = "problem"; ring.className = "problem"; showOverlay(reason === "sombre" ? t("releve_sombre") : t("releve_floue"), t("releve_garder_quand_meme"), false); return; }
      commit(det.best, false, null); det.best = null; det.armed = false; det.state = "captured"; ring.className = "kept";
    } else {
      det.state = det.stillAcc ? "settling" : "moving"; ring.className = det.stillAcc ? "settling" : "";
    }
  }
  function grab() {
    var vw = srcW(), vh = srcH(), k = echelle(vw, vh);
    full.width = Math.round(vw * k); full.height = Math.round(vh * k); fctx.drawImage(src(), 0, 0, full.width, full.height);
    var mw = 320, mh = Math.round(mw * vh / vw); mid.width = mw; mid.height = mh; mctx.drawImage(src(), 0, 0, mw, mh);
    var g = gray(mctx, mw, mh);
    return { dataUrl: encoder(full), sharp: Math.round(lapVar(g, mw, mh)), bright: Math.round(mean(g)), w: full.width, h: full.height };
  }

  // ── une photo gardée : le composant d'un toucher, puis l'envoi ─────────────
  function commit(shot, manual, reason) {
    var last = run.items.length ? run.items[run.items.length - 1] : null;
    if (last && !manual && last.dataUrl === shot.dataUrl) { if (window.console) console.warn("[releve] image identique ignoree"); return; }
    run.seq += 1;
    run.items.push({ seq: run.seq, t: tOff(), at: new Date().toISOString(), pole: run.pole, sharp: shot.sharp, bright: shot.bright, w: shot.w, h: shot.h, manual: !!manual, reason: reason || null, source: shot.source || run.camera, removed: false, dataUrl: shot.dataUrl, comp: null, etat: "a_rattacher" });
    // La photo du flux est gardée D'ABORD (la vignette apparaît tout de suite, rien ne peut se perdre),
    // puis la vraie photo la remplace quand elle arrive. L'envoi n'a lieu qu'au toucher du composant :
    // elle a le temps. Sur une photo prise au fichier, il n'y a rien à remplacer.
    renderStrip(); renderPoles();
    if (shot.source !== "file") vraiePhoto(run.items[run.items.length - 1]);
    if (navigator.vibrate && navigator.userActivation && navigator.userActivation.hasBeenActive) { try { navigator.vibrate(30); } catch (e) {} }
  }
  // L'envoi : le foyer unique du POST (photo-capture.js). La photo part avec la clé du composant que
  // l'exploitant a touché ; la route prend la version COURANTE du dispositif (version_no omis).
  function envoyer(it) {
    var pole = poleByName(it.pole); if (!pole || !it.comp) return;
    if (!window.MSPhotoCapture || !MSPhotoCapture.envoyer) { it.etat = "echec"; renderStrip(); return; }
    it.etat = "envoi"; renderStrip();
    MSPhotoCapture.envoyer({ dispositif_id: pole.dispositif_id, component_key: it.comp.component_key, image_base64: it.dataUrl })
      .then(function (j) {
        if (j && j.ok) { it.etat = "ecrite"; it.photo_id = (j.photo && j.photo.photo_id) || null; }
        else { it.etat = "echec"; it.echec = j && j.rejected === "person" ? t("pole_photo_person") : t("pole_photo_failed"); }
        renderStrip();
      })
      .catch(function () { it.etat = "echec"; it.echec = t("pole_photo_failed"); renderStrip(); });
  }
  function renderStrip() {
    var strip = $("strip"); strip.innerHTML = "";
    run.items.forEach(function (it) {
      var d = document.createElement("div"); d.className = "shot" + (it.removed ? " removed" : "") + (it.etat === "ecrite" ? " ecrite" : "");
      var haut = it.comp ? esc(compLabel(it.comp)) : esc(it.pole || "—");
      var bas = it.etat === "envoi" ? esc(t("capture_envoi")) : it.etat === "echec" ? esc(it.echec || t("pole_photo_failed")) : fmtT(it.t);
      d.innerHTML = "<img alt=\"\" src=\"" + it.dataUrl + "\"><div class=\"m\"><b>" + haut + "</b>" + bas + "</div>";
      if (!it.removed && !it.comp) d.appendChild(choixComposant(it));
      var b = document.createElement("button"); b.type = "button"; b.textContent = it.removed ? t("releve_garder") : t("releve_retirer");
      b.addEventListener("click", function () { it.removed = !it.removed; it.removedAt = it.removed ? tOff() : null; renderStrip(); renderPoles(); });
      d.appendChild(b); strip.appendChild(d);
    });
    strip.scrollLeft = strip.scrollWidth;
  }
  // « Quel composant ? » — la liste est celle du pôle touché, donc trois ou quatre boutons, pas un tri.
  function choixComposant(it) {
    var wrap = document.createElement("div"); wrap.className = "q";
    var pole = poleByName(it.pole);
    var comps = pole && Array.isArray(pole.components) ? pole.components : [];
    var titre = document.createElement("div"); titre.className = "qt";
    titre.textContent = !it.pole ? t("capture_q_pole") : comps.length ? t("capture_q_composant") : t("capture_aucun_composant");
    wrap.appendChild(titre);
    comps.forEach(function (c) {
      var b = document.createElement("button"); b.type = "button"; b.className = "qb"; b.textContent = compLabel(c);
      b.addEventListener("click", function () { it.comp = c; renderStrip(); envoyer(it); });
      wrap.appendChild(b);
    });
    return wrap;
  }
  $("fileIn").addEventListener("change", function (ev) {
    var f = ev.target.files && ev.target.files[0]; if (!f) return;
    var img = new Image(), url = URL.createObjectURL(f);
    img.onload = function () {
      var k = echelle(img.naturalWidth, img.naturalHeight);
      full.width = Math.round(img.naturalWidth * k); full.height = Math.round(img.naturalHeight * k); fctx.drawImage(img, 0, 0, full.width, full.height);
      var mw = 320, mh = Math.round(mw * img.naturalHeight / img.naturalWidth); mid.width = mw; mid.height = mh; mctx.drawImage(img, 0, 0, mw, mh);
      var g = gray(mctx, mw, mh);
      commit({ dataUrl: encoder(full), sharp: Math.round(lapVar(g, mw, mh)), bright: Math.round(mean(g)), w: full.width, h: full.height, source: "file" }, true, null);
      URL.revokeObjectURL(url); ev.target.value = "";
    };
    img.src = url;
  });

  // ── fin du relevé : UNE page, une section par pôle ─────────────────────────
  function showSummary() {
    var kept = run.items.filter(function (i) { return !i.removed; });
    var order = POLES.map(function (p) { return p.name; });
    run.items.forEach(function (i) { if (i.pole && order.indexOf(i.pole) < 0) order.push(i.pole); });
    var html = order.map(function (p) {
      var its = kept.filter(function (i) { return i.pole === p; });
      return "<div class=\"sec\"><h3>" + esc(p) + "</h3><p class=\"n\">" + esc(nPhotos(its.length)) + "</p><div class=\"imgs\">"
        + its.map(function (i) { return "<img alt=\"\" src=\"" + i.dataUrl + "\">"; }).join("") + "</div></div>";
    }).join("");
    var sansPole = kept.filter(function (i) { return !i.pole; });
    if (sansPole.length) {
      html += "<div class=\"sec\"><h3>" + esc(t("releve_non_rattache")) + "</h3><p class=\"n\">" + esc(nPhotos(sansPole.length)) + "</p><div class=\"imgs\">"
        + sansPole.map(function (i) { return "<img alt=\"\" src=\"" + i.dataUrl + "\">"; }).join("") + "</div></div>";
    }
    $("sumBody").innerHTML = html;
    var report = { surface: "releve-espace", startedAt: run.startedAt, endedAt: new Date().toISOString(), durationS: tOff(), camera: run.camera, ua: navigator.userAgent, viewport: [innerWidth, innerHeight],
      reglages: { tMove: cfg.tMove, tStill: cfg.tStill, stillMs: cfg.stillMs, winMs: cfg.winMs, sharpMin: cfg.sharpMin, brightMin: cfg.brightMin },
      poles: POLES.map(function (p) { return { name: p.name, dispositif_id: p.dispositif_id, components: (p.components || []).length }; }),
      items: run.items.map(function (i) { return { seq: i.seq, t: i.t, at: i.at, pole: i.pole, composant: i.comp ? i.comp.component_key : null, etat: i.etat, photo_id: i.photo_id || null, sharp: i.sharp, bright: i.bright, w: i.w, h: i.h, photo_w: i.photo_w || null, photo_h: i.photo_h || null, photo_echec: i.photo_echec || null, manual: i.manual, reason: i.reason, source: i.source, removed: i.removed, removedAt: i.removedAt || null }; }),
      switches: run.switches, problems: run.problems };
    var a = $("sumDl"); if (a.href && a.href.indexOf("blob:") === 0) URL.revokeObjectURL(a.href);
    a.href = URL.createObjectURL(new Blob([JSON.stringify(report, null, 1)], { type: "application/json" }));
    $("strip").style.display = "none"; $("summary").style.display = "block";
  }

  // ── réglages : le calibrage sur téléphone réel, jamais un bouton visible ───
  function openSettings() {
    $("tMove").value = cfg.tMove; $("tStill").value = cfg.tStill; $("stillMs").value = cfg.stillMs; $("winMs").value = cfg.winMs; $("sharpMin").value = cfg.sharpMin; $("brightMin").value = cfg.brightMin;
    $("settings").style.display = "block";
  }
  var press = null;
  $("rl-clock").addEventListener("pointerdown", function () { press = setTimeout(openSettings, 700); });
  ["pointerup", "pointercancel", "pointerleave"].forEach(function (ev) { $("rl-clock").addEventListener(ev, function () { clearTimeout(press); }); });
  if (/[?&]reglages=1/.test(location.search)) openSettings();
  $("setCancel").addEventListener("click", function () { $("settings").style.display = "none"; });
  $("setSave").addEventListener("click", function () {
    cfg.tMove = num($("tMove").value, DEFAULTS.tMove); cfg.tStill = num($("tStill").value, DEFAULTS.tStill); cfg.stillMs = num($("stillMs").value, DEFAULTS.stillMs);
    cfg.winMs = nonneg($("winMs").value, DEFAULTS.winMs); cfg.sharpMin = nonneg($("sharpMin").value, DEFAULTS.sharpMin); cfg.brightMin = nonneg($("brightMin").value, DEFAULTS.brightMin);
    save(); $("settings").style.display = "none";
  });

  function tickClock() { $("rl-clock").textContent = run.phase === "idle" ? "0:00" : fmtT(tOff()); }
  setInterval(tickClock, 500);

  // ── harnais (identiques au proto : la vérification du 12/09 continue de valoir) ──
  window.__releveAttach = function (s) { if (run.phase !== "running") start(); attach(s); };
  window.__releveStep = function (dt) { if (run.phase !== "running") start(); if (!stream) stream = true; var x = (det.tick || now()) + (dt || 120); det.tick = x; step(x, dt || 120); return window.__releveState(); };
  window.__releveState = function () { return { phase: run.phase, state: det.state, armed: det.armed, m: Math.round(det.lastM * 10) / 10, s: Math.round(det.lastS), stillAcc: Math.round(det.stillAcc), ticks: det.ticks, lastError: det.lastError, overlay: overlay.style.display === "flex" ? $("ovTitle").textContent : null, pole: run.pole, poles: POLES.length, items: run.items.map(function (i) { return { seq: i.seq, t: i.t, pole: i.pole, composant: i.comp ? i.comp.component_key : null, etat: i.etat, sharp: i.sharp, bright: i.bright, w: i.w, h: i.h, source: i.source, photo_echec: i.photo_echec || null, manual: i.manual, reason: i.reason }; }), switches: run.switches.length, problems: run.problems.slice(), mainBtn: mainBtn.textContent, clock: $("rl-clock").textContent }; };

  renderPoles();
  if (POLES.length === 1) switchPole(POLES[0].name);
})();
