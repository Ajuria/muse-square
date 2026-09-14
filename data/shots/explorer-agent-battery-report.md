# Batterie de l'agent Explorer — 2026-09-14 15:54 (compte f10c3e58, modèle claude-sonnet-5)

| Question | s | registre | outils | blocs | portes | pourquoi |
|---|---|---|---|---|---|---|
| Quelles familles souffrent de la pluie, et quelle est ma marge brute ? | 13.3 (1er bloc 8.9) | vetted | lire_marge, lire_familles_face_aux_jours | register, card, sources, card, sources | OK | — |
| Combien ai-je vendu sur mes 30 derniers jours, et qu'est-ce qui a bougé par rapport à la période précédente ? | 6.4 (1er bloc 2.9) | vetted | lire_ventes | register, table, table, sources | OK | — |
| Quel est mon résultat net du mois dernier, et mon seuil de rentabilité est-il atteint aujourd'hui ? | 3.8 (1er bloc 2.1) | vetted | lire_resultat | register, table, facts, sources | OK | — |
| Mon CA de la semaine dernière ? | 6.6 (1er bloc 2.8) | vetted | lire_ventes | register, table, table, sources | OK | — |
| Montre-moi comment mes pôles performent au m². | 7.2 (1er bloc 2.3) | model | lire_poles_classement | register, table, sources | OK | nombres non fondés : 95.2 (absent des blocs → calculé par le modèle) ; 7.6 (absent des blocs → calculé par le modèle) |
| Classe mes pôles par marge brute sur le mois dernier. | 7.0 (1er bloc 2.3) | vetted | lire_poles_classement | register, table, sources | OK | — |
| Génère le rapport des ventes de la semaine dernière : volume, panier, mix, et les pôles les plus et les moins performants en nombre de ventes. | 6.7 (1er bloc 2.8) | vetted | composer_rapport | register, rapport, cta | OK | — |
| Fais-moi mon rapport de ventes du mois dernier. | 9.3 (1er bloc 3.7) | vetted | composer_rapport | register, rapport, cta | OK | — |
| Compose mon rapport « Hebdo pôles ». | 8.8 (1er bloc 3.4) | vetted | composer_rapport | register, rapport, cta | OK | relecture : /\b(sous|à|vs|au-dessus de|au-dessous de|contre) (leur|votre|son|sa|notre|ton) habituel\b/ |
| Mes top 3 produits en août ? | 6.9 (1er bloc 4.0) | vetted | lire_ventes | register, table, table, sources | OK | — |
| Qu'est-ce qui a marché ? | 7.2 (1er bloc 2.7) | vetted | lire_engagements, lire_dispositifs_documentes | register, headline, datecards, facts, facts, cta, sources, facts, sources | OK | — |
| Qu'est-ce qui a marché, et quelles bonnes pratiques ai-je documentées ? | 8.5 (1er bloc 3.0) | vetted | lire_engagements, lire_dispositifs_documentes | register, headline, datecards, facts, facts, cta, sources, facts, sources | OK | — |
| Comment va le pôle Cuisine sur le mois dernier ? | 6.2 (1er bloc 3.8) | vetted | lire_entite_periode | register, prose, facts, table, sources | OK | — |
| Compare Coffee et Tea sur le mois dernier. | 8.0 (1er bloc 4.8) | vetted | lire_entite_periode | register, prose, prose, table, sources | OK | — |
| Compare le 05/09/2026 et le 12/09/2026. | 7.6 (1er bloc 2.5) | vetted | comparer_journees | register, headline, facts, sources | OK | — |
| Compare mes journées. | 5.4 (1er bloc 3.6) | model | comparer_journees | register, prose, clarification | FAIL registre | nombres non fondés : 5 (absent des blocs → calculé par le modèle) ; 6 (absent des blocs → calculé par le modèle) |
| Compare le 05/09/2026 et le 12/09/2026, et dis-moi quel pôle a le plus fort CA par mètre. | 8.3 (1er bloc 3.1) | vetted | lire_poles_classement, comparer_journees | register, table, sources, headline, facts, sources | OK | — |
| Où sont mes cafés en grains dans le magasin ? | 6.4 (1er bloc 3.0) | vetted | lire_memoire, lire_poles | register, facts, sources | OK | — |
| Quelles bonnes pratiques ai-je documentées ? | 7.0 (1er bloc 2.8) | vetted | lire_dispositifs_documentes | register, facts, sources | OK | relecture : « l'attendu » ; « attendu du jour » |
| Pendant le Corner de vente producteur, qu'a fait la famille Coffee ? | 8.4 (1er bloc 4.8) | vetted | lire_operation_famille | register, prose, table, facts, prose, table, facts, prose, table, prose, table, sources | OK | — |
| Planifie-moi octobre. | 11.5 (1er bloc 4.1) | vetted | composer_plan | register, prose, prose, table, prose, table, prose, table, facts, prose, facts, prose, facts, prose, facts, prose, segment, segment, segment, prose, table, prose, facts, sources | OK | relecture : « rejouable » |
| Ma marge moyenne est de 62 %. | 3.5 (1er bloc 1.8) | vetted | ecrire_declaration | register, prose, facts | OK | — |
| Ma marge moyenne est de 62 % : quelle est ma marge le week-end ? | 6.9 (1er bloc 2.5) | vetted | ecrire_declaration, lire_marge | register, prose, facts, card, sources | OK | — |
| Pendant les Soldes d'hiver, qu'a fait la famille Coffee ? | 4.7 (1er bloc 2.6) | vetted | lire_operation_famille | register, prose, clarification | OK | — |
| Montre-moi mon plan coloré par CA au m², et dis-moi quel pôle a la plus forte marge brute par mètre. | 7.7 (1er bloc 2.9) | vetted | lire_poles_classement, lire_plan | register, table, sources, plan, sources | OK | — |
| Pourquoi ma marge brute a bougé sur les 30 derniers jours par rapport aux 30 jours d'avant ? | 5.2 (1er bloc 1.8) | vetted | pont_de_marge | register, table, barres_h, table, facts, sources | OK | — |
| Quelle famille souffre le plus de la pluie ? Propose-moi une opération sur cette famille pour samedi prochain. | 28.9 (1er bloc 4.8) | vetted | lire_familles_face_aux_jours, lire_familles, proposer_operation, proposer_operation | register, card, sources, proposition_operation | OK | — |

1 cas en échec sur 27. Budget owner : 3 s (mesuré, pas atteint : décision modèle en attente, spec § 10).