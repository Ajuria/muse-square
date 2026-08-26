import { describe, expect, it } from "vitest";
import { addDaysYmd, daysInRangeYmd, lastDayOfMonth, resolveFrPeriod } from "./frPeriod";

// 2026-08-26 est un mercredi — ancre fixe, aucun test ne lit l'horloge.
const TODAY = "2026-08-26";
const past = (q: string) => resolveFrPeriod(q, { today: TODAY, yearBias: "past" });
const future = (q: string) => resolveFrPeriod(q, { today: TODAY, yearBias: "future" });

describe("plage de mois — le cas « juin-juillet » refusé par l'owner", () => {
  it.each([
    "mes ventes de juin-juillet",
    "rapport juin - juillet",
    "de juin à juillet",
    "de juin a juillet",
    "entre juin et juillet",
    "juin et juillet",
    "juin à juillet",
    "juin/juillet",
  ])("%s → 01/06 → 31/07 de l'année en cours (biais passé)", (q) => {
    const p = past(q);
    expect(p).not.toBeNull();
    expect(p!.kind).toBe("month_range");
    expect(p!.start).toBe("2026-06-01");
    expect(p!.end).toBe("2026-07-31");
  });

  it("biais futur (planification) → prochaine occurrence, comme l'historique mono-mois", () => {
    const p = future("les meilleurs jours de juin à juillet");
    expect(p!.start).toBe("2027-06-01");
    expect(p!.end).toBe("2027-07-31");
  });

  it("année explicite sur un seul des deux mois suffit", () => {
    const p = past("de juin 2025 à juillet");
    expect(p!.start).toBe("2025-06-01");
    expect(p!.end).toBe("2025-07-31");
    expect(p!.explicit_year).toBe(true);
  });

  it("à cheval sur l'année : décembre-janvier (biais passé)", () => {
    const p = past("décembre-janvier");
    expect(p!.start).toBe("2025-12-01");
    expect(p!.end).toBe("2026-01-31");
  });

  it("à cheval sur l'année : décembre-janvier (biais futur)", () => {
    const p = future("décembre-janvier");
    expect(p!.start).toBe("2026-12-01");
    expect(p!.end).toBe("2027-01-31");
  });

  it("années explicites incohérentes (juillet 2026 → juin 2025) ≠ plage", () => {
    const p = past("de juillet 2026 à juin 2025");
    expect(p?.kind).not.toBe("month_range");
  });
});

describe("mois seul — le biais d'année remplace le « toujours l'an prochain »", () => {
  it("« mes ventes de juin » (biais passé) → juin de CETTE année, pas 2027", () => {
    const p = past("mes ventes de juin");
    expect(p!.kind).toBe("month");
    expect(p!.start).toBe("2026-06-01");
    expect(p!.end).toBe("2026-06-30");
  });

  it("« décembre » au biais passé → l'occurrence déjà passée (2025)", () => {
    const p = past("qu'est-ce qui s'est passé en décembre ?");
    expect(p!.start).toBe("2025-12-01");
  });

  it("« juin » au biais futur → prochaine occurrence (2027) — comportement historique", () => {
    const p = future("organiser un événement en juin");
    expect(p!.start).toBe("2027-06-01");
  });

  it("« septembre » au biais futur → 2026 (pas encore passé)", () => {
    const p = future("les meilleurs jours de septembre");
    expect(p!.start).toBe("2026-09-01");
  });

  it("année explicite : « juin 2026 » identique sous les deux biais", () => {
    expect(past("rapport de juin 2026")!.start).toBe("2026-06-01");
    expect(future("rapport de juin 2026")!.start).toBe("2026-06-01");
    expect(past("rapport de juin 2026")!.explicit_year).toBe(true);
  });

  it("février bissextile : « février 2028 » finit le 29", () => {
    expect(past("février 2028")!.end).toBe("2028-02-29");
  });

  it("mois anglais acceptés (« june »)", () => {
    expect(past("sales in june")!.start).toBe("2026-06-01");
  });
});

describe("plages explicites et formes relatives", () => {
  it("du JJ/MM/AAAA au JJ/MM/AAAA — lecture FRANÇAISE jour/mois", () => {
    const p = past("le rapport du 01/06/2026 au 31/07/2026");
    expect(p!.kind).toBe("explicit_range");
    expect(p!.start).toBe("2026-06-01");
    expect(p!.end).toBe("2026-07-31");
  });

  it("du YYYY-MM-DD au YYYY-MM-DD (forme ISO recopiée)", () => {
    const p = past("du 2026-06-01 au 2026-07-31");
    expect(p!.start).toBe("2026-06-01");
    expect(p!.end).toBe("2026-07-31");
  });

  it("bornes inversées → pas de plage explicite", () => {
    expect(past("du 05/06/2026 au 01/06/2026")).toBeNull();
  });

  it("30 derniers jours → fenêtre finissant hier", () => {
    const p = past("les 30 derniers jours");
    expect(p!.end).toBe("2026-08-25");
    expect(p!.start).toBe("2026-07-27");
    expect(daysInRangeYmd(p!.start, p!.end)).toBe(30);
  });

  it("semaine dernière → semaine civile lundi → dimanche", () => {
    const p = past("mes ventes de la semaine dernière");
    expect(p!.kind).toBe("last_week");
    expect(p!.start).toBe("2026-08-17");
    expect(p!.end).toBe("2026-08-23");
  });

  it("mois dernier → mois civil précédent", () => {
    const p = past("le mois dernier");
    expect(p!.start).toBe("2026-07-01");
    expect(p!.end).toBe("2026-07-31");
  });

  it("mois dernier en janvier → décembre de l'année précédente", () => {
    const p = resolveFrPeriod("le mois dernier", { today: "2026-01-15" });
    expect(p!.start).toBe("2025-12-01");
    expect(p!.end).toBe("2025-12-31");
  });

  it("ce mois → du 1er à aujourd'hui", () => {
    const p = past("mes ventes de ce mois");
    expect(p!.start).toBe("2026-08-01");
    expect(p!.end).toBe(TODAY);
  });
});

describe("non-déclenchements — un mot n'est pas un mois", () => {
  it.each([
    "pourquoi mes ventes baissent ?",
    "je ne vends jamais le lundi", // « mai » dans « jamais »
    "maintenant", // « mai » en tête de mot
    "entre le 3 et le 5",
    "demain",
  ])("%s → null", (q) => {
    expect(past(q)).toBeNull();
  });
});

describe("helpers de dates", () => {
  it("addDaysYmd traverse les mois et les années", () => {
    expect(addDaysYmd("2026-06-01", 29)).toBe("2026-06-30");
    expect(addDaysYmd("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysYmd("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("lastDayOfMonth connaît les mois de 30/31 jours et février", () => {
    expect(lastDayOfMonth(2026, 6)).toBe(30);
    expect(lastDayOfMonth(2026, 7)).toBe(31);
    expect(lastDayOfMonth(2028, 2)).toBe(29);
  });

  it("daysInRangeYmd est inclusif", () => {
    expect(daysInRangeYmd("2026-06-01", "2026-06-30")).toBe(30);
    expect(daysInRangeYmd("2026-06-01", "2026-07-31")).toBe(61);
  });
});
