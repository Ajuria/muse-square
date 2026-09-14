// MSReleve — LE RELEVÉ DE L'ESPACE, la marche dans le magasin (docs/marche-guidee-spec.md, owner 11-12/09).
//
// ÉCRAN REFAIT LE 14/09 après le premier essai réel de l'owner. Ses quatre remarques, et ce qu'elles ont
// changé — la DÉTECTION est recopiée à l'identique (mêmes seuils, même hystérésis, mêmes harnais) :
//   1. « on devrait être en format vertical full page avec juste le bouton arrêter visible » → la prise
//      de vue est un CALQUE PLEIN ÉCRAN (#capture), plus une vignette carrée dans le document ;
//   2. « on voit une ligne rouge horizontale et on ne sait pas à quoi ça sert » → la bande des cartes ET
//      le cadre de couleur sont RETIRÉS. Deux décorations dont il fallait devenir la légende. L'état se
//      dit maintenant EN MOTS (#etat) : avancez · ne bougez plus · photo gardée ;
//   3. « aucune instruction à l'affichage (pas guidé du tout) » → les trois consignes de la spec § 5
//      s'affichent avant de commencer, et le nom du pôle rappelle qu'on le touche pour en changer ;
//   4. « quand on clique sur arrêter on doit en background enregistrer ; si pas bonne distance ou blurry
//      on doit être averti » → « Fin du relevé » lance l'ENREGISTREMENT EN ARRIÈRE-PLAN (file séquentielle,
//      avancement affiché) et chaque photo écrite dit ce qui cloche : floue (mesuré ici) ou composant pas
//      entier dans le cadre (`coverage_flag` rendu par la lecture — la « distance » ne se mesure pas
//      autrement).
//
// CE QUI RESTE VRAI DE LA SPEC : une photo par Point focal (M2), aucune vidéo produite ni envoyée, le
// pôle vient du GESTE (M5), la caméra dans la page avec repli par l'appareil (M7), une page de fin par
// pôle. CE QU'IL FAUT SAVOIR : la route refuse une clé de composant hors version (spec § 9 point 4, non
// fait), donc une photo se rattache à un composant DÉJÀ déclaré — c'est le seul geste qui ne peut pas
// partir en arrière-plan, et il se fait à la fin, pôle par pôle.
//
// Harnais (inchangés) : window.__releveSource, __releveStep(dt), __releveState(), __releveAttach(stream).
(function () {
  "use strict";
  var DEFAULTS = { tMove: 6, tStill: 2.5, stillMs: 1500, winMs: 1200, sharpMin: 100, brightMin: 40 };
  var LS = "ms-releve-reglages";
  var IN = window.MSReleve || {};
  var POLES = Array.isArray(IN.poles) ? IN.poles.filter(function (p) { return p && p.dispositif_id; }) : [];
  var C = IN.copy || {};
  var t = function (k) { return C[k] || ""; };
  var cfg = load();
  var $ = function (id) { return document.getElementById(id); };
  var video = $("cam"), overlay = $("overlay"), capture = $("capture"), etatEl = $("etat");

  // ── LE PLAFOND D'UNE PHOTO EST CELUI DU MODÈLE QUI LA LIT ──────────────────
  // Le rôle `packager` est claude-sonnet-5 : palier haute résolution de l'API, 2 576 px de grand côté et
  // 4 784 jetons visuels (un jeton par carreau de 28 px). Au-delà l'API réduit elle-même, et une
  // réduction côté API rend les étiquettes illisibles. Sous la borne de poids, la QUALITÉ descend d'un
  // cran plutôt que la taille : une étiquette se lit à la résolution, pas au taux de compression.
  var CAP = { edge: 2576, tokens: 4784, patch: 28, marge: 0.98, bytes: 1400000 };
  function echelle(w, h) {
    if (!w || !h) return 1;
    var parJetons = Math.sqrt((CAP.tokens * CAP.patch * CAP.patch) / (w * h)) * CAP.marge;
    return Math.min(1, CAP.edge / Math.max(w, h), parJetons);
  }
  function encoder(cv) {
    var q = [0.82, 0.72, 0.62, 0.5], url = "";
    for (var i = 0; i < q.length; i++) {
      url = cv.toDataURL("image/jpeg", q[i]);
      if (url.length * 0.75 <= CAP.bytes) return url;
    }
    return url;
  }

  var run = { phase: "idle", startedAt: null, t0: 0, pole: null, items: [], switches: [], problems: [], seq: 0, camera: "none" };
  var det = { prev: null, state: "moving", stillAcc: 0, keptAt: 0, armed: true, best: null, problem: null, lastM: 0, lastS: 0, tick: 0, ticks: 0, lastError: null };
  // POURQUOI UN ZÉRO EST UN ZÉRO (14/09) : le premier relevé réel a rendu 0 photo sans permettre de
  // dire si le seuil était trop strict ou si rien n'avait été analysé. Ces compteurs tranchent.
  var diag = { ticks: 0, vides: 0, mMin: null, mMax: null, mSomme: 0, mN: 0, sMax: null, sMin: null,
               immobileMax: 0, vw: 0, vh: 0, readyState: null, erreurs: 0 };
  function noteMouvement(m, sh) {
    diag.mN += 1; diag.mSomme += m;
    var mr = Math.round(m * 100) / 100, shr = Math.round(sh);
    if (diag.mMin === null || mr < diag.mMin) diag.mMin = mr;
    if (diag.mMax === null || mr > diag.mMax) diag.mMax = mr;
    if (diag.sMax === null || shr > diag.sMax) diag.sMax = shr;
    if (diag.sMin === null || shr < diag.sMin) diag.sMin = shr;
  }

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
  function gardees() { return run.items.filter(function (i) { return !i.removed; }); }

  // ── L'ÉTAT, EN MOTS (owner 14/09) ─────────────────────────────────────────
  // Le mot passe par data-mot : la pastille sombre est dessinée par ::before, donc elle n'existe que
  // s'il y a quelque chose à dire (#etat:empty est masqué).
  function dire(cle) {
    if (!etatEl) return;
    var mot = cle ? t(cle) : "";
    etatEl.setAttribute("data-mot", mot);
    etatEl.textContent = mot ? " " : "";
  }

  // ── pôles : ceux du compte, le geste décide (M5) ───────────────────────────
  function renderPoles() {
    [["poles", false], ["poleSheetList", true]].forEach(function (paire) {
      var nav = $(paire[0]); if (!nav) return;
      nav.innerHTML = "";
      POLES.forEach(function (p) {
        var b = document.createElement("button"); b.type = "button"; b.textContent = p.name;
        if (p.name === run.pole) b.className = "on";
        // 14/09 — stopPropagation N'EST PAS UNE PRÉCAUTION, C'EST LE CORRECTIF : switchPole reconstruit
        // cette liste PENDANT le clic, le nœud touché devient détaché, et `closest("#poleSheet")` du
        // garde plus bas rend alors null — le calque prenait une photo parasite à chaque changement de
        // pôle (mesuré au harnais avant livraison). Un geste de commande arrête son événement.
        b.addEventListener("click", function (e) { e.stopPropagation(); switchPole(p.name); if (paire[1]) fermerFeuille(); });
        nav.appendChild(b);
      });
    });
    var tag = $("poleTag");
    if (tag) {
      var n = gardees().filter(function (i) { return i.pole === run.pole; }).length;
      tag.textContent = run.pole ? run.pole + " · " + nPhotos(n) : t("releve_etat_pole");
    }
  }
  function switchPole(p) {
    if (p === run.pole) return;
    if (run.phase === "running") run.switches.push({ t: tOff(), from: run.pole, to: p });
    run.pole = p; renderPoles();
  }
  function ouvrirFeuille() { var f = $("poleSheet"); if (f) f.hidden = false; }
  function fermerFeuille() { var f = $("poleSheet"); if (f) f.hidden = true; }

  // ── commencer / arrêter ────────────────────────────────────────────────────
  var stream = null, timer = null;
  function start() {
    run.phase = "running";
    if (!run.startedAt) { run.startedAt = new Date().toISOString(); run.t0 = det.tick || now(); det.tick = run.t0; } else { det.tick = Math.max(det.tick || 0, now()); }
    if (capture) capture.hidden = false;
    document.body.classList.add("rl-filme");
    $("summary").style.display = "none";
    renderPoles(); dire("releve_etat_avance"); tickClock();
    if (window.__releveSource) { stream = true; run.camera = "injected"; return; }
    startCamera();
  }
  function stop() {
    run.phase = "ended";
    if (timer) { clearInterval(timer); timer = null; }
    if (stream && stream.getTracks) { stream.getTracks().forEach(function (x) { x.stop(); }); }
    stream = null; video.srcObject = null;
    if (capture) capture.hidden = true;
    document.body.classList.remove("rl-filme");
    hideOverlay(); fermerFeuille(); tickClock();
    showSummary();
    enregistrerTout();   // owner 14/09 : arrêter, c'est enregistrer — en arrière-plan
  }
  $("mainBtn").addEventListener("click", function () { start(); });
  $("stopBtn").addEventListener("click", function (e) { e.stopPropagation(); stop(); });
  $("sumBack").addEventListener("click", function () { start(); });
  $("poleTag").addEventListener("click", function (e) { e.stopPropagation(); ouvrirFeuille(); });
  $("poleSheet").addEventListener("click", function (e) { e.stopPropagation(); if (e.target === $("poleSheet")) fermerFeuille(); });

  function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { return useFallback("getUserMedia absent"); }
    navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 3840 }, height: { ideal: 2160 } } })
      .then(function (s) { attach(s); })
      .catch(function (e) { useFallback(e && e.name ? e.name : String(e)); });
  }
  // ── UNE VRAIE PHOTO AU POINT FOCAL (owner 14/09) ──────────────────────────
  // `ImageCapture.takePhoto()` prend une exposition par le pipeline photo de l'appareil, pas une image
  // du flux vidéo (Safari 18.4+, iOS en hérite ; Chrome 60+). Aucun geste requis : l'autorisation du
  // flux vaut déjà. L'image du flux est gardée d'abord et remplacée à l'arrivée.
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
      })
      .catch(function (e) { it.photo_echec = String(e && e.name || e); });
  }
  function useFallback(reason) {
    run.camera = "file:" + reason;
    showOverlay(t("releve_camera_ko"), t("releve_camera_ko_texte"), true);
  }
  function requestWakeLock() { try { if (navigator.wakeLock) navigator.wakeLock.request("screen").catch(function () {}); } catch (e) {} }

  // ── un problème s'affiche DANS le viseur, et se règle d'un toucher ────────
  function showOverlay(titre, texte, withFile) { $("ovTitle").textContent = titre; $("ovText").textContent = texte; $("ovFile").hidden = !withFile; overlay.style.display = "flex"; }
  function hideOverlay() { overlay.style.display = "none"; }
  overlay.addEventListener("click", function (ev) {
    if (ev.target.closest("#ovFile")) return;
    if (det.problem && det.best) { var b = det.best; commit(b, true, det.problem.reason); det.problem.kept = true; run.problems.push(det.problem); det.problem = null; det.best = null; det.armed = false; hideOverlay(); }
  });
  capture.addEventListener("click", function (ev) {
    var c = ev.target && ev.target.closest ? ev.target : null;
    // Ceinture : une cible qui n'est plus dans le document a été retirée par un gestionnaire pendant
    // le clic (une liste reconstruite). Ce n'est pas un toucher du viseur.
    if (!c || !document.contains(c)) return;
    if (c.closest("#overlay") || c.closest("#poleTag") || c.closest("#stopBtn") || c.closest("#poleSheet")) return;
    if (run.phase !== "running" || !stream || !srcW()) return;
    commit(grab(), true, null); det.armed = false;
  });

  // ── analyse — PORTÉE À L'IDENTIQUE du proto v2 (vérifiée le 12/09) ────────
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

  function loop() {
    if (timer) return;
    timer = setInterval(function () {
      diag.ticks += 1;
      diag.vw = srcW(); diag.vh = srcH();
      diag.readyState = video && video.readyState != null ? video.readyState : null;
      if (run.phase !== "running" || !stream || !srcW()) { diag.vides += 1; return; }
      var x = now(); var dt = det.tick ? x - det.tick : 0; det.tick = x; step(x, dt);
    }, 120);
  }
  function step(x, dt) {
    det.ticks += 1; tickClock();
    try { analyse(x, dt); } catch (e) { diag.erreurs += 1; det.lastError = String(e && e.message || e); if (window.console) console.error(e); }
  }
  function analyse(x, dt) {
    var vw = srcW(), vh = srcH(), h = Math.round(W * vh / vw);
    work.width = W; work.height = h; wctx.drawImage(src(), 0, 0, W, h);
    var g = gray(wctx, W, h);
    var m = motion(det.prev, g); det.prev = g;
    det.lastM = m; det.lastS = lapVar(g, W, h);
    noteMouvement(m, det.lastS);
    if (det.stillAcc > diag.immobileMax) diag.immobileMax = det.stillAcc;

    if (m > cfg.tMove) {
      if (det.best && !det.problem) { commit(det.best, false, null); }
      if (det.problem) { run.problems.push(det.problem); det.problem = null; hideOverlay(); }
      det.best = null; det.armed = true; det.state = "moving"; det.stillAcc = 0; dire("releve_etat_avance"); return;
    }
    if (!det.armed) return;
    if (det.problem) return;
    if (m < cfg.tStill) {
      det.stillAcc += dt;
      if (det.stillAcc < cfg.stillMs) { det.state = "settling"; dire("releve_etat_arret"); return; }
      if (!det.best) { det.best = grab(); det.keptAt = x; det.state = "window"; return; }
      if (x - det.keptAt <= cfg.winMs) { var c = grab(); if (c.sharp > det.best.sharp * 1.1) det.best = c; return; }
      var reason = det.best.bright < cfg.brightMin ? "sombre" : det.best.sharp < cfg.sharpMin ? "floue" : null;
      if (reason) { det.problem = { t: tOff(), pole: run.pole, reason: reason, kept: false }; det.state = "problem"; showOverlay(reason === "sombre" ? t("releve_sombre") : t("releve_floue"), t("releve_garder_quand_meme"), false); return; }
      commit(det.best, false, null); det.best = null; det.armed = false; det.state = "captured";
    } else {
      det.state = det.stillAcc ? "settling" : "moving";
      dire(det.stillAcc ? "releve_etat_arret" : "releve_etat_avance");
    }
  }
  function grab() {
    var vw = srcW(), vh = srcH(), k = echelle(vw, vh);
    full.width = Math.round(vw * k); full.height = Math.round(vh * k); fctx.drawImage(src(), 0, 0, full.width, full.height);
    var mw = 320, mh = Math.round(mw * vh / vw); mid.width = mw; mid.height = mh; mctx.drawImage(src(), 0, 0, mw, mh);
    var g = gray(mctx, mw, mh);
    return { dataUrl: encoder(full), sharp: Math.round(lapVar(g, mw, mh)), bright: Math.round(mean(g)), w: full.width, h: full.height };
  }

  // ── une photo gardée ──────────────────────────────────────────────────────
  function commit(shot, manual, reason) {
    var last = run.items.length ? run.items[run.items.length - 1] : null;
    if (last && !manual && last.dataUrl === shot.dataUrl) { if (window.console) console.warn("[releve] image identique ignoree"); return; }
    run.seq += 1;
    run.items.push({ seq: run.seq, t: tOff(), at: new Date().toISOString(), pole: run.pole, sharp: shot.sharp, bright: shot.bright, w: shot.w, h: shot.h, manual: !!manual, reason: reason || null, source: shot.source || run.camera, removed: false, dataUrl: shot.dataUrl, comp: null, etat: "a_rattacher" });
    renderPoles(); dire("releve_etat_gardee");
    if (shot.source !== "file") vraiePhoto(run.items[run.items.length - 1]);
    if (navigator.vibrate && navigator.userActivation && navigator.userActivation.hasBeenActive) { try { navigator.vibrate(30); } catch (e) {} }
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

  // ── FIN DU RELEVÉ : une page, une section par pôle ────────────────────────
  function showSummary() {
    var kept = gardees();
    var order = POLES.map(function (p) { return p.name; });
    run.items.forEach(function (i) { if (i.pole && order.indexOf(i.pole) < 0) order.push(i.pole); });
    var body = $("sumBody"); body.innerHTML = "";
    order.concat([null]).forEach(function (p) {
      var its = kept.filter(function (i) { return p === null ? !i.pole : i.pole === p; });
      if (p === null && !its.length) return;
      var sec = document.createElement("div"); sec.className = "sec";
      sec.innerHTML = "<h3>" + esc(p === null ? t("releve_non_rattache") : p) + "</h3>"
        + '<p class="n">' + esc(nPhotos(its.length)) + "</p>";
      its.forEach(function (it) { sec.appendChild(ligneDePhoto(it)); });
      body.appendChild(sec);
    });
    compteRendu();
    $("summary").style.display = "block";
  }
  // Une photo de la page de fin : l'image, ce qui cloche, la question du composant, et le retrait.
  function ligneDePhoto(it) {
    var d = document.createElement("div"); d.className = "rl-shot";
    var haut = it.comp ? "<b>" + esc(compLabel(it.comp)) + "</b>" : esc(fmtT(it.t));
    var avert = it.etat === "ecrite" && it.coverage && it.coverage !== "entier" ? t("releve_a_reprendre")
      : (it.reason === "floue" ? t("releve_floue_a_reprendre") : "");
    var etat = it.etat === "envoi" ? t("capture_envoi") : it.etat === "echec" ? (it.echec || t("pole_photo_failed")) : "";
    d.innerHTML = '<img alt="" src="' + it.dataUrl + '">'
      + '<div class="c"><div class="t">' + haut + (etat ? " · " + esc(etat) : "") + "</div>"
      + (avert ? '<div class="w">' + esc(avert) + "</div>" : "")
      + "</div>";
    var col = d.querySelector(".c");
    if (!it.comp) {
      var pole = poleByName(it.pole);
      var comps = pole && Array.isArray(pole.components) ? pole.components : [];
      var q = document.createElement("div");
      q.innerHTML = '<div class="t">' + esc(!it.pole ? t("capture_q_pole") : comps.length ? t("capture_q_composant") : t("capture_aucun_composant")) + "</div>";
      comps.forEach(function (c) {
        var b = document.createElement("button"); b.type = "button"; b.className = "qb"; b.textContent = compLabel(c);
        b.addEventListener("click", function () { it.comp = c; showSummary(); enregistrerTout(); });
        q.appendChild(b);
      });
      col.appendChild(q);
    }
    var rm = document.createElement("button"); rm.type = "button"; rm.className = "rm";
    rm.textContent = it.removed ? t("releve_garder") : t("releve_retirer");
    rm.addEventListener("click", function () { it.removed = !it.removed; showSummary(); });
    col.appendChild(rm);
    return d;
  }

  // ── L'ENREGISTREMENT EN ARRIÈRE-PLAN (owner 14/09) ────────────────────────
  // « Arrêter » lance la file. Une photo part dès qu'elle a son composant ; la file est SÉQUENTIELLE
  // (la lecture par le modèle prend quelques secondes, et rien ne gagne à les paralléliser sur un
  // téléphone), elle ne bloque pas l'écran, et l'avancement se dit en une ligne. Une photo sans
  // composant attend : la route refuse une clé inconnue, et deviner le composant écrirait un faux.
  var enCours = false;
  function enregistrerTout() {
    if (enCours) return;
    var file = gardees().filter(function (i) { return i.comp && i.etat === "a_rattacher"; });
    if (!file.length) { avancement(); return; }
    enCours = true;
    var suivant = function () {
      var it = file.shift();
      if (!it) { enCours = false; avancement(); return; }
      var pole = poleByName(it.pole);
      if (!pole || !window.MSPhotoCapture || !MSPhotoCapture.envoyer) { it.etat = "echec"; return suivant(); }
      it.etat = "envoi"; avancement(); majLigne(it);
      MSPhotoCapture.envoyer({ dispositif_id: pole.dispositif_id, component_key: it.comp.component_key || it.comp.key, image_base64: it.dataUrl })
        .then(function (j) {
          if (j && j.ok) {
            it.etat = "ecrite"; it.photo_id = (j.photo && j.photo.photo_id) || null;
            it.coverage = (j.photo && j.photo.coverage_flag) || null;   // « pas entier » = à reprendre
            it.version = j.version || null;
          } else {
            it.etat = "echec"; it.echec = j && j.rejected === "person" ? t("pole_photo_person") : t("pole_photo_failed");
          }
          avancement(); majLigne(it); suivant();
        })
        .catch(function () { it.etat = "echec"; it.echec = t("pole_photo_failed"); avancement(); majLigne(it); suivant(); });
    };
    suivant();
  }
  function majLigne(it) { if ($("summary").style.display === "block") showSummary(); }
  function avancement() {
    var el = $("sumEtat"); if (!el) return;
    var k = gardees(), aFaire = k.filter(function (i) { return i.comp; }), faites = k.filter(function (i) { return i.etat === "ecrite"; });
    if (!k.length) { el.textContent = ""; el.style.display = "none"; return; }
    el.style.display = "block";
    var total = aFaire.length || k.length;
    el.textContent = faites.length === aFaire.length && aFaire.length
      ? (faites.length === 1 ? t("releve_envoi_fini_une") : t("releve_envoi_fini").split("{n}").join(String(faites.length)))
      : (total === 1 ? t("releve_envoi_en_cours_une").split("{fait}").join(String(faites.length))
                     : t("releve_envoi_en_cours").split("{fait}").join(String(faites.length)).split("{total}").join(String(total)));
    compteRendu();
  }

  function compteRendu() {
    var report = { surface: "releve-espace", startedAt: run.startedAt, endedAt: new Date().toISOString(), durationS: tOff(), camera: run.camera, ua: navigator.userAgent, viewport: [innerWidth, innerHeight],
      reglages: { tMove: cfg.tMove, tStill: cfg.tStill, stillMs: cfg.stillMs, winMs: cfg.winMs, sharpMin: cfg.sharpMin, brightMin: cfg.brightMin },
      diagnostic: {
        ticks: diag.ticks, ticks_vides: diag.vides, mesures: diag.mN, erreurs: diag.erreurs,
        derniere_erreur: det.lastError,
        mouvement: { min: diag.mMin, moyen: diag.mN ? Math.round((diag.mSomme / diag.mN) * 100) / 100 : null, max: diag.mMax, seuil_immobile: cfg.tStill, seuil_bouge: cfg.tMove },
        nettete: { min: diag.sMin, max: diag.sMax, plancher: cfg.sharpMin },
        immobilite_cumulee_max_ms: Math.round(diag.immobileMax), immobilite_exigee_ms: cfg.stillMs,
        flux: { largeur: diag.vw, hauteur: diag.vh, readyState: diag.readyState },
        pole_courant: run.pole,
      },
      poles: POLES.map(function (p) { return { name: p.name, dispositif_id: p.dispositif_id, components: (p.components || []).length }; }),
      items: run.items.map(function (i) { return { seq: i.seq, t: i.t, at: i.at, pole: i.pole, composant: i.comp ? i.comp.component_key : null, etat: i.etat, photo_id: i.photo_id || null, coverage: i.coverage || null, sharp: i.sharp, bright: i.bright, w: i.w, h: i.h, photo_w: i.photo_w || null, photo_h: i.photo_h || null, photo_echec: i.photo_echec || null, manual: i.manual, reason: i.reason, source: i.source, removed: i.removed }; }),
      switches: run.switches, problems: run.problems };
    var a = $("sumDl"); if (!a) return;
    if (a.href && a.href.indexOf("blob:") === 0) URL.revokeObjectURL(a.href);
    a.href = URL.createObjectURL(new Blob([JSON.stringify(report, null, 1)], { type: "application/json" }));
  }

  // ── réglages : le calibrage sur téléphone réel, jamais un bouton visible ──
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

  // ?diagnostic=1 — les valeurs en direct, pour voir en une seconde si le seuil est en cause ou si
  // rien n'est analysé. Opt-in par l'adresse : aucun élément permanent dans le viseur.
  var DIAG_VISIBLE = /[?&]diagnostic=1/.test(location.search);
  var diagEl = null;
  if (DIAG_VISIBLE) {
    diagEl = document.createElement("div");
    diagEl.setAttribute("style", "position:absolute;left:12px;right:12px;top:calc(env(safe-area-inset-top,0px) + 64px);font-family:ui-monospace,monospace;font-size:11px;line-height:1.5;color:#fff;background:rgba(17,24,39,.72);border-radius:6px;padding:6px 8px;white-space:pre-wrap;pointer-events:none;");
    if (capture) capture.appendChild(diagEl);
  }
  function peindreDiag() {
    if (!diagEl) return;
    diagEl.textContent = "mouvement " + (Math.round(det.lastM * 10) / 10) + "  (immobile < " + cfg.tStill + ", bouge > " + cfg.tMove + ")"
      + "\nnettete " + Math.round(det.lastS) + "  (plancher " + cfg.sharpMin + ")"
      + "\nimmobile " + Math.round(det.stillAcc) + " / " + cfg.stillMs + " ms   etat " + det.state
      + "\nticks " + diag.ticks + "  vides " + diag.vides + "  flux " + diag.vw + "x" + diag.vh + "  readyState " + diag.readyState
      + (det.lastError ? "\nerreur " + det.lastError : "");
  }
  function tickClock() { $("rl-clock").textContent = run.phase === "idle" ? "0:00" : fmtT(tOff()); peindreDiag(); }
  setInterval(tickClock, 500);

  // ── harnais (identiques) ──────────────────────────────────────────────────
  window.__releveAttach = function (s) { if (run.phase !== "running") start(); attach(s); };
  window.__releveStep = function (dt) { if (run.phase !== "running") start(); if (!stream) stream = true; var x = (det.tick || now()) + (dt || 120); det.tick = x; step(x, dt || 120); return window.__releveState(); };
  window.__releveState = function () { return { phase: run.phase, state: det.state, armed: det.armed, m: Math.round(det.lastM * 10) / 10, s: Math.round(det.lastS), stillAcc: Math.round(det.stillAcc), ticks: det.ticks, lastError: det.lastError, overlay: overlay.style.display === "flex" ? $("ovTitle").textContent : null, etat: etatEl ? etatEl.getAttribute("data-mot") : null, plein_ecran: capture ? !capture.hidden : null, pole: run.pole, poles: POLES.length, items: run.items.map(function (i) { return { seq: i.seq, t: i.t, pole: i.pole, composant: i.comp ? i.comp.component_key : null, etat: i.etat, coverage: i.coverage || null, sharp: i.sharp, bright: i.bright, w: i.w, h: i.h, source: i.source, manual: i.manual, reason: i.reason }; }), switches: run.switches.length, problems: run.problems.slice(), mainBtn: $("mainBtn").textContent, clock: $("rl-clock").textContent }; };

  renderPoles();
  if (POLES.length === 1) switchPole(POLES[0].name);
})();
