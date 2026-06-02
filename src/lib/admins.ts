export const ADMIN_USER_IDS = [
  "user_38OwkmwUq0Ldj5FwB9AJ8HmziWo",       // Julen — dev
  "user_3ACPaLPrh3ElWgvvHojUKTguf8L",       // Poieti — dev
  "user_3EWkT9mJnj0VNPgzSigYB6nP5OC",       // Julen — prod
];
export const isAdmin = (id?: string | null) => !!id && ADMIN_USER_IDS.includes(id);