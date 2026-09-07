# Explorer — attribution par section (Étape 1 du chantier Explorer) — DÉFINITIF

**Statut : LIVRÉ — les 5 étapes du chantier parent, pas seulement celle-ci.** La liste de libellés a été
reçue et approuvée le 07/08 : elle vit dans `src/lib/fr/factOrigins.fr.ts` (12 libellés, commentaire
« Approuvés owner 07/08 »). L'attribution serveur est en place (`origin` sur `CitableFact`,
`facts_catalog` + `sentence_provenance` dans l'enveloppe), le rendu à chips aussi
(`public/js/card-kit.js`, bloc `sourced`), et les étapes 2 à 5 ont shippé les 07-08/08.
Vérifié le 26/08. **La ligne « BLOQUÉ — aucun code avant réception » qui figurait ici était fausse
depuis le 08/08** : 6 fichiers de code citent ce document, un lecteur pouvait en conclure qu'il ne
fallait rien toucher.

Chantier parent (5 étapes, ordre accepté 07/08) :
1. **Attribution par section (CE document)**
2. Étendre la porte de grounding aux chemins `v3_narrative` (mois/compare/mobilité/entité)
3. Planificateur de récupération (remplace le premier-match regex ; fin du blanking `_dayPerf` en family-led — par RANG de salience, pas par exclusion)
4. Boucle d'outils Phase 5 (les outils = providers existants, sortie = `CitableFact[]` uniquement)
5. Sources externes en sections « Web — non vérifié » avec URL (`enrich-context` devient provider ; jamais fusionné au vetted)

## Ce qui ship (Étape 1)

- L'enveloppe porte `sentence_provenance` (déjà produit par le modèle, déjà exigé par le schéma, déjà vérifié par le validateur — aujourd'hui jeté avant l'envoi) + un catalogue `{fact_id → origin}`.
- `CitableFact` gagne un champ `origin` (enum typée) posé par les adaptateurs (`dayContext`, fact builders, providers). Champ ADDITIF : le validateur ne le lit pas.
- Rendu : quand `sentence_provenance` est présent ET couvre la réponse, le bloc réponse se dessine à partir des segments de provenance, chaque groupe de phrases terminé par un **chip source** (décision owner 07/08 : chip en fin de section — même famille visuelle que la pilule registre ; PAS de renvois numérotés, PAS de hover-only).
- Provenance absente (planchers déterministes, anciens chemins) → rendu strictement identique à aujourd'hui. La pilule « Vérifié · N faits cités » reste inchangée.
- Libellés : UN fichier fr owner-editable (pattern `lib/fr/`), jamais un nom de table, jamais un ID.

## Vocabulaire d'origine — DRAFT, en attente de la liste corrigée owner

« Vos ventes » · « Vos déclarations » · « Vos engagements » · « Vos événements » · « Météo du jour » · « Calendrier » · « Veille concurrence » · « Événements à proximité » · « Tourisme régional » · « Transports » · « Affluence estimée » (BestTime, nommée estimation) · « Bonnes pratiques ». (« Web (source) » n'arrive qu'à l'étape 5.)

## FRONTIÈRE DE NON-RÉGRESSION — le générateur de rapport du prompt (exigence owner 07/08)

Trois points de couplage, vérifiés 07/08 :

1. **Raccourci rapport du chat** — `ie-prompt.js:933-997` (`reportPeriodFromText` : « génère le rapport de juin » → redirection `rapport.astro` AVANT tout fetch) et `ie-prompt.js:1609` (CTA « Générer le rapport pour cette période → » sur `out.date_range`). Ces deux branches sont HORS PÉRIMÈTRE : lignes intouchées, re-vérifiées au harnais après le changement.
2. **`family-report.ts:88-89`** appelle le packager en `mode:"grounded_day"` (résumé exécutif, décision D4 « one gate »). L'étape 1 ne change NI schéma NI validateur NI prompt (la provenance est déjà exigée). Si un mot du prompt bouge quand même : lie-bait vert + smoke du résumé exécutif family-report sur f10c3e58, même commit.
3. **`sales-report.ts` / `rapport.astro`** (y compris R1/R2 canaux) : zéro LLM, déterministe — intouché par l'étape 1. À l'étape 3, le contrat `{data, facts, sources}` de chaque provider (dont `channelsData`) reste byte-identique — harnais canaux (18 assertions données réelles) rejoué avant merge.

## Portes de merge

- `npx vitest run src/lib/ai/contracts/ src/lib/ai/honestAbsence.test.ts` (lie-bait) vert — toute fabrication plantée rejette ou plancher.
- `card-harness.html` sur payloads réels f10c3e58 (le harnais EST la page) : chips rendus, pilule intacte, planchers sans chips inchangés, gras/listes/chips de clarification intacts.
- Bump cache-busters `ie-prompt.js` + `card-kit.js` sur `prompt.astro`.
- Test d'acceptation owner : 5 vraies questions sur f10c3e58 via l'URL Explorer exacte ; chaque chip doit résoudre vers un fait cassable en une ligne ; premise-check de juillet intact.

## Interdits (rappel, valables sur les 5 étapes)

Aucune relaxation de grounding sans lie-bait dans le même commit ; `PREDICTED_OUTCOME` jamais déverrouillé ; tier seulement sur `measured`/`observed_difference`, jamais défaulté ; reject-never-warn + planchers ; pas de streaming de texte non validé (le typewriter 26 ms/mot reste) ; le modèle n'introduit jamais un fait.
