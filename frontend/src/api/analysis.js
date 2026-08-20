import client from "./client.js";

export async function fetchAnalysis() {
  const { data } = await client.get("/analysis/");
  return data; // { by_year_type, by_year_total, this_year_by_type, top_risk_areas }
}
