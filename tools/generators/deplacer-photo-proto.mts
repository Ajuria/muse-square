// tools/generators/deplacer-photo-proto.mts — DÉPLACER UNE PHOTO MAL CLASSÉE, ET LE PLAN NUMÉROTÉ
// EN BANDEAU (owner 15/09 : « déplacer la photo et voie b pour plan → prototype »).
//
// Deux décisions de l'owner, prises après l'avis du 15/09 :
//   1. changer le numéro DÉPLACE la photo (écriture sur la photo), il ne re-déclare pas la mesure ;
//   2. le plan numéroté de la vue Dispositif est LE plan de l'exploitant, déposé tel quel (voie b) —
//      pas 52 points relevés un par un (voie a), pas une liste sans carte (voie c).
//
// LE PROTO NE CODE RIEN DE LIVRABLE : il rend les écrans à arbitrer, sur les VRAIES lignes du compte
// de l'owner (52 composants numérotés 1 à 52, 10 photos dont 3 numérotées). Toutes les chaînes qu'il
// affiche sont des PROPOSITIONS — le lexique ne les porte pas encore, et elles sont marquées telles.
//
// Usage : npx tsx tools/generators/deplacer-photo-proto.mts
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { makeBQClient } from "../../src/lib/bq";

const P = "muse-square-open-data";
const LOC = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
const SORTIE = "tools/proto/deplacer-photo-proto.html";
const bq = makeBQClient(process.env.BQ_PROJECT_ID || P);
const v = (x: any): any => (x && typeof x === "object" && "value" in x ? x.value : x);

// LE NOM DU MEUBLE VIENT DE LA BASE, il ne se fabrique pas. Les 52 composants du compte portent un
// `component_label` qui dit déjà le numéro ET le repère du plan — « N° 2 — Vin & Spiritueux », « N° 24 —
// Ilot maison ». Mon premier jet composait « N° 7 · Cave » à partir du numéro et du pôle : il jetait la
// moitié informative du nom, et toutes les phrases du geste se mettaient à parler en codes. Verdict de
// l'owner sur les trois : « je ne comprends pas ».
const [comps] = await bq.query({
  query: `SELECT m.fixture_no, m.component_key, m.dispositif_id, c.committed_action_text AS pole, m.linear_m_facade,
                 vc.component_label AS nom
          FROM (SELECT * EXCEPT(rn) FROM (
                  SELECT dispositif_id, component_key, fixture_no, linear_m_facade,
                         ROW_NUMBER() OVER (PARTITION BY dispositif_id, component_key ORDER BY created_at DESC) rn
                  FROM \`${P}.analytics.space_measures\`
                  WHERE location_id = @loc AND component_key IS NOT NULL) WHERE rn = 1) m
          LEFT JOIN (SELECT DISTINCT dispositif_id, committed_action_text
                     FROM \`${P}.analytics.action_commitments\`
                     WHERE location_id = @loc AND dispositif_nature = 'permanent') c ON c.dispositif_id = m.dispositif_id
          LEFT JOIN \`${P}.semantic.vw_insight_event_dispositif_components\` vc
                 ON vc.location_id = @loc AND vc.dispositif_id = m.dispositif_id AND vc.component_key = m.component_key
          WHERE m.fixture_no IS NOT NULL ORDER BY m.fixture_no`,
  params: { loc: LOC }, location: "EU",
});
const MEUBLES = (comps as any[]).map((r) => ({
  no: Number(v(r.fixture_no)), key: String(v(r.component_key)), pole: String(v(r.pole) ?? ""),
  nom: String(v(r.nom) ?? "").trim(),
  m: v(r.linear_m_facade) == null ? null : Number(v(r.linear_m_facade)),
}));
const sansNom = MEUBLES.filter((x) => !x.nom).length;
console.log(`noms lus en base : ${MEUBLES.length - sansNom}/${MEUBLES.length} (exemple : « ${MEUBLES[1]?.nom ?? "?"} »)`);

const [phs] = await bq.query({
  query: `SELECT p.photo_id, p.fixture_no, p.component_key, p.version_no, p.created_at, p.status,
                 c.committed_action_text AS pole
          FROM \`${P}.analytics.dispositif_photos\` p
          LEFT JOIN (SELECT DISTINCT dispositif_id, committed_action_text
                     FROM \`${P}.analytics.action_commitments\`
                     WHERE location_id = @loc AND dispositif_nature = 'permanent') c ON c.dispositif_id = p.dispositif_id
          WHERE p.location_id = @loc ORDER BY p.created_at DESC`,
  params: { loc: LOC }, location: "EU",
});
const PHOTOS = (phs as any[]).map((r) => ({
  id: String(v(r.photo_id)), no: v(r.fixture_no) == null ? null : Number(v(r.fixture_no)),
  key: String(v(r.component_key)), pole: String(v(r.pole) ?? ""),
  // JJ/MM/AAAA — jamais l'ISO à l'écran (CLAUDE.md § Localization). Sorti en ISO au premier jet du proto,
  // et visible dès la première capture : la règle vaut aussi pour une maquette.
  quand: (function (iso: string) {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
    return m ? `${m[3]}/${m[2]}/${m[1]} à ${m[4]} h ${m[5]}` : iso;
  })(String(v(r.created_at))),
}));

const croisent = new Set(MEUBLES.slice(0, 8).map((x) => x.pole)).size > 1;
console.log(`meubles numérotés : ${MEUBLES.length} (n° ${MEUBLES[0]?.no}…${MEUBLES[MEUBLES.length - 1]?.no})`);
console.log(`photos : ${PHOTOS.length}, dont ${PHOTOS.filter((p) => p.no != null).length} numérotées`);
console.log(`les numéros traversent les pôles : ${croisent ? "OUI" : "non"}`);

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const J = (x: unknown) => JSON.stringify(x).replace(/</g, "\\u003c");

const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Déplacer une photo + le plan numéroté — proto</title>
<style>
 body{font-family:system-ui,-apple-system,sans-serif;margin:0;padding:26px 18px 70px;background:#F8FAFC;color:#111827;}
 .doc{max-width:880px;margin:0 auto;}
 h1{font-size:19px;margin:0 0 4px;} .sous{font-size:13px;color:#6b7280;margin:0 0 22px;}
 .carte{background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:22px 24px;margin-bottom:20px;}
 .uc{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#111827;margin:0 0 10px;}
 .ligne{background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:10px 14px;margin-bottom:8px;}
 .tete{display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap;}
 .nom{font-size:13px;font-weight:600;} .meta{font-size:12px;color:#6b7280;}
 .cta{font-size:12px;font-weight:500;font-family:inherit;color:#1D3BB3;background:#fff;border:1px solid #1D3BB3;border-radius:8px;padding:4px 10px;cursor:pointer;}
 .cta.alerte{color:#B45309;border-color:#E7C89A;}
 .champ{width:96px;font-size:13px;padding:5px 8px;border:1px solid #e5e7eb;border-radius:8px;font-family:inherit;}
 .vise{font-size:12.5px;margin-top:7px;}
 .ok{color:#0F6E56;} .attention{color:#B45309;} .gris{color:#6b7280;}
 .note{font-size:12.5px;color:#374151;background:#fafbfd;border:1px solid #eef1f6;border-radius:10px;padding:12px 15px;line-height:1.6;}
 .depose{border:1.5px dashed #c7cedb;border-radius:12px;padding:26px;text-align:center;color:#6b7280;font-size:13px;background:#FBFCFE;}
 .onglets{display:flex;gap:10px;margin:2px 0 16px;}
 .ong{font-size:13px;font-weight:600;font-family:inherit;cursor:pointer;border-radius:999px;padding:7px 18px;color:#1D3BB3;background:#fff;border:1px solid #1D3BB3;}
 .ong.on{color:#fff;background:#1D3BB3;}
 code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;background:#F3F4F6;padding:1px 5px;border-radius:4px;}
 table{border-collapse:collapse;width:100%;font-size:12.5px;} th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #eef1f6;}
 th{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#6b7280;font-weight:600;}
 .ratifier{font-size:11px;font-weight:600;color:#92610a;background:#FEF6E7;border:1px solid #F5E3C0;border-radius:999px;padding:2px 9px;margin-left:8px;}
</style></head><body><div class="doc">

<h1>Déplacer une photo mal classée · le plan numéroté en bandeau</h1>
<p class="sous">Proto sur les vraies lignes du compte : <b>${MEUBLES.length} meubles numérotés</b> (n° ${MEUBLES[0]?.no} à ${MEUBLES[MEUBLES.length - 1]?.no}),
<b>${PHOTOS.length} photos</b> dont ${PHOTOS.filter((p) => p.no != null).length} portent un numéro.
Toutes les chaînes affichées sont des <b>propositions</b> — elles ne sont pas au lexique.</p>

<div class="carte">
  <div class="uc">1 · Le bandeau suit l'onglet</div>
  <div class="onglets"><button class="ong on" data-o="Dispositif">Dispositif</button><button class="ong" data-o="Performance">Performance</button></div>
  <div data-v="Dispositif">
    <div class="depose" id="zone-plan">
      <div style="font-size:26px;line-height:1;margin-bottom:8px;">▦</div>
      <b style="color:#111827;">Déposez le plan de votre magasin<span class="ratifier">à ratifier</span></b><br>
      Celui que vous lisez déjà, avec ses numéros. Vous y retrouverez vos meubles quand vous corrigez une photo.<br>
      <button class="cta" style="margin-top:12px;" id="simuler-plan">Simuler un plan déposé</button>
    </div>
    <div id="plan-depose" hidden>
      <svg viewBox="0 0 640 260" style="width:100%;height:auto;background:#fff;border:1px solid #e5e7eb;border-radius:10px;">
        <rect x="14" y="14" width="612" height="232" fill="#FBFCFE" stroke="#e5e7eb"/>
        <text x="320" y="118" text-anchor="middle" font-size="13" fill="#9CA3AF">votre plan, tel que vous l'avez déposé</text>
        <text x="320" y="140" text-anchor="middle" font-size="12" fill="#c2c7cf">ses numéros sont déjà dessus — rien à replacer</text>
      </svg>
      <div class="meta" style="margin-top:8px;">Déposé le 15/09/2026 · <button class="cta" style="padding:2px 8px;">Remplacer</button></div>
    </div>
    <div class="note" style="margin-top:12px;"><b>Pourquoi cette voie.</b> Les contours qu'on a en base sont au grain <b>pôle</b> : 11 polygones pour 7 pôles,
    aucune position par meuble. Dessiner les 52 numéros demanderait de les relever un par un. Votre plan les porte déjà imprimés.</div>
  </div>
  <div data-v="Performance" hidden>
    <div class="note">Inchangé : le plan coloré par CA/m², tel qu'il est en production depuis aujourd'hui.</div>
  </div>
</div>

<div class="carte">
  <div class="uc">2 · Le geste, sur une vraie ligne</div>
  <div id="atelier"></div>
  <div class="note" style="margin-top:12px;"><b>Deux touchers, comme « Retirer&nbsp;→ ».</b> Le premier ouvre le champ et dit ce que vise le numéro ;
  le second confirme. Aucun geste destructif au premier toucher — c'est le patron déjà en place sur ce bloc.</div>
</div>

<div class="carte">
  <div class="uc">3 · Ce qui s'écrit — à arbitrer</div>
  <div class="note" style="margin-bottom:12px;">La table des photos est <b>append-only</b>, et la lecture garde <b>la dernière ligne par (version, composant)</b>.
  Une seule écriture ne suffit donc pas : sans marque à l'ancienne place, la photo s'afficherait <b>aux deux endroits</b>.</div>
  <table>
    <thead><tr><th>ordre</th><th>composant</th><th>ce qu'on écrit</th><th>effet sur la lecture</th></tr></thead>
    <tbody>
      <tr><td>1</td><td><code id="w-src">—</code> (l'ancienne place)</td><td><code>status = "deplacee"</code> + <code>deplacee_vers</code></td><td>la ligne cesse de montrer la photo, et dit où elle est partie</td></tr>
      <tr><td>2</td><td><code id="w-dst">—</code> (la nouvelle)</td><td>la même photo, <code>component_key</code> et <code>fixture_no</code> neufs</td><td>la photo apparaît sous le bon meuble</td></tr>
    </tbody>
  </table>
  <div class="note" style="margin-top:12px;"><b>La décision qui vous revient.</b> Aujourd'hui <code>status</code> ne connaît que <code>"read"</code> et <code>"error"</code>.
  Ajouter <code>"deplacee"</code> est une valeur de plus dans une colonne qui existe — aucune migration. Mais toute lecture qui filtre sur <code>status</code>
  doit l'apprendre, sinon une photo déplacée réapparaît quelque part. C'est le seul vrai risque du lot.</div>
</div>

<div class="carte">
  <div class="uc">5 · Les phrases, hors de leur écran — à ratifier</div>
  <div class="note" style="margin-bottom:12px;">Vous n'avez pas compris trois de mes phrases. Elles disaient le <b>mécanisme</b>, avec un nom de meuble
  que j'avais <b>fabriqué</b> (numéro + pôle) alors que vos 52 meubles portent déjà leur nom en base. Voici ce que je propose à la place, à lire seul :</div>
  <table>
    <thead><tr><th>où</th><th>ce que j'avais écrit</th><th>ce que je propose</th></tr></thead>
    <tbody>
      <tr><td>la ligne quittée</td><td class="gris">Cette photo est passée au n° 7 · Cave</td>
          <td><b>Aucune photo ici — vous l'avez déplacée sur le N° 7 — Vin &amp; Spiritueux.</b> + Annuler</td></tr>
      <tr><td>la ligne d'arrivée</td><td class="gris">Photo du 14/09/2026 · arrivée du n° 4</td>
          <td><b>Photo du 14/09/2026 à 20 h 12</b> — rien de plus. Le trajet se lit sur la ligne quittée, où se trouve l'annulation.</td></tr>
      <tr><td>ce qui s'écrit</td><td class="gris">p7 (n° 7) (la nouvelle)</td>
          <td><b>N° 7 — Vin &amp; Spiritueux</b>. Une clé interne ne se montre jamais.</td></tr>
      <tr><td>le bouton</td><td class="gris">—</td><td><b>Déplacer →</b></td></tr>
      <tr><td>le dépôt du plan</td><td class="gris">—</td><td><b>Déposez le plan de votre magasin</b></td></tr>
    </tbody>
  </table>
  <div class="note" style="margin-top:12px;"><b>Ce que je ne décide pas.</b> Aucune de ces phrases n'est au lexique. Dites-moi vos mots —
  ou dites « celles-là » — et elles y entrent dans le commit qui les livre. Un concept sans votre mot ne s'invente pas.</div>
</div>

<div class="carte">
  <div class="uc">4 · Ce que les données disent, et qui change le geste</div>
  <div class="note"><b>Les numéros traversent les pôles.</b> Sur votre plan : n° 1, 2, 4, 7, 8 sont en <b>Cave</b> ; n° 3, 5, 6 en <b>Cuisine</b>.
  Un numéro tapé de travers ne déplace donc pas seulement la photo de meuble — il peut la faire <b>changer de pôle</b>, et avec elle les articles
  qu'elle a fait lire (« Articles des photos » du pôle). Le geste doit le DIRE avant de confirmer, jamais après.<br><br>
  <b>Une photo sur deux n'a pas de numéro.</b> ${PHOTOS.filter((p) => p.no == null).length} de vos ${PHOTOS.length} photos sont antérieures au champ.
  « Pas de numéro » est donc un état normal de départ, pas une anomalie : le champ s'ouvre vide, il ne se pré-remplit pas d'un numéro inventé.</div>
</div>

<script>
var MEUBLES = ${J(MEUBLES)};
var PHOTOS = ${J(PHOTOS)};
var parNo = {}; MEUBLES.forEach(function (m) { parNo[m.no] = m; });
var e = function (s) { return String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); };
var fr1 = function (n) { return String(Number(n).toFixed(1)).replace(".", ","); };  // virgule décimale (CLAUDE.md § Localization)

document.querySelectorAll(".ong").forEach(function (b) {
  b.addEventListener("click", function () {
    document.querySelectorAll(".ong").forEach(function (x) { x.classList.toggle("on", x === b); });
    document.querySelectorAll("[data-v]").forEach(function (s) { s.hidden = s.getAttribute("data-v") !== b.getAttribute("data-o"); });
  });
});
document.getElementById("simuler-plan").addEventListener("click", function () {
  document.getElementById("zone-plan").hidden = true;
  document.getElementById("plan-depose").hidden = false;
});

// L'atelier : la photo RÉELLE la plus récente, sur sa ligne, avec le geste.
var photo = PHOTOS[0];
var source = parNo[photo.no] || MEUBLES.find(function (m) { return m.key === photo.key; }) || MEUBLES[0];
var etat = { ouvert: false, saisi: "", deplacee: false, vers: null };

function ligneMeuble(m, contenu) {
  // Le NOM tel qu'il est en base (« N° 4 — Vin & Spiritueux »), jamais un nom recomposé. Le pôle est une
  // information de contexte : il passe à droite, avec la mesure.
  return '<div class="ligne"><div class="tete"><span class="nom">' + e(m.nom || ('N° ' + m.no)) + '</span>'
    + '<span class="meta">' + e(m.pole) + (m.m != null ? ' · ' + fr1(m.m) + ' m de façade' : '') + '</span></div>' + contenu + '</div>';
}
function rendre() {
  var a = document.getElementById("atelier");
  var cible = etat.saisi === "" ? null : parNo[Number(etat.saisi)];
  var vise = "";
  if (etat.ouvert) {
    if (etat.saisi === "") vise = '<div class="vise gris">Tapez le numéro du meuble, tel qu\\'il est sur votre plan.</div>';
    else if (!cible) vise = '<div class="vise attention">Aucun meuble ne porte le n° ' + e(etat.saisi) + ' sur votre plan.</div>';
    else if (cible.pole !== source.pole) vise = '<div class="vise attention"><b>' + e(cible.nom) + '</b> — ce meuble est dans le pôle ' + e(cible.pole) + ', pas ' + e(source.pole) + '. Les articles lus sur cette photo passeront de ' + e(source.pole) + ' à ' + e(cible.pole) + '.</div>';
    else vise = '<div class="vise ok"><b>' + e(cible.nom) + '</b> · ' + e(cible.pole) + (cible.m != null ? ' · ' + fr1(cible.m) + ' m de façade' : '') + '</div>';
  }
  var bloc;
  if (!etat.deplacee) {
    bloc = '<div class="meta" style="margin-top:6px;">Photo du ' + e(photo.quand) + (photo.no == null ? ' · <span class="attention">sans numéro</span>' : '') + '</div>'
      + '<div style="margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">'
      + '<button class="cta alerte">Retirer →</button>'
      + '<button class="cta" id="b-depl">Déplacer →</button>'
      + (etat.ouvert ? '<input class="champ" id="c-no" inputmode="numeric" placeholder="N° sur le plan" value="' + e(etat.saisi) + '">'
          + '<button class="cta" id="b-ok"' + (cible ? '' : ' disabled style="opacity:.45;cursor:default;"') + '>Confirmer →</button>' : '')
      + '</div>' + vise;
    a.innerHTML = ligneMeuble(source, bloc);
  } else {
    // L'ANCIENNE LIGNE dit ce que l'exploitant A FAIT, pas ce que l'app a enregistré : sujet « vous »,
    // verbe = son geste, et le meuble d'arrivée NOMMÉ. « Cette photo est passée au n° 7 · Cave » disait
    // le mécanisme avec un nom fabriqué — verdict owner : « je ne comprends pas ».
    // LA NOUVELLE LIGNE ne dit RIEN de plus qu'une photo ordinaire. « arrivée du n° 4 » racontait le
    // trajet à quelqu'un qui vient de le faire : l'ancienne ligne porte déjà l'annulation.
    var c = etat.vers;
    a.innerHTML = ligneMeuble(source, '<div class="meta" style="margin-top:6px;">Aucune photo ici — vous l\\'avez déplacée sur le ' + e(c.nom)
        + '. <button class="cta" style="padding:2px 8px;" id="b-annul">Annuler</button></div>')
      + ligneMeuble(c, '<div class="meta" style="margin-top:6px;">Photo du ' + e(photo.quand) + '</div>');
  }
  // AUCUNE CLÉ INTERNE À L'ÉCRAN (mémoire « jamais d'identifiant montré ») : « p7 (n° 7) » ne veut rien
  // dire pour personne. Le tableau nomme les meubles comme la page les nomme.
  document.getElementById("w-src").textContent = source.nom;
  document.getElementById("w-dst").textContent = etat.vers ? etat.vers.nom : "—";
  var bd = document.getElementById("b-depl"); if (bd) bd.addEventListener("click", function () { etat.ouvert = true; rendre(); });
  var cn = document.getElementById("c-no");
  if (cn) { cn.addEventListener("input", function () { etat.saisi = cn.value.trim(); rendre(); document.getElementById("c-no").focus(); }); }
  var bo = document.getElementById("b-ok");
  if (bo && cible) bo.addEventListener("click", function () { etat.deplacee = true; etat.vers = cible; rendre(); });
  var ba = document.getElementById("b-annul");
  if (ba) ba.addEventListener("click", function () { etat = { ouvert: false, saisi: "", deplacee: false, vers: null }; rendre(); });
}
rendre();
</script>
</div></body></html>`;

writeFileSync(SORTIE, html, "utf8");
console.log(`Écrit : ${SORTIE}`);
