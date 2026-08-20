import { useEffect, useMemo, useRef, useState } from "react";
import { useGeolocation } from "./useGeolocation.js";
import {
  locateOnRoute,
  buildTurnInstructions,
  formatDistance,
  formatEtaMinutes,
  distanceMeters,
  bearingDegrees,
} from "../utils/navigation.js";

const OFF_ROUTE_THRESHOLD_M = 40; // how far off the line before we call it "off route"
const REROUTE_COOLDOWN_MS = 15000; // don't spam the backend while off route
const ARRIVAL_THRESHOLD_M = 20;

/**
 * Drives Google-Maps-style live navigation for a single selected route:
 *   - watches the device's real GPS position
 *   - the moment navigation starts, replans from wherever the user
 *     ACTUALLY is right now (not the typed starting point) — so
 *     navigation works even if you're nowhere near where the route
 *     was originally planned from
 *   - figures out where along the route the user currently is
 *   - picks the next turn instruction
 *   - flags "off route" and keeps rerouting automatically if they
 *     wander off the current path while walking
 */
export function useLiveNavigation({ route, destination, onReroute }) {
  const [active, setActive] = useState(false);
  const [arrived, setArrived] = useState(false);
  const [locating, setLocating] = useState(false);
  const lastRerouteRef = useRef(0);
  const hasDoneInitialRerouteRef = useRef(false);

  const { position, error: geoError } = useGeolocation({ enabled: active });

  // Most phones/laptops only report a compass `heading` while actually
  // moving at some speed (often null when stationary or on desktop
  // browsers). Fall back to the bearing between the last two GPS fixes
  // so the "you are here" arrow still points the way you're walking.
  const lastFixRef = useRef(null);
  const [displayHeading, setDisplayHeading] = useState(0);

  useEffect(() => {
    if (!position) return;

    if (Number.isFinite(position.heading)) {
      setDisplayHeading(position.heading);
      lastFixRef.current = { lat: position.lat, lon: position.lon };
      return;
    }

    const prev = lastFixRef.current;
    lastFixRef.current = { lat: position.lat, lon: position.lon };

    if (prev) {
      const moved = distanceMeters(prev.lat, prev.lon, position.lat, position.lon);
      if (moved > 2) {
        setDisplayHeading(bearingDegrees(prev.lat, prev.lon, position.lat, position.lon));
      }
    }
  }, [position]);

  // The moment we get a live GPS fix after starting navigation, replan
  // immediately from that real position — this is what makes
  // navigation work correctly even when you're far from wherever the
  // route was originally typed/planned from.
  useEffect(() => {
    if (!active || hasDoneInitialRerouteRef.current || !position || !onReroute || !destination) {
      return;
    }
    hasDoneInitialRerouteRef.current = true;
    lastRerouteRef.current = Date.now();
    setLocating(true);
    Promise.resolve(
      onReroute({ lat: position.lat, lon: position.lon, label: "Current location" }, destination)
    ).finally(() => setLocating(false));
  }, [active, position, onReroute, destination]);

  const coordinates = route?.geometry?.coordinates || [];
  const instructions = useMemo(() => buildTurnInstructions(coordinates), [coordinates]);

  const progress = useMemo(() => {
    if (!position || coordinates.length < 2) return null;
    return locateOnRoute(position, coordinates);
  }, [position, coordinates]);

  const offRoute = Boolean(progress && progress.distanceToRoute > OFF_ROUTE_THRESHOLD_M);

  const nextInstruction = useMemo(() => {
    if (!progress) return instructions[0];
    const upcoming = instructions.find(
      (step) => step.type !== "start" && step.atIndex > progress.segmentIndex
    );
    return upcoming || instructions[instructions.length - 1];
  }, [instructions, progress]);

  // Ongoing off-route detection + arrival, for the rest of the walk
  // (after the initial "route from where I actually am" reroute above
  // has already happened).
  useEffect(() => {
    if (!active || !progress || !position || !hasDoneInitialRerouteRef.current) return;

    if (progress.distanceRemaining <= ARRIVAL_THRESHOLD_M) {
      setArrived(true);
      return;
    }

    if (offRoute && onReroute && destination) {
      const now = Date.now();
      if (now - lastRerouteRef.current > REROUTE_COOLDOWN_MS) {
        lastRerouteRef.current = now;
        onReroute(
          { lat: position.lat, lon: position.lon, label: "Current location" },
          destination
        );
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, progress, offRoute]);

  function start() {
    setArrived(false);
    hasDoneInitialRerouteRef.current = false;
    lastRerouteRef.current = 0;
    setActive(true);
  }

  function stop() {
    setActive(false);
    setArrived(false);
    hasDoneInitialRerouteRef.current = false;
  }

  return {
    active,
    start,
    stop,
    position,
    heading: displayHeading,
    geoError,
    progress,
    offRoute,
    arrived,
    locating,
    nextInstruction,
    distanceRemainingText: progress ? formatDistance(progress.distanceRemaining) : "--",
    etaMinutes: progress ? formatEtaMinutes(progress.distanceRemaining) : null,
  };
}
