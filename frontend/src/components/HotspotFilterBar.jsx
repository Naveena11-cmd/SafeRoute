// Small toolbar that sits above the map so you can toggle which
// incident categories show up as markers. Built for when real data
// replaces the sample set and the map would otherwise be covered in
// pins — this lets people declutter down to just what they care about
// (e.g. only "Harassment" and "Lighting") instead of everything at once.

const TYPE_META = {
  Theft: "💰",
  Harassment: "⚠️",
  Lighting: "💡",
  Construction: "🚧",
  "Road-block": "🚫",
  Other: "❓",
};

const TYPE_ORDER = Object.keys(TYPE_META);

function getIncidentType(h) {
  return h.incident_type || h.incidentType || h.type || "Other";
}

export default function HotspotFilterBar({
  hotspots = [],
  activeTypes,
  onToggleType,
  onShowAll,
  onHideAll,
}) {
  if (!hotspots.length) return null;

  const counts = {};
  for (const h of hotspots) {
    const type = getIncidentType(h);
    counts[type] = (counts[type] || 0) + 1;
  }

  // Only show chips for categories that actually appear in the data,
  // in a stable order, with anything unexpected falling under "Other".
  const typesPresent = TYPE_ORDER.filter((t) => counts[t] > 0);

  const allActive = typesPresent.length > 0 && typesPresent.every((t) => activeTypes.has(t));
  const visibleCount = typesPresent.reduce(
    (sum, t) => sum + (activeTypes.has(t) ? counts[t] : 0),
    0
  );

  return (
    <div className="hotspot-filter-bar">
      <span className="hotspot-filter-count">
        {visibleCount}/{hotspots.length} shown
      </span>

      <div className="hotspot-filter-chips">
        <button
          type="button"
          className={"filter-chip filter-chip-all" + (allActive ? " active" : "")}
          onClick={allActive ? onHideAll : onShowAll}
        >
          {allActive ? "Hide all" : "Show all"}
        </button>

        {typesPresent.map((type) => {
          const active = activeTypes.has(type);
          return (
            <button
              type="button"
              key={type}
              className={"filter-chip" + (active ? " active" : "")}
              onClick={() => onToggleType(type)}
            >
              <span className="filter-chip-icon">{TYPE_META[type]}</span>
              {type}
              <span className="filter-chip-count">{counts[type]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
