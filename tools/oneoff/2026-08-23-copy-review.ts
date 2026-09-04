// Revue de copie des cartes — données RÉELLES, par le VRAI chemin (23/08, v2).
//
// v1 rendait avec `d = {}` et sans `a.enjeu` : trois défauts annoncés étaient des artefacts.
// v2 reproduit EXACTEMENT ce que renderActionCandidates reçoit :
//   feedItem  = payload aplati + enjeu/context_motif (enjeuWithReasonForCandidate, comme monitor)
//               + affected_date
//   mergedDay = la ligne du day surface du (lieu, date) + payload par-dessus
// Compte de référence f10c3e58 ; pour les cartes qui n'y tirent pas, le premier site qui tire.
import "dotenv/config";
import { BigQuery } from "@google-cloud/bigquery";
import { makeBQClient } from "../../src/lib/bq";
import { getDayClassImpacts, enjeuWithReasonForCandidate } from "../../src/lib/dayClassRegistry";
import * as fs from "fs"; import * as vm from "vm";
const raw = new BigQuery({ projectId: "muse-square-open-data", location: "EU" });
const bq = makeBQClient(process.env.BQ_PROJECT_ID || "muse-square-open-data");
const un = (x:any):any => x && typeof x==="object" && "value" in x ? x.value : x;
const flat = (o:any) => JSON.parse(JSON.stringify(o, (_k,v)=> v && typeof v==="object" && "value" in v ? v.value : v));
const OWNER = "f10c3e58-326e-4e38-947c-d59fcbe51df5";

const win:any = {};
const ctx = vm.createContext({ window: win, document:{createElement:()=>({style:{},setAttribute(){},appendChild(){}})},
  console, Date, JSON, Math, Number, String, Array, Object, isNaN, parseInt, parseFloat, RegExp });
vm.runInContext(fs.readFileSync("public/reco-library.js","utf8"), ctx, {filename:"reco-library.js"});
vm.runInContext(fs.readFileSync("public/action-cards.js","utf8"), ctx, {filename:"action-cards.js"});
const SPECS = win.ACTION_CARDS;
const prof = JSON.parse(fs.readFileSync(process.env.SP + "/owner-profile.json","utf8"));

(async () => {
  // Un tir réel par type — owner d'abord.
  const [cands] = await raw.query({ query: `
    SELECT action_type, location_id, CAST(date AS STRING) d, data_payload, action_priority, action_category
    FROM \`muse-square-open-data.semantic.vw_insight_event_action_candidates\`
    WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
    QUALIFY ROW_NUMBER() OVER (PARTITION BY action_type ORDER BY IF(location_id=@o,0,1), date DESC) = 1`,
    params:{o:OWNER}, location:"EU" });
  const [stats] = await raw.query({ query: `
    SELECT action_type, COUNT(*) n, COUNT(DISTINCT location_id) sites
    FROM \`muse-square-open-data.semantic.vw_insight_event_action_candidates\`
    WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY) GROUP BY 1`, location:"EU" });
  const st = new Map((stats as any[]).map((r:any)=>[String(un(r.action_type)), {n:Number(un(r.n)), sites:Number(un(r.sites))}]));
  const rows = (cands as any[]).map(flat);
  // Day surface et impacts, par (lieu) — en PARALLÈLE.
  const locs = [...new Set(rows.map(r=>String(r.location_id)))];
  const dates = new Map<string,string[]>(); rows.forEach(r=>{ const k=String(r.location_id); if(!dates.has(k)) dates.set(k,[]); dates.get(k)!.push(String(r.d)); });
  const [impacts, surfaces] = await Promise.all([
    Promise.all(locs.map(l => getDayClassImpacts(bq, l, dates.get(l)!).then(r=>[l,r] as const))),
    raw.query({ query: `
      SELECT * FROM \`muse-square-open-data.semantic.vw_insight_event_day_surface\`
      WHERE location_id IN UNNEST(@locs) AND date >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)`,
      params:{locs}, location:"EU" }).then(r=>(r[0] as any[]).map(flat)),
  ]);
  const imp = new Map(impacts);
  const surf = new Map(surfaces.map((s:any)=>[`${s.location_id}|${String(s.date).slice(0,10)}`, s]));
  const lib = win.MS_SALES_RECO_LIB || {};

  // v3 — par LA fonction de la page : renderActionCandidates(candidates, prof, day, date, mode).
  // Elle reçoit les candidats tels que monitor.ts les enrichit (enjeu, context_motif…) et
  // rend { what, sowhat, action } — le titre SURCHARGÉ compris (sales_surge, commercial_event_match…),
  // que la lecture de spec.brand_label_fr ratait.
  const out:any[] = [];
  for (const t of Object.keys(SPECS).sort()) {
    const s = SPECS[t]; const r = rows.find(x=>String(x.action_type)===t); const f = st.get(t);
    const e = lib[t]; const plans = e ? Object.keys(e).reduce((a,k)=>a+(Array.isArray(e[k])?e[k].length:0),0) : 0;
    const rec:any = { type:t, cat:s.category_label_fr||"", tirs:f?.n??0, sites:f?.sites??0, plans, titre:"", corps:"", geste:"" };
    if (r) {
      let dp:any = {}; try { dp = typeof r.data_payload==="string" ? JSON.parse(r.data_payload) : (r.data_payload||{}); } catch {}
      const er = enjeuWithReasonForCandidate(imp.get(String(r.location_id)) as any, { action_type:t, date:r.d, data_payload:r.data_payload });
      // EXACTEMENT la forme que monitor.ts émet (lignes ~1010-1030).
      const ac = { enjeu: er.enjeu||null, enjeu_reason_fr: er.reason_fr||null, context_motif: er.context_motif||null,
        corner_day_mode: er.corner_day_mode===true, date: r.d, location_id: r.location_id, action_type: t,
        action_priority: r.action_priority, action_category: r.action_category, data_payload: dp, suppression_key: null };
      const day = surf.get(`${r.location_id}|${r.d}`) || {};
      rec.site = String(r.location_id).slice(0,8); rec.date = r.d;
      rec.enjeu = er.enjeu ? Math.round(er.enjeu.eur_year) : null; rec.raison = er.reason_fr || null;
      try {
        const entries = win.renderActionCandidates([ac], prof, day, r.d, 'veille', {}, r.d) || [];
        const tm = entries[0]?.tmpl;
        if (tm) { rec.titre = String(tm.what||"").replace(/&#39;|&rsquo;/g,"'").replace(/&amp;/g,"&"); rec.corps = String(tm.sowhat||""); rec.geste = String(tm.action||""); }
        else rec.corps = "(non rendu — filtré par renderActionCandidates)";
      } catch(e:any){ rec.corps = "ERREUR "+e.message; }
    }
    out.push(rec);
  }
  fs.writeFileSync("/tmp/copy-review.json", JSON.stringify(out, null, 1));
  console.log(`${out.length} cartes · ${out.filter(o=>o.tirs>0).length} tirent · rendues par le vrai chemin\n`);
  for (const o of out.filter(o=>o.tirs>0).sort((a,b)=>b.tirs-a.tirs)) {
    console.log(`### ${o.type} · ${o.cat} · ${o.tirs} tirs / ${o.sites} sites · plans ${o.plans||"AUCUN"} · ${o.site} ${o.date} · enjeu ${o.enjeu ?? "null"}${o.raison ? " · raison: "+o.raison.slice(0,40) : ""}`);
    console.log(`    titre : ${o.titre}`); console.log(`    corps : ${o.corps.slice(0,260)}`); if (o.geste) console.log(`    geste : ${o.geste.slice(0,220)}`); console.log();
  }
})().catch(e=>{console.error("ÉCHEC:",e?.message);process.exit(1);});
