// Les 5 états d'un dispositif en toutes lettres (axe d'effet séparé de l'axe cible,
// arbitrages owner 27/08). Fixtures = la forme exacte des lignes de
// vw_insight_event_dispositifs. Les cas positive+missed et negative n'existent pas encore
// en base (vérifié 27/08) — la fixture est leur seule preuve jusqu'aux premières données.
import { describe, it, expect } from "vitest";
import { practiceStateFr, autonomousCounterFactFr } from "./buildPracticeFacts";

const base = {
  tier: "declaree" as const,
  effect_direction: null as any,
  effect_residual_pct: null as number | null,
  commitment_verdict: null as string | null,
  replay_threshold_value: null as number | null,
  replay_threshold_basis: null as string | null,
  day_class_key: null as string | null,
};

describe("practiceStateFr — l'état du dispositif en toutes lettres", () => {
  it("prouvé au rejeu, effet chiffré avec son référentiel", () => {
    expect(practiceStateFr({ ...base, tier: "prouvee", effect_direction: "positive", effect_residual_pct: 5.0, commitment_verdict: "met" }))
      .toBe("prouvé au rejeu (+5 % vs votre résultat habituel)");
  });

  it("effet positif mais objectif manqué — la calibration nomme la cible (base pct)", () => {
    expect(practiceStateFr({ ...base, tier: "prouvee", effect_direction: "positive", effect_residual_pct: 8.2, commitment_verdict: "missed", replay_threshold_value: 20, replay_threshold_basis: "pct" }))
      .toBe("effet positif mesuré (+8,2 % vs votre résultat habituel), objectif manqué : votre cible (+20 %) était peut-être surestimée");
  });

  it("effet positif objectif manqué SANS base pct : pas de cible inventée", () => {
    const out = practiceStateFr({ ...base, tier: "prouvee", effect_direction: "positive", effect_residual_pct: 8.2, commitment_verdict: "missed", replay_threshold_value: 1.5, replay_threshold_basis: "residual_z" });
    expect(out).toBe("effet positif mesuré (+8,2 % vs votre résultat habituel), objectif manqué");
    expect(out).not.toContain("1,5");
  });

  it("contre-indication : le signal nommé (noun_fr de l'atelier), l'effet, le compte de tests", () => {
    expect(practiceStateFr({ ...base, effect_direction: "negative", effect_residual_pct: -12.4, commitment_verdict: "missed", day_class_key: "traffic_high" }))
      .toBe("face à vos jours de pointe, il a prouvé ne pas être adapté (-12,4 % vs votre résultat habituel, 1 test manqué)");
  });

  it("contre-indication sans classe : jamais une clé technique, la phrase reste entière", () => {
    const out = practiceStateFr({ ...base, effect_direction: "negative", effect_residual_pct: -9, commitment_verdict: "missed", day_class_key: "classe_inconnue_du_moteur" });
    expect(out).toBe("il a prouvé ne pas être adapté (-9 % vs votre résultat habituel, 1 test manqué)");
    expect(out).not.toContain("classe_inconnue");
  });

  it("testé, non concluant — l'effet dans le bruit ne devient jamais un verdict", () => {
    expect(practiceStateFr({ ...base, effect_direction: "inconclusive", effect_residual_pct: -6.0, commitment_verdict: "missed" }))
      .toBe("testé, non concluant (effet dans le bruit du lieu)");
  });

  it("déclaré, pas encore prouvé — l'état d'origine, inchangé", () => {
    expect(practiceStateFr({ ...base })).toBe("déclaré, pas encore prouvé");
  });
});

describe("autonomousCounterFactFr — la contre-indication autonome", () => {
  it("le cas réel : action ancrée à un événement, effet −23,2 %", () => {
    expect(autonomousCounterFactFr({
      created_date: "2026-08-10", practice_text: "Corner de vente producteur — Le producteur est sur place",
      event_title: "Corner de vente producteur", origin_action_type: "event_autre", effect_residual_pct: -23.2,
    })).toBe(
      "Action testée par vous le 10/08/2026 (événement « Corner de vente producteur ») : « Corner de vente producteur — Le producteur est sur place » — elle a prouvé ne pas être adaptée (-23,2 % vs votre résultat habituel, 1 test manqué)."
    );
  });

  it("signal nommé quand le thème existe (libellés /profile), jamais la clé technique", () => {
    const out = autonomousCounterFactFr({
      created_date: "2026-07-01", practice_text: "Offre parapluie en caisse",
      event_title: null, origin_action_type: "extended_bad_weather", effect_residual_pct: -8,
    });
    expect(out).toContain("face aux signaux « Météo & alertes », elle a prouvé ne pas être adaptée (-8 %");
    expect(out).not.toContain("extended_bad_weather");
  });
});

describe("la clause move — la décision prise face au verdict", () => {
  it("le cas réel : rejeu arrêté (stop) sur un déclaré", () => {
    expect(practiceStateFr({ ...base, replay_adjustment_move: "stop" }))
      .toBe("déclaré, pas encore prouvé — vous aviez choisi d'arrêter ce test");
  });
  it("pivoter après un non concluant", () => {
    expect(practiceStateFr({ ...base, effect_direction: "inconclusive", commitment_verdict: "missed", replay_adjustment_move: "pivoter" }))
      .toBe("testé, non concluant (effet dans le bruit du lieu) — vous aviez choisi de pivoter");
  });
  it("doubler la mise après un prouvé", () => {
    expect(practiceStateFr({ ...base, tier: "prouvee", effect_direction: "positive", effect_residual_pct: 5, commitment_verdict: "met", replay_adjustment_move: "doubler" }))
      .toBe("prouvé au rejeu (+5 % vs votre résultat habituel) — vous aviez choisi de doubler la mise");
  });
  it("valeur inconnue : tue, jamais une clé technique", () => {
    expect(practiceStateFr({ ...base, replay_adjustment_move: "valeur_inconnue" }))
      .toBe("déclaré, pas encore prouvé");
  });
});
