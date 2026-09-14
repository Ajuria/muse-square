// tools/harness/envois-rail-verify.mts — LE RAIL D'ENVOI D'UN RAPPORT, VU SANS RIEN ENVOYER (14/09).
//
// `docs/chantiers-ouverts-spec.md` § 2 : la chaîne est complète, aucun code à écrire, et elle n'a JAMAIS
// été vue partir seule — un seul envoi depuis toujours (l'essai manuel du 12/09) et aucune cadence active.
// Ce harnais dit l'état, ce qui est dû, et ce qui partirait — SANS envoyer un seul courriel (`?dry=1`).
//
// LE PIÈGE QU'IL ÉVITE : `analytics.report_schedules` est append-only VERSIONNÉE. Un `COUNTIF(actif)` brut
// compte les versions périmées et rend « 1 active » alors qu'il n'y en a aucune (mesuré le 14/09). L'état
// se lit sur la DERNIÈRE version par schedule_id, jamais sur la table nue.
//
// `--activer=<heure>` POSE une cadence quotidienne active à cette heure de Paris, sur le Modèle « Rapport
// de ventes », vers les destinataires de la cadence existante (l'adresse de l'owner). C'est le geste que le
// chantier § 2 attend — il fait PARTIR un courriel au prochain passage du cron. Sans ce drapeau, rien n'est
// écrit et rien n'est envoyé.
//
// Usage : npx tsx tools/harness/envois-rail-verify.mts [--activer=13]
import "dotenv/config";
import { makeBQClient } from "../../src/lib/bq";
import { GET as cronGET } from "../../src/pages/api/cron/report-sends";

const P = process.env.BQ_PROJECT_ID || "muse-square-open-data";
const bq = makeBQClient(P);
const f = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);

// ── 1. L'état COURANT des cadences — à la clé et à la dernière version ──────────────────────────
const [cads] = await bq.query({
  query: `WITH d AS (SELECT *, ROW_NUMBER() OVER (PARTITION BY schedule_id ORDER BY version DESC, created_at DESC) AS rn
                     FROM \`${P}.analytics.report_schedules\`)
          SELECT schedule_id, version, actif, cadence, heure, canal, modele_nom, ARRAY_LENGTH(JSON_VALUE_ARRAY(destinataires_json)) AS n_dest
          FROM d WHERE rn = 1 ORDER BY modele_nom`,
  location: "EU",
});
const c = (cads as any[]).map((r) => ({
  id: String(f(r.schedule_id)), version: Number(f(r.version)), actif: f(r.actif) === true,
  cadence: String(f(r.cadence)), heure: Number(f(r.heure)), canal: String(f(r.canal)),
  modele: String(f(r.modele_nom)), n_dest: Number(f(r.n_dest) ?? 0),
}));
console.log(`\nLE RAIL D'ENVOI D'UN RAPPORT — état réel\n`);
console.log(`  cadences (dernière version de chacune) : ${c.length}, dont ACTIVES : ${c.filter((x) => x.actif).length}`);
c.forEach((x) => console.log(`   ${x.actif ? "✓" : "✗"} ${x.modele} · ${x.cadence} ${String(x.heure).padStart(2, "0")}h · ${x.canal} · ${x.n_dest} destinataire(s) · v${x.version} ${x.actif ? "ACTIVE" : "inactive"}`));

// ── 2. Les envois déjà partis ───────────────────────────────────────────────────────────────────
const [env] = await bq.query({
  query: `SELECT CAST(sent_at AS STRING) AS quand, canal, n_recipients, schedule_id
          FROM \`${P}.analytics.report_sends\` ORDER BY sent_at DESC LIMIT 5`, location: "EU",
});
console.log(`\n  envois tracés : ${(env as any[]).length ? "" : "AUCUN"}`);
(env as any[]).forEach((r) => console.log(`   ${String(f(r.quand)).slice(0, 16)} · ${f(r.canal)} · ${f(r.n_recipients)} destinataire(s) · cadence ${String(f(r.schedule_id)).slice(0, 8)}…`));

// ── 3. Le cron, À BLANC — ce qui est dû maintenant, sans envoyer ────────────────────────────────
if (!process.env.CRON_SECRET) { console.error(`\n✗ CRON_SECRET absent de l'environnement : le tir à blanc ne peut pas s'authentifier.`); process.exit(2); }
const res = await cronGET({
  request: new Request("http://l/api/cron/report-sends?dry=1", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }),
  url: new URL("http://l/api/cron/report-sends?dry=1"),
} as any);
const j: any = await (res as Response).json();
console.log(`\n  tir à blanc du cron (aucun courriel ne part) : ${j.ok ? "ok" : "ÉCHEC — " + j.error}`);
if (j.ok) {
  console.log(`   heure de Paris vue par le cron : ${JSON.stringify(j.now)}`);
  (j.lignes ?? []).length ? (j.lignes as string[]).forEach((l) => console.log(`   ${l}`)) : console.log(`   rien à faire — aucune cadence active`);
}
console.log(`\n${c.some((x) => x.actif) ? "Une cadence est active : le prochain passage du cron la traitera." : "AUCUNE cadence active — le cron n'a rien à faire, et le rail ne peut pas être vu partir."}`);

// ── 4. Poser une cadence active (le geste du § 2) ───────────────────────────────────────────────
const HEURE = (process.argv.find((a) => a.startsWith("--activer=")) || "").slice(10);
if (HEURE) {
  const h = Number(HEURE);
  if (!Number.isInteger(h) || h < 0 || h > 23) { console.error("--activer attend une heure entière 0-23."); process.exit(2); }
  const LOC = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
  const [[u]] = await bq.query({
    query: `SELECT clerk_user_id FROM \`${P}.raw.insight_event_user_location_profile\` WHERE location_id = @l AND clerk_user_id IS NOT NULL LIMIT 1`,
    params: { l: LOC }, location: "EU",
  });
  const userId = String(f((u as any)?.clerk_user_id) ?? "");
  // Les destinataires ne s'inventent pas : ceux de la cadence déjà créée par l'owner.
  const [[d]] = await bq.query({
    query: `WITH x AS (SELECT *, ROW_NUMBER() OVER (PARTITION BY schedule_id ORDER BY version DESC) rn FROM \`${P}.analytics.report_schedules\` WHERE location_id = @l)
            SELECT destinataires_json FROM x WHERE rn = 1 LIMIT 1`,
    params: { l: LOC }, location: "EU",
  });
  const dest: string[] = JSON.parse(String(f((d as any)?.destinataires_json) ?? "[]"));
  if (!dest.length) { console.error("Aucun destinataire connu — rien n'est posé (on n'invente pas une adresse)."); process.exit(3); }
  // L'endpoint lit `import.meta.env` (Vite), qui n'existe pas sous tsx. On appelle donc EXACTEMENT les trois
  // fonctions qu'il appelle après validation (envois.ts l. 122-124) — et on le dit, au lieu de laisser croire
  // qu'on passe par la route. La route est déjà prouvée : c'est le formulaire qui a créé la cadence du 12/09.
  // Ce qui n'a JAMAIS été prouvé, et que cette cadence va montrer, c'est le CRON partant seul.
  const { newScheduleRow, writeSchedule, ensureTables, cadenceFr } = await import("../../src/lib/rapport/envois");
  const row = newScheduleRow({
    location_id: LOC, author: { user_id: userId, role: "owner" },
    modele_id: "ventes", modele_nom: "Rapport de ventes",
    cadence: "quotidien", heure: h, canal: "email", destinataires: dest,
  });
  await ensureTables(bq);
  await writeSchedule(bq, row);
  console.log(`\n  cadence posée (par les fonctions de l'endpoint, pas par la route) : ${cadenceFr(row)} → ${dest.join(", ")} (${row.schedule_id.slice(0, 8)}… v${row.version}, actif ${row.actif})`);
}
