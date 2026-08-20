import client from "./client.js";

export async function fetchIncidents() {
  // BUG FIX: this used to call /hotspots/, whose response shape
  // (type, location, severityScore, createdAt — no description/source)
  // doesn't match the fields AlertsView, ReportView, and MapView actually
  // read (incident_type, location_label, description, source,
  // reported_by_name, created_at). That mismatch is why alerts rendered
  // with missing text and why map hotspots didn't line up with the
  // Alerts list. /incidents/ (IncidentViewSet) returns the full,
  // correctly-named fields every consumer expects.
  const { data } = await client.get("/incidents/");

  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data?.results)) {
    return data.results;
  }

  return [];
}

export async function createIncident({
  incidentType,
  severity,
  locationLabel,
  lat,
  lon,
  description,
}) {
  const { data } = await client.post("/incidents/", {
    incident_type: incidentType,
    severity,
    location_label: locationLabel,
    lat,
    lon,
    description,
  });

  return data;
}