// public/js/gl-renderer.js
// WebGL point renderer using leaflet.glify (clickable features)

(function (global) {
  'use strict';

  const GlRenderer = {
    layers: [],
    features: [],
    map: null,
    highlightSet: null
  };

  // --- helpers ---------------------------------------------------------------
  function colorFromProps(p) {
    const t = String(p && p.type || '').toLowerCase();
    // Return {r,g,b,a} in 0..1
    if (t.includes('mil'))   return { r: 1.0, g: 0.15, b: 0.16, a: 1 }; // red
    if (t.includes('water')) return { r: 0.0, g: 0.78, b: 1.0, a: 1 }; // blue
    return                    { r: 0.4, g: 0.4, b: 0.4, a: 1 };       // green (civil/default)
  }

  function zoomScale(z) {
    // Gentle scaling by zoom level; tweak to taste
    if (z <= 2)  return 0.3;   // very zoomed out
    if (z <= 4)  return 0.5;
    if (z <= 7)  return 0.8;   // normal
    if (z <= 10) return 1.2;
    if (z <= 12) return 1.75;
    return 3;                   // very zoomed in
  }

  // Unified marker size: all airports use the same base radius,
  // we only vary the shape (ring / dot / double-dot) by category.
  function sizeFromProps(p, z) {
    const base = 15; // base size at zoom level 10
    const k = zoomScale(z || 0);
    const sized = Math.round(base * k);
    return Math.max(5, Math.min(50, sized));
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(null, args), ms);
    };
  }

  // --- click handler (popup) -------------------------------------------------
  function handleClick(e, feature, xy) {
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

  // Build one GL points layer for a subset of features + style
  // style = { sizeScale: number, colorMode: 'type' | 'white' }
  function buildLayerFor(featuresSubset, style) {
    if (!featuresSubset || !featuresSubset.length) return null;

    const data = { type: 'FeatureCollection', features: featuresSubset };

    const sizeScale = style.sizeScale || 1;
    const colorMode = style.colorMode || 'type';

    return L.glify.points({
      map: GlRenderer.map,
      data,
      sensitivity: 2,

      size: (i, pf) => {
        const feature = featuresSubset[i] || pf;
        const p = (pf && pf.properties)
          ? pf.properties
          : (feature && feature.properties) || {};
        const z = GlRenderer.map ? GlRenderer.map.getZoom() : 0;

        let size = sizeFromProps(p, z) * sizeScale;

        // Highlighted features: make them larger
        if (GlRenderer.highlightSet && feature && GlRenderer.highlightSet.has(feature)) {
          size = Math.round(size * 1.6);
        }

        // never let size go to 0
        if (!Number.isFinite(size) || size <= 0) size = 5;

        return size;
      },

      color: (i, pf) => {
        const feature = featuresSubset[i] || pf;
        const p = (pf && pf.properties)
          ? pf.properties
          : (feature && feature.properties) || {};

        // Highlighted features: bright yellow on ALL layers
        if (GlRenderer.highlightSet && feature && GlRenderer.highlightSet.has(feature)) {
          return { r: 1, g: 0.9, b: 0.1, a: 1 };
        }

        if (colorMode === 'white') {
          return { r: 1, g: 1, b: 1, a: 1 };
        }

        // default: type color
        return colorFromProps(p);
      },

      click: handleClick
    });
  }

  // --- API -------------------------------------------------------------------

  GlRenderer.attach = function attach(map) {
    GlRenderer.map = map;

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
    if (highlighted === undefined) {
      // keep existing highlightSet
    } else if (!highlighted) {
      GlRenderer.highlightSet = null;
    } else {
      GlRenderer.highlightSet = new Set(highlighted);
    }

    // Remove any existing GL layers
    if (GlRenderer.layers && GlRenderer.layers.length) {
      GlRenderer.layers.forEach(layer => {
        if (layer && typeof layer.remove === 'function') {
          layer.remove();
        }
      });
      GlRenderer.layers = [];
    }

    if (!GlRenderer.features.length) return;

    if (L.glify.longitudeFirst) L.glify.longitudeFirst(); // use [lng,lat] like GeoJSON

    // Split features into size buckets: small / medium / large
    const smallFeatures  = [];
    const mediumFeatures = [];
    const largeFeatures  = [];

    for (const f of GlRenderer.features) {
      if (!f || !f.properties) continue;
      const sVal = Number((f.properties.size ?? 0)) || 0;
      if (sVal < 1000) {
        smallFeatures.push(f);
      } else if (sVal <= 3499) {
        mediumFeatures.push(f);
      } else {
        largeFeatures.push(f);
      }
    }

    const layers = [];

    // SMALL: ring:
    //   - outer colored disc (scale 1.0)
    //   - inner white disc (scale ~0.55)
    if (smallFeatures.length) {
      const smallOuter = buildLayerFor(smallFeatures, {
        sizeScale: 1.0,
        colorMode: 'type'
      });
      const smallInner = buildLayerFor(smallFeatures, {
        sizeScale: 0.4,
        colorMode: 'white'
      });
      if (smallOuter) layers.push(smallOuter);
      if (smallInner) layers.push(smallInner);
    }

    // MEDIUM: solid disc (just one layer)
    if (mediumFeatures.length) {
      const mediumLayer = buildLayerFor(mediumFeatures, {
        sizeScale: 1.0,
        colorMode: 'type'
      });
      if (mediumLayer) layers.push(mediumLayer);
    }

    // LARGE: disc with inner “dot”
    //   - outer colored disc (scale 1.0)
    //   - middle white disc (scale 0.7)
    //   - inner colored disc (scale 0.35)
    if (largeFeatures.length) {
      const largeOuter = buildLayerFor(largeFeatures, {
        sizeScale: 1.6,   // was 1.1; now match others
        colorMode: 'type'
      });
      const largeMid = buildLayerFor(largeFeatures, {
        sizeScale: 1.2,
        colorMode: 'white'
      });
      const largeInner = buildLayerFor(largeFeatures, {
        sizeScale: 0.5,
        colorMode: 'type'
      });

      if (largeOuter) layers.push(largeOuter);
      if (largeMid)  layers.push(largeMid);
      if (largeInner) layers.push(largeInner);
    }

    GlRenderer.layers = layers;
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
