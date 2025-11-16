// query-ui.js
// Search box + filters + filter panel + counts + highlight rings + radius filter

(function (global) {
  'use strict';

  const QueryUI = {};

  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(null, args), ms);
    };
  }

  QueryUI.create = function create(map, elements) {
    let allFeatures = [];
    let searchQuery = ''; // committed text search
    let coordMarker = null;
    let highlightLayer = null;
    let radiusCircle = null;

    function setAllFeatures(features) {
      allFeatures = Array.isArray(features) ? features : [];
    }

    function updateCount(shown) {
      if (!elements.count) return;
      const n = shown;
      const total = allFeatures.length;
      elements.count.textContent =
        `${n.toLocaleString()} shown of ${total.toLocaleString()}`;
    }

    function zoomToCoords(lat, lon) {
      if (!map) return;
      if (coordMarker) coordMarker.remove();
      coordMarker = L.marker([lat, lon]).addTo(map);
      map.setView([lat, lon], 8);
    }

    function selectedValues(selectEl) {
      if (!selectEl) return [];
      return Array.from(selectEl.selectedOptions)
        .map(o => o.value)
        .filter(v => v !== '');
    }

    function params() {
      const p = {
        q: searchQuery,
        countrySel: selectedValues(elements.country),
        stateSel: selectedValues(elements.state),
        typeSel: selectedValues(elements.type),
        sizeSel: selectedValues(elements.size),
        surfaceSel: selectedValues(elements.surface),
        servicesSel: selectedValues(elements.services),
        rwyMin: elements.rwyMin ? elements.rwyMin.value : '',
        rwyMax: elements.rwyMax ? elements.rwyMax.value : ''
      };

      // Radius center & radius (nm)
      let centerLat = null;
      let centerLon = null;
      let radiusNm = null;

      const centerText = elements.radiusCenter
        ? elements.radiusCenter.value.trim()
        : '';

      const radiusText = elements.radiusNm
        ? elements.radiusNm.value.trim()
        : '';

      if (centerText && radiusText) {
        const r = Number(radiusText);
        if (Number.isFinite(r) && r > 0) {
          radiusNm = r;

          let resolved = null;

          // Try ICAO first
          if (global.Search && typeof global.Search.byIcao === 'function') {
            const feature = global.Search.byIcao(centerText.toUpperCase());
            if (feature &&
                feature.geometry &&
                Array.isArray(feature.geometry.coordinates)) {
              const [lon, lat] = feature.geometry.coordinates;
              if (Number.isFinite(lat) && Number.isFinite(lon)) {
                resolved = { lat, lon };
              }
            }
          }

          // Fall back to lat/lon text
          if (!resolved && global.GeoUtil && typeof global.GeoUtil.parseLatLon === 'function') {
            const c = global.GeoUtil.parseLatLon(centerText);
            if (c) {
              resolved = { lat: c.lat, lon: c.lon };
            }
          }

          if (resolved) {
            centerLat = resolved.lat;
            centerLon = resolved.lon;
          } else {
            // Invalid center -> disable radius filter
            radiusNm = null;
          }
        }
      }

      p.radiusCenterLat = centerLat;
      p.radiusCenterLon = centerLon;
      p.radiusNm = radiusNm;

      return p;
    }

    // Render base (filtered) set and highlight rings for text matches.
    // Returns the "active" subset (highlight matches if searchQuery present, else base).
    function render() {
      const p = params();

      // Base: apply all filters, but ignore text search `q`
      const baseParams = { ...p, q: '' };
      const base = Search.filter(baseParams);

      // Highlight: if there's a query, filter with `q` as well; otherwise no highlight
      let highlight = null;
      if (p.q && p.q.trim() !== '') {
        highlight = Search.filter(p);
      }

      // Render all filtered features as GL points
      // Pass `null` as second arg to clear any GL highlightSet
      GlRenderer.render(base, null);

      // Clear previous highlight ring layer
      if (highlightLayer) {
        highlightLayer.remove();
        highlightLayer = null;
      }

      // Add ring markers around search results (if any)
      if (highlight && highlight.length) {
        const markers = [];

        for (const f of highlight) {
          const coords = f.geometry && f.geometry.coordinates;
          if (!coords || coords.length < 2) continue;
          const lng = coords[0];
          const lat = coords[1];

          const m = L.circleMarker([lat, lng], {
            radius: 10,        // surrounds even larger dots nicely
            color: '#ff00ff',  // bright magenta outline
            weight: 5,
            fill: false
          });
          markers.push(m);
        }

        if (markers.length) {
          highlightLayer = L.layerGroup(markers).addTo(map);
        }
      }

      // Radius circle overlay
      if (radiusCircle) {
        radiusCircle.remove();
        radiusCircle = null;
      }
      if (p.radiusCenterLat != null &&
          p.radiusCenterLon != null &&
          p.radiusNm != null) {
        const radiusMeters = p.radiusNm * 1852; // 1 nm = 1852 m
        radiusCircle = L.circle(
          [p.radiusCenterLat, p.radiusCenterLon],
          {
            radius: radiusMeters,
            color: '#ff00ff',
            weight: 1.5,
            fill: false,
            dashArray: '4,4',
            opacity: 0.7
          }
        ).addTo(map);
      }

      const active = highlight && highlight.length ? highlight : base;
      updateCount(active.length);
      return active;
    }

    function populateSelects() {
      // Country
      if (elements.country) {
        const opts = Search.countries();
        const frag = document.createDocumentFragment();
        for (const c of opts) {
          const o = document.createElement('option');
          o.value = c;
          o.textContent = c.toUpperCase();
          frag.appendChild(o);
        }
        elements.country.appendChild(frag);
      }

      // State / region
      if (elements.state) {
        const opts = Search.states();
        const frag = document.createDocumentFragment();
        for (const s of opts) {
          const o = document.createElement('option');
          o.value = s;
          o.textContent = String(s).toUpperCase();
          frag.appendChild(o);
        }
        elements.state.appendChild(frag);
      }

      // Surface types
      if (elements.surface) {
        const opts = Search.surfaces();
        const frag = document.createDocumentFragment();
        for (const s of opts) {
          const o = document.createElement('option');
          o.value = s;
          o.textContent = String(s);
          frag.appendChild(o);
        }
        elements.surface.appendChild(frag);
      }
    }

    function handleSearchEnter() {
      if (!elements.search) return;
      const value = elements.search.value.trim();

      if (!value) {
        // Empty → clear committed search and zoom to filtered set
        searchQuery = '';
        if (coordMarker) {
          coordMarker.remove();
          coordMarker = null;
        }
        const subset = render();
        if (subset && subset.length === 1) {
          const f = subset[0];
          const coords = f.geometry && f.geometry.coordinates;
          if (coords && coords.length >= 2) {
            const lat = coords[1];
            const lon = coords[0];
            map.setView([lat, lon], 8);
          }
        } else if (subset && subset.length > 1) {
          GlRenderer.fitTo(subset);
        }
        return;
      }

      const coords = global.GeoUtil && global.GeoUtil.parseLatLon(value);
      if (coords) {
        // Coordinate search does not change text filter; just move pin & view
        zoomToCoords(coords.lat, coords.lon);
      } else {
        // Not coordinates → commit text query and zoom to results
        searchQuery = value;
        const subset = render();
        if (subset && subset.length === 1) {
          const f = subset[0];
          const c = f.geometry && f.geometry.coordinates;
          if (c && c.length >= 2) {
            map.setView([c[1], c[0]], 8);
          }
        } else if (subset && subset.length > 1) {
          GlRenderer.fitTo(subset);
        }
      }
    }

    // --- UI wiring -----------------------------------------------------------

    if (elements.search) {
      const debouncedRender = debounce(render, 200);

      elements.search.addEventListener('input', () => {
        const v = elements.search.value;

        if (v.trim() === '') {
          // Clear pin
          if (coordMarker) {
            coordMarker.remove();
            coordMarker = null;
          }
          // Clear committed text query and reset airports
          searchQuery = '';
          debouncedRender();
        }
        // Note: we do NOT update searchQuery here; Enter commits it
      });

      elements.search.addEventListener('keydown', evt => {
        if (evt.key === 'Enter') {
          evt.preventDefault();
          handleSearchEnter();
        }
      });
    }

    if (elements.country) elements.country.addEventListener('change', render);
    if (elements.state) elements.state.addEventListener('change', render);
    if (elements.type) elements.type.addEventListener('change', render);
    if (elements.size) elements.size.addEventListener('change', render);
    if (elements.surface) elements.surface.addEventListener('change', render);
    if (elements.services) elements.services.addEventListener('change', render);
    if (elements.rwyMin) elements.rwyMin.addEventListener('input', debounce(render, 200));
    if (elements.rwyMax) elements.rwyMax.addEventListener('input', debounce(render, 200));

    // Radius inputs
    if (elements.radiusCenter) {
      elements.radiusCenter.addEventListener('change', render);
    }
    if (elements.radiusNm) {
      elements.radiusNm.addEventListener('input', debounce(render, 200));
    }

    if (elements.clear) {
      elements.clear.addEventListener('click', () => {
        if (elements.country) elements.country.value = '';
        if (elements.state) elements.state.value = '';
        if (elements.type) elements.type.value = '';
        if (elements.size) elements.size.value = '';
        if (elements.surface) elements.surface.value = '';
        if (elements.services) elements.services.value = '';
        if (elements.rwyMin) elements.rwyMin.value = '';
        if (elements.rwyMax) elements.rwyMax.value = '';
        if (elements.radiusCenter) elements.radiusCenter.value = '';
        if (elements.radiusNm) elements.radiusNm.value = '';
        // Clear filters only; leave search as-is
        render();
      });
    }

    function togglePanel(show) {
      if (!elements.filtersPanel || !elements.filtersBtn) return;
      const open =
        typeof show === 'boolean'
          ? show
          : !elements.filtersPanel.classList.contains('open');
      elements.filtersPanel.classList.toggle('open', open);
      elements.filtersPanel.setAttribute('aria-hidden', String(!open));
      elements.filtersBtn.setAttribute('aria-expanded', String(open));
    }

    if (elements.filtersBtn) {
      elements.filtersBtn.addEventListener('click', () => togglePanel());
    }
    if (elements.close) {
      elements.close.addEventListener('click', () => togglePanel(false));
    }

    return {
      setAllFeatures,
      populateSelects,
      render
    };
  };

  global.QueryUI = QueryUI;
})(window);
