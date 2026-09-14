// src/pages/api/cron/report-sends.ts — LE CRON DES ENVOIS À CADENCE (docs/explorer-outil-spec.md § 6.4, incrément 5).
//
// GET, `authorization: Bearer ${CRON_SECRET}` — appelé chaque heure par cron-job.org (aucun cron dans vercel.json, le
// patron des autres crons). Un tour = lib/rapport/envois.ts `tourDesEnvois` : chaque envoi programmé actif, dû à cette
// heure de Paris et non tracé sur sa période, est composé depuis son Modèle (sans la boucle), enregistré comme Rapport,
// envoyé (email HTML par le kit, ou Slack en texte) et tracé dans analytics.report_sends. Un rapport sans matière ne
// part pas (tracé, pour ne pas insister le même jour). Déterministe : le rejeu de l'heure n'envoie rien de plus.
// `?dry=1` liste ce qui est dû sans rien envoyer ni tracer (`now` reste réel).
import "dotenv/config";
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { estDue, listActiveSchedules, momentParis, periodeDeCadence, periodesTracees, tourDesEnvois, cadenceFr } from "../../../lib/rapport/envois";

export const prerender = false;
const BASE_URL = process.env.APP_BASE_URL || "https://www.musesquare.com";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });

export const GET: APIRoute = async ({ request, url }) => {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) return json({ ok: false, error: "Unauthorized" }, 401);
  const bq = makeBQClient(process.env.BQ_PROJECT_ID || "muse-square-open-data");
  const t0 = Date.now();
  try {
    if (url.searchParams.get("dry") === "1") {
      const now = momentParis();
      const lignes: string[] = [];
      for (const s of await listActiveSchedules(bq)) {
        const due = estDue(s, now);
        const per = periodeDeCadence(s.cadence, now.date);
        const deja = due ? (await periodesTracees(bq, s.schedule_id)).has(`${per.du}|${per.au}`) : false;
        lignes.push(`${s.modele_nom} (${s.schedule_id.slice(0, 8)}, ${cadenceFr(s)}) : ${due ? (deja ? `dû, déjà tracé ${per.libelle_fr}` : `dû, partirait ${per.libelle_fr}`) : "pas dû"}`);
      }
      return json({ ok: true, dry: true, now, lignes, ms: Date.now() - t0 });
    }
    const lignes = await tourDesEnvois(bq, { base_url: BASE_URL });
    return json({ ok: true, lignes, ms: Date.now() - t0 });
  } catch (e: any) {
    console.error("[cron/report-sends]", e?.message || e);
    return json({ ok: false, error: String(e?.message || e).slice(0, 200), ms: Date.now() - t0 }, 500);
  }
};
