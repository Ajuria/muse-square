// Bilan texte de TOUTES les cartes (chaque tir du mart) pour Muse Square + Les Olivades, rendu
// par le vrai chemin (monitor.ts → action-cards.js renderActionCandidates), organisé par question
// d'exploitant, avec le chiffre du coin (€/an propre / motif du jour / « ce jour » en euros).
// Usage : npx tsx tools/oneoff/2026-08-23-cartes-bilan.ts [sortie.md]   (défaut docs/cartes-bilan-<date>.md)
import "dotenv/config"; import { readFileSync, writeFileSync } from "node:fs"; import { makeBQClient } from "../../src/lib/bq"; import { GET as monitorGET } from "../../src/pages/api/insight/monitor";
const P = "muse-square-open-data"; const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v); const strip = (h: any) => String(h || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const eur = (n: number) => (n >= 0 ? "+" : "−") + Math.abs(Math.round(n)).toLocaleString("fr-FR") + " €";
const Q: Array<[string, string[]]> = [
  ["I. Comment se porte mon activité ? (mes ventes)", ["sales_surge","sales_revenue_down_wow","sales_underperformance","sales_discount_no_lift","sales_traffic_not_converting","sales_competition_cannibalization","hour_share_move","item_share_move","offering_mix_shift","client_dormant","weekly_sales_hole","weekly_sales_spike","monthly_sales_hole","monthly_sales_spike"]],
  ["II. Qu'est-ce qui m'attend cette semaine ? (contexte)", ["weather_hazard_onset","weather_improved","weather_window","extended_bad_weather","audience_shift_opportunity","commercial_event_match","foreign_tourism_signal","weekend_opportunity","weekend_vacation_low_comp","top_day_approaching","best_day_of_week","day_opportunity","regime_c_warning","mobility_disruption","mobility_disruption_planned","mobility_disruption_resolved","ft_peak_mobility","ft_peak_bad_weather","ft_quiet_good_weather","ft_peak_low_comp","ft_peak_saturated","ft_peak_tourism_vacation","weather_comp_opportunity","holiday_high_comp","mobility_comp_squeeze","weather_window_after_bad","mega_event_activation","mega_event_end","calendar_audience_shift"]],
  ["III. Que font mes concurrents ? (veille)", ["competition_proximity","low_competition_window","high_competition_density","same_bucket_saturation","competition_pressure_spike","competitor_event_launch","competitor_event_ending","competitor_threat_direct","competitor_audience_conflict","competitor_price_drop","competitor_price_increase","competitor_repricing_event","competitor_new_offering","competitor_offering_removed","competitor_hours_change","competitor_reputation_strength","competitor_positioning_brief","competitor_positioning_gap"]],
  ["IV. Où en est ma réputation ?", ["review_solicitation"]],
  ["V. Mes actions marchent-elles ?", ["proven_action_replication","weekly_briefing"]],
];
(async () => {
  const today = new Date().toISOString().slice(0, 10); const outPath = process.argv[2] || `docs/cartes-bilan-${today}.md`;
  const bq = makeBQClient(P);
  const [ol] = await bq.query({ query: `SELECT location_id FROM \`${P}.raw.insight_event_user_location_profile\` WHERE LOWER(company_name) LIKE '%olivade%' LIMIT 1`, location: "EU" });
  const sites: Array<[string, string, string]> = [["f10c3e58-326e-4e38-947c-d59fcbe51df5", "MUSE SQUARE", "ventes = graine Kaggle (café), heure + familles, régime quotidien"], [String(flat(ol[0].location_id)), "LES OLIVADES", "ventes réelles Sage 100, sans heure ni famille ni visiteurs, régime hebdomadaire"]];
  const { Window } = await import("happy-dom"); const win: any = new Window({ url: "https://app.local/app/insightevent/pulse" });
  new Function("window", "document", readFileSync(new URL("../../public/js/action-cards.js", import.meta.url), "utf8"))(win, win.document);
  let out = `# Toutes les cartes du ${today.slice(8)}/${today.slice(5, 7)}/${today.slice(0, 4)} — deux comptes, rendu réel (action-cards.js via monitor.ts)\n\nChaque tir du mart, pas un par type. Coin : €/an propre quand la carte est adossée à une classe mesurée ; « motif du jour » = le €/an de la classe de la date ; « ce jour » = l'écart en euros du payload (cartes de faits) ; sinon « — ». Les cartes structurelles (grain motif × site) portent tous les €/an mesurés.\n`;
  let total = 0;
  for (const [L, NAME, DESC] of sites) {
    const [[u]] = await bq.query({ query: `SELECT clerk_user_id FROM \`${P}.raw.insight_event_user_location_profile\` WHERE location_id=@l LIMIT 1`, params: { l: L }, location: "EU" });
    const [cands] = await bq.query({ query: `SELECT action_type, date, action_priority, action_category, data_payload FROM \`${P}.semantic.vw_insight_event_action_candidates\` WHERE location_id=@l ORDER BY date, action_type`, params: { l: L }, location: "EU" });
    const dates = [...new Set((cands as any[]).map((c) => String(flat(c.date))))].sort();
    const res = await monitorGET({ url: new URL(`http://l/api/insight/monitor?location_id=${L}&selected_dates=${dates.join(",")}`), locals: { clerk_user_id: String(flat(u.clerk_user_id)), location_id: L, all_location_ids: [L] } } as any);
    const j = JSON.parse(await (res as any).text());
    const byDate: Record<string, any> = {}; (j.days || []).forEach((d: any) => { byDate[String(d.date)] = d; });
    const enj: Record<string, any> = {}; (j.action_candidates || []).forEach((c: any) => { enj[`${c.action_type}|${String(c.date).slice(0, 10)}`] = c; });
    out += `\n\n# ${NAME} — ${DESC} — ${cands.length} cartes\n`; total += cands.length;
    out += `\n## Cartes structurelles (motifs mesurés, grain motif × site)\n`;
    const sc = j.day_class_impacts || []; if (!sc.length) out += `- (aucune : aucune classe de jours ne passe les portes sur ce site)\n`;
    for (const s of sc) out += `- **${strip(s.title_fr)}** — ${strip(s.sowhat_fr)} · **${eur(s.eur_year)}/an** (${s.n_days} j / ${s.span_months} mois, ${s.tier_label_fr}) · ${strip(s.chantier_fr)}\n`;
    const seen = new Set<string>();
    for (const [q, types] of Q) {
      const rows = (cands as any[]).filter((c) => types.includes(String(flat(c.action_type)))); if (!rows.length) continue;
      out += `\n## ${q}\n`;
      for (const c of rows) {
        const t = String(flat(c.action_type)), D = String(flat(c.date)); seen.add(t);
        let pl: any = flat(c.data_payload); try { pl = typeof pl === "string" ? JSON.parse(pl) : pl; } catch {}
        const e = enj[`${t}|${D}`]; const cand = { ...(e || {}), date: D, location_id: L, action_type: t, card_instance_id: "x", action_priority: Number(flat(c.action_priority) ?? 2), action_category: String(flat(c.action_category) ?? ""), data_payload: e?.data_payload ?? pl };
        let tm: any = {}; try { tm = (win.renderActionCandidates([cand], j.profile || {}, byDate[D] || {}, D, "veille", {}, D) || [])[0]?.tmpl || {}; } catch (err: any) { tm = { sowhat: "(erreur rendu) " + err.message }; }
        const en = e?.enjeu, cm = e?.context_motif, dp = cand.data_payload || {};
        const pill = en && en.eur_year != null ? `**${eur(en.eur_year)}/an** (${en.label_fr}, ${en.tier_label_fr || en.tier || ""})`
          : (e?.corner_day_mode && dp.delta_eur != null) ? `**${eur(Number(dp.delta_eur))} · ce jour**`
          : (e?.corner_day_mode && dp.daily_revenue != null && dp.expected_revenue != null) ? `**${eur(Number(dp.daily_revenue) - Number(dp.expected_revenue))} · ce jour**`
          : cm && cm.eur_year != null ? `motif du jour : ${cm.label_fr} **${eur(cm.eur_year)}/an**`
          : (e?.enjeu_reason_fr ? `— (${e.enjeu_reason_fr})` : "—");
        out += `- \`${t}\` · ${D.slice(8)}/${D.slice(5, 7)} · ${pill}\n  ${strip(tm.sowhat)}\n  → ${strip(tm.action)}\n`;
      }
    }
    const rest = [...new Set((cands as any[]).map((c) => String(flat(c.action_type))).filter((t) => !seen.has(t)))]; if (rest.length) out += `\n## Non classés : ${rest.join(", ")}\n`;
  }
  writeFileSync(outPath, out); console.log("écrit", outPath, "·", total, "cartes ·", (out.match(/· ce jour\*\*/g) || []).length, "coins « ce jour » ·", (out.match(/\/an\*\* \(/g) || []).length, "€/an propres ·", (out.match(/motif du jour :/g) || []).length, "motifs du jour");
})();
