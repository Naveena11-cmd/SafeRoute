import { useEffect, useState } from "react";
import { fetchIncidents } from "../../api/incidents.js";

const TYPE_ICON = { Theft: "💰", Harassment: "⚠️", Lighting: "💡", Construction: "🚧", "Road-block": "🚫" };

function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function AlertsView() {
  const [incidents, setIncidents] = useState(null);

  useEffect(() => {
    fetchIncidents()
      .then((list) => setIncidents([...list].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))))
      .catch(() => setIncidents([]));
  }, []);

  return (
    <div className="content-view">
      <div className="content-header">
        <div className="eyebrow">Live safety alerts</div>
        <h2>Alerts across Ahmedabad</h2>
        <p>System advisories and community-submitted incidents, sorted by most recent — live from the database.</p>
      </div>

      {incidents === null && <p style={{ color: "var(--muted)", fontSize: 13 }}>Loading…</p>}

      {incidents?.map((inc) => (
        <div className={"alert-item sev-" + inc.severity.toLowerCase()} key={inc.id}>
          <div className="alert-icon">{TYPE_ICON[inc.incident_type] || "⚠️"}</div>
          <div className="alert-body">
            <div className="alert-top">
              <span className="alert-title">{inc.incident_type} reported at {inc.location_label}</span>
              <span className="alert-time">{timeAgo(inc.created_at)}</span>
            </div>
            <div className="alert-desc">{inc.description}</div>
            <div className="alert-tags">
              <span className="pill">{inc.location_label}</span>
              <span className={"pill sev " + inc.severity.toLowerCase()}>{inc.severity.toUpperCase()}</span>
              <span className="pill">{inc.source}{inc.reported_by_name ? ` · ${inc.reported_by_name}` : ""}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
