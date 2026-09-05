# Handoff dbt Cloud IDE — seeds des composants : les mots owner du 03/09 (après-midi)

Les libellés des types et rôles de composant sont désormais des mots owner (lexique, 03/09
après-midi) : Îlot, Caisse, Espace dégustation, Service client, Produits du quotidien, Produits
de connaisseur, Promotion, Service au comptoir, Conseiller clientèle, Accueil, Signalétique.
Les deux seeds sont la COPIE du registre app (`src/lib/dispositifs/dispositifTypes.ts`) : ils se
régénèrent, ils ne s'éditent pas. Restent `provisoire` (aucun mot owner) : le rôle
impulsion et le sous-type panneau de salle.

Deux fichiers à REMPLACER en entier, puis un seul geste. Aucun modèle ne change.

## 1. `ms_dbt/seeds/open_data/dispositifs/dispositif_types.csv`
```csv
type_value,label_fr,provisoire
vitrine,"Vitrine",false
lineaire,"Linéaire",false
gondole,"Gondole",false
tete_de_gondole,"Tête de gondole",false
table_ilot,"Îlot",false
point_assiste,"Service client",false
caisse,"Caisse",false
espace_experience,"Espace dégustation",false
mediation,"Dispositif de médiation",false
autre,"Autre",false
```

## 2. `ms_dbt/seeds/open_data/dispositifs/dispositif_roles.csv`
```csv
type_value,role_value,label_fr,provisoire
lineaire,courant,"Produits du quotidien",false
lineaire,expert,"Produits de connaisseur",false
lineaire,impulsion,"Achats d'impulsion",true
lineaire,promo,"Promotion",false
gondole,courant,"Produits du quotidien",false
gondole,expert,"Produits de connaisseur",false
gondole,impulsion,"Achats d'impulsion",true
gondole,promo,"Promotion",false
tete_de_gondole,courant,"Produits du quotidien",false
tete_de_gondole,expert,"Produits de connaisseur",false
tete_de_gondole,impulsion,"Achats d'impulsion",true
tete_de_gondole,promo,"Promotion",false
point_assiste,comptoir_service,"Service au comptoir",false
point_assiste,point_conseil,"Conseiller clientèle",false
point_assiste,billetterie_accueil,"Accueil",false
mediation,cartel,"Cartel",false
mediation,panneau_de_salle,"Panneau de salle",true
mediation,multimedia,"Dispositif multimédia",false
mediation,signaletique,"Signalétique",false
```

## Le geste dans l'IDE
```bash
dbt seed --select dispositif_types dispositif_roles
```
Attendu : 10 et 19 lignes (mêmes comptes qu'avant — seuls les libellés et le drapeau `provisoire`
changent). Les vues (`vw_insight_event_dispositif_components`) lisent les seeds en direct : rien à
re-runner. Commit sur `Ajuria-branch`, PR vers `main`.

## Message de commit (dépôt `ms_database`)
```
chore(seeds): composants — les mots owner du 03/09 dans dispositif_types / dispositif_roles

Copie régénérée du registre app src/lib/dispositifs/dispositifTypes.ts : Îlot, Caisse, Espace dégustation,
Service client, Produits du quotidien, Produits de connaisseur, Promotion, Service au comptoir,
Conseiller clientèle, Accueil, Signalétique (provisoire = false). Restent provisoires :
impulsion, panneau_de_salle. Mêmes clés, mêmes comptes (10 / 19).
```
