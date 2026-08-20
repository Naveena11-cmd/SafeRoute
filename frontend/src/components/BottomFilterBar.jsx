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

// Floating bar pinned to the bottom of the map (not the page) so it
// reads as a map control, not a second page footer. `absolute` + the
// map container being `relative` keeps it anchored over the map even
// as the map itself scrolls/pans.
export default function BottomFilterBar({ hotspots = [], activeTypes, onToggleType, onShowAll, onHideAll }) {
  if (!hotspots.length) return null;

  const counts = {};
  for (const h of hotspots) {
    const type = getIncidentType(h);
    counts[type] = (counts[type] || 0) + 1;
  }
  const typesPresent = TYPE_ORDER.filter((t) => counts[t] > 0);
  const allActive = typesPresent.length > 0 && typesPresent.every((t) => activeTypes.has(t));
  const visibleCount = typesPresent.reduce((sum, t) => sum + (activeTypes.has(t) ? counts[t] : 0), 0);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-[900] flex justify-center px-4">
      <div className="pointer-events-auto flex max-w-full items-center gap-2 overflow-x-auto rounded-full border border-slate-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur">
        <span className="shrink-0 whitespace-nowrap text-xs font-medium text-slate-500">
          {visibleCount}/{hotspots.length} shown
        </span>

        <button
          type="button"
          onClick={allActive ? onHideAll : onShowAll}
          className={
            "shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold transition " +
            (allActive
              ? "border-sky-600 bg-sky-600 text-white"
              : "border-slate-300 text-slate-600 hover:bg-slate-50")
          }
        >
          {allActive ? "Hide all" : "Show all"}
        </button>

        {typesPresent.map((type) => {
          const active = activeTypes.has(type);
          return (
            <button
              key={type}
              type="button"
              onClick={() => onToggleType(type)}
              className={
                "shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition " +
                (active
                  ? "border-sky-600 bg-sky-50 text-sky-700"
                  : "border-slate-300 text-slate-500 hover:bg-slate-50")
              }
            >
              <span className="mr-1">{TYPE_META[type]}</span>
              {type}
              <span className="ml-1 text-slate-400">{counts[type]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
