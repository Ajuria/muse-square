// Vérité RENDU du Profil stratégique refondu — le script inline réel de competitor.astro exécuté
// dans happy-dom sur la VRAIE réponse competitor-profile (Guimet : analyse + actu). Le harnais
// EST la page. Usage : npx tsx scripts/competitor-render-verify.mjs
import "dotenv/config";
import { readFileSync } from "node:fs";
import { Window } from "happy-dom";
import { makeBQClient } from "../src/lib/bq";
import { GET as profileGET } from "../src/pages/api/competitive/competitor-profile.ts";

const P = "muse-square-open-data";
const OWNER = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
const flat = (v) => (v && typeof v === "object" && "value" in v ? v.value : v);
let fails = 0;
const check = (label, cond, detail) => {
  console.log((cond ? "  OK " : "  FAIL ") + label + (detail !== undefined ? " — " + String(detail).slice(0, 120) : ""));
  if (!cond) fails++;
};

const bq = makeBQClient(process.env.BQ_PROJECT_ID || P);
const [[row]] = await bq.query({
  query: `SELECT cd.competitor_id cid,
                 (SELECT ANY_VALUE(clerk_user_id) FROM \`${P}.raw.insight_event_user_location_profile\` p WHERE p.location_id = @l) uid
          FROM \`${P}.raw.competitor_directory\` cd
          WHERE cd.competitor_name LIKE '%Guimet%' AND cd.deleted_at IS NULL LIMIT 1`,
  params: { l: OWNER }, location: "EU",
});
const cid = String(flat(row.cid));
const locals = { clerk_user_id: String(flat(row.uid)), location_id: OWNER };
const res = await profileGET({ url: new URL("http://l/api/competitive/competitor-profile?id=" + encodeURIComponent(cid)), locals });
const payload = JSON.parse(await res.text());
if (!payload.ok) throw new Error("profil KO : " + payload.error);

const astro = readFileSync(new URL("../src/pages/app/insightevent/competitor.astro", import.meta.url), "utf8");
const m = astro.match(/<script is:inline define:vars=\{\{ location_id \}\}>\n([\s\S]*?)\n\s*<\/script>/);
if (!m) throw new Error("script inline introuvable");
const src = m[1].replace(/^\s*\/\/ @ts-nocheck\n/, "");

const win = new Window({ url: "https://app.local/app/insightevent/competitor?id=" + encodeURIComponent(cid) });
const doc = win.document;
doc.body.innerHTML = '<div id="cp-loading"></div><div id="cp-error" style="display:none;"></div><div id="cp-content" style="display:none;"></div>';
const fetchStub = () => Promise.resolve({ json: () => Promise.resolve(payload) });
new Function("window", "document", "fetch", "location_id", src)(win, doc, fetchStub, OWNER);
await new Promise((r) => setTimeout(r, 50));

const c = doc.getElementById("cp-content");
const t = c.textContent;
check("rendu affiché (loader éteint)", c.style.display === "block" && doc.getElementById("cp-loading").style.display === "none");
check("en-tête document : kicker + nom + liseré", t.indexOf("Profil stratégique") >= 0 && t.indexOf("Guimet") >= 0 && c.innerHTML.indexOf("border-bottom:2px solid #1D3BB3") >= 0);
check("sections grammaire engagement : Offre · Publics/Clients visés · Actualité commerciale", t.indexOf("Offre") >= 0 && t.indexOf("Publics/Clients visés") >= 0 && t.indexOf("Actualité commerciale") >= 0);
check("verdict ou absence dite", payload.analysis ? t.indexOf(payload.analysis.verdict.slice(0, 30)) >= 0 : /pas encore générée|Ajoutez une URL/.test(t));
check("actu réelle rendue (Guimet a été lu cette nuit)", payload.actu && payload.actu.mises.length ? t.indexOf(payload.actu.mises[0].titre.slice(0, 20)) >= 0 && t.indexOf("Web — non vérifié") >= 0 : t.indexOf("Pas encore lue") >= 0, payload.actu ? payload.actu.mises.length + " mises" : "sans actu");
check("recouvrement mesuré quand le mart le porte", payload.threat && payload.threat.audience_overlap_pct != null ? t.indexOf("Recouvrement mesuré") >= 0 : true);
check("ancienne UI morte : zéro onglet cp-tab, zéro icône ti-", c.innerHTML.indexOf("cp-tab") < 0 && c.innerHTML.indexOf("ti ti-") < 0);
check("gestes : Communiquer → + Consulter → (externe) — labels existants seulement", t.indexOf("Communiquer →") >= 0 && (payload.directory.source_url ? t.indexOf("Consulter →") >= 0 : true) && t.indexOf("Sa page") < 0 && t.indexOf("Profil stratégique →") < 0);

console.log(fails ? `\n${fails} ÉCHEC(S)` : "\nTOUT VERT");
process.exit(fails ? 1 : 0);
