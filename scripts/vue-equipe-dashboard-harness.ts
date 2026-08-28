// Harnais incrément 3 (vue équipe) — appelle le VRAI handler GET /api/insight/dashboard
// avec des locals owner puis membre, contre BigQuery réel (compte f10c3e58).
// Vérifie : owner byte-compatible (tous ses blocs présents, pas de champ role) ; membre =
// liste blanche EXACTE de clés, filtre pôle sur les engagements ET les occurrences, bandeau
// sans le moindre champ €, 403 hors périmètre.
import "dotenv/config";
import { BigQuery } from "@google-cloud/bigquery";
import { GET } from "../src/pages/api/insight/dashboard";

const OWNER = "user_38OwkmwUq0Ldj5FwB9AJ8HmziWo"; // copié de la sortie bq (inc 2)
const LOC = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
const OTHER_LOC = "ff2aeb35-084f-4bbf-915c-94faf7be8785"; // possédé owner, PAS membre
// Le périmètre membre du harnais = le dispositif Corner réel (saved_item 56f47021…).
const POLE_ID = "49a325dd-b06f-4cbc-982f-7ab71af70b12";
// INSTRUIT 28/08 : le test POSITIF du filtre tournait sur un id réel (610d7c02…) qui est
// passé open→pending dans la journée — un id réel d'ENGAGEMENT OUVERT est périssable par
// nature. Le positif tourne désormais sur une SONDE ouverte rattachée au périmètre
// (attached_pole_id), insérée et nettoyée ici ; le négatif garde son id réel (stable).
const IN_COMMIT = "probe-vqd-open";
const OUT_COMMIT = "2d99694a-17fa-4486-92e1-548ce588e1f5"; // dispositif eb02f192… hors pôles membre
const SAVED_ITEM = "56f47021-e0c2-42cc-a9ac-f1b04a9742f6";
const BQP = "muse-square-open-data";

function bqc(): BigQuery {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  return raw ? new BigQuery({ projectId: BQP, credentials: JSON.parse(raw) }) : new BigQuery({ projectId: BQP });
}
async function probeCleanup(bq: BigQuery) {
  await bq.query({ query: `DELETE FROM \`${BQP}.analytics.action_commitments\` WHERE commitment_id = '${IN_COMMIT}'`, location: "EU" });
}

function assert(name: string, cond: boolean, detail?: any) {
  console.log((cond ? "✅" : "❌") + " " + name + (detail !== undefined ? " — " + JSON.stringify(detail) : ""));
  if (!cond) process.exitCode = 1;
}

async function call(locals: any, qs: string) {
  const res: Response = await (GET as any)({ url: new URL("http://localhost/api/insight/dashboard" + qs), locals });
  return { status: res.status, body: await res.json() };
}

async function main() {
  const ownerLocals = { clerk_user_id: OWNER, real_clerk_user_id: OWNER, all_location_ids: [LOC, OTHER_LOC], member_location_ids: [], member_poles: {}, role: "owner" };
  const memberLocals = { clerk_user_id: "user_member_harness", real_clerk_user_id: "user_member_harness", all_location_ids: [], member_location_ids: [LOC], member_poles: { [LOC]: [POLE_ID] }, role: "member" };

  // Sonde du test positif (voir note IN_COMMIT) — ouverte, rattachée au périmètre membre.
  const bq = bqc();
  await probeCleanup(bq);
  await bq.query({
    query: `INSERT INTO \`${BQP}.analytics.action_commitments\`
      (commitment_id, user_id, location_id, status, authorship, created_at, updated_at, transition_type,
       dispositif_id, version_no, attached_pole_id, committed_action_text, measured_metric, window_start, window_end)
      VALUES ('${IN_COMMIT}', @u, @l, 'open', 'user', TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), MILLISECOND), TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), MILLISECOND), 'create',
              '${IN_COMMIT}', 1, '${POLE_ID}', 'Probe VQD — op du pôle', 'revenue_residual',
              DATE_ADD(CURRENT_DATE(), INTERVAL 3 DAY), DATE_ADD(CURRENT_DATE(), INTERVAL 3 DAY))`,
    params: { u: OWNER, l: LOC }, location: "EU",
  });

  // ── Owner : comportement intact ──
  const own = await call(ownerLocals, "?period=365&location_id=" + LOC);
  assert("owner 200 ok", own.status === 200 && own.body.ok === true);
  assert("owner sans champ role", !("role" in own.body));
  for (const k of ["impact", "impact_rows", "ca_daily", "marges", "operations", "open_commitments", "equipe", "practices", "automated", "glance", "debloquer"]) {
    assert("owner porte " + k, k in own.body);
  }
  assert("owner sans bandeau", !("bandeau" in own.body));

  // ── Membre : liste blanche exacte ──
  const mem = await call(memberLocals, "?period=365");
  assert("membre 200 ok", mem.status === 200 && mem.body.ok === true && mem.body.role === "member");
  const keys = Object.keys(mem.body).sort();
  // INSTRUIT 28/08 (build pôles, proto v3 validé) : « poles » entre dans la liste blanche —
  // rangée 1 KPI pôle (%, unités/jour) + rangée 2 actions en cours du pôle (impact borné).
  const expected = ["bandeau", "multi_site", "ok", "open_commitments", "operations", "period_days", "poles", "role", "sites"].sort();
  assert("membre clés EXACTES", JSON.stringify(keys) === JSON.stringify(expected), { keys });
  // « impact » est LÉGITIME sous poles[] (cumul borné au pôle, arbitrage 28/08) — le scan
  // des blocs interdits se fait donc HORS poles, sinon il mord dès qu'un vrai pôle existe.
  const raw = JSON.stringify({ ...mem.body, poles: null });
  for (const forbidden of ["marges", "ca_daily", "daily_revenue", "impact", "debloquer", "glance", "equipe", "practices"]) {
    assert("membre payload (hors poles) sans « " + forbidden + " »", !raw.includes('"' + forbidden + '"'));
  }
  // gap_eur est AUTORISÉ sous operations[].prev_occ (bilan d'une opération du pôle =
  // occasion d'agir, arbitrage 28/08) ET sous poles[].impact (cumul BORNÉ AU PÔLE,
  // arbitrage owner 28/08 au proto v3) — interdit partout ailleurs.
  const rawSansOps = JSON.stringify({ ...mem.body, operations: null, poles: null });
  assert("membre gap_eur nulle part hors operations/poles", !rawSansOps.includes('"gap_eur"'));

  // ── Filtre pôle ──
  const ids = (mem.body.open_commitments || []).map((c: any) => c.commitment_id);
  assert("engagement DU pôle présent", ids.includes(IN_COMMIT), { ids });
  assert("engagement HORS pôle absent", !ids.includes(OUT_COMMIT));
  const ops = mem.body.operations || [];
  assert("occurrences = saved_item du pôle seulement", ops.every((o: any) => String(o.saved_item_id) === SAVED_ITEM), { n: ops.length });

  // ── Bandeau ──
  const bd = mem.body.bandeau || [];
  assert("bandeau non vide (site avec ventes)", bd.length >= 1, { bd });
  assert("bandeau fenêtres a/b, tx & vis numériques", bd.every((r: any) => ["a", "b"].includes(r.w) && typeof r.tx === "number" && typeof r.vis === "number" && typeof r.n_days === "number"));

  // ── Hors périmètre ──
  const forb = await call(memberLocals, "?period=365&location_id=" + OTHER_LOC);
  assert("membre 403 sur site non-membre", forb.status === 403, { status: forb.status });

  // ── Owner multi-site sans filtre : inchangé aussi ──
  const own2 = await call(ownerLocals, "?period=365");
  assert("owner multi-site 200 + blocs", own2.status === 200 && "glance" in own2.body && !("role" in own2.body));
}

main()
  .then(() => renderPhase())
  .then(async () => { await probeCleanup(bqc()); console.log("✅ sonde probe-vqd nettoyée"); })
  .catch(async (e) => { console.error("HARNESS FAILED:", e); try { await probeCleanup(bqc()); } catch { /* nettoyage best-effort */ } process.exit(1); });

// ── Phase 2 : rendu membre — le renderMemberView RÉEL (byte-exact depuis tableau.astro),
// exécuté sur le payload API réel dans un contexte vm avec DOM minimal. ──
import { readFileSync } from "node:fs";
import vm from "node:vm";

export async function renderPhase() {
  const memberLocals = { clerk_user_id: "u", real_clerk_user_id: "u", all_location_ids: [], member_location_ids: [LOC], member_poles: { [LOC]: [POLE_ID] }, role: "member" };
  const { body: payload } = await call(memberLocals, "?period=365");

  const src = readFileSync("src/pages/app/insightevent/tableau.astro", "utf8");
  const fnMatch = src.match(/function renderMemberView\(j\) \{[\s\S]*?\n        \}/);
  if (!fnMatch) { assert("renderMemberView extrait", false); return; }
  // Helpers RÉELS de la page (byte-exacts) — la branche pôles (28/08) en consomme plus :
  // signEur/daysTo/dowFull/trunc + leurs dépendances (DOWF, TODAY, pad2).
  const helpers = [
    src.match(/function esc\(s\).*$/m)![0],
    src.match(/function frD\(iso\).*$/m)![0],
    src.match(/function siteChip\(label\).*$/m)![0],
    src.match(/function frInt\(n\).*$/m)![0],
    src.match(/function signEur\(n\).*$/m)![0],
    src.match(/function pad2\(n\).*$/m)![0],
    src.match(/var now = new Date\(\);/m)![0],
    src.match(/var TODAY = .*$/m)![0],
    src.match(/function daysTo\(iso\).*$/m)![0],
    src.match(/var DOWF = .*$/m)![0],
    src.match(/function dowFull\(iso\).*$/m)![0],
    src.match(/function trunc\(s, n\) \{[\s\S]*?\n        \}/m)![0],
  ].join("\n");
  const ctx: any = {
    J: payload,
    body: { innerHTML: "" },
    document: { getElementById: () => ({ style: {} }) },
  };
  vm.createContext(ctx);
  vm.runInContext(helpers + "\n" + fnMatch[0] + "\nrenderMemberView(J);", ctx);
  const html = String(ctx.body.innerHTML);
  assert("rendu: 3 tuiles bandeau", (html.match(/class="tb-t2"/g) || []).length === 3);
  assert("rendu: ventes/jour chiffrée", /ventes\/jour<\/p>\s*<div class="n2"[^>]*>\d/.test(html.replace(/\n/g, "")));
  assert("rendu: visiteurs « — » (capteur absent, jamais 0)", html.includes("nombre de visiteurs/jour</p>") && /visiteurs\/jour<\/p><div class="n2"[^>]*>—/.test(html));
  assert("rendu: conversion « — »", /taux de conversion<\/p><div class="n2"[^>]*>—/.test(html));
  assert("rendu: section À faire + compte", html.includes(">À faire</p>") && html.includes("1 en attente"));
  assert("rendu: l'engagement du pôle est là", html.includes("Corner") || html.includes(esc0(payload.open_commitments[0].text.slice(0, 20))));
  assert("rendu: aucun € affiché", !html.includes("€"));
  function esc0(s: string) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

  // ── Phase 2b (28/08, proto v3 validé) : rendu membre AVEC pôles — payload injecté (aucun
  // pôle réel en base), le chemin neuf s'exécute vraiment : 2 rangées KPI pôle, bandeau
  // SITE absent, % seulement + impact borné au pôle. ──
  const payload2 = {
    ...payload,
    poles: [{
      dispositif_id: "p1", location_id: LOC, name: "Pôle test",
      families: [{ family: "FamX", delta_pct: 5.5 }],
      delta_pct: 12.3, share_pct: 8.1, week: null, ops_open: 1,
      units30_day: 44, units_base_day: 28,
      impact: { gap_eur: -28, eur_windows: 1 },
      next: { we: "2099-09-05", text: "Op test — détail" },
      connaissances: { prouves: 0, en_test: 1 },
    }],
  };
  const ctx2: any = { J: payload2, body: { innerHTML: "" }, document: { getElementById: () => ({ style: {} }) } };
  vm.createContext(ctx2);
  vm.runInContext(helpers + "\n" + fnMatch[0] + "\nrenderMemberView(J);", ctx2);
  const html2 = String(ctx2.body.innerHTML);
  assert("rendu pôles: kicker Pôle · nom", html2.includes("Pôle · Pôle test"));
  assert("rendu pôles: CA du pôle en % (+12,3 %)", html2.includes("CA du pôle") && html2.includes("+12,3 %".replace(" ", " ")) || html2.includes("+12,3 %"));
  assert("rendu pôles: ventes/jour 44 · habituel 28", /ventes\/jour<\/p><div class="n2"[^>]*>44</.test(html2) && html2.includes("habituel 28"));
  assert("rendu pôles: poids du CA 8,1 %", html2.includes("poids du CA") && html2.includes("8,1 %"));
  assert("rendu pôles: impact borné au pôle (−28 €)", html2.includes("Impact de vos opérations") && html2.includes("−28 €"));
  assert("rendu pôles: bandeau SITE absent (remplacé par le pôle)", !html2.includes("nombre de visiteurs/jour"));
  assert("rendu pôles: absence honnête des signaux", html2.includes("aucun motif chiffré encore"));
  // Seuls les MONTANTS comptent (chiffre + €) — le « €/j » de l'infobulle du référentiel
  // est une unité, pas un niveau affiché.
  assert("rendu pôles: aucun niveau € (le seul montant est l'impact)", (html2.match(/\d\s?€/g) || []).length === 1, html2.match(/\d\s?€/g));
}
