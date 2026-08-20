import { useEffect, useRef, useState } from "react";
import Chart from "chart.js/auto";
import { fetchAnalysis } from "../../api/analysis.js";

const TYPE_COLORS = {
  Theft: "#c0503e", Harassment: "#c07a1f", Lighting: "#e0b84a",
  "Road-block": "#8a8f6b", Construction: "#2c5f8a",
};
const TYPES = ["Theft", "Harassment", "Lighting", "Road-block", "Construction"];

/** Pivots the API's [{year, incident_type, count}] rows into per-type series aligned to `years`. */
function pivotByYearType(rows, years) {
  const series = Object.fromEntries(TYPES.map((t) => [t, years.map(() => 0)]));
  rows.forEach((r) => {
    const idx = years.indexOf(r.year);
    if (idx !== -1 && series[r.incident_type]) series[r.incident_type][idx] = r.count;
  });
  return series;
}

export default function AnalysisView() {
  const [data, setData] = useState(null);
  const stackedRef = useRef(null);
  const lineRef = useRef(null);
  const donutRef = useRef(null);
  const chartInstances = useRef([]);

  useEffect(() => {
    fetchAnalysis().then(setData).catch(() => setData(null));
  }, []);

  useEffect(() => {
    if (!data) return;

    // Tear down any previous instances before redrawing (e.g. on re-fetch).
    chartInstances.current.forEach((c) => c.destroy());
    chartInstances.current = [];

    const years = [...new Set(data.by_year_total.map((r) => r.year))].sort();
    const series = pivotByYearType(data.by_year_type, years);
    const totals = years.map((y) => data.by_year_total.find((r) => r.year === y)?.count || 0);

    if (stackedRef.current) {
      chartInstances.current.push(new Chart(stackedRef.current, {
        type: "bar",
        data: {
          labels: years,
          datasets: TYPES.map((t) => ({ label: t, data: series[t], backgroundColor: TYPE_COLORS[t], stack: "s" })),
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 10 } } } },
          scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, grid: { color: "#eef1ee" } } },
        },
      }));
    }
if (lineRef.current) {
  chartInstances.current.push(
    new Chart(lineRef.current, {
      type: "line",
      data: {
        labels: years,
        datasets: [
          {
            label: "Total incidents",
            data: totals,
            borderColor: "#2c5f8a",
            backgroundColor: "rgba(44,95,138,.12)",
            fill: true,
            tension: 0.35,
            pointRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false,
          },
        },
        scales: {
          x: {
            grid: {
              display: false,
            },
          },
          y: {
            grid: {
              color: "#eef1ee",
            },
            beginAtZero: true,
          },
        },
      },
    })
  );
}

    if (donutRef.current) {
      const thisYear = TYPES.map((t) => data.this_year_by_type.find((r) => r.incident_type === t)?.count || 0);
      chartInstances.current.push(new Chart(donutRef.current, {
        type: "doughnut",
        data: { labels: TYPES, datasets: [{ data: thisYear, backgroundColor: TYPES.map((t) => TYPE_COLORS[t]) }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 10 } } } } },
      }));
    }

    return () => {
      chartInstances.current.forEach((c) => c.destroy());
      chartInstances.current = [];
    };
  }, [data]);

  return (
    <div className="content-view">
      <div className="content-header">
        <div className="eyebrow">Yearly analysis</div>
        <h2>Incident trends across Ahmedabad</h2>
        <p>Real aggregation over reported incidents, broken down by type and hotspot area.</p>
      </div>

      {!data && <p style={{ color: "var(--muted)", fontSize: 13 }}>Loading…</p>}

      {data && (
        <div className="grid-2">
          <div className="panel-card">
            <h4>Incidents by year &amp; type</h4>
            <div className="chart-wrap"><canvas ref={stackedRef}></canvas></div>
          </div>
          <div className="panel-card">
            <h4>Total incidents · year on year</h4>
            <div className="chart-wrap"><canvas ref={lineRef}></canvas></div>
          </div>
          <div className="panel-card">
            <h4>This year · by category</h4>
            <div className="chart-wrap"><canvas ref={donutRef}></canvas></div>
          </div>
          <div className="panel-card">
            <h4>Top risk areas</h4>
            {data.top_risk_areas.map((r) => (
              <div className="risk-bar-row" key={r.name}>
                <span className="rname">{r.name}</span>
                <div className="risk-bar-track"><div className="risk-bar-fill" style={{ width: `${r.score}%` }} /></div>
                <span>{r.score}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
