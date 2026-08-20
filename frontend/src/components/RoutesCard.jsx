import { getDisplayScore, scoreTailwindClasses } from "../utils/safetyScore.js";

const TAG_CLASS = {
  safest: "tag-safest",
  fastest: "tag-fastest",
  balanced: "tag-moderate",
  alternative: "tag-moderate",
  history: "tag-fastest",
};

function getRouteType(route, index) {
  const id = String(route?.id || "").toLowerCase();

  if (id === "safest") return "safest";
  if (id === "fastest") return "fastest";
  if (id === "balanced") return "balanced";
  if (id === "history") return "history";

  // Handles alternative, alternative-2, alternative-3, etc.
  if (id.startsWith("alternative")) {
    return "alternative";
  }

  // Fallback if backend does not provide an ID
  if (index === 0) return "safest";
  if (index === 1) return "fastest";
  if (index === 2) return "balanced";

  return "alternative";
}

function getRouteLabel(type, route) {
  // Prefer the backend label when it is meaningful.
  if (
    route?.label &&
    route.label !== "Alternative Route"
  ) {
    return route.label
      .replace(" Route", "");
  }

  const labels = {
    safest: "Safest",
    fastest: "Fastest",
    balanced: "Balanced",
    alternative: "Alternative",
    history: "From History",
  };

  return labels[type] || "Alternative";
}

export default function RoutesCard({
  routes = [],
  selectedIndex = 0,
  onSelect,
  onNavigate,
}) {
  if (!routes.length) return null;

  return (
    <div className="routes-card">

      {/* Number of routes found */}
      <div className="routes-banner">
        {routes.length === 1
          ? "Found 1 route"
          : `Found ${routes.length} routes`}
      </div>

      <div className="routes-title">
        Available routes
      </div>

      {routes.map((route, index) => {

        const routeType = getRouteType(
          route,
          index
        );

        const label = getRouteLabel(
          routeType,
          route
        );

        const tagClass =
          TAG_CLASS[routeType] ||
          "tag-moderate";

        // Display score is rescaled to a 60-98 range so the safest
        // route in the list reads as green/viable instead of the raw
        // ML+hotspot score (which clusters in the 40s-50s) reading as
        // orange/red across the board — see utils/safetyScore.js.
        const display = getDisplayScore(route.overallSafetyScore);

        const distance = Number(
          route.distanceKm
        );

        const duration = Number(
          route.durationMin
        );

        return (
          <div
            key={
              route.id ||
              `route-${index}`
            }
            className={
              "route-option" +
              (index === selectedIndex
                ? " selected"
                : "")
            }
            onClick={() =>
              onSelect?.(index)
            }
          >

            {/* Route name and category */}
            <div className="rt-top">

              <span>
                Route{" "}
                {String.fromCharCode(
                  65 + index
                )}
              </span>

              <span
                className={
                  `route-tag ${tagClass}`
                }
              >
                {label}
              </span>

            </div>

            {/* Route statistics */}
            <div className="rt-stats">

              <span
                className={
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold " +
                  scoreTailwindClasses(display.band)
                }
                title={Number.isFinite(display.raw) ? `Raw model score: ${display.raw.toFixed(1)}/100` : undefined}
              >
                Safety <b>{display.label}</b>/100
              </span>

              <span>
                Distance{" "}
                <b>
                  {Number.isFinite(
                    distance
                  )
                    ? distance.toFixed(2)
                    : "N/A"}{" "}
                  km
                </b>
              </span>

              <span>
                Time{" "}
                <b>
                  {Number.isFinite(
                    duration
                  )
                    ? duration.toFixed(1)
                    : "N/A"}{" "}
                  min
                </b>
              </span>

            </div>

            {index === selectedIndex && onNavigate && (
              <button
                className="nav-start-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigate(index);
                }}
              >
                ▶ Start navigation
              </button>
            )}

          </div>
        );
      })}

      {/* Explanation */}
      <div className="routes-note">
        Safety scores combine ML predictions,
        historical incident hotspots, distance,
        and travel time.
      </div>

    </div>
  );
}