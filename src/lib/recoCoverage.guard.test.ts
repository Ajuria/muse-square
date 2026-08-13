// GARDE-FOU — couverture de la bibliothèque de méthodes (« Mon action »).
//
// Ce que ce test protège, et pourquoi il existe (31/07/2026).
// docs/features/commitments.md §5 pose un INVARIANT : « every COMMITMENT_ORIGIN_ACTION_TYPES
// entry MUST have a reco-library entry ». Le 26/07, l'allowlist des engagements a été complétée
// au registre SPECS entier — la bibliothèque n'a pas suivi, et personne ne l'a vu pendant cinq
// jours : « Mon action » s'ouvrait vide sur 76 types sur 83. Rien ne cassait, rien n'alertait.
//
// UN TEST ROUGE DÈS SA NAISSANCE EST UN TEST QU'ON IGNORE. Celui-ci est donc un CLIQUET, pas un
// idéal : la dette existante est listée nommément ci-dessous, et le test échoue quand
//   · un type ENTRE dans l'allowlist sans plans           -> la dette augmenterait
//   · un type de la dette EN SORT sans être retiré de la liste -> la liste mentirait
//   · un type couvert PERD ses plans                       -> régression silencieuse
//   · le câblage cesse de DÉRIVER des clés de la bibliothèque -> on retomberait à deux gestes
//
// QUAND VOUS ÉCRIVEZ DES PLANS : décommentez l'entrée dans public/reco-library.js, puis RETIREZ
// le type de DETTE_SANS_PLANS ci-dessous. Le test vous y forcera.
//
// Il ne juge PAS le contenu — la voix owner et la barre de qualité ne se testent pas.
// Il ne touche PAS BigQuery : le classement par fréquence de tir vit dans l'échafaudage.

import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { COMMITMENT_ORIGIN_ACTION_TYPES } from "./commitmentOrigins";

// Les deux fichiers de /public sont des globals navigateur : on les exécute pour de vrai, dans
// l'ORDRE DE CHARGEMENT des pages (reco-library.js AVANT action-cards.js). Lire le texte à la
// regex dirait ce qui est écrit, pas ce qui est câblé — et c'est le câblage qui a lâché.
function loadClient(): { ACTION_CARDS: Record<string, any>; MS_SALES_RECO_LIB: Record<string, any>; planText: (p: any) => string } {
  const sb: any = {
    console, setTimeout, clearTimeout, JSON, Math, Date, String, Number, Array, Object,
    RegExp, Boolean, Error, isNaN, parseInt, parseFloat, encodeURIComponent, decodeURIComponent,
    fetch: () => Promise.resolve({ ok: false, json: () => Promise.resolve({}) }),
  };
  sb.window = sb; sb.globalThis = sb;
  sb.document = {
    addEventListener() {}, removeEventListener() {},
    querySelectorAll() { return []; }, querySelector() { return null; }, getElementById() { return null; },
    createElement() { return { style: {}, setAttribute() {}, appendChild() {}, addEventListener() {}, querySelectorAll() { return []; } }; },
    body: { appendChild() {} },
  };
  vm.createContext(sb);
  for (const f of ["public/reco-library.js", "public/action-cards.js"]) {
    vm.runInContext(readFileSync(resolve(f), "utf8"), sb, { filename: f });
  }
  return { ACTION_CARDS: sb.window.ACTION_CARDS || {}, MS_SALES_RECO_LIB: sb.window.MS_SALES_RECO_LIB || {}, planText: sb.window.MS_planText };
}

const hasRecos = (AC: Record<string, any>, t: string) => typeof AC[t]?.recos === "function";

// Les types couverts (7 au 31/07, +weekend_vacation_low_comp le 01/08, +client_dormant le
// 06/08 — C1, +weekly_sales_hole/spike le 07/08 — C2 ; chacun arrivé AVEC ses plans comme
// le cliquet l'exige). Ne doit que GRANDIR.
const COUVERTS_ACQUIS = [
  "client_dormant",
  "footfall_vs_basket_decomposition",
  "monthly_sales_hole",
  "monthly_sales_spike",
  "weekly_sales_hole",
  "weekly_sales_spike",
  "low_competition_window",
  "sales_competition_cannibalization",
  "sales_discount_no_lift",
  "sales_revenue_down_wow",
  "sales_surge",
  "sales_traffic_not_converting",
  "weekend_vacation_low_comp",
];

// LA DETTE, nommée. 76 types de l'allowlist sans plans au 31/07 — dont 27 tirent réellement
// (mesuré sur 90 j ; l'échafaudage de public/reco-library.js les classe par fréquence).
// Cette liste ne doit que RÉTRÉCIR.
const DETTE_SANS_PLANS = [
  "audience_shift_opportunity",
  "best_day_of_week",
  "calendar_audience_shift",
  "commercial_event_match",
  "competition_pressure_spike",
  "competition_proximity",
  "competitor_audience_conflict",
  "competitor_content_silent",
  "competitor_content_spike",
  "competitor_event_ending",
  "competitor_event_launch",
  "competitor_hours_change",
  "competitor_new_offering",
  "competitor_offering_removed",
  "competitor_positioning_brief",
  "competitor_positioning_gap",
  "competitor_price_drop",
  "competitor_price_increase",
  "competitor_repricing_event",
  "competitor_reputation_strength",
  "competitor_review_drop",
  "competitor_review_surge",
  "competitor_sold_out",
  "competitor_threat_direct",
  "day_opportunity",
  "extended_bad_weather",
  "extended_bad_weather_3d",
  "foreign_tourism_signal",
  "ft_peak_bad_weather",
  "ft_peak_low_comp",
  "ft_peak_mobility",
  "ft_peak_saturated",
  "ft_peak_tourism_vacation",
  "ft_quiet_good_weather",
  "high_competition_density",
  "holiday_high_comp",
  "institution_campaign_detected",
  "low_tourism_local_opp",
  "medal_change",
  "media_mention_detected",
  "mega_event_activation",
  "mega_event_end",
  "mobility_comp_squeeze",
  "mobility_disruption",
  "mobility_disruption_planned",
  "mobility_disruption_resolved",
  "offering_mix_shift",
  "perfect_storm",
  "proven_action_replication",
  "regime_c_warning",
  "regime_change",
  "review_solicitation",
  "sales_missed_opportunity",
  "sales_underperformance",
  "same_bucket_saturation",
  "saturated_bad_weather",
  "score_down",
  "score_driver_shift",
  "score_up",
  "top_day_approaching",
  "tourism_comp_squeeze",
  "tourism_mobility_hit",
  "tourism_peak_window",
  "tourism_weather_vacation",
  "tourist_high_season",
  "tourist_surge_vacation",
  "weather_comp_opportunity",
  "weather_hazard_onset",
  "weather_improved",
  "weather_mobility_double",
  "weather_window",
  "weather_window_after_bad",
  "weather_worsened",
  "weekend_opportunity",
  "weekly_briefing",
];

test("chat_decision_* sont les SEULS types de l'allowlist absents du registre SPECS", () => {
  // Ils sont question-scopés : aucune carte ne tire derrière eux, donc aucun spec.recos n'est
  // possible. C'est ce qui justifie de les exclure du cliquet — vérifié, pas supposé. Si un
  // type NON-chat venait à manquer de SPECS, l'exclusion ci-dessous deviendrait un trou.
  const { ACTION_CARDS } = loadClient();
  const absents = [...COMMITMENT_ORIGIN_ACTION_TYPES].filter((t) => !ACTION_CARDS[t]).sort();
  // 06/08 (constaté 07/08, rouge depuis le P2 96fc52f) : onboarding_first_test est un origin
  // de GESTE (aline du tableau « Engagez votre premier test mesuré »), pas une carte — aucun
  // SPECS possible, même nature que chat_decision_*. Exclusion vérifiée, pas supposée.
  const GESTE_ORIGINS = new Set(["onboarding_first_test"]);
  expect(absents.every((t) => t.startsWith("chat_decision_") || GESTE_ORIGINS.has(t))).toBe(true);
});

test("le câblage DÉRIVE des clés de la bibliothèque — une entrée suffit, sans second geste", () => {
  // Le vrai blocage du 31/07 : action-cards.js n'attachait spec.recos qu'aux 7 types d'un
  // tableau en dur. Ajouter une entrée ici ne suffisait pas, il fallait modifier là-bas aussi.
  const { ACTION_CARDS, MS_SALES_RECO_LIB } = loadClient();
  const orphelines = Object.keys(MS_SALES_RECO_LIB)
    .filter((t) => !!ACTION_CARDS[t])
    .filter((t) => !hasRecos(ACTION_CARDS, t));
  expect(orphelines).toEqual([]);
});

test("aucune couverture perdue", () => {
  const { ACTION_CARDS } = loadClient();
  const perdus = COUVERTS_ACQUIS.filter((t) => !hasRecos(ACTION_CARDS, t));
  expect(perdus).toEqual([]);
});

test("aucune dette NOUVELLE : un type entrant dans l'allowlist doit arriver avec ses plans", () => {
  const { ACTION_CARDS } = loadClient();
  const connus = new Set(DETTE_SANS_PLANS);
  const nouveaux = [...COMMITMENT_ORIGIN_ACTION_TYPES]
    .filter((t) => !!ACTION_CARDS[t])
    .filter((t) => !hasRecos(ACTION_CARDS, t))
    .filter((t) => !connus.has(t))
    .sort();
  // Si ceci casse : soit vous ajoutez l'entrée dans public/reco-library.js (l'échafaudage en fin
  // de fichier donne la forme et les variables du payload), soit le type n'a rien à faire dans
  // COMMITMENT_ORIGIN_ACTION_TYPES. Ne l'ajoutez pas à DETTE_SANS_PLANS : cette liste est un
  // constat daté du 31/07, pas une porte de sortie.
  expect(nouveaux).toEqual([]);
});

test("la liste de dette ne ment pas : un type qui a reçu ses plans doit en sortir", () => {
  const { ACTION_CARDS } = loadClient();
  const aRetirer = DETTE_SANS_PLANS.filter((t) => hasRecos(ACTION_CARDS, t)).sort();
  expect(aRetirer).toEqual([]);
});

test("chaque type couvert rend au moins un plan exploitable", () => {
  // « up to 3 driver-matched recommended actions » (docs/features/commitments.md §5). Le PLAFOND
  // de 3 est déjà imposé par _recosFor (arr.slice(0, 3)) — l'asserter sur la SORTIE testerait le
  // slice, jamais le contenu. On teste donc ce qui peut réellement casser : au moins un plan, et
  // un texte non vide — un titre vide remplirait « Mon action » avec du blanc.
  const { ACTION_CARDS, planText } = loadClient();
  const defauts: string[] = [];
  for (const t of COUVERTS_ACQUIS) {
    const plans = ACTION_CARDS[t].recos({ change_subtype: t, action_type: t }) || [];
    if (!Array.isArray(plans) || plans.length < 1) {
      defauts.push(t + " rend " + (Array.isArray(plans) ? plans.length : "?") + " plans");
      continue;
    }
    plans.forEach((p: any, i: number) => {
      if (!planText(p)) defauts.push(t + " plan " + (i + 1) + " : texte vide");
    });
  }
  expect(defauts).toEqual([]);
});

test("aucun plan écrit ne sera silencieusement jeté par le plafond de 3", () => {
  // _recosFor tronque à 3. Un 4e plan écrit dans la bibliothèque n'apparaîtrait JAMAIS et rien
  // ne le dirait à celui qui vient de l'écrire — le seul endroit où ça se voit est la source.
  const { MS_SALES_RECO_LIB } = loadClient();
  const trop: string[] = [];
  const scan = (lib: Record<string, any>, ou: string) => {
    for (const t of Object.keys(lib)) {
      const entree = lib[t];
      if (!entree || typeof entree !== "object") continue;
      for (const cle of Object.keys(entree)) {
        const arr = entree[cle];
        if (Array.isArray(arr) && arr.length > 3) trop.push(ou + t + "." + cle + " : " + arr.length + " plans, les " + (arr.length - 3) + " derniers seront jetés");
      }
    }
  };
  scan(MS_SALES_RECO_LIB, "");
  expect(trop).toEqual([]);
});
