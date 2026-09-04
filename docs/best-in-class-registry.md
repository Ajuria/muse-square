# Best-in-class — registre de sources, gate de recommandabilité, doctrine (27/07/2026) — DÉFINITIF

> **Statut : VALIDÉ owner 27/07/2026** (3 décisions successives : registre → « récupération + b » →
> « purge + gate », après un audit déclenché par son retour « the outcome is SHIT »). Objet de ce
> doc : pourquoi la bibliothèque des « références de votre secteur » est construite ainsi.
> Code : `src/lib/bestInClassCrawlCore.mjs` (LE contrat), `bestInClassStore.ts` (lecture),
> `tools/generators/crawl-best-in-class.mjs` (build offline), `api/cron/crawl-best-in-class.ts` (drain).
> Surfaces : insight « Plan à essayer », panneau diagnostic de la page évolution. **PAS le
> formulaire M'engager** — le bloc y a été ajouté puis RETIRÉ le 27/07 (voir la section « Test du
> 27/07 (soir) » : ce store produit des PREUVES, pas des PLANS).

## La doctrine (dans l'ordre où elle s'est construite)

1. **Provenance d'abord — registre de sources par vertical** (`SOURCE_REGISTRY`). Tier 1 =
   institutionnel/fondation/académique/fédération (France Num, Bpifrance, CCI, Wallace Foundation,
   CultureHive/AMA, UNIMEV, Cornell CHR, UMIH, Atout France + motifs `.gouv.fr`/`.gov`/`.edu`),
   cherché en priorité (`site:`). Tier 2 = rapports de données multi-lieux + presse professionnelle
   reconnue (TRG Arts, Spektrix, L'Hôtellerie-Restauration, Vitisphere, LSA, Néorestauration,
   Snacking, B.R.A., Great Wine Capitals…), confiance plafonnée « moyen ». **Hors registre →
   play REJETÉ à `validate`** (blogs de vendeurs SaaS, agences, inconnus). Une cellule vide vaut
   mieux qu'un exemple douteux. Le registre est owner-editable, comme reco-library.
2. **LEÇON CENTRALE (audit owner 27/07) : la source fiable ne suffit pas.** Un cas vrai, sourcé,
   peut rester un conseil risqué (« menu à prix libre »), vague (« pivot numérique 360° »),
   anonymisé au point d'être inutilisable (« opération nationale » sans nom), hypothétique
   (« si 10 % choisissent… »), ou d'échelle non transposable (CRM du Barbican, stade de 70 000
   places). D'où le **gate de recommandabilité** :
   - prompt SYSTEM : ne retenir un cas que si on le **recommanderait de vive voix à un patron
     indépendant** — geste unique, exécutable cette semaine, sans équipe dédiée ; refus des
     expérimentations tarifaires risquées (prix libre, gratuité de masse, remise permanente
     forte), des stratégies fourre-tout, des institutions nationales non transposables, du
     non-conforme RGPD ; outil/opération NOMMÉS ; titre en mots de patron ; un cas = un play ;
   - garde-fous MÉCANIQUES dans `validate` : outcome-méta (« la source ne quantifie pas… ») et
     chiffre hypothétique (« si N %… ») → drop, quoi qu'écrive le modèle ;
   - `dedupePlays` (partagé script + cron) : même source + même industrie dans un run → un play.
3. **Chiffres vendeurs : option (b), décision owner.** Un geste de qualité trouvé chez un
   prestataire (SMS jour creux, empreinte bancaire anti no-show, menu engineering…) est GARDÉ,
   mais son chiffre d'auto-promo est RETIRÉ — outcome qualitatif honnête portant explicitement
   « chiffres du prestataire, non vérifiés indépendamment », `source_tier` 3, confiance faible.
   Jamais un chiffre qu'on ne peut pas défendre.
4. **Tri de lecture** (`getBestInClassPlays`) : `source_tier` d'abord (1 → 2 → 3), puis confiance,
   puis source nommée.
5. **Ce store est une bibliothèque de PREUVES, pas de méthodes** (leçon du test du 27/07 au soir,
   section dédiée plus bas) : un play répond « est-ce que ça marche ailleurs ? », jamais « comment
   je fais ». Ne jamais le rebrancher sur un slot qui demande le how.

## L'audit du 27/07 (36 lignes purgées sur 77)

Motifs de purge, avec exemples réels : risqués (prix libre ×2, places gratuites de masse ×3,
abonnement −35 % permanent) ; fourre-tout/anonymisés (pivot numérique 360°, « opération
nationale » non nommée) ; sans résultat réel (outcome-méta, démonstration arithmétique
hypothétique du Saint-Émilion) ; échelle non transposable (monétisation YouTube à 100 M de vues,
CSO 250 k$, CRASHfest, partage de listes TRG — RGPD) ; ~14 doublons du même cas décliné par
intention (After Hours ×4, familles CJM ×4, peak/off-peak ×3…). Les cellules vidées redeviennent
« manquantes » : le cron les re-crawle SOUS le gate.

## Sauvegardes & état

- `analytics.best_in_class_plays_backup_20260727` = photo PERMANENTE de la table pré-registre
  (45 lignes, ère « blogs vendeurs ») — c'est d'elle que vient la récupération option b.
- État post-purge : **41 plays** (28 du crawl sous registre + 13 récupérés option b, dont 3 cas
  crédibles qui gardent leurs chiffres : carte d'adhésion flexible TNB/L'Œil du Public, formules
  flexibles Spektrix/JCA 85-88 % vs 80 %, multi-activités Philharmonie/DEPS 30 % primo-visiteurs).
- Trous ASSUMÉS (vides honnêtes, le cron retente à chaque TTL 90 j) : commercial×yield,
  culture×conversion/panier, food_nightlife×yield/fidelisation, live_event×frequentation (1 seul),
  wine_tourism×yield/fidelisation ; wine_tourism n'a aucune source tier 1 qui produise.

## Opérations

- Build offline : `INDUSTRIES=… MODE=full|merge CONCURRENCY=8 node tools/generators/crawl-best-in-class.mjs`
  (full = WRITE_TRUNCATE ; merge = supersède les seules cellules recrawlées ; retry 529/429 intégré).
- Cron nightly (demand-drain, ≤3 cellules/run) : mêmes contrat et gate via `bestInClassCrawlCore`.
- Vertical `commercial` : mélange boutique/restauration — les gestes resto y dominent. Scission
  du code industrie = chantier de taxonomie AMONT, non traité ici (noté, à arbitrer owner).

## Test du 27/07 (soir) — le crawl NE PEUT PAS produire des PLANS : bloc M'engager RETIRÉ

Test owner : produire 3 plans exécutables pour `sales_traffic_not_converting` (café), à partir de
sources HOW-TO (et non de case studies). Résultat : 2 plans grounded (Cornell CHR — vente
suggestive +23 % en test contrôlé, + la règle non-évidente « pas d'extras quand des clients
attendent » ; L'Hôtellerie — carte de digestifs), et **le 3e, le plus proche du problème de la
carte, impossible à sourcer** → conseil 101 générique.

Preuves de l'impasse structurelle :
- **Les institutionnels VENDENT le how** : la page CCI « aménagez votre magasin » décrit la
  formation et facture le contenu (400 € la journée, 700 € le diagnostic, 800 € le coaching) ;
  zones chaudes / hauteurs / circulation ne sont pas publiques.
- **France Num est derrière une protection anti-robot** (Imperva) — non contournable, donc pas
  crawlable de façon fiable.
- **L'académique donne des effets mesurés, pas des procédures**, et parfois du contenu
  inutilisable : le compendium Cornell liste « toucher le client » et « se maquiller (pour les
  serveuses) » à côté de la vente suggestive — aucun gate automatique ne rattrape ça sûrement.
- **La presse pro donne des anecdotes**, une par une, sans couverture systématique.

**Décision owner : reverse du bloc « Références de votre secteur » dans MSCommitForm** (v=11).
Le store reste affiché là où une PREUVE est à sa place : panneau « lieux comparables » de la page
évolution + insight « Plan à essayer ». Les 3 méthodes du M'engager = bonnes pratiques du lieu,
puis reco-library.

**Le vrai chantier des méthodes** (décidé le 27/07) : étendre `reco-library` (la bonne forme :
titre · description · pourquoi · steps), en voix owner, **avec des variables remplies par le
pipeline** (créneau, produit, jour, écart en €) — la spécificité vient des données du lieu, pas
d'un cas étranger. Périmètre réel mesuré sur `mart.fct_location_daily_action_candidates` (90 j) :
**24 sous-types vivants**, dont **20 sans plans** (reco-library en couvre 7). Top déclencheurs :
`competition_proximity` (347 tirs / 10 sites), `high_competition_density` (133),
`foreign_tourism_signal` (128), `audience_shift_opportunity` (124), `low_competition_window` (96).
Sur les deux comptes réels : `competition_proximity` (38), puis audience/tourisme, puis les
cartes ventes. Le crawl devient une matière première de rédaction, jamais du texte publié.

## Reste ouvert

- Rédaction reco-library sur les 20 sous-types vivants sans plans (voix owner + variables données).
- Normalisation des codes industrie sales en base (`cultural`, `Culture & Patrimoine`).

## Deux règles de jugement (héritées du prompt de recherche de méthodes, retiré le 26/08)

**Une case vide vaut mieux qu'un conseil douteux.** Ne jamais combler : « rien de recommandable
trouvé » est une réponse complète, pas un échec. Un tableau qu'on remplit pour qu'il soit plein
fabrique exactement les conseils que le gate de recommandabilité existe pour écarter.

**Le test de vive voix.** Le recommanderais-tu, en le regardant dans les yeux, à un patron
indépendant qui te fait confiance ? Si la réponse hésite, la fiche ne sort pas.

**Corollaire de procédure** (né d'un malentendu réel) : chaque fiche porte sa référence et **se juge
SEULE**. Un verdict porte sur la fiche citée, jamais sur son type entier. En cas de message ambigu,
demander avant de retirer — une bonne fiche jetée par malentendu coûte plus cher qu'une question.
