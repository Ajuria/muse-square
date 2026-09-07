# Indice de corrélation & porte de concordance — DÉFINITIF

> Arbitrages owner du 28/08/2026 (fil résolveur/plan). Ce document est la mémoire de ce qui
> est ACTÉ : ce qui est déjà appliqué s'écrit au présent ; ce qui reste à faire est listé en
> fin. La politique de code vit dans `src/lib/kpi/dayClassRegistry.ts` (un seul foyer).

## Les mots (owner, 28/08 — actés)

- **« Indice de corrélation »** — LE libellé. Affichage : palier + chiffre —
  **« Indice de corrélation fort (r = 0,42) »**. Paliers (Cohen) : |r| < 0,3 **faible** ·
  0,3–0,5 **moyen** · ≥ 0,5 **fort**. Le signe s'affiche (il porte la direction). Sous
  n < 5 ou r absent : rien — on ne qualifie pas un lien qu'on n'a pas mesuré.
- **« Facteurs multiples »** — remplace « Mesure mêlée » dans les rendus (base marginale).
- **« Signal à confirmer »** — l'étiquette de la porte de concordance (§ ci-dessous).
- Tranchés le 28/08 (2e passe) : PAS d'étiquette de nature (« pilote structurel » rejeté —
  grandiloquent ; le palier + une phrase simple en infobulle suffisent) ; le € projeté
  s'écrit **« Enjeu : −880 € sur la période »** (préfixe Enjeu + unité de temps toujours) ;
  sur une CARTE l'indice vit TOUJOURS en infobulle du ⓘ (trop petit pour l'inline), et il
  est LISTÉ partout où une section Sources existe.

## La mesure (appliquée)

`analytics.day_class_impacts.corr_r` : **r de point-bisériel** — présence de la classe ×
valeur BRUTE de la métrique, sur TOUS les jours du site, PRÉ-ajustement (identique pour les
deux bases). Calculé au batch (`dayClassAggregateSql`), reconstruit le 28/08 (266 lignes,
6 sites). Les populations de cartes (family `card`) et `discount_no_lift` n'en portent pas :
le tir EST l'appartenance, une corrélation avec soi-même mentirait. Formateur unique :
`corrIndexFr(r, n)` (dayClassRegistry).

## r n'est JAMAIS une porte (modélisé 28/08, parc entier)

25 cartes de motif montrées (portes actuelles : n ≥ 5, span ≥ 60 j, |t| ≥ 1 log,
cohérence signe log/médiane, matérialité ≥ 0,3 % CA). Si r ≥ 0,3 devenait une porte :
**15/25 mourraient (60 %)** — l'essentiel par DILUTION DE RARETÉ (20 j de pluie sur ~300 =
r plafonné bas même avec un vrai effet par jour), pas par absence d'effet. r QUALIFIE la
nature du lien ; les portes existantes décident de l'affichage. Solidité mesurée du parc :
22/25 cartes à |t| ≥ 1,5, 18/25 à |t| ≥ 2.

## La porte de concordance → « Signal à confirmer » (owner go 28/08)

Le trou trouvé par la modélisation : **4/25 cartes en DISCORDANCE de signe** — l'effet
ajusté saison dit une chose, le lien brut (r) dit le contraire (ex. ff2aeb35 pluie :
−154 €/j ajusté MAIS r = +0,07). Pas forcément faux (l'ajustement peut retourner un signe
que la saison masque), mais c'est le profil « signal faible déguisé ».

**La règle** (foyer : `signalAConfirmer(med, corr_r, t)` dans dayClassRegistry) :
signe de l'effet retenu OPPOSÉ au signe de r, avec |r| ≥ 0,05 ET |t| < 3 →
`a_confirmer = true`. La carte **reste lisible** mais **quitte les surfaces qui poussent à
l'action** : « Ce qui pèse sur la période » du plan, le coût projeté, la colonne « À faire »
semaine par semaine, l'atelier dispositif et les propositions de mise en test. L'ⓘ dit la
discordance en clair. Impact modélisé : 4 cartes rétrogradées, 0 supprimée, 0 sur f10c3e58.

**Pourquoi ça suffit (la garantie de fond)** : un motif ne produit jamais une consigne —
il produit une MISE EN TEST (engagement, KPI déclaré, verdict). Un signal faible qui passe
coûte UN test borné et meurt au verdict. Le critère d'entrée réduit les faux départs ; la
boucle d'apprentissage les élimine.

## La présentation suit le régime de mesure (acté 28/08)

- Base **pure** (jours du facteur SANS autre facteur) → monofactoriel assumé :
  « pluie : −220 €/jour ».
- Base **marginale** (plurifactorielle par construction — 21/25 cartes du parc) →
  **l'unité est le jour, pas le facteur** : « vos jours de pluie : −220 €/jour », suivie de
  « Facteurs multiples : vacances scolaires (46 % de ses jours), pic touristique (27 %) ».
  On ne dit plus « la pluie fait » quand la pluie n'a pas été isolée.
- L'indice va sur SA ligne sous chaque motif (jamais entassé dans la phrase de valeur).

## Où l'indice s'affiche (arbitrage owner : partout)

- Réponses du prompt : pied **« Indices de corrélation »** — une ligne PAR relation
  utilisée (« pluie ↔ CA : indice de corrélation faible (r = −0,2) »), en plus des sources.
  APPLIQUÉ : plan + pourquoi du plan.
- ⓘ des cartes (comptes owner ET membres) : APPLIQUÉ 28/08 — coin des cartes contextuelles
  d'Agir (enjeu, 22/22 au payload réel), rangées structurelles d'Agir (pill €/an), cartes
  « Connaissances créées » du Tableau — `corr_index_fr` préformaté SERVEUR (monitor +
  dashboard), le client ne formate jamais.

## Appliqué le 28/08 (2e passe)

- Porte de concordance branchée : rangée structurelle d'Agir (« Signal à confirmer » à la
  place du ±€/an, M'engager non rendu, « Pas pour moi » gardé — prouvé au harnais vm sur
  rangée discordante injectée), cartes Connaissances du Tableau (chip, geste non rendu),
  atelier dispositif (le fait entre dans la liste blanche de l'enquête — documenter un
  dispositif EXISTANT reste ouvert, jamais une proposition de création sur ce motif).
- « Facteurs multiples » propagé : tier_label_fr (UN foyer → tous les rendus), plan,
  infobulle du coin d'Agir.

## Le pourquoi des entités aux 3 étages (appliqué 28/08, 3e passe)

`readEntityWhy` (entityReading) — famille/pôle : 1) « Ce qui compose l'écart » (pôle : les
familles par contribution ; famille : les meilleurs/pires jours, concentration mesurée) ·
2) « Les phénomènes extérieurs » (jours de la période AVEC vs SANS le facteur — arithmétique
de sommes mesurées —, prior HISTORIQUE DU SITE en médiane, indice de corrélation ; tri par
|r|, plafond 3, plancher 3 j de chaque côté) · 3) « Le profil de jour » (week-end vs semaine,
contraste ≥ 15 % exigé) · pied « Indices de corrélation ». Opération/personne gardent la
forme verdicts+funnel. Un étage qui n'isole rien ne s'affiche pas ; l'absence totale se dit.
Constructeur PUR testé (5 cas, mutation tri-|r| vue tomber) ; E2E réel : Coffee juillet
montre des jours de pluie MEILLEURS que les jours sans face à un prior site négatif — les
deux chiffres cohabitent en clair, jamais lissés.

## Reste à faire

(rien — le chantier indice de corrélation est complet ; les évolutions futures s'ajoutent ici)
