// tools/harness/rapports-site-verify.mts — LA PAGE RAPPORTS TROUVE-T-ELLE SON SITE ? (14/09)
//
// L'owner a ouvert `/app/insightevent/rapports` SANS `?location_id` : trois panneaux « location_id requis »,
// aucun Modèle, donc aucun « Envoyer chaque… », et « Composer ne fait rien ». La page lisait le site dans
// l'URL et ne savait pas le retrouver autrement. Elle interroge désormais `/api/profile/locations` (LE foyer,
// celui de Pulse, du mois et de l'événement) et prend le site principal, sinon le premier.
//
// Ce harnais vérifie la moitié qui se vérifie sans navigateur : l'endpoint rend-il un site exploitable ?
// (Clerk garde `/app` et renvoie à la connexion : le rendu lui-même se voit sur le compte de l'owner.)
//
// Usage : npx tsx tools/harness/rapports-site-verify.mts
import "dotenv/config";
import { makeBQClient } from "../../src/lib/bq";
import { GET as locationsGET } from "../../src/pages/api/profile/locations";

const P = process.env.BQ_PROJECT_ID || "muse-square-open-data";
const LOC = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
const bq = makeBQClient(P);
const [[u]] = await bq.query({
  query: `SELECT clerk_user_id FROM \`${P}.raw.insight_event_user_location_profile\` WHERE location_id = @l AND clerk_user_id IS NOT NULL LIMIT 1`,
  params: { l: LOC }, location: "EU",
});
const userId = String((u as any)?.clerk_user_id?.value ?? (u as any)?.clerk_user_id ?? "");

const res = await locationsGET({ locals: { clerk_user_id: userId, role: "owner", all_location_ids: [LOC] }, url: new URL("http://l/api/profile/locations") } as any);
const j: any = await (res as Response).json();
console.log(`\nLA PAGE RAPPORTS TROUVE-T-ELLE SON SITE ?\n`);
if (!j?.ok) { console.error(`✗ /api/profile/locations : ${j?.error ?? "réponse non ok"}`); process.exit(1); }
const l: any[] = Array.isArray(j.locations) ? j.locations : [];
console.log(`  sites rendus            ${l.length}`);
l.forEach((x) => console.log(`   ${x.is_primary ? "★" : " "} ${String(x.location_id).slice(0, 8)}…  ${x.company_name ?? "(sans nom)"}`));
// LA MÊME règle que la page : le principal d'abord, sinon le premier.
const choisi = l.find((x) => x && x.is_primary) || l[0] || null;
console.log(`\n  le site que la page choisirait : ${choisi ? String(choisi.location_id) : "AUCUN"}`);
if (!choisi) { console.error(`✗ aucun site : la page dirait « Aucun site sur ce compte pour l'instant. »`); process.exit(1); }
console.log(choisi.location_id === LOC
  ? `\n✓ C'est bien le compte que l'owner teste — la page s'ouvre sans ?location_id.`
  : `\n✗ Ce n'est PAS ${LOC.slice(0, 8)}… : la page s'ouvrirait sur un autre site que celui de l'owner.`);
process.exit(choisi.location_id === LOC ? 0 : 1);
