/**
 * map-markers.js
 * Drop-in marker rendering module — Insight Event Map
 *
 * USAGE (in your map.astro <script is:inline>):
 *   Replace your existing marker creation calls with the functions below.
 *   Keep your existing eventsLayer / roadLayer / subwayLayer as-is.
 *
 * FUNCTIONS
 *   createVenueMarker(location)          → L.Marker
 *   createEventMarker(signal)            → L.Marker
 *   createRoadMarker(signal)             → L.Marker
 *   createSubwayMarker(signal)           → L.Marker
 *
 * Each function returns a Leaflet marker ready to be added to a layer.
 */

// ---------------------------------------------------------------------------
// 1. SEVERITY COLOR RAMP
//    Single source of truth — never diverge from this elsewhere in the app.
// ---------------------------------------------------------------------------
const SEVERITY_COLORS = {
  1: '#F2C94C', // yellow
  2: '#F2994A', // orange
  3: '#EB5757', // red
  4: '#8B0000', // dark red
};

function severityColor(level) {
  return SEVERITY_COLORS[level] ?? SEVERITY_COLORS[1];
}

// ---------------------------------------------------------------------------
// 2. SVG HELPERS
//    All markers are inline SVG — no external sprite dependency.
// ---------------------------------------------------------------------------

/**
 * Venue pin: filled circle pin, dark navy, larger than signal markers.
 * Always visible — spatial anchor for the user.
 */
function venuePin() {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44">
      <filter id="v-shadow" x="-30%" y="-10%" width="160%" height="160%">
        <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="rgba(0,0,0,0.35)"/>
      </filter>
      <!-- pin body -->
      <path d="M18 2C9.716 2 3 8.716 3 17c0 10.5 15 25 15 25S33 27.5 33 17C33 8.716 26.284 2 18 2z"
            fill="#0F1F3D" filter="url(#v-shadow)"/>
      <!-- inner ring -->
      <circle cx="18" cy="17" r="6" fill="none" stroke="#ffffff" stroke-width="2"/>
      <!-- center dot -->
      <circle cx="18" cy="17" r="2.5" fill="#ffffff"/>
    </svg>`;
}

/**
 * Event pin: standard teardrop pin, neutral steel blue.
 * Competition context — not an alert.
 */
function eventPin(number) {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
      <filter id="e-shadow" x="-30%" y="-10%" width="160%" height="160%">
        <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="rgba(0,0,0,0.25)"/>
      </filter>
      <path d="M14 2C7.373 2 2 7.373 2 14c0 8.5 12 20 12 20S26 22.5 26 14C26 7.373 20.627 2 14 2z"
            fill="#0b37e5" filter="url(#e-shadow)"/>
      <text x="14" y="19" text-anchor="middle" font-size="11" font-weight="700" fill="#ffffff" font-family="sans-serif">${number}</text>
    </svg>`;
}

/**
 * Road disruption: triangle, severity-colored, car icon.
 */
function roadPin(level) {
  const color = severityColor(level);
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 34 34">
      <filter id="r-shadow" x="-20%" y="-20%" width="160%" height="160%">
        <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="rgba(0,0,0,0.3)"/>
      </filter>
      <!-- triangle -->
      <polygon points="17,3 31,30 3,30" fill="${color}" filter="url(#r-shadow)"
               stroke="rgba(0,0,0,0.15)" stroke-width="1"/>
      <!-- car icon (simplified) -->
      <text x="17" y="26" text-anchor="middle" font-size="12" fill="#1a1a1a" font-family="sans-serif">🚗</text>
    </svg>`;
}

/**
 * Subway disruption: square, severity-colored, metro M icon.
 */
function subwayPin(level) {
  const color = severityColor(level);
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">
      <filter id="s-shadow" x="-20%" y="-20%" width="160%" height="160%">
        <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="rgba(0,0,0,0.3)"/>
      </filter>
      <!-- square with rounded corners -->
      <rect x="2" y="2" width="26" height="26" rx="5" ry="5"
            fill="${color}" filter="url(#s-shadow)"
            stroke="rgba(0,0,0,0.15)" stroke-width="1"/>
      <!-- M metro symbol -->
      <text x="15" y="21" text-anchor="middle" font-size="14" font-weight="700"
            fill="#1a1a1a" font-family="sans-serif">M</text>
    </svg>`;
}

/**
 * Venue halo ring — overlaid as a separate circle marker when high severity
 * disruptions exist nearby. Adopts the highest severity color in radius.
 * Call createVenueHalo(lat, lon, maxSeverityLevel) and add to map directly.
 */
function createVenueHalo(lat, lon, maxLevel) {
  const color = severityColor(maxLevel);
  return L.circleMarker([lat, lon], {
    radius: 22,
    color: color,
    weight: 3,
    opacity: 0.75,
    fillOpacity: 0,
    interactive: false, // don't capture clicks
  });
}

// ---------------------------------------------------------------------------
// 3. ICON FACTORY
// ---------------------------------------------------------------------------

function makeIcon(svgString, width, height, anchorX, anchorY) {
  return L.divIcon({
    html: svgString,
    className: '',           // suppress Leaflet's default white box
    iconSize:   [width, height],
    iconAnchor: [anchorX, anchorY],
    popupAnchor:[0, -(anchorY - 4)],
  });
}

// ---------------------------------------------------------------------------
// 4. POPUP TEMPLATES
// ---------------------------------------------------------------------------

function venuePopup(location) {
  const transit = location.nearest_transit_stop_name
    ? `<div class="mp-transit">
         <span class="mp-transit-icon">Ⓜ</span>
         <span>${location.nearest_transit_stop_name}</span>
         ${location.nearest_transit_line_name
           ? `<span class="mp-transit-line">${location.nearest_transit_line_name}</span>`
           : ''}
         ${location.nearest_transit_stop_distance_m != null
           ? `<span class="mp-transit-dist">${Math.round(location.nearest_transit_stop_distance_m)}m</span>`
           : ''}
       </div>`
    : '';

  return `
    <div class="mp-popup mp-popup--venue">
      <div class="mp-popup-label">Votre établissement</div>
      ${transit}
    </div>`;
}

function eventPopup(signal) {
  return `
    <div class="mp-popup mp-popup--event">
      <div class="mp-popup-label">${signal.title ?? signal.event_label ?? '—'}</div>
      <div class="mp-popup-meta">
        ${signal.city_name ? `<span>${signal.city_name}</span>` : ''}
        <span>${Math.round(signal.distance_m)}m</span>
        <span class="mp-badge mp-badge--bucket">${signal.radius_bucket}</span>
      </div>
      ${signal.description
        ? `<div class="mp-popup-desc">${signal.description.slice(0, 120)}${signal.description.length > 120 ? '…' : ''}</div>`
        : ''}
    </div>`;
}

function disruptionPopup(signal, type) {
  const color = severityColor(signal.alert_level);
  const label = type === 'road' ? 'Perturbation routière' : 'Perturbation métro';
  return `
    <div class="mp-popup mp-popup--disruption">
      <div class="mp-popup-label" style="border-left:3px solid ${color}; padding-left:8px">
        ${signal.title ?? label}
      </div>
      <div class="mp-popup-meta">
        <span class="mp-badge" style="background:${color}20; color:${color}; border:1px solid ${color}40">
          Niveau ${signal.alert_level ?? '?'}
        </span>
        ${signal.line_name ? `<span>${signal.line_name}</span>` : ''}
      </div>
      ${signal.description
        ? `<div class="mp-popup-desc">${signal.description.slice(0, 140)}…</div>`
        : ''}
    </div>`;
}

// ---------------------------------------------------------------------------
// 5. PUBLIC MARKER FACTORIES
//    Drop these in wherever you currently call L.marker(...)
// ---------------------------------------------------------------------------

/**
 * createVenueMarker({ lat, lon, nearest_transit_stop_name, ... })
 */
function createVenueMarker(location) {
  const icon = makeIcon(venuePin(), 36, 44, 18, 44);
  return L.marker([location.client_lat, location.client_lon], { icon, zIndexOffset: 1000 })
    .bindTooltip(venuePopup(location), { permanent: false, sticky: true, maxWidth: 200, className: 'mp-tooltip' });
}

/**
 * createEventMarker(signal)  — signal is one row from vw_insight_event_map_signals
 */
function createEventMarker(signal, number) {
  const icon = makeIcon(eventPin(number ?? '★'), 28, 36, 14, 36);
  return L.marker([signal.latitude, signal.longitude], { icon, zIndexOffset: 100 })
    .bindTooltip(eventPopup(signal), { permanent: false, sticky: true, maxWidth: 200, className: 'mp-tooltip' });
}

/**
 * createRoadMarker(signal)   — signal must have alert_level, lat, lon
 */
function createRoadMarker(signal) {
  const icon = makeIcon(roadPin(signal.alert_level ?? 1), 34, 34, 17, 30);
  return L.marker([signal.lat, signal.lon], { icon, zIndexOffset: 200 })
    .bindTooltip(disruptionPopup(signal, 'road'), { permanent: false, sticky: true, maxWidth: 200, className: 'mp-tooltip' });
}

/**
 * createSubwayMarker(signal) — signal must have alert_level, lat, lon
 */
function createSubwayMarker(signal) {
  const icon = makeIcon(subwayPin(signal.alert_level ?? 1), 30, 30, 15, 15);
  return L.marker([signal.lat, signal.lon], { icon, zIndexOffset: 200 })
    .bindTooltip(disruptionPopup(signal, 'subway'), { permanent: false, sticky: true, maxWidth: 200, className: 'mp-tooltip' });
}

// ---------------------------------------------------------------------------
// 6. VENUE HALO HELPER (optional — call after rendering all disruptions)
//
//    const maxLevel = Math.max(...nearbyDisruptions.map(d => d.alert_level));
//    if (maxLevel >= 2) createVenueHalo(lat, lon, maxLevel).addTo(map);
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 7. POPUP STYLES
//    Inject once at page load. Keeps styles co-located with the marker logic.
// ---------------------------------------------------------------------------

(function injectPopupStyles() {
  if (document.getElementById('ms-map-marker-styles')) return;
  const style = document.createElement('style');
  style.id = 'ms-map-marker-styles';
  style.textContent = `
    /* Reset Leaflet popup chrome */
    .leaflet-popup-content-wrapper {
      border-radius: 8px;
      padding: 0;
      box-shadow: 0 4px 16px rgba(0,0,0,0.14);
      border: 1px solid rgba(0,0,0,0.07);
    }
    .leaflet-popup-content {
      margin: 0;
      width: auto !important;
    }
    .leaflet-popup-tip {
      box-shadow: none;
    }

    /* Popup base */
    .mp-popup {
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 13px;
      color: #1a1a2e;
      padding: 12px 14px;
      min-width: 180px;
    }
    .mp-popup-label {
      font-weight: 600;
      font-size: 13.5px;
      margin-bottom: 6px;
      line-height: 1.3;
    }
    .mp-popup-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
      font-size: 11.5px;
      color: #555;
      margin-bottom: 6px;
    }
    .mp-popup-desc {
      font-size: 12px;
      color: #444;
      line-height: 1.45;
      margin-top: 4px;
    }

    /* Transit row inside venue popup */
    .mp-transit {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: #333;
      background: #f4f6fb;
      border-radius: 5px;
      padding: 5px 8px;
      margin-top: 4px;
    }
    .mp-transit-icon { font-size: 14px; }
    .mp-transit-line {
      background: #0F1F3D;
      color: #fff;
      border-radius: 3px;
      padding: 1px 5px;
      font-size: 10.5px;
      font-weight: 600;
    }
    .mp-transit-dist {
      margin-left: auto;
      color: #888;
      font-size: 11px;
    }

    /* Badges */
    .mp-badge {
      border-radius: 4px;
      padding: 1px 6px;
      font-size: 10.5px;
      font-weight: 600;
    }
    .mp-badge--bucket {
      background: #eef2f7;
      color: #4A7FA5;
    }
    
    /* Venue popup accent */
    .mp-popup--venue .mp-popup-label {
      color: #0F1F3D;
    }

    /* Tooltip — white background, constrained width */
    .leaflet-tooltip.mp-tooltip {
      padding: 0;
      background: #ffffff;
      border: 1px solid rgba(0,0,0,0.07);
      border-radius: 8px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.14);
      max-width: 200px;
      white-space: normal;
      word-break: break-word;
    }
    .leaflet-tooltip.mp-tooltip::before {
      display: none;
    }
    .leaflet-tooltip-top:before,
    .leaflet-tooltip-bottom:before,
    .leaflet-tooltip-left:before,
    .leaflet-tooltip-right:before {
      display: none;
    }

    /* Event list cards */
    .map-event-card {
      display: flex !important;
      flex-direction: column !important;
      gap: 8px !important;
      padding: 20px 16px 20px 12px !important;
      border-left: 3px solid var(--bucket-color, #cbd5e1) !important;
      border-bottom: none !important;
    }
    .map-event-card + .map-event-card {
      border-top: 1px solid rgba(17,24,39,0.07) !important;
      margin-top: 4px !important;
    }
    .map-event-card__header {
      display: flex !important;
      justify-content: space-between !important;
      align-items: baseline !important;
      gap: 12px !important;
    }
    .map-event-card__label {
      font-size: 15px !important;
      font-weight: 600 !important;
      color: #0F1F3D !important;
      line-height: 1.3 !important;
    }
    .map-event-card__distance {
      font-size: 11.5px !important;
      color: #888 !important;
      white-space: nowrap !important;
      flex-shrink: 0 !important;
    }
    .map-event-card__desc {
      font-size: 12.5px !important;
      color: #444 !important;
      line-height: 1.5 !important;
    }
    .map-event-card__desc.is-clamped {
      display: -webkit-box !important;
      -webkit-line-clamp: 5 !important;
      -webkit-box-orient: vertical !important;
      overflow: hidden !important;
    }
    .map-event-card__num {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #0b37e5;
      color: #ffffff;
      font-size: 10px;
      font-weight: 700;
      margin-right: 7px;
      flex-shrink: 0;
      vertical-align: middle;
    }
    .map-event-card__toggle {
      font-size: 12px !important;
      color: #0b37e5 !important;
      font-weight: 700 !important;
      background: none !important;
      border: none !important;
      padding: 0 !important;
      cursor: pointer !important;
      margin-top: 2px !important;
    }
  `;

  document.head.appendChild(style);
})();
