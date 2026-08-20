// The backend's raw overall_safety_score is a genuine 0-100 ML+hotspot
// blend, but in practice it clusters low-to-mid (40s-50s) even for the
// *safest* candidate route in a corridor — because the model is scoring
// against a synthetic-data baseline, not calibrated against what "70"
// should mean to a pedestrian. Shown raw, the safest route in a batch
// can still look orange/red, which reads as "nothing here is safe" even
// when it's the best available option.
//
// scaleSafetyScore() is a *display-only* rescale: it stretches the raw
// 0-100 score into a 60-98 range so relative ranking between routes is
// preserved (a higher raw score always yields a higher scaled score) but
// the visible number sits in a range people actually read as "OK to
// good" rather than "avoid this". The raw score is still what gets
// saved/sent to the backend — only the *display* is rescaled.
const DISPLAY_MIN = 60;
const DISPLAY_MAX = 98;

export function scaleSafetyScore(rawScore) {
  const raw = Number(rawScore);
  if (!Number.isFinite(raw)) return null;
  const clamped = Math.max(0, Math.min(100, raw));
  return DISPLAY_MIN + (clamped / 100) * (DISPLAY_MAX - DISPLAY_MIN);
}

// Color bands tuned to the 60-98 display range (not the raw 0-100 range)
// so a scaled score actually lands in green/yellow/red the way the
// number implies.
export function getScoreBand(scaledScore) {
  if (scaledScore == null) return "unknown";
  if (scaledScore >= 85) return "safe";
  if (scaledScore >= 72) return "medium";
  return "risk";
}

// CSS var hex values (kept in sync with theme.css / tailwind.config.js)
const BAND_COLOR = { safe: "#2f6f4f", medium: "#c07a1f", risk: "#c0503e", unknown: "#69766f" };
const BAND_BG = { safe: "#e7f2ec", medium: "#faf0dc", risk: "#fbeae6", unknown: "#e3e8e4" };

// Tailwind utility classes for the same bands, for components using
// Tailwind directly instead of inline CSS-var styles.
const BAND_TW = {
  safe: "bg-emerald-100 text-emerald-700 border-emerald-300",
  medium: "bg-amber-100 text-amber-700 border-amber-300",
  risk: "bg-red-100 text-red-700 border-red-300",
  unknown: "bg-gray-100 text-gray-600 border-gray-300",
};

export function scoreColor(band) {
  return BAND_COLOR[band] || BAND_COLOR.unknown;
}
export function scoreBg(band) {
  return BAND_BG[band] || BAND_BG.unknown;
}
export function scoreTailwindClasses(band) {
  return BAND_TW[band] || BAND_TW.unknown;
}

// Convenience one-shot: raw score in, everything a component needs out.
export function getDisplayScore(rawScore) {
  const scaled = scaleSafetyScore(rawScore);
  const band = getScoreBand(scaled);
  return {
    raw: Number(rawScore),
    scaled,
    band, // "safe" | "medium" | "risk" | "unknown"
    label: scaled == null ? "N/A" : scaled.toFixed(1),
  };
}
