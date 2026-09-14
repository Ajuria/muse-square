// tools/harness/volet-ligne-verify.mts — LE VOLET SOUS SA RANGÉE, DANS UN VRAI NAVIGATEUR (14/09).
//
// Le calcul de la rangée a ses tests purs (`tests/volet-ligne.test.ts`, 9 cas, deux mutations vues
// tomber). Ce harnais prouve ce qu'aucun test pur ne peut voir : le NOMBRE DE COLONNES n'existe que
// lorsqu'un moteur de rendu a appliqué la CSS. `happy-dom` ne calcule pas de grille ; sous lui,
// `gridTemplateColumns` reste ce qu'on a écrit, et le harnais prouverait sa propre fixture.
//
// Il écrit donc une page qui embarque :
//   · la CSS RÉELLE de `.tb-rbgrid` / `.tb-rb`, extraite OCTET POUR OCTET de `tableau.astro` ;
//   · les 7 pôles RÉELS du compte de l'owner ;
//   · le VRAI `public/js/volet-ligne.js`.
// Elle se conduit ensuite dans le navigateur (3 colonnes, puis 2 sous 640 px — le cas du téléphone).
//
// Usage : npx tsx tools/harness/volet-ligne-verify.mts   puis servir et ouvrir /volet-page.html
import "dotenv/config";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { makeBQClient } from "../../src/lib/bq";
import { listPoles } from "../../src/lib/dispositifs/poleReading";

const OUT = process.env.VOLET_OUT || "/tmp/volet-page.html";
const LOC = "f10c3e58-326e-4e38-947c-d59fcbe51df5";

const astro = readFileSync(new URL("../../src/pages/app/insightevent/tableau.astro", import.meta.url), "utf8");
const lignesCss = astro.split("\n").filter((l) => /^\s*\.tb-rbgrid|^\s*\.tb-rb[\s.{:]|^\s*@media \(max-width: 640px\) \{ \.tb-rbgrid/.test(l));
if (!lignesCss.length) throw new Error("CSS .tb-rbgrid introuvable dans tableau.astro");
const css = lignesCss.join("\n");
console.log(`\nLE VOLET SOUS SA RANGÉE\n\n  CSS extraite de tableau.astro : ${lignesCss.length} règle(s)`);

const poles = await listPoles(makeBQClient(process.env.BQ_PROJECT_ID || "muse-square-open-data"), LOC);
if (!poles.length) throw new Error("aucun pôle sur le compte owner");
console.log(`  pôles réels injectés : ${poles.length} (${poles.map((p) => p.name).join(", ")})`);

const js = readFileSync(new URL("../../public/js/volet-ligne.js", import.meta.url), "utf8");
const tuiles = poles
  .map((p, i) => `<button type="button" class="tb-rb" data-tb-pole="${p.dispositif_id}" data-i="${i}">${p.name}</button>`)
  .join("");

const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Volet sous sa rangée — harnais</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 16px; background: #F8FAFC; }
  h1 { font-size: 14px; color: #6B7280; font-weight: 600; }
${css}
  #tb-pole-panel { background:#fff; border:1px solid #1D3BB3; border-radius:12px; padding:14px 16px; }
  #spy { white-space: pre-wrap; font-family: ui-monospace, monospace; font-size: 12px; background:#111827; color:#E5E7EB; padding:10px; border-radius:8px; margin-top:14px; }
</style></head><body>
<h1>Vos pôles</h1>
<div class="tb-rbgrid" id="grille">${tuiles}</div>
<div id="tb-pole-panel" style="display:none;"></div>
<div id="spy">—</div>
<script>${js}</script>
<script>
  var grille = document.getElementById("grille");
  var pan = document.getElementById("tb-pole-panel");
  // Le MÊME câblage que tableau.astro : innerHTML, affichage, puis MSVolet.placer(pan, b).
  grille.querySelectorAll("[data-tb-pole]").forEach(function (b) {
    b.addEventListener("click", function () {
      pan.innerHTML = "<b>" + b.textContent + "</b> — le détail de ce pôle.";
      pan.style.display = "block";
      window.MSVolet.placer(pan, b);
      grille.querySelectorAll(".tb-rb").forEach(function (c) { c.classList.remove("on"); });
      b.classList.add("on");
      document.getElementById("spy").textContent = JSON.stringify(window.__etat(), null, 1);
    });
  });
  // L'état OBSERVÉ : combien de colonnes le navigateur a vraiment posées, et où le volet a atterri.
  window.__etat = function () {
    var enfants = [].slice.call(grille.children);
    var iPan = enfants.indexOf(pan);
    var tuiles = enfants.filter(function (e) { return e !== pan; });
    var haut = {};
    tuiles.forEach(function (t, i) { var y = Math.round(t.getBoundingClientRect().top); (haut[y] = haut[y] || []).push(i); });
    var rangees = Object.keys(haut).sort(function (a, b) { return a - b; }).map(function (y) { return haut[y]; });
    return {
      colonnes_lues: window.MSVolet.colonnes(grille),
      rangees_observees: rangees,
      volet_dans_la_grille: iPan >= 0,
      volet_apres_index: iPan >= 0 ? iPan - 1 : null,
      volet_pleine_largeur: pan.style.gridColumn === "1 / -1",
      volet_y: Math.round(pan.getBoundingClientRect().top),
      tuiles_y: tuiles.map(function (t) { return Math.round(t.getBoundingClientRect().top); })
    };
  };
  window.__ouvrir = function (i) { grille.querySelector('[data-i="' + i + '"]').click(); return window.__etat(); };
</script></body></html>`;

mkdirSync(dirname(resolve(OUT)), { recursive: true });
writeFileSync(OUT, html, "utf8");
console.log(`\n  page écrite : ${resolve(OUT)}\n  à conduire dans le navigateur : __ouvrir(i) puis __etat()\n`);
