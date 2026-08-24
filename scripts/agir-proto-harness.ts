// Harnais proto FIL AGIR (support de public/agir-proto.html). LECTURE SEULE.
// Capture les cartes RÉELLES du site owner via le handler monitor DIRECT (pattern éprouvé),
// avec leur enjeu du registre (eur_year gated, médiane €/j, n jours, tier) — la matière de la
// grammaire validée : titre = objectif annuel · corps = coût/jour + geste · provenance.
// Usage : npx tsx scripts/agir-proto-harness.ts
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { makeBQClient } from "../src/lib/bq";
import { GET as monitorGET } from "../src/pages/api/insight/monitor";

const PROJECT = "muse-square-open-data";
const OWNER = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);

(async () => {
  const bq = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);
  const [[u]] = await bq.query({ query: `SELECT clerk_user_id FROM \`${PROJECT}.raw.insight_event_user_location_profile\` WHERE location_id = @l LIMIT 1`, params: { l: OWNER }, location: "EU" });
  const uid = String(flat(u.clerk_user_id));
  const today = new Date().toISOString().slice(0, 10);
  const locals = { clerk_user_id: uid, location_id: OWNER, all_location_ids: [OWNER] };
  const t0 = Date.now();
  const res = await monitorGET({
    url: new URL(`http://l/api/insight/monitor?location_id=${OWNER}&selected_dates=${today}`),
    locals,
  } as any);
  const j = JSON.parse(await (res as any).text());
  console.log("status:", (res as any).status, "·", Date.now() - t0, "ms");
  // ── LES VRAIS CORPS : le harnais EST la page — on exécute le VRAI action-cards.js
  //    (happy-dom) et on appelle renderActionCandidates avec les MÊMES arguments que
  //    pulse.astro:1491 → entries[].tmpl.{what,sowhat,action,barClass} par carte. ──
  const { Window } = await import("happy-dom");
  const win: any = new Window({ url: "https://app.local/app/insightevent/pulse" });
  const src = (await import("node:fs")).readFileSync(new URL("../public/action-cards.js", import.meta.url), "utf8");
  const fn = new Function("window", "document", src);
  fn(win, win.document);
  const currentDay = (j.days || []).filter((d: any) => String(d.date) === today)[0] || (j.days || [])[0] || {};
  const entries = win.renderActionCandidates(j.action_candidates || [], j.profile || {}, currentDay, today, "veille", {}, today) || [];
  console.log("entries (moteur réel):", entries.length);
  const strip = (h: any) => String(h == null ? "" : h).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const cands = entries.map((en: any) => {
    const it = en.item || {}, tm = en.tmpl || {};
    return {
      action_type: it.change_subtype || null, date: it.affected_date || null,
      what: strip(tm.what), sowhat: strip(tm.sowhat), action: strip(tm.action),
      barClass: tm.barClass || null, score: en.score,
      enjeu: it.enjeu || null, enjeu_reason_fr: it.enjeu_reason_fr || null,
      needs_catchment: it.needs_catchment === true,
    };
  });
  console.log("candidates:", cands.length);
  cands.slice(0, 12).forEach((c: any) => console.log("  ", c.action_type, "·", (c.what || "").slice(0, 60), "· enjeu:", c.enjeu ? c.enjeu.eur_year : "—"));
  // Dispositifs actifs (pour « votre dispositif Z, qui a déjà fonctionné »).
  const [bps] = await bq.query({ query: `SELECT practice_text, origin_action_type, status FROM \`${PROJECT}.analytics.best_practices\` WHERE location_id = @l AND status = 'active'`, params: { l: OWNER }, location: "EU" });
  const practices = (bps as any[]).map((r) => ({ text: String(flat(r.practice_text)), origin: String(flat(r.origin_action_type) || "") }));
  console.log("dispositifs actifs:", practices.length);
  const out = { captured_at: new Date().toISOString(), today, site_label: "Muse Square", cards: cands, practices };
  const dest = new URL("../public/agir-proto-data.js", import.meta.url).pathname;
  writeFileSync(dest, "window.AGIR_PROTO = " + JSON.stringify(out, null, 1) + ";\n");
  console.log("écrit:", dest);
})();
