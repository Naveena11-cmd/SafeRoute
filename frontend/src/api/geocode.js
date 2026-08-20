/**
 * Free-text place -> lat/lon using OpenStreetMap's Nominatim geocoder.
 * (Web Scraping, APIs & Data Ingestion)
 */
export async function geocode(query, { city = "", countryCode = "" } = {}) {
  if (!query || typeof query !== "string") throw new Error("Invalid location query");
  const cleaned = query.replace(/^📍\s*/, "").trim();
  const lower = cleaned.toLowerCase();
  if (lower.includes("current location") || lower.includes("my location")) {
    throw new Error("Could not determine current location. Please enter a place name or click '📍 My location'.");
  }
  const q = city ? `${cleaned}, ${city}` : cleaned;
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  if (countryCode) url.searchParams.set("countrycodes", countryCode);

  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Geocoding request failed with status ${res.status}`);
  const results = await res.json();
  if (!results || !results.length) throw new Error(`No location matches found for "${cleaned}"`);

  return {
    label: results[0].display_name.split(",")[0],
    lat: parseFloat(results[0].lat),
    lon: parseFloat(results[0].lon),
  };
}

