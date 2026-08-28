// Harnais incrément 4 (vue équipe) — Agir membre.
// Phase 1 : politique pure (memberCardPolicy) sur les PAYLOADS RÉELS lus en base.
// Phase 2 : le VRAI GET /api/insight/monitor (BQ réel, f10c3e58) en owner puis membre —
//           balayage COMPLET du payload membre pour toute clé de niveau (le scan est la
//           preuve empirique que days/all_feed/candidates ne fuient rien).
// Phase 3 : le VRAI renderActionCandidates (action-cards.js chargé en vm) sur une carte
//           ventes réelle, payload plein vs expurgé — la phrase dégrade sur son repli,
//           aucun niveau € rendu.
import "dotenv/config";
import { BigQuery } from "@google-cloud/bigquery";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { cardScope, memberCanSeeCard, redactPayloadForMember } from "../src/lib/memberCardPolicy";

const OWNER = "user_38OwkmwUq0Ldj5FwB9AJ8HmziWo";
const LOC = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
const OTHER_LOC = "ff2aeb35-084f-4bbf-915c-94faf7be8785";
const P = "muse-square-open-data";

function assert(name: string, cond: boolean, detail?: any) {
  console.log((cond ? "✅" : "❌") + " " + name + (detail !== undefined ? " — " + JSON.stringify(detail).slice(0, 220) : ""));
  if (!cond) process.exitCode = 1;
}

// Toute clé « niveau » : revenue/basket hors formes relatives, + moyennes nommées.
function isLevelKey(k: string): boolean {
  if (k === "avg_30d") return true;
  return /revenue|basket/i.test(k) && !/(_pct|_share|_z|_rank)$/i.test(k);
}

async function main() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const bq = raw ? new BigQuery({ projectId: P, credentials: JSON.parse(raw) }) : new BigQuery({ projectId: P });

  // ── Phase 1 : politique pure sur payloads réels ──
  const [rows] = await bq.query({
    query: `SELECT action_type, data_payload FROM \`${P}.semantic.vw_insight_event_action_candidates\`
            WHERE action_type IN ('item_share_move','sales_revenue_down_wow','weather_hazard_onset','client_dormant','hour_share_move')
            QUALIFY ROW_NUMBER() OVER (PARTITION BY action_type ORDER BY date DESC) = 1`,
    location: "EU",
  });
  const byType: Record<string, any> = {};
  for (const r of rows as any[]) byType[String(r.action_type)] = { action_type: String(r.action_type), data_payload: JSON.parse(String(r.data_payload || "{}")) };
  assert("payloads réels chargés (5 types)", Object.keys(byType).length === 5, Object.keys(byType));

  const fam = String(byType["item_share_move"].data_payload.item_category || "");
  assert("famille réelle présente sur item_share_move", fam !== "", { fam });
  assert("scope famille : passe si famille du pôle", memberCanSeeCard(byType["item_share_move"], new Set([fam])));
  assert("scope famille : refusée hors pôle", !memberCanSeeCard(byType["item_share_move"], new Set(["__autre__"])));
  assert("scope site : météo passe sans pôle", memberCanSeeCard(byType["weather_hazard_onset"], new Set()));
  assert("scope owner : client_dormant jamais membre", !memberCanSeeCard(byType["client_dormant"], new Set([fam])) && cardScope("client_dormant") === "owner");

  const red = redactPayloadForMember(byType["sales_revenue_down_wow"].data_payload);
  assert("redact ventes : niveaux retirés", !("daily_revenue" in red) && !("avg_30d" in red) && !("expected_revenue" in red), Object.keys(red));
  assert("redact ventes : relatifs gardés", "revenue_vs_avg_pct" in red && "revenue_robust_z" in red && "basket_delta_pct" in red);
  const redH = redactPayloadForMember(byType["hour_share_move"].data_payload);
  assert("redact heure : niveaux retirés, écarts gardés", !("hour_revenue" in redH) && !("day_revenue" in redH) && "delta_eur" in redH && "day_gap_eur" in redH && "hour_transactions" in redH);

  // ── Phase 2 : le vrai endpoint ──
  const { GET } = await import("../src/pages/api/insight/monitor");
  const today = new Date().toISOString().slice(0, 10);
  const qs = "?location_id=" + LOC + "&selected_dates=" + today + "&light=1";
  async function call(locals: any, q: string) {
    const res: Response = await (GET as any)({ url: new URL("http://localhost/api/insight/monitor" + q), locals });
    return { status: res.status, body: await res.json() };
  }
  const ownerLocals = { clerk_user_id: OWNER, real_clerk_user_id: OWNER, all_location_ids: [LOC, OTHER_LOC], member_location_ids: [], member_poles: {}, role: "owner" };
  const memberLocals = { clerk_user_id: "user_member_harness", real_clerk_user_id: "user_member_harness", all_location_ids: [], member_location_ids: [LOC], member_poles: { [LOC]: [] }, role: "member" };

  const own = await call(ownerLocals, qs);
  assert("owner 200, pas de champ role", own.status === 200 && own.body.ok === true && !("role" in own.body));
  assert("owner sales_summary présent", Array.isArray(own.body.sales_summary) && own.body.sales_summary.length > 0);
  const ownTypes = new Set((own.body.action_candidates || []).map((c: any) => String(c.action_type)));
  assert("owner garde ses cartes", ownTypes.size >= 3, { n: ownTypes.size });

  const mem = await call(memberLocals, qs);
  assert("membre 200 + role", mem.status === 200 && mem.body.ok === true && mem.body.role === "member");
  assert("membre sales_summary null", mem.body.sales_summary === null);
  const memTypes = (mem.body.action_candidates || []).map((c: any) => String(c.action_type));
  assert("membre : aucun type owner-only ni famille (0 pôle)", memTypes.every((t: string) => cardScope(t) === "site"), { memTypes });

  // Balayage COMPLET du payload membre : aucune clé de niveau nulle part.
  const leaks: string[] = [];
  (function walk(o: any, path: string) {
    if (o && typeof o === "object") {
      for (const k of Object.keys(o)) {
        if (isLevelKey(k) && o[k] != null) leaks.push(path + "." + k);
        walk(o[k], path + "." + k);
      }
    }
  })(mem.body, "root");
  assert("membre : ZÉRO clé de niveau dans tout le payload", leaks.length === 0, { leaks: leaks.slice(0, 8) });

  const forb = await call(memberLocals, "?location_id=" + OTHER_LOC + "&selected_dates=" + today + "&light=1");
  assert("membre 403 hors périmètre", forb.status === 403, { status: forb.status });

  // ── Phase 3 : rendu réel d'une carte ventes, plein vs expurgé ──
  const src = readFileSync("public/action-cards.js", "utf8");
  const ctx: any = { window: {}, document: { createElement: () => ({ style: {} }) }, console };
  ctx.window = ctx; // action-cards écrit sur window.*
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  const cand = (own.body.action_candidates || []).find((c: any) => /^sales_/.test(String(c.action_type)));
  if (!cand) { assert("carte ventes réelle disponible pour le rendu", false); return; }
  // renderActionCandidates rend un TABLEAU d'entrées {item, tmpl, score} — la phrase vit
  // dans tmpl.sowhat (composée par le vrai spec.sowhat, ligne ~2939 d'action-cards.js).
  function sowhatOf(c: any): string {
    const entries = ctx.renderActionCandidates([c], own.body.profile, null, String(c.date), "pulse", null, today) || [];
    return entries.length ? String(entries[0].tmpl.sowhat || "") : "";
  }
  const swFull = sowhatOf(cand);
  const swRed = sowhatOf({ ...cand, data_payload: redactPayloadForMember(cand.data_payload) });
  const levelEur = /CA\s[\d\s .,]+\u20ac/;
  assert("phrase pleine cite le niveau (témoin)", levelEur.test(swFull), { type: cand.action_type, swFull });
  assert("phrase expurgée non vide (la carte survit)", swRed.length > 30, { swRed });
  assert("phrase expurgée : aucun niveau « CA N EUR »", !levelEur.test(swRed), { sample: (swRed.match(levelEur) || [])[0] });
}

main().catch((e) => { console.error("HARNESS FAILED:", e); process.exit(1); });
