import { useEffect, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  Circle,
  CircleMarker,
  Popup,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

// Fix Leaflet marker icons when using Vite/Webpack
delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});


// ==================================================
// Safety score color
// ==================================================

function riskColor(score) {
  const value = Number(score ?? 0);

  if (value >= 70) return "#2f6f4f";
  if (value >= 45) return "#c07a1f";

  return "#c0503e";
}


// ==================================================
// Hotspot severity color
// ==================================================

function severityColor(sev) {
  const value = String(sev || "").toLowerCase();

  if (value === "high") {
    return "#c0503e";
  }

  if (value === "medium") {
    return "#c07a1f";
  }

  return "#2f6f4f";
}


// ==================================================
// Get safety score from different possible API formats
// ==================================================

function getSafetyScore(route) {
  return Number(
    route?.overallSafetyScore ??
    route?.safety_score ??
    route?.safetyScore ??
    0
  );
}


// ==================================================
// Get route type
// ==================================================

function getRouteType(route, index) {
  const type =
    route?.type ||
    route?.route_type ||
    route?.name ||
    "";

  const normalized = String(type).toLowerCase();

  if (normalized.includes("safe")) {
    return "safest";
  }

  if (normalized.includes("fast")) {
    return "fastest";
  }

  if (normalized.includes("balance")) {
    return "balanced";
  }

  // Fallback based on backend route order
  if (index === 0) {
    return "safest";
  }

  if (index === 1) {
    return "fastest";
  }

  return "balanced";
}


// ==================================================
// Route color
// ==================================================

function routeColor(route, index, isSelected) {
  if (!isSelected) {
    return "#9aa39d";
  }

  const type = getRouteType(route, index);

  if (type === "safest") {
    return "#2f6f4f";
  }

  if (type === "fastest") {
    return "#2c5f8a";
  }

  return "#8a6f2f";
}


// ==================================================
// Fit map to selected route
// ==================================================

function FitToRoute({ positions }) {
  const map = useMap();

  useEffect(() => {
    if (positions && positions.length > 1) {
      map.fitBounds(
        L.latLngBounds(positions),
        {
          padding: [60, 60],
        }
      );
    }
  }, [positions, map]);

  return null;
}


// ==================================================
// Keep the map centered on the user's live position
// while navigation is active (Google-Maps style follow)
//
//   - if the person drags the map themselves, we back off
//     instead of yanking it back on the next GPS update
//     (a "Recenter" button lets them resume)
//   - tiny GPS jitter is ignored so the view doesn't twitch
//   - uses flyTo (eased pan), and only forces the zoom level
//     once, on the very first fix, so it doesn't fight
//     zooming the person does mid-walk
// ==================================================

const JITTER_THRESHOLD_M = 6;
const FOLLOW_ZOOM = 17;

function FollowUser({ position, active, locked, onUserDrag }) {
  const map = useMap();
  const lastCenteredRef = useRef(null);
  const hasZoomedRef = useRef(false);

  useMapEvents({
    dragstart() {
      if (active) onUserDrag();
    },
  });

  useEffect(() => {
    if (!active) {
      hasZoomedRef.current = false;
      lastCenteredRef.current = null;
    }
  }, [active]);

  useEffect(() => {
    if (!active || !locked || !position) return;

    const prev = lastCenteredRef.current;
    const moved = prev
      ? map.distance([prev.lat, prev.lon], [position.lat, position.lon])
      : Infinity;

    if (moved < JITTER_THRESHOLD_M) return;

    lastCenteredRef.current = { lat: position.lat, lon: position.lon };

    const zoom = hasZoomedRef.current ? map.getZoom() : FOLLOW_ZOOM;
    hasZoomedRef.current = true;

    map.flyTo([position.lat, position.lon], zoom, {
      animate: true,
      duration: 0.8,
      easeLinearity: 0.4,
    });
  }, [active, locked, position, map]);

  useEffect(() => {
    if (active && locked && position) {
      lastCenteredRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked]);

  return null;
}


// ==================================================
// "You are here" live location marker, rotated to
// face the direction the user is walking
// ==================================================

function liveLocationIcon(heading) {
  const rotation = Number.isFinite(heading) ? heading : 0;

  return L.divIcon({
    className: "live-location-marker",
    html: `
      <div class="live-location-pulse"></div>
      <div class="live-location-dot" style="transform: rotate(${rotation}deg)">
        <div class="live-location-arrow"></div>
      </div>
    `,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}


// ==================================================
// Map View
// ==================================================

export default function MapView({
  routes = [],
  selectedIndex = 0,
  endpoints,
  hotspots = [],
  onSelectRoute,
  liveLocation = null,
  navigating = false,
}) {

  // --------------------------------------------------
  // Map center
  // --------------------------------------------------

  const center = endpoints
    ? [
        Number(endpoints.source.lat),
        Number(endpoints.source.lon),
      ]
    : [23.0225, 72.5714];


  // --------------------------------------------------
  // Selected route
  // --------------------------------------------------

  const selectedRoute = routes[selectedIndex];

  const selectedPositions =
    selectedRoute?.geometry?.coordinates?.map(
      ([lon, lat]) => [lat, lon]
    ) || [];


  // --------------------------------------------------
  // Follow-lock: true while the map should auto-center on
  // the user; flips to false the moment they drag the map
  // themselves, and back to true when they tap "Recenter".
  // --------------------------------------------------

  const [followLocked, setFollowLocked] = useState(true);
  const wasNavigatingRef = useRef(false);

  useEffect(() => {
    if (navigating && !wasNavigatingRef.current) {
      setFollowLocked(true);
    }
    wasNavigatingRef.current = navigating;
  }, [navigating]);


  // --------------------------------------------------
  // Debug hotspots
  // --------------------------------------------------

  console.log("MapView received hotspots:", hotspots);


  return (
    <>
    <MapContainer
      center={center}
      zoom={12.5}
      className="map-canvas"
      scrollWheelZoom={true}
    >

      {/* ==================================================
          MAP TILES
          ================================================== */}

      <TileLayer
        attribution="&copy; OpenStreetMap contributors &copy; CARTO"
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      />


      {/* ==================================================
          COMMUNITY INCIDENT HOTSPOTS
          ================================================== */}

      {hotspots.map((h, index) => {

        // Support different possible API coordinate names
        const lat = Number(
          h.lat ??
          h.latitude
        );

        const lon = Number(
          h.lon ??
          h.lng ??
          h.longitude
        );


        // Ignore invalid coordinates
        if (
          !Number.isFinite(lat) ||
          !Number.isFinite(lon)
        ) {
          console.warn(
            "Invalid hotspot coordinates:",
            h
          );

          return null;
        }


        // Support different possible severity fields
        const severity =
          h.severity ||
          h.risk_level ||
          "Low";


        // Support different possible incident fields
        const incidentType =
          h.incident_type ||
          h.incidentType ||
          h.type ||
          "Incident";


        // Support different possible location fields
        const locationLabel =
          h.location_label ||
          h.location ||
          h.description ||
          "Reported hotspot";


        return (
          <CircleMarker
            key={
              h.id ??
              `hotspot-${index}`
            }

            center={[
              lat,
              lon,
            ]}

            radius={10}

            pathOptions={{
              color: "#ffffff",
              weight: 2,
              fillColor:
                severityColor(severity),
              fillOpacity: 0.9,
            }}
          >

            <Popup>

              <strong>
                {incidentType}
              </strong>

              <br />

              Severity: {severity}

              <br />

              {locationLabel}

            </Popup>

          </CircleMarker>
        );
      })}


      {/* ==================================================
          ROUTE LINES
          ================================================== */}

      {routes.map((route, index) => {

        const coordinates =
          route?.geometry?.coordinates ||
          [];


        const positions =
          coordinates.map(
            ([lon, lat]) => [
              lat,
              lon,
            ]
          );


        const isSelected =
          index === selectedIndex;


        const safetyScore =
          getSafetyScore(route);


        return (
          <Polyline
            key={index}

            positions={positions}

            pathOptions={{
              color: routeColor(
                route,
                index,
                isSelected
              ),

              weight: isSelected
                ? 6
                : 4,

              opacity: isSelected
                ? 0.95
                : 0.45,

              dashArray: isSelected
                ? null
                : "2 8",
            }}

            eventHandlers={{
              click: () =>
                onSelectRoute?.(index),
            }}
          >

            <Popup>

              <b>
                Route{" "}
                {String.fromCharCode(
                  65 + index
                )}
              </b>

              <br />

              Safety Score:{" "}
              {safetyScore}/100

            </Popup>

          </Polyline>
        );
      })}


      {/* ==================================================
          START AND DESTINATION MARKERS
          ================================================== */}

      {endpoints && (
        <>

          <Marker
            position={[
              Number(
                endpoints.source.lat
              ),
              Number(
                endpoints.source.lon
              ),
            ]}
          >

            <Popup>
              {endpoints.source.label ||
                "Start"}
            </Popup>

          </Marker>


          <Marker
            position={[
              Number(
                endpoints.destination.lat
              ),
              Number(
                endpoints.destination.lon
              ),
            ]}
          >

            <Popup>
              {endpoints.destination.label ||
                "Destination"}
            </Popup>

          </Marker>

        </>
      )}


      {/* ==================================================
          LIVE "YOU ARE HERE" LOCATION
          ================================================== */}

      {liveLocation && (
        <>
          {Number.isFinite(liveLocation.accuracy) && (
            <Circle
              center={[liveLocation.lat, liveLocation.lon]}
              radius={liveLocation.accuracy}
              pathOptions={{
                color: "#2c5f8a",
                weight: 1,
                fillColor: "#2c5f8a",
                fillOpacity: 0.12,
              }}
            />
          )}

          <Marker
            position={[liveLocation.lat, liveLocation.lon]}
            icon={liveLocationIcon(liveLocation.heading)}
            zIndexOffset={1000}
          />
        </>
      )}


      {/* ==================================================
          AUTOMATICALLY FIT SELECTED ROUTE (only when not
          navigating — navigation follows the user instead)
          ================================================== */}

      {!navigating && (
        <FitToRoute
          positions={
            selectedPositions
          }
        />
      )}

      <FollowUser
        position={liveLocation}
        active={navigating}
        locked={followLocked}
        onUserDrag={() => setFollowLocked(false)}
      />

    </MapContainer>

    {navigating && !followLocked && (
      <button className="recenter-btn" onClick={() => setFollowLocked(true)}>
        ⦿ Recenter
      </button>
    )}

    </>
  );
}