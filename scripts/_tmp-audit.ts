import "dotenv/config";
import { BigQuery } from "@google-cloud/bigquery";
import * as fs from "fs";
const bq = new BigQuery({ projectId: "muse-square-open-data", location: "EU" });
const f=(v:any)=>v&&typeof v==="object"&&"value"in v?v.value:v;
const sql = fs.readFileSync("/tmp/main.sql","utf8");
const ctes = [...sql.matchAll(/^([a-z_0-9]+) as \($/gm)].map(m=>({name:m[1], line: sql.slice(0,m.index).split("\n").length}));
const emitted = new Set([...sql.matchAll(/'([a-z_0-9]+)' as action_type/g)].map(m=>m[1]));
(async () => {
  const [t] = await bq.query({ query: `
    SELECT action_type, COUNT(*) n, COUNT(DISTINCT location_id) sites,
      COUNTIF(location_id IN (SELECT DISTINCT location_id FROM \`muse-square-open-data.mart.fct_client_daily_performance\`)) n_mesurables
    FROM \`muse-square-open-data.mart.fct_location_daily_action_candidates\` GROUP BY 1`, location:"EU" });
  const fire = new Map((t as any[]).map((x:any)=>[String(f(x.action_type)), {n:Number(f(x.n)), sites:Number(f(x.sites)), mes:Number(f(x.n_mesurables))}]));
  const rows = [...emitted].map(a=>({ carte:a, tirs: fire.get(a)?.n ?? 0, sites: fire.get(a)?.sites ?? 0, "sur sites mesurables": fire.get(a)?.mes ?? 0 })).sort((a,b)=>b.tirs-a.tirs);
  console.log(`${ctes.length} CTE · ${emitted.size} types émis (littéraux) · ${rows.filter(r=>r.tirs>0).length} tirent`);
  console.table(rows);
})().catch(e=>{console.error("ÉCHEC:",e?.message);process.exit(1);});
