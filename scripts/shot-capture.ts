// Capture SITE VITRINE — inventaire complet des cartes réelles du compte owner, sur TOUTES les
// dates que la vue conserve. LECTURE SEULE. Ne modifie rien en base, ne touche pas à l'app.
// Rend chaque carte par le VRAI moteur (public/action-cards.js en happy-dom), exactement comme
// pulse.astro : le texte affiché est celui que la page écrirait.
// Sortie : data/shots/capture-all.json (brut par date, RIEN de supprimé) + inventaire lisible.
// Usage : npx tsx scripts/shot-capture.ts
import "dotenv/config";
import { writeFileSync, readFileSync } from "node:fs";
import { makeBQClient } from "../src/lib/bq";
import { GET as monitorGET } from "../src/pages/api/insight/monitor";

const PROJECT = "muse-square-open-data";
const OWNER = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);
const strip = (h: any) => String(h == null ? "" : h).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const frInt = (n: any) => (n == null || !isFinite(Number(n)) ? "—" : Number(n).toLocaleString("fr-FR"));

(async () => {
  const bq = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);
  const [[u]] = await bq.query({
    query: `SELECT clerk_user_id FROM \`${PROJECT}.raw.insight_event_user_location_profile\` WHERE location_id = @l LIMIT 1`,
    params: { l: OWNER }, location: "EU",
  });
  const uid = String(flat(u.clerk_user_id));

  // Les dates que la vue conserve réellement (fenêtre glissante) — jamais devinées.
  const [dateRows] = await bq.query({
    query: `SELECT DISTINCT date FROM \`${PROJECT}.semantic.vw_insight_event_action_candidates\`
            WHERE location_id = @l ORDER BY date`,
    params: { l: OWNER }, location: "EU",
  });
  const dates: string[] = (dateRows as any[]).map((r) => String(flat(r.date)));
  console.log("dates conservées par la vue :", dates.length, "→", dates.join(", "));

  // Moteur de rendu RÉEL, chargé une fois.
  const { Window } = await import("happy-dom");
  const win: any = new Window({ url: "https://app.local/app/insightevent/pulse" });
  const src = readFileSync(new URL("../public/action-cards.js", import.meta.url), "utf8");
  new Function("window", "document", src)(win, win.document);

  const locals = { clerk_user_id: uid, location_id: OWNER, all_location_ids: [OWNER] };
  const perDate: any[] = [];
  let structural: any[] = [];

  for (let i = 0; i < dates.length; i += 3) {
    const batch = dates.slice(i, i + 3);
    const got = await Promise.all(batch.map(async (d) => {
      const t0 = Date.now();
      const res = await monitorGET({
        url: new URL(`http://l/api/insight/monitor?location_id=${OWNER}&selected_dates=${d}`),
        locals,
      } as any);
      const j = JSON.parse(await (res as any).text());
      return { date: d, ms: Date.now() - t0, status: (res as any).status, json: j };
    }));
    for (const g of got) {
      if (!g.json?.ok) { console.log(`  ${g.date} — ÉCHEC ${g.status}: ${g.json?.error || "?"}`); continue; }
      const cur = (g.json.days || []).filter((x: any) => String(x.date) === g.date)[0] || (g.json.days || [])[0] || {};
      const entries = win.renderActionCandidates(
        g.json.action_candidates || [], g.json.profile || {}, cur, g.date, "veille", {}, g.date
      ) || [];
      const cards = entries.map((en: any) => {
        const it = en.item || {}, tm = en.tmpl || {};
        return {
          date: g.date, action_type: it.change_subtype || it.action_type || null,
          affected_date: it.affected_date || null,
          what: strip(tm.what), sowhat: strip(tm.sowhat), action: strip(tm.action),
          barClass: tm.barClass || null, score: en.score,
          enjeu_eur_year: it.enjeu?.eur_year ?? null, enjeu_reason_fr: it.enjeu_reason_fr || null,
          confidence_tier: it.confidence_tier || null, action_category: it.action_category || null,
        };
      });
      if (!structural.length && Array.isArray(g.json.day_class_impacts)) structural = g.json.day_class_impacts;
      perDate.push({ date: g.date, ms: g.ms, n_raw: (g.json.action_candidates || []).length, cards, raw: g.json });
      console.log(`  ${g.date} — ${g.ms} ms · ${(g.json.action_candidates || []).length} brutes → ${cards.length} rendues`);
    }
  }

  const out = { captured_at: new Date().toISOString(), location_id: OWNER, site_label: "Muse Square", dates, per_date: perDate, structural };
  const dest = new URL("../data/shots/capture-all.json", import.meta.url).pathname;
  writeFileSync(dest, JSON.stringify(out, null, 1));

  console.log("\n══════ INVENTAIRE — CARTES DU JOUR ══════");
  for (const p of perDate) {
    if (!p.cards.length) continue;
    console.log(`\n── ${p.date} (${p.cards.length}) ──`);
    p.cards.forEach((c: any, k: number) => {
      const e = c.enjeu_eur_year != null ? ` [${c.enjeu_eur_year > 0 ? "+" : ""}${frInt(Math.round(c.enjeu_eur_year))} €/an]` : "";
      console.log(` ${k + 1}. <${c.action_type}> ${c.what}${e}`);
      if (c.sowhat) console.log(`     · ${c.sowhat}`);
      if (c.action) console.log(`     → ${c.action.slice(0, 190)}`);
    });
  }
  console.log("\n══════ INVENTAIRE — CARTES STRUCTURELLES (non datées) ══════");
  structural.forEach((s: any, k: number) => {
    console.log(` ${k + 1}. <${s.class_key}/${s.family}> ${s.title_fr} [${s.eur_year > 0 ? "+" : ""}${frInt(Math.round(s.eur_year))} €/an · n=${s.n_days} · ${s.basis}]`);
    if (s.chantier_fr) console.log(`     → ${s.chantier_fr}`);
  });
  console.log("\nécrit:", dest, "—", perDate.reduce((a, p) => a + p.cards.length, 0), "cartes du jour +", structural.length, "structurelles");
})();
