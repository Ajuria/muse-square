// tools/harness/depot-plan-verify.mts — LE DÉPÔT DU PLAN, JOUÉ COMME UN GESTE (owner 15/09).
//
// POURQUOI CE FICHIER EXISTE. J'ai livré le bandeau du plan, vérifié qu'il se RENDAIT, et annoncé à
// l'owner qu'il pouvait déposer son plan. Le bouton était MORT : mes écouteurs étaient posés sur la
// section Composants, et le bandeau est une section SŒUR. Un rendu vérifié ne prouve pas un geste.
// Ce harnais écrit une page qui exécute le VRAI kit ET le VRAI câblage d'EngagementDoc (extrait
// BYTE-EXACT du .astro, jamais recopié), avec `fetch` espionné : on y joue le clic ET le
// glisser-déposer, et on lit ce qui serait parti à l'API.
//
// Usage : npx tsx tools/harness/depot-plan-verify.mts --out=<chemin.html>   puis ouvrir la page et
//         appeler window.__essai("clic") / window.__essai("glisser") dans la console.
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import * as vm from "node:vm";
import { makeBQClient } from "../../src/lib/bq";
import { listPoles } from "../../src/lib/dispositifs/poleReading";
import { GET as evoGET } from "../../src/pages/api/commitments/evolution";
import { EVOL_COPY } from "../../src/lib/commitments/commitmentCopy";

const P = "muse-square-open-data";
const LOC = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
const OUT = (process.argv.find((a) => a.startsWith("--out=")) || "").slice(6) || "/tmp/depot-plan.html";

const bq = makeBQClient(process.env.BQ_PROJECT_ID || P);
const [[u]] = await bq.query({
  query: `SELECT clerk_user_id FROM \`${P}.raw.insight_event_user_location_profile\` WHERE location_id = @l AND clerk_user_id IS NOT NULL LIMIT 1`,
  params: { l: LOC }, location: "EU",
});
const userId = String((u as any)?.clerk_user_id?.value ?? (u as any)?.clerk_user_id ?? "");
const poles = await listPoles(bq, LOC);
const pole = poles.find((x) => x.name === "Cuisine") || poles[0];
const res: any = await (evoGET as any)({
  url: new URL(`http://l/api/commitments/evolution?commitment_id=${encodeURIComponent(String(pole.commitment_id))}`),
  locals: { clerk_user_id: userId },
});
const data = await res.json();
if (!data?.ok) { console.error("evolution :", data?.error); process.exit(2); }

const kitSrc = readFileSync("public/js/card-kit.js", "utf8");
const bac: any = { window: {}, console }; bac.window.window = bac.window;
vm.createContext(bac);
vm.runInContext(kitSrc, bac, { filename: "card-kit.js" });
const corps = String(bac.window.MSCardKit.renderEvolution(data, EVOL_COPY));

// LE CÂBLAGE, EXTRAIT BYTE-EXACT du composant — jamais retapé. S'il change, ce harnais suit.
const astro = readFileSync("src/components/EngagementDoc.astro", "utf8");
const m = /<script is:inline define:vars=\{\{[^}]*\}\}>([\s\S]*?)<\/script>/.exec(astro);
if (!m) { console.error("câblage introuvable dans EngagementDoc.astro"); process.exit(3); }
const cablage = m[1];
if (cablage.indexOf("data-eg-depot-plan") < 0) { console.error("le câblage extrait ne parle pas du dépôt"); process.exit(4); }
console.log(`câblage extrait : ${cablage.length} octets · mentions du dépôt : ${(cablage.match(/data-eg-depot/g) || []).length}`);

writeFileSync(OUT, `<!doctype html><meta charset="utf-8"><title>Dépôt du plan — geste joué</title>
<style>body{font-family:system-ui,sans-serif;margin:20px;background:#F8FAFC;}
.eg-doc{max-width:860px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:24px;}
.eg-sec{margin:0 0 20px;} .eg-uc{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin-bottom:8px;}
#espion{position:fixed;right:10px;bottom:10px;max-width:46%;background:#111827;color:#E5E7EB;font:12px ui-monospace,monospace;padding:10px;border-radius:8px;white-space:pre-wrap;}</style>
<div id="eng-root" data-id="${String(pole.commitment_id)}"><div id="eng-status" style="display:none;"></div>
<div id="eng-doc" class="eg-doc">${corps}</div></div>
<div id="espion">—</div>
<script>${kitSrc}</script>
<script>
  // fetch ESPIONNÉ. Il doit RÉPONDRE aux chargements de la page (sinon le câblage ne s'installe jamais
  // et le harnais prouverait son propre stub) et n'intercepter QUE le dépôt. Premier jet : tout était
  // coupé, les deux gestes semblaient morts — le harnais mentait, pas le code.
  window.__envois = [];
  window.fetch = function (u, o) {
    var url = String(u);
    if (url.indexOf("/api/dispositifs/plan") >= 0) {
      window.__envois.push({ url: url, corps: o && o.body ? JSON.parse(String(o.body)) : null });
      peindre();
      return Promise.resolve({ json: function () { return Promise.resolve({ ok: false, refus: "essai" }); } });
    }
    if (url.indexOf("/api/commitments/evolution") >= 0) {
      return Promise.resolve({ json: function () { return Promise.resolve(window.__data); } });
    }
    if (url.indexOf("/api/dispositifs/photos") >= 0) {
      // Une VRAIE photo sur le premier composant : sans elle, aucune ligne ne porte « Déplacer → » et
      // le harnais conclurait « geste absent » sur une page qui n'avait simplement rien à déplacer.
      if (o && o.method === "POST") {
        window.__envois.push({ url: url, corps: o.body ? JSON.parse(String(o.body)) : null });
        peindre();
        // Le stub répond comme la VRAIE règle sur le compte : n° 3 est en Cuisine, donc changement de pôle ;
        // n° 99 n'existe pas. Sans ces cas, le harnais ne prouverait que le chemin heureux.
        var n = String((o.body ? JSON.parse(String(o.body)) : {}).vers_fixture_no || "");
        var rep = n === "3" ? { ok: true, plan: { vers: { nom: "N° 3 — Récipients", pole_label: "Cuisine" }, depuis: { pole_label: "Cave" }, change_de_pole: true } }
          : n === "99" ? { ok: false, refus: "numero_inconnu" }
          : { ok: true, plan: { vers: { nom: "N° 7 — Vin & Spiritueux", pole_label: "Cave" }, depuis: { pole_label: "Cave" }, change_de_pole: false } };
        return Promise.resolve({ json: function () { return Promise.resolve(rep); } });
      }
      return Promise.resolve({ json: function () { return Promise.resolve({ ok: true, photos: [window.__photo] }); } });
    }
    return Promise.resolve({ json: function () { return Promise.resolve({ ok: true }); } });
  };
  function peindre() {
    var e = document.getElementById("espion");
    e.textContent = window.__envois.length
      ? window.__envois.map(function (x) {
          var c = x.corps || {};
          return x.url + "\\n  location_id: " + (c.location_id || "—") + "\\n  content_type: " + (c.content_type || "—")
            + "\\n  nom: " + (c.original_name || "—") + "\\n  octets base64: " + String(c.file_base64 || "").length;
        }).join("\\n\\n")
      : "aucun envoi";
  }
  peindre();
  window.__data = ${JSON.stringify(data)};
  window.__photo = ${JSON.stringify({ photo_id: "ph-essai", component_key: null, status: "read", url: "/api/x", created_at: "2026-09-14T20:12:00Z", questions: [], checklist: {}, items_matched: [], fixture_no: null })};
  window.__photo.component_key = (window.__data.commitment.components || [{}])[0].key || "k1";
  var COPY = ${JSON.stringify(EVOL_COPY)};
  // PAGE est une CHAINE ("pole" ou "engagement"), pas un objet : la page compare nature contre PAGE
  // et REDIRIGE si ca differe. Premier jet du harnais : je passais un objet, la page partait en
  // redirection avant de cabler quoi que ce soit, et les deux gestes semblaient morts. Le harnais
  // mentait, pas le code : troisieme fois de suite sur ce geste.
  var PAGE = "pole";
</script>
<script>${cablage}</script>
<script>
  // LE GESTE DE DÉPLACEMENT d'une photo, joué lui aussi : il vit dans la MÊME page, et c'est le
  // deuxième geste que j'avais livré sans jamais l'avoir joué.
  window.__essaiDeplacer = function () {
    var b = document.querySelector("[data-eg-photo-deplacer]");
    if (!b) return { geste: "deplacer", bouton_present: false };
    b.click();
    var champ = document.querySelector("[data-eg-deplacer-no]");
    if (!champ) return { geste: "deplacer", bouton_present: true, champ_ouvert: false };
    champ.value = "7";
    champ.dispatchEvent(new Event("input", { bubbles: true }));
    var go = document.querySelector("[data-eg-deplacer-go]");
    if (go) go.click();
    return { geste: "deplacer", bouton_present: true, champ_ouvert: true, confirmer_present: !!go };
  };

  // LES DEUX GESTES DU PLAN, jouables depuis la console : __essai("clic") et __essai("glisser").
  window.__essai = function (quoi) {
    var zone = document.querySelector("[data-eg-depot-plan]");
    if (!zone) return "pas de zone de dépôt";
    var f = new File([new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52])], "plan-essai.pdf", { type: "application/pdf" });
    if (quoi === "glisser") {
      var dt = new DataTransfer(); dt.items.add(f);
      zone.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt }));
      var marque = zone.getAttribute("data-survol") === "1";
      zone.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
      return { geste: "glisser", zone_marquee_au_survol: marque };
    }
    // Le CLIC : on vérifie qu'il atteint le sélecteur caché (sans ouvrir de fenêtre système).
    var inp = zone.querySelector("[data-eg-depot-fichier]");
    var ouvert = false; inp.click = function () { ouvert = true; };
    zone.querySelector("[data-eg-depot-choisir]").click();
    if (!ouvert) return { geste: "clic", selecteur_ouvert: false };
    // puis le choix du fichier, comme le navigateur l'annonce
    var dt2 = new DataTransfer(); dt2.items.add(f);
    inp.files = dt2.files;
    inp.dispatchEvent(new Event("change", { bubbles: true }));
    return { geste: "clic", selecteur_ouvert: true };
  };
</script>`, "utf8");
console.log(`page écrite : ${OUT}`);
