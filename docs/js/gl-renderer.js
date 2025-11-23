// public/js/gl-renderer.js
// WebGL point renderer using leaflet.glify (clickable features)

(function (global) {
  'use strict';

  const GlRenderer = { layer: null, features: [], map: null, highlightSet: null };

  // --- helpers ---------------------------------------------------------------
  function colorFromProps(p) {
    const t = String(p && p.type || '').toLowerCase();
    // Return {r,g,b,a} in 0..1
    if (t.includes('mil'))   return { r: 0.84, g: 0.15, b: 0.16, a: 1 }; // red
    if (t.includes('water')) return { r: 0.12, g: 0.47, b: 0.71, a: 1 }; // blue
    return                    { r: 0.17, g: 0.63, b: 0.17, a: 1 };       // green (civil/default)
  }

  function zoomScale(z) {
    // Gentle scaling by zoom level; tweak to taste
    if (z <= 2)  return 0.25;   // very zoomed out
    if (z <= 4)  return 0.5;
    if (z <= 7)  return 0.75;   // normal
    if (z <= 10) return 1;
    if (z <= 12) return 1.25;
    return 2;                   // very zoomed in
  }

  function sizeFromProps(p, z) {
    const raw = (p && p.size) ?? 0;
    const s = Number(raw) || 0;

    // Base radii by SIZE
    let r;
    if (s < 1000)        r = 9;   // small
    else if (s <= 3499)  r = 12;  // medium
    else                 r = 15;  // large

    // Scale by zoom
    const k = zoomScale(z || 0);
    const sized = Math.round(r * k);

    // Keep within sensible bounds
    return Math.max(5, Math.min(30, sized));
  }

  // --- API -------------------------------------------------------------------
  function debounce(fn, ms) {
    let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn.apply(null, args), ms); };
  }

  GlRenderer.attach = function attach(map) {
    GlRenderer.map = map;
    // Re-render the current features after zoom settles so sizes refresh
    const rerender = debounce(() => {
      if (GlRenderer.features && GlRenderer.features.length) {
        GlRenderer.render(GlRenderer.features);
      }
    }, 50);
    map.on('zoomend', rerender);
  };

  GlRenderer.render = function render(features, highlighted) {
    if (!global.L || !L.glify) {
      console.error('Leaflet.glify not loaded; cannot render points.');
      return;
    }
    if (!GlRenderer.map) {
      console.error('GlRenderer: map not attached');
      return;
    }

    GlRenderer.features = Array.isArray(features) ? features : [];

    // If a highlight list is provided, update the highlightSet.
    // If it's undefined, keep the previous highlightSet (for zoom redraws).
    if (highlighted === undefined) {
      // keep existing highlightSet
    } else if (!highlighted) {
      GlRenderer.highlightSet = null;
    } else {
      GlRenderer.highlightSet = new Set(highlighted);
    }

    if (GlRenderer.layer) { GlRenderer.layer.remove(); GlRenderer.layer = null; }

    const data = { type: 'FeatureCollection', features: GlRenderer.features };
    if (L.glify.longitudeFirst) L.glify.longitudeFirst(); // use [lng,lat] like GeoJSON

    GlRenderer.layer = L.glify.points({
      map: GlRenderer.map,
      data,
      sensitivity: 2,

      // Accessors get (index, pointOrGeoJsonFeature)
      size: (i, pf) => {
        const feature = GlRenderer.features[i];
        const p = (pf && pf.properties)
          ? pf.properties
          : (feature && feature.properties) || {};
        const z = GlRenderer.map ? GlRenderer.map.getZoom() : 0;

        let size = sizeFromProps(p, z);

        // Highlighted features: make them larger
        if (GlRenderer.highlightSet && feature && GlRenderer.highlightSet.has(feature)) {
          size = Math.round(size * 1.6); // tweak factor to taste
        }

        return size;
      },

      color: (i, pf) => {
        const feature = GlRenderer.features[i];
        const p = (pf && pf.properties)
          ? pf.properties
          : (feature && feature.properties) || {};

        // Highlighted features: bright yellow
        if (GlRenderer.highlightSet && feature && GlRenderer.highlightSet.has(feature)) {
          return { r: 1, g: 0.9, b: 0.1, a: 1 };
        }

        return colorFromProps(p);
      },

      click: (e, feature, xy) => {
        if (!feature || feature.type !== 'Feature') return;

        const p = feature.properties || {};
        const [lng, lat] = feature.geometry?.coordinates || [0, 0];

        // --- ICAO / IRL logic -------------------------------------------------
        const fseIcao = (p.icao || '').toUpperCase();
        const irlIcao = p.irlicao ? String(p.irlicao).toUpperCase() : '';
        const hasReal = !!p.hasRealAirport;
        const icaoCorrect = !!p.icaoCorrect;

        const name = p.name || '';
        const place = [p.city, p.state, p.country].filter(Boolean).join(', ');

        let icaoLine = fseIcao || '—';

        if (hasReal) {
          // There *is* a real airport; only decorate if mismatched
          if (!icaoCorrect && irlIcao && irlIcao !== fseIcao) {
            icaoLine += ` <span class="icao-irl">(IRL=${irlIcao})</span>`;
          }
          // If correct or missing IRL ICAO, just show FSE ICAO
        } else {
          // No real airport at this location
          icaoLine += ` <span class="icao-closed" title="IRL airport is closed">⨂</span>`;
        }

        // --- Local services: based on localfuel / localmx --------------------
        const hasFuel = String(p.localfuel || '').toLowerCase() === 'yes';
        const hasMx   = String(p.localmx || '').toLowerCase() === 'yes';

        function formatLocalServices() {
          if (!hasFuel && !hasMx) return 'None';
          if (hasFuel && !hasMx) return 'Fuel';
          return 'Fuel, Maintenance';
        }

        const servicesText = formatLocalServices();

        // --- Other fields -----------------------------------------------------
        const elevText = Number.isFinite(p.elev) ? `${p.elev} ft` : '—';
        const longestText = p.longestRwy
          ? `${Number(p.longestRwy).toLocaleString()} ft`
          : '—';
        const surfaceText = (p.surfaceType ?? '—');

        const linkHtml = fseIcao
          ? `<a href="https://server.fseconomy.net/airport.jsp?icao=${encodeURIComponent(fseIcao)}"
               target="_blank" rel="noopener"
               title="Open in FSEconomy (new tab)"
               aria-label="Open in FSEconomy">&#128279;</a>`
          : '';

        const html = `
          <div class="ap-popup">
            <div class="ap-header">
              <div class="ap-icao"><span>${icaoLine}</span>${linkHtml}</div>
              <div class="ap-name">${name}</div>
              <div class="ap-place">${place}</div>
            </div>
            <div class="ap-body">
              <div class="ap-row">
                <div class="ap-label">Elevation</div>
                <div class="ap-value">${elevText}</div>
              </div>
              <div class="ap-row">
                <div class="ap-label">Longest Runway</div>
                <div class="ap-value">${longestText}${surfaceText !== '—' ? ` of ${surfaceText}` : ''}</div>
              </div>
              <div class="ap-row">
                <div class="ap-label">Local Services</div>
                <div class="ap-value">${servicesText}</div>
              </div>
              <div class="ap-row">
                <div class="ap-label">Coordintes</div>
                <div class="ap-value">${lat} ${lng}</div>
              </div>
            </div>
          </div>
        `;

        L.popup()
          .setLatLng([lat, lng])
          .setContent(html)
          .openOn(GlRenderer.map);
      }
    });
  };

  GlRenderer.fitTo = function fitTo(features) {
    if (!features || !features.length || !GlRenderer.map) return;
    const bounds = L.latLngBounds(
      features.map(f => [f.geometry.coordinates[1], f.geometry.coordinates[0]])
    );
    GlRenderer.map.fitBounds(bounds.pad(0.05));
  };

  global.GlRenderer = GlRenderer;
})(window);