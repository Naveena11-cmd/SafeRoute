import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import MapView from "../../components/MapView.jsx";
import TopNavBar from "../../components/TopNavBar.jsx";
import RoutesCard from "../../components/RoutesCard.jsx";
import NavigationPanel from "../../components/NavigationPanel.jsx";
import BottomFilterBar from "../../components/BottomFilterBar.jsx";
import { useSafeRoutes } from "../../hooks/useSafeRoutes.js";
import { useLiveNavigation } from "../../hooks/useLiveNavigation.js";
import { geocode } from "../../api/geocode.js";
import { fetchIncidents } from "../../api/incidents.js";

export default function RouteSafetyView() {
  const {
    routes,
    endpoints,
    loading,
    error,
    planRoutes,
    showHistoricalRoute,
  } = useSafeRoutes();

  const location = useLocation();
  const [status, setStatus] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [hotspots, setHotspots] = useState([]);

  // Which incident categories are currently shown as markers. Starts
  // empty and gets populated with "everything" the first time real
  // hotspot data comes in, so the map opens fully visible by default —
  // people opt OUT of categories to declutter, rather than having to
  // opt in to see anything at all.
  const [activeTypes, setActiveTypes] = useState(new Set());

  function getIncidentType(h) {
    return h.incident_type || h.incidentType || h.type || "Other";
  }

  function toggleHotspotType(type) {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  function showAllHotspotTypes() {
    setActiveTypes(new Set(hotspots.map(getIncidentType)));
  }

  function hideAllHotspotTypes() {
    setActiveTypes(new Set());
  }

  const visibleHotspots = hotspots.filter((h) => activeTypes.has(getIncidentType(h)));

  // Live turn-by-turn navigation for whichever route is selected. The
  // moment navigation starts, this replans from the user's real live
  // location (not the typed starting point), and keeps rerouting if
  // they wander off the path while walking.
  const nav = useLiveNavigation({
    route: routes[selectedIndex],
    destination: endpoints?.destination,
    onReroute: async (currentPosition, destination) => {
      try {
        await planRoutes(currentPosition, destination);
        setSelectedIndex(0);
      } catch {
        // planRoutes() already sets `error`; navigation just keeps
        // showing "off route" until the next retry succeeds.
      }
    },
  });

  // Load community incident hotspots
  useEffect(() => {
  fetchIncidents()
    .then((data) => {
      console.log("HOTSPOTS RECEIVED BY ROUTE SAFETY VIEW:", data);
      setHotspots(data);
      setActiveTypes(new Set(data.map(getIncidentType)));
    })
    .catch((err) => {
      console.error("HOTSPOTS FETCH ERROR:", err);
      setHotspots([]);
    });
}, []);

  // Arriving here from Past History with a specific route selected —
  // show it immediately instead of requiring a fresh search.
  useEffect(() => {
    const historicalRoute = location.state?.historicalRoute;
    if (historicalRoute) {
      showHistoricalRoute(historicalRoute);
      setSelectedIndex(0);
      setStatus(`Showing your ${new Date(historicalRoute.created_at).toLocaleDateString()} route.`);
      // Clear the router state so a later refresh/back doesn't re-trigger this.
      window.history.replaceState({}, "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  async function handlePlan(sourceInput, destText) {
  setSelectedIndex(0);

  // =====================================================
  // STEP 1: BASIC INPUT VALIDATION
  // =====================================================

  // sourceInput can be either free text to geocode, or an
  // already-resolved {lat, lon, label} object from the "use my
  // current location" button — in which case there's nothing to
  // validate/geocode for that field.
  const sourceIsCoords = sourceInput && typeof sourceInput === "object";
  const sourceQuery = sourceIsCoords ? null : sourceInput?.trim();
  const destQuery = destText?.trim();

  if (!sourceIsCoords && !sourceQuery) {
    setStatus("Please enter a starting location, or use your current location.");
    return;
  }

  if (!destQuery) {
    setStatus("Please enter a destination location.");
    return;
  }

  // Reject extremely short inputs such as "n", "r", "a", etc.
  if (!sourceIsCoords && sourceQuery.length < 3) {
    setStatus(
      "Starting location is too short. Please enter a valid place name."
    );
    return;
  }

  if (destQuery.length < 3) {
    setStatus(
      "Destination location is too short. Please enter a valid place name."
    );
    return;
  }

  // =====================================================
  // STEP 2: GEOCODE WHICHEVER LOCATIONS NEED IT
  // =====================================================

  setStatus("Locating places...");

  try {
    const [sourceResult, destResult] = await Promise.allSettled([
      sourceIsCoords
        ? Promise.resolve(sourceInput)
        : geocode(sourceQuery, {
            city: "Ahmedabad",
            countryCode: "in",
          }),

      geocode(destQuery, {
        city: "Ahmedabad",
        countryCode: "in",
      }),
    ]);

    // =====================================================
    // STEP 3: CHECK IF LOCATIONS WERE FOUND
    // =====================================================

    const badFields = [];

    if (
      sourceResult.status === "rejected" ||
      !sourceResult.value
    ) {
      badFields.push(sourceIsCoords ? "your current location" : `source "${sourceQuery}"`);
    }

    if (
      destResult.status === "rejected" ||
      !destResult.value
    ) {
      badFields.push(`destination "${destQuery}"`);
    }

    if (badFields.length > 0) {
      setStatus(
        `Couldn't find a valid location for ${badFields.join(
          " and "
        )}. Please enter a real place, area, landmark, or address in Ahmedabad.`
      );

      return;
    }

    // =====================================================
    // STEP 4: GET GEOCODED RESULTS
    // =====================================================

    const source = sourceResult.value;
    const destination = destResult.value;

    // =====================================================
    // STEP 5: VALIDATE COORDINATES
    // =====================================================

    if (
      typeof source.lat !== "number" ||
      typeof source.lon !== "number" ||
      typeof destination.lat !== "number" ||
      typeof destination.lon !== "number"
    ) {
      setStatus(
        "The selected location could not be converted into valid coordinates."
      );

      return;
    }

    // =====================================================
    // STEP 6: CHECK SOURCE AND DESTINATION ARE DIFFERENT
    // =====================================================

    const latDifference = Math.abs(
      source.lat - destination.lat
    );

    const lonDifference = Math.abs(
      source.lon - destination.lon
    );

    // Very small coordinate difference means
    // both locations are effectively the same place.
    if (
      latDifference < 0.0001 &&
      lonDifference < 0.0001
    ) {
      setStatus(
        "Source and destination cannot be the same location. Please choose two different places."
      );

      return;
    }

    // =====================================================
    // STEP 7: SEND VALID LOCATIONS TO BACKEND
    // =====================================================

    setStatus(
      "Finding safest, fastest and balanced routes..."
    );

    await planRoutes(
      source,
      destination
    );

    // Clear status after successful request
    setStatus("");

  } catch (err) {

    // =====================================================
    // STEP 8: HANDLE BACKEND / ROUTING ERRORS
    // =====================================================

    setStatus(
      err?.response?.data?.error ||
      err?.message ||
      "Unable to find routes. Please try again."
    );
  }
}
  return (
    // Inline flex here (rather than a Tailwind `flex` class) deliberately
    // wins over the `.view-panel.active { display:block }` rule in
    // theme.css regardless of stylesheet ordering/specificity — this view
    // is now a column: full-width top navbar, then a relative area that
    // the map and all its absolutely-positioned overlays fill.
    <div className="view-panel active" style={{ display: "flex", flexDirection: "column" }}>

      {!nav.active && (
        <TopNavBar
          onPlan={handlePlan}
          loading={loading}
          status={status || (error && error)}
        />
      )}

      <div className="relative" style={{ flex: 1, minHeight: 0 }}>
        {/* Map */}
        <MapView
          routes={routes}
          selectedIndex={selectedIndex}
          endpoints={endpoints}
          hotspots={visibleHotspots}
          onSelectRoute={nav.active ? undefined : setSelectedIndex}
          liveLocation={nav.position ? { ...nav.position, heading: nav.heading } : null}
          navigating={nav.active}
        />

        {!nav.active && (
          <BottomFilterBar
            hotspots={hotspots}
            activeTypes={activeTypes}
            onToggleType={toggleHotspotType}
            onShowAll={showAllHotspotTypes}
            onHideAll={hideAllHotspotTypes}
          />
        )}

        {nav.active && <NavigationPanel nav={nav} onExit={nav.stop} />}

        {!nav.active && (
          <>
          {/* Hotspot severity legend */}
          <div className="legend-card">
            <div className="lt">
              Hotspot severity
            </div>

            <div className="legend-row">
              <span
                className="dot"
                style={{ background: "var(--risk)" }}
              />
              High
            </div>

            <div className="legend-row">
              <span
                className="dot"
                style={{ background: "var(--medium)" }}
              />
              Medium
            </div>

            <div className="legend-row">
              <span
                className="dot"
                style={{ background: "var(--safe)" }}
              />
              Low
            </div>
          </div>

          {/* Route cards */}
          {routes && routes.length > 0 && (
            <RoutesCard
              routes={routes}
              selectedIndex={selectedIndex}
              onSelect={setSelectedIndex}
              onNavigate={() => nav.start()}
            />
          )}
          </>
        )}
      </div>
    </div>
  );
}
