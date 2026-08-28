// scripts/engagement-page-harness.ts — harnais de la PAGE Opération (deux états).
// Appelle le VRAI endpoint /api/commitments/evolution (sa fonction GET, locals simulés :
// les gardes réelles s'exécutent), puis rend le VRAI public/card-kit.js dans un contexte vm.
// Ce que je vérifie est donc exactement ce que la page affiche — même règle que le harnais
// Pulse. Écrit aussi les deux rendus sur disque pour la vérification visuelle au navigateur.
//   npx tsx scripts/engagement-page-harness.ts
import * as fs from "node:fs";
import * as vm from "node:vm";
import * as path from "node:path";
import { GET as evolutionGET } from "../src/pages/api/commitments/evolution";
import { EVOL_COPY } from "../src/lib/commitmentCopy";
import { makeBQClient } from "../src/lib/bq";
import { readLatestSnapshot } from "../src/lib/actionCommitments";
import { resolveCommitment } from "../src/lib/commitmentResolve";
import { leverForWeakFactor, leverForActionType, getBestInClassPlays } from "../src/lib/bestInClassStore";

const LOC = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
const OPEN_ID = "2d99694a-17fa-4486-92e1-548ce588e1f5";   // vacances scolaires — EN COURS
const DONE_ID = "49a325dd-b06f-4cbc-982f-7ab71af70b12";   // Corner producteur — TERMINÉE
const OUT = "/private/tmp/claude-501/-Users-julendeajuriaguerra-Documents-Muse-Square-Muse-Square-Website-muse-square/87b009ad-43cf-4760-b9c9-604d62a51eb5/scratchpad";

let pass = 0, fail = 0;
function ok(label: string, cond: boolean, detail?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`, detail !== undefined ? JSON.stringify(detail).slice(0, 300) : ""); }
}

// Le kit est une IIFE qui s'accroche à window — un contexte vm suffit (renderEvolution est PURE).
function loadKit(): any {
  const src = fs.readFileSync(path.resolve("public/card-kit.js"), "utf8");
  const ctx: any = { window: {}, console };
  ctx.self = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: "card-kit.js" });
  return ctx.window.MSCardKit;
}

async function payload(id: string): Promise<any> {
  const locals = { clerk_user_id: "harness", all_location_ids: [LOC] };
  const res: any = await evolutionGET({
    url: new URL(`http://local/api/commitments/evolution?commitment_id=${id}`),
    locals,
  } as any);
  return res.json();
}

(async () => {
  const kit = loadKit();
  ok("MSCardKit.renderEvolution exposé", typeof kit?.renderEvolution === "function");

  const cases: { label: string; id: string; open: boolean }[] = [
    { label: "EN COURS (vacances scolaires)", id: OPEN_ID, open: true },
    { label: "TERMINÉE (Corner producteur)", id: DONE_ID, open: false },
  ];
  const html: Record<string, string> = {};

  for (const c of cases) {
    console.log(`\n— ${c.label} —`);
    const data = await payload(c.id);
    ok("endpoint ok", data?.ok === true, data?.error);
    if (!data?.ok) continue;
    ok("état attendu", (data.commitment.status === "open") === c.open, data.commitment.status);

    // La lecture est SERVIE par l'endpoint (le bloc n'est pas fabriqué au rendu).
    ok("bloc shape servi", data.shape != null, Object.keys(data));
    if (data.shape) {
      ok("jours comparables", data.shape.ref_days >= 2, data.shape.ref_days);
      // AIGUILLAGE PAR LA MESURE (owner 28/08) : le facteur le plus faible choisit le levier
      // des conseils — la carte d'origine ne décide plus seule.
      if (data.shape.weak_factor) {
        const attendu = leverForWeakFactor(data.shape.weak_factor);
        ok("le facteur le plus faible est nommé", ["tx", "items", "price"].includes(data.shape.weak_factor), data.shape.weak_factor);
        ok("il donne un levier de conseils", attendu != null, { f: data.shape.weak_factor, levier: attendu });
        const levierCarte = leverForActionType(data.commitment.origin_action_type);
        if (attendu && attendu !== levierCarte) {
          // Le test ne se contente pas de la table de correspondance : il vérifie que les
          // dispositifs SERVIS sont bien ceux du levier aiguillé, pas ceux de la carte.
          // (Sans ça, débrancher l'aiguillage passait inaperçu — mutation vue le 28/08.)
          const bqL: any = makeBQClient(process.env.BQ_PROJECT_ID || "muse-square-open-data");
          const [ir] = await bqL.query({
            query: `SELECT client_industry_code FROM \`muse-square-open-data.semantic.vw_insight_event_ai_location_context\` WHERE location_id=@l LIMIT 1`,
            params: { l: LOC }, location: "EU",
          });
          const industrie = String(ir?.[0]?.client_industry_code?.value ?? ir?.[0]?.client_industry_code ?? "");
          const titres = (x: any[]) => x.map((p: any) => p.title).sort().join("|");
          const parFacteur = await getBestInClassPlays(bqL, industrie, attendu, { limit: 9 });
          const parCarte = await getBestInClassPlays(bqL, industrie, levierCarte, { limit: 9 });
          const servis = titres(data.best_in_class || []);
          ok(`dispositifs servis = levier du facteur (${attendu}), pas celui de la carte (${levierCarte})`,
            servis === titres(parFacteur) && servis !== titres(parCarte),
            { servis: servis.slice(0, 60), facteur: titres(parFacteur).slice(0, 60) });
        }
      }
      // UN SEUL RÉFÉRENTIEL (owner 28/08) : les familles se comparent au RÉSULTAT HABITUEL,
      // comme l'en-tête — la somme de leurs écarts vaut donc l'écart de l'en-tête, pas zéro.
      const fSum = data.shape.families.reduce((s: number, f: any) => s + f.delta, 0);
      const gapEnt = (data.shape.actual_eur ?? 0) - (data.shape.expected_eur ?? 0);
      ok("familles : somme des écarts = écart de l'en-tête",
        Math.abs(fSum - gapEnt) <= Math.max(3, data.shape.families.length), { somme: Math.round(fSum), entete: gapEnt });
      if (data.shape.volume) {
        // Plus de décomposition contrefactuelle : on vérifie que la charge utile ne porte
        // QUE des points observés (date + achats + panier), rien de calculé (owner 28/08).
        const v = data.shape.volume;
        ok("achats/panier : uniquement des points de caisse",
          Array.isArray(v.ref) && Array.isArray(v.days) && [...v.ref, ...v.days].every((p: any) =>
            typeof p.date === "string" && Number.isFinite(p.tx) && Number.isFinite(p.basket_eur)),
          Object.keys(v));
        ok("aucun champ contrefactuel", !("ref_tx" in v) && !("contrib_tx_eur" in v), Object.keys(v));
        // La lecture porte sur le jour de l'OPÉRATION, jamais sur le jour de création : le
        // corner producteur (créé le 15/08, opéré le 22/08) parlait du 15/08 sous un
        // en-tête daté du 22/08 (relevé au rendu 28/08).
        if (data.commitment.window_kind === "day_of") {
          ok("jour lu = jour de l'opération, pas de la création",
            v.days.length === 1 && v.days[0].date === String(data.commitment.window_end).slice(0, 10),
            { lu: v.days.map((p: any) => p.date), we: data.commitment.window_end, cree: data.commitment.created_at });
        }
      }
    }
    // z-HIDDEN AT THE BOUNDARY — le contrat de l'endpoint vaut aussi pour le nouveau bloc.
    ok("aucun z dans la charge utile", !/"[a-z_]*z(_raw)?"\s*:/.test(JSON.stringify(data.shape || {})), JSON.stringify(data.shape || {}).slice(0, 120));

    const out = kit.renderEvolution(data, EVOL_COPY);
    html[c.id] = out;
    ok("rendu non vide", typeof out === "string" && out.length > 1000, out?.length);

    // ── Les blocs de l'état ──
    ok("bloc « Votre dispositif » présent", out.includes("Votre dispositif"));
    ok("« Description du dispositif » présente", out.includes("Description du dispositif"));
    ok("bloc « Comprendre le résultat » présent", out.includes("Comprendre le résultat"));
    // La carte porte le niveau qu'elle montre : des FAMILLES (les produits sont dedans).
    ok("carte « Familles de produits »", out.includes("Familles de produits") && !out.includes("Performance des produits vendus"));
    // Le cran produit se déplie en <details> natif — zéro JavaScript ajouté à la page.
    // Marqueur PROPRE au dépliage famille : le <details> qui contient la liste produits
    // (le simple motif <details><summary> matchait le « Comment faire ? » des dispositifs
    // comparables — faux vert attrapé à la mutation, assertion resserrée).
    ok("familles dépliables sur leurs produits",
      /<details[^>]*><summary[^>]*>[\s\S]{0,400}?border-left:2px solid #eef1f6/.test(out) && out.includes("· habituel "));
    ok("aucun câblage JS pour le dépliage", !/data-fam-toggle|data-prod-/.test(out));
    // Titre NEUTRE (owner 28/08 : « D'où vient la fluctuation » présuppose qu'il y en a une).
    ok("carte « Décomposition des ventes » présente", out.includes("Décomposition des ventes"));
    // Le référentiel de CE bloc est nommé avec LE mot du lexique, et ses dates sont dans l'ⓘ
    // (4 occurrences ne font pas une habitude — owner 28/08).
    ok("référentiel nommé « vos jours comparables »", out.includes("vs vos jours comparables"));
    ok("les dates exactes vivent dans l'infobulle", /title="Vos \d+ derniers [a-zé]+s : \d{2}\/\d{2}\/\d{4}/.test(out));
    ok("aucun « habituel » dans le bloc des trois facteurs",
      !/Nombre d\u2019achats[\s\S]{0,900}?habituel/.test(out));
    // Général puis particulier : la décomposition précède les forages (heures, familles).
    // Deux temps nommés : on comprend, puis on décide (ou on conclut, si l'opération est finie).
    ok("la page est coupée en deux temps",
      out.includes(">Comprendre<") && out.includes(c.open ? ">Décider<" : ">Conclure<"));
    ok("la lecture précède la décision",
      out.indexOf(">Comprendre<") < out.indexOf(c.open ? ">Décider<" : ">Conclure<"));
    // Les renvois internes suivent l'ordre réel des cartes (les familles sont passées SOUS
    // la décomposition le 28/08 : « ci-dessus » serait faux).
    ok("aucun renvoi vers le haut pour les familles", !/ouvrez une famille ci-dessus/.test(out));
    // La section ne re-nomme plus de référentiel : le sien est celui de l'en-tête.
    ok("la section ne redit pas un référentiel", !/Comparé à vos \d+ derniers/.test(out));
    ok("décomposition avant les forages",
      out.indexOf("Décomposition des ventes") < out.indexOf("Quels moments")
      && out.indexOf("Décomposition des ventes") < out.indexOf("Familles de produits"));
    // Les trois facteurs sont NOMMÉS : la question owner (« achats, panier, composition du
    // panier ») n'a de réponse que si le nombre d'articles par achat est là.
    ok("les trois facteurs sont nommés",
      out.includes("Nombre d\u2019achats") && out.includes("Articles par achat") && out.includes("Prix moyen d\u2019un article"));
    ok("contexte externe rendu dans la lecture", out.includes("Contexte externe"));
    // La compensation « autant en moins » n'existe plus depuis l'alignement sur le résultat
    // habituel (28/08) : la phrase serait fausse.
    ok("aucune compensation promise sur les heures", !/autant en moins/.test(out));
    ok("chip « observé » sur le contexte (proto validé)", out.includes("observé"));
    // Français de machine (owner 28/08) : ni pluriel entre parenthèses dans une phrase, ni
    // statistique météo orpheline quand l'opération n'a pas connu de jour perturbé.
    ok("aucun pluriel « (s) » dans une phrase de contexte", !/(événement|jour|journée)\(s\)/.test(out));
    ok("météo mesurée seulement si l'opération a eu un jour perturbé",
      !out.includes("contre") || !/Ces jours-là, vous faites/.test(out) || /journée[s]? de temps perturbé/.test(out));
    // Le proto ne portait PAS de jauge demi-cercle : la page ne doit pas en réintroduire une,
    // et le KPI ne prend une réglette que s'il dit autre chose que les barres jour.
    ok("aucune jauge demi-cercle (retirée le 28/08)", !/viewBox="0 0 320 160"/.test(out));
    ok("aucune frise de points KPI", !/la jauge = leur moyenne|gros point = le jour mesuré/.test(out));
    ok(data.commitment.measured_metric === "revenue_residual"
        ? "opération en CA : pas de réglette KPI (les barres le disent)"
        : "opération à KPI déclaré : réglette rendue",
      (function () { var hasScale = out.includes("height:12px;background:#f0f2f5;border-radius:6px");
        return data.commitment.measured_metric === "revenue_residual" ? !hasScale : hasScale; })(),
      data.commitment.measured_metric);
    // L'ÉTAT se lit dès l'en-tête — c'est ce qui rend les deux pages distinguables.
    ok(c.open ? "chip « En cours · verdict d'ici le … »" : "chip « Terminée · … »",
      out.includes(c.open ? "En cours · verdict d\u2019ici le" : "Terminée ·"),
      out.slice(out.indexOf("border-radius:999px"), out.indexOf("border-radius:999px") + 160));
    // La date du chip est celle de l'OPÉRATION, pas celle du cron (resolved_at = lendemain).
    if (!c.open) ok("chip terminé daté de l'opération, pas de la résolution",
      out.includes("Terminée · " + String(data.commitment.window_end).slice(8, 10) + "/" + String(data.commitment.window_end).slice(5, 7)),
      { we: data.commitment.window_end, ra: data.commitment.resolved_at });
    ok("mots bannis absents (l'attendu / la normale)", !/l’attendu|l'attendu/.test(out));
    // Lisibilité (owner 28/08) : pas de gris pour titrer, pas d'ambre sur le résultat,
    // le résultat en UNE ligne avec son infobulle, et le porteur mis en avant.
    ok("le résultat tient en une ligne chiffrée", /font-size:26px;font-weight:700;color:#111827[^>]*>[^<]*% de ventes/.test(out));
    ok("le détail vit dans l'infobulle, pas à l'écran", /title="[^"]*Situation|title="[^"]*Écart à votre résultat habituel/.test(out));
    ok("aucun ambre sur le résultat", !/font-size:26px[^>]*#B45309/.test(out));
    ok("aucun bandeau ambre sous le résultat", !/background:#FFF8EC/.test(out));
    // Le partage vacances doit vivre dans l'INFOBULLE : on retire les title="…" avant de
    // chercher, sinon l'assertion attrape sa propre infobulle (faux rouge, 28/08).
    ok("le partage vacances vit dans l'infobulle, pas dans le texte visible",
      !/Situation [+−]?[0-9]/.test(out.replace(/title="[^"]*"/g, "")) && /title="[^"]*Situation [+−][0-9]/.test(out));
    ok("titres de carte en encre", !/text-transform:uppercase;color:#6b7280/.test(out));
    ok("le porteur est mis en avant (initiales + nom)", out.includes("Porté par") && /border-radius:50%;background:#1D3BB3/.test(out));
    ok("jours d'axe en toutes lettres (règle 6)", !/>\s*(lun|mar|mer|jeu|ven|sam|dim)\s\d{2}\//.test(out));

    if (c.open) {
      ok("EN COURS : pas de Documenter", !out.includes("Documenter"));
      ok("EN COURS : pas de « Action menée ? »", !out.includes("Action menée"));
      ok("EN COURS : « Ajuster le dispositif » présent", out.includes("Ajuster le dispositif"));
      ok("EN COURS : formulaire version suivante REPLIÉ", /data-vform style="display:none/.test(out));
      ok("EN COURS : le dispositif précède la lecture",
        out.indexOf("Votre dispositif") < out.indexOf("Votre action paie-t-elle"),
        { d: out.indexOf("Votre dispositif"), q: out.indexOf("Votre action paie-t-elle") });
      ok("EN COURS : description éditable", out.includes("data-dispo-save"));
      // Défaut de vérité relevé au premier rendu réel : action_done_at est écrit même sur
      // « Pas encore » — l'en-tête annonçait « action menée » sur une action non menée.
      ok("EN COURS : « action menée » suit le statut, pas l'horodatage",
        data.commitment.action_done_status === "fait" || !out.includes("action menée le"),
        { st: data.commitment.action_done_status, at: data.commitment.action_done_at });
    } else {
      ok("TERMINÉE : Documenter présent", out.includes("Documenter"));
      ok("TERMINÉE : pas de moves", !out.includes("Doubler la mise"));
      ok("TERMINÉE : pas de formulaire version suivante", !out.includes("data-vform"));
      ok("TERMINÉE : le verdict précède la lecture",
        out.indexOf("Votre action paie-t-elle") < out.indexOf("Comprendre le résultat"));
      ok("TERMINÉE : description non éditable", !out.includes("data-dispo-save"));
    }
  }

  // ── VUE MEMBRE (28/08) : la page est la cible du bouton « Ajuster » de Slack. Elle doit
  //    s'ouvrir à un membre SUR SON PÉRIMÈTRE, sous la règle des chiffres déjà arbitrée
  //    (« occasion d'agir oui, état du business jamais ») — et ne jamais fabriquer un zéro
  //    à la place d'un niveau retiré, ni promettre une réponse qui ne viendra pas.
  console.log("\n— Vue membre —");
  const POLE_DE_L_OP = "eb02f192-08c6-408b-b748-038500b5a7af";
  const localsMembre = (poles: string[]) => ({
    clerk_user_id: "harness-membre", all_location_ids: [], member_location_ids: [LOC],
    role: "member", member_poles: { [LOC]: poles },
  });
  const rDans: any = await evolutionGET({ url: new URL(`http://local/api?commitment_id=${OPEN_ID}`), locals: localsMembre([POLE_DE_L_OP]) } as any);
  const dans = await rDans.json();
  const rHors: any = await evolutionGET({ url: new URL(`http://local/api?commitment_id=${OPEN_ID}`), locals: localsMembre(["un-autre-pole"]) } as any);
  ok("membre dans son périmètre : la page s'ouvre", rDans.status === 200 && dans?.role === "member", { s: rDans.status, r: dans?.role });
  ok("membre hors périmètre : 403", rHors.status === 403, rHors.status);
  const brut = JSON.stringify(dans);
  ok("aucun niveau de CA dans la série", !/daily_revenue|expected_revenue/.test(brut));
  ok("bloc KPI (niveaux) retiré", dans.kpi === null, dans.kpi);
  ok("panier absolu retiré", dans.shape?.volume === null, dans.shape?.volume);
  ok("écarts € gardés (occasion d'agir)", (dans.shape?.families || []).some((f: any) => Number.isFinite(f.delta)));
  const htmlM = kit.renderEvolution(dans, EVOL_COPY);
  ok("aucun « 0 € » fabriqué à la place d'un niveau retiré",
    !/0 € · sa part habituelle|· 0 € · habituel/.test(htmlM));
  ok("aucune promesse trompeuse (« s'affichera ici »)", !/s’affichera ici/.test(htmlM));
  ok("le membre garde le geste Ajuster", htmlM.includes("Ajuster le dispositif"));

  // ── NON-DISSONANCE : le seul niveau affiché est celui de l'en-tête ──
  console.log("\n— Non-dissonance —");
  for (const c of cases) {
    const out = html[c.id]; if (!out) continue;
    ok(`${c.label} : la lecture ne redit aucun « vs vos N derniers » en euros`,
      !/vos \d+ derniers [a-zé]+ ?: ?\d/.test(out));
  }

  // ── Le VERDICT se mesure sur le jour de l'opération ─────────────────────────────────
  // resolveCommitment est PUR côté base (il rend un patch, l'appelant écrit) : on peut le
  // rejouer sans rien toucher. Avant le 28/08 il mesurait le jour de CRÉATION : sur le
  // corner producteur (créé le 15/08, opéré le 22/08) il notait la journée du 15/08.
  console.log("\n— Le verdict mesure le jour de l'opération —");
  const bqv: any = makeBQClient(process.env.BQ_PROJECT_ID || "muse-square-open-data");
  const snapD: any = await readLatestSnapshot(bqv, DONE_ID);
  const res: any = await resolveCommitment(bqv, snapD, new Date("2026-08-28T12:00:00Z").toISOString());
  const jour = (v: any) => String(v?.value ?? v).slice(0, 10);
  const [ca22] = await bqv.query({
    query: `SELECT ROUND(daily_revenue,0) r FROM \`muse-square-open-data.semantic.vw_insight_event_day_residual\`
            WHERE location_id=@l AND CAST(date AS STRING)=@d`,
    params: { l: LOC, d: jour(snapD.window_start) }, location: "EU",
  }).then((r: any) => (r[0] || []).map((x: any) => Number(x.r?.value ?? x.r)));
  console.log("   " + JSON.stringify({ mesure: res?.patch?.window_actual_revenue, ca_du_jour_operation: ca22, note: res?.note }));
  ok("le verdict porte sur le CA du jour de l'opération",
    res?.patch?.window_actual_revenue != null && ca22 != null && Math.abs(Number(res.patch.window_actual_revenue) - ca22) <= 2,
    { mesure: res?.patch?.window_actual_revenue, attendu: ca22 });
  ok("aucune écriture (le patch reste un patch)", typeof res?.patch === "object" && res.patch !== null);

  fs.mkdirSync(OUT, { recursive: true });
  const page = (title: string, body: string) =>
    `<!doctype html><meta charset="utf-8"><title>${title}</title>` +
    `<style>body{background:#f6f7f9;font-family:system-ui,sans-serif;margin:0;padding:16px;}` +
    `#eng-doc{background:#fff;border:1px solid rgba(0,0,0,.1);border-radius:10px;padding:26px 28px;max-width:820px;margin:0 auto;color:#111827;}` +
    `.eg-uc{font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;font-weight:600;margin-bottom:10px;}` +
    `.eg-sec{margin-bottom:26px;}</style><div id="eng-doc">${body}</div>`;
  for (const c of cases) {
    if (!html[c.id]) continue;
    const f = path.join(OUT, `engagement-${c.open ? "encours" : "terminee"}.html`);
    fs.writeFileSync(f, page(c.label, html[c.id]));
    console.log(`   rendu écrit : ${f}`);
  }

  console.log(`\n${pass} vert · ${fail} rouge`);
  process.exit(fail ? 1 : 0);
})();
