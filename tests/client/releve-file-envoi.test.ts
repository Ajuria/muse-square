// @vitest-environment happy-dom
// LA FILE D'ENVOI DU RELEVÉ (relevé réel de l'owner, 14/09 : 3 photos écrites sur 5, deux restées
// « a_rattacher » pour toujours).
//
// LE DÉFAUT : `enregistrerTout` se gardait avec `enCours` et RETOURNAIT quand un envoi était en cours. La
// file, elle, était un instantané pris au départ. Une photo prise pendant l'envoi de la précédente
// déclenchait donc un appel qui ne faisait rien, et n'était dans aucune file — personne ne revenait la
// chercher. `enCours` jetait le travail au lieu de le différer.
//
// Ce test EXÉCUTE la vraie fonction, extraite de releve-espace.js octet pour octet.
import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";

const SRC = readFileSync("public/js/releve-espace.js", "utf8");

function extraire(nom: string): string {
  const debut = SRC.indexOf(`function ${nom}(`);
  if (debut < 0) throw new Error(`${nom} introuvable`);
  let n = 0;
  for (let k = SRC.indexOf("{", debut); k < SRC.length; k++) {
    if (SRC[k] === "{") n++;
    else if (SRC[k] === "}") { if (--n === 0) return SRC.slice(debut, k + 1); }
  }
  throw new Error(`${nom} : accolades non refermées`);
}

/** Monte `enregistrerTout` avec des dépendances de test — le corps reste celui du fichier. */
function monter(items: any[], envoyer: (p: any) => Promise<any>, verdictEnCours: (i: any) => boolean = () => false) {
  const gardees = () => items;
  const poleByName = () => ({ dispositif_id: "d1" });
  (window as any).MSPhotoCapture = { envoyer };
  const MSPhotoCapture = (window as any).MSPhotoCapture;
  const stub = () => {};
  return new Function(
    // 15/09 : `enregistrerTout` a gagné une dépendance — `verdictEnCours`, qui dit si une photo est
    // encore sous les yeux de l'exploitant avec son bouton « Reprendre ». Elle s'injecte comme les
    // autres ; par défaut elle rend false, donc les quatre cas d'origine sont INCHANGÉS.
    "gardees", "poleByName", "MSPhotoCapture", "avancement", "majLigne", "t", "fetch", "window", "run", "verdictEnCours",
    `var enCours = false; ${extraire("enregistrerTout")}; return enregistrerTout;`,
  )(gardees, poleByName, MSPhotoCapture, stub, stub, () => "", stub, { MSPhotoCapture }, { walkId: "w1" }, verdictEnCours);
}

const item = (comp: string) => ({ comp: { component_key: comp }, etat: "a_rattacher", pole: "Cave" });

it("LE DÉFAUT DU 14/09 : une photo prise PENDANT un envoi est reprise, jamais abandonnée", async () => {
  const items = [item("p1"), item("p2")];
  let n = 0;
  const envoyer = vi.fn(async () => {
    n++;
    // Au premier envoi, deux photos de plus arrivent — exactement le relevé de l'owner.
    if (n === 1) { items.push(item("p7"), item("p8")); }
    return { ok: true, photo: { photo_id: "x" + n, coverage_flag: "entier" } };
  });
  const enregistrerTout = monter(items, envoyer);
  enregistrerTout();
  await new Promise((r) => setTimeout(r, 20));
  expect(envoyer).toHaveBeenCalledTimes(4);
  expect(items.map((i: any) => i.etat)).toEqual(["ecrite", "ecrite", "ecrite", "ecrite"]);
});

it("un second appel PENDANT l'envoi ne double aucune photo", async () => {
  const items = [item("p1"), item("p2"), item("p4")];
  const envoyer = vi.fn(async () => ({ ok: true, photo: { photo_id: "x", coverage_flag: "entier" } }));
  const enregistrerTout = monter(items, envoyer);
  enregistrerTout(); enregistrerTout(); enregistrerTout();
  await new Promise((r) => setTimeout(r, 20));
  expect(envoyer).toHaveBeenCalledTimes(3);
});

it("un ÉCHEC n'arrête pas la file — les photos suivantes partent quand même", async () => {
  const items = [item("p1"), item("p2"), item("p4")];
  let n = 0;
  const envoyer = vi.fn(async () => { n++; if (n === 2) throw new Error("réseau"); return { ok: true, photo: { photo_id: "x", coverage_flag: "entier" } }; });
  const enregistrerTout = monter(items, envoyer);
  enregistrerTout();
  await new Promise((r) => setTimeout(r, 20));
  expect(envoyer).toHaveBeenCalledTimes(3);
  expect(items.map((i: any) => i.etat)).toEqual(["ecrite", "echec", "ecrite"]);
});

it("une photo SANS composant n'est jamais envoyée — la route refuserait une clé inconnue", async () => {
  const items = [{ comp: null, etat: "a_rattacher", pole: "Cave" } as any, item("p1")];
  const envoyer = vi.fn(async () => ({ ok: true, photo: { photo_id: "x", coverage_flag: "entier" } }));
  monter(items, envoyer)();
  await new Promise((r) => setTimeout(r, 20));
  expect(envoyer).toHaveBeenCalledTimes(1);
});

// ── 15/09 (owner) — LE VERDICT RETIENT L'ENVOI.
// « Reprendre » ne doit jamais avoir à effacer une ligne déjà écrite : un échec d'effacement
// laisserait en base une photo que l'exploitant croit reprise. Une photo non partie ne laisse RIEN à
// réparer — donc la file saute celle dont le verdict est encore à l'écran.
it("une photo dont le VERDICT est ouvert n'est pas envoyée — elle part quand la fenêtre se referme", async () => {
  const items = [item("p1"), item("p2")];
  let fenetreOuverte = true;
  const envoyer = vi.fn(async () => ({ ok: true, photo: { photo_id: "x" } }));
  const enregistrer = monter(items, envoyer, (i: any) => fenetreOuverte && i.comp.component_key === "p2");
  await enregistrer();
  await new Promise((r) => setTimeout(r, 10));
  expect(envoyer).toHaveBeenCalledTimes(1);
  expect((envoyer.mock.calls[0] as any[])[0].component_key).toBe("p1");
  // La fenêtre se referme : la photo part, sans avoir été perdue.
  fenetreOuverte = false;
  await enregistrer();
  await new Promise((r) => setTimeout(r, 10));
  expect(envoyer).toHaveBeenCalledTimes(2);
  expect((envoyer.mock.calls[1] as any[])[0].component_key).toBe("p2");
});
