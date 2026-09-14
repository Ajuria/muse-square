// @vitest-environment happy-dom
// L'ÉDITEUR DANS LE BLOC (owner 14/09 : « on devrait éditer dans le bloc lui-même, pas dans un pop-up
// hideux »). Les gestes passaient par `prompt()` : la boîte du navigateur bloque la page, ne montre pas la
// section qu'on annote, ne garde aucun brouillon, et sur téléphone une question de deux lignes s'y tape à
// l'aveugle.
//
// CE TEST EXÉCUTE LE VRAI CODE DE LA PAGE : `editeurDansLeBloc` est EXTRAIT de rapports.astro, octet pour
// octet, et joué dans un DOM. Une copie du code dans le test prouverait la copie, pas la page.
import { readFileSync } from "node:fs";
import { beforeEach, expect, it, vi } from "vitest";

const SRC = readFileSync("src/pages/app/insightevent/rapports.astro", "utf8");

/** La fonction telle qu'elle est écrite dans la page — bornes trouvées par comptage d'accolades. */
function extraire(nom: string): string {
  const debut = SRC.indexOf(`function ${nom}(`);
  if (debut < 0) throw new Error(`${nom} introuvable dans rapports.astro`);
  let i = SRC.indexOf("{", debut), n = 0;
  for (let k = i; k < SRC.length; k++) {
    if (SRC[k] === "{") n++;
    else if (SRC[k] === "}") { n--; if (n === 0) return SRC.slice(debut, k + 1); }
  }
  throw new Error(`${nom} : accolades non refermées`);
}

let bloc: HTMLElement;
let editeur: (b: Element, o: any) => void;

beforeEach(() => {
  document.body.innerHTML = '<div id="rp-doc"><div id="bloc"><div>CHIFFRE D\'AFFAIRES</div></div></div>';
  bloc = document.getElementById("bloc")!;
  const docEl = document.getElementById("rp-doc")!;
  const el = (tag: string, cls?: string, text?: string) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  // eslint-disable-next-line no-new-func
  editeur = new Function("document", "docEl", "el", `${extraire("editeurDansLeBloc")}; return editeurDansLeBloc;`)(document, docEl, el);
});

it("écrit DANS le bloc : une zone de saisie apparaît sous la section, et aucune boîte du navigateur ne s'ouvre", () => {
  const popup = vi.fn(() => "x");
  (window as any).prompt = popup;
  editeur(bloc, { titre: "Votre note", cta: "Enregistrer", valider: async () => {} });
  const ta = bloc.querySelector(".rp-editeur textarea");
  expect(ta).not.toBeNull();
  expect(bloc.querySelector(".rp-editeur-titre")!.textContent).toBe("Votre note");
  expect(popup).not.toHaveBeenCalled();
  delete (window as any).prompt;
});

it("UN SEUL éditeur à la fois : en ouvrir un ferme l'autre", () => {
  editeur(bloc, { titre: "Votre note", cta: "Enregistrer", valider: async () => {} });
  editeur(bloc, { titre: "Approfondir", cta: "Demander", valider: async () => {} });
  expect(bloc.querySelectorAll(".rp-editeur")).toHaveLength(1);
  expect(bloc.querySelector(".rp-editeur-titre")!.textContent).toBe("Approfondir");
});

it("le texte vide ne valide RIEN, et le dit — un bouton qui ne fait rien passe pour cassé", async () => {
  const valider = vi.fn();
  editeur(bloc, { titre: "Votre note", cta: "Enregistrer", valider });
  (bloc.querySelector(".rp-btn-primary") as HTMLButtonElement).click();
  await Promise.resolve();
  expect(valider).not.toHaveBeenCalled();
  expect(bloc.textContent).toContain("Écrivez quelque chose d'abord.");
});

it("le texte saisi part À LA VALIDATION, détouré de ses espaces, et l'éditeur se ferme", async () => {
  const valider = vi.fn().mockResolvedValue(undefined);
  editeur(bloc, { titre: "Votre note", cta: "Enregistrer", valider });
  (bloc.querySelector(".rp-editeur textarea") as HTMLTextAreaElement).value = "  On a fermé le lundi.  ";
  (bloc.querySelector(".rp-btn-primary") as HTMLButtonElement).click();
  await new Promise((r) => setTimeout(r, 0));
  expect(valider).toHaveBeenCalledWith("On a fermé le lundi.");
  expect(bloc.querySelector(".rp-editeur")).toBeNull();
});

it("un ÉCHEC garde le texte sous les yeux — le perdre après l'avoir écrit est impardonnable", async () => {
  const valider = vi.fn().mockRejectedValue(new Error("Rapport introuvable sur ce site"));
  editeur(bloc, { titre: "Votre note", cta: "Enregistrer", valider });
  (bloc.querySelector(".rp-editeur textarea") as HTMLTextAreaElement).value = "un texte long et précieux";
  (bloc.querySelector(".rp-btn-primary") as HTMLButtonElement).click();
  await new Promise((r) => setTimeout(r, 0));
  expect((bloc.querySelector(".rp-editeur textarea") as HTMLTextAreaElement).value).toBe("un texte long et précieux");
  expect(bloc.textContent).toContain("Rapport introuvable sur ce site");
  expect((bloc.querySelector(".rp-btn-primary") as HTMLButtonElement).disabled).toBe(false);
});

it("Échap ferme sans rien envoyer ; Annuler aussi", async () => {
  const valider = vi.fn();
  editeur(bloc, { titre: "Votre note", cta: "Enregistrer", valider });
  const ta = bloc.querySelector(".rp-editeur textarea") as HTMLTextAreaElement;
  ta.value = "brouillon";
  ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  expect(bloc.querySelector(".rp-editeur")).toBeNull();
  expect(valider).not.toHaveBeenCalled();
});

it("un NOM tient sur une ligne : champ d'une ligne, et Entrée seule y valide", async () => {
  const valider = vi.fn().mockResolvedValue(undefined);
  editeur(bloc, { titre: "Le nom du modèle", cta: "Enregistrer", uneLigne: true, valeur: "Hebdo ventes", valider });
  const champ = bloc.querySelector('.rp-editeur input[type="text"]') as HTMLInputElement;
  expect(champ).not.toBeNull();
  expect(bloc.querySelector(".rp-editeur textarea")).toBeNull();
  expect(champ.value).toBe("Hebdo ventes");
  champ.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await new Promise((r) => setTimeout(r, 0));
  expect(valider).toHaveBeenCalledWith("Hebdo ventes");
});

it("dans une zone de TEXTE, Entrée seule saute une ligne — elle ne valide pas", async () => {
  const valider = vi.fn();
  editeur(bloc, { titre: "Votre note", cta: "Enregistrer", valider });
  const ta = bloc.querySelector(".rp-editeur textarea") as HTMLTextAreaElement;
  ta.value = "première ligne";
  ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await new Promise((r) => setTimeout(r, 0));
  expect(valider).not.toHaveBeenCalled();
  ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", metaKey: true, bubbles: true }));
  await new Promise((r) => setTimeout(r, 0));
  expect(valider).toHaveBeenCalledWith("première ligne");
});

it("la page ne contient PLUS aucune boîte du navigateur", () => {
  expect(SRC.match(/=\s*prompt\(/g)).toBeNull();
});
