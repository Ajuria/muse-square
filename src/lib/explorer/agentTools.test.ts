import { describe, expect, it } from "vitest";
import {
  MAX_IMAGE_BYTES, buildAgentTools, familiesToText, polesToText, readSiteFamilies30d, type AgentToolDeps, type ToolCallRecord,
} from "./agentTools";
import { OUTILS_FR } from "./agentSystem.fr";
import { TOURNURES_LLM } from "../fr/tournures.fr";
import { MOTS_BANNIS } from "../fr/evenement.fr";

// Les dépendances simulées : ni BigQuery, ni Clerk, ni réseau — chaque outil se prouve sur sa forme.
function deps(over: Partial<AgentToolDeps> = {}): AgentToolDeps & { records: ToolCallRecord[]; written: any[] } {
  const records: ToolCallRecord[] = [];
  const written: any[] = [];
  const pole = {
    dispositif_id: "d1", name: "Épicerie fine", families: ["Épices", "Thés"], lever: "mise en avant", responsable: "Nadia", commitment_id: "c1",
    components: [
      { dispositif_id: "d1", component_key: "k1", type: "lineaire", type_label_fr: "Linéaire", type_provisoire: false, role: "courant", role_label_fr: "Produits du quotidien", role_provisoire: false, label: "mur d'épices", version_no: 1, created_at: null, pole_name: "Épicerie fine", pole_families: ["Épices", "Thés"] },
      { dispositif_id: "d1", component_key: "k2", type: "caisse", type_label_fr: "Caisse", type_provisoire: false, role: null, role_label_fr: null, role_provisoire: false, label: null, version_no: 1, created_at: null, pole_name: "Épicerie fine", pole_families: ["Épices", "Thés"] },
    ],
  };
  const base: AgentToolDeps = {
    location_id: "loc-1",
    author: { user_id: "user_a", role: "owner" },
    listPoles: async () => [pole as any],
    readFamilies: async () => [{ category: "Épices", revenue_30d: 12000, n_days: 26, avg_day_eur: 462, first_day: "2026-08-12", last_day: "2026-09-10" }],
    readPhotos: async () => [{ photo_id: "p1", dispositif_id: "d1", component_key: "k1", status: "read", checklist: { visible: "oui" }, items_matched: [{ item_code: "E1", item_description: "Zaatar 40 g" }], created_at: "2026-09-01T10:00:00Z", url: "/api/dispositifs/photos?x" }],
    readPhotoBytes: async () => ({ media_type: "image/jpeg", base64: "AAAA", bytes: 4 }),
    readMemory: async () => [],
    writeMemory: async (row) => { written.push(row); },
    record: (r) => records.push(r),
    ...over,
  };
  return Object.assign(base, { records, written });
}
const byName = (tools: any[], name: string) => tools.find((t) => t.name === name);

describe("agentTools — cinq outils, chacun enregistré avec un résumé en français", () => {
  it("expose exactement lire_poles, lire_familles, lire_photos, lire_memoire, ecrire_memoire — et chacun a son libellé", () => {
    const names = buildAgentTools(deps()).map((t: any) => t.name);
    expect(names).toEqual(["lire_poles", "lire_familles", "lire_photos", "lire_memoire", "ecrire_memoire"]);
    for (const n of names) expect(OUTILS_FR[n], n).toBeTruthy();
  });

  it("lire_poles rend les pôles et leurs composants en clair, sans identifiant, et résume « N pôles, M composants »", async () => {
    const d = deps();
    const out = await byName(buildAgentTools(d), "lire_poles").run({});
    expect(out).toContain("Épicerie fine");
    expect(out).toContain("Linéaire (Produits du quotidien) « mur d'épices »");
    expect(out).toContain("responsable : Nadia");
    expect(out).not.toContain("d1");
    expect(d.records[0]).toMatchObject({ name: "lire_poles", ok: true, summary: "1 pôle, 2 composants" });
  });

  it("lire_poles dit l'absence quand aucun pôle n'est déclaré", async () => {
    const d = deps({ listPoles: async () => [] });
    expect(await byName(buildAgentTools(d), "lire_poles").run({})).toBe("Aucun pôle déclaré sur ce site.");
    expect(d.records[0].summary).toBe("aucun pôle déclaré");
  });

  it("lire_familles porte la fenêtre (du JJ/MM/AAAA au JJ/MM/AAAA) et le CA par jour", async () => {
    const d = deps();
    const out = await byName(buildAgentTools(d), "lire_familles").run({});
    expect(out).toContain("du 12/08/2026 au 10/09/2026");
    expect(out).toMatch(/Épices — 12\s?000 € sur 26 jours, soit 462 € par jour/);
    expect(d.records[0].summary).toBe("1 famille sur 30 jours mesurés (du 12/08/2026 au 10/09/2026)");
  });

  it("lire_photos rend le texte de la photo, l'image en bloc, et compte les composants sans photo", async () => {
    const d = deps();
    const out = await byName(buildAgentTools(d), "lire_photos").run({});
    expect(Array.isArray(out)).toBe(true);
    expect(out[0].type).toBe("text");
    expect(out[0].text).toContain("1 photo lue, 1 composant sans photo.");
    expect(out[0].text).toContain("Zaatar 40 g");
    expect(out[0].text).not.toContain("/api/dispositifs/photos");
    expect(out[0].text).toContain("sans photo : Caisse");
    expect(out.find((b: any) => b.type === "image")).toMatchObject({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "AAAA" } });
    expect(d.records[0].summary).toBe("1 photo lue, 1 image regardée, 1 composant sans photo");
  });

  it("lire_photos filtre par nom de pôle (accents et casse ignorés) et refuse un nom inconnu en listant les pôles", async () => {
    const d = deps();
    const t = byName(buildAgentTools(d), "lire_photos");
    expect((await t.run({ pole: "epicerie" }))[0].text).toContain("1 photo lue");
    expect((await t.run({ pole: "traiteur" }))[0].text).toContain("Aucun pôle dont le nom contient « traiteur ». Pôles du site : Épicerie fine.");
  });

  it("lire_photos laisse une image trop lourde et le dit", async () => {
    const d = deps({ readPhotoBytes: async () => ({ media_type: "image/jpeg", base64: "x", bytes: MAX_IMAGE_BYTES + 1 }) });
    const out = await byName(buildAgentTools(d), "lire_photos").run({});
    expect(out[0].text).toContain("1 image trop lourde pour être regardée");
    expect(out.some((b: any) => b.type === "image")).toBe(false);
  });

  it("lire_memoire lit par sujet et résume le compte", async () => {
    const d = deps({ readMemory: async (s) => (s === "vitrine" ? [{ memory_id: "m", location_id: "loc-1", subject: "vitrine", body: "Épices côté rue.", author_user_id: "u", author_role: "owner", source: "conversation", created_at: "2026-09-11T08:00:00Z" }] : []) });
    const t = byName(buildAgentTools(d), "lire_memoire");
    expect(await t.run({ sujet: "vitrine" })).toContain("• vitrine — Épices côté rue. (exploitant, 11/09/2026)");
    expect(await t.run({})).toBe("Aucune note en mémoire pour ce site.");
    expect(d.records.map((r) => r.summary)).toEqual(["1 sujet noté", "rien de noté sur cet espace"]);
  });

  it("ecrire_memoire écrit une ligne au nom de l'auteur (site, rôle), source conversation par défaut", async () => {
    const d = deps();
    const out = await byName(buildAgentTools(d), "ecrire_memoire").run({ sujet: "Sens de circulation", contenu: "Nous entrons par la droite." });
    expect(out).toMatch(/^Enregistré — sujet « sens de circulation », le \d{2}\/\d{2}\/\d{4}\.$/);
    expect(d.written[0]).toMatchObject({ location_id: "loc-1", subject: "sens de circulation", body: "Nous entrons par la droite.", author_user_id: "user_a", author_role: "owner", source: "conversation", superseded: false });
    expect(d.records[0].summary).toBe("« sens de circulation » enregistré");
  });

  it("ecrire_memoire avec retirer écrit un retrait ; un échec d'écriture est enregistré comme tel et remonte", async () => {
    const d = deps();
    await byName(buildAgentTools(d), "ecrire_memoire").run({ sujet: "vitrine", contenu: "", retirer: true });
    expect(d.written[0]).toMatchObject({ subject: "vitrine", superseded: true });
    const bad = deps({ writeMemory: async () => { throw new Error("insert refusé"); } });
    await expect(byName(buildAgentTools(bad), "ecrire_memoire").run({ sujet: "x", contenu: "y" })).rejects.toThrow("insert refusé");
    expect(bad.records[0]).toMatchObject({ name: "ecrire_memoire", ok: false, summary: "échec : insert refusé" });
  });
});

describe("agentTools — la lecture des familles passe par la vue semantic jour × famille", () => {
  it("lit vw_insight_event_client_offering_daily sur 30 jours MESURÉS (bornés au dernier jour du site), jamais raw", async () => {
    const calls: any[] = [];
    const bq = { query: async (q: any) => { calls.push(q); return [[{ item_category: "Thés", revenue_30d: { value: 900 }, n_days: 20, avg_day_eur: 45, first_day: "2026-08-12", last_day: "2026-09-10" }]]; } };
    const out = await readSiteFamilies30d(bq, "loc-1");
    expect(calls[0].query).toMatch(/semantic\.vw_insight_event_client_offering_daily/);
    expect(calls[0].query).not.toMatch(/raw\.client_transactions/);
    expect(calls[0].query).toMatch(/DATE_SUB\(b\.last_day, INTERVAL 30 DAY\)/);
    expect(calls[0].params).toEqual({ location_id: "loc-1" });
    expect(out).toEqual([{ category: "Thés", revenue_30d: 900, n_days: 20, avg_day_eur: 45, first_day: "2026-08-12", last_day: "2026-09-10" }]);
  });
  it("polesToText et familiesToText disent l'absence", () => {
    expect(polesToText([])).toBe("Aucun pôle déclaré sur ce site.");
    expect(familiesToText([])).toBe("Aucune vente lue sur ce site dans la vue jour × famille.");
  });
});

// Les chaînes VISIBLES de l'agent (libellés d'outils du proto, résumés) passent les deux gardes du français
// que evenement.fr.guard.test.ts et tournures.fr.guard.test.ts appliquent aux surfaces listées — ce module
// n'y est pas listé, le même contrôle vit donc ici.
describe("agentTools — les chaînes visibles passent les gardes du français", () => {
  const visibles = [
    ...Object.values(OUTILS_FR),
    "1 pôle, 2 composants", "aucun pôle déclaré", "1 famille sur 30 jours mesurés (du 12/08/2026 au 10/09/2026)", "aucune vente lue",
    "1 photo lue, 1 image regardée, 1 composant sans photo", "aucune photo", "1 sujet noté", "rien de noté sur cet espace",
    "« vitrine » enregistré", "« vitrine » retiré",
  ];
  it("aucune tournure de machine", () => {
    for (const s of visibles) for (const t of TOURNURES_LLM) expect(t.motif.test(s.toLowerCase()), `${s} — ${t.faute}`).toBe(false);
  });
  it("aucun mot banni", () => {
    for (const s of visibles) for (const mot of Object.keys(MOTS_BANNIS)) {
      const re = new RegExp(`(^|[^\\p{L}])${mot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{L}]|$)`, "iu");
      expect(re.test(s), `${s} — « ${mot} » : ${MOTS_BANNIS[mot]}`).toBe(false);
    }
  });
});
