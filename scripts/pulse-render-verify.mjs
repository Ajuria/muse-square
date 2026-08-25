// Vérité RENDU de la page AGIR (pulse) — le script inline réel + les vrais modules public/
// (action-cards, reco-library…), exécutés en happy-dom sur le payload monitor RÉEL du compte
// owner (handler direct). La règle maison : le harnais EST la page. C'était la pièce manquante
// documentée (« pulse n'en a AUCUN, cause racine des dérives visuelles »).
// Usage : npx tsx scripts/pulse-render-verify.mjs
import "dotenv/config";
import { readFileSync } from "node:fs";
import { Window } from "happy-dom";
import { makeBQClient } from "../src/lib/bq";
import { GET as monitorGET } from "../src/pages/api/insight/monitor";

const PROJECT = "muse-square-open-data";
const OWNER = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
const flat = (v) => (v && typeof v === "object" && "value" in v ? v.value : v);
let fails = 0;
const check = (label, cond, detail) => {
  console.log((cond ? "  OK " : "  FAIL ") + label + (detail !== undefined ? " — " + String(detail).slice(0, 140) : ""));
  if (!cond) fails++;
};
const tick = (ms) => new Promise((r) => setTimeout(r, ms || 60));

// 1 · Payload monitor RÉEL (7 jours, light — les mêmes paramètres que la page).
const bq = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);
const [[u]] = await bq.query({ query: `SELECT clerk_user_id FROM \`${PROJECT}.raw.insight_event_user_location_profile\` WHERE location_id = @l LIMIT 1`, params: { l: OWNER }, location: "EU" });
const uid = String(flat(u.clerk_user_id));
const today = new Date();
const dates = [];
for (let i = 0; i < 7; i++) dates.push(new Date(today.getTime() + i * 86_400_000).toISOString().slice(0, 10));
const locals = { clerk_user_id: uid, location_id: OWNER, all_location_ids: [OWNER] };
const res = await monitorGET({
  url: new URL(`http://l/api/insight/monitor?location_id=${OWNER}&selected_dates=${dates.join(",")}&light=1`),
  locals,
});
const monitorPayload = JSON.parse(await res.text());
if (!monitorPayload.ok) throw new Error("payload monitor en erreur");
console.log("payload monitor : " + (monitorPayload.days || []).length + " jours · " + (monitorPayload.action_candidates || []).length + " candidates");

// 2 · Le script inline réel de pulse.astro + les modules public/ qu'il consomme.
const astro = readFileSync(new URL("../src/pages/app/insightevent/pulse.astro", import.meta.url), "utf8");
const inline = [...astro.matchAll(/<script is:inline(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)]
  .map((m) => m[1]).sort((a, b) => b.length - a.length)[0];
if (!inline || inline.length < 10000) throw new Error("script inline pulse introuvable");
const MODULES = ["ms-loader.js", "reco-library.js", "commit-form.js", "bp-form.js", "action-cards.js", "draft-workspace.js"];

// 3 · DOM + stubs réseau (chaque route répond sa forme vide sauf monitor/locations).
const win = new Window({ url: "https://app.local/app/insightevent/pulse" });
const doc = win.document;
doc.body.innerHTML = '<div id="pls-root"></div>';
win.localStorage.clear?.();
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
  else if (u2.includes("/api/analytics/card-states")) body = { ok: true, states: [] };
  else if (u2.includes("/api/analytics/list-drafts")) body = { ok: true, drafts: [] };
  else if (u2.includes("/api/analytics/pending-feedback")) body = { ok: true, pending: [] };
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)) });
};
win.fetch = fetchStub;
for (const m of MODULES) {
  const src = readFileSync(new URL("../public/" + m, import.meta.url), "utf8");
  new Function("window", "document", "fetch", src)(win, doc, fetchStub);
}
// Le script inline lit location_id/… depuis define:vars — on les fournit comme la page.
const boot = new Function("window", "document", "fetch", "location_id", "sessionStorage", "localStorage",
  "var locationId = location_id;\n" + inline);
boot(win, doc, fetchStub, OWNER, win.sessionStorage, win.localStorage);
await tick(600);
await tick(600);

const root = doc.getElementById("pls-root");
const txt = () => root.textContent;

// ── Assertions BASELINE (page actuelle) — étendues à chaque incrément du build. ──
check("rendu : la page peint (plus de racine vide)", root.innerHTML.length > 5000, root.innerHTML.length + " car.");
check("en-tête : « Vos actions du jour »", txt().includes("Vos actions du jour"));
check("bandeau 7 jours présent", root.querySelectorAll(".pls-col, .n7col").length >= 7, root.querySelectorAll(".pls-col, .n7col").length + " colonnes");
check("cartes système rendues", root.querySelectorAll(".ab-card").length >= 3, root.querySelectorAll(".ab-card").length + " cartes");
check("aucun « undefined » visible", !txt().includes("undefined"));
check("aucun « NaN » visible", !/\bNaN\b/.test(txt()));
// Le budget par catégorie (performance ≤ 5) peut légitimement écarter le créneau du rendu
// du jour — le contrat porte sur LA CARTE RENDUE : si elle l'est, son titre est spécifique.
check("titre créneau : format spécifique quand la carte est rendue", (() => {
  const t2 = txt();
  if (!/réneau/.test(t2)) return true;
  return /créneau \d+ h–\d+ h (surperforme|sous-performe|en hausse|en retrait)/i.test(t2)
    && !t2.includes("Bascule d’un créneau") && !/Créneau (sur|sous-)performant/.test(t2);
})());
check("CTA « M’engager » présent sur les cartes", txt().includes("M’engager"));

console.log(fails ? "\n" + fails + " ÉCHEC(S)" : "\nTOUT VERT (harnais pulse)");
process.exit(fails ? 1 : 0);
