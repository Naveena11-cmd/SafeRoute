import client from "./client.js";

export async function fetchRouteHistory() {
  const { data } = await client.get("/routes/history/");
  return Array.isArray(data) ? data : data.results || [];
}
