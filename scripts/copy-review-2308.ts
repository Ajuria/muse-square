// Revue de copie des cartes — données RÉELLES (23/08).
// Exécute action-cards.js tel qu'il est livré, rend chaque carte avec un payload réel du parc,
// et croise avec les tirs, la couverture reco-library et la mesurabilité de la classe.
import "dotenv/config";
import { BigQuery } from "@google-cloud/bigquery";
import * as fs from "fs"; import * as vm from "vm";
const bq = new BigQuery({ projectId: "muse-square-open-data", location: "EU" });
const f=(v:any)=>v&&typeof v==="object"&&"value"in v?v.value:v;
const win:any = {};
const ctx = vm.createContext({ window: win, document:{createElement:()=>({style:{},setAttribute(){},appendChild(){}})},
  console, Date, JSON, Math, Number, String, Array, Object, isNaN, parseInt, parseFloat, RegExp });
vm.runInContext(fs.readFileSync("public/reco-library.js","utf8"), ctx, {filename:"reco-library.js"});
vm.runInContext(fs.readFileSync("public/action-cards.js","utf8"), ctx, {filename:"action-cards.js"});
const SPECS = win.ACTION_CARDS;
const prof = JSON.parse(fs.readFileSync(process.env.SP + "/owner-profile.json","utf8"));

(async () => {
  const [tirs] = await bq.query({ query: `
    SELECT action_type, COUNT(*) n, COUNT(DISTINCT location_id) sites, ANY_VALUE(data_payload) ex
    FROM \`muse-square-open-data.semantic.vw_insight_event_action_candidates\`
    WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY) GROUP BY 1`, location:"EU" });
  const fire = new Map((tirs as any[]).map((r:any)=>[String(f(r.action_type)),
    { n:Number(f(r.n)), sites:Number(f(r.sites)), ex:String(f(r.ex)||"{}") }]));

  const out: any[] = [];
  for (const t of Object.keys(SPECS).sort()) {
    const s = SPECS[t];
    const fr = fire.get(t);
    let payload:any = {}; try { payload = JSON.parse(fr?.ex || "{}"); } catch {}
    let corps = "", geste = "";
    try { const r = s.sowhat ? s.sowhat(payload, prof, {}) : null;
          corps = typeof r === "string" ? r : (r?.context ?? ""); geste = (r && r.action) || ""; } catch(e:any){ corps = "ERREUR "+e.message; }
    // Couverture des plans : reco-library expose MS_SALES_RECO_LIB, dont action-cards
    // dérive spec.recos. Entrées ÉCRITES seulement — l'échafaudage est commenté.
    const lib = (win as any).MS_SALES_RECO_LIB || {};
    const e = lib[t];
    const branches = e ? Object.keys(e) : [];
    const plans = e ? branches.reduce((a:number,k:string)=>a + (Array.isArray(e[k]) ? e[k].length : 0), 0) : 0;
    out.push({ type:t, label:s.brand_label_fr||"", cat:s.category_label_fr||"", nature:s.card_type||"",
               tirs: fr?.n ?? 0, sites: fr?.sites ?? 0, plans, branches: branches.join('/'), corps, geste });
  }
  fs.writeFileSync("/tmp/copy-review.json", JSON.stringify(out, null, 1));
  console.log(`${out.length} cartes au registre · ${out.filter(o=>o.tirs>0).length} ont tiré sur 90 j · ${out.filter(o=>o.plans===0).length} sans plans`);
  const g = new Map<string, any>();
  for (const o of out) {
    const k = o.cat || "(sans)";
    if (!g.has(k)) g.set(k, { categorie:k, cartes:0, tirent:0, tirs:0, avec_plans:0 });
    const v = g.get(k); v.cartes++; v.tirs += o.tirs; if (o.tirs>0) v.tirent++; if (o.plans>0) v.avec_plans++;
  }
  console.log("\n── par catégorie ──");
  console.table([...g.values()].sort((a,b)=>b.tirs-a.tirs));
  console.log("\n── CARTES QUI TIRENT, sans plans (le gap qui compte) ──");
  console.table(out.filter(o=>o.tirs>0 && o.plans===0).sort((a,b)=>b.tirs-a.tirs)
    .map(o=>({carte:o.type, cat:o.cat, tirs:o.tirs, sites:o.sites})));
  console.log("\n── CARTES AU REGISTRE QUI NE TIRENT JAMAIS ──");
  console.log("   " + out.filter(o=>o.tirs===0).map(o=>o.type).join(", "));
})().catch(e=>{console.error("ÉCHEC:",e?.message);process.exit(1);});
