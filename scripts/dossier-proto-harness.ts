// Harnais proto DOSSIER (NON COMMITTÉ — support de public/dossier-proto.html).
// Capture les payloads RÉELS du provider evenementFamily via le VRAI handler, pour deux cas :
//   · Corner de vente producteur — série (8 occ., 1 mesurée), KPI = famille Branded, cible 150 €
//   · Lancement SaaS            — one-off passé, KPI par défaut (CA vs attendu), sans cible
// Lecture seule. Usage : npx tsx scripts/dossier-proto-harness.ts
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { GET as evtGET } from "../src/pages/api/insight/evenement";

const OWNER = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
const CASES: Array<{ key: string; sid: string; label: string }> = [
  { key: "corner", sid: "56f47021-e0c2-42cc-a9ac-f1b04a9742f6", label: "Corner de vente producteur — série, KPI famille" },
  { key: "saas", sid: "cdd37a0a-693c-46e1-a1d3-b8e4ab1164e1", label: "Lancement SaaS — one-off, KPI CA vs attendu" },
];

(async () => {
  const locals: any = { clerk_user_id: "proto", location_id: OWNER, all_location_ids: [OWNER] };
  const payloads: Record<string, any> = {};
  for (const c of CASES) {
    const t0 = Date.now();
    const res: any = await (evtGET as any)({ url: new URL(`http://l/api/insight/evenement?location_id=${OWNER}&saved_item_id=${c.sid}`), locals });
    const j = JSON.parse(await res.text());
    if (!j.ok) throw new Error(`${c.key} : ${j.error}`);
    payloads[c.key] = { label: c.label, payload: j };
    const r0 = j.apres?.rows?.[0];
    console.log(`${c.key} : ${Date.now() - t0} ms · stage=${j.stage} · kpi=${j.item.kpi} · occ=${j.item.dates.length} · mesurées=${j.apres?.rows?.length ?? 0}`);
    if (r0) console.log(`   ${r0.date} · CA ${r0.revenue}/${r0.expected} · tickets ${r0.tickets}/${r0.tickets_base_dow ?? r0.tickets_base} · panier ${r0.basket}/${r0.basket_base_dow ?? r0.basket_base} · famille ${r0.family_rev}/${r0.family_avg}`);
  }
  const today = new Date().toISOString().slice(0, 10);
  const dest = new URL("../public/dossier-proto-data.js", import.meta.url).pathname;
  writeFileSync(dest, "window.DOSSIER_PROTO = " + JSON.stringify({ captured_at: new Date().toISOString(), today, cases: payloads }, null, 1) + ";\n");
  console.log("écrit :", dest);
})();
