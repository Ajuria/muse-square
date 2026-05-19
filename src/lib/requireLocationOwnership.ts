export function requireLocationOwnership(locals: any, location_id: string): void {
  const allowed = Array.isArray(locals?.all_location_ids) ? locals.all_location_ids : [];
  if (!allowed.includes(location_id)) {
    throw new Error("FORBIDDEN: location_id not owned by user");
  }
}
