// tools/harness/sales-csv-sourcefile-verify.mts — preuve P3.1-d : le POST réel /api/import/sales-csv
// écrit source_file (nom du fichier déposé) sur chaque ligne. Import RÉEL de 2 lignes sur
// MS Test à des dates VIDES vérifiées (03-04/02/2020), lecture, puis DELETE exact — aucun état
// durable. Le déclencheur dbt est neutralisé par l'env (chemin « skipped » prévu du code).
// Usage : npx tsx tools/harness/sales-csv-sourcefile-verify.mts
import "dotenv/config";
delete process.env.DBT_JOB_CLIENT_SALES_REFRESH; // pas de job dbt pour un test
import { makeBQClient } from "../../src/lib/bq";
const { POST } = await import("../../src/pages/api/import/sales-csv.ts");

const P = "muse-square-open-data";
const LOC = "29383776-bd7a-4401-ac26-f2e6efe1f58c"; // MS Test
const FNAME = "ventes-test-p31d.csv";
let fails = 0;
const check = (l: string, c: boolean, d?: string) => { console.log((c ? "  OK " : "  FAIL ") + l + (d ? " — " + d : "")); if (!c) fails++; };
const flat = (v: any) => (v && typeof v === "object" && "value" in v ? v.value : v);

const bq = makeBQClient(P);
const [pre] = await bq.query({
  query: `SELECT COUNT(*) n FROM \`${P}.raw.client_transactions\` WHERE location_id = @l AND transaction_date BETWEEN '2020-02-03' AND '2020-02-04'`,
  params: { l: LOC }, location: "EU",
});
if (Number(flat((pre as any[])[0].n)) !== 0) throw new Error("dates non vides sur MS Test — abandon sans écrire");

const [[u]] = await bq.query({
  query: `SELECT clerk_user_id FROM \`${P}.raw.insight_event_user_location_profile\` WHERE location_id = @l LIMIT 1`,
  params: { l: LOC }, location: "EU",
});
const uid = String(flat(u.clerk_user_id));

const csv = "date;montant\n2020-02-03;12,50\n2020-02-04;20,00\n";
const fd = new FormData();
fd.append("file", new File([csv], FNAME, { type: "text/csv" }));
fd.append("source", "generic");
fd.append("location_id", LOC);
const res = await (POST as any)({
  request: new Request("http://l/api/import/sales-csv", { method: "POST", body: fd }),
  locals: { clerk_user_id: uid, location_id: LOC, all_location_ids: [LOC] },
});
const out = JSON.parse(await res.text());
check("import réel accepté (2 lignes)", res.status === 200 && out.status === "ok" && out.rows_accepted === 2, JSON.stringify({ s: res.status, st: out.status, acc: out.rows_accepted, err: out.error }));

try {
  const [rows] = await bq.query({
    query: `SELECT transaction_date, revenue, source_system, source_file FROM \`${P}.raw.client_transactions\`
            WHERE location_id = @l AND transaction_date BETWEEN '2020-02-03' AND '2020-02-04' ORDER BY transaction_date`,
    params: { l: LOC }, location: "EU",
  });
  const rs: any[] = rows as any[];
  check("2 lignes en base, source_file = " + FNAME,
    rs.length === 2 && rs.every((r) => String(flat(r.source_file)) === FNAME && String(flat(r.source_system)) === "csv_manual"),
    JSON.stringify(rs.map((r) => ({ d: String(flat(r.transaction_date)), f: flat(r.source_file) }))));
} finally {
  const [job] = await bq.query({
    query: `DELETE FROM \`${P}.raw.client_transactions\`
            WHERE location_id = @l AND transaction_date BETWEEN '2020-02-03' AND '2020-02-04' AND source_system = 'csv_manual' AND source_file = @f`,
    params: { l: LOC, f: FNAME }, location: "EU",
  });
  const [post] = await bq.query({
    query: `SELECT COUNT(*) n FROM \`${P}.raw.client_transactions\` WHERE location_id = @l AND transaction_date BETWEEN '2020-02-03' AND '2020-02-04'`,
    params: { l: LOC }, location: "EU",
  });
  check("nettoyage : 0 ligne restante", Number(flat((post as any[])[0].n)) === 0);
}
console.log(fails ? `\n${fails} ÉCHEC(S)` : "\nTOUT VERT");
process.exit(fails ? 1 : 0);
