// tools/harness/releve-verify.mts — LE RELEVÉ DE L'ESPACE, vérifié sans téléphone (14/09).
//
// Le proto avait un harnais déterministe ; la page doit garder le même, sinon la vérification du 12/09
// ne vaut plus rien. Ce script fait deux choses, et rien d'autre :
//
//   1. LES PÔLES — il appelle `listPoles` sur le compte de l'owner, EXACTEMENT l'appel que la page fait
//      côté serveur, et dit ce que le relevé proposera : les pôles, et les composants de chacun (la
//      seconde question). Sans composant nommé et sans clé, une photo ne peut pas s'écrire.
//   2. LA PAGE — il EXTRAIT le markup et les styles de `src/pages/app/insightevent/releve.astro`
//      (jamais recopiés : lus dans le fichier, les expressions `{EVOL_COPY.x}` résolues depuis le vrai
//      foyer des chaînes) et écrit un fichier HTML dans le scratchpad, avec les VRAIS pôles injectés,
//      le VRAI module `public/js/releve-espace.js`, et `MSPhotoCapture.envoyer` REMPLACÉ par un espion
//      qui n'envoie rien. Ouvert dans un navigateur, ce fichier EST la page : on y conduit la marche
//      par `__releveStep(dt)` et on lit ce que l'envoi aurait reçu.
//
// Usage : npx tsx tools/harness/releve-verify.mts   puis ouvrir le fichier annoncé.
import "dotenv/config";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { makeBQClient } from "../../src/lib/bq";
import { listPoles } from "../../src/lib/dispositifs/poleReading";
import { EVOL_COPY } from "../../src/lib/commitments/commitmentCopy";

const P = process.env.BQ_PROJECT_ID || "muse-square-open-data";
const LOC = process.env.RELEVE_LOC || "f10c3e58-326e-4e38-947c-d59fcbe51df5";
const OUT = process.env.RELEVE_OUT || "/tmp/releve-page.html";

const bq = makeBQClient(P);
const poles = await listPoles(bq, LOC);
console.log(`\nLE RELEVÉ DE L'ESPACE — ce que la page proposera sur ${LOC}\n`);
console.log(`  pôles servis par listPoles : ${poles.length}`);
let bloques = 0;
for (const p of poles) {
  const comps = p.components || [];
  const utilisables = comps.filter((c) => (c.label || c.type_label_fr) && c.component_key);
  if (!utilisables.length) bloques += 1;
  console.log(`  · ${p.name.padEnd(26)} ${String(comps.length).padStart(3)} composant(s), ${utilisables.length} nommé(s) avec clé`);
}
console.log(bloques ? `\n  ✗ ${bloques} pôle(s) sans composant utilisable : une photo n'y pourrait pas s'écrire.` : `\n  ✓ chaque pôle a de quoi rattacher une photo.`);

// ── la page, extraite du fichier livré ───────────────────────────────────────
const astro = readFileSync("src/pages/app/insightevent/releve.astro", "utf8");
const grab = (open: string, close: string) => {
  const i = astro.indexOf(open); if (i < 0) throw new Error(`bloc absent : ${open}`);
  const j = astro.indexOf(close, i); if (j < 0) throw new Error(`fin de bloc absente : ${close}`);
  return astro.slice(i, j + close.length);
};
const corps = grab('<div class="ms-container" id="rl-root">', "\n    </div>");
const styles = grab("<style is:global>", "</style>");
// Les expressions Astro de la page : `{EVOL_COPY.cle}` et le lien de retour `{"← " + EVOL_COPY.back_pole}`.
const copy: Record<string, string> = EVOL_COPY as any;
const resolu = corps
  .replace(/\{"← " \+ EVOL_COPY\.([A-Za-z0-9_]+)\}/g, (_m, k) => "← " + (copy[k] ?? `?${k}`))
  .replace(/\{EVOL_COPY\.([A-Za-z0-9_]+)\}/g, (_m, k) => copy[k] ?? `?${k}`);
const restantes = resolu.match(/\{[^}]*\}/g);
if (restantes) throw new Error(`expressions Astro non résolues : ${restantes.join(" ")}`);

const injecte = poles.map((p) => ({
  dispositif_id: p.dispositif_id, commitment_id: p.commitment_id, name: p.name,
  components: (p.components || []).map((c) => ({ component_key: c.component_key, label: c.label, type_label_fr: c.type_label_fr, role_label_fr: c.role_label_fr })),
}));
const rl_copy = Object.fromEntries(Object.entries(copy).filter(([k]) => k.startsWith("releve_") || k.startsWith("capture_") || k.startsWith("pole_photo_")));
const js = readFileSync("public/js/releve-espace.js", "utf8");

const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Relevé de l'espace — harnais</title>
<style>:root{--color-brand-blue:#0b37e5}*{box-sizing:border-box}[hidden]{display:none!important}
html,body{margin:0;background:#f5f6f8;color:#111827;font-family:system-ui,-apple-system,sans-serif;font-size:14px}
.ms-btn{display:inline-flex;align-items:center;justify-content:center;font-size:15px;font-weight:500;line-height:1.2;text-transform:uppercase;letter-spacing:.2px;padding:8px 16px;border:1px solid #000;border-radius:0;color:#000;background:transparent;font-family:inherit;cursor:pointer}
#spy{position:fixed;bottom:0;left:0;right:0;max-height:34vh;overflow:auto;background:#111;color:#9f9;font:11px/1.45 ui-monospace,monospace;padding:8px;white-space:pre-wrap;z-index:200}</style>
${styles}
</head><body>
${resolu}
<pre id="spy">harnais prêt — __releveStep(dt) conduit la marche ; l'envoi est espionné, RIEN n'est écrit.</pre>
<script>
  // L'espion REMPLACE le foyer du POST : la page appelle MSPhotoCapture.envoyer, il ne part rien.
  window.__envois = [];
  window.MSPhotoCapture = { envoyer: function (p) {
    window.__envois.push({ dispositif_id: p.dispositif_id, component_key: p.component_key, bytes: String(p.image_base64 || "").length, prefixe: String(p.image_base64 || "").slice(0, 23) });
    document.getElementById("spy").textContent = "ENVOIS ESPIONNÉS\\n" + JSON.stringify(window.__envois, null, 1);
    return Promise.resolve({ ok: true, photo: { photo_id: "espion-" + window.__envois.length } });
  } };
  window.MSReleve = { poles: ${JSON.stringify(injecte)}, copy: ${JSON.stringify(rl_copy)} };
  // La source d'images du harnais : un canvas piloté, à la place de la caméra (comme le proto).
  var c = document.createElement("canvas"); c.width = 640; c.height = 480;
  window.__releveSource = c;
  var g = c.getContext("2d");
  // « bouge » doit VRAIMENT bouger : un décalage tiré à chaque appel, sinon deux images identiques se
  // suivent, le mouvement mesuré est nul et le harnais croit marcher alors qu'il est immobile (défaut
  // vu le 14/09 : 20 pas « en marchant » laissaient une photo en suspens, comptée au pas suivant).
  window.__peindre = function (mode) {
    if (mode === "noir") { g.fillStyle = "#000"; g.fillRect(0, 0, 640, 480); return; }
    if (mode === "plat") { g.fillStyle = "#9a9a9a"; g.fillRect(0, 0, 640, 480); return; }
    var dx = mode === "bouge" ? Math.floor(Math.random() * 600) : 0;
    g.fillStyle = "#e8e2d5"; g.fillRect(0, 0, 640, 480);
    for (var i = 0; i < 24; i++) { g.fillStyle = i % 2 ? "#8a5a2b" : "#3c6e47"; g.fillRect((i * 53 + dx) % 600, 40 + (i % 5) * 84, 44, 64); }
    g.strokeStyle = "#222"; g.lineWidth = 3; for (var y = 30; y < 480; y += 84) { g.beginPath(); g.moveTo(0, y); g.lineTo(640, y); g.stroke(); }
  };
  window.__peindre("net");
  // ── LA VRAIE PHOTO, sans appareil (14/09) ────────────────────────────────────────────────────────
  // __releveCamera(w, h) stubbe ImageCapture et attache un VRAI MediaStream (celui du canvas) : le
  // module croit tenir une caméra, et takePhoto() rend une image de w x h. C'est ce qui permet de
  // vérifier le remplacement de l'image du flux ET le plafond de réduction. Ce code vit dans le
  // harnais, jamais dans le module livré. PIÈGE : attacher une caméra démarre la boucle 120 ms DU
  // MODULE, donc sous ce stub les comptes de photos ne sont plus déterministes — la batterie
  // déterministe (0 photo en marchant, 1 par arrêt) se joue SANS le stub, celle de la photo avec.
  window.__photoPrises = 0;
  window.__releveCamera = function (w, h, doitEchouer) {
    window.ImageCapture = function (piste) {
      this.takePhoto = function () {
        window.__photoPrises += 1;
        if (doitEchouer) return Promise.reject(new Error("NotSupportedError"));
        var cv = document.createElement("canvas"); cv.width = w; cv.height = h;
        var c2 = cv.getContext("2d");
        c2.fillStyle = "#d8cfc0"; c2.fillRect(0, 0, w, h);
        for (var i = 0; i < 200; i++) { c2.fillStyle = i % 2 ? "#7a4a1b" : "#2c5e37"; c2.fillRect((i * 137) % (w - 60), (i * 53) % (h - 80), 52, 72); }
        return new Promise(function (res) { cv.toBlob(function (b) { res(b); }, "image/jpeg", 0.92); });
      };
    };
    window.__releveAttach(c.captureStream(0));
    return "camera stubbee " + w + "x" + h + (doitEchouer ? " (echec force)" : "");
  };
</script>
<script>${js}</script>
</body></html>`;
mkdirSync(dirname(resolve(OUT)), { recursive: true });
writeFileSync(OUT, html, "utf8");
console.log(`\n  page écrite : ${resolve(OUT)}`);
console.log(`  markup ${resolu.length} o, styles ${styles.length} o, module ${js.length} o, ${injecte.length} pôle(s) injecté(s)\n`);
