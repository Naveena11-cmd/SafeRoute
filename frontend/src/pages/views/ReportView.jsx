import { useEffect, useState } from "react";
import { geocode } from "../../api/geocode.js";
import { createIncident, fetchIncidents } from "../../api/incidents.js";

function formatNow() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

export default function ReportView() {
  const [incidentType, setIncidentType] = useState("Theft");
  const [severity, setSeverity] = useState("Medium");
  const [location, setLocation] = useState("");
  const [resolved, setResolved] = useState(null); // { lat, lon }
  const [resolvedHint, setResolvedHint] = useState("Resolved to: —");
  const [description, setDescription] = useState("");
  const [toast, setToast] = useState(null); // { ok: bool, text: string }
  const [submitting, setSubmitting] = useState(false);
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    loadRecent();
  }, []);

  function loadRecent() {
    fetchIncidents()
      .then((list) =>
        setRecent([...list].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 6))
      )
      .catch(() => setRecent([]));
  }

  async function handlePin() {
    if (!location.trim()) {
      setResolvedHint("Enter a location first.");
      return;
    }
    setResolvedHint("Resolving…");
    try {
      const g = await geocode(location, { city: "Ahmedabad", countryCode: "in" });
      setResolved({ lat: g.lat, lon: g.lon });
      setResolvedHint(`Resolved to: ${g.lat.toFixed(4)}, ${g.lon.toFixed(4)}`);
    } catch (err) {
      setResolvedHint(err.message);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!location.trim() || !description.trim()) {
      setToast({ ok: false, text: "Please add a location and description." });
      return;
    }

    setSubmitting(true);
    try {
      let coords = resolved;
      if (!coords) {
        try {
          const g = await geocode(location, { city: "Ahmedabad", countryCode: "in" });
          coords = { lat: g.lat, lon: g.lon };
        } catch {
          coords = { lat: 23.0225 + (Math.random() - 0.5) * 0.03, lon: 72.5714 + (Math.random() - 0.5) * 0.03 };
        }
      }

      await createIncident({
        incidentType, severity, locationLabel: location.trim(),
        lat: coords.lat, lon: coords.lon, description: description.trim(),
      });

      setToast({ ok: true, text: "Incident reported. Thank you for helping the community." });
      setLocation("");
      setDescription("");
      setResolved(null);
      setResolvedHint("Resolved to: —");
      loadRecent();
    } catch (err) {
      setToast({ ok: false, text: err.response?.data?.detail || "Could not submit the report." });
    } finally {
      setSubmitting(false);
      setTimeout(() => setToast(null), 4000);
    }
  }

  return (
    <div className="content-view">
      <div className="content-header">
        <div className="eyebrow">Report an incident</div>
        <h2>Help make the city safer</h2>
        <p>Your report becomes a hotspot signal used to score routes for other pedestrians.</p>
      </div>

      <div className="report-layout">
        <form className="report-form" onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="field-block">
              <label>Incident type</label>
              <select value={incidentType} onChange={(e) => setIncidentType(e.target.value)}>
                <option>Theft</option>
                <option>Harassment</option>
                <option>Lighting</option>
                <option>Construction</option>
                <option>Road-block</option>
              </select>
            </div>
            <div className="field-block">
              <label>Severity</label>
              <select value={severity} onChange={(e) => setSeverity(e.target.value)}>
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
              </select>
            </div>
          </div>

          <div className="field-block">
            <div className="pin-row">
              <div className="field-block">
                <label>Location (Ahmedabad landmark or area)</label>
                <input
                  value={location}
                  onChange={(e) => { setLocation(e.target.value); setResolved(null); }}
                  placeholder="e.g. Kalupur, CG Road, Bopal"
                />
              </div>
              <button type="button" className="btn-pin" onClick={handlePin}>Pin</button>
            </div>
            <div className="resolved-hint">{resolvedHint}</div>
          </div>

          <div className="field-block">
            <label>Date &amp; time</label>
            <input type="text" readOnly value={formatNow()} />
          </div>

          <div className="field-block">
            <label>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What happened? Add relevant context."
            />
          </div>

          <div className="submit-row">
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? "Submitting…" : "Submit report →"}
            </button>
            {toast && (
              <div className={"form-toast" + (toast.ok ? " ok" : "")} style={{ display: "block", color: toast.ok ? undefined : "var(--risk)" }}>
                {toast.text}
              </div>
            )}
          </div>
        </form>

        <div className="side-list panel-card">
          <h4>Recent community reports</h4>
          {recent.map((inc) => (
            <div className="side-item" key={inc.id}>
              <div className="t">{inc.incident_type}</div>
              <div className="loc">{inc.location_label}</div>
              <div className="desc">{inc.description}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
