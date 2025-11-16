// search.js
// Indexing + filtering utilities
(function (global) {
  'use strict';
  const Search = { indexesBuilt: false };

  let all = [];
  const icao = new Map();
  const iata = new Map();
  const city = new Map();
  const country = new Map();
  const state = new Map();
  const surface = new Map();
  const type = new Map();

  function push(map, key, f) {
    if (key === undefined || key === null || key === '') return;
    const k = String(key).toLowerCase();
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(f);
  }

  Search.build = function build(features) {
    all = Array.isArray(features) ? features : [];
    icao.clear();
    iata.clear();
    city.clear();
    country.clear();
    state.clear();
    surface.clear();
    type.clear();

    for (const f of all) {
      const p = f.properties || {};
      if (p.icao) icao.set(String(p.icao).toLowerCase(), [f]);
      if (p.iata) iata.set(String(p.iata).toLowerCase(), [f]); // harmless if absent
      push(city, p.city, f);
      push(country, p.country, f);
      push(state, p.state, f);
      push(surface, p.surfaceType, f);
      push(type, p.type, f);
    }
    Search.indexesBuilt = true;
  };

  // Helper: classify numeric "size" into small/medium/large bucket
  function classifySize(val) {
    if (!Number.isFinite(val)) return null;
    if (val < 1000) return 'small';
    if (val <= 3499) return 'medium';
    return 'large';
  }

  Search.filter = function filter(opts) {
    if (!Search.indexesBuilt) return [];

    opts = opts || {};
    const {
      q = '',
      countrySel = [],
      stateSel = [],
      typeSel = [],
      sizeSel = [],
      surfaceSel = [],
      servicesSel = [],
      rwyMin = '',
      rwyMax = '',
      radiusCenterLat = null,
      radiusCenterLon = null,
      radiusNm = null
    } = opts;

    const qStr = q.trim().toLowerCase();

    // --- base set using simple indexes / text search ------------------------
    let base;

    if (!qStr) {
      base = all;
    } else if (icao.has(qStr)) {
      base = icao.get(qStr);
    } else if (iata.has(qStr)) {
      base = iata.get(qStr);
    } else if (city.has(qStr)) {
      base = city.get(qStr);
    } else if (country.has(qStr)) {
      base = country.get(qStr);
    } else {
      base = all.filter(f => {
        const p = f.properties || {};
        return [p.name, p.city, p.country, p.icao, p.iata].some(
          v => v && String(v).toLowerCase().includes(qStr)
        );
      });
    }

    // --- normalize multi-select filter values into Sets ---------------------
    const countrySet  = new Set(countrySel.map(v => String(v).toLowerCase()));
    const stateSet    = new Set(stateSel.map(v => String(v).toLowerCase()));
    const typeSet     = new Set(typeSel.map(v => String(v).toLowerCase()));
    const sizeSet     = new Set(sizeSel.map(v => String(v).toLowerCase()));      // 'small'/'medium'/'large'
    const surfaceSet  = new Set(surfaceSel.map(v => String(v).toLowerCase()));
    const servicesSet = new Set(servicesSel.map(v => String(v)));

    const min = rwyMin !== '' ? Number(rwyMin) : null;
    const max = rwyMax !== '' ? Number(rwyMax) : null;

    const haversine =
      global.GeoUtil && typeof global.GeoUtil.haversineNm === 'function'
        ? global.GeoUtil.haversineNm
        : null;

    const useRadius =
      haversine &&
      radiusCenterLat != null &&
      radiusCenterLon != null &&
      radiusNm != null;

    // --- apply filters ------------------------------------------------------
    return base.filter(f => {
      const p = f.properties || {};

      const fCountry = (p.country || '').toLowerCase();
      const fState   = (p.state || '').toLowerCase();
      const fType    = (p.type || '').toLowerCase();
      const fSizeVal = Number(p.size || 0);
      const fSizeCat = classifySize(fSizeVal); // 'small'/'medium'/'large' or null
      const fSurf    = String(p.surfaceType ?? '').toLowerCase();
      const fServ    = String(p.services ?? '');
      const fRwy     = p.longestRwy != null ? Number(p.longestRwy) : null;

      // Country: if any selected, feature's country must be in set
      if (countrySet.size && !countrySet.has(fCountry)) {
        return false;
      }

      // State/Region: if any selected, feature's state must be in set
      if (stateSet.size && !stateSet.has(fState)) {
        return false;
      }

      // Type: if any selected, feature's type must be in set
      if (typeSet.size && !typeSet.has(fType)) {
        return false;
      }

      // Size buckets (small/medium/large): OR across selected buckets
      if (sizeSet.size) {
        if (!fSizeCat || !sizeSet.has(fSizeCat)) {
          return false;
        }
      }

      // Surface type: exact match on numeric/string value
      if (surfaceSet.size && !surfaceSet.has(fSurf)) {
        return false;
      }

      // Services: exact match on services code (e.g. "0", "3", "7")
      if (servicesSet.size && !servicesSet.has(fServ)) {
        return false;
      }

      // Runway length min / max on longestRwy
      if (min !== null && (fRwy === null || fRwy < min)) {
        return false;
      }
      if (max !== null && (fRwy === null || fRwy > max)) {
        return false;
      }

      // Radius filter: only keep airports within radiusNm of the center
      if (useRadius) {
        const coords = f.geometry && f.geometry.coordinates;
        if (!coords || coords.length < 2) return false;
        const flon = coords[0];
        const flat = coords[1];

        const d = haversine(flat, flon, radiusCenterLat, radiusCenterLon);
        if (d > radiusNm) return false;
      }

      // If we got here, this feature passes all filters
      return true;
    });
  };

  Search.countries = function countries() {
    const list = Array.from(country.keys());
    list.sort((a, b) => a.localeCompare(b));
    return list;
  };

  Search.states = function states() {
    const list = Array.from(state.keys()).filter(Boolean);
    list.sort((a, b) => String(a).localeCompare(String(b)));
    return list;
  };

  Search.surfaces = function surfacesList() {
    const list = Array.from(surface.keys()).filter(Boolean);
    list.sort((a, b) => String(a).localeCompare(String(b)));
    return list;
  };

  // Look up a feature by ICAO code (case-insensitive).
  // Returns the first matching feature or null.
  Search.byIcao = function byIcao(code) {
    if (!Search.indexesBuilt || !code) return null;
    const k = String(code).trim().toLowerCase();
    const hits = icao.get(k);
    return hits && hits.length ? hits[0] : null;
  };

  global.Search = Search;
})(window);
