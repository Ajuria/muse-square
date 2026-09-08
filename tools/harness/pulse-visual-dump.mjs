// Dump VISUEL de la page AGIR — boot du harnais (script inline réel + modules réels + payload
// monitor réel) écrit en HTML statique avec le CSS réel de la page, pour comparaison œil-nu
// contre le proto. Usage : npx tsx tools/harness/pulse-visual-dump.mjs <out.html>
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { Window } from "happy-dom";
import { makeBQClient } from "../../src/lib/bq";
import { GET as monitorGET } from "../../src/pages/api/insight/monitor";
import { GET as slotsGET } from "../../src/pages/api/insight/explorer-slots";

const PROJECT = "muse-square-open-data";
const OWNER = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
const OUT = process.argv[2] || "pulse-dump.html";
const flat = (v) => (v && typeof v === "object" && "value" in v ? v.value : v);
const bq = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);
const [[u]] = await bq.query({ query: `SELECT clerk_user_id FROM \`${PROJECT}.raw.insight_event_user_location_profile\` WHERE location_id = @l LIMIT 1`, params: { l: OWNER }, location: "EU" });
const uid = String(flat(u.clerk_user_id));
// PULSE_DUMP_DATES=2026-08-09[,…] rejoue le fil d'une date PASSÉE (07/09 : montrer une carte heure réelle,
// absente du fil du jour — les mouvements de septembre sont retenus par la porte de régime).
const today = process.env.PULSE_DUMP_DATES ? new Date(process.env.PULSE_DUMP_DATES.split(",")[0] + "T00:00:00Z") : new Date();
const dates = process.env.PULSE_DUMP_DATES ? process.env.PULSE_DUMP_DATES.split(",") : [];
if (!dates.length) for (let i = 0; i < 7; i++) dates.push(new Date(today.getTime() + i * 86_400_000).toISOString().slice(0, 10));
const locals = { clerk_user_id: uid, location_id: OWNER, all_location_ids: [OWNER] };
// MULTI-SITE réel (owner 25/08 : le dump mono cachait chips site, vue agrégée, périodes taguées).
const [siteRows] = await bq.query({ query: `SELECT location_id, ANY_VALUE(company_name) AS label FROM \`${PROJECT}.raw.insight_event_user_location_profile\` WHERE clerk_user_id = @u GROUP BY 1`, params: { u: uid }, location: "EU" });
const sites = siteRows.map((r) => ({ location_id: String(flat(r.location_id)), company_name: String(flat(r.label) || "") }));
const payloadBySite = {};
for (const s of sites) {
  const r2 = await monitorGET({ url: new URL(`http://l/api/insight/monitor?location_id=${s.location_id}&selected_dates=${dates.join(",")}&light=1`), locals: { clerk_user_id: uid, location_id: s.location_id, all_location_ids: sites.map((x) => x.location_id) } });
  payloadBySite[s.location_id] = JSON.parse(await r2.text());
  // PULSE_DUMP_TYPES=hour_share_move[,…] ne garde que ces cartes (07/09 : isoler une carte que le
  // plafond du fil masque — 7 rendues sur 33 le 28/08 — pour la montrer telle que Pulse la rend).
  if (process.env.PULSE_DUMP_TYPES) {
    const keep = new Set(process.env.PULSE_DUMP_TYPES.split(","));
    payloadBySite[s.location_id].action_candidates = (payloadBySite[s.location_id].action_candidates || []).filter((c) => keep.has(c.action_type));
  }
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
const fetchStub = async (url, init) => {
  const u2 = String(url);
  let body = { ok: true };
  // Note-cause dans le fil (08/09) : créneaux RÉELS par site ; l'écriture est un stub (aucune ligne écrite).
  if (u2.includes("/api/insight/explorer-slots")) { const m3 = u2.match(/location_id=([0-9a-f-]+)/); const lid = m3 ? m3[1] : OWNER; const r3 = await slotsGET({ url: new URL("http://l" + u2), locals: { clerk_user_id: uid, location_id: lid, all_location_ids: sites.map((x) => x.location_id), role: "owner" } }); body = JSON.parse(await r3.text()); console.log("  slots", lid.slice(0, 8), "ok=" + body.ok, body.error || "", "n=" + ((body.cards || []).length), "note=" + ((body.cards || []).filter((x) => x.kind === "note").length)); }
  else if (u2.includes("/api/insight/day-notes")) { body = { ok: true }; console.log("  day-notes POST", String(init && init.body || "").slice(0, 120)); }
  else
  if (u2.includes("/api/insight/monitor")) { const m2 = u2.match(/location_id=([0-9a-f-]+)/); body = payloadBySite[m2 ? m2[1] : OWNER] || { ok: false }; }
  else if (u2.includes("/api/profile/locations")) body = locationsPayload;
  else if (u2.includes("/api/commitments")) body = { ok: true, commitments: [] };
  else if (u2.includes("/api/competitive/competitor-signals")) body = { ok: true, signals: [], followed_count: 0, followed_competitors: [], top_threats: [] };
  else if (u2.includes("/api/channels/config")) body = { ok: true, channels: [] };
  else if (u2.includes("/api/channels/team")) body = { ok: true, members: [] };
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
};
win.fetch = fetchStub;
// Horloge GELÉE sur la date rejouée : les cartes de performance (MS_INTERNAL_ALERT_TYPES, dont la
// carte heure) ne se rendent que si le jour sélectionné est « aujourd'hui » (renderActionCandidates,
// target === today) — sans ce gel, un fil passé n'en montre aucune.
if (process.env.PULSE_DUMP_DATES) {
  const fixed = Date.parse(dates[0] + "T12:00:00");
  const RealDate = Date;
  globalThis.Date = class extends RealDate { constructor(...a) { a.length ? super(...a) : super(fixed); } static now() { return fixed; } };
}
for (const m of MODULES) new Function("window", "document", "fetch", readFileSync(new URL("../../public/js/" + m, import.meta.url), "utf8"))(win, doc, fetchStub);
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
// Note-cause (08/09) : les créneaux arrivent par BigQuery (un aller-retour par site) — on attend le bloc
// jusqu'à 10 s avant l'instantané ; un compte sans jour inexpliqué attend les 10 s, c'est voulu.
for (let w = 0; w < 50 && !doc.getElementById("pls-notes"); w++) await new Promise((r) => setTimeout(r, 200));
// … puis on laisse les autres sites répondre : compte de rangées stable pendant 1,5 s.
{ let last = -1, stable = 0; for (let w = 0; w < 60 && stable < 3; w++) { await new Promise((r) => setTimeout(r, 500)); const n = doc.querySelectorAll("#pls-notes .ab-note").length; stable = n === last ? stable + 1 : 0; last = n; } }
const html = `<!doctype html><html><head><meta charset="utf-8"><title>pulse — dump visuel</title>
<style>
body{font-family:system-ui,-apple-system,sans-serif;background:#F9FAFB;margin:0;padding:24px;color:#111827;
--color-text-primary:#111827;--color-text-secondary:#4B5563;--color-text-tertiary:#9CA3AF;--color-text-muted:#9CA3AF;
--color-border:#E5E7EB;--color-bg-card:#fff;--color-pill-green-text:#166534;}
#wrap{max-width:760px;margin:0 auto;}
${css}
</style></head><body><div id="wrap">${doc.body.querySelector(".pls-loc-row").outerHTML}${doc.getElementById("pls-root").outerHTML}</div></body></html>`;
writeFileSync(OUT, html);
// Note-cause (08/09) — vérité COMPORTEMENT : la rangée existe avant « Vos actions du jour », le geste
// Enregistrer (champ rempli) la retire ; champ vide → rien ne part. Échec = sortie 1 (le dump est écrit).
{
  const notes = doc.querySelectorAll("#pls-notes .ab-note");
  const brief = doc.getElementById("daily-brief-section"), blk = doc.getElementById("pls-notes");
  const before = !!(blk && brief && (blk.compareDocumentPosition(brief) & 4));
  console.log("note-cause : " + notes.length + " rangée(s)" + (notes.length ? (before ? " · avant Vos actions du jour" : " · MAL PLACÉE") : ""));
  if (notes.length) {
    const row = notes[0], n0 = notes.length; row.querySelector("[data-note-save]").click(); await new Promise((r) => setTimeout(r, 200));
    if (doc.querySelectorAll("#pls-notes .ab-note").length !== n0) { console.error("NOTE : champ vide, la rangée est partie"); process.exit(1); }
    row.querySelector("[data-note-input]").value = "sonde harnais"; row.querySelector("[data-note-save]").click(); await new Promise((r) => setTimeout(r, 400));
    const n1 = doc.querySelectorAll("#pls-notes .ab-note").length;
    if (n1 !== n0 - 1) { console.error("NOTE : Enregistrer n'a pas retiré la rangée (" + n0 + " → " + n1 + ")"); process.exit(1); }
    console.log("note-cause : Enregistrer retire la rangée (" + n0 + " → " + n1 + "), champ vide inerte");
  }
}
// Objectif en ventes (08/09, owner) — vérité RENDU : pour chaque carte ventes qui porte le champ serveur
// `objectif_ventes`, la rangée rendue porte la ligne [data-ab-obj] et son texte est EXACTEMENT celui du
// formateur partagé (window.msObjectifVentesHtml) sur ce champ ; une carte sans champ n'a pas de ligne.
{
  const strip = (h) => String(h).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  let withField = 0, rendered = 0, exact = 0, orphan = 0, sample = "";
  for (const lid of Object.keys(payloadBySite)) for (const c of (payloadBySite[lid].action_candidates || [])) {
    const rows = [...doc.querySelectorAll('[data-ab-dispo-instance="' + c.card_instance_id + '"]')].map((e) => e.closest(".ab-card")).filter(Boolean);
    if (!rows.length) continue;
    const line = rows[0].querySelector("[data-ab-obj]");
    // Rangée groupée (« sur N jours ») : l'attendu est la FUSION des champs des cartes du groupe.
    const grp = (rows[0].querySelector("[data-ab-dispo-group]")?.getAttribute("data-ab-dispo-group") || "").split(",").filter(Boolean);
    const all = Object.values(payloadBySite).flatMap((p) => p.action_candidates || []);
    const fields = grp.length ? grp.map((id) => (all.find((x) => x.card_instance_id === id) || {}).objectif_ventes) : [c.objectif_ventes];
    const merged = win.msObjectifVentesMerge(fields);
    if (merged) { withField++; if (line) { rendered++; const want = strip(win.msObjectifVentesHtml(merged)); if (strip(line.outerHTML) === want) { exact++; if (!sample) sample = want + (grp.length > 1 ? " (" + grp.length + " jours)" : ""); } } }
    else if (line) orphan++;
  }
  console.log("objectif ventes : " + withField + " carte(s) avec champ · " + rendered + " ligne(s) rendue(s) · " + exact + " exacte(s) · " + orphan + " orpheline(s)" + (sample ? " · ex. « " + sample + " »" : ""));
  if (withField && (rendered !== withField || exact !== rendered || orphan)) { console.error("OBJECTIF : rendu ≠ champ"); process.exit(1); }
}
console.log("dump écrit :", OUT, "—", html.length, "octets");
process.exit(0);
