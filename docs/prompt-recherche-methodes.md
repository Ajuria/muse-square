# Prompt — recherche des « how » pour la bibliothèque de méthodes Muse Square

> À coller tel quel dans un chat séparé. Il est autonome : il ne suppose aucun accès au dépôt.

---

## Ce que je te demande

Tu cherches en ligne des **méthodes exécutables** (le « comment on fait ») que je pourrai réécrire
dans ma voix pour la bibliothèque de plans d'action de mon produit. Tu produis de la **matière
première documentée**, jamais du texte à publier.

Muse Square est un outil français d'aide à la décision pour des exploitants indépendants — cafés,
restaurants, boutiques, sites culturels, domaines viticoles. Chaque jour, l'outil fait remonter des
« cartes » signalant un fait mesuré sur leur établissement. Quand l'exploitant clique « M'engager »,
on lui propose **jusqu'à 3 méthodes** pour agir sur ce fait. Ce sont ces méthodes qui manquent.

---

## L'avertissement qui doit guider toute ta recherche

**Une recherche de ce type revient presque toujours avec des preuves, pas avec des méthodes.**
Nous l'avons déjà éprouvé et documenté :

- les organismes institutionnels **vendent** le « comment » (diagnostic, coaching) et n'en publient
  que le sommaire ;
- la recherche académique donne des effets mesurés sans procédure reproductible ;
- la presse professionnelle donne des anecdotes isolées ;
- les blogs de prestataires donnent du marketing déguisé en conseil.

Résultat attendu par défaut : **peu de trouvailles, très filtrées**. C'est le bon résultat.
**Une case vide vaut mieux qu'un conseil douteux.** Si tu ne trouves rien de solide pour un type de
carte, écris « rien de recommandable trouvé » et explique ce que tu as cherché. Ne comble jamais.

---

## Barre de qualité — un candidat ne passe que s'il coche TOUT

1. **Exécutable cette semaine** par un patron indépendant, seul ou avec son équipe existante, sans
   outil à acheter ni équipe dédiée.
2. **Un geste unique et nommé**, pas une stratégie fourre-tout. « Pivot numérique 360° » → non.
3. **Non évident.** « Communiquez plus », « soignez l'accueil », « publiez sur les réseaux » → non.
   Le lecteur est un professionnel : s'il pouvait le trouver seul, ça ne vaut rien.
4. **Transposable à son échelle.** Un CRM de grande institution, un stade de 70 000 places → non.
5. **Le test de vive voix** : le recommanderais-tu, en le regardant dans les yeux, à un patron
   indépendant qui te fait confiance ? Si tu hésites, c'est non.
6. **Légal et praticable en France.** Interdits : modifier les horaires d'un salarié à 2-3 jours
   (délai de prévenance 7 j, réductible à 3 en hôtellerie-restauration par accord), revente à
   perte, soldes hors dates légales, collecte de fichier client non conforme RGPD. Ce qu'un
   exploitant maîtrise à court terme : ses **achats**, le fait de **ne pas appeler d'extra**, et
   **ce qu'il fait faire** à l'équipe déjà planifiée.
7. **Pas d'expérimentation tarifaire risquée** : prix libre, gratuité de masse, remise permanente
   forte → non.

---

## Sources — hiérarchie stricte

**Tier 1, à chercher en priorité** (institutionnel, fondation, académique, fédération) : France Num,
Bpifrance, CCI, UMIH, UNIMEV, Atout France, Wallace Foundation, CultureHive / American Marketing
Association, Cornell Center for Hospitality Research, et tout domaine en `.gouv.fr`, `.gov`, `.edu`.

**Tier 2, confiance plafonnée** (rapports de données multi-établissements, presse professionnelle
reconnue) : TRG Arts, Spektrix, L'Hôtellerie-Restauration, Vitisphere, LSA, Néorestauration,
Snacking, B.R.A., Great Wine Capitals.

**Hors de ces deux listes → écarté.** Blogs de prestataires, agences, auteurs inconnus, contenus
sponsorisés : ne me les remonte pas, même s'ils disent des choses justes.

**Exception, à signaler explicitement** : si un geste de qualité vient d'un prestataire (SMS jour
creux, empreinte bancaire anti no-show, ingénierie de carte…), tu peux le remonter **en retirant
tout chiffre d'auto-promotion** et en écrivant « chiffres du prestataire, non vérifiés
indépendamment ».

---

## Format de sortie — une fiche par méthode

```
TYPE DE CARTE   : <l'identifiant exact ci-dessous>
TITRE           : le geste, en mots de patron, à l'impératif. Court.
DESCRIPTION     : comment on fait, en une ligne.
POURQUOI        : le mécanisme — pourquoi ça marche. Non évident, sans remplissage.
ÉTIQUETTE       : le levier en un mot ou deux (Conversion · Panier · Fréquentation ·
                  Yield / anticipation · Fidélisation …)
ÉTAPES          : 2 à 4 étapes concrètes d'exécution. Optionnel mais précieux.
SOURCE          : URL complète + nom de l'organisme + tier (1 ou 2)
CE QUE LA SOURCE DIT EXACTEMENT : citation courte ou paraphrase fidèle, pour que je puisse
                  vérifier que tu n'as pas extrapolé.
CE QUE J'AI DÛ DÉDUIRE : ce que tu as comblé toi-même, s'il y a lieu. Dis-le franchement.
```

**Trois fiches maximum par type de carte.** Au-delà, elles seraient jetées.

---

## Interdits absolus

- **N'invente aucun chiffre.** Ni pourcentage, ni euro, ni délai. Les nombres viendront de nos
  propres données. Si la source en donne un, cite-le comme sien avec son URL ; sinon, aucun chiffre.
- **Ne rédige pas ma voix finale.** Écris clair et factuel ; je réécrirai.
- **N'invente pas de source** et ne cite pas une page que tu n'as pas ouverte.
- **Ne remplis pas les cases vides.** « Rien trouvé » est une réponse complète et utile.

---

## Les types de cartes, par ordre de priorité

Priorité mesurée sur 90 jours de production. Les quatre premiers représentent 392 déclenchements.
Les **variables** listées sont celles que notre pipeline remplira automatiquement dans le texte :
tu peux écrire des phrases qui les appellent, mais **jamais leur valeur**.

### 1. `foreign_tourism_signal` — 128 déclenchements, 32 établissements
Ce que la carte annonce déjà : « **Adaptez-vous au public touristique étranger** » — un public
étranger est en congés (vacances scolaires ou jour férié dans son pays), et ce flux passe devant
l'établissement.
Variables : `countries_named`, `n_countries`, `share_total_pct`, `school_holiday_names`,
`public_holiday_names`, `pct_subdivisions_on_holiday`, `location_access_pattern`.
Cherche : accueil multilingue à coût nul, signalétique, adaptation de l'offre à un public de
passage étranger, paiement, attentes par nationalité.

### 2. `audience_shift_opportunity` — 124 déclenchements, 31 établissements
« **Ajustez votre message au public du jour** » — le public disponible aujourd'hui n'est pas la
cible habituelle (vacances, férié, événement commercial).
Variables : `audience_availability_label`, `commercial_event_name`, `vacation_name`, `holiday_name`,
`delta_att_calendar_pct`, `events_5km`, `pressure_ratio`.
Cherche : adaptation d'offre et de message à un public de substitution, sur 24-48 h.

### 3. `tourism_peak_window` — 80 déclenchements, 20 établissements
« **Pic touristique régional** » — la fréquentation touristique de la région entre dans une phase
haute.
Variables : `tourism_index`, `tourism_status`, `is_peak`, `score`.
Cherche : ce qu'on prépare AVANT un pic (achats, amplitude, mise en avant), pas pendant.

### 4. `weekend_opportunity` — 60 déclenchements, 30 établissements
« **Activez une opération ce week-end** » — les conditions du week-end à venir sont favorables.
Variables : `events_5km`, `is_holiday`, `regime`, `score`, `weather_alert`.
Cherche : opérations de week-end montables en 48 h, sans embauche ni remise généralisée.

### Ensuite, si tu as de la matière
`competition_proximity` · `review_solicitation` · `extended_bad_weather_3d` ·
`same_bucket_saturation` · `saturated_bad_weather` · `competitor_reputation_strength` ·
`weather_hazard_onset` · `weather_worsened` · `tourism_comp_squeeze` · `tourist_high_season` ·
`tourist_surge_vacation` — puis les autres, plus rares.

---

## Comment je veux que tu procèdes

1. **Un type à la fois.** Termine `foreign_tourism_signal` avant de passer au suivant.
2. **Dis-moi ce que tu as cherché** — les requêtes, les sites — avant de me dire ce que tu as
   trouvé. Je veux pouvoir juger la couverture, pas seulement le résultat.
3. **Écarte à voix haute.** Si tu trouves dix candidats et n'en gardes qu'un, dis-moi pourquoi les
   neuf autres sont tombés. Ces refus m'apprennent autant que les trouvailles.
4. **Ne conclus pas trop vite qu'il n'y a rien.** Cherche en français ET en anglais, et essaie les
   `site:` sur les domaines tier 1 avant d'abandonner un type.
