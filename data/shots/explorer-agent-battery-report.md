# Batterie de l'agent Explorer — 2026-09-14 16:50 (compte f10c3e58, modèle claude-sonnet-5)

| Question | s | registre | outils | blocs | portes | pourquoi |
|---|---|---|---|---|---|---|
| Quelles familles souffrent de la pluie, et quelle est ma marge brute ? | 7.4 (1er bloc 2.8) | vetted | lire_marge, lire_familles_face_aux_jours | register, card, sources, card, sources | OK | — |
| Combien ai-je vendu sur mes 30 derniers jours, et qu'est-ce qui a bougé par rapport à la période précédente ? | 9.5 (1er bloc 4.7) | vetted | lire_ventes | register, table, table, sources | OK | — |
| Quel est mon résultat net du mois dernier, et mon seuil de rentabilité est-il atteint aujourd'hui ? | 4.4 (1er bloc 2.2) | vetted | lire_resultat | register, table, facts, sources | OK | — |
| Mon CA de la semaine dernière ? | 5.4 (1er bloc 2.4) | vetted | lire_ventes | register, table, table, sources | OK | — |
| Montre-moi comment mes pôles performent au m². | 6.9 (1er bloc 2.3) | vetted | lire_poles_classement | register, table, sources | OK | — |
| Classe mes pôles par marge brute sur le mois dernier. | 6.9 (1er bloc 2.2) | vetted | lire_poles_classement | register, table, sources | OK | — |
| Génère le rapport des ventes de la semaine dernière : volume, panier, mix, et les pôles les plus et les moins performants en nombre de ventes. | 10.2 (1er bloc 4.5) | vetted | composer_rapport | register, rapport, cta | OK | — |
| Fais-moi mon rapport de ventes du mois dernier. | 7.2 (1er bloc 2.7) | vetted | composer_rapport | register, rapport, cta | OK | — |
| Compose mon rapport « Hebdo pôles ». | 8.1 (1er bloc 3.8) | vetted | composer_rapport | register, rapport, cta | OK | — |
| Mes top 3 produits en août ? | 6.4 (1er bloc 3.9) | vetted | lire_ventes | register, table, table, sources | OK | — |
| Qu'est-ce qui a marché ? | 9.3 (1er bloc 3.3) | vetted | lire_dispositifs_documentes, lire_engagements | register, facts, sources, headline, datecards, facts, facts, cta, sources | OK | — |
| Qu'est-ce qui a marché, et quelles bonnes pratiques ai-je documentées ? | 8.2 (1er bloc 2.0) | vetted | lire_engagements, lire_dispositifs_documentes | register, headline, datecards, facts, facts, cta, sources, facts, sources | OK | — |
| Comment va le pôle Cuisine sur le mois dernier ? | 6.9 (1er bloc 3.9) | vetted | lire_poles, lire_entite_periode | register, prose, facts, table, sources | OK | — |
| Compare Coffee et Tea sur le mois dernier. | 8.7 (1er bloc 5.0) | vetted | lire_entite_periode | register, prose, prose, table, sources | OK | — |
| Compare le 05/09/2026 et le 12/09/2026. | 6.6 (1er bloc 2.0) | vetted | comparer_journees | register, headline, facts, sources | OK | — |
| Compare mes journées. | 6.9 (1er bloc 4.2) | vetted | comparer_journees | register, prose, clarification | OK | — |
| Compare le 05/09/2026 et le 12/09/2026, et dis-moi quel pôle a le plus fort CA par mètre. | 8.3 (1er bloc 3.0) | vetted | comparer_journees, lire_poles_classement | register, headline, facts, sources, table, sources | OK | — |
| Où sont mes cafés en grains dans le magasin ? | 5.7 (1er bloc 3.0) | vetted | lire_poles, lire_memoire | register, facts, sources | OK | — |
| Quelles bonnes pratiques ai-je documentées ? | 5.4 (1er bloc 1.9) | vetted | lire_dispositifs_documentes | register, facts, sources | OK | relecture : « l'attendu » ; « attendu du jour » |
| Pendant le Corner de vente producteur, qu'a fait la famille Coffee ? | 10.3 (1er bloc 5.4) | vetted | lire_operation_famille | register, prose, table, facts, prose, table, facts, prose, table, prose, table, sources | OK | — |
| Planifie-moi octobre. | 12.1 (1er bloc 3.7) | vetted | composer_plan | register, prose, prose, table, prose, table, prose, table, facts, prose, facts, prose, facts, prose, facts, prose, segment, segment, segment, prose, table, prose, facts, sources | OK | relecture : « rejouable » |
| Ma marge moyenne est de 62 %. | 6.4 (1er bloc 2.3) | vetted | ecrire_declaration, lire_marge | register, prose, facts, card, sources | OK | — |
| Ma marge moyenne est de 62 % : quelle est ma marge le week-end ? | 6.8 (1er bloc 2.7) | vetted | ecrire_declaration, lire_marge | register, prose, facts, card, sources | OK | — |
| Pendant les Soldes d'hiver, qu'a fait la famille Coffee ? | 4.6 (1er bloc 3.0) | vetted | lire_operation_famille | register, prose, clarification | OK | — |
| Montre-moi mon plan coloré par CA au m², et dis-moi quel pôle a la plus forte marge brute par mètre. | 8.5 (1er bloc 4.3) | vetted | lire_plan, lire_poles_classement | register, plan, sources, table, sources | OK | — |
| Pourquoi ma marge brute a bougé sur les 30 derniers jours par rapport aux 30 jours d'avant ? | 7.1 (1er bloc 2.8) | vetted | pont_de_marge | register, table, barres_h, table, facts, sources | OK | — |
| Quelle famille souffre le plus de la pluie ? Propose-moi une opération sur cette famille pour samedi prochain. | 27.4 (1er bloc 2.2) | vetted | lire_familles_face_aux_jours, lire_familles_face_aux_jours, lire_poles, lire_familles, proposer_operation, proposer_operation | register, card, sources, card, sources, proposition_operation | OK | — |

0 cas en échec sur 27. Budget owner : 3 s (mesuré, pas atteint : décision modèle en attente, spec § 10).