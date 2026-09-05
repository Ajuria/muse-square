// tools/harness/proposed-follows-verify.mts — preuve P3.1-f (suivis proposés par menace).
// Tenant JETABLE : profil neuf synthétique + lignes de menace posées dans le mart (ids de
// concurrents RÉELS de l'annuaire), puis la VRAIE passe runProposedFollows, les VRAIES
// écritures relues (watched + tracking proposed=TRUE + marqueur), le rejeu → 0, la fiche du
// tableau de bord porte le drapeau — et TOUT est purgé (profil, suivis, marqueur, mart).
// Usage : npx tsx tools/harness/proposed-follows-verify.mts
import "dotenv/config";
import { makeBQClient } from "../../src/lib/bq";
import { runProposedFollows } from "../../src/lib/profile/proposedFollows";
import { GET as dashGET } from "../../src/pages/api/insight/dashboard";

const P = "muse-square-open-data";
// Id UNIQUE par run : le marqueur action_log part en streaming insert et reste indélébile
// ~90 min (buffer) — un id fixe ferait échouer tout rejeu du harnais dans cette fenêtre.
// Les marqueurs orphelins des runs passés sont inertes (tenant purgé, jamais re-candidat).
const LOC = "00000000-0000-4000-8000-" + Array.from({ length: 12 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
const USER = "user_e2e_synth_proposed";
const OWNER = "f10c3e58-326e-4e38-947c-d59fcbe51df5"; // gabarit de profil
let fails = 0;
const check = (l: string, c: boolean, d?: string) => { console.log((c ? "  OK " : "  FAIL ") + l + (d ? " — " + d : "")); if (!c) fails++; };
const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);
const bq = makeBQClient(P);

async function cleanup() {
  await bq.query({ query: `DELETE FROM \`${P}.raw.insight_event_user_location_profile\` WHERE location_id = @l AND clerk_user_id = @u`, params: { l: LOC, u: USER }, location: "EU" });
  await bq.query({ query: `DELETE FROM \`${P}.raw.watched_competitors\` WHERE location_id = @l`, params: { l: LOC }, location: "EU" });
  await bq.query({ query: `DELETE FROM \`${P}.raw.competitor_tracking\` WHERE location_id = @l`, params: { l: LOC }, location: "EU" });
  await bq.query({ query: `DELETE FROM \`${P}.mart.fct_competitor_threat_profile\` WHERE location_id = @l`, params: { l: LOC }, location: "EU" });
  // action_log est en streaming insert : DELETE peut échouer < 90 min (buffer) — non bloquant,
  // le marqueur d'un tenant synthétique n'affecte personne et saute au prochain passage.
  await bq.query({ query: `DELETE FROM \`${P}.analytics.action_log\` WHERE location_id = @l`, params: { l: LOC }, location: "EU" }).catch(() => {});
}

await cleanup();

// ── 1. Profil NEUF (created_at = maintenant → passe le filtre 14 j) ──
await bq.query({
  query: `INSERT INTO \`${P}.raw.insight_event_user_location_profile\`
          SELECT * REPLACE(@l AS location_id, @u AS clerk_user_id, 'e2e-proposed@musesquare.test' AS email,
                           '[E2E] Suivis proposés' AS company_name, '[E2E] Suivis proposés' AS site_name,
                           CURRENT_TIMESTAMP() AS created_at)
          FROM \`${P}.raw.insight_event_user_location_profile\`
          WHERE location_id = @src ORDER BY created_at DESC LIMIT 1`,
  params: { l: LOC, u: USER, src: OWNER }, location: "EU",
});

// ── 2. Menaces synthétiques dans le mart : 6 concurrents RÉELS de l'annuaire, scores décroissants ──
await bq.query({
  query: `INSERT INTO \`${P}.mart.fct_competitor_threat_profile\`
            (location_id, competitor_id, competitor_name, is_followed, threat_score, threat_level,
             audience_overlap_pct, distance_km, competitor_industry_code)
          SELECT @l, competitor_id, competitor_name, FALSE,
                 90 - ROW_NUMBER() OVER (ORDER BY competitor_name) * 5, 'high',
                 50, 2.0, industry_code
          FROM \`${P}.raw.competitor_directory\`
          WHERE deleted_at IS NULL AND competitor_name IS NOT NULL
          ORDER BY competitor_name LIMIT 6`,
  params: { l: LOC }, location: "EU",
});

try {
  // ── 3. La VRAIE passe ──
  const r1 = await runProposedFollows(bq);
  check("passe 1 : le tenant neuf est vu et 5 suivis proposés (top 5 de 6 menaces)",
    r1.scanned >= 1 && r1.proposed === 5, JSON.stringify(r1));

  const [wRows] = await bq.query({ query: `SELECT competitor_name FROM \`${P}.raw.watched_competitors\` WHERE location_id = @l AND deleted_at IS NULL`, params: { l: LOC }, location: "EU" });
  const [tRows] = await bq.query({ query: `SELECT proposed FROM \`${P}.raw.competitor_tracking\` WHERE location_id = @l AND deleted_at IS NULL`, params: { l: LOC }, location: "EU" });
  check("veille : 5 lignes watched_competitors", (wRows as any[]).length === 5);
  check("fiches : 5 lignes competitor_tracking, toutes proposed=TRUE",
    (tRows as any[]).length === 5 && (tRows as any[]).every((r) => flat(r.proposed) === true));

  // ── 4. Rejeu → 0 (marqueur posé) ──
  const r2 = await runProposedFollows(bq);
  check("passe 2 (rejeu) : le tenant ne repasse pas (marqueur action_log)",
    !r2.details.some((d) => d.startsWith(LOC.slice(0, 8))), JSON.stringify(r2));

  // ── 5. La fiche du tableau porte le drapeau (VRAI dashboard.ts) ──
  const dres: any = await (dashGET as any)({
    url: new URL("http://l/api/insight/dashboard"),
    locals: { clerk_user_id: USER, location_id: LOC, all_location_ids: [LOC] },
  });
  const dj = JSON.parse(await dres.text());
  const fiches = (dj.glance && dj.glance.fiches) || [];
  const proposedFiches = (fiches as any[]).filter((f) => f.location_id === LOC && f.proposed === true);
  check("tableau : les fiches du tenant portent proposed=true (libellé « suivi proposé — ajustez »)",
    proposedFiches.length === 5, `${proposedFiches.length}/5 — clés: ${Object.keys(dj).join(",").slice(0, 120)}`);
} finally {
  await cleanup();
  const [[left]] = await bq.query({ query: `SELECT COUNT(*) n FROM \`${P}.raw.competitor_tracking\` WHERE location_id = @l`, params: { l: LOC }, location: "EU" }).then(([r]: any) => [r]);
  check("purge : 0 suivi restant pour le tenant", Number(flat(left.n)) === 0);
}

console.log(fails ? `\n${fails} ÉCHEC(S)` : "\nTOUT VERT");
process.exit(fails ? 1 : 0);
