// RELEVÉ DE COPIE — les 34 types de cartes qui tirent, rendus par le VRAI moteur.
// LECTURE SEULE. Aucune proposition : on lit ce qui est écrit aujourd'hui, pour relecture owner.
// Un payload réel par type (pris sur n'importe quel site), passé dans renderActionCandidates
// avec le profil + le contexte jour du compte owner — le WORDING est exact, les nombres sont
// ceux du payload prélevé. Usage : npx tsx scripts/copy-review.ts
import "dotenv/config";
import { writeFileSync, readFileSync } from "node:fs";
import { makeBQClient } from "../src/lib/bq";
import { GET as monitorGET } from "../src/pages/api/insight/monitor";

const PROJECT = "muse-square-open-data";
const OWNER = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);
const strip = (h: any) => String(h == null ? "" : h).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

(async () => {
  const bq = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);

  // 1) Un exemplaire réel par type — le plus récent, tous sites confondus.
  const [rows] = await bq.query({
    query: `
      SELECT action_type, ANY_VALUE(data_payload HAVING MAX date) AS data_payload,
             ANY_VALUE(action_priority) AS action_priority,
             ANY_VALUE(action_category) AS action_category,
             COUNT(*) AS tirs, COUNT(DISTINCT location_id) AS sites
      FROM \`${PROJECT}.semantic.vw_insight_event_action_candidates\`
      GROUP BY action_type ORDER BY sites DESC, tirs DESC`,
    location: "EU",
  });
  const types = (rows as any[]).map((r) => ({
    action_type: String(flat(r.action_type)),
    payload: flat(r.data_payload),
    action_priority: Number(flat(r.action_priority) ?? 2),
    action_category: String(flat(r.action_category) ?? ""),
    tirs: Number(flat(r.tirs)), sites: Number(flat(r.sites)),
  }));
  console.log("types qui tirent :", types.length);

  // 2) Profil + contexte jour RÉELS du compte owner (un seul appel).
  const [[u]] = await bq.query({
    query: `SELECT clerk_user_id FROM \`${PROJECT}.raw.insight_event_user_location_profile\` WHERE location_id = @l LIMIT 1`,
    params: { l: OWNER }, location: "EU",
  });
  const today = new Date().toISOString().slice(0, 10);
  const res = await monitorGET({
    url: new URL(`http://l/api/insight/monitor?location_id=${OWNER}&selected_dates=${today}`),
    locals: { clerk_user_id: String(flat(u.clerk_user_id)), location_id: OWNER, all_location_ids: [OWNER] },
  } as any);
  const j = JSON.parse(await (res as any).text());
  const day = (j.days || []).filter((d: any) => String(d.date) === today)[0] || (j.days || [])[0] || {};
  console.log("contexte owner :", j.ok ? "ok" : "ÉCHEC", "· jour", day.date || "—");

  // 3) Le VRAI moteur.
  const { Window } = await import("happy-dom");
  const win: any = new Window({ url: "https://app.local/app/insightevent/pulse" });
  new Function("window", "document", readFileSync(new URL("../public/action-cards.js", import.meta.url), "utf8"))(win, win.document);

  // 4) Un rendu par type, isolément — pour qu'aucun filtrage inter-cartes ne masque un texte.
  const out: any[] = [];
  for (const t of types) {
    const cand = {
      date: today, location_id: OWNER, action_type: t.action_type,
      card_instance_id: `review-${t.action_type}`,
      action_priority: t.action_priority, action_category: t.action_category,
      confidence_tier: null, suppression_key: null, expires_at: null,
      data_payload: typeof t.payload === "string" ? JSON.parse(t.payload) : t.payload,
    };
    let entry: any = null, err: string | null = null;
    try {
      const e = win.renderActionCandidates([cand], j.profile || {}, day, today, "veille", {}, today) || [];
      entry = e[0] || null;
    } catch (ex: any) { err = ex?.message || String(ex); }
    const tm = entry?.tmpl || {};
    out.push({
      action_type: t.action_type, sites: t.sites, tirs: t.tirs,
      rendu: !!entry, erreur: err,
      titre: strip(tm.what), corps: strip(tm.sowhat), geste: strip(tm.action),
      barClass: tm.barClass || null,
      payload_keys: Object.keys(cand.data_payload || {}).sort(),
    });
  }

  const rendus = out.filter((o) => o.rendu).length;
  console.log(`rendus : ${rendus}/${out.length}`);
  writeFileSync(new URL("../shots/copy-review.json", import.meta.url).pathname, JSON.stringify(out, null, 1));
  out.forEach((o, i) => {
    console.log(`\n${String(i + 1).padStart(2)}. <${o.action_type}> · ${o.sites} sites · ${o.tirs} tirs${o.rendu ? "" : "  ⚠ NON RENDU" + (o.erreur ? " — " + o.erreur : "")}`);
    if (o.titre) console.log(`    T: ${o.titre}`);
    if (o.corps) console.log(`    C: ${o.corps}`);
    if (o.geste) console.log(`    G: ${o.geste}`);
  });
})();
