window.DOSSIER_PROTO = {
 "captured_at": "2026-08-10T14:19:19.615Z",
 "today": "2026-08-10",
 "cases": {
  "corner": {
   "label": "Corner de vente producteur — série, KPI famille",
   "payload": {
    "ok": true,
    "found": true,
    "item": {
     "saved_item_id": "56f47021-e0c2-42cc-a9ac-f1b04a9742f6",
     "title": "Corner de vente producteur",
     "dispositif": "Le producteur est sur place et fais la présentation produit et la vente en direct.\nObjectif:\n- valoriser les prodiuits\n- se positionner sur le créneau des producteurs/artisans\n- booster pôctuellement les ventes",
     "event_type": "autre",
     "event_type_label_fr": "Autre",
     "event_nature": "indoor",
     "hour_start": 9,
     "duration_days": null,
     "hour_end": 13,
     "author_person_name": "Julen de Ajuriaguerra · CEO",
     "kpi": "family_revenue",
     "kpi_family": "Branded",
     "kpi_target_pct": null,
     "kpi_target_eur": 150,
     "recurrence": "weekly",
     "recurrence_dow": 6,
     "decision_date": null,
     "selected_date": null,
     "event_end_date": null,
     "dates": [
      "2026-08-08",
      "2026-08-15",
      "2026-08-22",
      "2026-08-29",
      "2026-09-05",
      "2026-09-12",
      "2026-09-19",
      "2026-09-26"
     ],
     "consigne_arrival": "8h30",
     "consigne_store_info": "La boutique ouvre à 8h30 pour les employés.\n\nVous avez 30 minutes pour votre mise en place: vous aurez à votre disposition une table, des couverts, une nappe si besoin.\n\nSi vous avez des besoins spécifiques, merci de nous prévenir la veil",
     "consigne_interactions": "Faites goûter vos produits\nPrésentez votre savoir-faire\nExpliquez comment votre produit peut être utilisés au quotidien",
     "consigne_deroule": null,
     "consigne_send_offset": 3,
     "consigne_enabled": false
    },
    "stage": "apres",
    "fam_avg_day_eur": 34,
    "days": [
     {
      "date": "2026-08-15",
      "dow_fr": "samedi",
      "present": true,
      "horizon_days": null,
      "score": 6.8,
      "weather_label_fr": "Nuageux",
      "questions": [
       {
        "key": "clients",
        "tone": "info",
        "fact_fr": "Le public du jour : Vacances d'été · Assomption — effet estimé sur votre affluence : calendrier +4 % · météo −3 %. Touristes étrangers : 61 % des nuitées en Île-de-France — surtout États-Unis (25 %), Royaume-Uni (14 %) (profil été, réf. 2025)."
       },
       {
        "key": "acces",
        "tone": "ok",
        "fact_fr": "Accès — clients : fluide · fournisseurs (route) : fluide — aucune perturbation signalée autour de votre adresse ce jour-là."
       },
       {
        "key": "voisins",
        "tone": "info",
        "fact_fr": "Activité autour de vous : 7 événements à 500 m · 253 à 5 km, dont 139 de votre secteur — synergie ou partage de flux possibles.",
        "href": "/app/insightevent/map?location_id=f10c3e58-326e-4e38-947c-d59fcbe51df5&date=2026-08-15",
        "link_fr": "Voir sur la carte →"
       },
       {
        "key": "meteo",
        "tone": "ok",
        "fact_fr": "Météo : Nuageux — dispositif intérieur, exposition limitée.",
        "href": "/app/insightevent/days?selected_dates=2026-08-15",
        "link_fr": "Détail du jour →"
       },
       {
        "key": "concurrence",
        "tone": "info",
        "fact_fr": "Concurrence : pression ×0.9 vs votre habituel."
       }
      ],
      "objectif": {
       "expected_eur": 1188,
       "apport_eur": 116,
       "total_eur": 1304
      }
     }
    ],
    "avant_date": "2026-08-15",
    "apres": {
     "rows": [
      {
       "date": "2026-08-08",
       "dow_fr": "samedi",
       "revenue": 1869,
       "expected": 1779,
       "gap_eur": 90,
       "residual_pct": 5,
       "tickets": 399,
       "tickets_base": 288,
       "tickets_delta_pct": 39,
       "basket": 4.68,
       "basket_base": 4.75,
       "basket_delta_pct": -1,
       "tickets_base_dow": 258,
       "basket_base_dow": 4.9,
       "n_dow": 12,
       "visitors_measured": null,
       "visitors_declared": null,
       "bilan": null,
       "family_rev": 28,
       "family_avg": 34,
       "verdict": "missed",
       "commitment_status": "resolved",
       "target_met": false
      }
     ],
     "serie": {
      "n_occurrences": 8,
      "n_measured": 1,
      "n_above": 1,
      "median_gap_eur": 90,
      "sum_gap_eur": 90,
      "next_date": "2026-08-15",
      "kpi_key": "family_revenue",
      "kpi_unit": "eur",
      "kpi_target": 150,
      "kpi_n_measured": 1,
      "kpi_n_met": 0,
      "kpi_median": 28,
      "kpi_values": [
       {
        "date": "2026-08-08",
        "value": 28
       }
      ],
      "trend_readable": false
     },
     "documented": null,
     "reconciliation": "La famille Branded a fait 28 € contre 34 € son ordinaire, alors que la journée dépassait l'attendu de +90 € — la hausse du jour ne vient pas de cette opération.",
     "target_scale": {
      "ratio": 4.4,
      "ref": 34
     },
     "next_commitment": {
      "date": "2026-08-15",
      "status": "open",
      "verdict": null
     }
    },
    "consigne_sends": [
     {
      "occurrence_date": "2026-08-08",
      "sent_on": "2026-08-05",
      "n_recipients": 1
     }
    ],
    "sources": [
     "raw.saved_items × raw.saved_item_dates (l'événement, ses occurrences)",
     "semantic.vw_insight_event_day_surface (les 5 questions des jours à venir — audience, mobilité clients/fournisseurs, voisins, météo, concurrence)",
     "mart.fct_client_day_residual (CA vs attendu, + attendu par jour de semaine 90 j)",
     "mart.fct_client_sales_signals_daily (tickets, panier vs base 30 j)",
     "raw.client_transactions (CA de la famille vs sa moyenne journalière)",
     "analytics.action_commitments (verdicts des engagements ancrés saved_item_id)",
     "analytics.consigne_sends (traces d'envoi de la consigne d'opération)"
    ]
   }
  },
  "saas": {
   "label": "Lancement SaaS — one-off, KPI CA vs attendu",
   "payload": {
    "ok": true,
    "found": true,
    "item": {
     "saved_item_id": "cdd37a0a-693c-46e1-a1d3-b8e4ab1164e1",
     "title": "Lancement SaaS",
     "dispositif": null,
     "event_type": "lancement_de_produit",
     "event_type_label_fr": "Lancement de produit",
     "event_nature": null,
     "hour_start": null,
     "duration_days": null,
     "hour_end": null,
     "author_person_name": null,
     "kpi": "revenue_residual",
     "kpi_family": null,
     "kpi_target_pct": null,
     "kpi_target_eur": null,
     "recurrence": "none",
     "recurrence_dow": null,
     "decision_date": "2026-06-14",
     "selected_date": null,
     "event_end_date": "2026-07-25",
     "dates": [
      "2026-06-19"
     ],
     "consigne_arrival": null,
     "consigne_store_info": null,
     "consigne_interactions": null,
     "consigne_deroule": null,
     "consigne_send_offset": null,
     "consigne_enabled": false
    },
    "stage": "apres",
    "fam_avg_day_eur": null,
    "days": [],
    "avant_date": null,
    "apres": {
     "rows": [
      {
       "date": "2026-06-19",
       "dow_fr": "vendredi",
       "revenue": 766,
       "expected": 881,
       "gap_eur": -115,
       "residual_pct": -13,
       "tickets": 190,
       "tickets_base": 213,
       "tickets_delta_pct": -11,
       "basket": 4.03,
       "basket_base": 4.85,
       "basket_delta_pct": -17,
       "tickets_base_dow": 195,
       "basket_base_dow": 4.69,
       "n_dow": 11,
       "visitors_measured": null,
       "visitors_declared": 50,
       "bilan": {
        "action_carried": null,
        "weather": "conforme",
        "mobility": "difficile",
        "attendance": "conforme",
        "comment": null
       },
       "family_rev": null,
       "family_avg": null,
       "verdict": null,
       "commitment_status": null,
       "target_met": null
      }
     ],
     "serie": null,
     "documented": null,
     "reconciliation": null,
     "target_scale": null,
     "next_commitment": null
    },
    "consigne_sends": [],
    "sources": [
     "raw.saved_items × raw.saved_item_dates (l'événement, ses occurrences)",
     "semantic.vw_insight_event_day_surface (les 5 questions des jours à venir — audience, mobilité clients/fournisseurs, voisins, météo, concurrence)",
     "mart.fct_client_day_residual (CA vs attendu, + attendu par jour de semaine 90 j)",
     "mart.fct_client_sales_signals_daily (tickets, panier vs base 30 j)",
     "analytics.action_commitments (verdicts des engagements ancrés saved_item_id)",
     "analytics.consigne_sends (traces d'envoi de la consigne d'opération)"
    ]
   }
  }
 }
};
