// public/js/volet-ligne.js — UN VOLET S'OUVRE SOUS SA PROPRE LIGNE (owner 14/09).
//
// LE DÉFAUT QU'IL CORRIGE. Quatre surfaces posaient UN conteneur de détail à la fin de la page ou de
// la grille : `#tb-pole-panel`, `#tb-rbodies`, `#tb-rpanel` (Piloter) et `#rp-doc` (Rapports). Ouvrir
// le détail d'un pôle le faisait apparaître sous TOUS les pôles ; ouvrir un modèle de rapport le
// faisait apparaître sous « Vos envois » et « Vos rapports ». Mots de l'owner : « it applies to them
// too ». Ce n'est pas de l'esthétique — la place d'un bloc dans la page est une AFFIRMATION sur ce à
// quoi il se rapporte, et celle-là était fausse.
//
// LA RÈGLE. Le volet est le frère immédiat de sa ligne. Dans une grille, il occupe toute la largeur
// et se place à la fin de la RANGÉE VISUELLE de la tuile touchée — pas après la grille.
//
// POURQUOI LE NOMBRE DE COLONNES SE LIT ET NE SE RECOPIE PAS. `.tb-rbgrid` fait 3 colonnes, et 2 sous
// 640 px. Recopier le point de rupture dans ce fichier le ferait mentir sur le téléphone de l'owner
// au premier changement de CSS : on lit donc les pistes réellement calculées par le navigateur
// (`getComputedStyle(...).gridTemplateColumns`). Un conteneur qui n'est pas une grille rend 1 — une
// liste verticale est une grille à une colonne, et la même règle y donne « juste sous sa ligne ».
(function () {
  "use strict";

  // PUR : l'index de la dernière tuile de la rangée qui contient `index`, dans une grille de `cols`
  // colonnes et `total` tuiles. La dernière rangée est souvent incomplète — d'où le plafond.
  function finDeRangee(index, cols, total) {
    var c = Math.max(1, Math.floor(cols) || 1);
    var n = Math.max(0, Math.floor(total) || 0);
    var i = Math.max(0, Math.floor(index) || 0);
    if (!n) return -1;
    if (i >= n) i = n - 1;
    return Math.min(Math.floor(i / c) * c + c - 1, n - 1);
  }

  // Les pistes que le navigateur a VRAIMENT calculées. « none » (pas une grille) ⇒ 1.
  function colonnes(grille) {
    if (!grille || !grille.nodeType) return 1;
    var v = "";
    try { v = String(window.getComputedStyle(grille).gridTemplateColumns || ""); } catch (e) { v = ""; }
    // « none » (le conteneur n'est pas une grille) compte pour UNE piste : une ligne de liste est une
    // grille à une colonne, et la règle y donne « juste sous sa ligne ». Pas de branche séparée — une
    // mutation a montré qu'elle ne changeait rien, donc elle ne se testait pas.
    v = v.trim();
    return v.split(/\s+/).filter(function (x) { return !!x; }).length || 1;
  }

  // Les tuiles d'un conteneur : ses enfants éléments, SANS le volet (il y vit entre deux ouvertures).
  function tuilesDe(grille, volet) {
    var out = [];
    if (!grille) return out;
    for (var i = 0; i < grille.children.length; i++) {
      var el = grille.children[i];
      if (el !== volet && el.nodeType === 1) out.push(el);
    }
    return out;
  }

  // Place `volet` juste après la rangée de `tuile`. Rend true si la place a changé.
  // CONTRAT : `tuile` est l'ENFANT DIRECT du conteneur (la tuile de la grille, la ligne de la liste).
  // Un clic vise souvent un élément à l'intérieur : l'appelant remonte avec `closest(...)` avant
  // d'appeler — c'est lui qui sait quel sélecteur désigne une ligne chez lui, pas ce fichier.
  function placer(volet, tuile) {
    if (!volet || !tuile) return false;
    var grille = tuile.parentNode;
    if (!grille || grille === volet) return false;
    // Si le volet est ailleurs dans la page, il DÉMÉNAGE dans la grille : c'est tout l'objet.
    var tuiles = tuilesDe(grille, volet);
    var idx = tuiles.indexOf(tuile);
    if (idx < 0) return false;
    var fin = finDeRangee(idx, colonnes(grille), tuiles.length);
    var ancre = tuiles[fin];
    var suivant = ancre ? ancre.nextSibling : null;
    if (volet.parentNode === grille && volet.previousSibling === ancre) { majLargeur(volet, grille); return false; }
    if (suivant) grille.insertBefore(volet, suivant); else grille.appendChild(volet);
    majLargeur(volet, grille);
    volet.setAttribute("data-volet-tuile", "1");
    _suivi = { volet: volet, tuile: tuile };
    return true;
  }

  // Dans une grille, le volet prend la largeur entière ; hors grille, on ne touche à rien.
  function majLargeur(volet, grille) {
    var estGrille = colonnes(grille) > 1 || (function () {
      try { return String(window.getComputedStyle(grille).display || "").indexOf("grid") >= 0; } catch (e) { return false; }
    })();
    if (estGrille) volet.style.gridColumn = "1 / -1"; else volet.style.gridColumn = "";
  }

  // Le nombre de colonnes change avec la largeur de l'écran : un volet ouvert se REPLACE, sinon il
  // reste dans la rangée d'avant et redevient le défaut qu'on corrige.
  var _suivi = null;
  var _t = null;
  function replacer() {
    if (!_suivi || !_suivi.volet || !_suivi.tuile) return;
    if (!document.contains(_suivi.volet) || !document.contains(_suivi.tuile)) { _suivi = null; return; }
    if (_suivi.volet.style.display === "none" || _suivi.volet.hidden) return;
    placer(_suivi.volet, _suivi.tuile);
  }
  if (typeof window !== "undefined" && window.addEventListener) {
    window.addEventListener("resize", function () {
      if (_t) clearTimeout(_t);
      _t = setTimeout(replacer, 120);
    });
  }
  function oublier() { _suivi = null; }

  window.MSVolet = { placer: placer, finDeRangee: finDeRangee, colonnes: colonnes, replacer: replacer, oublier: oublier };
})();
