import { loadCities } from "./_lib/constants.js";

// Runs before every function: keep the city list in step with the D1 cities table.
export async function onRequest(context) {
  await loadCities(context.env.DB);
  return context.next();
}
