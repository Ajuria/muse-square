// Dump VISUEL de la page AGIR — boot du harnais (script inline réel + modules réels + payload
// monitor réel) écrit en HTML statique avec le CSS réel de la page, pour comparaison œil-nu
// contre le proto. Usage : npx tsx scripts/pulse-visual-dump.mjs <out.html>
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { Window } from "happy-dom";
import { makeBQClient } from "../src/lib/bq";
import { GET as monitorGET } from "../src/pages/api/insight/monitor";

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
const res = await monitorGET({ url: new URL(`http://l/api/insight/monitor?location_id=${OWNER}&selected_dates=${dates.join(",")}&light=1`), locals });
const monitorPayload = JSON.parse(await res.text());

const astro = readFileSync(new URL("../src/pages/app/insightevent/pulse.astro", import.meta.url), "utf8");
const inline = [...astro.matchAll(/<script is:inline(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).sort((a, b) => b.length - a.length)[0];
const css = [...astro.matchAll(/<style is:inline>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n");
const MODULES = ["ms-loader.js", "reco-library.js", "commit-form.js", "bp-form.js", "action-cards.js", "draft-workspace.js"];
const win = new Window({ url: "https://app.local/app/insightevent/pulse" });
const doc = win.document;
doc.body.innerHTML = '<div id="pls-root"></div>';
const locationsPayload = { ok: true, locations: [{ location_id: OWNER, company_name: "Muse Square" }] };
const fetchStub = (url) => {
  const u2 = String(url);
  let body = { ok: true };
  if (u2.includes("/api/insight/monitor")) body = monitorPayload;
  else if (u2.includes("/api/profile/locations")) body = locationsPayload;
  else if (u2.includes("/api/commitments")) body = { ok: true, commitments: [] };
  else if (u2.includes("/api/competitive/competitor-signals")) body = { ok: true, signals: [], followed_count: 0, followed_competitors: [], top_threats: [] };
  else if (u2.includes("/api/channels/config")) body = { ok: true, channels: [] };
  else if (u2.includes("/api/channels/team")) body = { ok: true, members: [] };
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)) });
};
win.fetch = fetchStub;
for (const m of MODULES) new Function("window", "document", "fetch", readFileSync(new URL("../public/" + m, import.meta.url), "utf8"))(win, doc, fetchStub);
new Function("window", "document", "fetch", "location_id", "sessionStorage", "localStorage", "var locationId = location_id;\n" + inline)(win, doc, fetchStub, OWNER, win.sessionStorage, win.localStorage);
await new Promise((r) => setTimeout(r, 900));
const html = `<!doctype html><html><head><meta charset="utf-8"><title>pulse — dump visuel</title>
<style>
body{font-family:system-ui,-apple-system,sans-serif;background:#F9FAFB;margin:0;padding:24px;color:#111827;
--color-text-primary:#111827;--color-text-secondary:#4B5563;--color-text-tertiary:#9CA3AF;--color-text-muted:#9CA3AF;
--color-border:#E5E7EB;--color-bg-card:#fff;--color-pill-green-text:#166534;}
#wrap{max-width:760px;margin:0 auto;}
${css}
</style></head><body><div id="wrap">${doc.getElementById("pls-root").innerHTML}</div></body></html>`;
writeFileSync(OUT, html);
console.log("dump écrit :", OUT, "—", html.length, "octets");
process.exit(0);
