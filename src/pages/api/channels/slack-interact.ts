// Route: /api/channels/slack-interact — vue équipe inc 7 (docs/vue-equipe-slack-spec.md).
// Endpoint PUBLIC appelé par Slack (interactivité) — PAS de session Clerk : l'authenticité
// vient de la SIGNATURE Slack (HMAC v0 du corps brut, SLACK_SIGNING_SECRET, fenêtre 5 min),
// l'identité du cliqueur vient du mappage location_members.slack_user_id (repli email via
// users.info si le bot a le scope), et les GARDES DE L'APP sont REJOUÉES : les gestes sont
// dispatchés en interne aux handlers disposition/retro avec des locals synthétiques — même
// requireLocationAccess, même périmètre de pôles, même trace d'auteur. Rien n'est réécrit.
//
// Gestes portés : boutons « Action menée ? Oui / Pas encore » (ms_dispo_*) et « Documenter »
// (ms_retro_open → modal aux libellés de commitmentCopy, verbatim → view_submission ms_retro).
// Sans SLACK_SIGNING_SECRET en env → 503 honnête (rien ne se traite non signé).
import type { APIRoute } from "astro";
import crypto from "node:crypto";
import { makeBQClient } from "../../../lib/bq";
import { localsFromSlackUser } from "../../../lib/profileContext";
import { POST as DISPO } from "../commitments/disposition";
import { POST as RETRO } from "../commitments/retro";
import { EVOL_COPY as COMMIT_COPY } from "../../../lib/commitmentCopy";

export const prerender = false;
const PROJECT = "muse-square-open-data";

function ok(body?: unknown): Response {
  return new Response(body == null ? "" : JSON.stringify(body), {
    status: 200, headers: { "content-type": "application/json" },
  });
}

function verifySlackSignature(rawBody: string, headers: Headers): boolean {
  const secret = process.env.SLACK_SIGNING_SECRET || "";
  if (!secret) return false;
  const ts = String(headers.get("x-slack-request-timestamp") || "");
  const sig = String(headers.get("x-slack-signature") || "");
  if (!ts || !sig) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false; // anti-rejeu
  const base = "v0:" + ts + ":" + rawBody;
  const expected = "v0=" + crypto.createHmac("sha256", secret).update(base).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  } catch { return false; }
}

async function teamBotToken(bq: any, teamId: string): Promise<string | null> {
  const [rows] = await bq.query({
    query: `SELECT config_json FROM \`${PROJECT}.analytics.channel_configs\`
            WHERE channel = 'slack' AND enabled = TRUE
              AND JSON_VALUE(config_json, '$.team_id') = @tid
            ORDER BY updated_at DESC LIMIT 1`,
    params: { tid: teamId }, location: "EU",
  });
  try { return JSON.parse(String(rows?.[0]?.config_json || "{}")).bot_token || null; } catch { return null; }
}

async function ephemeral(responseUrl: string, text: string): Promise<void> {
  try {
    await fetch(responseUrl, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ response_type: "ephemeral", replace_original: false, text }),
    });
  } catch { /* réponse de confort — jamais bloquante */ }
}

async function dispatch(fn: any, locals: any, body: any): Promise<{ status: number; body: any }> {
  const r: Response = await fn({
    request: new Request("http://internal/slack-interact", {
      method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" },
    }),
    locals,
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

export const POST: APIRoute = async ({ request }) => {
  try {
    if (!process.env.SLACK_SIGNING_SECRET) {
      return new Response(JSON.stringify({ ok: false, error: "SLACK_SIGNING_SECRET non configuré" }), { status: 503 });
    }
    const raw = await request.text();
    if (!verifySlackSignature(raw, request.headers)) {
      return new Response(JSON.stringify({ ok: false, error: "signature invalide" }), { status: 401 });
    }
    const params = new URLSearchParams(raw);
    const payload = JSON.parse(String(params.get("payload") || "{}"));
    const bq = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);
    const teamId = String(payload?.team?.id || "");
    const slackUserId = String(payload?.user?.id || "");

    // ── Boutons sur message ──
    if (payload?.type === "block_actions") {
      const action = (payload.actions || [])[0] || {};
      const actionId = String(action.action_id || "");
      const responseUrl = String(payload.response_url || "");
      let value: any = {};
      try { value = JSON.parse(String(action.value || "{}")); } catch {}

      if (actionId === "ms_dispo_fait" || actionId === "ms_dispo_pas_encore") {
        const botToken = await teamBotToken(bq, teamId);
        const locals = await localsFromSlackUser(bq, slackUserId, botToken);
        if (!locals) {
          if (responseUrl) await ephemeral(responseUrl, "Votre compte Slack n'est pas encore relié — demandez au responsable de le relier dans l'app.");
          return ok();
        }
        const res = await dispatch(DISPO, locals, {
          commitment_id: value.c, location_id: value.l,
          action_done_status: actionId === "ms_dispo_fait" ? "fait" : "pas_encore",
        });
        if (responseUrl) {
          await ephemeral(responseUrl, res.status === 200
            ? COMMIT_COPY.saved + " — " + (actionId === "ms_dispo_fait" ? "action menée." : "pas encore.")
            : String(res.body?.error || "Le geste n'a pas pu être enregistré."));
        }
        return ok();
      }

      if (actionId === "ms_retro_open") {
        const botToken = await teamBotToken(bq, teamId);
        if (!botToken || !payload.trigger_id) return ok();
        // Modal « Documenter » — libellés VERBATIM de commitmentCopy (le formulaire de l'app).
        await fetch("https://slack.com/api/views.open", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: "Bearer " + botToken },
          body: JSON.stringify({
            trigger_id: payload.trigger_id,
            view: {
              type: "modal", callback_id: "ms_retro",
              private_metadata: JSON.stringify({ c: value.c, l: value.l }),
              title: { type: "plain_text", text: "Documenter" },
              submit: { type: "plain_text", text: COMMIT_COPY.save },
              close: { type: "plain_text", text: COMMIT_COPY.cancel },
              blocks: [
                { type: "input", block_id: "rw", optional: true, label: { type: "plain_text", text: COMMIT_COPY.retro_worked_q },
                  element: { type: "plain_text_input", action_id: "v", multiline: true, placeholder: { type: "plain_text", text: COMMIT_COPY.retro_worked_ph } } },
                { type: "input", block_id: "rc", optional: true, label: { type: "plain_text", text: COMMIT_COPY.retro_change_q },
                  element: { type: "plain_text_input", action_id: "v", multiline: true, placeholder: { type: "plain_text", text: COMMIT_COPY.retro_change_ph } } },
                { type: "input", block_id: "rr", optional: true, label: { type: "plain_text", text: COMMIT_COPY.retro_repeat_q },
                  element: { type: "radio_buttons", action_id: "v", options: [
                    { text: { type: "plain_text", text: COMMIT_COPY.repeat_yes }, value: "oui" },
                    { text: { type: "plain_text", text: COMMIT_COPY.repeat_no }, value: "non" },
                  ] } },
              ],
            },
          }),
        }).catch(() => null);
        return ok();
      }
      return ok();
    }

    // ── Soumission du modal Documenter ──
    if (payload?.type === "view_submission" && String(payload?.view?.callback_id || "") === "ms_retro") {
      let meta: any = {};
      try { meta = JSON.parse(String(payload.view.private_metadata || "{}")); } catch {}
      const vals = payload?.view?.state?.values || {};
      const pick = (bid: string) => vals?.[bid]?.v?.value ?? vals?.[bid]?.v?.selected_option?.value ?? null;
      const botToken = await teamBotToken(bq, teamId);
      const locals = await localsFromSlackUser(bq, slackUserId, botToken);
      if (!locals) {
        return ok({ response_action: "errors", errors: { rw: "Votre compte Slack n'est pas encore relié — demandez au responsable de le relier dans l'app." } });
      }
      const body: any = { commitment_id: meta.c, location_id: meta.l };
      if (pick("rw")) body.retro_worked = pick("rw");
      if (pick("rc")) body.retro_change = pick("rc");
      if (pick("rr") != null) body.retro_repeat = pick("rr") === "oui";
      const res = await dispatch(RETRO, locals, body);
      if (res.status !== 200) {
        return ok({ response_action: "errors", errors: { rw: String(res.body?.error || "Enregistrement impossible.") } });
      }
      return ok(); // 200 vide → Slack ferme le modal
    }

    return ok();
  } catch (err: any) {
    console.error("[slack-interact]", err?.message || err);
    return ok(); // Slack ré-essaie sur non-200 — un échec interne ne doit pas spammer
  }
};
