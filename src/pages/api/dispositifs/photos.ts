// /api/dispositifs/photos — les photos des composants d'un dispositif permanent (spec
// docs/dispositifs-typologie-spec.md § 5.1-5.3, owner 03/09, incrément 1 de l'étape 4).
//
//   GET  ?dispositif_id=&version_no=   → la dernière photo lue par composant (+ url de l'image)
//   GET  ?dispositif_id=&file=<photo_id> → l'image elle-même (proxy authentifié — le bucket est privé,
//                                       rien n'est signé ni public)
//        &variant=band|square          → la variante à la taille de la surface (11/09 : bande 16:7 des
//                                       cartes, vignette carrée) ; absente = l'image entière ; une
//                                       variante manquante rend l'entière (cache court). Un photo_id
//                                       n'est jamais réécrit : cache immuable d'un an.
//   POST {action: "confirm", dispositif_id, photo_id, items_confirmed: [item_code]}
//        → une NOUVELLE ligne de la même photo avec les articles confirmés (append-only, la
//          dernière gagne) ; codes hors liste du site écartés. items_confirmed prime partout.
//   POST {dispositif_id, version_no, component_key, image_base64, content_type, fixture_no?}
//        → écrit l'objet, LIT la photo (une consigne + un schéma générés depuis le registre,
//          une porte qui rejette toute clé hors registre et tout code hors liste), écrit la ligne.
//          Personne visible → l'objet est EFFACÉ, aucune ligne, réponse rejected: "person".
//          v2 (owner 11/09) : toute photo dit aussi l'exposition du composant (cinq mots owner), ses
//          niveaux (rayonnage seulement) et les familles présentes parmi les familles
//          vendues du site (kpiRegistry.listSiteFamilies, 50 — le même foyer que evenement.ts et
//          commitments/index.ts ; site sans vente → question non posée, tableau vide) ; le numéro
//          sur le plan (fixture_no, entier > 0) vient du corps de la requête, jamais de l'image.
//
// Le dispositif et son site sont résolus par la couche SEMANTIC (vue mémoire), jamais par la
// table analytics. Écriture = owner du site (requireLocationOwnership) ; lecture = owner ou
// membre (requireLocationAccess).
import type { APIRoute } from "astro";
import { parseScope, serializeScope, scopeFromConfirmedPhotos } from "../../../lib/commitments/measuredScope";
import { readMergeWrite, readLatestSnapshot } from "../../../lib/commitments/actionCommitments";
import { makeBQClient } from "../../../lib/bq";
import { requireLocationOwnership, requireLocationAccess } from "../../../lib/requireLocationOwnership";
import { readComponents, dispositifTypeLabelFr, checklistFor, expositionLabelFr } from "../../../lib/dispositifs/dispositifTypes";
import { listSiteFamilies } from "../../../lib/kpi/kpiRegistry";
import { resolveMemberNames } from "../../../lib/dispositifs/poleActivity";
import {
  PHOTO_MAX_BYTES, makeStorageClient, photoObjectPath, photoGcsUri, putPhotoObject, deletePhotoObject, putPhotoVariants, getPhotoVariant, parsePhotoVariant,
  insertPhotoRow, listPhotoRows, latestPerComponent, photosDuComposant, listSiteItems, withConfirmedItems, photoApiUrl, type PhotoRow,
  PHOTO_BUCKET, photoVariantPath,
} from "../../../lib/dispositifs/dispositifPhotos";
import { changementDePhoto, dernierePhotoDuComposant } from "../../../lib/dispositifs/photoChangement";
import { planDeRetrait, type VersionDuDispositif } from "../../../lib/dispositifs/photoRetrait";
import { createPermanentPole } from "../../../lib/dispositifs/poleCreate";
import { listSpaceMeasures, currentMeasures } from "../../../lib/dispositifs/spaceMeasures";
import { photoChangementFr, type RaisonDeVersion } from "../../../lib/commitments/commitmentCopy";
import { PHOTO_PROMPT_VERSION, photoQuestions, photoExtractionSchema, photoExtractionSystem } from "../../../lib/ai/photoExtraction";
import { validatePhotoExtraction } from "../../../lib/ai/contracts/photoExtractionChecks";
import { callClaudeMessagesAPI } from "../../../lib/ai/runtime/claude";
import { modelFor } from "../../../lib/ai/models";
import { planDeDeplacement, STATUT_DEPLACEE, type MeublePourDeplacement } from "../../../lib/dispositifs/photoDeplacement";
import { randomUUID } from "node:crypto";

export const prerender = false;
const BQ_PROJECT = process.env.BQ_PROJECT_ID || "muse-square-open-data";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);

// Le dispositif tel que la couche semantic le connaît : site, version courante, composants.
async function readDispositif(bq: any, dispositif_id: string, version_no: number | null) {
  const rows = await bq.query({
    query: `SELECT commitment_id, location_id, version_no, components, measured_scope
            FROM \`${BQ_PROJECT}.semantic.vw_insight_event_commitment_memory\`
            WHERE dispositif_id = @d AND dispositif_nature = 'permanent'
            ORDER BY version_no DESC LIMIT 20`,
    params: { d: dispositif_id }, location: "EU",
  }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(() => []);
  if (!rows.length) return null;
  const pick = version_no != null ? rows.find((r: any) => Number(flat(r.version_no)) === version_no) : rows[0];
  if (!pick) return null;
  return {
    commitment_id: String(flat(pick.commitment_id)),
    location_id: String(flat(pick.location_id)),
    version_no: Number(flat(pick.version_no)),
    // 13/09 — la version COURANTE du dispositif, que la requête en ait demandé une autre ou non : le
    // versionning automatique ne part que depuis elle. Une page restée ouverte sur une version périmée
    // documente cette version-là ; elle n'en crée jamais une sœur.
    current_version_no: Number(flat(rows[0].version_no)),
    components: readComponents(flat(pick.components)),
    measured_scope: pick.measured_scope != null ? String(flat(pick.measured_scope)) : null,   // P4 : le périmètre de la version
  };
}

// Les versions du dispositif, telles que la couche semantic les connaît — ce dont le RETRAIT a besoin
// pour savoir si la version née d'une photo tombe avec elle. Même vue que readDispositif ; jamais la
// table analytics en lecture (la suppression, elle, écrit côté producteur).
async function readVersions(bq: any, dispositif_id: string): Promise<VersionDuDispositif[]> {
  const rows = await bq.query({
    query: `SELECT commitment_id, version_no
            FROM \`${BQ_PROJECT}.semantic.vw_insight_event_commitment_memory\`
            WHERE dispositif_id = @d AND dispositif_nature = 'permanent'
            ORDER BY version_no DESC LIMIT 50`,
    params: { d: dispositif_id }, location: "EU",
  }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(() => []);
  return (rows as any[]).map((r) => ({ commitment_id: String(flat(r.commitment_id)), version_no: Number(flat(r.version_no)) }));
}

// L'adresse de l'image : le foyer est dans la lib (l'historique du dispositif la rend aussi, 13/09).
const photoUrl = photoApiUrl;

// La photo telle que la page la rend : les QUESTIONS du registre (clé + libellé) pour lire la
// check-list, et la désignation des articles reconnus (jamais un code nu à l'écran).
function publicRow(r: PhotoRow, itemsByCode: Record<string, string>, auteurs: Record<string, string> = {}, nomsDeMeuble: Record<string, string> = {}) {
  // 15/09 — UNE MARQUE N'EST PAS UNE PHOTO. Une ligne « déplacée » dit qu'il n'y a plus rien ici et où
  // la photo est partie : elle ne porte donc PAS d'`url`. Sans ce point, la page recevait une adresse
  // d'image pour une place vide et l'aurait affichée (mesuré au vrai endpoint : « statut déplacée ·
  // url oui »). Le NOM de la destination vient de la base, jamais recomposé (CLAUDE.md, 15/09).
  const partie = r.status === "déplacée";
  return {
    photo_id: r.photo_id, dispositif_id: r.dispositif_id, version_no: r.version_no, component_key: r.component_key,
    url: partie ? null : photoUrl(r.dispositif_id, r.photo_id), status: r.status, checklist: r.checklist,
    deplacee_vers: r.deplacee_vers ?? null,
    deplacee_vers_nom: r.deplacee_vers ? (nomsDeMeuble[r.deplacee_vers] ?? null) : null,
    questions: r.dispositif_type ? checklistFor(r.dispositif_type, r.dispositif_role).map((q) => ({ key: q.key, question_fr: q.question_fr })) : [],
    items_matched: (r.items_matched ?? []).map((it) => ({ ...it, item_description: itemsByCode[it.item_code] ?? null })),
    items_confirmed: r.items_confirmed ? r.items_confirmed.map((it) => ({ ...it, item_description: itemsByCode[it.item_code] ?? null })) : null,
    prices_seen: r.prices_seen, coverage_flag: r.coverage_flag, created_at: r.created_at,
    // 13/09 (owner, légende A) : l'auteur s'affiche par son NOM (resolveMemberNames) ; un identifiant ne
    // sort jamais à l'écran, et un auteur hors roster rend null — la légende l'omet.
    created_by_name: (r.created_by && auteurs[r.created_by]) || null,
    dispositif_type: r.dispositif_type, dispositif_type_label_fr: r.dispositif_type ? dispositifTypeLabelFr(r.dispositif_type) : null,
    // v2 (11/09) : l'exposition et son libellé (registre), les niveaux, les familles, le numéro sur le plan.
    exposition: r.exposition, exposition_label_fr: r.exposition ? expositionLabelFr(r.exposition) : null,
    levels: r.levels, families_present: r.families_present ?? [], fixture_no: r.fixture_no,
  };
}
const byCode = (items: Array<{ item_code: string; item_description: string }>): Record<string, string> =>
  Object.fromEntries(items.map((i) => [i.item_code, i.item_description]));

// ── 13/09 — LA VERSION SUIVANTE, EN ARRIÈRE-PLAN (owner : « on devrait le faire dans le background et
// ensuite le user peut éditer si il veut → Si photo change, versionning change »).
// Le déclencheur est PUR et testé (lib/dispositifs/photoChangement) ; ici, l'écriture. Tout est HÉRITÉ
// par le chemin unique de création d'un pôle (createPermanentPole avec parent_commitment_id : familles,
// composants, responsable, pourquoi, ressources, périmètre de mesure). Les MESURES D'ESPACE, elles,
// vivent à part et ne s'héritent pas toutes seules — sans ce report, la version nouvelle perdrait la
// Part de linéaire et le CA par mètre que la page affiche. On les RECOPIE telles quelles.
async function versionSuivanteDepuisPhoto(
  bq: any, userId: string,
  disp: { commitment_id: string; location_id: string; version_no: number },
  dispositif_id: string,
): Promise<{ commitment_id: string; version_no: number } | null> {
  const parent = await readLatestSnapshot(bq, disp.commitment_id);
  if (!parent) return null;
  const nom = String((parent as any).committed_action_text ?? "").trim();
  if (!nom) return null;                       // sans nom de pôle, createPermanentPole refuse — on ne force rien
  // Les mesures en vigueur de la version courante, recopiées à l'identique.
  const enCours = await listSpaceMeasures(disp.location_id, dispositif_id)
    .then((rows) => currentMeasures(rows).filter((m) => m.version_no === disp.version_no))
    .catch(() => []);
  const comps = enCours.filter((m) => m.component_key).map((m) => ({
    component_key: m.component_key as string, fixture_no: m.fixture_no, deplacee_vers: null,
    length_m: m.length_m, depth_m: m.depth_m, faces: m.faces, families_share: m.families_share,
  }));
  const surface = enCours.find((m) => !m.component_key)?.surface_m2 ?? null;
  const sources = new Set(enCours.map((m) => m.source));
  const res = await createPermanentPole(bq, userId, {
    location_id: disp.location_id,
    committed_action_text: nom,
    parent_commitment_id: disp.commitment_id,
    // Rien d'autre : chaque champ absent est hérité du parent (poleCreate).
    ...(comps.length || surface != null
      ? { space_measures: { components: comps, ...(surface != null ? { surface_m2: surface } : {}), source: sources.size === 1 ? [...sources][0] : "saisie" } }
      : {}),
  });
  if (res.status !== 200 || !res.body?.ok) {
    console.error("[dispositifs/photos] version suivante non créée", res.status, res.body?.error);
    return null;
  }
  return { commitment_id: String(res.body.commitment_id), version_no: Number(res.body.version_no) };
}

export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const dispositif_id = String(url.searchParams.get("dispositif_id") || "").trim();
    if (!dispositif_id) return json({ ok: false, error: "dispositif_id requis" }, 400);
    const bq = makeBQClient(BQ_PROJECT);
    const disp = await readDispositif(bq, dispositif_id, null);
    if (!disp) return json({ ok: false, error: "dispositif introuvable" }, 404);
    requireLocationAccess(locals, disp.location_id);

    const file = String(url.searchParams.get("file") || "").trim();
    if (file) {
      if (!/^[a-zA-Z0-9-]{8,64}$/.test(file)) return json({ ok: false, error: "file invalide" }, 400);
      const variant = parsePhotoVariant(url.searchParams.get("variant"));
      if (!variant) return json({ ok: false, error: "variant invalide (full, band, square)" }, 400);
      const rows = await listPhotoRows(bq, dispositif_id);
      const row = rows.find((r) => r.photo_id === file);
      if (!row) return json({ ok: false, error: "photo introuvable" }, 404);
      const got = await getPhotoVariant(makeStorageClient(), row.location_id, row.dispositif_id, row.photo_id, variant);
      const cache = got.variant === variant ? "private, max-age=31536000, immutable" : "private, max-age=300";
      return new Response(new Uint8Array(got.bytes), { status: 200, headers: { "content-type": got.contentType, "cache-control": cache } });
    }

    const vParam = url.searchParams.get("version_no");
    const version_no = vParam != null && vParam !== "" ? Number(vParam) : null;
    // 14/09 (point 4) — TOUTES les lignes, en UNE requête, puis les deux lectures en sont dérivées :
    // celle de la version demandée (contrat inchangé) et l'historique de chaque composant. La requête
    // filtrée par version coûtait le même aller-retour et jetait le reste.
    const [toutes, items] = await Promise.all([
      listPhotoRows(bq, dispositif_id),
      listSiteItems(bq, disp.location_id),
    ]);
    const rows = Number.isFinite(version_no as number) ? toutes.filter((r) => r.version_no === version_no) : toutes;
    const codes = byCode(items);
    // Les noms d'auteur — une seule résolution, et seulement si au moins une photo en porte un.
    const lues = latestPerComponent(rows);
    const auteurs = toutes.some((r) => r.created_by)
      ? await resolveMemberNames(bq, disp.location_id).catch(() => ({} as Record<string, string>))
      : {};
    // 14/09 (owner : « photos avec accès aux versions précédentes ») — CHAQUE photo emporte SES
    // précédentes. Le tableau `photos` garde exactement son contrat (une par composant), donc la page
    // ne change pas : c'est un AJOUT, jamais un remplacement. Mesuré le 14/09 : les 7 pôles du compte
    // sont en version 1, l'« Historique du dispositif » ne s'affiche donc sur aucun — sans ceci, toute
    // photo antérieure serait écrite et inatteignable.
    const parComposant = photosDuComposant(toutes.filter((r) => r.status === "read"));
    // 15/09 — LES NOMS DES MEUBLES, lus en base, pour la phrase de la place quittée (« vous l'avez
    // déplacée sur le N° 7 — Vin & Spiritueux »). Une seule lecture, et seulement s'il y a une marque
    // à nommer : une page sans déplacement ne paie rien.
    const aNommer = [...new Set(lues.filter((r) => r.deplacee_vers).map((r) => String(r.deplacee_vers)))];
    const nomsDeMeuble: Record<string, string> = {};
    if (aNommer.length) {
      const nm = await bq.query({
        query: `SELECT component_key, ANY_VALUE(component_label) AS nom
                FROM \`${BQ_PROJECT}.semantic.vw_insight_event_dispositif_components\`
                WHERE location_id = @l AND component_key IN UNNEST(@k) GROUP BY 1`,
        params: { l: disp.location_id, k: aNommer }, types: { l: "STRING", k: ["STRING"] }, location: "EU",
      }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(() => []);
      for (const r of nm as any[]) {
        const k = r.component_key && typeof r.component_key === "object" ? r.component_key.value : r.component_key;
        const n = r.nom && typeof r.nom === "object" ? r.nom.value : r.nom;
        if (k && n) nomsDeMeuble[String(k)] = String(n);
      }
    }
    return json({
      ok: true, dispositif_id, version_no: version_no ?? disp.version_no,
      photos: lues.map((r) => ({
        ...publicRow(r, codes, auteurs, nomsDeMeuble),
        precedentes: (parComposant[r.component_key] ?? [])
          .filter((x: PhotoRow) => x.photo_id !== r.photo_id)
          .map((x: PhotoRow) => publicRow(x, codes, auteurs)),
      })),
    });
  } catch (e: any) {
    const msg = String(e?.message || e);
    return json({ ok: false, error: msg }, msg.startsWith("FORBIDDEN") ? 403 : 500);
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const userId = (locals as any)?.clerk_user_id ? String((locals as any).clerk_user_id) : null;
    if (!userId) return json({ ok: false }, 401);
    const body = await request.json().catch(() => null);
    if (!body) return json({ ok: false, error: "Champs requis manquants" }, 400);
    const dispositif_id = String(body.dispositif_id || "").trim();

    // ── ANNULER UN DÉPLACEMENT (owner 15/09) — le MÊME geste, dans l'autre sens. On repart de la
    // MARQUE laissée à la place quittée : elle dit où la photo est allée, et elle porte l'image de la
    // photo partie. On retrouve cette photo à sa destination PAR SON IMAGE, jamais par « la dernière
    // d'ici » : si l'exploitant en a pris une autre depuis, c'est elle qui serait revenue.
    if (String(body.action || "") === "annuler_deplacement") {
      const marque_id = String(body.photo_id || "").trim();
      if (!dispositif_id || !marque_id) return json({ ok: false, error: "dispositif_id, photo_id requis" }, 400);
      const bqA = makeBQClient(BQ_PROJECT);
      const dispA = await readDispositif(bqA, dispositif_id, null);
      if (!dispA) return json({ ok: false, error: "dispositif introuvable" }, 404);
      requireLocationOwnership(locals, dispA.location_id);
      const toutesA = await listPhotoRows(bqA, dispositif_id);
      const marque = toutesA.find((r) => r.photo_id === marque_id && r.status === "déplacée") || null;
      if (!marque || !marque.deplacee_vers) return json({ ok: false, refus: "marque_introuvable" }, 404);
      const partie = latestPerComponent(toutesA.filter((r) => r.version_no === marque.version_no && r.status === "read"))
        .find((r) => r.component_key === marque.deplacee_vers && r.gcs_uri === marque.gcs_uri) || null;
      if (!partie) return json({ ok: false, refus: "photo_deja_remplacee" }, 409);
      const quandA = new Date().toISOString();
      // CE QUE LA DESTINATION RETROUVE. Elle avait peut-être SA PROPRE photo avant que celle-ci n'y
      // arrive : la lui rendre, plutôt que de la marquer « déplacée » — sa photo à elle n'a jamais
      // bougé. Défaut trouvé en jouant l'aller-retour sur le compte réel, pas à la relecture : après
      // annulation, le composant d'arrivée annonçait « vous l'avez déplacée sur le N° 4 » pour une
      // photo qui était la sienne depuis le début. Sans photo d'avant, la marque, comme prévu.
      const sienneAvant = toutesA
        .filter((r) => r.component_key === marque.deplacee_vers && r.version_no === marque.version_no
                    && r.status === "read" && r.gcs_uri !== marque.gcs_uri)
        .sort((x, y) => (x.created_at < y.created_at ? 1 : -1))[0] || null;
      await insertPhotoRow(bqA, sienneAvant
        ? { ...sienneAvant, photo_id: randomUUID(), created_at: quandA }
        : {
            ...partie, photo_id: randomUUID(), status: STATUT_DEPLACEE as PhotoRow["status"],
            deplacee_vers: marque.component_key, created_at: quandA,
            items_matched: null, items_confirmed: null, prices_seen: null, checklist: null,
          });
      await insertPhotoRow(bqA, {
        ...partie, photo_id: randomUUID(), dispositif_id: marque.dispositif_id,
        component_key: marque.component_key, fixture_no: marque.fixture_no,
        status: "read", deplacee_vers: null, created_at: quandA,
      });
      return json({ ok: true, revenue_sur: marque.component_key });
    }

    // ── DÉPLACER UNE PHOTO POSÉE SUR LE MAUVAIS MEUBLE (owner 15/09    // ── DÉPLACER UNE PHOTO POSÉE SUR LE MAUVAIS MEUBLE (owner 15/09 : « déplacer la photo ») ────────
    // Même patron que « Retirer → » : `dry: true` rend le PLAN sans rien toucher — c'est ce que la page
    // demande au premier toucher, pour dire vers quel meuble le numéro pointe et si la photo change de
    // pôle. Le second toucher repasse ici sans `dry`. La règle vit dans `photoDeplacement.ts` et nulle
    // part ailleurs : cette route l'EXÉCUTE.
    //
    // DEUX ÉCRITURES, et l'ordre compte. La MARQUE d'abord à la place quittée, la photo ensuite à sa
    // nouvelle place : si la seconde échoue, la page montre une place vide et un message — état
    // réparable. Dans l'autre ordre, un échec laisserait la photo AUX DEUX endroits, ce qui est
    // exactement le défaut que la marque existe pour empêcher.
    if (String(body.action || "") === "deplacer") {
      const photo_id = String(body.photo_id || "").trim();
      if (!dispositif_id || !photo_id) return json({ ok: false, error: "dispositif_id, photo_id requis" }, 400);
      const bqD = makeBQClient(BQ_PROJECT);
      const dispD = await readDispositif(bqD, dispositif_id, null);
      if (!dispD) return json({ ok: false, error: "dispositif introuvable" }, 404);
      requireLocationOwnership(locals, dispD.location_id);

      // LES MEUBLES DU SITE ENTIER, avec le NOM que porte la base (`component_label`) — jamais un nom
      // recomposé (CLAUDE.md, 15/09). Le site entier et pas le seul pôle : un numéro peut désigner un
      // meuble d'un autre pôle, et c'est précisément le cas qu'il faut savoir annoncer.
      const [photosD, meublesRows] = await Promise.all([
        listPhotoRows(bqD, dispositif_id),
        bqD.query({
          query: `SELECT m.component_key, m.fixture_no, m.dispositif_id, ANY_VALUE(m.length_m) AS length_m,
                         ANY_VALUE(vc.component_label) AS nom, ANY_VALUE(vc.committed_action_text) AS pole_label
                  FROM (SELECT * EXCEPT(rn) FROM (
                          SELECT dispositif_id, component_key, fixture_no, length_m,
                                 ROW_NUMBER() OVER (PARTITION BY dispositif_id, component_key ORDER BY created_at DESC) rn
                          FROM \`${BQ_PROJECT}.analytics.space_measures\`
                          WHERE location_id = @l AND component_key IS NOT NULL) WHERE rn = 1) m
                  LEFT JOIN \`${BQ_PROJECT}.semantic.vw_insight_event_dispositif_components\` vc
                         ON vc.location_id = @l AND vc.dispositif_id = m.dispositif_id AND vc.component_key = m.component_key
                  WHERE m.fixture_no IS NOT NULL
                  GROUP BY 1, 2, 3`,
          params: { l: dispD.location_id }, types: { l: "STRING" }, location: "EU",
        }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(() => []),
      ]);
      const fl = (x: any): any => (x && typeof x === "object" && "value" in x ? x.value : x);
      const meubles: MeublePourDeplacement[] = (meublesRows as any[]).map((r) => ({
        component_key: String(fl(r.component_key)),
        fixture_no: fl(r.fixture_no) == null ? null : Number(fl(r.fixture_no)),
        nom: String(fl(r.nom) ?? "").trim(),
        pole_label: String(fl(r.pole_label) ?? "").trim(),
        dispositif_id: String(fl(r.dispositif_id)),
      }));

      // 15/09 (owner : « la liste avec photos d'abord ») — SANS NUMÉRO DEMANDÉ, LA ROUTE REND LA LISTE
      // DES CIBLES, chacune avec SA DERNIÈRE PHOTO. Mesuré ce jour-là : les numéros ne sont écrits nulle
      // part dans le magasin (le plan de l'owner n'en porte aucun), et 40 des 52 libellés sont ambigus
      // — six « Vin & Spiritueux » dans la Cave. Un exploitant ne reconnaît pas une étagère à un code,
      // il la reconnaît à son image. Le numéro reste accepté comme raccourci, il n'est plus le chemin.
      //
      // LA DERNIÈRE PHOTO SE LIT SUR TOUT LE SITE, pas sur le seul pôle courant : une photo mal classée
      // peut appartenir à un autre pôle, et c'est justement le cas qu'on veut pouvoir corriger.
      if (body.dry && (body.vers_fixture_no == null || String(body.vers_fixture_no).trim() === "")) {
        const vues = await bqD.query({
          query: `SELECT dispositif_id, component_key, photo_id FROM (
                    SELECT dispositif_id, component_key, photo_id,
                           ROW_NUMBER() OVER (PARTITION BY dispositif_id, component_key ORDER BY created_at DESC) rn
                    FROM \`${BQ_PROJECT}.analytics.dispositif_photos\`
                    WHERE location_id = @l AND status = 'read') WHERE rn = 1`,
          params: { l: dispD.location_id }, types: { l: "STRING" }, location: "EU",
        }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(() => []);
        const photoDe = new Map<string, { dispositif_id: string; photo_id: string }>();
        for (const r of vues as any[]) {
          photoDe.set(String(fl(r.component_key)), { dispositif_id: String(fl(r.dispositif_id)), photo_id: String(fl(r.photo_id)) });
        }
        const source = photosD.find((r) => r.photo_id === photo_id) || null;
        // La longueur de façade sert à départager deux composants de même libellé — mesuré : 40 des
        // 52 le sont (six « Vin & Spiritueux » dans la Cave).
        const longueurDe = new Map<string, number>();
        for (const r of meublesRows as any[]) {
          const l = fl(r.length_m);
          if (l != null) longueurDe.set(String(fl(r.component_key)), Number(l));
        }
        const cibles = meubles
          .filter((m) => m.component_key !== source?.component_key)   // sa place actuelle n'est pas une cible
          .map((m) => {
            const ph = photoDe.get(m.component_key) || null;
            const lm = longueurDe.get(m.component_key);
            return {
              component_key: m.component_key, fixture_no: m.fixture_no, nom: m.nom,
              pole_label: m.pole_label, dispositif_id: m.dispositif_id,
              photo_url: ph ? photoUrl(ph.dispositif_id, ph.photo_id) : null,
              length_m: lm != null ? lm : null,
              change_de_pole: !!(source && m.pole_label && m.pole_label !== (meubles.find((x) => x.component_key === source.component_key)?.pole_label || "")),
            };
          })
          .sort((a2, b2) => (a2.pole_label === b2.pole_label ? (a2.fixture_no ?? 0) - (b2.fixture_no ?? 0) : a2.pole_label.localeCompare(b2.pole_label, "fr")));
        return json({ ok: true, cibles, depuis_pole: meubles.find((x) => x.component_key === source?.component_key)?.pole_label ?? null });
      }

      const res = planDeDeplacement({ photo_id, vers_fixture_no: body.vers_fixture_no, photos: photosD, meubles });
      if (!res.ok) return json({ ok: false, refus: res.refus }, res.refus === "photo_introuvable" ? 404 : 400);
      if (body.dry) return json({ ok: true, plan: res.plan });

      const source = photosD.find((r) => r.photo_id === photo_id)!;
      const quand = new Date().toISOString();
      // 1. LA MARQUE, à la place quittée. Ce n'est pas une photo : son statut le dit, et la lecture
      //    (dernière ligne par version × composant) cesse d'y montrer quoi que ce soit.
      await insertPhotoRow(bqD, {
        ...source, photo_id: randomUUID(), status: STATUT_DEPLACEE as PhotoRow["status"],
        deplacee_vers: res.plan.vers.component_key, created_at: quand,
        items_matched: null, items_confirmed: null, prices_seen: null, checklist: null,
      });
      // 2. LA PHOTO, à sa nouvelle place. Elle garde son image, ses articles lus et son heure de prise
      //    de vue — c'est la MÊME photo ; seul le meuble change, et le pôle avec lui s'il diffère.
      await insertPhotoRow(bqD, {
        ...source, photo_id: randomUUID(),
        dispositif_id: res.plan.vers.dispositif_id,
        component_key: res.plan.vers.component_key,
        fixture_no: res.plan.vers.fixture_no,
        status: "read", deplacee_vers: null, created_at: quand,
      });
      return json({ ok: true, plan: res.plan });
    }

    // ── RETIRER UNE PHOTO (owner 14/09    // ── RETIRER UNE PHOTO (owner 14/09 : « fais du retrait une action de la page du pôle ») ──────────
    // `dry: true` rend le PLAN sans rien toucher : c'est ce que la page demande au premier toucher de
    // « Retirer → », pour dire à l'exploitant dans quel état son pôle va se retrouver. Le second
    // toucher (« Confirmer → ») repasse ici sans `dry`. La règle vit dans `photoRetrait.ts` et nulle
    // part ailleurs — cette route l'EXÉCUTE, elle ne la recalcule pas.
    // Ordre d'exécution : le BUCKET d'abord (une ligne sans image reste réparable ; une image sans sa
    // ligne est un orphelin facturé qu'on ne retrouvera plus), la base ensuite.
    if (String(body.action || "") === "retirer") {
      const photo_id = String(body.photo_id || "").trim();
      if (!dispositif_id || !photo_id) return json({ ok: false, error: "dispositif_id, photo_id requis" }, 400);
      const bqR = makeBQClient(BQ_PROJECT);
      const dispR = await readDispositif(bqR, dispositif_id, null);
      if (!dispR) return json({ ok: false, error: "dispositif introuvable" }, 404);
      requireLocationOwnership(locals, dispR.location_id);
      const [rowsR, versionsR] = await Promise.all([listPhotoRows(bqR, dispositif_id), readVersions(bqR, dispositif_id)]);
      const plan = planDeRetrait({ photo_id, photos: rowsR, versions: versionsR });
      if (!plan) return json({ ok: false, error: "photo introuvable" }, 404);
      if (body.dry) return json({ ok: true, plan });

      const storageR = makeStorageClient();
      let objets = 0;
      for (const v of plan.variantes) {
        const chemin = photoVariantPath(plan.location_id, plan.dispositif_id, plan.photo_id, v);
        try { await storageR.bucket(PHOTO_BUCKET).file(chemin).delete(); objets += 1; }
        catch (e: any) { if (String(e?.code) !== "404") console.error("[dispositifs/photos] objet non retiré", chemin, String(e?.message || e)); }
      }
      await bqR.query({
        query: `DELETE FROM \`${BQ_PROJECT}.analytics.dispositif_photos\` WHERE location_id = @l AND photo_id = @p`,
        params: { l: plan.location_id, p: plan.photo_id }, location: "EU",
      });
      // La version née de cette photo tombe avec elle, ET SEULEMENT dans ce cas (le plan l'a établi :
      // version > 1, aucune autre photo dedans). Ses mesures d'espace recopiées partent aussi — sinon
      // elles resteraient attachées à une version qui n'existe plus.
      if (plan.version) {
        await bqR.query({
          query: `DELETE FROM \`${BQ_PROJECT}.analytics.space_measures\` WHERE location_id = @l AND dispositif_id = @d AND version_no = @v`,
          params: { l: plan.location_id, d: plan.dispositif_id, v: plan.version.version_no }, location: "EU",
        });
        await bqR.query({
          query: `DELETE FROM \`${BQ_PROJECT}.analytics.action_commitments\` WHERE location_id = @l AND commitment_id = @c AND version_no > 1`,
          params: { l: plan.location_id, c: plan.version.commitment_id }, location: "EU",
        });
      }
      // Ce que la page affiche ensuite pour ce composant : RELU en base, jamais déduit du plan.
      const [apres, itemsR] = await Promise.all([
        listPhotoRows(bqR, dispositif_id).catch(() => [] as PhotoRow[]),
        listSiteItems(bqR, plan.location_id).catch(() => [] as Array<{ item_code: string; item_description: string }>),
      ]);
      const versionApres = plan.version ? plan.version_no - 1 : plan.version_no;
      const courante = latestPerComponent(apres.filter((r) => r.version_no === versionApres))
        .find((r) => r.component_key === plan.component_key) || null;
      // Quand la version tombe, la page courante peut être CELLE DE CETTE VERSION : son adresse
      // n'existe plus après le retrait. La route rend donc la version qui survit, pour que la page
      // sache où aller — jamais une adresse devinée côté client.
      const survivante = plan.version
        ? (versionsR.find((v) => v.version_no === plan.version_no - 1) || null)
        : null;
      return json({
        ok: true, plan, objets_retires: objets,
        version_retiree: plan.version ? plan.version.version_no : null,
        version_courante_apres: survivante,
        photo: courante ? publicRow(courante, byCode(itemsR)) : null,
      });
    }

    // ── Confirmation des articles (incrément 2a, 03/09) ──
    if (String(body.action || "") === "confirm") {
      const photo_id = String(body.photo_id || "").trim();
      if (!dispositif_id || !photo_id || !Array.isArray(body.items_confirmed)) return json({ ok: false, error: "dispositif_id, photo_id, items_confirmed requis" }, 400);
      const bq0 = makeBQClient(BQ_PROJECT);
      const disp0 = await readDispositif(bq0, dispositif_id, null);
      if (!disp0) return json({ ok: false, error: "dispositif introuvable" }, 404);
      requireLocationOwnership(locals, disp0.location_id);
      const [rows0, items0] = await Promise.all([listPhotoRows(bq0, dispositif_id), listSiteItems(bq0, disp0.location_id)]);
      const current = rows0.find((r) => r.photo_id === photo_id);
      if (!current) return json({ ok: false, error: "photo introuvable" }, 404);
      const confirmed = withConfirmedItems(current, body.items_confirmed.map((c: any) => String(c)), items0.map((i) => i.item_code), new Date().toISOString());
      await insertPhotoRow(bq0, confirmed);
      // P4 (owner 07/09, D3 — docs/dispositif-perimetre-mesure-spec.md) : une photo confirmée = un
      // périmètre sans rien saisir. L'union des articles confirmés des dernières photos par composant
      // de CETTE version devient measured_scope { articles } — sauf familles ou pôle choisis à la main.
      let measured_scope_changed = false;
      try {
        const versionRows = rows0.filter((r) => r.version_no === disp0.version_no && r.photo_id !== photo_id).concat([confirmed]);
        const next = scopeFromConfirmedPhotos(versionRows, parseScope(disp0.measured_scope));
        if (next.changed && disp0.commitment_id) {
          await readMergeWrite(bq0, { commitmentId: disp0.commitment_id, transitionType: "edited", create: false, patch: { measured_scope: serializeScope(next.scope) } as any });
          measured_scope_changed = true;
        }
      } catch (e: any) { console.warn("[photos] measured_scope non mis à jour:", e?.message); }
      return json({ ok: true, photo: publicRow(confirmed, byCode(items0)), measured_scope_changed });
    }

    const component_key = String(body.component_key || "").trim();
    const version_no = body.version_no != null && Number.isFinite(Number(body.version_no)) ? Number(body.version_no) : null;
    const content_type = String(body.content_type || "image/jpeg");
    const b64 = typeof body.image_base64 === "string" ? body.image_base64.replace(/^data:[^;]+;base64,/, "") : "";
    if (!dispositif_id || !component_key || !b64) return json({ ok: false, error: "dispositif_id, component_key, image_base64 requis" }, 400);
    if (!["image/jpeg", "image/png", "image/webp"].includes(content_type)) return json({ ok: false, error: "content_type non accepté (jpeg, png, webp)" }, 400);
    const bytes = Buffer.from(b64, "base64");
    if (!bytes.length || bytes.length > PHOTO_MAX_BYTES) return json({ ok: false, error: `image vide ou trop lourde (max ${Math.round(PHOTO_MAX_BYTES / 1e6 * 10) / 10} Mo après réduction)` }, 413);
    // Le numéro du composant sur le plan : facultatif ; s'il est donné, un entier > 0 — jamais lu sur l'image.
    // 14/09 (spec § 9 point 4) — LA MARCHE D'OÙ VIENT LA PHOTO. Les trois colonnes existaient depuis
    // le début et restaient vides : remplies, elles rendent l'ORDRE du parcours et les voisinages
    // (composant A → composant B) sans table de plus. Facultatives : une photo prise à la main depuis
    // la page du pôle n'appartient à aucune marche.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let walk_id: string | null = null;
    if (body.walk_id != null && String(body.walk_id).trim() !== "") {
      const w = String(body.walk_id).trim();
      if (!UUID_RE.test(w)) return json({ ok: false, error: "walk_id : un identifiant de marche" }, 400);
      walk_id = w;
    }
    let seq: number | null = null;
    if (body.seq != null && String(body.seq).trim() !== "") {
      const n = Number(body.seq);
      if (!Number.isInteger(n) || n < 1 || n > 10_000) return json({ ok: false, error: "seq : un entier positif" }, 400);
      seq = n;
    }
    let t_offset_s: number | null = null;
    if (body.t_offset_s != null && String(body.t_offset_s).trim() !== "") {
      const n = Number(body.t_offset_s);
      if (!Number.isFinite(n) || n < 0 || n > 86_400) return json({ ok: false, error: "t_offset_s : des secondes depuis le début" }, 400);
      t_offset_s = Math.round(n * 10) / 10;
    }

    let fixture_no: number | null = null;
    if (body.fixture_no != null && String(body.fixture_no).trim() !== "") {
      const n = Number(body.fixture_no);
      if (!Number.isInteger(n) || n < 1 || n > 9999) return json({ ok: false, error: "fixture_no : un entier positif" }, 400);
      fixture_no = n;
    }

    const bq = makeBQClient(BQ_PROJECT);
    const disp = await readDispositif(bq, dispositif_id, version_no);
    if (!disp) return json({ ok: false, error: "dispositif introuvable" }, 404);
    requireLocationOwnership(locals, disp.location_id);
    const comp = disp.components.find((c) => c.key === component_key);
    if (!comp) return json({ ok: false, error: "component_key inconnu pour cette version" }, 400);

    // 1. L'objet — écrit d'abord ; effacé si une personne est visible ou si la lecture échoue.
    const photo_id = crypto.randomUUID();
    const path = photoObjectPath(disp.location_id, dispositif_id, photo_id);
    const storage = makeStorageClient();
    const itemsP = listSiteItems(bq, disp.location_id);
    // Les familles réellement vendues du site — le foyer listSiteFamilies (même limite 50 que
    // evenement.ts et commitments/index.ts). Un site sans vente rend [] : la question n'est pas posée.
    const familiesP = listSiteFamilies(bq, disp.location_id, 50).then((f) => f.map((x) => x.category)).catch(() => [] as string[]);
    // 13/09 — la photo précédente de CE composant dans CETTE version : le seul terme de comparaison du
    // déclencheur. Amorcée ici (aucun aller-retour de plus sur le chemin séquentiel), attendue plus bas.
    const precedenteP = listPhotoRows(bq, dispositif_id, disp.version_no)
      .then((rows) => dernierePhotoDuComposant(rows, component_key, disp.version_no))
      .catch(() => null);
    await putPhotoObject(storage, path, bytes, content_type);

    // 2. La lecture — consigne + schéma générés depuis le registre, image en bloc base64.
    const questions = photoQuestions({ type: comp.type, role: comp.role });
    const [items, families] = await Promise.all([itemsP, familiesP]);
    const model = modelFor("packager");
    const call = await callClaudeMessagesAPI({
      model, maxTokens: 2000, timeoutMs: 60_000, cacheSystem: true,
      system: photoExtractionSystem({ type: comp.type, role: comp.role, items, families }, questions),
      userContent: [
        { type: "image", source: { type: "base64", media_type: content_type as any, data: b64 } },
        { type: "text", text: "Remplis le formulaire pour cette photo." },
      ],
      outputSchema: photoExtractionSchema(questions, families),
    });
    let out: any = null;
    if (call.ok && call.rawText) { try { out = JSON.parse(call.rawText.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "")); } catch { out = null; } }
    const gate = validatePhotoExtraction(out, questions.map((q) => q.key), items.map((i) => i.item_code), families);

    // 3. Personne visible → l'image n'existe plus, aucune ligne (déviation acceptée owner 03/09).
    if (gate.rejected_person) {
      await deletePhotoObject(storage, path);
      return json({ ok: false, rejected: "person", error: "Une personne est visible sur la photo — elle n'est pas conservée." }, 422);
    }
    if (!gate.ok) {
      await deletePhotoObject(storage, path);
      return json({ ok: false, rejected: "read", error: "La lecture de la photo a échoué — réessayez.", details: [...(call.errors ?? []), ...gate.errors].slice(0, 6) }, 502);
    }

    // 4. Les variantes (bande des cartes, vignette) — seulement pour une photo gardée, en parallèle de la
    // ligne. Un échec ne perd pas la photo : le proxy sert alors l'entière, et la réponse le dit.
    const variantsP = putPhotoVariants(storage, disp.location_id, dispositif_id, photo_id, bytes)
      .then(() => true)
      .catch((e: any) => { console.error("[dispositifs/photos] variantes non écrites", photo_id, String(e?.message || e)); return false; });

    // 5. La ligne — d'abord telle que la version EN COURS la porterait.
    const row: PhotoRow = {
      photo_id, location_id: disp.location_id, dispositif_id, version_no: disp.version_no, component_key,
      walk_id, seq, t_offset_s, gcs_uri: photoGcsUri(path),
      dispositif_type: comp.type, dispositif_role: comp.role, status: "read",
      deplacee_vers: null,   // une photo qui naît n'a rien quitté
      // 13/09 — les articles viennent de la PORTE (gate.items), jamais de `out` : codes de la liste,
      // confiance connue, et l'étagère ramenée à null quand elle sort des étagères du composant.
      checklist: out.checklist, items_matched: gate.items, items_confirmed: null, prices_seen: out.prices,
      coverage_flag: out.coverage, model, prompt_version: PHOTO_PROMPT_VERSION, created_by: userId, created_at: new Date().toISOString(),
      // v2 : les valeurs NORMALISÉES par la porte (niveaux hors rayonnage → null, familles dédoublonnées).
      exposition: gate.exposition, levels: gate.levels, families_present: gate.families_present, fixture_no,
    };
    // 6. LE VERSIONNING AUTOMATIQUE (owner 13/09 : « Si photo change, versionning change »).
    // La photo est comparée à la dernière du MÊME composant dans la MÊME version ; un écart franc
    // (familles, exposition, étagères — jamais les articles reconnus, trop bruités) crée la version
    // suivante, qui hérite de tout. La photo est alors écrite SUR LA VERSION NOUVELLE : elle montre
    // l'état nouveau, elle n'appartient pas à celui qu'elle remplace. Un échec de création ne perd
    // jamais la photo — elle reste sur la version en cours, et la réponse ne ment pas.
    const precedente = await precedenteP;
    const aJour = disp.version_no === disp.current_version_no;
    const lecture = aJour ? changementDePhoto(precedente, row) : { change: false, raisons: [] };
    let version: { commitment_id: string; version_no: number; raisons: string[] } | null = null;
    if (lecture.change) {
      const suivante = await versionSuivanteDepuisPhoto(bq, userId, disp, dispositif_id).catch((e: any) => {
        console.error("[dispositifs/photos] version suivante en erreur", String(e?.message || e));
        return null;
      });
      if (suivante) {
        row.version_no = suivante.version_no;
        // Le nom du composant — le MÊME que le bloc Composants affiche : le libellé libre, sinon le type,
        // plus le N° sur le plan quand il est saisi (« Rayonnage n° 8 »). Jamais la clé technique, et
        // jamais la famille reconnue : elle vient de CHANGER, elle ne peut pas servir de nom.
        const nomComp = [String(comp.label ?? "").trim() || dispositifTypeLabelFr(comp.type) || "Composant",
          row.fixture_no != null ? `n° ${row.fixture_no}` : ""].filter(Boolean).join(" ");
        const raisons: RaisonDeVersion[] = lecture.raisons.map((r) =>
          r.quoi === "exposition"
            ? { ...r, avant: expositionLabelFr(String(r.avant)), apres: expositionLabelFr(String(r.apres)) }
            : r);
        version = {
          commitment_id: suivante.commitment_id, version_no: suivante.version_no,
          raisons: photoChangementFr(nomComp, raisons),
        };
      }
    }

    const [variants] = await Promise.all([variantsP, insertPhotoRow(bq, row)]);
    return json({ ok: true, photo: publicRow(row, byCode(items)), usage: call.usage, variants, version });
  } catch (e: any) {
    const msg = String(e?.message || e);
    return json({ ok: false, error: msg }, msg.startsWith("FORBIDDEN") ? 403 : 500);
  }
};
