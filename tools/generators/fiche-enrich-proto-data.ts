// Harnais maquette « Ce qu'il met en avant » (chantier enrichissement web des fiches, 17/08).
// LECTURE SEULE côté app : prend le suivi RÉEL (GL Events, seul concurrent direct du site Paris),
// fait la VRAIE lecture web de SES pages via l'infra existante (callClaudeWithWebSearch — même
// runtime que webContext.ts), écrit tools/proto/fiche-enrich-proto-data.js pour la maquette.
// Doctrine cercle 2 : le web ne porte JAMAIS de tier ; chaque affirmation garde son URL (cassable
// en un clic). Rien n'est écrit en base — la maquette d'abord, le branchement après validation.
// Usage : npx tsx tools/generators/fiche-enrich-proto-data.ts
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { makeBQClient } from "../../src/lib/bq";
import { callClaudeWithWebSearch } from "../../src/lib/ai/runtime/claude";
import { GET as profileGET } from "../../src/pages/api/competitive/competitor-profile";

const P = "muse-square-open-data";
const OWNER = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);

// VOIX (même exigence que webContext, owner 08/08) : entités NOMMÉES, dates et chiffres tirés des
// pages ; phrases nominales courtes ; zéro conseil, zéro généralité ; si rien de fiable → vide.
const SYSTEM_FR = `Tu es un analyste concurrentiel pour un lieu culturel/commerce en France. On te donne le NOM d'un concurrent suivi et SES pages officielles (programme, tarifs). Tu lis le web (en priorité ces pages) pour dire CE QU'IL MET EN AVANT en ce moment : expositions ou événements phares (avec dates), offres ou tarifs poussés (avec prix), nouveautés. EXIGENCES : chaque élément porte un NOM PROPRE et, quand la page les donne, une date, un prix ou un chiffre — jamais de généralité ni de conseil. Registre professionnel, phrases nominales courtes, en français. Tu réponds UNIQUEMENT avec du JSON valide, sans texte ni backticks : {"lead": string|null, "mises_en_avant": [{"titre": string, "detail": string, "dates": string|null}], "offre_poussee": string|null, "sources": [string]}. "lead" = UNE phrase : ce que sa communication pousse d'abord. 2 à 4 mises en avant maximum. Si tu ne trouves rien de fiable, mets des valeurs nulles/vides. Ne fabrique jamais.`;

(async () => {
  const bq = makeBQClient(process.env.BQ_PROJECT_ID || P);
  const [rows] = await bq.query({
    query: `SELECT cd.competitor_id cid, cd.competitor_name nom, cd.google_place_id pid, cd.source_url, cd.tarifs_url,
                   cd.google_rating note, cd.google_rating_count avis,
                   cd.primary_audience aud1, cd.secondary_audience aud2
            FROM \`${P}.raw.competitor_tracking\` ct
            JOIN \`${P}.raw.competitor_directory\` cd
              ON cd.competitor_id = ct.competitor_id AND cd.deleted_at IS NULL
            WHERE ct.location_id = @l AND ct.deleted_at IS NULL AND cd.competitor_name = 'GL Events'`,
    params: { l: OWNER }, location: "EU",
  });
  // Mon profil (le référent du croisement de publics).
  const [[me]] = await bq.query({
    query: `SELECT clerk_user_id, ANY_VALUE(primary_audience_1) a1, ANY_VALUE(primary_audience_2) a2
            FROM \`${P}.raw.insight_event_user_location_profile\` WHERE location_id = @l GROUP BY 1 LIMIT 1`,
    params: { l: OWNER }, location: "EU",
  });
  const f = (rows as any[])[0];
  if (!f) throw new Error("suivi GL Events introuvable");
  const nom = String(flat(f.nom));
  // Le VRAI competitor-profile (446 lignes existantes) : génère + cache competitive_analysis_json
  // si absent — verdict, recouvrement de publics, table de prix. On RÉUTILISE, on ne recode pas.
  const locals = { clerk_user_id: String(flat(me.clerk_user_id)), location_id: OWNER };
  const profRes = await profileGET({ url: new URL("http://l/api/competitive/competitor-profile?id=" + encodeURIComponent(String(flat(f.cid)))), locals } as any);
  const prof = JSON.parse(await (profRes as any).text());
  if (!prof.ok) console.warn("competitor-profile KO:", prof.error);
  const ana = prof.competitive_analysis || prof.analysis || null;
  const urls = [flat(f.source_url), flat(f.tarifs_url)].filter(Boolean).map(String);

  const t0 = Date.now();
  const res = await callClaudeWithWebSearch({
    system: SYSTEM_FR,
    userText: `Concurrent suivi : ${nom} (opère le Musée de l'Homme, Paris). Ses pages officielles : ${urls.join(" · ")}. Que met-il en avant en ce moment (${new Date().toLocaleDateString("fr-FR")}) ?`,
    maxUses: 5,
    timeoutMs: 120_000, // 30 s par défaut — trop court pour plusieurs recherches web
  });
  if (!res.ok) throw new Error("web search KO : " + res.errors.join(" | "));
  // Même extraction que webContext.ts : le modèle préfixe parfois de la prose malgré la consigne.
  let parsed: any = {};
  const m = res.text.match(/(\{[\s\S]*\})/);
  try { parsed = JSON.parse(m ? m[1] : res.text.replace(/```json|```/g, "").trim()); }
  catch { throw new Error("JSON illisible : " + res.text.slice(0, 200)); }

  const out = {
    captured_at: new Date().toISOString(),
    duree_ms: Date.now() - t0,
    fiche: {
      nom, note: flat(f.note) != null ? Number(flat(f.note)) : null,
      avis: flat(f.avis) != null ? Number(flat(f.avis)) : null,
      aud1: String(flat(f.aud1) || ""), aud2: String(flat(f.aud2) || ""), url: urls[0] || null,
    },
    moi: { a1: String(flat(me.a1) || ""), a2: String(flat(me.a2) || "") },
    menace: prof.threat ? { overlap_pct: prof.threat.audience_overlap_pct ?? null, km: prof.threat.distance_km ?? null } : null,
    profil: ana ? {
      verdict: ana.verdict || null, segment_overlap: ana.segment_overlap || null,
      value_prop_theirs: ana.value_prop_theirs || null,
      price_comparison: Array.isArray(ana.price_comparison) ? ana.price_comparison.slice(0, 6) : [],
      product_gaps: Array.isArray(ana.product_gaps) ? ana.product_gaps.slice(0, 4) : [],
      relationship_type: ana.relationship_type || null,
    } : null,
    enrich: {
      lead: parsed.lead || null,
      mises_en_avant: Array.isArray(parsed.mises_en_avant) ? parsed.mises_en_avant.slice(0, 4) : [],
      offre_poussee: parsed.offre_poussee || null,
      sources: Array.isArray(parsed.sources) ? parsed.sources.slice(0, 4) : [],
    },
  };
  writeFileSync(new URL("../proto/fiche-enrich-proto-data.js", import.meta.url).pathname,
    "window.FICHE_ENRICH_PROTO = " + JSON.stringify(out, null, 1) + ";\n");
  console.log("OK —", nom, "· lead:", out.enrich.lead, "· mises en avant:", out.enrich.mises_en_avant.length,
    "· sources:", out.enrich.sources.length, "·", out.duree_ms, "ms");
})();
