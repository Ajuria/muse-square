// Vérité RENDU de la LISTE filtrée « Fixer → » (owner 18/08) — le script inline réel de
// evenement.astro sur le payload list=1 réel. Usage : npx tsx scripts/evenement-liste-filtre-verify.mjs
import "dotenv/config";
import { readFileSync } from "node:fs";
import { Window } from "happy-dom";
import { makeBQClient } from "../src/lib/bq";
import { GET as evGET } from "../src/pages/api/insight/evenement.ts";

const P = "muse-square-open-data", OWNER = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
const flat = (v) => (v && typeof v === "object" && "value" in v ? v.value : v);
let fails = 0;
const check = (l, c, d) => { console.log((c ? "  OK " : "  FAIL ") + l + (d !== undefined ? " — " + d : "")); if (!c) fails++; };

const bq = makeBQClient(process.env.BQ_PROJECT_ID || P);
const [[u]] = await bq.query({ query: `SELECT clerk_user_id FROM \`${P}.raw.insight_event_user_location_profile\` WHERE location_id = @l LIMIT 1`, params: { l: OWNER }, location: "EU" });
const locals = { clerk_user_id: String(flat(u.clerk_user_id)), location_id: OWNER, all_location_ids: [OWNER] };
const res = await evGET({ url: new URL("http://l/api/insight/evenement?location_id=" + OWNER + "&list=1"), locals });
const payload = JSON.parse(await res.text());
if (!payload.ok) throw new Error(payload.error);
const events = payload.events || payload.list || [];
const nSans = events.filter((e) => !e.kpi).length;
console.log("payload réel :", events.length, "événements ·", nSans, "sans objectif");

const astro = readFileSync(new URL("../src/pages/app/insightevent/evenement.astro", import.meta.url), "utf8");
const blocks = [...astro.matchAll(/<script is:inline>\n([\s\S]*?)\n\s*<\/script>/g)].map((m) => m[1]).filter((b) => b.indexOf("renderList") >= 0);
if (blocks.length !== 1) throw new Error("script liste introuvable");

function run(urlStr) {
  const win = new Window({ url: urlStr });
  const doc = win.document;
  doc.body.innerHTML = '<div id="evt-root" data-loc="' + OWNER + '" data-item=""><a id="evt-back"></a><div id="evt-head"><div></div><div></div></div><div id="evt-body">Chargement…</div></div>';
  const fetchStub = (url) => Promise.resolve({ json: () => Promise.resolve(String(url).indexOf("list=1") >= 0 ? payload : { ok: false, locations: [] }) });
  new Function("window", "document", "fetch", blocks[0])(win, doc, fetchStub);
  return new Promise((r) => setTimeout(() => r(doc.getElementById("evt-body")), 60));
}

const bodyF = await run("https://app.local/app/insightevent/evenement?filtre=sans_objectif");
const rowsF = bodyF.querySelectorAll('a[href*="saved_item_id="]').length;
check("filtré : rangées = événements sans objectif", rowsF === nSans, rowsF + " vs " + nSans);
check("filtré : en-tête compte + phrase + retour à tout", bodyF.textContent.indexOf(nSans + " événement") >= 0 && bodyF.textContent.indexOf("fixez-le, la mesure fait le reste") >= 0 && bodyF.textContent.indexOf("Tous mes événements") >= 0);
check("filtré : chaque rangée porte la chip « Objectif non fixé »", (bodyF.innerHTML.match(/Objectif non fixé/g) || []).length === nSans);

const bodyT = await run("https://app.local/app/insightevent/evenement");
const rowsT = bodyT.querySelectorAll('a[href*="saved_item_id="]').length;
check("sans filtre : la liste complète est intacte", rowsT === events.length, rowsT + " vs " + events.length);
check("sans filtre : chips « Objectif non fixé » sur les seuls concernés", (bodyT.innerHTML.match(/Objectif non fixé/g) || []).length === nSans);

console.log(fails ? `\n${fails} ÉCHEC(S)` : "\nTOUT VERT");
process.exit(fails ? 1 : 0);
