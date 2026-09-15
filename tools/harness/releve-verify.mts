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
// Les sites du compte, comme la page les lit (nom + nombre de pôles) : le sélecteur du harnais est le
// vrai, pas une maquette.
const [_sitesRows] = await bq.query({
  query: `SELECT location_id, ANY_VALUE(COALESCE(site_name, company_name)) AS label
          FROM \`${P}.raw.insight_event_user_location_profile\`
          WHERE clerk_user_id = (SELECT ANY_VALUE(clerk_user_id) FROM \`${P}.raw.insight_event_user_location_profile\`
                                 WHERE location_id = @l AND clerk_user_id IS NOT NULL)
          GROUP BY 1 ORDER BY 2`,
  params: { l: LOC }, location: "EU",
});
const plat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);
const sitesDuCompte = (_sitesRows as any[]).map((r) => ({ location_id: String(plat(r.location_id)), label: String(plat(r.label) || "") })).filter((x) => x.label);
console.log(`  sites du compte        ${sitesDuCompte.length} (${sitesDuCompte.map((x) => x.label).join(", ")})`);
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
// Les branches SSR de la page, rendues avec les VRAIES valeurs — sinon le harnais ne prouve plus la
// page livrée. Chaque substitution est ancrée sur le texte exact du fichier : si la page change, la
// vérification d'expressions restantes (plus bas) échoue au lieu de rendre une maquette périmée.
const siteRow = `<div id="rl-site"><select id="rl-site-sel">`
  + sitesDuCompte.map((x) => `<option value="${x.location_id}"${x.location_id === LOC ? " selected" : ""}>${x.label}</option>`).join("")
  + `</select><span id="rl-build" title="version">harnais</span></div>`;
const resolu = corps
  .replace(/<div id="rl-site">[\s\S]*?<\/div>\s*(?=<div id="rl-doc">)/, siteRow)
  .replace(/\{poles\.length === 0 && <p id="rl-sans-pole">\{EVOL_COPY\.[A-Za-z0-9_]+\}<\/p>\}/g, poles.length ? "" : `<p id="rl-sans-pole">${copy.capture_aucun_pole}</p>`)
  .replace(/ disabled=\{poles\.length === 0\}/g, poles.length ? "" : " disabled")
  .replace(/\{"← " \+ EVOL_COPY\.([A-Za-z0-9_]+)\}/g, (_m, k) => "← " + (copy[k] ?? `?${k}`))
  .replace(/\{EVOL_COPY\.([A-Za-z0-9_]+)\}/g, (_m, k) => copy[k] ?? `?${k}`);
const restantes = resolu.match(/\{[^}]*\}/g);
if (restantes) throw new Error(`expressions Astro non résolues : ${restantes.join(" ")}`);

// Le N\u00b0 DU PLAN, lu EXACTEMENT comme le rendu serveur de releve.astro le lit : la m\u00eame vue semantic,
// le m\u00eame regroupement, la m\u00eame cl\u00e9 `dispositif:composant`. Si le harnais l'inventait, il prouverait
// son propre code et pas celui de la page \u2014 le d\u00e9faut exact du 14/09 sur les cl\u00e9s de copie.
const _nums: any[] = await bq.query({
  query: `SELECT dispositif_id, component_key,
                 ARRAY_AGG(fixture_no IGNORE NULLS ORDER BY version_no DESC, measured_at DESC LIMIT 1)[SAFE_OFFSET(0)] AS fixture_no,
                 -- 15/09 : la LONGUEUR part avec le numéro, comme sur la page. Un harnais qui injecte
                 -- une charge plus pauvre que la vraie vérifie autre chose que ce qui est servi.
                 ARRAY_AGG(length_m IGNORE NULLS ORDER BY version_no DESC, measured_at DESC LIMIT 1)[SAFE_OFFSET(0)] AS length_m
          FROM \`${P}.semantic.vw_insight_event_component_space\`
          WHERE location_id = @l AND component_key IS NOT NULL
          GROUP BY 1, 2`,
  params: { l: LOC }, types: { l: "STRING" }, location: "EU",
}).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(() => []);
const _flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);
const numeros = new Map<string, number>();
const longueurs = new Map<string, number | null>();
for (const r of _nums) {
  const n = Number(_flat(r.fixture_no));
  const cle = `${String(_flat(r.dispositif_id))}:${String(_flat(r.component_key))}`;
  if (Number.isFinite(n) && n > 0) numeros.set(cle, n);
  const lm = _flat(r.length_m) == null ? null : Number(_flat(r.length_m));
  longueurs.set(cle, Number.isFinite(lm as number) ? (lm as number) : null);
}
console.log(`  N\u00b0 sur le plan : ${numeros.size} composant(s) en portent un`);

const injecte = poles.map((p) => ({
  dispositif_id: p.dispositif_id, commitment_id: p.commitment_id, name: p.name,
  components: (p.components || []).map((c) => ({ component_key: c.component_key, label: c.label, type_label_fr: c.type_label_fr, role_label_fr: c.role_label_fr, fixture_no: numeros.get(`${p.dispositif_id}:${c.component_key}`) ?? null , length_m: longueurs.get(`${p.dispositif_id}:${c.component_key}`) ?? null })),
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
    window.__envois.push({ dispositif_id: p.dispositif_id, component_key: p.component_key, fixture_no: p.fixture_no === undefined ? "ABSENT" : p.fixture_no, walk_id: p.walk_id === undefined ? "ABSENT" : p.walk_id, seq: p.seq === undefined ? "ABSENT" : p.seq, t_offset_s: p.t_offset_s === undefined ? "ABSENT" : p.t_offset_s, bytes: String(p.image_base64 || "").length, prefixe: String(p.image_base64 || "").slice(0, 23) });
    document.getElementById("spy").textContent = "ENVOIS ESPIONNÉS\\n" + JSON.stringify(window.__envois, null, 1);
    return Promise.resolve({ ok: true, photo: { photo_id: "espion-" + window.__envois.length } });
  } };
  window.MSReleve = { poles: ${JSON.stringify(injecte)}, copy: ${JSON.stringify(rl_copy)}, location_id: ${JSON.stringify(LOC)}, build: "harnais" };
  // La marche : espionnee comme les photos, rien ne part.
  window.__marches = [];
  var _fetch = window.fetch;
  window.fetch = function (u, init) {
    if (String(u).indexOf("/api/dispositifs/walks") >= 0) {
      window.__marches.push(JSON.parse(String((init && init.body) || "{}")));
      return Promise.resolve({ json: function () { return Promise.resolve({ ok: true }); } });
    }
    return _fetch.apply(window, arguments);
  };
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
    // « main » = un téléphone TENU : la scène ne change pas, mais elle tremble de quelques pixels et
    // le capteur bruite. C'est le mode qui manquait — le proto était calibré sur une image
    // parfaitement fixe (mouvement 0), alors qu'une main donne 12 à 18 (mesure owner 14/09).
    // « main » et « main2 » : DEUX meubles différents, tenus à la main. Le second existe pour prouver
    // qu'une photo nouvelle vient d'un CHANGEMENT DE SCÈNE, sans dépendre d'une marche détectée.
    var base = mode === "main2" ? 260 : 0;
    var dx = mode === "bouge" ? Math.floor(Math.random() * 600) : (mode === "main" || mode === "main2") ? base + (Math.random() * 6 - 3) : 0;
    var bruit = (mode === "main" || mode === "main2") ? 48 : 0;   // calibré sur la mesure owner du 14/09
    g.fillStyle = "#e8e2d5"; g.fillRect(0, 0, 640, 480);
    for (var i = 0; i < 24; i++) { g.fillStyle = i % 2 ? "#8a5a2b" : "#3c6e47"; g.fillRect((i * 53 + dx) % 600, 40 + (i % 5) * 84, 44, 64); }
    g.strokeStyle = "#222"; g.lineWidth = 3; for (var y = 30; y < 480; y += 84) { g.beginPath(); g.moveTo(0, y); g.lineTo(640, y); g.stroke(); }
    if (bruit) {
      var im = g.getImageData(0, 0, 640, 480), d = im.data;
      for (var k = 0; k < d.length; k += 4) {
        var n = (Math.random() - 0.5) * bruit;
        d[k] += n; d[k + 1] += n; d[k + 2] += n;
      }
      g.putImageData(im, 0, 0);
    }
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
