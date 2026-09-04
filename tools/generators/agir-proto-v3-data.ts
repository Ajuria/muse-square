// Harnais proto FIL AGIR v3 (support de tools/proto/agir-proto-v3.html). LECTURE SEULE.
// v2 + : capture les 7 JOURS (aujourd'hui + 6) du handler monitor DIRECT — les FAITS par jour
// du bandeau (météo FR, fériés/vacances nommés, delta mobilité, méga-événement, phrase de
// risque) qui dorment déjà dans days[]. Usage : npx tsx tools/generators/agir-proto-v3-data.ts
import "dotenv/config";
import { writeFileSync, readFileSync } from "node:fs";
import { makeBQClient } from "../../src/lib/bq";
import { GET as monitorGET } from "../../src/pages/api/insight/monitor";

const PROJECT = "muse-square-open-data";
const OWNER = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);

(async () => {
  const bq = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);
  const [[u]] = await bq.query({ query: `SELECT clerk_user_id FROM \`${PROJECT}.raw.insight_event_user_location_profile\` WHERE location_id = @l LIMIT 1`, params: { l: OWNER }, location: "EU" });
  const uid = String(flat(u.clerk_user_id));
  const [siteRows] = await bq.query({ query: `SELECT location_id, ANY_VALUE(company_name) AS label FROM \`${PROJECT}.raw.insight_event_user_location_profile\` WHERE clerk_user_id = @u GROUP BY 1`, params: { u: uid }, location: "EU" });
  const sites = (siteRows as any[]).map((r) => ({ location_id: String(flat(r.location_id)), label: String(flat(r.label) || "") }));
  console.log("sites:", sites.map((s) => s.label).join(" · "));
  const today = new Date();
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) dates.push(new Date(today.getTime() + i * 86_400_000).toISOString().slice(0, 10));
  const perSite: any[] = [];
  for (const s of sites) {
    const locals = { clerk_user_id: uid, location_id: s.location_id, all_location_ids: sites.map((x) => x.location_id) };
    const t0 = Date.now();
    const res = await monitorGET({
      url: new URL(`http://l/api/insight/monitor?location_id=${s.location_id}&selected_dates=${dates.join(",")}&light=1`),
      locals,
    } as any);
    const j = JSON.parse(await (res as any).text());
    console.log(s.label, "→", (res as any).status, "·", Date.now() - t0, "ms · days:", (j.days || []).length, "· candidates:", (j.action_candidates || []).length);
    perSite.push({ site: s, j });
  }
  const j = perSite.filter((x) => x.site.location_id === OWNER)[0].j;

  // ── FAITS PAR JOUR du bandeau — champs déjà présents sur days[] (audit 25/08). ──
  const mapDays = (jj: any) => (jj.days || []).map((d: any) => ({
    date: d.date,
    weather_label_fr: d.weather_label_fr ?? null,
    weather_alert_fr: d.weather_alert_fr ?? null,
    alert_level_max: d.alert_level_max ?? null,
    lvl_rain: d.lvl_rain ?? null, lvl_wind: d.lvl_wind ?? null, lvl_snow: d.lvl_snow ?? null,
    t_max: d.temperature_2m_max ?? null, t_min: d.temperature_2m_min ?? null,
    precip_pct: d.precipitation_probability_max_pct ?? null,
    holiday_name: d.holiday_name ?? null, vacation_name: d.vacation_name ?? null,
    mobility_pct: d.delta_att_mobility_pct ?? null,
    mega: d.is_mega_event_flag ? (d.active_mega_event_name ?? true) : null,
    top_risk_sentence: d.top_risk_sentence ?? null,
    status: d.status ?? null,
    opportunity_score: d.opportunity_score ?? null,
    events_5km: d.events_within_5km_count ?? null,
    // Affluence attendue (BestTime, déjà calculée par monitor — jamais rendue jusqu'ici).
    ft_peak_hour: d.ft_peak_hour ?? null, ft_quiet_hour: d.ft_quiet_hour ?? null,
    ft_peak_pct: d.ft_peak_busyness_pct ?? null, ft_avg_pct: d.ft_avg_busyness_pct ?? null,
    ft_hourly: d.ft_hourly_raw ?? null,
  }));
  const days = mapDays(j);
  days.forEach((d: any) => console.log(" ", d.date, "|", d.weather_label_fr, "| vac:", d.vacation_name, "| mob:", d.mobility_pct));

  // ── LES VRAIS CORPS (identique v2) : le vrai action-cards.js en happy-dom. ──
  const { Window } = await import("happy-dom");
  const strip = (h: any) => String(h == null ? "" : h).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const primary = dates[0];
  const src = readFileSync(new URL("../../public/action-cards.js", import.meta.url), "utf8");
  const cands: any[] = [];
  for (const ps of perSite) {
    const win: any = new Window({ url: "https://app.local/app/insightevent/pulse" });
    new Function("window", "document", src)(win, win.document);
    const jj = ps.j;
    const currentDay = (jj.days || []).filter((d: any) => String(d.date) === primary)[0] || (jj.days || [])[0] || {};
    const entries = win.renderActionCandidates(jj.action_candidates || [], jj.profile || {}, currentDay, primary, "veille", {}, primary) || [];
    entries.forEach((en: any) => {
      const it = en.item || {}, tm = en.tmpl || {};
      cands.push({
        action_type: it.change_subtype || null, date: it.affected_date || null,
        site: ps.site.label, location_id: ps.site.location_id,
        what: strip(tm.what), sowhat: strip(tm.sowhat), action: strip(tm.action),
        barClass: tm.barClass || null, score: en.score,
        enjeu: it.enjeu || null, enjeu_reason_fr: it.enjeu_reason_fr || null,
        needs_catchment: it.needs_catchment === true,
      });
    });
  }
  console.log("cartes (moteur réel, 3 sites):", cands.length);
  const out = { captured_at: new Date().toISOString(), today: primary, site_label: "Muse Square", owner_loc: OWNER,
    sites: sites, days, days_by_site: Object.fromEntries(perSite.map((ps: any) => [ps.site.location_id, mapDays(ps.j)])), cards: cands };
  const dest = new URL("../proto/agir-proto-v3-data.js", import.meta.url).pathname;
  writeFileSync(dest, "window.AGIR_PROTO_V3 = " + JSON.stringify(out, null, 1) + ";\n");
  console.log("écrit:", dest);
})();
