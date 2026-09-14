// src/lib/rapport/gestes.ts — LES GESTES SUR LE DOCUMENT (docs/explorer-outil-spec.md § 6.2, incrément 3).
//
// Déplacer · Retirer · Dupliquer une section (aucun recalcul), Votre note (un texte de l'exploitant sous une section,
// registre distinct, jamais mêlé à un texte vérifié), Actualiser (les sections à provenance se recalculent sur la
// période relative, les notes restent), Approfondir (la boucle relance les outils avec la période de la section ;
// le résultat s'insère après elle, vérifié). Tout ce qui touche au document est PUR ici : un bloc `rapport` entre,
// un bloc `rapport` sort, jamais muté — la route écrit la version suivante. Un déplacement ne change aucun chiffre
// (testé). Les mots : Approfondir, Votre note (lexique l. 122-123), Déplacer, Retirer, Dupliquer, Actualiser (§ 6.2).
import type { AnswerBlock, RapportBlock, RapportSection, Register } from "../explorer/blocks";
import { SECTIONS, SECTION_BY_CLE, type SectionCle, type SectionDef } from "../fr/rapport.fr";
import { resolvePeriode, computeSalesReport, composeVentesFacts, type PeriodeMot } from "./ventes";
import { composeRapport, SECTIONS_VENTES, type ComposeResult } from "./composer";
import { readResultat, composeResultatFacts } from "../kpi/resultat";
import { readPoleClassement, composePoleClassement, type Indicateur } from "../dispositifs/poleClassement";
import { FAMILIES } from "../insightFamilies";

export const NOTE_MAX = 4000;
export type GesteErreur = { erreur: string };
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const dans = (r: RapportBlock, i: number): boolean => Number.isInteger(i) && i >= 0 && i < r.sections.length;

/** Déplacer : la section `i` va en `vers` (indices de sections) ; les blocs ne changent pas. */
export function deplacerSection(r: RapportBlock, i: number, vers: number): RapportBlock | GesteErreur {
  if (!dans(r, i)) return { erreur: "section inconnue" };
  const cible = Math.max(0, Math.min(r.sections.length - 1, vers));
  const out = clone(r);
  const [s] = out.sections.splice(i, 1);
  out.sections.splice(cible, 0, s);
  return out;
}

export function retirerSection(r: RapportBlock, i: number): RapportBlock | GesteErreur {
  if (!dans(r, i)) return { erreur: "section inconnue" };
  const out = clone(r);
  out.sections.splice(i, 1);
  return out;
}

export function dupliquerSection(r: RapportBlock, i: number): RapportBlock | GesteErreur {
  if (!dans(r, i)) return { erreur: "section inconnue" };
  const out = clone(r);
  out.sections.splice(i + 1, 0, clone(out.sections[i]));
  return out;
}

/** Votre note : un texte de l'exploitant, sous la section `i` (après ses blocs), avec l'auteur et la date. */
/**
 * PUR — LES SECTIONS QU'ON PEUT ENCORE AJOUTER (owner 14/09, livrable arrêté ensemble).
 *
 * DEUX CLÉS NE SONT JAMAIS PROPOSÉES, et ce n'est pas un oubli :
 *  · `synthese` n'est PAS une section — c'est le texte d'ouverture du document, écrit par l'agent ou par
 *    l'exploitant (« Modifier la Synthèse ») ; le composeur l'écarte déjà (composer.ts l. 49) ;
 *  · `sources` se CONSTRUIT en ramassant les sources des autres sections, et reste en dernier. La proposer
 *    ferait croire qu'on peut l'ajouter à la main, alors qu'elle suit toute seule.
 * L'ordre rendu est celui du lexique (SECTIONS), pas celui du document : c'est une liste de choix, et une
 * liste de choix qui change d'ordre d'une fois sur l'autre est illisible.
 */
export function sectionsAjoutables(r: RapportBlock): SectionDef[] {
  const presentes = new Set((r?.sections ?? []).map((s) => String(s.cle)));
  return SECTIONS.filter((d) => d.cle !== "synthese" && d.cle !== "sources" && !presentes.has(d.cle));
}

/**
 * PUR — OÙ ATTERRIT UNE SECTION AJOUTÉE : à la FIN, mais AVANT « Sources et fiabilité » (arbitrage owner
 * 14/09). Prévisible — on sait toujours où la retrouver — et les flèches ↑ ↓ la déplacent ensuite. Sans
 * section Sources, elle va simplement en dernier.
 */
export function insererSection(r: RapportBlock, nouvelle: RapportSection): RapportBlock | GesteErreur {
  if (!nouvelle || !nouvelle.cle) return { erreur: "section à ajouter manquante" };
  if ((r?.sections ?? []).some((s) => String(s.cle) === String(nouvelle.cle))) return { erreur: "section déjà présente" };
  const out = clone(r);
  const iSources = out.sections.findIndex((s) => String(s.cle) === "sources");
  out.sections.splice(iSources < 0 ? out.sections.length : iSources, 0, clone(nouvelle));
  return out;
}

/**
 * PUR — LE SUJET SOUS LEQUEL UNE NOTE ENTRE DANS LA MÉMOIRE DU SITE (owner 14/09 : « peut permettre à
 * l'app d'apprendre beaucoup de choses sur le business du user » ; spec § 4 n2, owner 12/09 : « les choix
 * qu'il fait — sections gardées, ordre, notes, questions posées — sont des éléments de contexte »).
 *
 * CE QUE LE SUJET DOIT FAIRE, et pourquoi il porte la SECTION ET LA PÉRIODE : `site_memory` garde la
 * DERNIÈRE ligne de chaque sujet. Un sujet trop large (« notes ») ferait que chaque note efface la
 * précédente ; un sujet trop étroit (l'identifiant du document) rendrait deux notes du même mois
 * introuvables ensemble. Section + période : deux notes sur des sujets différents coexistent, et deux
 * notes sur LE MÊME sujet se remplacent — ce qui est le bon comportement, l'exploitant s'étant corrigé.
 * Rien n'est perdu pour autant : le Rapport garde toutes ses notes, et la table est en ajout seul.
 */
export function sujetDeNote(titreSection: unknown, periodeLibelle: unknown): string | null {
  const t = String(titreSection ?? "").replace(/\s+/g, " ").trim();
  if (!t) return null;                                  // sans section nommée, pas de sujet : on n'invente pas
  const p = String(periodeLibelle ?? "").replace(/\s+/g, " ").trim();
  return p ? `${t} — ${p}` : t;
}

export function ajouterNote(r: RapportBlock, i: number, texte: unknown, auteur: string | null, now = new Date()): RapportBlock | GesteErreur {
  if (!dans(r, i)) return { erreur: "section inconnue" };
  const text = String(texte ?? "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) return { erreur: "note vide" };
  if (text.length > NOTE_MAX) return { erreur: `note : ${NOTE_MAX} caractères au plus` };
  const out = clone(r);
  out.sections[i].blocs.push({ type: "note", text, auteur: auteur ? String(auteur).slice(0, 120) : null, date: now.toISOString() });
  return out;
}

/** La Synthèse reprise par l'exploitant (owner 12/09 : « User will edit it ») : son texte, registre « note », son nom. */
export function modifierSynthese(r: RapportBlock, texte: unknown, auteur: string | null): RapportBlock | GesteErreur {
  const text = String(texte ?? "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) return { erreur: "synthèse vide" };
  if (text.length > NOTE_MAX) return { erreur: `synthèse : ${NOTE_MAX} caractères au plus` };
  const out = clone(r);
  out.synthese = { text, register: "note", auteur: auteur ? String(auteur).slice(0, 120) : null };
  return out;
}

/** Retirer une note : la `n`-ième note de la section `i` (les autres blocs ne bougent pas). */
export function retirerNote(r: RapportBlock, i: number, n: number): RapportBlock | GesteErreur {
  if (!dans(r, i)) return { erreur: "section inconnue" };
  const out = clone(r);
  const idx = out.sections[i].blocs.map((b, k) => (b.type === "note" ? k : -1)).filter((k) => k >= 0)[n];
  if (idx == null) return { erreur: "note inconnue" };
  out.sections[i].blocs.splice(idx, 1);
  return out;
}

/**
 * Approfondir : le résultat d'un tour de la boucle (ses blocs d'outils, son texte et son registre) s'insère APRÈS les
 * blocs de la section `i`, comme un bloc vérifié — la pastille du tour, les blocs, puis le texte. Les notes de la
 * section restent après (on insère avant la première note).
 */
/**
 * PUR — L'EMPREINTE D'UN BLOC : ce qu'il MONTRE, sans ce qui l'habille. Deux tableaux aux mêmes colonnes et
 * aux mêmes cellules sont le même tableau, qu'ils viennent de la section ou de la réponse.
 */
export function empreinteBloc(b: AnswerBlock): string {
  const a = b as any;
  if (a.type === "table") {
    return "table|" + (a.cols ?? []).map((c: any) => String(c.label ?? "")).join("¦") + "‖"
      + (a.rows ?? []).map((r: any) => (r.cells ?? []).map((c: any) => String(c.v ?? "")).join("¦")).join("‖");
  }
  if (a.type === "facts") return "facts|" + (a.items ?? []).map((x: any) => String(x).trim()).join("‖");
  if (a.type === "prose") return "prose|" + String(a.md ?? "").trim();
  if (a.type === "headline") return "headline|" + String(a.text ?? "").trim();
  if (a.type === "sources") return "sources|" + (a.items ?? []).map((x: any) => String(x).trim()).sort().join("‖");
  return a.type + "|" + JSON.stringify(a);
}

/**
 * PUR — CE QU'APPROFONDIR N'A PAS À REDIRE (owner 14/09 : « un dupliqué de ce qui était déjà dans le bloc
 * […] il faut éviter ce comportement, qui va se reproduire partout »).
 *
 * Quand on demande « à quoi est-ce dû ? » sous la section Chiffre d'affaires, les outils relancent leurs
 * lectures et rendent le MÊME tableau que la section affiche déjà, à trois centimètres au-dessus. On le
 * retire : ce qui reste est ce que l'exploitant n'avait pas — le raisonnement, et les tableaux NOUVEAUX.
 *
 * Le retrait est mécanique, jamais un pari sur le type : un tableau neuf (une décomposition par jour, par
 * exemple) EST la réponse et doit rester. Seule l'identité de contenu compte. Les `sources` d'une réponse
 * tombent aussi quand la section en a déjà : elles nomment les mêmes lectures.
 */
export function sansCeQueLaSectionMontreDeja(dansLaSection: AnswerBlock[], reponse: AnswerBlock[]): AnswerBlock[] {
  const vues = new Set((dansLaSection ?? []).map(empreinteBloc));
  const out: AnswerBlock[] = [];
  for (const b of reponse ?? []) {
    const e = empreinteBloc(b);
    if (vues.has(e)) continue;          // déjà sous les yeux : le remontrer n'apprend rien
    vues.add(e);                        // et deux fois dans la réponse elle-même, une seule fois rendu
    out.push(b);
  }
  return out;
}

export function approfondirSection(r: RapportBlock, i: number, resultat: { blocks: AnswerBlock[]; text: string; register: Register; question: string }): RapportBlock | GesteErreur {
  if (!dans(r, i)) return { erreur: "section inconnue" };
  const out = clone(r);
  const blocs = out.sections[i].blocs;
  const firstNote = blocs.findIndex((b) => b.type === "note");
  const at = firstNote < 0 ? blocs.length : firstNote;
  const dejaVu = r.sections.flatMap((x) => x.blocs);
  const utiles = sansCeQueLaSectionMontreDeja(dejaVu, resultat.blocks.filter((b) => b.type !== "register" && b.type !== "rapport"));
  const insert: AnswerBlock[] = [
    { type: "prose", md: `**Approfondir — ${resultat.question.trim()}**` },
    { type: "register", register: resultat.register },
    ...utiles,
    ...(resultat.text.trim() ? [{ type: "prose", md: resultat.text.trim() } as AnswerBlock] : []),
  ];
  blocs.splice(at, 0, ...insert);
  return out;
}

/** La période sur laquelle Actualiser recalcule : la période relative si le document en a une, sinon ses dates. */
export function periodeActualisee(r: RapportBlock, today: string): { du: string; au: string; relative: string | null; libelle_fr: string } {
  const rel = r.periode.relative as PeriodeMot | null;
  if (rel) {
    const p = resolvePeriode({ periode: rel }, today);
    if (p) return { du: p.start, au: p.end, relative: rel, libelle_fr: p.libelle_fr };
  }
  return { du: r.periode.du, au: r.periode.au, relative: null, libelle_fr: r.periode.libelle_fr };
}

/** Les clés des sections à provenance (celles qu'Actualiser recalcule), dans l'ordre du document. */
export function clesARecalculer(r: RapportBlock): SectionCle[] {
  return r.sections.filter((s) => s.provenance && s.cle in SECTION_BY_CLE).map((s) => s.cle as SectionCle);
}

/**
 * Actualiser (PUR) : `nouveau` est le document recomposé sur la période actualisée (mêmes clés) ; l'ordre des sections
 * de l'ancien document est gardé, chaque section recalculée remplace l'ancienne à sa place, les notes de l'ancienne
 * restent à la fin de la nouvelle, une section sans provenance (donc non recalculée) est gardée telle quelle. La
 * Synthèse décrivait les anciens chiffres : elle tombe (Approfondir ou un nouveau tour la réécrit).
 */
export function actualiserAvec(ancien: RapportBlock, nouveau: RapportBlock): RapportBlock {
  const out = clone(ancien);
  const restants = clone(nouveau.sections);
  out.sections = out.sections.map((s): RapportSection => {
    if (!s.provenance) return s;
    const k = restants.findIndex((n) => n.cle === s.cle);
    if (k < 0) return s;
    const [n] = restants.splice(k, 1);
    const notes = s.blocs.filter((b) => b.type === "note");
    return { ...n, blocs: [...n.blocs, ...notes] };
  });
  out.periode = nouveau.periode;
  out.titre = ancien.titre === `Rapport — ${ancien.periode.libelle_fr}` ? `Rapport — ${nouveau.periode.libelle_fr}` : ancien.titre;
  // 14/09 (owner) — CORRIGÉ : « Actualiser » effaçait TOUTE Synthèse, y compris celle que l'exploitant
  // venait d'écrire à la main. Pour une Synthèse générée c'est juste — elle décrivait les anciens chiffres.
  // Pour la sienne, c'est une perte de données, et le geste ne la lui annonçait pas. `register: "note"` est
  // la marque posée par `modifierSynthese` : elle seule distingue les deux, et elle seule survit.
  out.synthese = ancien.synthese && ancien.synthese.register === "note" ? clone(ancien.synthese) : null;
  return out;
}

/**
 * Le message qu'Approfondir passe à la boucle : la section, ses dates (que les outils reçoivent en du/au) et la
 * question — le modèle relance les outils sur CE périmètre, jamais sur « aujourd'hui ».
 */
export function approfondirPrompt(r: RapportBlock, i: number, question: string): string | GesteErreur {
  if (!dans(r, i)) return { erreur: "section inconnue" };
  const s = r.sections[i];
  const q = String(question ?? "").trim();
  if (!q) return { erreur: "question vide" };
  const per = s.provenance?.periode ?? { du: r.periode.du, au: r.periode.au };
  const faits = s.blocs.filter((b) => b.type === "facts").flatMap((b: any) => b.items as string[]).slice(0, 12);
  // 14/09 (owner) — La consigne ne disait que les FAITS de la section. Le modèle ignorait donc que le
  // tableau du chiffre d'affaires est déjà à l'écran, ses outils le rendaient, et on le recollait trois
  // centimètres dessous. Il faut lui dire ce que la section MONTRE, pas seulement ce qu'elle affirme.
  const tableaux = s.blocs.filter((b) => b.type === "table")
    .map((b: any) => (b.cols ?? []).map((c: any) => String(c.label ?? "")).filter(Boolean).join(" · "))
    .filter(Boolean).slice(0, 6);
  return [
    `Approfondir la section « ${s.titre} » du Rapport « ${r.titre} », période du ${frDate(per.du)} au ${frDate(per.au)}.`,
    `Relance tes outils sur cette période exactement (du=${per.du}, au=${per.au}), pas sur une autre.`,
    faits.length ? `Ce que la section dit déjà :\n${faits.map((f) => `• ${f}`).join("\n")}` : "",
    tableaux.length ? `Ce que la section MONTRE déjà, juste au-dessus de ta réponse — tableaux :\n${tableaux.map((t) => `• ${t}`).join("\n")}` : "",
    "N'AFFICHE PAS CE QUI EST DÉJÀ LÀ. L'exploitant a ces tableaux sous les yeux ; les redonner ne lui apprend rien et lui fait relire deux fois la même chose. Réponds par ce qu'il n'a PAS : le raisonnement, les comptes intermédiaires, et un tableau seulement s'il montre autre chose (une décomposition par jour, par famille, par heure…).",
    "N'ÉCRIS JAMAIS UN TABLEAU DANS TON TEXTE (pas de lignes de | ). Les tableaux sont rendus par les outils, sous ta réponse ; en retaper un le fait apparaître DEUX fois, et le tien sort en lignes de barres verticales illisibles. Commente le tableau, ne le recopie pas.",
    `Question de l'exploitant : ${q}`,
  ].filter(Boolean).join("\n\n");
}

const frDate = (iso: string): string => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso); return m ? `${m[3]}/${m[2]}/${m[1]}` : iso; };

/** Un déplacement, un retrait, un doublon ou une note ne change aucun chiffre : les faits des tableaux sont les mêmes. */
export function chiffresDuDocument(r: RapportBlock): string[] {
  const out: string[] = [];
  const walk = (b: AnswerBlock) => {
    if (b.type === "table") for (const row of b.rows) for (const c of row.cells) out.push(c.v);
    if (b.type === "facts") out.push(...b.items);
    if (b.type === "card") out.push(JSON.stringify(b.data));
  };
  for (const s of r.sections) for (const b of s.blocs) walk(b);
  return out.sort();
}

/**
 * Composer sur une période, SANS la boucle : les MÊMES lectures que composer_rapport (ventes, marge, résultat, espace,
 * pôles, signaux), déterministes, puis `composeRapport`. C'est ce qu'Actualiser et l'envoi à cadence (envois.ts)
 * partagent — un Modèle rempli sans le modèle de langue n'a pas de Synthèse, et n'en invente pas.
 */
export async function composerSurPeriode(bq: any, location_id: string, owned: string[], inp: { cles: SectionCle[]; indicateur: Indicateur; titre: string | null; periode: { du: string; au: string; relative: string | null; libelle_fr: string } }, today: string): Promise<ComposeResult> {
  const { cles, indicateur } = inp;
  const per = inp.periode;
  const besoin = (k: string[]) => cles.some((c) => k.includes(c));
  const [ventes, marge, resultat, espace, poles, signaux] = await Promise.all([
    besoin(SECTIONS_VENTES) ? computeSalesReport(bq, { location_id, owned, start: per.du, end: per.au }).then(composeVentesFacts) : null,
    besoin(["marge_brute"]) ? FAMILIES.marge.run(bq, location_id, today) : null,
    besoin(["resultat_net", "seuil_rentabilite"]) ? readResultat(bq, location_id).then((x) => composeResultatFacts(x)) : null,
    besoin(["espace"]) ? FAMILIES.espace.run(bq, location_id, today) : null,
    besoin(["poles"]) ? readPoleClassement(bq, location_id, per.du, per.au).then((d) => composePoleClassement(d, indicateur, `sur ${per.libelle_fr}`)) : null,
    besoin(["contexte"]) ? FAMILIES.signaux.run(bq, location_id, today) : null,
  ]);
  return composeRapport({ cles, non_reconnu: [], periode: per, indicateur, titre: inp.titre, calcule_le: new Date().toISOString(), lectures: { ventes, marge, resultat, espace, poles, signaux } });
}

/**
 * Actualiser (lecture) : les sections à provenance se recomposent par `composerSurPeriode` sur la période actualisée,
 * puis `actualiserAvec` fusionne. L'indicateur des pôles est celui de la provenance.
 */
export async function actualiserDocument(bq: any, location_id: string, owned: string[], r: RapportBlock, today: string): Promise<RapportBlock> {
  const per = periodeActualisee(r, today);
  const polesProv = r.sections.find((s) => s.cle === "poles")?.provenance;
  const indicateur = ((polesProv?.params as any)?.indicateur as Indicateur | undefined) ?? "ca";
  const nouveau = await composerSurPeriode(bq, location_id, owned, { cles: clesARecalculer(r), indicateur, titre: r.titre, periode: per }, today);
  return actualiserAvec(r, nouveau.block);
}
