import { useState, useCallback } from "react";
import client from "../api/client.js";

/**
 * Custom hook: plans up to 3 real-road, safety-scored route alternatives
 * between two geocoded points. (React Hooks & API Integration)
 */
export function useSafeRoutes() {
  const [routes, setRoutes] = useState([]);
  const [endpoints, setEndpoints] = useState(null); // { source, destination }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const planRoutes = useCallback(async (source, destination) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await client.post("/routes/plan-multi/", { source, destination });
      setRoutes(data.routes || []);
      setEndpoints({ source: data.source, destination: data.destination });
      return data;
    } catch (err) {
      setError(err.response?.data?.error || "Could not plan a route");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Displays a previously-saved route (from Past History) on the map
   * directly from its stored data — no live OSRM/ML call needed, since
   * SavedRoute already stores the full geometry and computed score.
   */
  const showHistoricalRoute = useCallback((entry) => {
    setError(null);
    setRoutes([
      {
        id: "history",
        label: "From History",
        geometry: entry.geometry,
        distanceKm: entry.distance_km,
        durationMin: entry.duration_min,
        overallSafetyScore: entry.overall_safety_score,
      },
    ]);
    setEndpoints({
      source: { lat: entry.source_lat, lon: entry.source_lon, label: entry.source_label },
      destination: { lat: entry.destination_lat, lon: entry.destination_lon, label: entry.destination_label },
    });
  }, []);

  return { routes, endpoints, loading, error, planRoutes, showHistoricalRoute };
}
