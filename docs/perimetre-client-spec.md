# Périmètre de clientèle — spec (30/07/2026)

> **Déclencheur owner** : « They are located in a small village → 500m radius logic doesn't apply →
> Most customers drive there from other villages or nearby cities. Your logic is wrong and regional
> data is actually relevant. Before we jump into short 101 conclusions, let's find out how we deal
> with businesses that are not located in densely populated areas. »
>
> Il avait raison : j'avais appliqué une logique urbaine à un commerce rural et proposé de démettre
> une carte qui était en fait mal paramétrée.

## Le problème, mesuré

`fct_location_events_radius_daily` porte cinq rayons (500 m, 1 km, 5 km, 10 km, 50 km). **Tout le
produit n'en lit que deux**, codés en dur :

| endroit | rayon codé en dur | occurrences |
|---|---|---|
| `fct_location_daily_action_candidates.sql` | `events_within_5km_count` | 36 |
| idem | `pct_same_bucket_5km` | 11 |
| idem | `events_within_500m_count` | 5 |
| idem | `events_within_1km_count` | 2 |
| `dayClassRegistry.ts` ligne 97 | `events_within_500m_count` (classe `events_high`) | 1 |

Sur **Les Olivades** (Saint-Étienne-du-Grès, 1 100 habitants), 25 jours de données :

| rayon | moyenne d'événements | valeurs distinctes |
|---|---|---|
| 500 m | **0** | **1 — constante** |
| 5 km | **0** | **1 — constante** |
| 10 km | 2,6 | 4 |
| **50 km** | **81,8** | **22** |

La classe `events_high` ne peut donc pas exister chez eux, et la carte « Tourisme élevé mais
concurrence forte » leur parle d'un voisinage vide. **Ce n'est pas le signal qui est mauvais, c'est
le rayon.**

## Ce qui NE peut PAS servir de critère — vérifié

### `location_access_pattern` : deux vocabulaires dans une colonne

| provenance de la ligne | valeurs | lieux |
|---|---|---|
| `seed` (jeu de démonstration) | `destination_catchment`, `local_catchment` | **14** |
| `website` (vrais clients) | `public_transit`, `car`, `walking` | **18** |

Le formulaire de profil n'offre que **quatre modes de transport** (transports en commun, à pied,
voiture, vélo). **Aucun vrai client ne peut choisir une valeur « bassin »** — elles ne viennent que
du seed. Et un mode de transport n'est pas une taille de bassin : on vient en voiture dans une zone
commerciale de périphérie comme dans un village isolé.

Le champ garde par ailleurs trois usages légitimes (proximité transport, mobilité, pondération
tourisme `destination_catchment`) : **ne pas le réutiliser, ne pas le redéfinir**.

### `origin_city_label_1/2/3` : des noms sans poids

Ces champs existent et nomment des villes d'origine. Ils ne portent **aucune pondération** : savoir
que des clients viennent de Versailles ne dit ni combien ni quel impact. Inutilisable pour choisir
un rayon. (Constat owner, 30/07.)

### Le choix AUTOMATIQUE du rayon : instable — mesuré

Idée testée : retenir le plus petit rayon non dégénéré (≥ 10 valeurs distinctes), lieu par lieu.
Test de stabilité sur deux moitiés de la fenêtre de 120 jours :

- **21 lieux sur 30 gardent le même rayon** ;
- **9 basculent**, dont **7 d'un coup et dans le même sens**, tous autour de Nîmes (5 km → 50 km).

Sept bascules simultanées ne sont pas du bruit statistique : c'est la **couverture de notre
ingestion d'événements qui a changé** entre les deux périodes. Un critère automatique mesurerait
donc autant la complétude de notre base que la réalité du lieu — et l'enjeu apparaîtrait puis
disparaîtrait sans que l'exploitant ait rien fait.

**Décision : le critère est DÉCLARATIF. Aucun repli automatique, jamais.**

## La question

Une seule, binaire, posée en langage d'exploitant :

> **La plupart de vos clients viennent-ils de votre commune, ou de plus loin ?**
> ○ De ma commune ○ De plus loin, ils se déplacent

« Commune » plutôt que « village » ou « ville » : c'est administrativement précis, tout exploitant
connaît la sienne, et le mot fonctionne du 3ᵉ arrondissement à Saint-Étienne-du-Grès.

**Deux réponses suffisent — vérifié sur 35 lieux :**

| | 5 km (commune) | 50 km (au-delà) |
|---|---|---|
| Signal exploitable (≥ 10 valeurs distinctes) | 21 / 35 | **32 / 35** |
| Signal dégénéré | 14 | 3 |
| Zéro événement | 4 | 0 |

Les 14 lieux dégénérés à 5 km **ne sont pas un échec de mesure** : si un commerce déclare une
clientèle communale et qu'il n'y a rien dans 5 km, alors il n'y a réellement aucune concurrence
événementielle dans son périmètre. « Il ne se passe rien autour de vous » est une réponse vraie et
utile — aujourd'hui elle est cachée derrière un motif d'absence qui accuse l'historique.

## Où poser la question — décision owner 30/07

**Sur CHAQUE carte concernée**, à la place du motif d'absence, et **indéfiniment** tant qu'aucune
réponse n'est donnée.

Enfouie dans le formulaire de profil, la question resterait vide : elle l'est déjà sur les 32 lieux
du parc, et personne ne retourne dans ses réglages. Posée sur la carte qui ne peut pas se mesurer,
elle transforme une carte morte en levier, dans le contexte où elle a un sens.

Répondre sur une carte résout **toutes** les cartes — c'est dit sous les boutons pour que la
répétition ne soit pas vécue comme du harcèlement.

## Rendu (prototype validé)

**État « sans réponse »** — remplace la ligne grise `enjeu_reason_fr` :

```
Pour chiffrer ce que cette concurrence vous coûte, une seule chose manque :
la plupart de vos clients viennent-ils de votre commune, ou de plus loin ?
   ⟨ De ma commune ⟩   ⟨ De plus loin, ils se déplacent ⟩
Votre réponse fixe le périmètre sur lequel on mesure — une seule fois, pour toutes vos cartes.
```

**État « répondu »** : `✓ Périmètre régional enregistré — le montant apparaîtra demain`

Trois partis pris :
1. **La question est justifiée par son bénéfice**, jamais par notre manque de données.
2. **« Une seule fois, pour toutes vos cartes »** est explicite.
3. **La confirmation annonce le délai** — le calcul est nocturne ; le taire ferait croire à un bug.

## Ce qui reste à spécifier avant de coder

- **Stockage** : nouvelle colonne au grain `location_id`. Ne pas surcharger
  `location_access_pattern`.
- **Correspondance** : `commune` → 5 km · `au-delà` → 50 km. Les colonnes existent déjà, il n'y a
  rien à ingérer.
- **Défaut** : **aucun**. Tant que la réponse est absente, garder le comportement actuel (la classe
  n'existe pas). Un rayon deviné réintroduirait l'instabilité mesurée plus haut, et cette fois elle
  serait invisible parce qu'elle ressemblerait à une vraie mesure.
- **Endroits à toucher** : les 5 occurrences `events_within_500m_count` + les 2 `events_within_1km_count`
  du mart des cartes, la ligne 97 du registre, et le libellé de `events_high` qui affiche
  « (500 m) » en dur.
- **Rétroaction** : après réponse, le recalcul passe par le cron `day-class-impacts` — d'où le
  « demain » de la confirmation.

## Non résolu, et à ne pas oublier

`fct_location_events_radius_daily` ne remonte qu'à **25 jours** pour Les Olivades alors que la base
d'événements en a **93**. La table se construit en avant depuis l'entrée du lieu et son run
incrémental ne reconstruit que 14 jours. **Le bon rayon ne servira à rien tant que cette table
restera courte** — un `--full-refresh` la ramènerait à 120 jours, plafonnée à 93 par la source.

Et la famille `followed_activity_high` ne dépend pas du rayon : **14 lieux sur 32 n'ont aucun
concurrent suivi** (tous les `destination_catchment` et `local_catchment`). Deux leviers distincts,
à ne pas confondre.
