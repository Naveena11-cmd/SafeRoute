const LEVELS = [
  { label: "Low risk", color: "#2F6F4F" },
  { label: "Medium risk", color: "#D98E2C" },
  { label: "High risk", color: "#C0503E" },
];

export default function SafetyLegend() {
  return (
    <div className="legend-card">
      <span className="legend-title">Route safety</span>
      <div className="legend-rows">
        {LEVELS.map((l) => (
          <div className="legend-row" key={l.label}>
            <span className="dot" style={{ background: l.color }} />
            {l.label}
          </div>
        ))}
      </div>
    </div>
  );
}
