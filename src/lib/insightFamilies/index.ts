// src/lib/insightFamilies/index.ts
// Registry of insight card-family providers — the single dispatch table the three consumers
// share: the deep-page endpoints, the family report, and the grounded prompt Q&A. Each family
// is registered ONCE here; adding a family = one entry + its provider file.
//
// ORDER IS BEHAVIOUR: familyForQuestion returns the FIRST match, so a family registered earlier wins
// the overlap. Read the per-entry notes before reordering — `weather` sits ahead of `footfall` because
// "quand il pleut, je vends moins ?" is a sensitivity question, not a peak-hour one.
//
// Six families live on this pattern (footfall was the vertical slice). Each provider is EXTRACTED from
// its deep-page endpoint, which becomes a thin wrapper — so the card, the report and the chat cannot
// answer the same question differently. SALES is the one hold-out: renderSales(j, isDown, date) needs
// `isDown` from the SIGNAL that fired, and a question-scoped family has no signal — deriving it here
// would invent a second definition of "down". That is an owner decision, not a silent default.
import type { FamilyProvider } from "./types";
import { footfallFamily } from "./footfall";
import { offeringFamily } from "./offering";
import { competitorFamily } from "./competitor";
import { eventsFamily } from "./events";
import { tourismFamily } from "./tourism";
import { weatherFamily } from "./weather";
import { audienceFamily } from "./audience";
import { salesDiscountFamily } from "./salesDiscount";
import { salesDecompFamily } from "./salesDecomp";
import { calendarFamily } from "./calendar";

export const FAMILIES: Record<string, FamilyProvider> = {
  // WEATHER / what the venue's OWN weather actually moves ("la pluie fait-elle baisser mon CA ?").
  // FIRST on purpose: footfall's /(quand…).{0,35}(vend…)/ matcher otherwise swallows "quand il pleut,
  // je vends moins ?" and answers with a peak HOUR — the wrong card for a sensitivity question. Every
  // weather matcher requires an explicit weather word, so it cannot steal a non-weather question back.
  // The day-verdict question ("il va pleuvoir demain, bonne journée ?") stays with the classifier:
  // these matchers require the SENSITIVITY framing (does X move MY business), not a forecast lookup.
  weather: {
    key: "weather",
    title: "Météo · ce qu'elle fait à votre CA",
    render: "renderWeather",
    match: [
      /\b(pluie|chaleur|canicule|froid|neige|vent|meteo)\b.{0,40}(mon |ma |mes |votre )?(ca\b|chiffre|vente|affaire|frequentation|business)/,
      /\b(mon |ma |mes )(ca|chiffre|vente|frequentation)\b.{0,30}\b(pluie|chaleur|canicule|froid|neige|vent|meteo)\b/,
      /\bsensibilite (a la |au |aux )?(meteo|pluie|chaleur|froid)/,
      /\b(impact|effet) (de la |du |des )?(meteo|pluie|chaleur|canicule|froid|neige)\b/,
      /\bquand il (pleut|fait chaud|fait froid|neige)\b/,
    ],
    run: weatherFamily,
  },
  footfall: {
    key: "footfall",
    title: "Fréquentation · votre horloge du CA",
    render: "renderFootfall",
    // Footfall-TIMING questions only ("MY selling rhythm — which hour / which day-of-week"). Matchers
    // run against the ACCENT-STRIPPED, lowercased question (see familyForQuestion) so "A quel moment"
    // (no accent, as typed on a real keyboard) matches too. Each requires a sales/traffic context so
    // event-date-picking "meilleurs jours du mois pour organiser un evenement" does NOT route here.
    match: [
      /affluence/,
      /frequentation/,
      /\bpic\b.{0,25}(vent|vend|\bca\b|chiffre|affluence|client|monde)/,
      /(quand|quelle heure|quel jour|quel moment|a quel moment).{0,35}(vend|vent|gagn|chiffre|\bca\b|affluence|monde|client|frequent)/,
      /(meilleur|pire|plus (fort|calme)|creux|de pointe).{0,15}(heure|creneau)/,   // time-of-day: unambiguous
      /(meilleur|pire).{0,12}jour.{0,25}(semaine|vent|vend|\bca\b|chiffre|rentable|affluence)/,   // best DAY-OF-WEEK for sales
      /jour.{0,10}(de pointe|le plus (fort|calme|rentable))/,   // "jour de pointe" = peak day
    ],
    run: footfallFamily,
  },
  // OFFERING / sales-MIX ("quels produits je vends le plus ?", "mes meilleures ventes"). Registered
  // AFTER footfall so timing questions ("quand ... je vends") match footfall first (first match wins).
  offering: {
    key: "offering",
    title: "Ce que vous vendez · votre mix produit",
    render: "renderOffering",   // deep-page card — built in increment 2.5 step 3; client skips a missing render
    match: [
      /\bquels? (produits?|articles?|references?)\b/,
      /(qu est ce que|ce que|que) je vends?\b/,
      /(qu est ce qui|ce qui) se vend\b/,
      /(meilleure?s? vente|meilleurs? vendeur|best[- ]?seller|produits? phares?|top (produits?|ventes?))/,
      /ventes? par (categorie|produit|article|famille)/,
      /(repartition|mix|assortiment|composition) (des ventes|produit|de vente|de mon)/,
      /\b(ma carte|mon menu|mon assortiment|mon catalogue)\b/,
    ],
    run: offeringFamily,
  },
  // COMPETITOR / the FOLLOWED set, straight from the database ("mes concurrents", "qui je surveille").
  // Provider is EXTRACTED from the deep-page endpoint (api/insight/competitor.ts), which is now a thin
  // wrapper over it — so the 40 % real-competitor bar and the État A/B wording are shared, and the chat
  // can never claim "priorisez X (33 %)" while the card says "aucun concurrent n'a d'impact mesurable".
  // Matchers are deliberately TIGHT: the family router short-circuits the Haiku classifier (prompt.ts
  // ~2390), so a bare /concurrent/ would hijack ENTITY_IMPACT and kill the web_search discovery path
  // for NAMED unknown entities ("l'impact du Café X"). Every matcher here therefore requires the
  // possessive/set framing — my competitors, the ones I follow — never a named entity.
  competitor: {
    key: "competitor",
    title: "Vos concurrents · ce qu'ils font qui vous impacte",
    render: "renderCompetitor",   // MSCardKit.renderCompetitor — the client injects { ok: true }
    match: [
      /\b(mes|nos) concurrents?\b/,
      /\b(ma|notre) concurrence\b/,
      /concurrents? (que je |que l on |)suivis?\b/,
      /\bveille concurrentielle\b/,
      /(qui|lesquels?) (est-ce que |)je (surveille|suis)\b/,
      /(quels?|combien de) concurrents? (je |j ai |)(suis|surveille|follow)/,
    ],
    run: competitorFamily,
  },
  // EVENTS / the nearby landscape ("quels événements près de chez moi", "le paysage événementiel").
  // Registered AFTER competitor so "mes concurrents" keeps its family. Matchers avoid the DATE-PICKING
  // questions that belong to the month window ("quel jour organiser…") — those must stay with the
  // classifier, not be short-circuited to a day-dimension answer.
  events: {
    key: "events",
    title: "Paysage événementiel · ce qui dispute votre public",
    render: "renderEvents",
    match: [
      /\b(paysage|panorama) (evenementiel|des evenements)\b/,
      /\b(quels?|combien d) ?(evenements?|manifestations?)\b.{0,30}(pres|proximite|autour|alentour|ma ville|mon secteur|mon rayon)/,
      /\bevenements? (a cote|pres de chez moi|autour de moi|a proximite)\b/,
      /\b(qui|quoi) (dispute|concurrence).{0,20}(mon |mes |votre )?(public|audience)/,
      /\bcannibalis/,
    ],
    run: eventsFamily,
  },
  // TOURISM / who visits the REGION ("les touristes dans ma région", "d'où viennent les visiteurs").
  // NOT the venue's own visitors — the provider says so, and the matchers stay on the regional framing.
  tourism: {
    key: "tourism",
    title: "Tourisme régional · qui visite votre région",
    render: "renderTourism",
    match: [
      /\btourist(es|ique)?\b/,
      /\b(visiteurs?|clientele) etrangers?\b/,
      /\bd ?ou viennent (les|mes) (visiteurs|touristes)\b/,
      /\bnationalites?\b/,
      /\bnuitees?\b/,
    ],
    run: tourismFamily,
  },
  // AUDIENCE / who the venue's customers are ("qui sont mes clients ?", "mon public").
  // LAST on purpose: `tourism` owns the foreign-visitor framing and `footfall` owns affluence/timing —
  // both would be wrong answers here. These matchers therefore avoid /visiteurs?/ bare, /affluence/
  // and /frequentation/, and require the possessive profile framing (MY customers, MY public).
  audience: {
    key: "audience",
    title: "Votre audience · qui sont vos clients",
    render: "renderAudience",
    match: [
      /\b(qui sont|c est qui|qui est) (mes|nos|ma|notre) (clients?|clientele|public|audience)\b/,
      /\b(mon|notre) (public|audience)\b/,
      /\b(ma|notre) clientele\b/,
      /\bprofil (de (ma|mon|notre) )?(clientele|public|audience)\b/,
      /\bcombien de temps (mes |les |)(clients?|visiteurs?) (restent|reste)\b/,
      /\bzone de chalandise\b/,
    ],
    run: audienceFamily,
  },
  // SALES-DISCOUNT / "mes remises, ça marche ?" — do discount days actually earn more.
  // NOT the blocked `sales` card: needs no isDown from a firing signal, so it is question-scoped.
  // Registered before `offering` would be wrong (it owns "quels produits"), but a remise question
  // contains no product word, so order here is not load-bearing — the vocabularies do not overlap.
  salesdiscount: {
    key: "salesdiscount",
    title: "Vos remises · est-ce qu'elles rapportent",
    render: "renderSalesDiscount",
    match: [
      /\b(mes|les|ma|nos) (remises?|promos?|promotions?|rabais)\b/,
      /\b(remise|promo|promotion|rabais)s?\b.{0,30}(marche|rapporte|paie|paye|efficac|utile|sert|rentab)/,
      /(est-ce que |)(je |on |)(remise|solde) trop\b/,
      /\btaux de remise\b/,
    ],
    run: salesDiscountFamily,
  },
  // SALES-DECOMP / "d'où vient le mouvement : trafic ou panier ?".
  // Also NOT the blocked `sales` card — it reads the direction off revenue_vs_30d_avg_pct itself.
  salesdecomp: {
    key: "salesdecomp",
    title: "Trafic ou panier · d'où vient le mouvement",
    render: "renderSalesDecomp",
    match: [
      /\bpanier moyen\b/,
      /\b(trafic|volume|frequentation) (ou|vs|contre) (le |mon |)panier\b/,
      /\bd ou vient (le |la |ma |mon |cette |)(mouvement|baisse|hausse|chute|progression|variation)\b/,
      /\b(plus de (monde|clients)|moins de (monde|clients)) ou\b/,
      /\b(depense|panier) par client\b/,
    ],
    run: salesDecompFamily,
  },
  // CALENDAR / "les vacances scolaires ou les fériés font-ils bouger mon CA ?".
  // Built from scratch — no deep-page endpoint exists, so chat + report only; `renderCalendar` does not
  // exist yet and the client skips a missing render (the facts carry the answer). Registered near the
  // end: `events` owns the nearby-landscape questions and `tourism` the vacation-VISITOR framing —
  // these matchers stay on the CALENDAR-vs-MY-CA framing, and never bare /vacances/ (which would steal
  // "les touristes en vacances" from tourism).
  calendar: {
    key: "calendar",
    title: "Calendrier · ce que fériés et vacances font à votre CA",
    render: "renderCalendar",
    match: [
      /\b(vacances scolaires?|jours? ferie|feries?)\b.{0,40}(mon |ma |mes |votre )?(ca\b|chiffre|vente|affaire|business|frequentation)/,
      /\b(mon |ma |mes )(ca|chiffre|vente|frequentation)\b.{0,30}\b(vacances scolaires?|jours? ferie|feries?)\b/,
      /\b(impact|effet) (des |du |de la |)(vacances scolaires?|jours? feries?|feries?|calendrier)\b/,
      /\bsensibilite (au |aux )?(calendrier|vacances|feries?)\b/,
      /\b(pendant|durant) les (vacances|feries?)\b.{0,25}(vend|vente|ca\b|chiffre)/,
    ],
    run: calendarFamily,
  },
};

// Accent-strip + lowercase so matchers are robust to "A quel moment" (no accent, as typed) vs "À".
function normQ(s: string): string {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Route a free-text question to the family whose matchers hit (first match wins). null = no family.
export function familyForQuestion(question: string): FamilyProvider | null {
  const q = normQ(question);
  for (const key of Object.keys(FAMILIES)) {
    const fam = FAMILIES[key];
    if (fam.match.some((re) => re.test(q))) return fam;
  }
  return null;
}

export type { FamilyResult, FamilyFact, FamilyProvider } from "./types";
