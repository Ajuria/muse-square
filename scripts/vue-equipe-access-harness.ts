// Harnais incrément 2 — teste les fonctions RÉELLES (src/lib/profileContext.js,
// src/lib/requireLocationOwnership.ts) contre BigQuery + Clerk réels.
import "dotenv/config";
import { BigQuery } from "@google-cloud/bigquery";
import { getProfileContext, resolvePendingMembership } from "../src/lib/profileContext.js";
import { requireLocationOwnership, requireLocationAccess } from "../src/lib/requireLocationOwnership.ts";

const OWNER = "user_38OwkmwUq0Ldj5FwB9AJ8HmziWo"; // copié de la sortie bq, jamais retapé
const OWNER_LOC = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
const PROBE_CLERK = "user_probe_inc2";
const PROBE_LOC = "probe-inc2-loc";
const P = "muse-square-open-data";

function assert(name: string, cond: boolean, detail?: any) {
  console.log((cond ? "✅" : "❌") + " " + name + (detail !== undefined ? " — " + JSON.stringify(detail) : ""));
  if (!cond) process.exitCode = 1;
}

async function main() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const bq = raw ? new BigQuery({ projectId: P, credentials: JSON.parse(raw) }) : new BigQuery({ projectId: P });

  // ── 0. Référence : l'ANCIENNE requête du middleware, rejouée telle quelle ──
  const [oldRows] = await bq.query({
    query: `SELECT location_id, first_name, is_primary FROM \`${P}.raw.insight_event_user_location_profile\`
            WHERE clerk_user_id = @id
            ORDER BY is_primary DESC, company_geocode_status = 'geocoded_ok' DESC, created_at DESC`,
    location: "EU", params: { id: OWNER },
  });
  const oldAll = oldRows.map((r: any) => r.location_id).filter(Boolean);

  // ── 1. Owner : sortie identique à l'ancien comportement (TOUTES les sorties) ──
  const own = await getProfileContext(bq, OWNER);
  assert("owner.ok", own.ok === true);
  assert("owner.location_id inchangé", own.location_id === oldRows[0].location_id, { new: own.location_id, old: oldRows[0].location_id });
  assert("owner.first_name inchangé", own.first_name === (oldRows[0].first_name ?? null), { new: own.first_name, old: oldRows[0].first_name });
  assert("owner.all_location_ids inchangé (ordre compris)", JSON.stringify(own.all_location_ids) === JSON.stringify(oldAll), { new: own.all_location_ids, old: oldAll });
  assert("owner.member vide", own.is_member === false && own.member_location_ids.length === 0);

  // ── 2. Membre pur : sonde ──
  await bq.query({
    query: `INSERT INTO \`${P}.analytics.location_members\`
            (member_id, location_id, member_email, clerk_user_id, role, pole_dispositif_ids, deleted, created_at, updated_at)
            VALUES ('probe-inc2-m1', @loc, 'probe-inc2@example.invalid', @clerk, 'member', '["pole-a","pole-b"]', FALSE, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())`,
    location: "EU", params: { loc: PROBE_LOC, clerk: PROBE_CLERK },
  });
  const mem = await getProfileContext(bq, PROBE_CLERK);
  assert("membre.ok=false (pas de profil)", mem.ok === false);
  assert("membre.is_member", mem.is_member === true);
  assert("membre.location", JSON.stringify(mem.member_location_ids) === JSON.stringify([PROBE_LOC]));
  assert("membre.poles", JSON.stringify(mem.member_poles[PROBE_LOC]) === JSON.stringify(["pole-a", "pole-b"]));
  assert("membre.all_location_ids VIDE (sécurité)", mem.all_location_ids.length === 0);

  // Tombstone du membre → il disparaît
  await bq.query({
    query: `INSERT INTO \`${P}.analytics.location_members\` (member_id, location_id, deleted, created_at, updated_at)
            VALUES ('probe-inc2-m1', @loc, TRUE, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())`,
    location: "EU", params: { loc: PROBE_LOC },
  });
  const memGone = await getProfileContext(bq, PROBE_CLERK);
  assert("membre tombstoné invisible", memGone.is_member === false && memGone.member_location_ids.length === 0);

  // ── 3. Résolution email : ligne en attente portant l'email RÉEL Clerk de l'owner ──
  const cres = await fetch("https://api.clerk.com/v1/users/" + OWNER, { headers: { authorization: "Bearer " + process.env.CLERK_SECRET_KEY } });
  const cuser: any = await cres.json();
  const cemails = Array.isArray(cuser?.email_addresses) ? cuser.email_addresses : [];
  const cprimary = cemails.find((e: any) => e.id === cuser?.primary_email_address_id) || cemails[0];
  const ownerEmail = String(cprimary?.email_address || "").trim();
  assert("Clerk REST rend l'email (inconnue levée)", ownerEmail.includes("@"), { email: ownerEmail });

  await bq.query({
    query: `INSERT INTO \`${P}.analytics.location_members\`
            (member_id, location_id, member_email, clerk_user_id, role, pole_dispositif_ids, deleted, created_at, updated_at)
            VALUES ('probe-inc2-m2', @loc, @em, NULL, 'member', '["pole-c"]', FALSE, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())`,
    location: "EU", params: { loc: PROBE_LOC, em: ownerEmail },
  });
  const resolved = await resolvePendingMembership(bq, OWNER);
  assert("résolution retourne true", resolved === true);
  const mixed = await getProfileContext(bq, OWNER);
  assert("mixte : owner toujours ok", mixed.ok === true);
  assert("mixte : membership résolu visible", mixed.member_location_ids.includes(PROBE_LOC));
  assert("mixte : all_location_ids INCHANGÉ (sécurité)", JSON.stringify(mixed.all_location_ids) === JSON.stringify(oldAll));

  // Idempotence du garde par process : un second appel ne retente pas
  const again = await resolvePendingMembership(bq, OWNER);
  assert("résolution non retentée (garde process)", again === false);

  // ── 4. Gardes ──
  const localsOwner = { clerk_user_id: "u", real_clerk_user_id: "u", all_location_ids: [OWNER_LOC], member_location_ids: [] };
  const localsMember = { clerk_user_id: "u", real_clerk_user_id: "u", all_location_ids: [], member_location_ids: [PROBE_LOC] };
  let threw = false; try { requireLocationAccess(localsOwner, OWNER_LOC); } catch { threw = true; }
  assert("access: owner passe", !threw);
  threw = false; try { requireLocationAccess(localsMember, PROBE_LOC); } catch { threw = true; }
  assert("access: membre passe sur SON site", !threw);
  threw = false; try { requireLocationAccess(localsMember, OWNER_LOC); } catch { threw = true; }
  assert("access: membre REFUSÉ sur un autre site", threw);
  threw = false; try { requireLocationOwnership(localsMember, PROBE_LOC); } catch { threw = true; }
  assert("ownership: membre REFUSÉ même sur son site (écritures owner)", threw);

  // ── 5. Nettoyage complet ──
  await bq.query({ query: `DELETE FROM \`${P}.analytics.location_members\` WHERE location_id = @loc OR member_id LIKE 'probe-inc2-%'`, location: "EU", params: { loc: PROBE_LOC } });
  const [cnt] = await bq.query({ query: `SELECT COUNT(*) n FROM \`${P}.analytics.location_members\``, location: "EU" });
  assert("table nettoyée (0 ligne)", Number(cnt[0].n) === 0, { n: cnt[0].n });
}

main().catch((e) => { console.error("HARNESS FAILED:", e); process.exit(1); });
