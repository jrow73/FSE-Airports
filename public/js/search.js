// Indexing + filtering utilities
(function (global) {
  'use strict';
  const Search = { indexesBuilt: false };

  let all = [];
  const icao = new Map();
  const iata = new Map();
  const city = new Map();
  const country = new Map();
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
    surface.clear();
    type.clear();

    for (const f of all) {
      const p = f.properties || {};
      if (p.icao) icao.set(String(p.icao).toLowerCase(), [f]);
      if (p.iata) iata.set(String(p.iata).toLowerCase(), [f]); // harmless if absent
      push(city, p.city, f);
      push(country, p.country, f);
      push(surface, p.surfaceType, f);
      push(type, p.type, f);
    }
    Search.indexesBuilt = true;
  };

  Search.filter = function filter(opts) {
    if (!Search.indexesBuilt) return [];

    const q = (opts && opts.q ? opts.q : '').trim().toLowerCase();
    let base;

    if (!q) {
      base = all;
    } else if (icao.has(q)) {
      base = icao.get(q);
    } else if (iata.has(q)) {
      base = iata.get(q);
    } else if (city.has(q)) {
      base = city.get(q);
    } else if (country.has(q)) {
      base = country.get(q);
    } else {
      base = all.filter(f => {
        const p = f.properties || {};
        return [p.name, p.city, p.country, p.icao, p.iata].some(
          v => v && String(v).toLowerCase().includes(q)
        );
      });
    }

    // Country (exact match)
    if (opts && opts.countrySel) {
      const c = String(opts.countrySel).toLowerCase();
      base = base.filter(f => (f.properties?.country || '').toLowerCase() === c);
    }

    // Type (exact match)
    if (opts && opts.typeSel) {
      const t = String(opts.typeSel).toLowerCase();
      base = base.filter(f => (f.properties?.type || '').toLowerCase() === t);
    }

    // Size (small / medium / large, based on size property)
    if (opts && opts.sizeSel) {
      const sSel = String(opts.sizeSel).toLowerCase();
      base = base.filter(f => {
        const val = Number(f.properties?.size || 0);
        if (sSel === 'small')  return val < 1000;
        if (sSel === 'medium') return val >= 1000 && val <= 3499;
        if (sSel === 'large')  return val >= 3500;
        return true;
      });
    }

    // Surface type (exact match on value)
    if (opts && opts.surfaceSel) {
      const s = String(opts.surfaceSel).toLowerCase();
      base = base.filter(
        f => String(f.properties?.surfaceType ?? '').toLowerCase() === s
      );
    }

    // Services (string compare: 0,3,7,…)
    if (
      opts &&
      opts.servicesSel !== undefined &&
      opts.servicesSel !== null &&
      opts.servicesSel !== ''
    ) {
      const want = String(opts.servicesSel);
      base = base.filter(f => String(f.properties?.services ?? '') === want);
    }

    // Runway min/max (on longestRwy)
    const min = opts && opts.rwyMin ? Number(opts.rwyMin) : null;
    const max = opts && opts.rwyMax ? Number(opts.rwyMax) : null;
    if (Number.isFinite(min)) {
      base = base.filter(
        f => Number(f.properties?.longestRwy || 0) >= min
      );
    }
    if (Number.isFinite(max)) {
      base = base.filter(
        f => Number(f.properties?.longestRwy || 0) <= max
      );
    }

    return base;
  };

  Search.countries = function countries() {
    const list = Array.from(country.keys());
    list.sort((a, b) => a.localeCompare(b));
    return list;
  };

  Search.surfaces = function surfacesList() {
    const list = Array.from(surface.keys()).filter(Boolean);
    list.sort((a, b) => String(a).localeCompare(String(b)));
    return list;
  };

  global.Search = Search;
})(window);
