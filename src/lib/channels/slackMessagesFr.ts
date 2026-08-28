// Gabarits des messages Slack par étape du cycle des cartes — vue équipe inc 8
// (docs/vue-equipe-slack-spec.md § Messages par étape du cycle).
//
// LA COPIE EST ARBITRÉE PAR L'OWNER (28/08 — « rien à ma discrétion ») : chaque phrase
// vient de ses gabarits ; les mots du registre interactions humaines (tâche, Preuve,
// dépassé, sous-performé, Pas pour moi, priorité) vivent dans docs/lexique.md. Toute
// évolution de texte passe par un nouvel arbitrage — jamais une retouche en vol.
// La référence de comparaison est TOUJOURS « votre résultat habituel » (jamais
// « l'attendu » — mot banni, repris 10 fois par l'owner).

export const APP_ORIGIN = String(process.env.APP_ORIGIN || "https://www.musesquare.com");

export const WINDOW_FR: Record<string, string> = { day_of: "le jour même", "7d": "7 jours", "14d": "14 jours", "30d": "30 jours" };

function frDate(iso: string): string {
  const s = String(iso || "");
  return s.length >= 10 ? s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4) : s;
}
function eurSigned(v: number): string {
  const n = Math.round(Math.abs(v)).toLocaleString("fr-FR");
  return (v < 0 ? "−" : "+") + n + " €";
}
function section(text: string) { return { type: "section", text: { type: "mrkdwn", text } }; }
function urlButton(label: string, url: string, primary = false) {
  return { type: "button", action_id: "ms_url_" + label.toLowerCase().replace(/[^a-z]/g, ""), text: { type: "plain_text", text: label }, url, ...(primary ? { style: "primary" } : {}) };
}

export function engagementUrl(commitmentId: string, locationId: string): string {
  return APP_ORIGIN + "/app/insightevent/engagement?id=" + encodeURIComponent(commitmentId) + "&location_id=" + encodeURIComponent(locationId);
}

// ── Email d'invitation d'un membre (9d — copie owner 28/08, verbatim ; élision de/d'
// selon l'initiale du nom d'entreprise, « intrapreneuriat » en orthographe normalisée) ──
export function invitationEmailFr(a: { senderName: string; companyName: string }): { subject: string; body: string } {
  const de = /^[aeiouyàâäéèêëîïôöùûühœ]/i.test(String(a.companyName || "").trim()) ? "d'" : "de ";
  const entreprise = de + String(a.companyName || "").trim();
  const subject = a.senderName + " vous invite à rejoindre Muse Square";
  const body = a.senderName + " " + entreprise + " vous invite à rejoindre Muse Square, la plateforme de l'intrapreneuriat commercial.\n\n"
    + "Pour rejoindre un des pôles " + entreprise + ", créez votre compte ici : " + APP_ORIGIN;
  return { subject, body };
}

// ── G2 — assignation d'une tâche (owner 28/08 : « Fait » serait trop tôt ici) ─────────
export function assignmentMessageFr(a: {
  senderName?: string | null; actionText: string;
  thresholdBasis: string; thresholdValue: number; thresholdLevel: string;
  windowKind: string; windowEnd: string;
  commitmentId?: string; locationId: string;
}): { title: string; body: string; emailBody: string; blocks?: any[] } {
  const goalFr = a.thresholdBasis === "pct"
    ? "+" + Math.round(a.thresholdValue) + " % (CA vs votre résultat habituel)"
    : "niveau « " + a.thresholdLevel + " » (CA vs votre résultat habituel)";
  const line2 = "Objectif : " + goalFr + " sur " + (WINDOW_FR[a.windowKind] || a.windowKind) + " — verdict le " + frDate(a.windowEnd) + ".";
  const assignLine = a.senderName ? String(a.senderName).trim() + " vous a assigné une tâche." : "Une tâche vous est assignée.";
  const title = "Muse Square — une tâche vous est assignée";
  const body = assignLine + "\n\n" + a.actionText + "\n" + line2;
  const consulterUrl = APP_ORIGIN + "/app/insightevent/pulse";
  const ajusterUrl = a.commitmentId ? engagementUrl(a.commitmentId, a.locationId) : consulterUrl;
  const emailBody = body + "\n\nConsulter : " + consulterUrl + "\nAjuster : " + ajusterUrl;
  const blocks = a.commitmentId ? [
    section(assignLine),
    section("*" + a.actionText + "*\n" + line2),
    { type: "actions", elements: [urlButton("Consulter", consulterUrl, true), urlButton("Ajuster", ajusterUrl)] },
  ] : undefined;
  return { title, body, emailBody, blocks };
}

// ── G3 — verdict d'une opération (owner 28/08 : verdict objectif + résultat opérationnel) ──
const VERDICT_FR: Record<string, string> = { met: "atteint", tenu: "atteint", missed: "manqué", beat: "dépassé", confounded: "non concluant" };

export function verdictMessageFr(a: {
  actionText: string; verdict: string;
  windowStart: string; windowEnd: string;
  gapEur?: number | null;
  commitmentId: string; locationId: string;
}): { title: string; body: string; blocks: any[] } {
  const mot = VERDICT_FR[String(a.verdict || "").toLowerCase()] || "non concluant";
  const title = "Votre opération « " + a.actionText + " » vient d'être évaluée.";
  const verdictLine = "Verdict : "
    + (a.gapEur != null ? "résultat opérationnel " + eurSigned(a.gapEur) + " sur la période (du " + frDate(a.windowStart) + " au " + frDate(a.windowEnd) + "), " : "")
    + "objectif " + mot + ".";
  const body = verdictLine;
  const blocks = [
    section("*" + title + "*\n" + verdictLine),
    { type: "actions", elements: [
      { type: "button", action_id: "ms_retro_open", text: { type: "plain_text", text: "Documenter" }, style: "primary", value: JSON.stringify({ c: a.commitmentId, l: a.locationId }) },
      urlButton("Ajuster", engagementUrl(a.commitmentId, a.locationId)),
    ] },
  ];
  return { title, body, blocks };
}

// ── G4 — 3 sous-performances la même semaine (owner 28/08 : règle « trois mauvaises
// journées dans la même semaine », mauvaise = nettement sous votre résultat habituel,
// hors bande de bruit ; une notification max par semaine et par dispositif).
// « Documenter » ne figure PAS ici : le rail le refuse avant résolution (409) — signalé
// à l'owner, Ajuster seul en attendant son arbitrage.
export function underperfMessageFr(a: {
  actionText: string; days: string[]; gapEur?: number | null;
  commitmentId: string; locationId: string;
}): { title: string; body: string; blocks: any[] } {
  const title = "Votre opération « " + a.actionText + " » a sous-performé pour la 3ᵉ fois cette semaine.";
  const daysFr = a.days.map(frDate).join(", ");
  const body = "Trois journées de la même semaine nettement sous votre résultat habituel : " + daysFr + "."
    + (a.gapEur != null ? "\nRésultat opérationnel : " + eurSigned(a.gapEur) + " sur ces trois journées." : "");
  const blocks = [
    section("*" + title + "*\n" + body),
    { type: "actions", elements: [urlButton("Ajuster", engagementUrl(a.commitmentId, a.locationId), true)] },
  ];
  return { title, body, blocks };
}
