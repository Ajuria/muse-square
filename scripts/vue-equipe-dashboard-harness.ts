// Harnais incrément 3 (vue équipe) — appelle le VRAI handler GET /api/insight/dashboard
// avec des locals owner puis membre, contre BigQuery réel (compte f10c3e58).
// Vérifie : owner byte-compatible (tous ses blocs présents, pas de champ role) ; membre =
// liste blanche EXACTE de clés, filtre pôle sur les engagements ET les occurrences, bandeau
// sans le moindre champ €, 403 hors périmètre.
import "dotenv/config";
import { GET } from "../src/pages/api/insight/dashboard";

const OWNER = "user_38OwkmwUq0Ldj5FwB9AJ8HmziWo"; // copié de la sortie bq (inc 2)
const LOC = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
const OTHER_LOC = "ff2aeb35-084f-4bbf-915c-94faf7be8785"; // possédé owner, PAS membre
// Engagement ouvert réel (sortie bq 28/08) : dispositif 49a325dd…, saved_item 56f47021… (série Corner)
const POLE_ID = "49a325dd-b06f-4cbc-982f-7ab71af70b12";
const IN_COMMIT = "610d7c02-abf2-40fe-9c60-4d733b363dcb";
const OUT_COMMIT = "2d99694a-17fa-4486-92e1-548ce588e1f5"; // dispositif eb02f192… hors pôles membre
const SAVED_ITEM = "56f47021-e0c2-42cc-a9ac-f1b04a9742f6";

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
  const expected = ["bandeau", "multi_site", "ok", "open_commitments", "operations", "period_days", "role", "sites"].sort();
  assert("membre clés EXACTES", JSON.stringify(keys) === JSON.stringify(expected), { keys });
  const raw = JSON.stringify(mem.body);
  for (const forbidden of ["marges", "ca_daily", "daily_revenue", "impact", "debloquer", "glance", "equipe", "practices"]) {
    assert("membre payload sans « " + forbidden + " »", !raw.includes('"' + forbidden + '"'));
  }
  // gap_eur est AUTORISÉ sous operations[].prev_occ (bilan d'une opération du pôle =
  // occasion d'agir, arbitrage 28/08) — interdit partout ailleurs.
  const rawSansOps = JSON.stringify({ ...mem.body, operations: null });
  assert("membre gap_eur nulle part hors operations", !rawSansOps.includes('"gap_eur"'));

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

main().then(() => renderPhase()).catch((e) => { console.error("HARNESS FAILED:", e); process.exit(1); });

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
  const helpers = [
    src.match(/function esc\(s\).*$/m)![0],
    src.match(/function frD\(iso\).*$/m)![0],
    src.match(/function siteChip\(label\).*$/m)![0],
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
}
