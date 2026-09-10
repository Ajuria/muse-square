// GARDE-FOU DE LA FRONTIÈRE ENTREPÔT — l'app lit la couche `semantic`, pas `mart`.
//
// POURQUOI CE TEST EXISTE, ET POURQUOI IL EST ICI ET PAS DANS dbt (26/08).
// `access:` / `group:` de dbt ne contraignent QUE les `ref()` entre modèles dbt. L'app Astro
// interroge BigQuery en direct : AUCUN réglage dbt ne peut lui interdire de lire `mart.*`.
// La frontière ne peut donc être tenue que du côté qui la franchit — ici.
//
// CE QU'IL FAIT : un CLIQUET, pas un couperet. L'état du 26/08 (130 lectures directes
// réparties sur 40 fichiers) est figé ci-dessous. Le test échoue quand :
//   - un fichier NON listé se met à lire `mart.*`        -> nouvelle dette, refusée ;
//   - un fichier listé en lit PLUS qu'à son cliquet       -> régression, refusée ;
//   - un fichier listé en lit MOINS                       -> progrès : le test dit le nouveau
//     chiffre à coller, pour que le cliquet ne rouille pas.
//
// Migrer une lecture = pointer la vue `semantic` correspondante puis baisser le nombre ici.
// Un chiffre qu'on baisse est la SEULE façon de sortir un fichier de cette liste.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Cliquet mesuré le 26/08 sur src/ (fichier -> nombre de références `mart.fct_*`).
// 07/09 — bascule offering/hourly (PR ms_database#127, vues vw_insight_event_client_offering_daily et
// vw_insight_event_client_hourly_daily EN BASE) : commitmentShape 2→0, dispositifFamille 1→0, offering 1→0,
// sales 3→1, weather 3→2, dashboard 18→16, prompt 2→1, sales-report 9→7. Plus aucune lecture de ces deux marts.
const CLIQUET: Record<string, number> = {
  "src/lib/ai/facts/buildDayPerformanceFacts.ts": 2,
  "src/lib/commitments/commitmentContext.ts": 4,
  "src/lib/commitments/commitmentResolve.ts": 1,
  // 0 → 2 (28/08, page Opération « Comprendre le résultat », commit 01c66b3 — instruit après
  // coup le 03/09, le garde était resté rouge 6 jours) : le grain HEURE × JOUR de
  // fct_client_hourly_sales (heures d'une opération et de ses 4 jours comparables). La seule
  // surface semantic horaire est vw_insight_event_client_hourly_profile — un PROFIL moyen par
  // jour de semaine × heure, pas des jours datés : aucune vue équivalente. Le même fichier lit
  // aussi raw.client_transactions (familles × produits) — hors de ce garde, dette notée.
  "src/lib/commitments/commitmentShape.ts": 0,
  "src/lib/kpi/dayClassRegistry.ts": 10,
  "src/lib/context/dayContext.ts": 19,
  // 0 → 1 (04/09, I8 lecture dispositif × famille — spec explorer-dispositif-famille-spec.md) : la
  // part de chaque famille dans le CA du jour (fct_client_offering_daily.revenue_share, intra-jour)
  // moyennée sur les jours d'opération vs comparables — grain JOUR × famille. Même situation que
  // dashboard.ts 17 → 18 : vw_insight_event_client_offering est un profil 30 j par article, sans
  // grain jour — vue semantic À DEMANDER en passation dbt (dbt est actif, owner 04/09 ; voir mémoire
  // semantic-views-missing). Le reste du fichier lit raw.client_transactions (tickets par famille,
  // hors de ce garde, dette notée au module-index).
  "src/lib/dispositifs/dispositifFamille.ts": 0,
  "src/lib/insightFamilies/calendar.ts": 1,
  "src/lib/insightFamilies/channels.ts": 8,
  "src/lib/insightFamilies/competitor.ts": 3,
  "src/lib/insightFamilies/dispositif.ts": 6,
  "src/lib/insightFamilies/evenement.ts": 3,
  "src/lib/insightFamilies/events.ts": 4,
  "src/lib/insightFamilies/footfall.ts": 1,
  "src/lib/insightFamilies/offering.ts": 0,
  "src/lib/insightFamilies/sales.ts": 1,
  "src/lib/insightFamilies/salesDecomp.ts": 1,
  "src/lib/insightFamilies/salesDiscount.ts": 1,
  "src/lib/insightFamilies/tourism.ts": 2,
  "src/lib/insightFamilies/weather.ts": 2,
  "src/lib/kpi/kpiRegistry.ts": 1,
  "src/lib/profile/proposedFollows.ts": 2,
  "src/lib/commitments/trackRecordCore.ts": 1,
  "src/pages/api/analytics/admin-dashboard.ts": 1,
  "src/pages/api/analytics/party-role.ts": 1,
  "src/pages/api/commitments/evolution.ts": 3,
  "src/pages/api/competitive/competitor-profile.ts": 1,
  "src/pages/api/competitive/competitor-signals.ts": 1,
  "src/pages/api/competitive/search-db.ts": 1,
  "src/pages/api/cron/competitor-alerts.ts": 2,
  "src/pages/api/cron/day-class-impacts.ts": 1,
  "src/pages/api/cron/digest.ts": 4,
  "src/pages/api/cron/internal-alert-sweep.ts": 1,
  "src/pages/api/insight/analogs.ts": 1,
  // 15 → 16 (27/08, fusion K9 marges) : famCa lit fct_client_offering_daily BORNÉ à
  // CURRENT_DATE() — la voie semantic (vw_insight_event_client_offering) est NON bornée en haut
  // (int_client_offering_profile : >= -30 j seul) et la graine porte des dates futures : la
  // « fenêtre 30 j » y compte 68 jours (mesuré 24/08). [Écrit « dbt gelé » le 27/08 ; FAUX depuis
  // le 04/09 (owner : dbt actif) — la vue bornée est à demander, mémoire semantic-views-missing.]
  // 16 → 17 (28/08, vue-equipe inc 3 — commit 8849137, instruit après coup) : le bandeau KPI
  // membre lit fct_client_daily_performance (volume/affluence/conversion en %, jamais un €).
  // 17 → 18 (28/08, pôles inc 2 — commit 79e2123, instruit après coup le 03/09) : la lecture
  // continue d'un pôle lit fct_client_offering_daily au grain JOUR × famille (30 j vendus vs
  // 90 précédents, bornés à today). vw_insight_event_client_offering est le profil 30 j par
  // article, sans grain jour : aucune vue équivalente tant que dbt n'en porte pas une.
  "src/pages/api/insight/dashboard.ts": 16,
  "src/pages/api/insight/monitor.ts": 1,
  // 1 → 2 (27/08, fusion K9 marges) : la réponse marge PAR FAMILLE lit fct_client_offering_daily
  // borné à CURRENT_DATE() — même justification que dashboard.ts ci-dessus (vue semantic non
  // bornée en haut + graine à dates futures ; « dbt gelé » écrit alors — faux depuis le 04/09, vue à demander).
  "src/pages/api/insight/prompt.ts": 1,
  "src/pages/api/insight/reactions-today.ts": 3,
  "src/pages/api/insight/sales-report.ts": 7,
  "src/pages/api/insight/weather-window.ts": 2,
  "src/pages/profile.astro": 3,
};

const MART_REF = /mart\.fct_[a-z_0-9]+/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|astro)$/.test(p) && !p.endsWith("warehouseBoundary.guard.test.ts")) out.push(p);
  }
  return out;
}

function countMartReads(file: string): number {
  let n = 0;
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (line.startsWith("//") || line.startsWith("*")) continue;   // commentaire : pas une lecture
    n += (line.match(MART_REF) ?? []).length;
  }
  return n;
}

describe("frontière entrepôt : l'app lit semantic, pas mart", () => {
  const actual = new Map<string, number>();
  for (const f of walk("src")) {
    const n = countMartReads(f);
    if (n > 0) actual.set(f, n);
  }

  it("aucun fichier NOUVEAU ne lit mart directement", () => {
    const nouveaux = [...actual.keys()].filter((f) => !(f in CLIQUET));
    expect(
      nouveaux,
      `Ces fichiers lisent \`mart.*\` sans être au cliquet. Lisez la vue \`semantic\` ` +
        `correspondante (docs/data-model-index.md). Si la vue n'existe pas encore, créez-la ` +
        `avant d'ajouter la lecture — c'est le sens de la frontière.`,
    ).toEqual([]);
  });

  it("aucun fichier n'augmente ses lectures mart", () => {
    const regressions = [...actual.entries()]
      .filter(([f, n]) => f in CLIQUET && n > CLIQUET[f])
      .map(([f, n]) => `${f} : ${CLIQUET[f]} -> ${n}`);
    expect(regressions, "Lectures mart en hausse — migrez vers semantic.").toEqual([]);
  });

  it("le cliquet ne rouille pas (baisses reportées)", () => {
    const baisses = [...Object.entries(CLIQUET)]
      .filter(([f, n]) => (actual.get(f) ?? 0) < n)
      .map(([f, n]) => `${f} : ${n} -> ${actual.get(f) ?? 0} (mettez CLIQUET à jour)`);
    expect(baisses, "Progrès non enregistré : baissez ces nombres dans CLIQUET.").toEqual([]);
  });
});

// ── 10/09 (owner) : L'APP NE LIT JAMAIS raw, NI staging, NI intermediate ─────────────────────────
// « Il faut arrêter de lire les fichiers raws — c'est une erreur de code récurrente impardonnable :
//   l'app DOIT lire les mart ou le semantic layer selon cas d'usage. It MUST stop. » (owner 10/09)
// Cas déclencheur : commitmentShape.ts lisait raw.client_transactions.quantity — l'entier arrondi par
// l'import — alors que la règle « une pesée = une vente » vit en staging (units_sold, ms_database#134).
// Une lecture brute contourne TOUT ce que dbt applique : routage de site, factures exclues
// (is_invoiced), canal, unités vendues, bornes de dates. La règle de lecture de l'app est donc :
// `semantic` d'abord ; `mart` seulement sous le cliquet ci-dessus ; `raw`, `staging`, `intermediate`
// JAMAIS. Une vue qui manque se crée dans dbt (passation / PR) AVANT la lecture, pas après.
// Même mécanique de CLIQUET : l'état du 10/09 est figé ; un fichier nouveau ou une hausse échoue ;
// une baisse doit être reportée. ÉCRIRE dans une table raw que l'app produit (INSERT, MERGE, UPDATE,
// DELETE, load) reste permis : c'est le côté producteur, que dbt lit ensuite comme source.
// Compté : `FROM` / `JOIN` suivi, sur la même ligne, d'un nom complet `<projet>.raw|staging|
// intermediate.<table>` (casse indifférente). ANGLE MORT CONNU : un nom de table rangé dans une
// variable puis lu par `FROM ${var}` n'est pas compté (saved-items/*.ts, recos/manualCandidates.ts) —
// ce n'est pas une porte de sortie : la règle vaut aussi là.
const BRUT_READ = /\b(?:from|join)\s+\\?`?(?:\$\{[^}]+\}|muse-square-open-data)\.(?:raw|staging|intermediate)\.[a-z_0-9]+/gi;

function countBrutReads(file: string): number {
  let n = 0;
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (line.startsWith("//") || line.startsWith("*")) continue;   // commentaire : pas une lecture
    n += (line.match(BRUT_READ) ?? []).length;
  }
  return n;
}

// Cliquet mesuré le 10/09 sur src/ (fichier -> lectures raw + staging + intermediate).
const CLIQUET_BRUT: Record<string, number> = {
  "src/lib/ai/webContext.ts": 1,
  "src/lib/commitments/commitmentResolve.ts": 1,
  "src/lib/commitments/commitmentShape.ts": 4,
  "src/lib/context/dayContext.ts": 2,
  "src/lib/dispositifs/dispositifFamille.ts": 2,
  "src/lib/dispositifs/ideaPlacement.ts": 1,
  "src/lib/dispositifs/poleReading.ts": 1,
  "src/lib/events/eventLifecycleCards.ts": 2,
  "src/lib/explorer/entityReading.ts": 3,
  "src/lib/explorer/planPeriod.ts": 2,
  "src/lib/explorer/siteFromQuestion.ts": 1,
  "src/lib/explorer/topFamilles.ts": 1,
  "src/lib/insightFamilies/channels.ts": 4,
  "src/lib/insightFamilies/dispositif.ts": 6,
  "src/lib/insightFamilies/evenement.ts": 8,
  "src/lib/kpi/kpiRegistry.ts": 6,
  "src/lib/profile/proposedFollows.ts": 5,
  "src/pages/api/admin/invite.ts": 2,
  "src/pages/api/admin/users.ts": 1,
  "src/pages/api/channels/members.ts": 1,
  "src/pages/api/channels/slack-interact.ts": 1,
  "src/pages/api/commitments/evolution.ts": 3,
  "src/pages/api/commitments/index.ts": 1,
  "src/pages/api/competitive/add-competitor.ts": 6,
  "src/pages/api/competitive/add-event.ts": 1,
  "src/pages/api/competitive/check-competitor.ts": 1,
  "src/pages/api/competitive/competitor-crawl-history.ts": 2,
  "src/pages/api/competitive/competitor-events.ts": 1,
  "src/pages/api/competitive/competitor-profile.ts": 4,
  "src/pages/api/competitive/competitor-signals.ts": 1,
  "src/pages/api/competitive/discover-competitors.ts": 3,
  "src/pages/api/competitive/search-db.ts": 2,
  "src/pages/api/competitive/suivis.ts": 4,
  "src/pages/api/competitive/unfollow-competitor.ts": 1,
  "src/pages/api/competitive/update-competitor-url.ts": 1,
  "src/pages/api/cron/alerts.ts": 6,
  "src/pages/api/cron/bilan.ts": 4,
  "src/pages/api/cron/competitor-alerts.ts": 3,
  "src/pages/api/cron/competitor-surveillance.ts": 8,
  "src/pages/api/cron/daily-briefing.ts": 3,
  "src/pages/api/cron/daily-dispatch.ts": 2,
  "src/pages/api/cron/daily.ts": 3,
  "src/pages/api/cron/digest.ts": 6,
  "src/pages/api/cron/event-occurrences.ts": 5,
  "src/pages/api/cron/snapshot-competitors.ts": 9,
  "src/pages/api/cron/snapshot-homepage.ts": 2,
  "src/pages/api/cron/snapshot-own-locations.ts": 1,
  "src/pages/api/cron/sync-fb-performance.ts": 1,
  "src/pages/api/cron/sync-gbp-performance.ts": 1,
  "src/pages/api/import/locations.ts": 1,
  "src/pages/api/insight/dashboard.ts": 48,
  "src/pages/api/insight/evenement.ts": 3,
  "src/pages/api/insight/explorer-slots.ts": 4,
  "src/pages/api/insight/monitor.ts": 2,
  "src/pages/api/insight/prompt.ts": 1,
  "src/pages/api/profile/locations.ts": 1,
  "src/pages/api/saved-items/snapshot.ts": 2,
  "src/pages/app/insightevent/map.astro": 1,
};

describe("frontière entrepôt : l'app ne lit jamais raw, staging ni intermediate", () => {
  const actual = new Map<string, number>();
  for (const f of walk("src")) {
    const n = countBrutReads(f);
    if (n > 0) actual.set(f, n);
  }

  it("aucun fichier NOUVEAU ne lit raw, staging ou intermediate", () => {
    const nouveaux = [...actual.keys()].filter((f) => !(f in CLIQUET_BRUT)).map((f) => `${f} : ${actual.get(f)}`);
    expect(
      nouveaux,
      `Ces fichiers lisent une couche BRUTE (raw / staging / intermediate). Lisez la vue \`semantic\` ` +
        `(docs/data-model-index.md) — ou \`mart\` sous le cliquet ci-dessus. Si la vue manque, créez-la ` +
        `dans dbt AVANT d'écrire la lecture (owner 10/09 : « It MUST stop »).`,
    ).toEqual([]);
  });

  it("aucun fichier n'augmente ses lectures brutes", () => {
    const regressions = [...actual.entries()]
      .filter(([f, n]) => f in CLIQUET_BRUT && n > CLIQUET_BRUT[f])
      .map(([f, n]) => `${f} : ${CLIQUET_BRUT[f]} -> ${n}`);
    expect(regressions, "Lectures brutes en hausse — lisez semantic.").toEqual([]);
  });

  it("le cliquet brut ne rouille pas (baisses reportées)", () => {
    const baisses = [...Object.entries(CLIQUET_BRUT)]
      .filter(([f, n]) => (actual.get(f) ?? 0) < n)
      .map(([f, n]) => `${f} : ${n} -> ${actual.get(f) ?? 0} (mettez CLIQUET_BRUT à jour)`);
    expect(baisses, "Progrès non enregistré : baissez ces nombres dans CLIQUET_BRUT.").toEqual([]);
  });
});
