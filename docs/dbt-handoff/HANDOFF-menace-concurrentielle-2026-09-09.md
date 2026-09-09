# Menace concurrentielle : « forte » exige le même secteur que le site — DÉFINITIF

**APPLIQUÉ le 09/09/2026.** PR `Ajuria/ms_database` #131 fusionnée dans `main` (commit de fusion
2dc198a), puis construction ciblée `dbt run --select int_competitor_threat_profile+` (job
refresh_industry, run 70471896757642, succès en 1 min 55). Les deux tables sont en base.
Ce document n'est plus une consigne à coller : il dit ce qui EST.

## La règle

`threat_level = 'high'` exige `industry_match_tier = 'direct'`, c'est-à-dire le même code secteur
que le site. Un score au-dessus du seuil hors secteur reste `moderate` : le signal n'est pas perdu,
il n'est plus promu.

Fichiers portant la règle :
- `ms_dbt/models/ms_open_data/intermediate/int_competitor_threat_profile.sql` — le `CASE` de
  `threat_level`, avec le commentaire qui porte la mesure.
- `ms_dbt/models/ms_open_data/intermediate/schema.yml` — la description du modèle.

`fct_competitor_threat_profile` (pass-through) n'a rien reçu : aucune colonne ne change.

## Pourquoi

Une épicerie fine (Maison Sèvres) se voyait proposer « Suivez Musée d'Orsay ». Le niveau se
construisait sur le secteur et la distance SEULS dès que le public du concurrent est inconnu, ce
qui est le cas de 187 573 paires sur 188 414. « Menace forte » voulait donc dire « c'est à côté ».

## Mesuré en base après construction

| Lignes | 188 414, inchangé |
| Colonnes | 22, aucune ajoutée ni supprimée |
| Menaces fortes | 7 218 avant, 12 après |
| Sèvres : Halle Odéon et Comptoir Fénelon (suivis, secteur direct) | `high` |
| Sèvres : Orsay, Louvre, Pompidou, Orangerie, Cité des Sciences, Galeries Lafayette | `moderate` |
| Requête des trous de veille (« Suivez X ») pour Sèvres | ne rend plus rien |

## Arbitrage owner du 09/09 sur l'effet de bord

La porte s'applique AUSSI aux concurrents suivis : sept suivis passent de `high` à `moderate`
(cinq chez Poeiti test, deux chez le Domaine de Poulvarel). Verdict owner : ce n'est pas un
problème. Le contenu de Poeiti est fictif, et dans un cas réel un concurrent suivi d'un autre
secteur signifie que l'utilisateur a mal ciblé ses concurrents. **Aucune exemption pour les
suivis** — la question est close.

## Ce que cela ne corrige PAS

- **Le chevauchement de public.** Il compare les étiquettes du site à celles du concurrent, sans
  tenir compte du rang principal ou secondaire, et le vocabulaire tient en six valeurs déclarables
  (local, tourists, mixed, professionals, students, families). Deux commerces parisiens portent
  souvent les mêmes étiquettes : c'est ce qui donne 100 % entre Sèvres et le musée d'Orsay.
- **Le public d'un concurrent peut être hérité de son secteur.** `int_competitor_directory` fait un
  `coalesce` vers le seed `competitor_industry_profile_defaults` quand la fiche n'a pas de public à
  elle. Distinguer une valeur observée d'une valeur héritée demanderait d'exposer la valeur d'avant
  le `coalesce`.
- **Le public manque presque partout.** 21 257 entrées d'annuaire sur 21 288 n'ont aucun public
  renseigné, leur code secteur étant un libellé français que le seed ne rejoint pas.
- **Les doublons d'annuaire.** Le musée d'Orsay existe en deux entrées, l'une en secteur `culture`,
  l'autre en `unknown`. Le test d'unicité n'est toujours pas écrit.

## Note côté application

`src/pages/api/insight/dashboard.ts` filtre déjà `industry_match_tier = 'direct'` sur la requête des
trous (commit du matin du 09/09). Le modèle porte désormais la même garantie, ce filtre est donc
redondant — sans effet, mais c'est une règle écrite à deux endroits.
