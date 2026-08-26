// Preuve de composition des faits « Pas pour moi » (P2, 27/08). 0 clic en base ce jour-là :
// l'E2E réel attendra les premiers gestes — la fixture rejoue la forme exacte des lignes de
// vw_insight_event_card_dispositions (action_type, n_not_done, last_not_done_at). Les
// assertions vérifient : agrégation PAR THÈME (libellés /profile, jamais la clé technique),
// pluriel, date JJ/MM/AAAA, et qu'un action_type sans thème est IGNORÉ plutôt que nommé.
import { describe, it, expect } from "vitest";
import { composeDispositionFacts } from "./buildUserInputFacts";

describe("composeDispositionFacts — « Pas pour moi » par thème", () => {
  it("agrège par thème avec le libellé approuvé de /profile, jamais la clé technique", () => {
    const facts = composeDispositionFacts([
      // deux action_types du MÊME thème meteo (RECO_THEME_ACTION_TYPES) → une seule phrase
      { action_type: "extended_bad_weather", n_not_done: 2, last_not_done_at: "2026-08-20 10:00:00" },
      { action_type: "weather_worsened", n_not_done: 1, last_not_done_at: "2026-08-25 09:00:00" },
    ]);
    expect(facts).toHaveLength(1);
    expect(facts[0].fact_fr).toBe(
      "Vous avez écarté 3 cartes du thème « Météo & alertes » (« Pas pour moi ») — la dernière le 25/08/2026."
    );
    expect(facts[0].fact_fr).not.toContain("extended_bad_weather");
    expect(facts[0].claim_type).toBe("observed");
  });

  it("singulier sans s, et la date la plus récente gagne", () => {
    const facts = composeDispositionFacts([
      { action_type: "mobility_disruption", n_not_done: 1, last_not_done_at: "2026-07-01 08:00:00" },
    ]);
    expect(facts).toHaveLength(1);
    expect(facts[0].fact_fr).toContain("écarté 1 carte du thème « Accès & mobilité »");
    expect(facts[0].fact_fr).toContain("le 01/07/2026");
    expect(facts[0].fact_fr).not.toContain("1 cartes");
  });

  it("un action_type sans thème est ignoré — jamais une clé technique en phrase", () => {
    const facts = composeDispositionFacts([
      { action_type: "type_inconnu_du_registre", n_not_done: 4, last_not_done_at: "2026-08-01 00:00:00" },
    ]);
    expect(facts).toHaveLength(0);
  });

  it("zéro ligne → zéro fait (l'état réel du 27/08)", () => {
    expect(composeDispositionFacts([])).toHaveLength(0);
  });
});
