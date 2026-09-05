// Dump VISUEL de la page AGIR — boot du harnais (script inline réel + modules réels + payload
// monitor réel) écrit en HTML statique avec le CSS réel de la page, pour comparaison œil-nu
// contre le proto. Usage : npx tsx tools/harness/pulse-visual-dump.mjs <out.html>
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { Window } from "happy-dom";
import { makeBQClient } from "../../src/lib/bq";
import { GET as monitorGET } from "../../src/pages/api/insight/monitor";

const PROJECT = "muse-square-open-data";
const OWNER = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
const OUT = process.argv[2] || "pulse-dump.html";
const flat = (v) => (v && typeof v === "object" && "value" in v ? v.value : v);
const bq = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);
const [[u]] = await bq.query({ query: `SELECT clerk_user_id FROM \`${PROJECT}.raw.insight_event_user_location_profile\` WHERE location_id = @l LIMIT 1`, params: { l: OWNER }, location: "EU" });
const uid = String(flat(u.clerk_user_id));
const today = new Date();
const dates = [];
for (let i = 0; i < 7; i++) dates.push(new Date(today.getTime() + i * 86_400_000).toISOString().slice(0, 10));
const locals = { clerk_user_id: uid, location_id: OWNER, all_location_ids: [OWNER] };
// MULTI-SITE réel (owner 25/08 : le dump mono cachait chips site, vue agrégée, périodes taguées).
const [siteRows] = await bq.query({ query: `SELECT location_id, ANY_VALUE(company_name) AS label FROM \`${PROJECT}.raw.insight_event_user_location_profile\` WHERE clerk_user_id = @u GROUP BY 1`, params: { u: uid }, location: "EU" });
const sites = siteRows.map((r) => ({ location_id: String(flat(r.location_id)), company_name: String(flat(r.label) || "") }));
const payloadBySite = {};
for (const s of sites) {
  const r2 = await monitorGET({ url: new URL(`http://l/api/insight/monitor?location_id=${s.location_id}&selected_dates=${dates.join(",")}&light=1`), locals: { clerk_user_id: uid, location_id: s.location_id, all_location_ids: sites.map((x) => x.location_id) } });
  payloadBySite[s.location_id] = JSON.parse(await r2.text());
  console.log(s.company_name, "· candidates:", (payloadBySite[s.location_id].action_candidates || []).length);
}

const astro = readFileSync(new URL("../../src/pages/app/insightevent/pulse.astro", import.meta.url), "utf8");
const inline = [...astro.matchAll(/<script is:inline(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).sort((a, b) => b.length - a.length)[0];
const css = [...astro.matchAll(/<style is:inline>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n");
const MODULES = ["ms-loader.js", "reco-library.js", "commit-form.js", "bp-form.js", "action-cards.js", "draft-workspace.js"];
const win = new Window({ url: "https://app.local/app/insightevent/pulse" });
const doc = win.document;
// Le squelette de l'en-tête (loc-row) fait partie de la page — les SEGMENTS de site (Inc C)
// s'y montent, hors #pls-root : sans lui, le dump les cacherait.
doc.body.innerHTML = '<div class="pls-loc-row" style="margin-bottom:16px;"><div>'
  + '<div class="pls-loc-name" id="pls-loc-name"></div>'
  + '<div id="pls-site-segs" class="pls-seg-wrap" style="display:none;"></div>'
  + '<div class="pls-loc-addr" id="pls-loc-addr"></div>'
  + '<div id="pls-subtitle" style="font-size:11px;font-weight:600;letter-spacing:0.10em;text-transform:uppercase;color:#9CA3AF;margin-top:4px;"></div>'
  + '</div></div><div id="pls-root"></div>';
const locationsPayload = { ok: true, locations: sites };
const fetchStub = (url) => {
  const u2 = String(url);
  let body = { ok: true };
  if (u2.includes("/api/insight/monitor")) { const m2 = u2.match(/location_id=([0-9a-f-]+)/); body = payloadBySite[m2 ? m2[1] : OWNER] || { ok: false }; }
  else if (u2.includes("/api/profile/locations")) body = locationsPayload;
  else if (u2.includes("/api/commitments")) body = { ok: true, commitments: [] };
  else if (u2.includes("/api/competitive/competitor-signals")) body = { ok: true, signals: [], followed_count: 0, followed_competitors: [], top_threats: [] };
  else if (u2.includes("/api/channels/config")) body = { ok: true, channels: [] };
  else if (u2.includes("/api/channels/team")) body = { ok: true, members: [] };
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)) });
};
win.fetch = fetchStub;
for (const m of MODULES) new Function("window", "document", "fetch", readFileSync(new URL("../../public/" + m, import.meta.url), "utf8"))(win, doc, fetchStub);
new Function("window", "document", "fetch", "location_id", "sessionStorage", "localStorage", "var locationId = location_id;\n" + inline)(win, doc, fetchStub, OWNER, win.sessionStorage, win.localStorage);
await new Promise((r) => setTimeout(r, 900));
// Segments de site (Inc C) — vérité COMPORTEMENT : 1 + N segments, le clic filtre le fil au
// site et le retour « Tous les sites » restaure l'agrégat. Échec = dump non écrit.
{
  const segs = [...doc.querySelectorAll("#pls-site-segs .pls-seg")];
  if (segs.length !== sites.length + 1) { console.error("SEGMENTS : " + segs.length + " rendus, attendu " + (sites.length + 1)); process.exit(1); }
  const siteBtn = segs.find((b) => b.getAttribute("data-seg-site") !== "__all__");
  siteBtn.click();
  await new Promise((r) => setTimeout(r, 400));
  const blocksSingle = doc.querySelectorAll("#pls-root [data-t-cards]").length;
  const onAfter = doc.querySelector("#pls-site-segs .pls-seg.is-on");
  if (!onAfter || onAfter.getAttribute("data-seg-site") === "__all__") { console.error("SEGMENTS : l'état actif n'a pas suivi le clic"); process.exit(1); }
  segs.find((b) => b.getAttribute("data-seg-site") === "__all__").click();
  await new Promise((r) => setTimeout(r, 400));
  console.log("segments : " + segs.length + " rendus · clic site OK (blocs=" + blocksSingle + ") · retour Tous OK");
}
const html = `<!doctype html><html><head><meta charset="utf-8"><title>pulse — dump visuel</title>
<style>
body{font-family:system-ui,-apple-system,sans-serif;background:#F9FAFB;margin:0;padding:24px;color:#111827;
--color-text-primary:#111827;--color-text-secondary:#4B5563;--color-text-tertiary:#9CA3AF;--color-text-muted:#9CA3AF;
--color-border:#E5E7EB;--color-bg-card:#fff;--color-pill-green-text:#166534;}
#wrap{max-width:760px;margin:0 auto;}
${css}
</style></head><body><div id="wrap">${doc.body.querySelector(".pls-loc-row").outerHTML}${doc.getElementById("pls-root").outerHTML}</div></body></html>`;
writeFileSync(OUT, html);
console.log("dump écrit :", OUT, "—", html.length, "octets");
process.exit(0);
