> **Statut : CONSOMMÉ le 03/09** — appliqué par l'owner dans dbt Cloud IDE (seeds 10/19, six objets créés 11:08-11:09), commit `16e4f62` sur `Ajuria-branch`, PR #93 fusionnée sur `main`. Vérifié en base (INFORMATION_SCHEMA : staging 80 colonnes, mémoire 57, vue composants 20) et de bout en bout sur deux versions sonde lues dans les vues de production, effacées ensuite. Le texte ci-dessous est conservé intact.
>
> Leçon du jour, désormais dans CLAUDE.md (portail « colle ce bloc », point 6) : les fichiers d'une passation se livrent dans l'ordre du DAG, seeds d'abord — cette passation les avait mis en dernier et la vue a échoué à compiler (`node named 'dispositif_types' which was not found`).

# Handoff dbt Cloud IDE — composants des dispositifs permanents dans la couche semantic (03/09/2026)

Décision owner du 03/09 : la mémoire opérationnelle EST le produit — ce qu'un dispositif est
physiquement (ses composants : linéaire, gondole, tête de gondole, vitrine, point assisté,
médiation) se stocke dans la couche semantic. Sert : `docs/intent.md` § Les objets ;
`docs/dispositifs-typologie-spec.md` § 3 et § 5.5.

**Base vérifiée** : `origin/Ajuria-branch` @ `215b922` — les fichiers touchés sont IDENTIQUES sur
`origin/main` @ `353f6cc` (le job de production tourne sur `main`). dbt **1.10.11**. Tous les
fichiers cibles sont en **LF**. Les numéros de ligne ci-dessous sont ceux de la branche à cette
base ; **l'ancre textuelle fait foi**, pas le numéro.

Il n'y a PAS de copie `.sql`/`.yml` à côté de ce fichier (convention du 26/08 : une copie vieillit,
le modèle dans `ms_database` fait foi). Tout est ICI : quatre fichiers à MODIFIER (ancre + bloc
à insérer), six fichiers à CRÉER (contenu complet). Couches : staging → intermédiaire (la
logique) → mart (fact mince) → semantic (projection) — la vue semantic lit le MART, jamais
l'intermédiaire (même patron que fct_location_dispositifs → vw_insight_event_dispositifs).

---

## A. Quatre fichiers à MODIFIER

### A1. `ms_dbt/models/ms_open_data/staging/stg_client_commitments.sql`

**Insérer juste APRÈS la ligne 71** (ancre exacte) :
```sql
        attached_pole_id,                                      -- rattachement opération→pôle (dispositif_id du pôle)
```
**ces quatre lignes :**
```sql
        -- Complétude 03/09 (spec dispositifs-typologie § 3) : deux colonnes ajoutées à la table
        -- après le lot du 27/08 — le passthrough les avait manquées.
        cast(operation_cost_eur as float64) as operation_cost_eur, -- coût saisi de l'opération (€, 27/08 soir)
        components,                                            -- JSON array [{key,type,role,label}] — composants d'un permanent (03/09)
```
Rien d'autre ne change dans ce fichier (97 → 101 lignes).

### A2. `ms_dbt/models/ms_open_data/semantic/insight_event/vw_insight_event_commitment_memory.sql`

**(a) Remplacer la ligne 7** :
```sql
--           verdict et mesures KPI.
```
**par** :
```sql
--           verdict et mesures KPI, composants du dispositif (JSON, 03/09) et coût saisi.
```
**(b) Insérer juste APRÈS la ligne 66** :
```sql
        attached_pole_id,
```
**ces deux lignes :**
```sql
        components,
        operation_cost_eur,
```
Rien d'autre ne change (108 → 110 lignes).

### A3. `ms_dbt/models/ms_open_data/semantic/insight_event/schema_app_surfaces.yml`

**(a) Dans le bloc `vw_insight_event_commitment_memory`, insérer juste APRÈS les lignes 612-613** :
```yaml
      - name: attached_pole_id
        data_type: STRING
```
**ces quatre lignes :**
```yaml
      - name: components
        data_type: STRING
      - name: operation_cost_eur
        data_type: FLOAT64
```
**(b) Ajouter EN FIN DE FICHIER** (après la dernière ligne `        data_type: TIMESTAMP` du bloc mémoire ; le fichier n'a pas de saut de ligne final — en ajouter un, une ligne vide, puis ce bloc) :
```yaml
  - name: vw_insight_event_dispositif_components
    description: "Composants (linéaire, gondole, tête de gondole, vitrine, point assisté, médiation…) de la VERSION COURANTE des dispositifs permanents, libellés par les seeds dispositif_types/dispositif_roles. Chaîne en VUES. Grain (dispositif_id, component_key)."
    config:
      access: public
      tags: ["mart_dependent"]
      contract:
        enforced: true
    columns:
      - name: location_id
        data_type: STRING
      - name: dispositif_id
        data_type: STRING
      - name: version_no
        data_type: INT64
      - name: commitment_id
        data_type: STRING
      - name: status
        data_type: STRING
      - name: attached_pole_id
        data_type: STRING
      - name: committed_action_text
        data_type: STRING
      - name: owner_person_name
        data_type: STRING
      - name: pole_families
        data_type: STRING
      - name: component_key
        data_type: STRING
      - name: component_order
        data_type: INT64
      - name: component_type
        data_type: STRING
      - name: component_type_label_fr
        data_type: STRING
      - name: component_type_provisoire
        data_type: BOOL
      - name: component_role
        data_type: STRING
      - name: component_role_label_fr
        data_type: STRING
      - name: component_role_provisoire
        data_type: BOOL
      - name: component_label
        data_type: STRING
      - name: created_at
        data_type: TIMESTAMP
      - name: updated_at
        data_type: TIMESTAMP
```
Résultat : 12 → 13 modèles, aucune description existante modifiée (contrôlé par programme).

### A4. `ms_dbt/models/ms_open_data/staging/schema.yml`

**Insérer juste APRÈS le bloc des lignes 652-658** :
```yaml
  - name: int_client_commitment_latest
    description: "Latest snapshot per commitment_id from the append-only log (current state). Dedup only."
    config:
      materialized: view
    columns:
      - name: commitment_id
        tests: [not_null, unique]
```
**ce bloc (une ligne vide avant, une ligne vide après, avant `  - name: fct_client_commitment_outcomes`) :**
```yaml
  - name: int_client_dispositif_components
    description: "Un composant d'une version d'un dispositif PERMANENT — la colonne JSON components dépliée (spec app dispositifs-typologie § 3). Grain (dispositif_id, version_no, component_key)."
    config:
      materialized: view
      tags: ["mart_dependent"]
    tests:
      - dbt_utils.unique_combination_of_columns:
          arguments:
            combination_of_columns: [dispositif_id, version_no, component_key]
    columns:
      - name: dispositif_id
        tests: [not_null]
      - name: version_no
        tests: [not_null]
      - name: component_key
        tests: [not_null]
      - name: component_type
        tests:
          - not_null
          - relationships:
              arguments:
                to: ref('dispositif_types')
                field: type_value

  - name: fct_client_dispositif_components
    description: "Fact MINCE sur int_client_dispositif_components (composants des dispositifs permanents, grain dispositif × version × composant) — matérialisation seule, en VUE pour la fraîcheur de session. Lu par vw_insight_event_dispositif_components."
    config:
      materialized: view
      schema: mart
      tags: ["mart_dependent"]
```
Résultat : 37 → 39 modèles (l'int et son mart), aucune description existante modifiée (contrôlé par programme).

---

## B. Six fichiers à CRÉER (contenu complet, à coller tel quel)

### B1. `ms_dbt/models/ms_open_data/intermediate/int_client_dispositif_components.sql`
```sql
-- models/ms_open_data/intermediate/int_client_dispositif_components.sql
-- Grain   : (dispositif_id, version_no, component_key) — UN composant d'UNE version d'un
--           dispositif PERMANENT (linéaire, gondole, tête de gondole, vitrine, point assisté…).
-- Purpose : LA logique métier des composants (spec app docs/dispositifs-typologie-spec.md § 3,
--           owner 03/09) : la colonne JSON `components` de la table des engagements est
--           dépliée en lignes, une par composant, avec sa version et le drapeau « version
--           courante » (la plus haute version_no du dispositif). Le blob ne descend jamais
--           plus bas : les consommateurs lisent des lignes, jamais du JSON.
-- Contenu : dédup = int_client_commitment_latest (même tiebreak que l'app). Nature permanent
--           seulement — une opération datée n'a pas de composant (components NULL).
--           type/role sont les CLÉS du registre app (src/lib/dispositifTypes.ts) ; les
--           libellés vivent dans les seeds dispositif_types / dispositif_roles, joints par
--           la vue semantic. Aucun libellé ni dérivé ici.
-- Source  : {{ ref('int_client_commitment_latest') }} — chaîne entière en VUES : un composant
--           déclaré dans la session est lisible dans la session.
{{ config(materialized='view', tags=['mart_dependent']) }}

with latest as (

    select *
    from {{ ref('int_client_commitment_latest') }}
    where dispositif_nature = 'permanent'
      and dispositif_id is not null
      and components is not null

),

current_version as (

    select dispositif_id, max(version_no) as current_version_no
    from latest
    group by dispositif_id

),

exploded as (

    select
        l.location_id,
        l.dispositif_id,
        l.version_no,
        l.commitment_id,
        l.status,
        l.attached_pole_id,
        l.committed_action_text,
        l.owner_person_name,
        l.pole_families,
        component_offset                                  as component_order,
        json_value(component, '$.key')                    as component_key,
        json_value(component, '$.type')                   as component_type,
        json_value(component, '$.role')                   as component_role,
        json_value(component, '$.label')                  as component_label,
        l.created_at,
        l.updated_at
    from latest l,
        unnest(json_query_array(l.components)) as component with offset as component_offset

)

select
    e.*,
    (e.version_no = cv.current_version_no) as is_current_version
from exploded e
join current_version cv using (dispositif_id)
```

### B2. `ms_dbt/models/ms_open_data/mart/fct_client_dispositif_components.sql`
```sql
-- models/ms_open_data/mart/fct_client_dispositif_components.sql

/*
  MODEL
    fct_client_dispositif_components

  PURPOSE
    Les composants des dispositifs permanents de l'exploitant (linéaire, gondole, tête de
    gondole, vitrine, point assisté, dispositif de médiation…) au grain composant × version
    (spec app docs/dispositifs-typologie-spec.md § 3, owner 03/09). Chantier « entrées
    utilisateur -> semantic » : la couche semantic lit un mart, jamais un intermédiaire.

    THIN fact : TOUTE la logique (dépliage de la colonne JSON `components`, nature permanent,
    dédup canonique, drapeau version courante) vit dans int_client_dispositif_components —
    lire son en-tête. Ici : matérialisation seule, aucune transformation.

  AUTHORITATIVE SOURCES (truth)
    - {{ ref('int_client_dispositif_components') }}   -- dispositif_id x version_no x component_key

  OUTPUT GRAIN
    dispositif_id x version_no x component_key

  MATERIALIZATION
    VUE (même règle que fct_location_dispositifs, 27/08) : un composant déclaré en session doit
    être lisible par Explorer DANS la session. Volume minuscule : la lecture live ne coûte rien.
*/

{{ config(
    materialized = 'view',
    schema = 'mart',
    tags = ['mart_dependent'],
) }}

select * from {{ ref('int_client_dispositif_components') }}
```

### B3. `ms_dbt/models/ms_open_data/semantic/insight_event/vw_insight_event_dispositif_components.sql`
```sql
-- vw_insight_event_dispositif_components
-- Grain   : (dispositif_id, component_key) — UN composant de la VERSION COURANTE d'un dispositif
--           permanent, avec ses libellés.
-- Purpose : la surface de LECTURE de l'app et du résolveur Explorer pour les composants
--           (spec app docs/dispositifs-typologie-spec.md § 3 et § 5.5, owner 03/09) : ce qu'un
--           pôle contient physiquement — linéaire, gondole, tête de gondole, vitrine, point
--           assisté, dispositif de médiation — nommé et libellé. La photo d'un composant se
--           rattachera à (dispositif_id, version_no, component_key) : cette vue est la clé.
-- Contenu : projection FIDÈLE de fct_client_dispositif_components filtrée à la version
--           courante, jointe aux seeds de libellés (dispositif_types, dispositif_roles —
--           générés depuis le registre app, jamais édités à la main). `provisoire` = libellé
--           sans mot owner : un consommateur qui affiche ne rend PAS un libellé provisoire.
-- Source  : {{ ref('fct_client_dispositif_components') }}, fact mince sur
--           int_client_dispositif_components (la logique est documentée dans l'en-tête de
--           l'int) — chaîne stg -> int -> fct -> vue, entière en VUES.

{{ config(materialized='view') }}

with components as (

    select *
    from {{ ref('fct_client_dispositif_components') }}
    where is_current_version

),

types as (

    select type_value, label_fr, provisoire
    from {{ ref('dispositif_types') }}

),

roles as (

    select type_value, role_value, label_fr, provisoire
    from {{ ref('dispositif_roles') }}

),

final as (

    select
        c.location_id,
        c.dispositif_id,
        c.version_no,
        c.commitment_id,
        c.status,
        c.attached_pole_id,
        c.committed_action_text,
        c.owner_person_name,
        c.pole_families,
        c.component_key,
        c.component_order,
        c.component_type,
        t.label_fr    as component_type_label_fr,
        t.provisoire  as component_type_provisoire,
        c.component_role,
        r.label_fr    as component_role_label_fr,
        r.provisoire  as component_role_provisoire,
        c.component_label,
        c.created_at,
        c.updated_at
    from components c
    left join types t
        on t.type_value = c.component_type
    left join roles r
        on r.type_value = c.component_type
       and r.role_value = c.component_role

)

select * from final
```

### B4. `ms_dbt/seeds/open_data/dispositifs/dispositif_types.csv`
GÉNÉRÉ depuis `src/lib/dispositifTypes.ts` (app) — ne jamais éditer à la main.
```csv
type_value,label_fr,provisoire
vitrine,"Vitrine",false
lineaire,"Linéaire",false
gondole,"Gondole",false
tete_de_gondole,"Tête de gondole",false
table_ilot,"Table ou îlot",true
point_assiste,"Point service / vente avec une personne",false
caisse,"Caisse",true
espace_experience,"Espace dégustation / atelier",true
mediation,"Dispositif de médiation",false
autre,"Autre",false
```

### B5. `ms_dbt/seeds/open_data/dispositifs/dispositif_roles.csv`
GÉNÉRÉ depuis `src/lib/dispositifTypes.ts` (app) — ne jamais éditer à la main.
```csv
type_value,role_value,label_fr,provisoire
lineaire,courant,"Produits courants",true
lineaire,expert,"Produits d'expert",true
lineaire,impulsion,"Achats d'impulsion",true
lineaire,promo,"Offre temporaire",true
gondole,courant,"Produits courants",true
gondole,expert,"Produits d'expert",true
gondole,impulsion,"Achats d'impulsion",true
gondole,promo,"Offre temporaire",true
tete_de_gondole,courant,"Produits courants",true
tete_de_gondole,expert,"Produits d'expert",true
tete_de_gondole,impulsion,"Achats d'impulsion",true
tete_de_gondole,promo,"Offre temporaire",true
point_assiste,comptoir_service,"La personne sert le produit",true
point_assiste,point_conseil,"La personne conseille, le produit est ailleurs",true
point_assiste,billetterie_accueil,"Accueil / billetterie",true
mediation,cartel,"Cartel",false
mediation,panneau_de_salle,"Panneau de salle",true
mediation,multimedia,"Dispositif multimédia",false
mediation,signaletique,"Signalétique",true
```

### B6. `ms_dbt/seeds/open_data/dispositifs/schema.yml`
```yaml
version: 2

# Registre des types et rôles de COMPOSANT d'un dispositif permanent — GÉNÉRÉ depuis le
# registre app src/lib/dispositifTypes.ts (script gen-seed, 03/09). Ne jamais éditer à la
# main : la loi est le fichier TypeScript ; ce seed en est la copie pour la couche semantic.
# `provisoire` = libellé sans mot owner arbitré (docs/lexique.md) — ne se rend pas à l'écran.

seeds:
  - name: dispositif_types
    description: "Types de composant (objet physique) — clé type_value = valeur du registre app, jamais renommée."
    config:
      column_types:
        type_value: string
        label_fr: string
        provisoire: bool
    columns:
      - name: type_value
        tests: [not_null, unique]
      - name: label_fr
        tests: [not_null]

  - name: dispositif_roles
    description: "Rôles par type (ce que le composant contient, comment le client le choisit) — (type_value, role_value) = valeurs du registre app."
    config:
      column_types:
        type_value: string
        role_value: string
        label_fr: string
        provisoire: bool
    tests:
      - dbt_utils.unique_combination_of_columns:
          arguments:
            combination_of_columns: [type_value, role_value]
    columns:
      - name: type_value
        tests:
          - not_null
          - relationships:
              arguments:
                to: ref('dispositif_types')
                field: type_value
      - name: role_value
        tests: [not_null]
```

Le dossier `seeds/open_data/…` hérite déjà de `+database muse-square-open-data`, `+schema open_data`
(config par chemin dans `dbt_project.yml`) : **rien à ajouter à `dbt_project.yml`**.

---

## C. Les commandes dans l'IDE, dans cet ordre

1. Charger les seeds — attendu 10 et 19 lignes :
```bash
dbt seed --select dispositif_types dispositif_roles
```
2. Recréer la chaîne — `int_client_commitment_latest` fait `select *` et BigQuery fige les colonnes d'une vue à sa création, il faut la recréer :
```bash
dbt run --select stg_client_commitments int_client_commitment_latest int_client_dispositif_components fct_client_dispositif_components vw_insight_event_commitment_memory vw_insight_event_dispositif_components
```
3. Tester :
```bash
dbt test --select stg_client_commitments int_client_dispositif_components fct_client_dispositif_components vw_insight_event_commitment_memory vw_insight_event_dispositif_components dispositif_types dispositif_roles
```
   Attendu aujourd'hui : la vue composants rend **0 ligne** (aucun dispositif permanent en base au 03/09 — les pôles d'Épices et Tout ne sont pas encore déclarés) ; les tests passent sur vide. Le premier pôle créé avec des composants dans l'app apparaît dans la vue **dans la session**, sans run.
4. Commit sur `Ajuria-branch` (message en § E), PR vers `main` comme le #92. Le job « daily mart dependent » (`dbt run --select tag:mart_dependent`) recrée ensuite les vues chaque matin ; les seeds ne se rechargent qu'à la main quand le registre app change.

Les marts `fct_client_commitment_outcomes` et `fct_location_commitment_learning` sont des **tables** (`materialized='table'`, vérifié), pas des incrémentaux : rien à faire pour eux.

---

## D. Preuves (03/09, avant passation)

- Chaque modification a été REJOUÉE par programme sur les fichiers de `origin/Ajuria-branch` et le résultat relu : staging +4 lignes ; mémoire +1 ligne d'en-tête, +2 de projection ; `schema_app_surfaces.yml` +4 lignes dans le bloc mémoire + 50 en fin (13 modèles, 0 description modifiée) ; `staging/schema.yml` +32 lignes (39 modèles : l'int et son mart, 0 description modifiée). Les trois yml parsent.
- **SQL compilé à la main et exécuté en BigQuery** (refs → sous-requêtes, seeds inlinés, chaîne stg → int → fct → vue) : dry-run OK sur l'int, le mart, la vue composants, la vue mémoire. Puis sur DEUX versions sonde écrites par la librairie de l'app sur `f10c3e58` (V1 : 2 composants ; V2 : 3 composants, coût 42,5 €) : l'int rend 5 lignes, `is_current_version` faux sur V1 et vrai sur V2 ; la vue composants rend les 3 lignes de V2 libellées « Linéaire », « Vitrine », « Tête de gondole » avec `provisoire` vrai sur les rôles ; la vue mémoire rend les 2 versions, `components` non nul, `operation_cost_eur` 42,5 sur V2. Sondes effacées, 0 restante.

---

## E. Message de commit (dépôt `ms_database`, branche `Ajuria-branch`)

```
feat(dispositifs): composants des dispositifs permanents dans la couche semantic

Décision owner 03/09 : la mémoire opérationnelle stocke ce qu'un dispositif est physiquement.

· stg_client_commitments : +operation_cost_eur, +components (les 2 colonnes manquantes au
  passthrough depuis le 27/08 — la table en a 80).
· int_client_dispositif_components (NOUVEAU, vue, tag mart_dependent) : la colonne JSON
  components dépliée — grain (dispositif_id, version_no, component_key), nature permanent,
  is_current_version = plus haute version du dispositif.
· fct_client_dispositif_components (NOUVEAU, fact MINCE en vue, tag mart_dependent) : la
  matérialisation du mart, aucune logique — la couche semantic lit un mart.
· vw_insight_event_dispositif_components (NOUVEAU, vue, contrat enforced) : lit le mart,
  version courante, libellés et drapeau provisoire joints depuis les seeds.
· vw_insight_event_commitment_memory : +components, +operation_cost_eur (contrat 57 colonnes).
· seeds dispositif_types (10) / dispositif_roles (19) : copie générée du registre app
  src/lib/dispositifTypes.ts — jamais éditée à la main.
· Tests : grain unique, not_null, relationships type→seed, rôle→type.

Preuves app 03/09 : SQL compilé (stg → int → fct → vue) exécuté en BigQuery sur 2 versions sonde (5 lignes int,
3 lignes vue courante, mémoire avec coût et composants), sondes effacées.
```
