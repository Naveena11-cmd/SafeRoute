import { useEffect, useRef, useState } from "react";

/**
 * Watches the device's live location while `enabled` is true.
 * Uses navigator.geolocation.watchPosition, which keeps firing as the
 * user moves (unlike getCurrentPosition, which only fires once).
 *
 * Needs HTTPS (or localhost) and the user granting location
 * permission — the browser handles that prompt automatically.
 */
export function useGeolocation({ enabled = false, options } = {}) {
  const [position, setPosition] = useState(null);
  const [error, setError] = useState(null);
  const watchIdRef = useRef(null);

  useEffect(() => {
    if (!enabled) {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }

    if (!("geolocation" in navigator)) {
      setError("This browser/device doesn't support live location.");
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setError(null);
        setPosition({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          heading: Number.isFinite(pos.coords.heading) ? pos.coords.heading : null,
          speed: Number.isFinite(pos.coords.speed) ? pos.coords.speed : null,
          timestamp: pos.timestamp,
        });
      },
      (err) => {
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied. Allow location access to navigate."
            : err.message || "Couldn't get your location."
        );
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000, ...options }
    );

    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [enabled]);

  return { position, error };
}

/**
 * One-shot version — gets the current position once instead of
 * subscribing to updates. Used by the "use my location" button in
 * SearchPanel, where we just need a single fix, not continuous
 * tracking.
 */
export function getCurrentPositionOnce(options) {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("This browser/device doesn't support location access."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      (err) => {
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? "Location permission denied. Allow location access to use this."
              : err.message || "Couldn't get your location."
          )
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000, ...options }
    );
  });
}
