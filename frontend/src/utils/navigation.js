// Turn-by-turn navigation helpers.
//
// The backend only ever gives us a route as a line (a list of
// coordinates) — there's no "turn left onto MG Road" data attached to
// it. So everything here works out live navigation purely from that
// line: where the user currently is compared to it, how far is left,
// and where the line bends enough to count as a turn.

const EARTH_RADIUS_M = 6371000;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function toDeg(rad) {
  return (rad * 180) / Math.PI;
}

export function distanceMeters(lat1, lon1, lat2, lon2) {
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dPhi = toRad(lat2 - lat1);
  const dLambda = toRad(lon2 - lon1);

  const a =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function bearingDegrees(lat1, lon1, lat2, lon2) {
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dLambda = toRad(lon2 - lon1);

  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);

  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// The backend returns geometry as GeoJSON: [lon, lat] pairs.
function toLatLonPoints(coordinates) {
  return coordinates.map(([lon, lat]) => ({ lat, lon }));
}

// Projects a point onto a short line segment using a flat-earth
// approximation (fine for segments a few hundred metres long) so we
// can do the projection in plain metres instead of spherical math.
function projectOntoSegment(p, a, b) {
  const mPerDegLat = 111320;
  const mPerDegLon = 111320 * Math.cos(toRad(a.lat));

  const bx = (b.lon - a.lon) * mPerDegLon;
  const by = (b.lat - a.lat) * mPerDegLat;
  const px = (p.lon - a.lon) * mPerDegLon;
  const py = (p.lat - a.lat) * mPerDegLat;

  const abLenSq = bx * bx + by * by || 1e-9;
  let t = (px * bx + py * by) / abLenSq;
  t = Math.max(0, Math.min(1, t));

  const cx = bx * t;
  const cy = by * t;
  const dx = px - cx;
  const dy = py - cy;

  return { distance: Math.sqrt(dx * dx + dy * dy), t };
}

/**
 * Finds where the user currently is relative to the route line.
 *
 * Returns:
 *   segmentIndex       — which stretch of the route they're on
 *   distanceToRoute     — how far (metres) they are from the line itself
 *   distanceTraveled    — how far along the route they've walked
 *   distanceRemaining   — how far is left to the destination
 */
export function locateOnRoute(position, coordinates) {
  const points = toLatLonPoints(coordinates);

  if (points.length < 2) {
    return {
      segmentIndex: 0,
      distanceToRoute: Infinity,
      distanceTraveled: 0,
      distanceRemaining: 0,
      totalLength: 0,
    };
  }

  let best = { segmentIndex: 0, distanceToRoute: Infinity, t: 0 };

  for (let i = 0; i < points.length - 1; i++) {
    const { distance, t } = projectOntoSegment(position, points[i], points[i + 1]);
    if (distance < best.distanceToRoute) {
      best = { segmentIndex: i, distanceToRoute: distance, t };
    }
  }

  let traveled = 0;
  let totalLength = 0;

  for (let i = 0; i < points.length - 1; i++) {
    const segLen = distanceMeters(
      points[i].lat, points[i].lon,
      points[i + 1].lat, points[i + 1].lon
    );
    totalLength += segLen;
    if (i < best.segmentIndex) traveled += segLen;
    if (i === best.segmentIndex) traveled += segLen * best.t;
  }

  return {
    segmentIndex: best.segmentIndex,
    distanceToRoute: best.distanceToRoute,
    distanceTraveled: traveled,
    distanceRemaining: Math.max(0, totalLength - traveled),
    totalLength,
  };
}

/**
 * Builds a simple list of turn-by-turn steps by walking the route line
 * and flagging spots where the direction changes sharply enough to be
 * a real turn (not just GPS/road noise).
 */
export function buildTurnInstructions(coordinates, { minTurnAngle = 28, mergeDistance = 15 } = {}) {
  const points = toLatLonPoints(coordinates);

  if (points.length < 3) {
    return [{ type: "arrive", text: "You have arrived", atIndex: Math.max(0, points.length - 1) }];
  }

  // Collapse points that are very close together first, so tiny
  // wiggles in the road data don't get read as turns.
  const simplified = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = simplified[simplified.length - 1];
    const d = distanceMeters(prev.lat, prev.lon, points[i].lat, points[i].lon);
    if (d >= mergeDistance || i === points.length - 1) {
      simplified.push(points[i]);
    }
  }

  const instructions = [{ type: "start", text: "Start walking", atIndex: 0 }];

  for (let i = 1; i < simplified.length - 1; i++) {
    const inBearing = bearingDegrees(
      simplified[i - 1].lat, simplified[i - 1].lon,
      simplified[i].lat, simplified[i].lon
    );
    const outBearing = bearingDegrees(
      simplified[i].lat, simplified[i].lon,
      simplified[i + 1].lat, simplified[i + 1].lon
    );

    let delta = outBearing - inBearing;
    delta = ((delta + 540) % 360) - 180; // normalize to -180..180

    if (Math.abs(delta) >= minTurnAngle) {
      const side = delta > 0 ? "right" : "left";
      const sharp = Math.abs(delta) >= 100;
      instructions.push({
        type: side,
        text: sharp ? `Sharp turn ${side}` : `Turn ${side}`,
        atIndex: i,
        point: simplified[i],
      });
    }
  }

  instructions.push({ type: "arrive", text: "You have arrived", atIndex: simplified.length - 1 });

  return instructions;
}

export function formatDistance(meters) {
  if (!Number.isFinite(meters)) return "--";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}

export function formatEtaMinutes(meters, speedMps = 1.34) {
  if (!Number.isFinite(meters)) return null;
  return Math.max(1, Math.round(meters / speedMps / 60));
}
