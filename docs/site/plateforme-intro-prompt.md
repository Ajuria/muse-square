# Prompt — section « Comment ça marche ? » de la page Plateforme — SPEC DE TRAVAIL

*(à coller tel quel dans Gemini)*

---

## TA MISSION

Écris la section **« Comment ça marche ? »** de la page Plateforme de Muse Square.

Cette section est **l'intro de la page** : elle vient juste sous la bannière, et tout ce qui la suit
est une démonstration en écrans. Son travail est donc précis — **annoncer ce qui arrive et dire à
quoi sert chaque partie**, pour qu'un lecteur qui descend sache ce qu'il regarde.

Ce n'est ni un résumé du produit, ni un argumentaire. C'est un sommaire qui donne du sens.

**Ce qu'elle ne doit PAS faire :** raconter la boucle en prose. Les écrans du dessous la montrent
déjà, pas à pas. Si ta section explique le mécanisme, le lecteur lit deux fois la même chose — la
seconde avec des preuves, donc la première n'aura servi qu'à le retarder.

**Tu n'as accès ni au produit ni au code.** Tout ce que tu as le droit d'affirmer est dans ce
document. S'il te manque un fait, tu le demandes — tu ne le supposes jamais.

---

## 1. CE QU'IL Y A SOUS TA SECTION, DANS L'ORDRE

C'est ça que tu annonces. Une partie = une raison d'exister.

| # | Partie | Ce qu'elle montre | À quoi elle sert pour le lecteur |
|---|---|---|---|
| 1 | **Une suite de 5 écrans numérotés** | Une seule affaire suivie de bout en bout : un week-end de vacances qui rapporte moins → le dispositif déjà prouvé qu'on reprend → l'action confiée à quelqu'un → le verdict → la version suivante | Voir le produit travailler sur un cas réel, du signal au résultat |
| 2 | **Explorer** | Une capture : poser une question en français sur ses propres données | Comprendre qu'on peut interroger l'historique sans savoir requêter |
| 3 | **Piloter** | Le tableau de bord : CA et sa courbe, cinq indicateurs, À faire, opérations en cours, pôles, dispositifs | Voir ce que ça donne au bout de quelques mois, quand il y a trente dispositifs |
| 4 | **Alertes** | Les envois par email et sur les canaux de l'équipe | Savoir qu'on n'est pas obligé d'ouvrir l'app |
| 5 | **Les 4 signaux de risque** | Concurrence, mobilité, calendrier, météo — avec des exemples de ce que l'app affiche vraiment | Savoir ce qui entre : d'où viennent les signaux |
| 6 | **Sécurité & données** | Hébergement européen, ce qu'on ne reprend pas des ventes, ce que l'IA voit | Lever l'objection avant qu'elle ne soit posée |

**Le fil à faire passer, si tu ne devais en garder qu'un :** ce qui distingue Muse Square n'est ni
le contexte extérieur seul (les logiciels de caisse le proposent déjà), ni les ventes seules (la
caisse les a). C'est le **croisement des deux**, et le fait d'en tirer un verdict mesuré.

---

## 2. LE GABARIT — slots et longueurs

Largeur de contenu 1140 px, texte pleine largeur.

| Slot | Contrainte |
|---|---|
| Titre `h2`, centré, majuscules | « Comment ça marche ? » — **ne le change pas** |
| Corps | **4 à 6 paragraphes**, 17 px. Chacun ouvre sur une **amorce en gras** de 2 à 4 mots suivie d'un point, puis 2 à 4 phrases. **≤ 340 caractères par paragraphe.** |

Un paragraphe par partie annoncée, ou des parties regroupées si deux se tiennent — à toi de
décider, mais l'ordre du § 1 ne bouge pas.

Le gras sert **uniquement** aux amorces de paragraphe et aux noms de gestes du produit
(Consulter la source, Communiquer, Faire suivre, Automatiser, M'engager). Nulle part ailleurs.

---

## 3. CE QUE TU AS LE DROIT D'AFFIRMER

- L'application a **trois onglets** : Piloter (le tableau de bord), Agir (les actions du jour),
  Explorer (les questions en langage naturel).
- Elle croise chaque nuit **le dehors** — concurrence, météo, mobilité, calendrier, tourisme —
  avec **les ventes du client**, importées de sa caisse.
- Chaque matin : un nombre **limité** d'actions priorisées. La chaîne validée, à reprendre telle
  quelle si tu l'emploies : « **Cinq actions priorisées vous attendent. Pas vingt.** »
- Chaque action porte le **fait nommé** (le nom, le chiffre, la date), son **enjeu en euros**, et
  une action réellement faisable.
- L'utilisateur déclare ce qu'il fait, sur quel chiffre il sera jugé et sur quelles dates.
  L'application mesure chaque jour contre **son résultat habituel** et rend un **verdict** :
  **atteint · manqué · non concluant**.
- Ce qui a marché devient un **dispositif prouvé**, réutilisable, qui reste dans l'entreprise.
  Ce qui a coûté est **écarté** et ne sera plus proposé.
- Le calcul retire la météo, les vacances et le calendrier de la comparaison avant de conclure.
- Couverture : **Île-de-France, Occitanie, Provence-Alpes-Côte d'Azur** — choix assumé.

---

## 4. CE QUE TU NE PEUX PAS PROMETTRE

- **Pas de marge.** Le chiffre s'appelle **profit estimé** : l'utilisateur déclare son taux, appliqué
  par famille de produits. Jamais « marge », jamais « marge par produit ».
- **Pas de stock.** L'app ne connaît que ce qui s'est **vendu**. Jamais « vérifiez le stock »,
  « rupture », « il ne doit pas manquer ».
- **Pas de cause certaine.** Bannis : « impact réel », « précisément », « la cause ».
- **Pas d'horaires ni d'effectif** : le planning est encadré en France (délai de prévenance).
  Ce que l'exploitant maîtrise à 2-3 jours : ses **achats**, ne pas appeler d'extra, et ce qu'il
  fait faire à l'équipe déjà en poste.
- **L'app ne fait pas venir les gens.** Jamais « optimiser la fréquentation ».
- **Pas de connecteur caisse universel** : aujourd'hui l'export CSV. Formulation exacte :
  « Connexion directe prévue — en attendant, export CSV… ». Jamais « bientôt disponible ».
- **Aucun chiffre sans source.** Pas de durée promise (« en cinq minutes »), pas de pourcentage
  de gain, pas de nombre de clients.

---

## 5. LA VOIX

Le lecteur est un exploitant français qui gère un ou plusieurs lieux recevant du public. Il n'est
pas analyste et n'a pas de temps. Le fondateur a refusé sept textes générés, avec ce motif :

> « llm language is not acceptable as it raises trust issues in the user »

Une phrase qui débite une évidence bien tournée fait douter de toutes les autres. Sur un produit
qui vend la mesure honnête, une formule creuse coûte plus qu'elle ne rapporte.

Registre approuvé, littéral et concret. Exemple en production : *« Cinq actions priorisées vous
attendent. Pas vingt. »*

**Six tests, à passer avant de montrer une phrase, et à MONTRER dans ta réponse :**

1. **Verbe ordinaire sur un objet qu'on manipule** — une offre, les achats, l'équipe, les prix,
   la fiche Google. Proscrits : *aligner, capter, concentrer, activer (sans objet), surveiller,
   se positionner, optimiser, maximiser, adresser, animer*.
2. **Retournement** — écris le contraire. S'il est absurde, la phrase n'affirme rien.
3. **Condition** — nomme-t-elle un moment, un seuil, un état ? Vraie partout = utile nulle part.
4. **Donnée** — aurait-elle pu être écrite sans jamais avoir vu ce produit ? Alors c'est du remplissage.
5. **Maxime** — aucune sentence au présent général de forme « X — donc Y ».
6. **Volume** — jamais un volume absolu : Nîmes et Paris ne portent pas le même trafic.

**Tics bannis mécaniquement** : « il s'agit de… » · « permet de / permettent de / permettre de… »
· « en résumé » · « à retenir : » · « notons » · « on constate » · les triades et parallélismes ·
les parenthèses de pluriel « (s) » · toute phrase qui explique la mise en page de la page.

---

## 6. LES MOTS

| N'écris pas | Écris |
|---|---|
| mémoire commerciale · gestion commerciale | **mémoire opérationnelle** |
| copilote · assistant | (enterrés) |
| recette · méthode · playbook · plan · routine | **dispositif** |
| validé · certifié | **prouvé** |
| rejeté · invalidé | **écarté** |
| non mesurable | **non concluant** |
| l'attendu · la normale · vs habituel | **votre résultat habituel** |
| pression concurrentielle · jours disputés | **activité dans votre périmètre** |
| tracking · crawl · couverture | **veille** · **vos suivis** · **lus cette nuit** |
| zone de chalandise | **votre périmètre** |
| menace | **concurrent direct** |
| fenêtre favorable · meilleure fenêtre | **occasion** · **Opportunités** |
| nombre de transactions · volume d'achats | **ventes** |
| ticket moyen | **panier moyen** |
| trafic | **visiteurs** |
| marge | **profit estimé** |
| catégorie · rayon | **famille produits & services** |
| potentiel · opportunité € | **enjeu annualisé** |
| Armer | **Automatiser** |
| partager · notifier | **Communiquer** |

**Formats France** : dates JJ/MM/AAAA · virgule décimale · **€ après le nombre** (12 000 €) ·
espace avant les unités (500 m, 10 km) et avant « ? », « : », « ! » · jours en toutes lettres.

Un concept sans mot dans ce tableau : **demande-le**. Ne l'invente pas.

---

## 7. CE QUE TU RENDS

1. La section complète : le titre (inchangé) et les paragraphes.
2. Pour **chaque** paragraphe : le **tableau des six tests**, verdict par test. Un ⚠️ honnête vaut
   mieux qu'un ✅ faux — un tableau complaisant est pire qu'une phrase refusée.
3. Le contrôle du § 6, fait à la main, avec le résultat.
4. Le compte de caractères de chaque paragraphe.
5. La liste de tes questions, s'il t'en reste.

**Trois interdits de procédure :**

- Ne réécris jamais une chaîne qu'on ne t'a pas demandé de réécrire. Ce qui dépasse le périmètre
  se **signale**.
- Ne propose pas de tagline ni de slogan. Le titre « Comment ça marche ? » ne bouge pas.
- N'affirme rien sur le produit qui ne soit pas dans ce document.

---

## 8. DEUX ARBITRAGES QUI NE SONT PAS À TOI

Ils appartiennent au propriétaire. Ne tranche pas, ne les contourne pas — écris comme si l'état
actuel restait, et signale si ton texte en dépend.

1. **Les « 4 signaux de risque »** sont aujourd'hui tout en bas de la page, après Alertes. Ils
   pourraient remonter dans ta section, puisqu'ils répondent à « ce qui entre ».
2. **Un schéma des quatre questions** (qu'est-ce qui impacte · quel dispositif · qui s'en charge ·
   est-ce que ça a marché) figure aujourd'hui sous ta section. Il fait peut-être doublon avec la
   suite de 5 écrans.
