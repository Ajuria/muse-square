// @vitest-environment happy-dom
// Suite CLIENT — 13/09 (owner : « le versionning du pôle est déclaratif — sa page de réglages ; pas de question »).
// LE VRAI public/js/pole-form.js exécuté dans happy-dom, réseau stubbé : ouvert avec `prefill` (la version
// courante telle que l'API la sert) et `parent_commitment_id`, le formulaire est pré-rempli — familles,
// composants AVEC LEURS CLÉS, mesures — et son enregistrement POSTe la version suivante.
import { readFileSync } from "node:fs";
import { beforeAll, expect, it } from "vitest";

const posts: any[] = [];
let opened = "";
const CTYPES = [
  { value: "vitrine", label_fr: "Vitrine", roles: [] },
  { value: "lineaire", label_fr: "Linéaire", roles: [{ value: "courant", label_fr: "Produits du quotidien" }] },
];
const VERSION_COURANTE = {
  commitment_id: "pole-v1", location_id: "f10c3e58-326e-4e38-947c-d59fcbe51df5", dispositif_id: "d1", version_no: 1,
  committed_action_text: "Cuisine — les robots à hauteur d'œil", owner_person_name: "Camille",
  pole_families: '["Couteaux","Cuisson"]', dispositif_plus: "Fortes marges visibles", dispositif_why: "Le public achète ce qu'il voit",
  dispositif_resources: "1 vendeur",
  components: [
    { key: "k27", type: "vitrine", role: null, label: "Vitrine — Couteaux" },
    { key: "k28", type: "lineaire", role: "courant", label: "Linéaire fond" },
  ],
  space_measures: { components: [{ component_key: "k27", fixture_no: 27, length_m: 2.4, faces: 1, families_share: [{ family: "Couteaux", share: 0.7 }, { family: "Cuisson", share: 0.3 }] }], surface_m2: 18.5 },
};

beforeAll(() => {
  (globalThis as any).fetch = async (u: any, init?: any) => {
    posts.push({ url: String(u), body: JSON.parse(String(init?.body || "{}")) });
    return { ok: true, json: async () => ({ ok: true, commitment_id: "pole-v2" }) } as any;
  };
  (0, eval)(readFileSync("public/js/pole-form.js", "utf8"));
  document.body.innerHTML = '<div id="m"></div>';
  (window as any).MSPoleForm.render(document.getElementById("m"), {
    location_id: VERSION_COURANTE.location_id,
    families: [{ category: "Couteaux", avg_day_eur: 120 }, { category: "Cuisson", avg_day_eur: 80 }, { category: "Thé", avg_day_eur: 60 }],
    owners: ["Camille", "Julen"], takenFamilies: { "Thé": "Petit déjeuner" }, componentTypes: CTYPES,
    prefill: VERSION_COURANTE, parent_commitment_id: VERSION_COURANTE.commitment_id,
    onCreated: (id: string) => { opened = id; },
  });
});

const v = (name: string) => (document.querySelector('[data-ef="' + name + '"]') as HTMLInputElement).value;

it("chaque champ porte la version courante — nom, description, responsable, ressources, plus, pourquoi, surface", () => {
  expect(v("polename")).toBe("Cuisine");
  expect(v("polelever")).toBe("les robots à hauteur d'œil");
  expect(v("poleowner")).toBe("Camille");
  expect(v("poleres")).toBe("1 vendeur");
  expect(v("poleplus")).toBe("Fortes marges visibles");
  expect(v("polewhy")).toBe("Le public achète ce qu'il voit");
  expect(v("polesurface")).toBe("18,5");
});

it("les composants sont là AVEC LEURS CLÉS, leur rôle, leur libellé et leurs mesures (N°, longueur, faces, parts)", () => {
  const rows = Array.from(document.querySelectorAll("[data-ef-comp-row]"));
  expect(rows.map((r) => r.getAttribute("data-ef-comp-key"))).toEqual(["k27", "k28"]);
  const r27 = rows[0] as HTMLElement;
  expect((r27.querySelector("[data-ef-comp-type]") as HTMLSelectElement).value).toBe("vitrine");
  expect((r27.querySelector("[data-ef-comp-label]") as HTMLInputElement).value).toBe("Vitrine — Couteaux");
  expect((r27.querySelector("[data-ef-comp-no]") as HTMLInputElement).value).toBe("27");
  expect((r27.querySelector("[data-ef-comp-len]") as HTMLInputElement).value).toBe("2,4");
  expect((r27.querySelector("[data-ef-comp-faces]") as HTMLSelectElement).value).toBe("1");
  expect((r27.querySelector('[data-ef-comp-share="Couteaux"]') as HTMLInputElement).value).toBe("70");
  const r28 = rows[1] as HTMLElement;
  expect((r28.querySelector("[data-ef-comp-role]") as HTMLSelectElement).value).toBe("courant");
});

it("le bouton dit « Enregistrer → », et l'enregistrement POSTe la version SUIVANTE : parent, familles, clés conservées, mesures", async () => {
  const btn = document.querySelector("[data-ef-pole-submit]") as HTMLButtonElement;
  expect(btn.textContent).toContain("Enregistrer →");
  btn.click();
  await new Promise((r) => setTimeout(r, 30));
  expect(posts.length).toBe(1);
  const b = posts[0].body;
  expect(b.parent_commitment_id).toBe("pole-v1");
  expect(b.dispositif_nature).toBe("permanent");
  expect(b.committed_action_text).toBe("Cuisine — les robots à hauteur d'œil");
  expect(b.pole_families.sort()).toEqual(["Couteaux", "Cuisson"]);
  expect(b.components.map((c: any) => c.key)).toEqual(["k27", "k28"]);           // la continuité passe par la clé
  expect(b.space_measures.components[0]).toMatchObject({ component_key: "k27", fixture_no: "27", length_m: "2,4", faces: "1" });
  expect(b.space_measures.surface_m2).toBe("18,5");
  expect(opened).toBe("pole-v2");                                                // la page s'ouvre sur la version créée
});
