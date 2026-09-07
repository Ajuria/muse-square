// Dump VISUEL du tableau v11 — même mécanique que tableau-v4-render-verify (le harnais EST la
// page) : payload réel owner + script inline réel + CSS réel de la page, écrits en HTML statique
// pour comparaison œil-nu contre la maquette A v2. Usage : npx tsx tableau-visual-dump.mjs <out.html>
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { Window } from "happy-dom";
import { makeBQClient } from "../../src/lib/bq";
import { GET as dashGET } from "../../src/pages/api/insight/dashboard";

const ROOT = "/Users/julendeajuriaguerra/Documents/Muse_Square/Muse_Square_Website/muse-square";
const PROJECT = "muse-square-open-data";
const OWNER_LOC = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
const OUT = process.argv[2] || "tableau-visual-dump.html";
const flat = (v) => (v && typeof v === "object" && "value" in v ? v.value : v);

const bq = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);
const [[u]] = await bq.query({ query: `SELECT clerk_user_id FROM \`${PROJECT}.raw.insight_event_user_location_profile\` WHERE location_id = @loc LIMIT 1`, params: { loc: OWNER_LOC }, location: "EU" });
const uid = String(flat(u.clerk_user_id));
const [locRows] = await bq.query({ query: `SELECT DISTINCT location_id FROM \`${PROJECT}.raw.insight_event_user_location_profile\` WHERE clerk_user_id = @u`, params: { u: uid }, location: "EU" });
const locals = { clerk_user_id: uid, all_location_ids: locRows.map((r) => String(flat(r.location_id))) };
const res = await dashGET({ url: new URL("http://l/api/insight/dashboard?period=365"), locals });
const payload = JSON.parse(await res.text());
if (!payload.ok) throw new Error("payload en erreur : " + payload.error);

const astro = readFileSync(ROOT + "/src/pages/app/insightevent/tableau.astro", "utf8");
const m = astro.match(/<script is:inline>\n([\s\S]*?)\n {4}<\/script>/);
if (!m) throw new Error("script inline introuvable");
const css = astro.match(/<style[^>]*>([\s\S]*?)<\/style>/);

const win = new Window({ url: "https://app.local/app/insightevent/tableau" });
const doc = win.document;
doc.body.innerHTML = '<div id="tb-root" data-loc=""><a id="tb-new" href="#"></a><div id="tb-body"></div></div>';
const fetchStub = (url) => Promise.resolve({ json: () => Promise.resolve(String(url).indexOf("/api/insight/dashboard") >= 0 ? payload : { ok: false }) });
new Function("window", "document", "fetch", "alert", m[1])(win, doc, fetchStub, () => {});
await new Promise((r) => setTimeout(r, 60));

const html = `<!doctype html><html><head><meta charset="utf-8"><title>tableau v11 — dump visuel</title>
<style>
@font-face{font-family:'Avenir LT Pro';src:url('http://localhost:4321/fonts/AvenirLTProBook.woff2') format('woff2');font-weight:400;}
@font-face{font-family:'Avenir LT Pro';src:url('http://localhost:4321/fonts/AvenirLTProMedium.woff2') format('woff2');font-weight:500;}
@font-face{font-family:'Avenir LT Pro';src:url('http://localhost:4321/fonts/AvenirLTProHeavy.woff2') format('woff2');font-weight:700;}
body{font-family:'Avenir LT Pro',system-ui,sans-serif;background:#F7F8FA;margin:0;padding:24px;color:#111827;}
#wrap{max-width:1080px;margin:0 auto;}
${css ? css[1] : ""}
</style></head><body><div id="wrap"><div id="tb-root">${doc.getElementById("tb-root").innerHTML}</div></div></body></html>`;
writeFileSync(OUT, html);
console.log("dump écrit :", OUT, "—", html.length, "octets");
