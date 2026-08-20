function arrowGlyph(type) {
  if (type === "left") return "↰";
  if (type === "right") return "↱";
  if (type === "arrive") return "🏁";
  return "↑";
}

export default function NavigationPanel({ nav, onExit }) {
  if (!nav.active) return null;

  const {
    nextInstruction,
    distanceRemainingText,
    etaMinutes,
    offRoute,
    arrived,
    geoError,
    position,
    locating,
  } = nav;

  return (
    <div className="nav-panel">
      <div className="nav-top">
        <div className="nav-instruction-icon">
          {arrowGlyph(arrived ? "arrive" : nextInstruction?.type)}
        </div>

        <div className="nav-instruction-text">
          <div className="nav-instruction-main">
            {locating
              ? "Finding your location…"
              : arrived
              ? "You have arrived"
              : nextInstruction?.text || "Continue straight"}
          </div>
          {!arrived && !locating && (
            <div className="nav-instruction-sub">
              {position ? "Following your live location" : "Waiting for GPS signal…"}
            </div>
          )}
        </div>

        <button className="nav-exit" onClick={onExit} aria-label="Exit navigation">
          ✕
        </button>
      </div>

      {geoError && <div className="nav-banner nav-banner-warn">{geoError}</div>}

      {!geoError && offRoute && !arrived && !locating && (
        <div className="nav-banner nav-banner-warn">Off route — recalculating your path…</div>
      )}

      {!arrived && !locating && (
        <div className="nav-stats">
          <span>
            <b>{distanceRemainingText}</b> remaining
          </span>
          <span>
            <b>{etaMinutes ?? "--"}</b> min ETA
          </span>
        </div>
      )}

      {arrived && (
        <div className="nav-banner nav-banner-arrived">You've reached your destination.</div>
      )}
    </div>
  );
}
