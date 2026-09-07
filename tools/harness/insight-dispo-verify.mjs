// Vérité RENDU du contrôle Fait/Pas menée sur la page carte (décision owner 18/08) —
// loadDisposition RÉEL extrait d'insight.astro, engagements RÉELS (GET direct), POST stubé.
// Usage : npx tsx tools/harness/insight-dispo-verify.mjs
import "dotenv/config";
import { readFileSync } from "node:fs";
import { Window } from "happy-dom";
import { makeBQClient } from "../../src/lib/bq";
import { GET as comGET } from "../../src/pages/api/commitments/index.ts";

const P = "muse-square-open-data", OWNER = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
const flat = (v) => (v && typeof v === "object" && "value" in v ? v.value : v);
let fails = 0;
const check = (l, c, d) => { console.log((c ? "  OK " : "  FAIL ") + l + (d !== undefined ? " — " + d : "")); if (!c) fails++; };

const bq = makeBQClient(process.env.BQ_PROJECT_ID || P);
const [[u]] = await bq.query({ query: `SELECT clerk_user_id FROM \`${P}.raw.insight_event_user_location_profile\` WHERE location_id = @l LIMIT 1`, params: { l: OWNER }, location: "EU" });
const locals = { clerk_user_id: String(flat(u.clerk_user_id)), location_id: OWNER, all_location_ids: [OWNER] };
const res = await comGET({ url: new URL("http://l/api/commitments?location_id=" + OWNER), locals });
const payload = JSON.parse(await res.text());
const open = (payload.items || []).filter((it) => it.status === "open");
if (!open.length) throw new Error("aucun engagement ouvert réel — test impossible");
const target = open[0];
console.log("engagement ouvert réel :", String(target.committed_action_text).slice(0, 50), "· origin:", target.origin_action_type, "· done:", target.action_done_status);

const astro = readFileSync(new URL("../../src/pages/app/insightevent/insight.astro", import.meta.url), "utf8");
const m = astro.match(/(function loadDisposition\(locId, actionType, container\) \{[\s\S]*?\n {6}\})\n\n {6}function loadTrackRecord/);
if (!m) throw new Error("loadDisposition introuvable");

const win = new Window({ url: "https://app.local/x" });
const doc = win.document;
doc.body.innerHTML = '<div id="z1"></div><div id="z2"></div>';
let posted = null;
const fetchStub = (url, opts) => {
  if (String(url).indexOf("/api/commitments/disposition") >= 0) { posted = JSON.parse(opts.body); return Promise.resolve({ json: () => Promise.resolve({ ok: true }) }); }
  return Promise.resolve({ json: () => Promise.resolve(payload) });
};
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const fn = new Function("fetch", "esc", "document", m[1] + "; return loadDisposition;")(fetchStub, esc, doc);

// 1. Type SANS engagement ouvert → zone vide (contrôle absent, pas un placeholder).
fn(OWNER, "type_inexistant_xyz", doc.getElementById("z2"));
await new Promise((r) => setTimeout(r, 40));
check("aucun engagement ouvert du type → zone vide", doc.getElementById("z2").innerHTML === "");

// 2. Type de l'engagement ouvert réel → contrôle rendu, sémantique Pulse.
fn(OWNER, target.origin_action_type, doc.getElementById("z1"));
await new Promise((r) => setTimeout(r, 40));
const z1 = doc.getElementById("z1");
check("engagement ouvert → contrôle rendu (texte + menée par défaut + 2 gestes)",
  z1.textContent.indexOf("Engagement en cours") >= 0
  && z1.textContent.indexOf(String(target.committed_action_text).slice(0, 30)) >= 0
  && z1.textContent.indexOf("menée par défaut") >= 0
  && !!z1.querySelector('[data-fs-dispo="fait"]') && !!z1.querySelector('[data-fs-dispo="pas_encore"]'));

// 3. Clic « Fait » → POST au bon endpoint avec la bonne clé, re-rendu en coche.
z1.querySelector('[data-fs-dispo="fait"]').click();
await new Promise((r) => setTimeout(r, 40));
check("clic Fait → POST disposition {commitment_id, fait}", posted && posted.commitment_id === target.commitment_id && posted.action_done_status === "fait", JSON.stringify(posted));
check("re-rendu : « Action menée » (coche), gestes retirés", z1.textContent.indexOf("Action menée") >= 0 && !z1.querySelector('[data-fs-dispo="fait"]'));

console.log(fails ? `\n${fails} ÉCHEC(S)` : "\nTOUT VERT");
process.exit(fails ? 1 : 0);
