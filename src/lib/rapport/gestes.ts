// src/lib/rapport/gestes.ts — LES GESTES SUR LE DOCUMENT (docs/explorer-outil-spec.md § 6.2, incrément 3).
//
// Déplacer · Retirer · Dupliquer une section (aucun recalcul), Votre note (un texte de l'exploitant sous une section,
// registre distinct, jamais mêlé à un texte vérifié), Actualiser (les sections à provenance se recalculent sur la
// période relative, les notes restent), Approfondir (la boucle relance les outils avec la période de la section ;
// le résultat s'insère après elle, vérifié). Tout ce qui touche au document est PUR ici : un bloc `rapport` entre,
// un bloc `rapport` sort, jamais muté — la route écrit la version suivante. Un déplacement ne change aucun chiffre
// (testé). Les mots : Approfondir, Votre note (lexique l. 122-123), Déplacer, Retirer, Dupliquer, Actualiser (§ 6.2).
import type { AnswerBlock, RapportBlock, RapportSection, Register } from "../explorer/blocks";
import { SECTION_BY_CLE, type SectionCle } from "../fr/rapport.fr";
import { resolvePeriode, computeSalesReport, composeVentesFacts, type PeriodeMot } from "./ventes";
import { composeRapport, SECTIONS_VENTES } from "./composer";
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
export function ajouterNote(r: RapportBlock, i: number, texte: unknown, auteur: string | null, now = new Date()): RapportBlock | GesteErreur {
  if (!dans(r, i)) return { erreur: "section inconnue" };
  const text = String(texte ?? "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) return { erreur: "note vide" };
  if (text.length > NOTE_MAX) return { erreur: `note : ${NOTE_MAX} caractères au plus` };
  const out = clone(r);
  out.sections[i].blocs.push({ type: "note", text, auteur: auteur ? String(auteur).slice(0, 120) : null, date: now.toISOString() });
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
export function approfondirSection(r: RapportBlock, i: number, resultat: { blocks: AnswerBlock[]; text: string; register: Register; question: string }): RapportBlock | GesteErreur {
  if (!dans(r, i)) return { erreur: "section inconnue" };
  const out = clone(r);
  const blocs = out.sections[i].blocs;
  const firstNote = blocs.findIndex((b) => b.type === "note");
  const at = firstNote < 0 ? blocs.length : firstNote;
  const insert: AnswerBlock[] = [
    { type: "prose", md: `**Approfondir — ${resultat.question.trim()}**` },
    { type: "register", register: resultat.register },
    ...resultat.blocks.filter((b) => b.type !== "register" && b.type !== "rapport"),
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
  out.synthese = null;
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
  return [
    `Approfondir la section « ${s.titre} » du Rapport « ${r.titre} », période du ${frDate(per.du)} au ${frDate(per.au)}.`,
    `Relance tes outils sur cette période exactement (du=${per.du}, au=${per.au}), pas sur une autre.`,
    faits.length ? `Ce que la section dit déjà :\n${faits.map((f) => `• ${f}`).join("\n")}` : "",
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
 * Actualiser (lecture) : les sections à provenance se recomposent par les MÊMES lectures que composer_rapport, sur
 * la période actualisée, puis `actualiserAvec` fusionne. L'indicateur des pôles est celui de la provenance.
 */
export async function actualiserDocument(bq: any, location_id: string, owned: string[], r: RapportBlock, today: string): Promise<RapportBlock> {
  const per = periodeActualisee(r, today);
  const cles = clesARecalculer(r);
  const besoin = (k: string[]) => cles.some((c) => k.includes(c));
  const polesProv = r.sections.find((s) => s.cle === "poles")?.provenance;
  const indicateur = ((polesProv?.params as any)?.indicateur as Indicateur | undefined) ?? "ca";
  const [ventes, marge, resultat, espace, poles] = await Promise.all([
    besoin(SECTIONS_VENTES) ? computeSalesReport(bq, { location_id, owned, start: per.du, end: per.au }).then(composeVentesFacts) : null,
    besoin(["marge_brute"]) ? FAMILIES.marge.run(bq, location_id, today) : null,
    besoin(["resultat_net", "seuil_rentabilite"]) ? readResultat(bq, location_id).then((x) => composeResultatFacts(x)) : null,
    besoin(["espace"]) ? FAMILIES.espace.run(bq, location_id, today) : null,
    besoin(["poles"]) ? readPoleClassement(bq, location_id, per.du, per.au).then((d) => composePoleClassement(d, indicateur, `sur ${per.libelle_fr}`)) : null,
  ]);
  const nouveau = composeRapport({ cles, non_reconnu: [], periode: per, indicateur, titre: r.titre, calcule_le: new Date().toISOString(), lectures: { ventes, marge, resultat, espace, poles } });
  return actualiserAvec(r, nouveau.block);
}
