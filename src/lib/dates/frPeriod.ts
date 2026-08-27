// frPeriod — LE parseur de période en français libre (SST périodes).
//
// Résout « juin-juillet », « de juin à juillet 2026 », « entre juin et juillet »,
// « juin », « du 01/06/2026 au 31/07/2026 », « 30 derniers jours », « semaine
// dernière », « mois dernier », « ce mois » en un intervalle CIVIL inclus
// { start, end } (YYYY-MM-DD). Zéro LLM, zéro horloge interne : `today` est
// injecté par l'appelant — les tests sont déterministes.
//
// BIAIS D'ANNÉE (mois nommé sans année) — le point qui faisait résoudre
// « juin » en juin N+1 pour une question de résultats :
//   - "future" (planification : « meilleurs jours en juin ») → PROCHAINE
//     occurrence : mois >= mois courant → cette année, sinon année suivante.
//     C'est le comportement historique de insight/prompt.ts, préservé.
//   - "past" (résultats, rapport, défaut) → occurrence la plus RÉCENTE déjà
//     commencée : mois <= mois courant → cette année, sinon année précédente.
// Une année explicite dans le texte (« juin 2027 ») l'emporte toujours.
//
// Plage de mois à cheval sur l'année (« décembre-janvier ») : le mois de fin
// est résolu par le biais, le mois de début est la dernière occurrence <= fin.
//
// Consommateurs : src/pages/api/insight/prompt.ts (fenêtre du mode mois).
// public/scripts/ie-prompt.js porte encore parseFrPeriod (navigation rapport) ;
// il est remplacé par l'intent serveur REPORT — voir docs/module-index.md.

export type FrPeriodKind =
  | "explicit_range" // du JJ/MM/AAAA au JJ/MM/AAAA (ou ISO)
  | "last_n_days" // N derniers jours (finissant hier)
  | "last_week" // semaine civile précédente, lundi → dimanche
  | "last_month" // mois civil précédent
  | "this_month" // 1er du mois → aujourd'hui
  | "month" // un seul mois nommé
  | "month_range" // deux mois nommés (juin-juillet, de juin à juillet…)
  | "since" // depuis <mois|date> → jusqu'à aujourd'hui
  | "quarter" // trimestre civil (ce trimestre, trimestre dernier, T1-T4)
  | "season"; // saison météorologique (été = juin-août, hiver = déc-fév à cheval)

export type YearBias = "past" | "future";

export interface FrPeriod {
  start: string; // YYYY-MM-DD inclus
  end: string; // YYYY-MM-DD inclus
  kind: FrPeriodKind;
  /** Mois nommés résolus (1-12), vide pour les formes non mensuelles. */
  months: number[];
  /** true si l'année était écrite dans le texte (aucun biais appliqué). */
  explicit_year: boolean;
}

const MONTHS_FR_EN: Record<string, number> = {
  janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12,
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

// Alternance des noms, longs d'abord (évite « mai » avalé dans « maintenant » via \b… non :
// la frontière est gérée par le pattern appelant ; le tri long→court évite « juin » pris dans « juillet »).
const MONTH_ALT = Object.keys(MONTHS_FR_EN)
  .sort((a, b) => b.length - a.length)
  .join("|");

function normFr(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function ymd(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/** Dernier jour du mois civil (m: 1-12). */
export function lastDayOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Ajoute n jours (n peut être négatif) à une date YYYY-MM-DD. */
export function addDaysYmd(ymdStr: string, n: number): string {
  const d = new Date(ymdStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Nombre de jours de l'intervalle inclus [start, end]. */
export function daysInRangeYmd(start: string, end: string): number {
  const a = new Date(start + "T00:00:00Z").getTime();
  const b = new Date(end + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86_400_000) + 1;
}

function parseToday(today: string): { y: number; m: number; d: number } {
  const m = today.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) throw new Error(`frPeriod: today invalide « ${today} » (attendu YYYY-MM-DD)`);
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function isValidYmd(y: number, mo: number, d: number): boolean {
  if (mo < 1 || mo > 12 || d < 1) return false;
  return d <= lastDayOfMonth(y, mo);
}

/** Année d'un mois nommé sans année écrite, selon le biais (cf. en-tête). */
function yearForMonth(mo: number, todayY: number, todayM: number, bias: YearBias): number {
  if (bias === "future") return mo >= todayM ? todayY : todayY + 1;
  return mo <= todayM ? todayY : todayY - 1;
}

export function resolveFrPeriod(
  qRaw: string,
  opts: { today: string; yearBias?: YearBias }
): FrPeriod | null {
  const t = parseToday(opts.today);
  const bias: YearBias = opts.yearBias ?? "past";
  const q = normFr(qRaw);
  let m: RegExpMatchArray | null;

  // 1) du JJ/MM/AAAA au JJ/MM/AAAA — dates FRANÇAISES (jour/mois), jamais US.
  if ((m = q.match(/du (\d{1,2})\/(\d{1,2})\/(\d{4}) au (\d{1,2})\/(\d{1,2})\/(\d{4})/))) {
    const [d1, m1, y1, d2, m2, y2] = [m[1], m[2], m[3], m[4], m[5], m[6]].map(Number);
    if (isValidYmd(y1, m1, d1) && isValidYmd(y2, m2, d2)) {
      const start = ymd(y1, m1, d1);
      const end = ymd(y2, m2, d2);
      if (start <= end)
        return { start, end, kind: "explicit_range", months: [], explicit_year: true };
    }
  }

  // 1bis) du YYYY-MM-DD au YYYY-MM-DD (forme interne/API recopiée par l'utilisateur)
  if ((m = q.match(/du (\d{4}-\d{2}-\d{2}) au (\d{4}-\d{2}-\d{2})/))) {
    if (m[1] <= m[2])
      return { start: m[1], end: m[2], kind: "explicit_range", months: [], explicit_year: true };
  }

  // 2) N derniers jours — fenêtre finissant HIER (le jour en cours est incomplet)
  if ((m = q.match(/(\d{1,3}) derniers? jours/))) {
    const n = Number(m[1]);
    if (n >= 1) {
      const end = addDaysYmd(opts.today, -1);
      return { start: addDaysYmd(end, -(n - 1)), end, kind: "last_n_days", months: [], explicit_year: false };
    }
  }

  // 3) semaine dernière/passée — semaine CIVILE précédente, lundi → dimanche
  if (/semaine (derniere|passee)/.test(q)) {
    const dow = new Date(opts.today + "T00:00:00Z").getUTCDay(); // 0=dim..6=sam
    const sinceMonday = (dow + 6) % 7; // jours écoulés depuis lundi
    const lastMonday = addDaysYmd(opts.today, -(sinceMonday + 7));
    return {
      start: lastMonday,
      end: addDaysYmd(lastMonday, 6),
      kind: "last_week",
      months: [],
      explicit_year: false,
    };
  }

  // 4) mois dernier/passé — mois civil précédent
  if (/mois (dernier|passe)/.test(q)) {
    const y = t.m === 1 ? t.y - 1 : t.y;
    const mo = t.m === 1 ? 12 : t.m - 1;
    return {
      start: ymd(y, mo, 1),
      end: ymd(y, mo, lastDayOfMonth(y, mo)),
      kind: "last_month",
      months: [mo],
      explicit_year: false,
    };
  }

  // 5) ce mois / mois en cours / mois-ci — 1er → aujourd'hui
  if (/ce mois|mois en cours|mois[- ]ci/.test(q)) {
    return {
      start: ymd(t.y, t.m, 1),
      end: opts.today,
      kind: "this_month",
      months: [t.m],
      explicit_year: false,
    };
  }

  // 5bis) DEPUIS — « depuis janvier », « depuis le 15/06[/2026] » → jusqu'à AUJOURD'HUI
  //       (la fenêtre inclut le jour en cours ; les lecteurs bornent eux-mêmes à ≤ today).
  if ((m = q.match(new RegExp(`depuis (?:le )?(${MONTH_ALT})(?: (\\d{4}))?`)))) {
    const mo = MONTHS_FR_EN[m[1]];
    const y = m[2] ? Number(m[2]) : yearForMonth(mo, t.y, t.m, bias === "future" ? "past" : bias);
    return { start: ymd(y, mo, 1), end: opts.today, kind: "since", months: [mo], explicit_year: m[2] != null };
  }
  if ((m = q.match(/depuis le (\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/))) {
    const dd = Number(m[1]), mo = Number(m[2]);
    const y = m[3] ? Number(m[3]) : yearForMonth(mo, t.y, t.m, "past");
    if (mo >= 1 && mo <= 12 && isValidYmd(y, mo, dd)) {
      return { start: ymd(y, mo, dd), end: opts.today, kind: "since", months: [], explicit_year: m[3] != null };
    }
  }

  // 5ter) TRIMESTRE CIVIL — « ce trimestre / le trimestre » (en cours, 1er jour → aujourd'hui),
  //       « trimestre dernier/passé », « T2 » / « 2e trimestre » (biais d'année comme un mois).
  {
    const qStartMonth = (qq: number): number => (qq - 1) * 3 + 1;
    if (/trimestre (dernier|passe)/.test(q)) {
      const curQ = Math.floor((t.m - 1) / 3) + 1;
      const py = curQ === 1 ? t.y - 1 : t.y;
      const pq = curQ === 1 ? 4 : curQ - 1;
      const sm = qStartMonth(pq);
      return { start: ymd(py, sm, 1), end: ymd(py, sm + 2, lastDayOfMonth(py, sm + 2)), kind: "quarter", months: [sm, sm + 1, sm + 2], explicit_year: false };
    }
    if (/(ce|le) trimestre|trimestre en cours/.test(q)) {
      const curQ = Math.floor((t.m - 1) / 3) + 1;
      const sm = qStartMonth(curQ);
      return { start: ymd(t.y, sm, 1), end: opts.today, kind: "quarter", months: [sm, sm + 1, sm + 2], explicit_year: false };
    }
    if ((m = q.match(/\bt([1-4])\b|\b([1-4])(?:er|e|eme)? trimestre/))) {
      const qq = Number(m[1] || m[2]);
      const sm = qStartMonth(qq);
      const y = yearForMonth(sm + 2, t.y, t.m, bias); // biais sur le mois de FIN du trimestre
      return { start: ymd(y, sm, 1), end: ymd(y, sm + 2, lastDayOfMonth(y, sm + 2)), kind: "quarter", months: [sm, sm + 1, sm + 2], explicit_year: false };
    }
  }

  // 5quater) SAISONS MÉTÉOROLOGIQUES (mois civils pleins) — printemps mars-mai, été juin-août,
  //          automne sept-nov, HIVER déc-fév (à cheval : décembre de l'année précédant février).
  //          « dernier/passé » force l'occurrence précédente ; sinon biais (passé = la plus
  //          récente déjà commencée).
  if ((m = q.match(/\b(printemps|ete|automne|hiver)\b( dernier| passe)?/))) {
    const SEASON_START: Record<string, number> = { printemps: 3, ete: 6, automne: 9, hiver: 12 };
    const sm = SEASON_START[m[1]];
    const em = sm === 12 ? 2 : sm + 2;
    // Biais passé : candidate = l'occurrence dont la FIN tombe l'année courante (hiver : début
    // en décembre de l'année précédente), reculée d'un an si elle n'a pas COMMENCÉ. C'est ce
    // qui rend « cet hiver » correct en janvier (l'hiver EN COURS, commencé en décembre) comme
    // en août (l'hiver déc-fév déjà passé). Biais futur : la prochaine à venir.
    let ey = t.y;
    let sy = sm === 12 ? ey - 1 : ey;
    if (bias === "future") {
      if (ymd(ey, em, lastDayOfMonth(ey, em)) < opts.today) { ey += 1; sy += 1; }
    } else if (ymd(sy, sm, 1) > opts.today) { ey -= 1; sy -= 1; }
    if (m[2]) { ey -= 1; sy -= 1; }
    return { start: ymd(sy, sm, 1), end: ymd(ey, em, lastDayOfMonth(ey, em)), kind: "season", months: sm === 12 ? [12, 1, 2] : [sm, sm + 1, em], explicit_year: false };
  }

  // 6) PLAGE DE MOIS — « juin-juillet », « de juin à juillet », « entre juin et
  //    juillet », « juin et juillet », années optionnelles sur chaque mois.
  const RANGE_RES = [
    new RegExp(
      `(?:de |d')(${MONTH_ALT})(?: (20\\d{2}))? (?:a|au|jusqu'a) (${MONTH_ALT})(?: (20\\d{2}))?`
    ),
    new RegExp(`entre (${MONTH_ALT})(?: (20\\d{2}))? et (${MONTH_ALT})(?: (20\\d{2}))?`),
    new RegExp(`(?:^|[^a-z])(${MONTH_ALT})(?: (20\\d{2}))? ?[-–—/] ?(${MONTH_ALT})(?: (20\\d{2}))?`),
    new RegExp(`(?:^|[^a-z])(${MONTH_ALT})(?: (20\\d{2}))? (?:a|au) (${MONTH_ALT})(?: (20\\d{2}))?`),
    new RegExp(`(?:^|[^a-z])(${MONTH_ALT})(?: (20\\d{2}))? et (${MONTH_ALT})(?: (20\\d{2}))?`),
  ];
  for (const re of RANGE_RES) {
    if (!(m = q.match(re))) continue;
    const mo1 = MONTHS_FR_EN[m[1]];
    const mo2 = MONTHS_FR_EN[m[3]];
    const y1Explicit = m[2] ? Number(m[2]) : null;
    const y2Explicit = m[4] ? Number(m[4]) : null;
    let y1: number, y2: number;
    if (y1Explicit != null && y2Explicit != null) {
      [y1, y2] = [y1Explicit, y2Explicit];
    } else if (y1Explicit != null) {
      y1 = y1Explicit;
      y2 = mo2 >= mo1 ? y1 : y1 + 1;
    } else if (y2Explicit != null) {
      y2 = y2Explicit;
      y1 = mo1 <= mo2 ? y2 : y2 - 1;
    } else if (bias === "future") {
      y1 = yearForMonth(mo1, t.y, t.m, "future");
      y2 = mo2 >= mo1 ? y1 : y1 + 1;
    } else {
      y2 = yearForMonth(mo2, t.y, t.m, "past");
      y1 = mo1 <= mo2 ? y2 : y2 - 1;
    }
    const start = ymd(y1, mo1, 1);
    const end = ymd(y2, mo2, lastDayOfMonth(y2, mo2));
    if (start > end) continue; // années explicites incohérentes → pas une plage
    return { start, end, kind: "month_range", months: [mo1, mo2], explicit_year: y1Explicit != null || y2Explicit != null };
  }

  // 7) MOIS SEUL — « en juin », « juin 2026 »
  if ((m = q.match(new RegExp(`(?:^|[^a-z])(${MONTH_ALT})(?:[^a-z]|$)`)))) {
    const mo = MONTHS_FR_EN[m[1]];
    const ym = q.match(/(?:^|[^\d])(20\d{2})(?:[^\d]|$)/);
    const y = ym ? Number(ym[1]) : yearForMonth(mo, t.y, t.m, bias);
    return {
      start: ymd(y, mo, 1),
      end: ymd(y, mo, lastDayOfMonth(y, mo)),
      kind: "month",
      months: [mo],
      explicit_year: !!ym,
    };
  }

  return null;
}
