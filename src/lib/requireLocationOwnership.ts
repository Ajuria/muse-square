const ADMIN_IDS = [
  "user_38OwkmwUq0Ldj5FwB9AJ8HmziWo",
  "user_3ACPaLPrh3ElWgvvHojUKTguf8L",
];

export function requireLocationOwnership(locals: any, location_id: string): void {
  const realUser = locals?.real_clerk_user_id || locals?.clerk_user_id;
  if (realUser && ADMIN_IDS.includes(realUser)) return;
  const allowed = Array.isArray(locals?.all_location_ids) ? locals.all_location_ids : [];
  if (!allowed.includes(location_id)) {
    throw new Error("FORBIDDEN: location_id not owned by user");
  }
}