// Copie du rapport par canal — LE fichier que l'owner édite (spec docs/rapport-canaux-spec.md § 2).
// Voix : les 4 questions de l'exploitant, jamais la voix comptable (« compensé par ») ni le
// jargon d'app. Référence de ton : le proto v5 validé (tools/proto/rapport-canaux-proto.html).
// Règle absolue (décision 10) : ces gabarits n'ORNENT jamais un chiffre et n'inventent jamais
// une cause — ils assemblent des faits mesurés qui leur sont passés.

export const CHANNEL_DEFAULT_LABELS: Record<string, string> = {
  comptoir: "Boutique",
  direct: "Professionnels",
  // __site__ (tenant sans rattachement canal) : le nom du site remplace le libellé.
};

// Seuils d'état d'un canal sur la période (évolution vs période précédente, en %).
export const ETAT = {
  down_max: -15, // ≤ −15 % → à traiter
  up_min: 15, // ≥ +15 % → en forme
  exceptional_min: 100, // ≥ +100 % → exceptionnel
  labels: {
    down: "▼ à traiter",
    up: "▲ en forme",
    exceptional: "▲ exceptionnel",
    stable: "● stable",
  } as Record<string, string>,
};

export type EtatKey = "down" | "up" | "exceptional" | "stable";

export function etatFor(evolPct: number | null): EtatKey {
  if (evolPct == null) return "stable";
  if (evolPct <= ETAT.down_max) return "down";
  if (evolPct >= ETAT.exceptional_min) return "exceptional";
  if (evolPct >= ETAT.up_min) return "up";
  return "stable";
}

export const PIED_DOCUMENT = "Document interne — les comptes clients y sont nommés.";

const frInt = (n: number) => Math.round(n).toLocaleString("fr-FR");
const eur = (n: number) => `${frInt(n)} €`;
const pct = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(Math.round(n))} %`;

// Part en mots — uniquement des fourchettes larges ; hors fourchette, le % nu.
function partEnMots(sharePct: number): string {
  if (sharePct >= 85) return "la quasi-totalité du chiffre";
  if (sharePct >= 50) return "plus de la moitié du chiffre";
  if (sharePct >= 44) return "environ la moitié du chiffre";
  if (sharePct >= 28) return "environ un tiers";
  if (sharePct >= 20) return "environ un quart";
  return `${Math.round(sharePct)} % du chiffre`;
}

// ── Les entrées des gabarits : des FAITS déjà mesurés, jamais recalculés ici. ──
export type FlowLine = { label: string; ca: number; share_pct: number; evol_pct: number | null; etat: EtatKey };
export type QQInput = {
  flows: FlowLine[]; // tous les flux (canaux + sites mono-flux), tri CA desc
  new_top: { label: string; ca: number }[]; // plus gros nouveaux comptes de la période
  missing_top: { label: string; prev_ca: number; channel_label: string } | null; // plus gros compte de la période précédente absent de celle-ci
  dormants: { label: string }[]; // comptes réguliers sans commande (mêmes que les cartes)
};

export const QUATRE_QUESTIONS = {
  argent(i: QQInput): string {
    if (!i.flows.length) return "";
    const parts = i.flows.map((f, ix) => {
      if (ix === 0) return `${f.label.toLowerCase() === f.label ? f.label : f.label} : ${partEnMots(f.share_pct)} (${eur(f.ca)})`;
      if (ix === i.flows.length - 1 && i.flows.length >= 3) return `${f.label} le reste (${eur(f.ca)})`;
      return `${f.label} ${partEnMots(f.share_pct)} (${eur(f.ca)})`;
    });
    return `${parts.join(", ")}.`;
  },

  marche(i: QQInput): string {
    const up = i.flows.filter((f) => f.etat === "up" || f.etat === "exceptional");
    const bits: string[] = up.map((f) =>
      f.etat === "exceptional"
        ? `${f.label} signe une période exceptionnelle (${pct(f.evol_pct ?? 0)})`
        : `${f.label} progresse (${pct(f.evol_pct ?? 0)})`
    );
    if (i.new_top.length) {
      const names = i.new_top.slice(0, 2).map((n) => `${n.label} ${eur(n.ca)}`).join(", ");
      bits.push(`de nouveaux comptes ont signé (${names})`);
    }
    return bits.length ? `${bits.join(" ; ")}.` : "Rien ne se détache à la hausse sur la période.";
  },

  marchePas(i: QQInput): string {
    const down = i.flows.filter((f) => f.etat === "down");
    const bits: string[] = down.map((f) => `${f.label} a moins vendu (${pct(f.evol_pct ?? 0)})`);
    if (i.missing_top) {
      bits.push(
        `la période précédente avait été portée par ${i.missing_top.label} (${eur(i.missing_top.prev_ca)}, rien depuis)`
      );
    }
    if (i.dormants.length) {
      bits.push(
        i.dormants.length === 1
          ? `un habitué n'a rien pris sur la période`
          : `${i.dormants.length} habitués n'ont rien pris sur la période`
      );
    }
    return bits.length ? `${bits.join(" ; ")}.` : "Aucun flux en retrait marqué sur la période.";
  },

  aFaire(i: QQInput): string {
    const bits: string[] = [];
    if (i.dormants.length) bits.push(`rappeler ${i.dormants.slice(0, 3).map((d) => d.label).join(", ")}`);
    if (i.missing_top) bits.push(`demander à ${i.missing_top.label} si une prochaine commande arrive`);
    return bits.length ? `${bits.join(" ; ")}.` : "Rien d'urgent — garder le rythme.";
  },
};
