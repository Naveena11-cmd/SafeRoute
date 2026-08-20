import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchRouteHistory } from "../../api/history.js";
import { getDisplayScore, scoreColor, scoreBg } from "../../utils/safetyScore.js";

function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function HistoryView() {
  const [entries, setEntries] = useState(null); // null = loading
  const navigate = useNavigate();

  useEffect(() => {
    fetchRouteHistory()
      .then(setEntries)
      .catch(() => setEntries([]));
  }, []);

  function viewOnMap(entry) {
    navigate("/app", { state: { historicalRoute: entry } });
  }

  return (
    <div className="content-view">
      <div className="content-header">
        <div className="eyebrow">Your activity</div>
        <h2>Past routes you've planned</h2>
        <p>Every safe route you've searched for while signed in, most recent first — click one to view it on the map.</p>
      </div>

      {entries === null && <p className="history-empty">Loading…</p>}

      {entries !== null && entries.length === 0 && (
        <p className="history-empty">No routes planned yet — search for one under "Route & Safety" and it will show up here.</p>
      )}

      {entries?.map((h) => (
        <div className="history-item" key={h.id} onClick={() => viewOnMap(h)} role="button" tabIndex={0}>
          <div className="history-icon">🧭</div>
          <div className="history-body">
            <div className="history-route">{h.source_label} → {h.destination_label}</div>
            <div className="history-meta">
              <span>{timeAgo(h.created_at)}</span>
              <span>{h.distance_km} km</span>
              <span>{h.duration_min} min walk</span>
            </div>
          </div>
          <div
            className="history-score"
            style={{
              color: scoreColor(getDisplayScore(h.overall_safety_score).band),
              background: scoreBg(getDisplayScore(h.overall_safety_score).band),
            }}
          >
            {getDisplayScore(h.overall_safety_score).label}/100
          </div>
        </div>
      ))}
    </div>
  );
}
