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
//      Le N° DU PLAN du meuble part AVEC la photo (`fixture_no`, owner 14/09) : il arrive du rendu
//      serveur avec le composant, lu à sa source déclarée (la mesure d'espace) — jamais deviné dans la
//      clé, qui est un UUID tronqué quand personne ne la pose. Sans lui la légende de la photo, sur la
//      page du pôle, n'affiche aucun numéro.
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
  // ── LES SEUILS, CALIBRÉS SUR UN TÉLÉPHONE TENU À LA MAIN (owner 14/09) ──────────────────────────
  // Mesure owner, iPhone, immobile devant un meuble : le mouvement lu vaut 12 à 18. Les seuils
  // venaient du proto, calibré sur un canvas PARFAITEMENT fixe : immobile < 2,5 et « ça bouge » > 6.
  // Une main au repos était donc en permanence AU-DESSUS du seuil « ça bouge » : la détection ne
  // commençait jamais à compter, d'où 0 photo en 51 s et 0 problème signalé. Les nouvelles valeurs
  // laissent la main tranquille (immobile jusqu'à 22) et gardent une marge franche avant de déclarer
  // un déplacement (34) — une marche donne des valeurs bien plus hautes (50 et plus au harnais).
  // Elles restent réglables sur place (appui long sur le chrono) et le diagnostic affiche le mouvement
  // en direct : ce sont des valeurs MESURÉES sur un appareil, pas une vérité.
  // L'ÉCART ENTRE LES DEUX SEUILS EST L'HYSTÉRÉSIS, et il doit rester COURT : le détecteur ne se
  // réarme qu'au-dessus de « ça bouge ». Trop haut, il ne se réarme jamais après une photo et la
  // marche entière ne rend qu'une seule image — le défaut vu au harnais avec 34 (une marche y mesure
  // 33). Immobile 22 (au-dessus des 12-18 d'une main), bouge 28 (juste au-dessus).
  var DEFAULTS = { tMove: 28, tStill: 22, stillMs: 1500, winMs: 1200, sharpMin: 100, brightMin: 40 };
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

  var run = { phase: "idle", startedAt: null, t0: 0, pole: null, items: [], switches: [], problems: [], seq: 0, camera: "none", walkId: null, marcheEcrite: false };
  var det = { prev: null, state: "moving", stillAcc: 0, keptAt: 0, armed: true, best: null, problem: null, lastM: 0, lastS: 0, tick: 0, ticks: 0, lastError: null,
              // 14/09 — LA SCÈNE DE LA DERNIÈRE PHOTO GARDÉE. Le réarmement ne dépend plus de détecter
              // une MARCHE (dont la valeur change d'un téléphone à l'autre et que je n'ai pas mesurée
              // chez l'owner) : ce qui autorise une photo nouvelle, c'est que LA SCÈNE AIT CHANGÉ
              // depuis la dernière gardée. Tenir le même meuble dix secondes ne produit qu'une photo,
              // même si la main tremble ; se tourner vers un autre meuble en produit une, même si le
              // déplacement n'a jamais dépassé le seuil « ça bouge ».
              sceneGardee: null };
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
  // L'identifiant de la marche. `randomUUID` manque sous http:// et sur les Safari anciens \u2014 le repli
  // garde la FORME d'un identifiant, parce que la route et la colonne en exigent une.
  function idDeMarche() {
    try { if (crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
    var h = "0123456789abcdef", o = "";
    for (var i = 0; i < 36; i++) o += (i === 8 || i === 13 || i === 18 || i === 23) ? "-"
      : i === 14 ? "4" : h.charAt(i === 19 ? (8 + Math.floor(Math.random() * 4)) : Math.floor(Math.random() * 16));
    return o;
  }
  function tOff() { return run.t0 ? Math.round((det.tick || now()) - run.t0) / 1000 : 0; }
  function pad(n) { return n < 10 ? "0" + n : String(n); }
  function fmtT(s) { var m = Math.floor(s / 60); return m + ":" + pad(Math.floor(s - m * 60)); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]; }); }
  function nPhotos(n) { return n === 0 ? t("releve_aucune_photo") : n === 1 ? t("releve_une_photo") : t("releve_n_photos").replace("{n}", String(n)); }
  function poleByName(name) { for (var i = 0; i < POLES.length; i++) if (POLES[i].name === name) return POLES[i]; return null; }
  // ── A — LE RANG DÉCIDE (spec M4, owner 14/09) ────────────────────────────────────────────────────
  // « Il n'a pas à le savoir. Le numéro d'un composant est son rang dans la marche. » Demander « quel
  // composant ? » était inutilisable : mesuré sur le compte de l'owner, 40 meubles sur 52 portent un
  // nom que PARTAGE un autre meuble du même pôle (la Cave en a six qui s'appellent « Vin &
  // Spiritueux ») — seul le numéro du plan les distingue, et il n'est lisible que sur le plan.
  // Donc : dans un pôle, la Nième photo va au Nième meuble non encore photographié, dans l'ordre du
  // plan. Corriger UNE photo réattribue toutes les suivantes du même pôle à partir de là — une
  // correction suffit quand on a commencé par l'autre bout, il n'en faut pas sept.
  function composantsDuPole(nom) { var p = poleByName(nom); return p && Array.isArray(p.components) ? p.components : []; }
  function dejaPris(nom, saufSeq) {
    var pris = {};
    gardees().forEach(function (i) { if (i.pole === nom && i.comp && i.seq !== saufSeq) pris[i.comp.component_key] = true; });
    return pris;
  }
  function prochainComposant(nom) {
    var pris = dejaPris(nom, null), comps = composantsDuPole(nom);
    for (var i = 0; i < comps.length; i++) if (!pris[comps[i].component_key]) return comps[i];
    return null;
  }
  // Corriger une photo déjà écrite passe par LA MÊME FILE que l'écriture : `reattribuer` la marque
  // « à corriger », la file la retire de la base (rail « Retirer », livré le 14/09) puis la renvoie
  // sur le bon meuble. Un seul chemin, donc un seul comportement à vérifier.
  function reattribuer(it, comp) {
    it.comp = comp;
    var comps = composantsDuPole(it.pole), idx = -1;
    for (var i = 0; i < comps.length; i++) if (comps[i].component_key === comp.component_key) idx = i;
    // Les photos SUIVANTES du même pôle reprennent la suite de l'ordre. On ne touche JAMAIS une photo
    // déjà écrite : son rattachement est en base, le corriger ici mentirait à l'écran.
    var suite = gardees().filter(function (x) { return x.pole === it.pole && x.seq > it.seq; })
                         .sort(function (a, b) { return a.seq - b.seq; });
    suite.forEach(function (x, k) {
      var neuf = comps[idx + 1 + k] || null;
      var change = (x.comp && neuf && x.comp.component_key !== neuf.component_key) || (!x.comp !== !neuf);
      x.comp = neuf;
      // Une photo DÉJÀ ÉCRITE dont le meuble change doit être corrigée EN BASE, pas seulement à
      // l'écran : elle passe dans la file, qui la retire puis la renvoie. Sans cela, « une correction
      // suffit » serait faux dès que l'enregistrement est parti — c'est-à-dire toujours, puisqu'il
      // part à l'arrêt.
      if (change && x.etat === "ecrite") x.etat = "a_corriger";
    });
  }
  // ── B — LA PHOTO PRÉCÉDENTE COMME REPÈRE ─────────────────────────────────────────────────────────
  // Un nom partagé par six meubles ne dit rien ; la photo du meuble, si. Chargée UNE fois par pôle,
  // au moment où l'exploitant le touche (jamais au chargement de la page : il n'en visite que deux ou
  // trois), et jamais bloquante — sans photo, l'écran est celui d'aujourd'hui.
  var photosParPole = {};
  function chargerPhotos(pole) {
    if (!pole || !pole.dispositif_id || photosParPole[pole.dispositif_id]) return;
    photosParPole[pole.dispositif_id] = {};
    fetch("/api/dispositifs/photos?dispositif_id=" + encodeURIComponent(pole.dispositif_id), { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var m = {};
        ((j && j.photos) || []).forEach(function (ph) {
          if (!ph || !ph.component_key || !ph.url) return;
          m[ph.component_key] = ph.url + (ph.url.indexOf("?") < 0 ? "?" : "&") + "variant=square";
        });
        photosParPole[pole.dispositif_id] = m;
        renderPoles(); if ($("summary").style.display === "block") showSummary();
      })
      .catch(function () {});
  }
  function vignetteDe(pole, comp) {
    var m = pole && photosParPole[pole.dispositif_id];
    return m && comp && m[comp.component_key] ? m[comp.component_key] : null;
  }
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
      if (!run.pole) { tag.textContent = t("releve_etat_pole"); return; }
      var n = gardees().filter(function (i) { return i.pole === run.pole; }).length;
      // Ce que le viseur dit du pôle : son nom, son compte, et LE MEUBLE ATTENDU — le rang, pas un
      // numéro à déchiffrer. La vignette, quand elle existe, montre ce qu'on cherche.
      var pole = poleByName(run.pole), suivant = prochainComposant(run.pole), vig = vignetteDe(pole, suivant);
      tag.innerHTML = '<span class="pt-l1">' + esc(run.pole) + " · " + esc(nPhotos(n)) + "</span>"
        + (suivant ? '<span class="pt-l2">' + (vig ? '<img alt="" src="' + esc(vig) + '">' : "") + esc(compLabel(suivant)) + "</span>" : "");
    }
  }
  function switchPole(p) {
    if (p === run.pole) return;
    if (run.phase === "running") run.switches.push({ t: tOff(), from: run.pole, to: p });
    run.pole = p; chargerPhotos(poleByName(p)); renderPoles();
  }
  function ouvrirFeuille() { var f = $("poleSheet"); if (f) f.hidden = false; }
  function fermerFeuille() { var f = $("poleSheet"); if (f) f.hidden = true; }

  // ── commencer / arrêter ────────────────────────────────────────────────────
  var stream = null, timer = null;
  function start() {
    run.phase = "running";
    if (!run.startedAt) { run.startedAt = new Date().toISOString(); run.t0 = det.tick || now(); det.tick = run.t0; run.walkId = idDeMarche(); } else { det.tick = Math.max(det.tick || 0, now()); }
    // CEINTURE (14/09) — le calque devient un enfant direct de <body> avant de s'afficher. Un
    // `position: fixed` est confiné par tout ancêtre portant `transform`, `filter`, `perspective`,
    // `contain` ou `will-change` : il se retrouve alors DANS une boîte de la page, avec le reste du
    // document visible autour — exactement ce que l'owner décrit (« la liste de pôles sous l'espace
    // pour voir ce que je filme »). Aucun ancêtre n'en porte aujourd'hui (vérifié), mais une règle
    // ajoutée ailleurs suffirait à casser l'écran sans qu'on le voie. Sous <body>, c'est impossible.
    if (capture && capture.parentNode !== document.body) document.body.appendChild(capture);
    if (capture) capture.hidden = false;
    document.body.classList.add("rl-filme");
    $("summary").style.display = "none";
    $("mainBtn").hidden = false;   // il réapparaît si l'on revient à l'écran d'avant
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
    // La page de fin porte « Reprendre le relevé » : un « Commencer » fixé en bas y ferait doublon.
    $("mainBtn").hidden = true;
    hideOverlay(); fermerFeuille(); tickClock();
    fermerLesVerdicts();   // 15/09 : aucune photo ne reste en attente de verdict quand on arrête
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
    commit(grab(), true, null); det.armed = false; det.sceneGardee = det.prev ? det.prev.slice() : null;
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
  // LE SEUIL DE « LA SCÈNE A CHANGÉ » — mesuré au harnais : même meuble (la main tremble seulement)
  // 5 à 11 ; un autre meuble 22 à 26. À 22 la marge était d'un demi-point du mauvais côté sur
  // certaines images. Aux trois quarts du seuil d'immobilité, il reste de la place des deux côtés,
  // et il suit automatiquement un réglage manuel des seuils sur le téléphone.
  function seuilScene() { return cfg.tStill * 0.75; }

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
    // L'écart avec la scène de la DERNIÈRE photo gardée : c'est lui qui autorise une photo nouvelle.
    // Affiché au diagnostic — sans ce nombre, un « pourquoi une seule photo ? » n'est pas répondable.
    det.lastScene = det.sceneGardee && det.sceneGardee.length === g.length ? motion(det.sceneGardee, g) : null;
    noteMouvement(m, det.lastS);
    if (det.stillAcc > diag.immobileMax) diag.immobileMax = det.stillAcc;

    if (m > cfg.tMove) {
      if (det.best && !det.problem) {
        var d = defaut(det.best);
        if (d) run.problems.push({ t: tOff(), pole: run.pole, reason: d, kept: false });
        else commit(det.best, false, null);
      }
      if (det.problem) { run.problems.push(det.problem); det.problem = null; hideOverlay(); }
      det.best = null; det.armed = true; det.state = "moving"; det.stillAcc = 0; dire("releve_etat_avance"); return;
    }
    // La scène a-t-elle changé depuis la dernière photo gardée ? Si oui, on se réarme sans avoir eu
    // besoin de voir une marche. `motion` rend 99 quand les tailles diffèrent : on ne s'en sert que
    // Le repère est le seuil d'IMMOBILITÉ, pas celui du déplacement : mesuré au harnais, une scène
    // inchangée (la main tremble seulement) rend ~11, un autre meuble ~25. Comparé au seuil du
    // déplacement (28), le réarmement ne se faisait JAMAIS — une photo et plus rien, le défaut
    // exact qu'on voulait éviter. Le seuil d'immobilité (22) sépare les deux.
    // si la scène gardée a la même grille.
    if (!det.armed && det.sceneGardee && det.sceneGardee.length === g.length && motion(det.sceneGardee, g) > seuilScene()) {
      det.armed = true; det.stillAcc = 0;
    }
    if (!det.armed) return;
    if (det.problem) return;
    if (m < cfg.tStill) {
      det.stillAcc += dt;
      if (det.stillAcc < cfg.stillMs) { det.state = "settling"; dire("releve_etat_arret"); return; }
      if (!det.best) { det.best = grab(); det.keptAt = x; det.state = "window"; return; }
      if (x - det.keptAt <= cfg.winMs) { var c = grab(); if (c.sharp > det.best.sharp * 1.1) det.best = c; return; }
      var reason = defaut(det.best);
      if (reason) { det.problem = { t: tOff(), pole: run.pole, reason: reason, kept: false }; det.state = "problem"; showOverlay(reason === "sombre" ? t("releve_sombre") : t("releve_floue"), t("releve_garder_quand_meme"), false); return; }
      // Même scène que la dernière gardée (la main tremble, l'image bouge de quelques valeurs) : on ne
      // garde pas deux fois le même meuble. La comparaison d'octets ne suffit pas — le bruit du
      // capteur rend deux images jamais identiques.
      if (det.sceneGardee && det.sceneGardee.length === g.length && motion(det.sceneGardee, g) <= seuilScene()) {
        det.armed = false; det.best = null; det.state = "captured"; return;
      }
      commit(det.best, false, null); det.sceneGardee = g.slice(); det.best = null; det.armed = false; det.state = "captured";
    } else {
      det.state = det.stillAcc ? "settling" : "moving";
      dire(det.stillAcc ? "releve_etat_arret" : "releve_etat_avance");
    }
  }
  // La porte qualite d'une image retenue : trop sombre, ou trop floue. UNE seule definition, parce
  // qu'il y a DEUX chemins pour garder une image (la fenetre s'ecoule a l'arret, ou la marche
  // reprend pendant la fenetre) et que le second ne la passait pas. Mesure le 14/09 sur la marche
  // de l'owner : une image a 7 de luminosite -- le noir -- s'est ecrite sur le meuble n\u00b0 4 de la
  // Cave par ce trou, avec 2579 de nettete sur la photo d'avant pour comparaison.
  function defaut(shot) {
    return shot.bright < cfg.brightMin ? "sombre" : shot.sharp < cfg.sharpMin ? "floue" : null;
  }
  function grab() {
    var vw = srcW(), vh = srcH(), k = echelle(vw, vh);
    full.width = Math.round(vw * k); full.height = Math.round(vh * k); fctx.drawImage(src(), 0, 0, full.width, full.height);
    var mw = 320, mh = Math.round(mw * vh / vw); mid.width = mw; mid.height = mh; mctx.drawImage(src(), 0, 0, mw, mh);
    var g = gray(mctx, mw, mh);
    return { dataUrl: encoder(full), sharp: Math.round(lapVar(g, mw, mh)), bright: Math.round(mean(g)), w: full.width, h: full.height };
  }

  // ── une photo gardée ──────────────────────────────────────────────────────
  // ── LE VERDICT PENDANT LA MARCHE (owner 15/09) ───────────────────────────────────────────────
  //
  // POURQUOI ICI ET PAS À LA FIN. Les deux questions du relevé n'ont pas le même bon moment :
  // « quel composant ? » se répond À LA FIN, en une passe, parce qu'une erreur de rang est un DÉCALAGE
  // et qu'une correction en répare douze (arbitrage owner du 14/09, inchangé). Mais « cette photo
  // est-elle bonne ? » se répond DEVANT LE COMPOSANT : reprendre coûte trois secondes, alors qu'à la
  // page de fin il faut retraverser le magasin. Mesuré sur le compte : 6 photos sur 10 n'ont pas le
  // composant entier dans le cadre.
  //
  // CE QU'IL DIT, ET CE QU'IL NE PEUT PAS DIRE. La marche connaît la NETTETÉ et la LUMIÈRE de l'image
  // (elle les mesure à chaque tick). Le CADRAGE, lui, est lu par le serveur après l'envoi : il ne peut
  // pas être annoncé ici, et on ne le promet pas. Le verdict montre donc la VIGNETTE — voir l'image
  // suffit à juger le cadrage soi-même — et le défaut qu'on sait nommer.
  //
  // L'ENVOI ATTEND. La file part 1,2 s après la prise ; le verdict la retient le temps de sa fenêtre.
  // Sans ça, « Reprendre » devrait effacer une ligne déjà écrite, et un échec d'effacement laisserait
  // une photo que l'exploitant croit reprise. Une photo non partie ne laisse RIEN à réparer.
  var VERDICT_MS = 4000;
  function montrerVerdict(it, reason) {
    var box = $("verdict"); if (!box) return;
    it.verdictJusqu = now() + VERDICT_MS;
    var mot = reason === "floue" ? t("releve_vu_floue") : reason === "sombre" ? t("releve_vu_sombre") : "";
    box.innerHTML = '<img alt="" src="' + it.dataUrl + '">'
      + '<div class="v-c"><div class="v-t">' + esc(t("releve_vu_gardee")) + (mot ? " · " + esc(mot) : "") + "</div></div>"
      + '<button type="button" class="v-r">' + esc(t("releve_vu_reprendre")) + "</button>";
    box.className = mot ? "on defaut" : "on";
    box.querySelector(".v-r").addEventListener("click", function () {
      // REPRENDRE : la photo n'est jamais partie, donc rien à effacer. Le rang se referme tout seul —
      // le composant attendu redevient celui qu'elle occupait.
      it.removed = true; it.verdictJusqu = 0;
      cacherVerdict(); renderPoles(); dire("releve_etat_avancez");
    });
    if (run.verdictT) clearTimeout(run.verdictT);
    run.verdictT = setTimeout(function () {
      it.verdictJusqu = 0; cacherVerdict(); enregistrerTout();
    }, VERDICT_MS);
  }
  function cacherVerdict() { var b = $("verdict"); if (b) { b.className = ""; b.innerHTML = ""; } }
  function verdictOuvert() {
    return run.items.some(function (i) { return !i.removed && i.verdictJusqu && i.verdictJusqu > now(); });
  }

  function commit(shot, manual, reason) {
    var last = run.items.length ? run.items[run.items.length - 1] : null;
    if (last && !manual && last.dataUrl === shot.dataUrl) { if (window.console) console.warn("[releve] image identique ignoree"); return; }
    run.seq += 1;
    // A — le rang décide : la photo prend le meuble attendu, sans rien demander.
    run.items.push({ seq: run.seq, t: tOff(), at: new Date().toISOString(), pole: run.pole, sharp: shot.sharp, bright: shot.bright, w: shot.w, h: shot.h, manual: !!manual, reason: reason || null, source: shot.source || run.camera, removed: false, dataUrl: shot.dataUrl, comp: run.pole ? prochainComposant(run.pole) : null, etat: "a_rattacher" });
    renderPoles(); dire("releve_etat_gardee");
    montrerVerdict(run.items[run.items.length - 1], reason);
    if (shot.source !== "file") vraiePhoto(run.items[run.items.length - 1]);
    // 14/09 — ON ENREGISTRE AU FIL DE LA MARCHE, plus seulement à l'arrêt. Mesuré ce soir : l'owner
    // avait 5 photos dans le pôle Caisse et `analytics.dispositif_photos` était à 0 — rien ne partait
    // avant « Fin du relevé », et la feuille des pôles cachait ce bouton. Quitter la page perdait
    // tout. La file est la même, séquentielle et non bloquante ; « Fin du relevé » finit le reste.
    // Le délai laisse la vraie photo remplacer l'image du flux avant l'envoi.
    setTimeout(enregistrerTout, 1200);
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
        + '<p class="n">' + esc(nPhotos(its.length)) + "</p>"
        // 15/09 — PLACER CE PÔLE SUR LE PLAN, juste sous son titre : c'est là qu'on vient de finir de
        // le parcourir. Jamais sur « Non rattaché », qui n'est pas un pôle.
        + (p === null ? "" : '<button type="button" class="rl-placer" data-pole="' + esc(p) + '">' + esc(t("releve_plan_cta")) + "</button>");
      its.forEach(function (it) { sec.appendChild(ligneDePhoto(it)); });
      body.appendChild(sec);
    });
    // LE BILAN EN TÊTE DE LA PAGE DE FIN : ce que la marche a donné, avant la liste des photos.
    var bil = bilanDeMarche({ t: t, gardees: kept.length, dureeS: tOff(), problems: run.problems });
    var bEl = $("sumBilan");
    if (bEl) {
      bEl.innerHTML = '<div class="rl-bilan-t">' + esc(t("releve_bilan_titre")) + '</div>'
        + '<div class="rl-bilan-l">' + esc(bil.ligne1) + '</div>'
        + '<div class="rl-bilan-l">' + esc(bil.ligne2) + '</div>'
        + (bil.perdue ? '<div class="rl-bilan-w">' + esc(bil.perdue_texte) + '</div>' : '');
      bEl.style.display = "block";
    }
    body.querySelectorAll(".rl-placer").forEach(function (b2) {
      b2.addEventListener("click", function () {
        chargerPlan().then(function () { ouvrirPlacement(b2.getAttribute("data-pole")); });
      });
    });
    compteRendu();
    $("summary").style.display = "block";
  }
  // Une photo de la page de fin : l'image, le meuble qu'elle a pris (le RANG l'a décidé), ce qui
  // cloche, et le retrait. Le nom du meuble se touche pour le corriger — et corriger une photo
  // réattribue toutes les suivantes du même pôle, parce qu'un décalage se rattrape en un geste.
  function ligneDePhoto(it) {
    var d = document.createElement("div"); d.className = "rl-shot";
    var pole = poleByName(it.pole);
    var avert = it.etat === "ecrite" && it.coverage && it.coverage !== "entier" ? t("releve_a_reprendre")
      : (it.reason === "floue" ? t("releve_floue_a_reprendre") : "");
    var etat = it.etat === "envoi" ? t("capture_envoi") : it.etat === "echec" ? (it.echec || t("pole_photo_failed")) : "";
    d.innerHTML = '<img alt="" src="' + it.dataUrl + '">'
      + '<div class="c"><div class="t">' + esc(fmtT(it.t)) + (etat ? " · " + esc(etat) : "") + "</div>"
      + (avert ? '<div class="w">' + esc(avert) + "</div>" : "") + "</div>";
    var col = d.querySelector(".c");

    // Le meuble attribué : un bouton, parce qu'il se corrige.
    var nom = document.createElement("button"); nom.type = "button"; nom.className = "rl-comp";
    var vig = vignetteDe(pole, it.comp);
    nom.innerHTML = (vig ? '<img alt="" src="' + esc(vig) + '">' : "")
      + "<b>" + esc(it.comp ? compLabel(it.comp) : (it.pole ? t("capture_aucun_composant") : t("capture_q_pole"))) + "</b>";
    col.appendChild(nom);

    var liste = document.createElement("div"); liste.className = "rl-liste"; liste.hidden = true;
    var comps = composantsDuPole(it.pole);
    var titre = document.createElement("div"); titre.className = "t";
    titre.textContent = comps.length ? t("capture_q_composant") : (it.pole ? t("capture_aucun_composant") : t("capture_q_pole"));
    liste.appendChild(titre);
    comps.forEach(function (c) {
      var b = document.createElement("button"); b.type = "button"; b.className = "qb";
      var v = vignetteDe(pole, c);
      b.innerHTML = (v ? '<img alt="" src="' + esc(v) + '">' : "") + "<span>" + esc(compLabel(c)) + "</span>";
      b.addEventListener("click", function () {
        if (it.etat === "ecrite") it.etat = "a_corriger";   // celle qu'on touche part aussi par la file
        reattribuer(it, c); showSummary(); enregistrerTout();
      });
      liste.appendChild(b);
    });
    col.appendChild(liste);
    // Une photo déjà écrite se corrige aussi : le toucher ouvre la même liste, et le choix la retire
    // de la base avant de la renvoyer au bon meuble. Pendant un envoi, on ne touche à rien.
    if (it.etat === "envoi") nom.disabled = true;
    else nom.addEventListener("click", function () { liste.hidden = !liste.hidden; });

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
  // Une photo dont le VERDICT est encore à l'écran n'est pas candidate : « Reprendre » doit pouvoir la
  // retirer sans rien avoir à effacer en base. La fenêtre est de 4 s, et elle se referme d'elle-même.
  function verdictEnCours(i) { return !!(i.verdictJusqu && i.verdictJusqu > now()); }
  function enregistrerTout() {
    if (enCours) return;
    var file = gardees().filter(function (i) { return i.comp && !verdictEnCours(i) && (i.etat === "a_rattacher" || i.etat === "a_corriger"); });
    if (!file.length) { avancement(); return; }
    enCours = true;
    var suivant = function () {
      var it = file.shift();
      if (!it) {
        // La file était un instantané : des photos ont pu arriver pendant l'envoi. On les reprend ici,
        // sinon elles restent « à rattacher » pour toujours — c'est ce qui a perdu 2 photos sur 5.
        var reste = gardees().filter(function (x) { return x.comp && !verdictEnCours(x) && (x.etat === "a_rattacher" || x.etat === "a_corriger"); });
        if (reste.length) { file = reste; return suivant(); }
        enCours = false; avancement(); return;
      }
      var pole = poleByName(it.pole);
      if (!pole || !window.MSPhotoCapture || !MSPhotoCapture.envoyer) { it.etat = "echec"; return suivant(); }
      var aRetirer = it.etat === "a_corriger" && it.photo_id ? it.photo_id : null;
      it.etat = "envoi"; avancement(); majLigne(it);
      // Corriger = retirer l'ancienne ligne AVANT d'écrire la nouvelle. Si le retrait échoue, on
      // n'écrit pas : deux lignes pour une seule photo seraient pires qu'un rattachement faux.
      (aRetirer
        ? fetch("/api/dispositifs/photos", { method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "retirer", dispositif_id: pole.dispositif_id, photo_id: aRetirer }) })
            .then(function (r) { return r.json(); })
            .then(function (j) { if (!j || !j.ok) throw new Error("retrait"); it.photo_id = null; it.coverage = null; })
        : Promise.resolve())
        .then(function () { return MSPhotoCapture.envoyer({ dispositif_id: pole.dispositif_id, component_key: it.comp.component_key || it.comp.key, image_base64: it.dataUrl, fixture_no: it.comp.fixture_no != null ? it.comp.fixture_no : null, walk_id: run.walkId, seq: it.seq, t_offset_s: it.t }); })
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

  // \u2500\u2500 LE CONTEXTE DE LA MARCHE (owner 14/09) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  // Quel appareil, quel syst\u00e8me, quelle taille de flux, et si la vraie photo a r\u00e9ussi. Ces faits
  // existaient pendant la marche et mouraient avec l'onglet : sans eux, \u00ab d'o\u00f9 viennent les photos
  // noires ? \u00bb ne se r\u00e9pond pas. \u00c9crit UNE fois, quand la file d'envoi a fini \u2014 c'est l\u00e0 seulement que
  // le nombre de photos \u00e9crites est vrai. NON BLOQUANT : les photos sont d\u00e9j\u00e0 en base, un \u00e9chec ici
  // ne perd rien et ne se montre pas. AUCUNE POSITION n'est envoy\u00e9e : elle demanderait une
  // autorisation \u00e0 l'exploitant, et c'est sa d\u00e9cision.
  // « Fin du relevé » ne laisse aucune photo en attente de verdict : la fenêtre se ferme, et la file
  // les prend. Sans ça, quitter la page pendant les 4 s perdrait la dernière photo — le défaut même
  // que l'enregistrement au fil de la marche avait corrigé le 14/09.
  function fermerLesVerdicts() {
    run.items.forEach(function (i) { i.verdictJusqu = 0; });
    if (run.verdictT) { clearTimeout(run.verdictT); run.verdictT = null; }
    cacherVerdict();
  }

  function envoyerMarche() {
    var loc = (window.MSReleve && window.MSReleve.location_id) || "";
    if (run.marcheEcrite || !run.walkId || !run.startedAt || !loc) return;
    run.marcheEcrite = true;
    var k = gardees();
    var st = srcDims();
    fetch("/api/dispositifs/walks", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        location_id: loc, walk_id: run.walkId,
        started_at: run.startedAt, ended_at: new Date().toISOString(),
        photos_kept: k.length,
        photos_written: k.filter(function (i) { return i.etat === "ecrite"; }).length,
        problems: run.problems.length,
        pole_sequence: k.map(function (i) { return { pole: i.pole, t: i.t }; }),
        user_agent: navigator.userAgent,
        viewport_w: window.innerWidth, viewport_h: window.innerHeight,
        stream_w: st.w, stream_h: st.h,
        camera_mode: run.camera,
        real_photos: k.filter(function (i) { return i.source === "photo"; }).length,
        photo_failures: k.filter(function (i) { return !!i.photo_echec; }).length,
        app_build: (window.MSReleve && window.MSReleve.build) || null,
      }),
    }).then(function (r) {
      // `fetch` ne rejette PAS sur un 4xx/5xx : sans ce contrôle, un refus serveur passait pour un
      // succès et la marche était perdue sans trace. Mesuré le 15/09 : la marche de 22:12 a écrit ses
      // 3 photos et sa ligne de marche n'existe pas.
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json().catch(function () { return {}; });
    }).then(function (j) {
      if (j && j.ok === false) throw new Error(j.error || "refus");
    }).catch(function (e) {
      run.marcheEcrite = false;
      run.problems.push({ t: tOff(), pole: run.pole, reason: "marche_non_ecrite:" + String(e && e.message || e), kept: false });
      if (window.console) console.warn("[releve] contexte de marche non ecrit :", e);
    });
  }
  function srcDims() {
    try { return { w: srcW() || null, h: srcH() || null }; } catch (e) { return { w: null, h: null }; }
  }
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
    if (faites.length === aFaire.length && aFaire.length) envoyerMarche();
    compteRendu();
  }

  // ── LE BILAN DE LA MARCHE, EN MOTS (owner 15/09 : « le film prend beaucoup de photos dont beaucoup
  // seront éliminées »). PUR : il ne lit que ce que la marche a compté, et ne touche à rien.
  //
  // POURQUOI IL EXISTE. Tout était déjà compté — `run.problems` porte chaque image écartée avec son
  // MOTIF — mais seulement dans le JSON à télécharger. L'exploitant ne pouvait pas savoir ce que son
  // film avait refusé, ni pourquoi. Or c'est le motif qui se corrige : « trop sombre » se répare en
  // allumant, « trop floue » en s'arrêtant une seconde de plus. Un compte sans motif ne sert à rien.
  //
  // UNE ÉCARTÉE N'EST PAS UNE PERTE : l'appareil refuse le noir et le flou AVANT de garder. Le bilan
  // dit donc ce que la marche a produit, pas ce qu'elle a raté.
  function bilanDeMarche(e) {
    var t = e.t;
    var gardees = Math.max(0, Number(e.gardees) || 0);
    var min = Math.max(1, Math.round((Number(e.dureeS) || 0) / 60));
    var ecartes = (e.problems || []).filter(function (p) { return p && p.kept === false && (p.reason === "sombre" || p.reason === "floue"); });
    var parMotif = {};
    ecartes.forEach(function (p) { parMotif[p.reason] = (parMotif[p.reason] || 0) + 1; });
    var motifs = Object.keys(parMotif).sort().map(function (k) {
      return parMotif[k] + " " + t(k === "sombre" ? "releve_bilan_sombre" : "releve_bilan_floue");
    }).join(" · ");
    var l1 = (gardees === 1 ? t("releve_bilan_gardee_une") : t("releve_bilan_gardees").split("{n}").join(String(gardees)))
      .split("{min}").join(String(min));
    var l2 = !ecartes.length ? t("releve_bilan_aucune_ecartee")
      : (ecartes.length === 1 ? t("releve_bilan_ecartee_une") : t("releve_bilan_ecartees").split("{n}").join(String(ecartes.length)))
          .split("{motifs}").join(motifs);
    // La marche non enregistrée se DIT : sans ça, le trou ne se découvre qu'en interrogeant la base,
    // des semaines plus tard (mesuré le 15/09 — table vide, et personne ne le savait).
    var perdue = (e.problems || []).some(function (p) { return p && String(p.reason || "").indexOf("marche_non_ecrite") === 0; });
    return { ligne1: l1, ligne2: l2, perdue: perdue, perdue_texte: perdue ? t("releve_bilan_non_ecrite") : "" };
  }

  // ── PLACER LES COMPOSANTS SUR LE PLAN, EN FIN DE PÔLE (owner 15/09) ──────────────────────────
  //
  // POURQUOI ICI. C'est la donnée qui manque depuis le début : `space_zones` tient les contours au
  // grain PÔLE et rien au grain composant. Sans elle, pas de plan numéroté — et c'est ce qui a forcé
  // la liste avec photos pour déplacer une photo. La voie automatique a été mesurée et écartée le
  // 15/09 (40 % d'appariement, et ce n'était pas un réglage : le dessin ne sépare pas deux meubles
  // accolés).
  //
  // POURQUOI À LA FIN DU PÔLE, ET EN UNE PASSE. L'exploitant vient de longer ces composants, dans cet
  // ordre, il y a deux minutes : il refait un trajet frais au lieu de décoder une liste. Le RANG
  // décide du composant annoncé, exactement comme il décide l'attribution des photos (owner 14/09).
  //
  // POURQUOI UNE IMAGE ET PAS UN PDF. Un point touché sur un PDF affiché dans un cadre ne se convertit
  // PAS en coordonnées du plan : le zoom, le défilement et la barre d'outils du lecteur vivent dans
  // son document et ne sont pas lisibles de l'extérieur. La page le DIT au lieu d'écrire un point faux.
  var plan = { fiche: null, points: {}, charge: false };
  function chargerPlan() {
    var loc = (window.MSReleve && window.MSReleve.location_id) || "";
    if (!loc || plan.charge) return Promise.resolve(plan);
    plan.charge = true;
    return fetch("/api/dispositifs/plan?location_id=" + encodeURIComponent(loc))
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && j.ok) {
          plan.fiche = j.plan || null;
          (j.points || []).forEach(function (p) { plan.points[p.component_key] = p; });
        }
        return plan;
      })
      .catch(function () { return plan; });
  }
  // Les coordonnées sont des FRACTIONS du plan (0 à 1) : le plan se réaffiche à toutes les tailles, et
  // des pixels ne survivraient pas au premier changement d'écran.
  function fractionDuClic(img, ev) {
    var r = img.getBoundingClientRect();
    var cx = (ev.touches && ev.touches[0] ? ev.touches[0].clientX : ev.clientX) - r.left;
    var cy = (ev.touches && ev.touches[0] ? ev.touches[0].clientY : ev.clientY) - r.top;
    return { x: Math.min(1, Math.max(0, cx / r.width)), y: Math.min(1, Math.max(0, cy / r.height)) };
  }
  function composantsDuPolePourPlan(nomPole) {
    return composantsDuPole(nomPole).map(function (c) {
      return { component_key: c.component_key || c.key, fixture_no: c.fixture_no == null ? null : Number(c.fixture_no),
               nom: compLabel(c), length_m: c.length_m == null ? null : Number(c.length_m) };
    });
  }
  function prochainDuPole(nomPole) {
    var comps = composantsDuPolePourPlan(nomPole);
    var restants = comps.filter(function (c) { return !plan.points[c.component_key]; })
      .sort(function (a, b) {
        var an = a.fixture_no == null ? Infinity : a.fixture_no, bn = b.fixture_no == null ? Infinity : b.fixture_no;
        return an !== bn ? an - bn : String(a.component_key).localeCompare(String(b.component_key));
      });
    return { prochain: restants[0] || null, places: comps.length - restants.length, total: comps.length, comps: comps };
  }
  function ouvrirPlacement(nomPole) {
    var box = $("placer"); if (!box) return;
    var pole = poleByName(nomPole);
    box.className = "on";
    var fermer = '<button type="button" class="p-x">' + esc(t("releve_plan_fermer")) + "</button>";
    if (!plan.fiche || !plan.fiche.url) { box.innerHTML = '<div class="p-m">' + esc(t("releve_plan_aucun")) + "</div>" + fermer; }
    else if (plan.fiche.est_pdf) { box.innerHTML = '<div class="p-m">' + esc(t("releve_plan_pdf")) + "</div>" + fermer; }
    else {
      var e = prochainDuPole(nomPole);
      var dit = e.prochain
        ? t("releve_plan_attendu").split("{nom}").join(e.prochain.nom).split("{m}").join(e.prochain.length_m == null ? "?" : String(Math.round(e.prochain.length_m * 100) / 100).replace(".", ","))
        : t("releve_plan_fini");
      var pastilles = e.comps.filter(function (c) { return plan.points[c.component_key]; }).map(function (c) {
        var p = plan.points[c.component_key];
        return '<span class="p-n" style="left:' + (p.x * 100).toFixed(2) + '%;top:' + (p.y * 100).toFixed(2) + '%;">' + esc(c.fixture_no == null ? "·" : String(c.fixture_no)) + "</span>";
      }).join("");
      box.innerHTML = '<div class="p-h"><b>' + esc(t("releve_plan_titre")) + "</b> · " + esc(nomPole)
        + '<span class="p-a">' + esc(t("releve_plan_avancement").split("{fait}").join(String(e.places)).split("{total}").join(String(e.total))) + "</span></div>"
        + '<div class="p-d">' + esc(dit) + (e.prochain ? " — " + esc(t("releve_plan_touchez")) : "") + "</div>"
        + '<div class="p-w"><img class="p-i" alt="" src="' + esc(plan.fiche.url) + '">' + pastilles + '<span class="p-msg"></span></div>' + fermer;
      var img = box.querySelector(".p-i");
      if (img && e.prochain) {
        img.addEventListener("click", function (ev) {
          var f = fractionDuClic(img, ev);
          var msg = box.querySelector(".p-msg");
          fetch("/api/dispositifs/plan", { method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "placer", location_id: (window.MSReleve && window.MSReleve.location_id) || "",
              dispositif_id: (pole && pole.dispositif_id) || "", component_key: e.prochain.component_key, x: f.x, y: f.y }) })
            .then(function (r) { return r.json(); })
            .then(function (j) {
              if (!j || !j.ok) { if (msg) msg.textContent = t("releve_plan_echec"); return; }
              plan.points[e.prochain.component_key] = { component_key: e.prochain.component_key, x: f.x, y: f.y };
              ouvrirPlacement(nomPole);   // le suivant s'annonce ; l'état vient de ce qu'on a écrit
            })
            .catch(function () { if (msg) msg.textContent = t("releve_plan_echec"); });
        });
      }
    }
    box.querySelector(".p-x").addEventListener("click", function () { box.className = ""; box.innerHTML = ""; });
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
      + "\nsc\u00e8ne vs derni\u00e8re photo " + (det.lastScene == null ? "-" : Math.round(det.lastScene * 10) / 10) + "  (nouvelle photo si > " + (Math.round(seuilScene() * 10) / 10) + ")"
      + "\nticks " + diag.ticks + "  vides " + diag.vides + "  flux " + diag.vw + "x" + diag.vh + "  readyState " + diag.readyState
      + (det.lastError ? "\nerreur " + det.lastError : "");
  }
  function tickClock() { $("rl-clock").textContent = run.phase === "idle" ? "0:00" : fmtT(tOff()); peindreDiag(); }
  setInterval(tickClock, 500);

  // ── harnais (identiques) ──────────────────────────────────────────────────
  window.__releveAttach = function (s) { if (run.phase !== "running") start(); attach(s); };
  window.__releveStep = function (dt) { if (run.phase !== "running") start(); if (!stream) stream = true; var x = (det.tick || now()) + (dt || 120); det.tick = x; step(x, dt || 120); return window.__releveState(); };
  window.__releveBilan = bilanDeMarche;
  window.__releveState = function () { return { phase: run.phase, state: det.state, armed: det.armed, m: Math.round(det.lastM * 10) / 10, scene: det.lastScene == null ? null : Math.round(det.lastScene * 10) / 10, s: Math.round(det.lastS), stillAcc: Math.round(det.stillAcc), ticks: det.ticks, lastError: det.lastError, overlay: overlay.style.display === "flex" ? $("ovTitle").textContent : null, etat: etatEl ? etatEl.getAttribute("data-mot") : null, plein_ecran: capture ? !capture.hidden : null, pole: run.pole, poles: POLES.length, items: run.items.map(function (i) { return { seq: i.seq, t: i.t, pole: i.pole, composant: i.comp ? i.comp.component_key : null, etat: i.etat, coverage: i.coverage || null, sharp: i.sharp, bright: i.bright, w: i.w, h: i.h, source: i.source, manual: i.manual, reason: i.reason, removed: !!i.removed, verdict: !!(i.verdictJusqu && i.verdictJusqu > now()) }; }), switches: run.switches.length, problems: run.problems.slice(), mainBtn: $("mainBtn").textContent, clock: $("rl-clock").textContent }; };

  renderPoles();
  if (POLES.length === 1) switchPole(POLES[0].name);
})();
