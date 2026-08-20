import { useState, useRef, useCallback } from "react";
import { getCurrentPositionOnce } from "../hooks/useGeolocation.js";

export default function SearchPanel({ onPlan, loading, status }) {
  const [source, setSource] = useState("");
  const [destination, setDestination] = useState("");

  // When "Use my current location" is tapped, we hold onto the actual
  // coordinates here so submit can skip geocoding entirely for this
  // field and send the real GPS fix straight through.
  const [sourceCoords, setSourceCoords] = useState(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState("");

  // position & size state
  const [pos, setPos] = useState({ x: 16, y: 16 });
  const [size, setSize] = useState({ width: 340, height: 340 });

  const dragRef = useRef(null);
  const resizeRef = useRef(null);
  const panelRef = useRef(null);

  function handleSubmit(e) {
    e.preventDefault();
    if (!destination.trim()) return;

    if (sourceCoords) {
      onPlan(sourceCoords, destination.trim());
      return;
    }

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
    // Typing manually clears the "use my location" override so the
    // typed text is what actually gets geocoded again.
    if (sourceCoords) setSourceCoords(null);
    setSource(value);
  }

  // ---- Dragging ----
  const onDragStart = useCallback((e) => {
    // don't drag when clicking inputs/buttons
    if (e.target.closest("input, button, textarea")) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const origin = { ...pos };

    function onMove(ev) {
      setPos({
        x: origin.x + (ev.clientX - startX),
        y: origin.y + (ev.clientY - startY),
      });
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [pos]);

  // ---- Resizing ----
  const onResizeStart = useCallback((e) => {
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const origin = { ...size };

    function onMove(ev) {
      setSize({
        width: Math.max(240, origin.width + (ev.clientX - startX)),
        height: Math.max(200, origin.height + (ev.clientY - startY)),
      });
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [size]);

  return (
    <form
      ref={panelRef}
      className="plan-card"
      onSubmit={handleSubmit}
      onMouseDown={onDragStart}
      style={{
        position: "absolute",
        left: pos.x,
        top: pos.y,
        width: size.width,
        height: size.height,
        cursor: "grab",
        overflow: "auto",
        userSelect: "none",
      }}
    >
      <div className="eyebrow" style={{ cursor: "grab" }}>Plan your walk</div>
      <h3>Ahmedabad · pedestrian router</h3>

      <label>To</label>
      <input
        value={source}
        onChange={(e) => handleSourceChange(e.target.value)}
        placeholder="e.g. Kalupur Station"
        style={{ userSelect: "text", cursor: "text" }}
      />

      <button
        type="button"
        className="use-location-btn"
        onClick={handleUseMyLocation}
        disabled={locating}
      >
        {locating ? "Locating…" : "📍 Use my current location"}
      </button>
      {locateError && <div className="locate-error">{locateError}</div>}

      <label>From</label>
      <input
        value={destination}
        onChange={(e) => setDestination(e.target.value)}
        placeholder="e.g. CG Road"
        style={{ userSelect: "text", cursor: "text" }}
      />

      <button className="btn btn-primary" type="submit" disabled={loading}>
        {loading ? "Finding safe routes…" : "Find safe routes"}
      </button>

      {status && <div className="plan-status">{status}</div>}
      <div className="plan-hint">
        Try: Kalupur, CG Road, Vastrapur, SG Highway, Maninagar, Bopal, Naroda, IIM Ahmedabad, Airport
      </div>

      {/* resize handle */}
      <div
        onMouseDown={onResizeStart}
        style={{
          position: "absolute",
          right: 0,
          bottom: 0,
          width: 16,
          height: 16,
          cursor: "nwse-resize",
          background:
            "linear-gradient(135deg, transparent 50%, rgba(0,0,0,0.25) 50%)",
        }}
      />
    </form>
  );
}
