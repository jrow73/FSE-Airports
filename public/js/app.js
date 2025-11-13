// App wiring: load data, build indexes, hook UI, render with GL
(function () {
  'use strict';
  const { map } = MapModule.init();
  GlRenderer.attach(map);

  const el = {
    filtersBtn: document.getElementById('filtersBtn'),
    filtersPanel: document.getElementById('filtersPanel'),
    loading: document.getElementById('loading'),
    search: document.getElementById('searchInput'),
    country: document.getElementById('countrySelect'),
    type: document.getElementById('typeSelect'),
    size: document.getElementById('sizeSelect'),
    surface: document.getElementById('surfaceSelect'),
    services: document.getElementById('servicesSelect'),
    rwyMin: document.getElementById('rwyMin'),
    rwyMax: document.getElementById('rwyMax'),
    clear: document.getElementById('filtersClear'),
    close: document.getElementById('filtersClose'),
    count: document.getElementById('count')
  };

  let allFeatures = [];
  let coordMarker = null;
  let searchQuery = ''; // committed text search used by Search.filter

  function setLoading(v) {
    if (el.loading) el.loading.classList.toggle('hidden', !v);
  }

  function updateCount(n, total) {
    if (el.count)
      el.count.textContent = `${n.toLocaleString()} shown of ${total.toLocaleString()}`;
  }

  // --- coordinate parsing ----------------------------------------------------

  function parseLatLon(text) {
    if (!text) return null;
    let s = text.trim().toLowerCase();
    if (!s) return null;

    // Normalize separators
    s = s.replace(/,/g, ' ');
    s = s.replace(/\s+/g, ' ').trim();
    const tokens = s.split(' ');
    const isDir = t => /^[nsew]$/.test(t);

    const parseToken = tok => {
      // optional dir prefix/suffix + number, e.g. n41.5, 87.6w
      const m = tok.match(/^([nsew])?(-?\d+(?:\.\d+)?)([nsew])?$/i);
      if (!m) return null;
      const dir = (m[1] || m[3] || '').toLowerCase();
      const val = parseFloat(m[2]);
      if (!Number.isFinite(val)) return null;
      return { val, dir };
    };

    let latVal, lonVal;

    if (tokens.length === 2) {
      // e.g. "41.5 -87.6" or "41.5N 87.6W" or "n41.5 w87.6"
      const c1 = parseToken(tokens[0]);
      const c2 = parseToken(tokens[1]);
      if (!c1 || !c2) return null;

      const d1 = c1.dir;
      const d2 = c2.dir;

      if ((d1 === 'n' || d1 === 's') && (d2 === 'e' || d2 === 'w')) {
        latVal = c1.val * (d1 === 's' ? -1 : 1);
        lonVal = c2.val * (d2 === 'w' ? -1 : 1);
      } else if ((d2 === 'n' || d2 === 's') && (d1 === 'e' || d1 === 'w')) {
        latVal = c2.val * (d2 === 's' ? -1 : 1);
        lonVal = c1.val * (d1 === 'w' ? -1 : 1);
      } else {
        // no directions → assume lat, lon
        latVal = c1.val;
        lonVal = c2.val;
      }
    } else if (tokens.length === 4) {
      // e.g. "41.5 N 87.6 W"
      const v1 = parseFloat(tokens[0]);
      const d1 = tokens[1].toLowerCase();
      const v2 = parseFloat(tokens[2]);
      const d2 = tokens[3].toLowerCase();
      if (!Number.isFinite(v1) || !Number.isFinite(v2)) return null;
      if (!isDir(d1) || !isDir(d2)) return null;

      if ((d1 === 'n' || d1 === 's') && (d2 === 'e' || d2 === 'w')) {
        latVal = v1 * (d1 === 's' ? -1 : 1);
        lonVal = v2 * (d2 === 'w' ? -1 : 1);
      } else if ((d2 === 'n' || d2 === 's') && (d1 === 'e' || d1 === 'w')) {
        latVal = v2 * (d2 === 's' ? -1 : 1);
        lonVal = v1 * (d1 === 'w' ? -1 : 1);
      } else {
        return null;
      }
    } else {
      return null;
    }

    if (!Number.isFinite(latVal) || !Number.isFinite(lonVal)) return null;
    if (Math.abs(latVal) > 90 || Math.abs(lonVal) > 180) return null;

    return { lat: latVal, lon: lonVal };
  }

  function zoomToCoords(lat, lon) {
    if (!map) return;
    if (coordMarker) coordMarker.remove();
    coordMarker = L.marker([lat, lon]).addTo(map);
    map.setView([lat, lon], 8); // tweak zoom level if desired
  }

function handleSearchEnter() {
  if (!el.search) return;
  const value = el.search.value.trim();

  // Empty → clear committed search and zoom to filtered set
  if (!value) {
    searchQuery = '';
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

  const coords = parseLatLon(value);
  if (coords) {
    // Coordinate search does not change text filter; just move pin & view
    zoomToCoords(coords.lat, coords.lon);
  } else {
    // Not coordinates → commit text query and zoom to results
    searchQuery = value;
    const subset = render();
    if (subset && subset.length === 1) {
      const f = subset[0];
      const g = f.geometry;
      if (g && g.coordinates && g.coordinates.length >= 2) {
        const lat = g.coordinates[1];
        const lon = g.coordinates[0];
        map.setView([lat, lon], 8);
      }
    } else if (subset && subset.length > 1) {
      GlRenderer.fitTo(subset);
    }
  }
}


  // --- data loading ----------------------------------------------------------

  async function load() {
    try {
      setLoading(true);
      const res = await fetch('./data/airports.geojson', { cache: 'force-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const gj = await res.json();
      allFeatures = Array.isArray(gj.features) ? gj.features : [];
    } catch (err) {
      console.error('GeoJSON fetch/parse failed:', err);
      alert('Failed to load airports.geojson'); // only fires for real fetch/parse problems
      setLoading(false);
      return;
    }

    try {
      Search.build(allFeatures);
      populateSelects();
      render();
      GlRenderer.fitTo(allFeatures);
    } catch (err) {
      console.error('Render failed:', err);
    } finally {
      setLoading(false);
    }
  }

  function populateSelects() {
    // Country
    if (el.country) {
      const opts = Search.countries();
      const frag = document.createDocumentFragment();
      for (const c of opts) {
        const o = document.createElement('option');
        o.value = c;
        o.textContent = c.toUpperCase();
        frag.appendChild(o);
      }
      el.country.appendChild(frag);
    }

    // Surface types
    if (el.surface) {
      const opts = Search.surfaces();
      const frag = document.createDocumentFragment();
      for (const s of opts) {
        const o = document.createElement('option');
        o.value = s;
        o.textContent = String(s);
        frag.appendChild(o);
      }
      el.surface.appendChild(frag);
    }
  }

  function params() {
    return {
      q: searchQuery, // use committed query, not raw input
      countrySel: el.country ? el.country.value : '',
      typeSel: el.type ? el.type.value : '',
      sizeSel: el.size ? el.size.value : '',
      surfaceSel: el.surface ? el.surface.value : '',
      servicesSel: el.services ? el.services.value : '',
      rwyMin: el.rwyMin ? el.rwyMin.value : '',
      rwyMax: el.rwyMax ? el.rwyMax.value : ''
    };
  }

  // Return subset so others (like handleSearchEnter) can zoom to it
  function render() {
    const subset = Search.filter(params());
    GlRenderer.render(subset);
    updateCount(subset.length, allFeatures.length);
    return subset;
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(null, args), ms);
    };
  }

  // --- UI events -------------------------------------------------------------

  if (el.search) {
    const debouncedRender = debounce(render, 200);

    el.search.addEventListener('input', () => {
      const v = el.search.value;

      // When the box is emptied (via typing or the built-in "x"):
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
      // NOTE: we do NOT update searchQuery here; text search is only committed on Enter
    });

    // Enter triggers coordinate-or-search zoom
    el.search.addEventListener('keydown', evt => {
      if (evt.key === 'Enter') {
        evt.preventDefault();
        handleSearchEnter();
      }
    });
  }

  if (el.country) el.country.addEventListener('change', render);
  if (el.type) el.type.addEventListener('change', render);
  if (el.size) el.size.addEventListener('change', render);
  if (el.surface) el.surface.addEventListener('change', render);
  if (el.services) el.services.addEventListener('change', render);
  if (el.rwyMin) el.rwyMin.addEventListener('input', debounce(render, 200));
  if (el.rwyMax) el.rwyMax.addEventListener('input', debounce(render, 200));

  if (el.clear) {
    el.clear.addEventListener('click', () => {
      if (el.country) el.country.value = '';
      if (el.type) el.type.value = '';
      if (el.size) el.size.value = '';
      if (el.surface) el.surface.value = '';
      if (el.services) el.services.value = '';
      if (el.rwyMin) el.rwyMin.value = '';
      if (el.rwyMax) el.rwyMax.value = '';
      // Note: we leave search input & query alone here; Clear is for filters only
      render();
    });
  }

  function togglePanel(show) {
    if (!el.filtersPanel || !el.filtersBtn) return;
    const open =
      typeof show === 'boolean'
        ? show
        : !el.filtersPanel.classList.contains('open');
    el.filtersPanel.classList.toggle('open', open);
    el.filtersPanel.setAttribute('aria-hidden', String(!open));
    el.filtersBtn.setAttribute('aria-expanded', String(open));
  }

  if (el.filtersBtn) {
    el.filtersBtn.addEventListener('click', () => togglePanel());
  }
  if (el.close) {
    el.close.addEventListener('click', () => togglePanel(false));
  }

  // boot
  load();
})();
