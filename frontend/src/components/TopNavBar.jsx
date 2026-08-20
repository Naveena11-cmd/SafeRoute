import { useState } from "react";
import { getCurrentPositionOnce } from "../hooks/useGeolocation.js";

// Full-width "Plan your walk" navbar, pinned to the top of the view.
// Replaces the old draggable/resizable floating card (SearchPanel.jsx)
// with a fixed horizontal bar: TO + FROM inputs and the submit button
// sit side-by-side and wrap to a second line on narrow screens instead
// of overlapping the map.
export default function TopNavBar({ onPlan, loading, status }) {
  const [source, setSource] = useState("");
  const [destination, setDestination] = useState("");
  const [sourceCoords, setSourceCoords] = useState(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!destination.trim()) return;

    let src = sourceCoords;
    if (!src && source.trim()) {
      const lower = source.toLowerCase();
      if (lower.includes("current location") || lower.includes("my location")) {
        setLocateError("");
        setLocating(true);
        try {
          const coords = await getCurrentPositionOnce();
          src = { ...coords, label: "Current location" };
          setSourceCoords(src);
        } catch (err) {
          setLocateError(err.message || "Couldn't get your location. Please type an address.");
          setLocating(false);
          return;
        } finally {
          setLocating(false);
        }
      }
    }

    if (src) return onPlan(src, destination.trim());
    if (!source.trim()) return;
    onPlan(source.trim(), destination.trim());
  }

  async function handleUseMyLocation() {
    setLocateError("");
    setLocating(true);
    try {
      const coords = await getCurrentPositionOnce();
      setSourceCoords({ ...coords, label: "Current location" });
      setSource("📍 Current location");
    } catch (err) {
      setLocateError(err.message || "Couldn't get your location.");
    } finally {
      setLocating(false);
    }
  }

  function handleSourceChange(value) {
    if (sourceCoords) setSourceCoords(null);
    setSource(value);
  }

  return (
    <header className="sticky top-0 z-[1000] w-full bg-white border-b border-slate-200 shadow-sm">
      <form
        onSubmit={handleSubmit}
        className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:gap-3"
      >
        <div className="shrink-0">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Plan your walk
          </div>
          <div className="text-sm font-semibold text-slate-800">Ahmedabad · pedestrian router</div>
        </div>

        <div className="flex flex-1 flex-col gap-2 md:flex-row md:items-center">
          <div className="flex flex-1 items-center gap-2">
            <label className="text-xs font-semibold text-slate-500 md:w-11">FROM</label>
            <input
              value={source}
              onChange={(e) => handleSourceChange(e.target.value)}
              placeholder="Starting point (e.g. Kalupur Station)"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
            />
            <button
              type="button"
              onClick={handleUseMyLocation}
              disabled={locating}
              className="shrink-0 whitespace-nowrap rounded-lg border border-slate-300 px-2.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              {locating ? "Locating…" : "📍 My location"}
            </button>
          </div>

          <div className="flex flex-1 items-center gap-2">
            <label className="text-xs font-semibold text-slate-500 md:w-7">TO</label>
            <input
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="Destination (e.g. CG Road)"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="shrink-0 rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-60"
          >
            {loading ? "Finding safe routes…" : "Find safe routes"}
          </button>
        </div>
      </form>

      {(locateError || status) && (
        <div className="mx-auto w-full max-w-7xl px-4 pb-2 text-xs text-slate-500">
          {locateError || status}
        </div>
      )}
    </header>
  );
}
