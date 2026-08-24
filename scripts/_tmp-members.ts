import "dotenv/config"; import { makeBQClient } from "../src/lib/bq"; import { dayClassMembersSql } from "../src/lib/dayClassRegistry";
const bq = makeBQClient("muse-square-open-data"); const L = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
(async () => { for (const k of ["rain", "heat_25_27", "school_holiday", "competition_low", "traffic_high"]) { const [r] = await bq.query({ query: dayClassMembersSql(), params: { location_id: L, class_key: k }, location: "EU" }); console.log(k, "→", r.length, "jours, dernier", r.length ? String(r[r.length - 1].date?.value || r[r.length - 1].date) : "—"); } })();
