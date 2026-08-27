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
const CLIQUET: Record<string, number> = {
  "src/lib/ai/facts/buildDayPerformanceFacts.ts": 2,
  "src/lib/ai/find_dates/find-dates.ts": 2,
  "src/lib/commitmentContext.ts": 4,
  "src/lib/commitmentResolve.ts": 1,
  "src/lib/dayClassRegistry.ts": 10,
  "src/lib/dayContext.ts": 19,
  "src/lib/insightFamilies/calendar.ts": 1,
  "src/lib/insightFamilies/channels.ts": 8,
  "src/lib/insightFamilies/competitor.ts": 3,
  "src/lib/insightFamilies/dispositif.ts": 6,
  "src/lib/insightFamilies/evenement.ts": 3,
  "src/lib/insightFamilies/events.ts": 4,
  "src/lib/insightFamilies/footfall.ts": 1,
  "src/lib/insightFamilies/offering.ts": 1,
  "src/lib/insightFamilies/sales.ts": 3,
  "src/lib/insightFamilies/salesDecomp.ts": 1,
  "src/lib/insightFamilies/salesDiscount.ts": 1,
  "src/lib/insightFamilies/tourism.ts": 2,
  "src/lib/insightFamilies/weather.ts": 3,
  "src/lib/kpiRegistry.ts": 1,
  "src/lib/proposedFollows.ts": 2,
  "src/lib/trackRecordCore.ts": 1,
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
  // « fenêtre 30 j » y compte 68 jours (mesuré 24/08). dbt gelé — pas de vue corrigée possible.
  "src/pages/api/insight/dashboard.ts": 16,
  "src/pages/api/insight/monitor.ts": 1,
  // 1 → 2 (27/08, fusion K9 marges) : la réponse marge PAR FAMILLE lit fct_client_offering_daily
  // borné à CURRENT_DATE() — même justification que dashboard.ts ci-dessus (vue semantic non
  // bornée en haut + graine à dates futures ; dbt gelé).
  "src/pages/api/insight/prompt.ts": 2,
  "src/pages/api/insight/reactions-today.ts": 3,
  "src/pages/api/insight/sales-report.ts": 9,
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
