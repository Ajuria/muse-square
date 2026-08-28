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
      const fSum = data.shape.families.reduce((s: number, f: any) => s + f.delta, 0);
      ok("familles : écarts compensés (aucun niveau concurrent)", Math.abs(fSum) <= Math.max(2, data.shape.families.length), fSum);
      if (data.shape.volume) {
        const gap = data.shape.actual_eur - data.shape.expected_eur;
        const sum = data.shape.volume.contrib_tx_eur + data.shape.volume.contrib_basket_eur;
        ok("achats + panier = écart de l'en-tête", Math.abs(sum - gap) <= 3, { sum, gap });
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
    ok("« Performance des produits vendus » présente", out.includes("Performance des produits vendus"));
    ok("« Achats ou panier ? » présent", out.includes("Achats ou panier"));
    ok("contexte externe rendu dans la lecture", out.includes("Contexte externe"));
    ok("chip « observé » sur le contexte (proto validé)", out.includes("observé"));
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

  // ── NON-DISSONANCE : le seul niveau affiché est celui de l'en-tête ──
  console.log("\n— Non-dissonance —");
  for (const c of cases) {
    const out = html[c.id]; if (!out) continue;
    ok(`${c.label} : la lecture ne redit aucun « vs vos N derniers » en euros`,
      !/vos \d+ derniers [a-zé]+ ?: ?\d/.test(out));
  }

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
