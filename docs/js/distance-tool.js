// distance-tool.js
// Distance, bearing, magenta line + arrow, and distance panel UI

(function (global) {
  'use strict';

  const DistanceTool = {};

  DistanceTool.create = function create(map, elements) {
    let distanceLine = null;
    let distanceArrow = null;
    // Endpoints used to recompute arrow on zoom
    let distanceEndpoints = null; // { lat1, lon1, lat2, lon2 }

    // -------------------------------------------------------------------------
    // Utility helpers
    // -------------------------------------------------------------------------

    function clearGraphics() {
      if (distanceLine) {
        map.removeLayer(distanceLine);
        distanceLine = null;
      }
      if (distanceArrow) {
        map.removeLayer(distanceArrow);
        distanceArrow = null;
      }
      // NOTE: we intentionally DO NOT clear distanceEndpoints here.
      // - When the user clears the UI, we also clear the line & arrow,
      //   so onZoom will bail out because distanceLine is null.
      // - When the user computes a new route, distanceEndpoints is
      //   overwritten with the new endpoints.
    }

    // Turn user input into { lat, lon, label } via ICAO or coordinates.
    function resolveEndpoint(input) {
      if (!input) return null;
      const raw = input.trim();
      if (!raw) return null;

      // 1) Try ICAO via Search.byIcao
      const icaoCode = raw.toUpperCase();
      const f = global.Search &&
                Search.byIcao &&
                Search.byIcao(icaoCode);
      if (f && f.geometry && Array.isArray(f.geometry.coordinates)) {
        const [lon, lat] = f.geometry.coordinates;
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          const label = (f.properties && f.properties.icao
            ? String(f.properties.icao).toUpperCase()
            : icaoCode);
          return { lat, lon, label };
        }
      }

      // 2) Try coordinates via GeoUtil
      const c = global.GeoUtil && GeoUtil.parseLatLon(raw);
      if (c) {
        const label = `${c.lat.toFixed(4)}, ${c.lon.toFixed(4)}`;
        return { lat: c.lat, lon: c.lon, label };
      }

      return null;
    }

    // Great-circle distance in nautical miles.
    function haversineNm(lat1, lon1, lat2, lon2) {
      const toRad = d => (d * Math.PI) / 180;
      const R = 3440.065; // Earth radius in nautical miles

      const phi1 = toRad(lat1);
      const phi2 = toRad(lat2);
      const dPhi = toRad(lat2 - lat1);
      const dLambda = toRad(lon2 - lon1);

      const a =
        Math.sin(dPhi / 2) * Math.sin(dPhi / 2) +
        Math.cos(phi1) * Math.cos(phi2) *
        Math.sin(dLambda / 2) * Math.sin(dLambda / 2);

      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    }

    // Initial true bearing (0–360°) leaving the first point.
    function initialBearing(lat1, lon1, lat2, lon2) {
      const toRad = d => (d * Math.PI) / 180;
      const toDeg = r => (r * 180) / Math.PI;

      const phi1 = toRad(lat1);
      const phi2 = toRad(lat2);
      const dLambda = toRad(lon2 - lon1);

      const y = Math.sin(dLambda) * Math.cos(phi2);
      const x =
        Math.cos(phi1) * Math.sin(phi2) -
        Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);

      let theta = Math.atan2(y, x);  // radians
      let deg = (toDeg(theta) + 360) % 360;
      return deg;
    }

    function formatBearing(deg) {
      const d = Math.round(deg);
      const s = d.toString().padStart(3, '0');
      return s + '°';
    }

    // -------------------------------------------------------------------------
    // Arrow drawing (screen-space, zoom-aware, line-length aware)
    // -------------------------------------------------------------------------

    // Draw an arrowhead at the MIDPOINT of the line,
    // aligned with the line as it appears on the map (screen space).
    function drawEndArrow(lat1, lon1, lat2, lon2) {
    const p1 = map.project([lat1, lon1]);
    const p2 = map.project([lat2, lon2]);

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.sqrt(dx * dx + dy * dy);

    // If the line is extremely short on screen, just skip the arrow
    if (!len || len < 10) {
        if (distanceArrow) {
        map.removeLayer(distanceArrow);
        distanceArrow = null;
        }
        return;
    }

    // Unit vector along the line (from p1 to p2)
    const ux = dx / len;
    const uy = dy / len;

    // Arrow size in pixels, scaled by line length and clamped
    const maxBase = 20; // max distance back from tip
    const maxSide = 8;  // max half-width of arrow head

    // Scale with line length, but never more than ~1/3 the line
    const baseLen = Math.min(maxBase, len * 0.25);
    const sideLen = Math.min(maxSide, len * 0.12);

    // TIP at the *midpoint* of the line
    const tip = L.point(
        (p1.x + p2.x) / 2,
        (p1.y + p2.y) / 2
    );

    // Base point a bit back along the line (toward the origin)
    const base = L.point(
        tip.x - ux * baseLen,
        tip.y - uy * baseLen
    );

    // Perpendicular vector (to get left/right points)
    const px = -uy;
    const py = ux;

    const left = L.point(
        base.x + px * sideLen,
        base.y + py * sideLen
    );

    const right = L.point(
        base.x - px * sideLen,
        base.y - py * sideLen
    );

    // Convert back to lat/lon
    const tipLatLng = map.unproject(tip);
    const leftLatLng = map.unproject(left);
    const rightLatLng = map.unproject(right);

    // Remove any previous arrow
    if (distanceArrow) {
        map.removeLayer(distanceArrow);
        distanceArrow = null;
    }

    // Create arrow polyline: left base -> tip -> right base
    distanceArrow = L.polyline(
        [leftLatLng, tipLatLng, rightLatLng],
        {
        color: '#ff00ff',
        weight: 4,
        opacity: 0.9
        }
    ).addTo(map);
    }


    // Recompute arrow on zoom so it stays visually sane
    function onZoom() {
      if (distanceLine && distanceEndpoints) {
        const { lat1, lon1, lat2, lon2 } = distanceEndpoints;
        drawEndArrow(lat1, lon1, lat2, lon2);
      }
    }

    // -------------------------------------------------------------------------
    // Core distance computation
    // -------------------------------------------------------------------------

    function compute() {
      if (!elements.distFrom || !elements.distTo) return;

      const fromInput = elements.distFrom.value;
      const toInput = elements.distTo.value;

      if (!fromInput.trim() || !toInput.trim()) {
        if (elements.result) {
          elements.result.textContent =
            'Enter both endpoints (ICAO or coordinates).';
        }
        clearGraphics();
        return;
      }

      const from = resolveEndpoint(fromInput);
      const to = resolveEndpoint(toInput);

      if (!from || !to) {
        if (elements.result) {
          elements.result.textContent =
            'Could not resolve one or both endpoints.';
        }
        clearGraphics();
        return;
      }

      const lat1 = from.lat;
      const lon1 = from.lon;
      const lat2 = to.lat;
      const lon2 = to.lon;

      const dNm = haversineNm(lat1, lon1, lat2, lon2);
      const bearingDeg = initialBearing(lat1, lon1, lat2, lon2);
      const bearingStr = formatBearing(bearingDeg);

      const distStr = dNm.toLocaleString(undefined, { maximumFractionDigits: 1 });
      const text =
        `${from.label} → ${to.label}: ${distStr} nm @ ${bearingStr}`;

      if (elements.result) {
        elements.result.textContent = text;
      }

      // Draw line
      clearGraphics();
      const latlngs = [
        [lat1, lon1],
        [lat2, lon2]
      ];

      distanceLine = L.polyline(latlngs, {
        color: '#ff00ff',   // magenta
        weight: 4,
        opacity: 0.9
      }).addTo(map);

      // Save endpoints for zoom handler
      distanceEndpoints = { lat1, lon1, lat2, lon2 };

      // Draw an arrowhead at the destination point, aligned with the line
      drawEndArrow(lat1, lon1, lat2, lon2);

      const popupHtml = `
        <div class="ap-popup ap-distance-popup">
          <div class="ap-header">
            <div class="ap-icao">
              <span>${from.label || '—'}</span>
              <span class="ap-arrow"> &rarr; </span>
              <span>${to.label || '—'}</span>
            </div>
          </div>
          <div class="ap-body">
            <div class="ap-row">
              <div class="ap-label">Distance</div>
              <div class="ap-value">${distStr} nm</div>
            </div>
            <div class="ap-row">
              <div class="ap-label">Initial bearing</div>
              <div class="ap-value">${bearingStr}</div>
            </div>
          </div>
        </div>
      `;

      distanceLine.bindPopup(popupHtml);


      // Fit map to route with padding, but don't zoom in too far
      const bounds = distanceLine.getBounds().pad(0.25);
      map.fitBounds(bounds, { maxZoom: 7 });
    }

    // -------------------------------------------------------------------------
    // Panel + UI wiring
    // -------------------------------------------------------------------------

    function togglePanel(show) {
      if (!elements.panel || !elements.btnToggle) return;
      const open =
        typeof show === 'boolean'
          ? show
          : !elements.panel.classList.contains('open');
      elements.panel.classList.toggle('open', open);
      elements.panel.setAttribute('aria-hidden', String(!open));
      elements.btnToggle.setAttribute('aria-expanded', String(open));
    }

    function swapInputsAndCompute() {
      if (!elements.distFrom || !elements.distTo) return;

      const tmp = elements.distFrom.value;
      elements.distFrom.value = elements.distTo.value;
      elements.distTo.value = tmp;

      // Recompute with swapped endpoints
      compute();
    }


    function wireUi() {
      if (elements.btnToggle) {
        elements.btnToggle.addEventListener('click', () => togglePanel());
      }

      if (elements.btnClose) {
        elements.btnClose.addEventListener('click', () => togglePanel(false));
      }

      if (elements.btnGo) {
        elements.btnGo.addEventListener('click', evt => {
          evt.preventDefault();
          compute();
        });
      }

      if (elements.btnSwap) {
        elements.btnSwap.addEventListener('click', evt => {
          evt.preventDefault();
          swapInputsAndCompute();
        });
      }

      if (elements.btnClear) {
        elements.btnClear.addEventListener('click', evt => {
          evt.preventDefault();
          if (elements.distFrom) elements.distFrom.value = '';
          if (elements.distTo) elements.distTo.value = '';
          if (elements.result) elements.result.textContent = '';
          clearGraphics();
        });
      }

      const wireEnter = input => {
        if (!input) return;
        input.addEventListener('keydown', evt => {
          if (evt.key === 'Enter') {
            evt.preventDefault();
            compute();
          }
        });
      };

      wireEnter(elements.distFrom);
      wireEnter(elements.distTo);

      // Keep arrow size/shape sensible on zoom
      map.on('zoomend', onZoom);
    }

    wireUi();

    return {
      compute,
      clear: clearGraphics
    };
  };

  global.DistanceTool = DistanceTool;
})(window);
