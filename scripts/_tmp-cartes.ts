import "dotenv/config"; import { readFileSync } from "node:fs"; import { makeBQClient } from "../src/lib/bq"; import { GET as monitorGET } from "../src/pages/api/insight/monitor";
const P = "muse-square-open-data"; const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v); const strip = (h: any) => String(h || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const SITES: Record<string, string> = { "f10c3e58-326e-4e38-947c-d59fcbe51df5": "MUSE SQUARE", "14379e18-REPLACE": "LES OLIVADES" };
(async () => {
  const bq = makeBQClient(P);
  const [ol] = await bq.query({ query: `SELECT location_id FROM \`${P}.raw.insight_event_user_location_profile\` WHERE LOWER(company_name) LIKE '%olivade%' LIMIT 1`, location: "EU" });
  const sites = [["f10c3e58-326e-4e38-947c-d59fcbe51df5", "MUSE SQUARE"], [String(flat(ol[0].location_id)), "LES OLIVADES"]];
  const { Window } = await import("happy-dom"); const win: any = new Window({ url: "https://app.local/app/insightevent/pulse" });
  new Function("window", "document", readFileSync(new URL("../public/action-cards.js", import.meta.url), "utf8"))(win, win.document);
  for (const [L, NAME] of sites) {
    const [[u]] = await bq.query({ query: `SELECT clerk_user_id FROM \`${P}.raw.insight_event_user_location_profile\` WHERE location_id=@l LIMIT 1`, params: { l: L }, location: "EU" });
    const [cands] = await bq.query({ query: `SELECT action_type, date, action_priority, action_category, data_payload FROM \`${P}.semantic.vw_insight_event_action_candidates\` WHERE location_id=@l QUALIFY ROW_NUMBER() OVER (PARTITION BY action_type ORDER BY date) = 1 ORDER BY action_type`, params: { l: L }, location: "EU" });
    console.log(`\n══════════ ${NAME} — ${cands.length} types ══════════`);
    for (const c of cands as any[]) {
      const D = String(flat(c.date));
      const res = await monitorGET({ url: new URL(`http://l/api/insight/monitor?location_id=${L}&selected_dates=${D}`), locals: { clerk_user_id: String(flat(u.clerk_user_id)), location_id: L, all_location_ids: [L] } } as any);
      const j = JSON.parse(await (res as any).text()); const day = (j.days || []).filter((d: any) => String(d.date) === D)[0] || {};
      let pl: any = flat(c.data_payload); try { pl = typeof pl === "string" ? JSON.parse(pl) : pl; } catch {}
      const cand = { date: D, location_id: L, action_type: String(flat(c.action_type)), card_instance_id: "x", action_priority: Number(flat(c.action_priority) ?? 2), action_category: String(flat(c.action_category) ?? ""), confidence_tier: null, suppression_key: null, expires_at: null, data_payload: pl };
      let tm: any = {}; try { tm = (win.renderActionCandidates([cand], j.profile || {}, day, D, "veille", {}, D) || [])[0]?.tmpl || {}; } catch (e: any) { tm = { title: "(erreur rendu) " + e.message }; }
      const t = strip(tm.title) || strip(tm.brand_label_fr) || ""; console.log(`\n▌${flat(c.action_type)} · ${D.slice(8)}/${D.slice(5, 7)}\n  ${t ? t + "\n  " : ""}${strip(tm.sowhat)}\n  → ${strip(tm.action)}`);
    }
  }
})();
