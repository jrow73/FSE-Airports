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
    let activeFeatures = [];

    function buildCoordPopupHtml(lat, lon) {
      const latStr = Number.isFinite(lat) ? lat.toFixed(6) : String(lat);
      const lonStr = Number.isFinite(lon) ? lon.toFixed(6) : String(lon);
      const href = `suggest-new.html?lat=${encodeURIComponent(latStr)}&lon=${encodeURIComponent(lonStr)}`;

      return `
      <div class="coord-popup">
        <div class="coord-popup-title">New Location</div>
        <div class="coord-popup-body">
          <a
            href="${href}"
            target="_blank"
            rel="noopener"
            title="Suggest new airport at this location"
          >
            Suggest new airport <br />at these coordinates
          </a>
        </div>
      </div>
      `;
    }

    function setAllFeatures(features) {
      allFeatures = Array.isArray(features) ? features : [];
    }

    function updateCount(shown) {
      const total = allFeatures.length;

      if (elements.count) {
        const n = shown;
        elements.count.textContent =
          `${n.toLocaleString()} shown of ${total.toLocaleString()}`;
      }

      if (elements.copyIcaos) {
        const btn = elements.copyIcaos;
        const enable = shown > 0 && shown < total;
        btn.disabled = !enable;
      }
    }

    function zoomToCoords(lat, lon) {
      if (!map) return;

      if (coordMarker) {
        coordMarker.remove();
        coordMarker = null;
      }

      coordMarker = L.marker([lat, lon])
        .addTo(map)
        .bindPopup(buildCoordPopupHtml(lat, lon));

      map.setView([lat, lon], 8);
      // Note: popup does NOT auto-open; user clicks the balloon
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
        rwyMax: elements.rwyMax ? elements.rwyMax.value : '',
        irlStatus: elements.irlStatus ? elements.irlStatus.value : 'any',
        requireLocalFuel: elements.localFuel ? elements.localFuel.checked : false,
        requireLocalMx: elements.localMx ? elements.localMx.checked : false
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
      activeFeatures = active;
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
        const opts = Search.states ? Search.states() : [];
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
    if (elements.irlStatus) elements.irlStatus.addEventListener('change', render);
    if (elements.localFuel) elements.localFuel.addEventListener('change', render);
    if (elements.localMx) elements.localMx.addEventListener('change', render);

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
        if (elements.irlStatus) elements.irlStatus.value = 'any';
        if (elements.localFuel) elements.localFuel.checked = false;
        if (elements.localMx) elements.localMx.checked = false;
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

    // Filters toggle button
    if (elements.filtersBtn && elements.filtersPanel) {
      elements.filtersBtn.addEventListener('click', () => {
        togglePanel();
      });
    }

    // "Show Map" / close button
    if (elements.close) {
      elements.close.addEventListener('click', () => {
        togglePanel(false);
      });
    }

    // Copy ICAO list of currently active airports
    if (elements.copyIcaos) {
      elements.copyIcaos.addEventListener('click', () => {
        if (!activeFeatures || !activeFeatures.length) return;

        const icaos = activeFeatures
          .map(f => (f && f.properties && f.properties.icao)
            ? String(f.properties.icao).toUpperCase()
            : '')
          .filter(Boolean);

        const text = icaos.join(',');

        if (!text) return;

        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).catch(err => {
            console.error('Clipboard write failed:', err);
          });
        } else {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position = 'fixed';
          ta.style.top = '-1000px';
          document.body.appendChild(ta);
          ta.focus();
          ta.select();
          try {
            document.execCommand('copy');
          } catch (err) {
            console.error('document.execCommand copy failed:', err);
          }
          document.body.removeChild(ta);
        }
      });
    }

    // Ensure only one filter section is open at a time
    function wireAccordion() {
      if (!elements.filtersPanel) return;

      const sections = Array.from(
        elements.filtersPanel.querySelectorAll('.filter-section')
      );
      if (!sections.length) return;

      // Start with all sections collapsed
      sections.forEach(section => {
        section.classList.add('collapsed');
        const header = section.querySelector('.filter-section-header');
        if (header) {
          header.setAttribute('aria-expanded', 'false');
        }
      });

      sections.forEach(section => {
        const header = section.querySelector('.filter-section-header');
        const body = section.querySelector('.filter-section-body');
        if (!header || !body) return;

        header.addEventListener('click', () => {
          const isOpen = !section.classList.contains('collapsed');

          if (isOpen) {
            // Clicking an open section closes it (now all will be closed)
            section.classList.add('collapsed');
            header.setAttribute('aria-expanded', 'false');
          } else {
            // Open this section, close all others
            sections.forEach(other => {
              if (other === section) return;
              other.classList.add('collapsed');
              const otherHeader = other.querySelector('.filter-section-header');
              if (otherHeader) {
                otherHeader.setAttribute('aria-expanded', 'false');
              }
            });

            section.classList.remove('collapsed');
            header.setAttribute('aria-expanded', 'true');
          }
        });
      });
    }

    wireAccordion();

    return {
      setAllFeatures,
      populateSelects,
      render
    };
  };

  global.QueryUI = QueryUI;
})(window);