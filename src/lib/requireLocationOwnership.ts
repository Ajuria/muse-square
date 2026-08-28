import { ADMIN_USER_IDS } from "./admins";
const ADMIN_IDS = ADMIN_USER_IDS;

export function requireLocationOwnership(locals: any, location_id: string): void {
  const realUser = locals?.real_clerk_user_id || locals?.clerk_user_id;
  if (realUser && ADMIN_IDS.includes(realUser)) return;
  const allowed = Array.isArray(locals?.all_location_ids) ? locals.all_location_ids : [];
  if (!allowed.includes(location_id)) {
    throw new Error("FORBIDDEN: location_id not owned by user");
  }
}

// Garde LECTURE de la vue équipe (incrément 2, docs/vue-equipe-slack-spec.md) : accepte
// owner ET membre du site (locals.member_location_ids, posé par le middleware depuis
// analytics.location_members). À poser UNIQUEMENT sur les endpoints que les pages membre
// consomment (liste fermée aux incréments 3-5) — les écritures owner restent sur
// requireLocationOwnership.
export function requireLocationAccess(locals: any, location_id: string): void {
  const realUser = locals?.real_clerk_user_id || locals?.clerk_user_id;
  if (realUser && ADMIN_IDS.includes(realUser)) return;
  const owned = Array.isArray(locals?.all_location_ids) ? locals.all_location_ids : [];
  if (owned.includes(location_id)) return;
  const member = Array.isArray(locals?.member_location_ids) ? locals.member_location_ids : [];
  if (member.includes(location_id)) return;
  throw new Error("FORBIDDEN: location_id not accessible to user");
}