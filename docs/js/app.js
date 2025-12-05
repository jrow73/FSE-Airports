// app.js
// App wiring: load data, build indexes, hook UI, render with GL

(function () {
  'use strict';

  const { map } = MapModule.init();
  GlRenderer.attach(map);
  if (GlRenderer.renderLegend) {
    GlRenderer.renderLegend();
  }


  const el = {
    // Query UI
    filtersBtn: document.getElementById('filtersBtn'),
    filtersPanel: document.getElementById('filtersPanel'),
    loading: document.getElementById('loading'),
    search: document.getElementById('searchInput'),
    country: document.getElementById('countrySelect'),
    state: document.getElementById('stateSelect'),
    type: document.getElementById('typeSelect'),
    size: document.getElementById('sizeSelect'),
    surface: document.getElementById('surfaceSelect'),
    services: document.getElementById('servicesSelect'),
    rwyMin: document.getElementById('rwyMin'),
    rwyMax: document.getElementById('rwyMax'),
    irlStatus: document.getElementById('irlStatus'),
    localFuel: document.getElementById('localFuel'),
    localMx: document.getElementById('localMx'),
    radiusCenter: document.getElementById('radiusCenter'),
    radiusNm: document.getElementById('radiusNm'),
    clear: document.getElementById('filtersClear'),
    copyIcaos: document.getElementById('copyIcaos'),
    close: document.getElementById('filtersClose'),
    count: document.getElementById('count'),

    // Distance UI
    distanceBtn: document.getElementById('distanceBtn'),
    distancePanel: document.getElementById('distancePanel'),
    distFrom: document.getElementById('distFrom'),
    distTo: document.getElementById('distTo'),
    distanceResult: document.getElementById('distanceResult'),
    distanceGo: document.getElementById('distanceGo'),
    distanceSwap: document.getElementById('distanceSwap'),
    distanceClear: document.getElementById('distanceClear'),
    distanceClose: document.getElementById('distanceClose')
  };

  let allFeatures = [];

  function setLoading(v) {
    if (el.loading) el.loading.classList.toggle('hidden', !v);
  }

  // Instantiate feature modules
  const queryUI = QueryUI.create(map, {
    search: el.search,
    country: el.country,
    state: el.state,
    type: el.type,
    size: el.size,
    surface: el.surface,
    services: el.services,
    rwyMin: el.rwyMin,
    rwyMax: el.rwyMax,
    radiusCenter: el.radiusCenter,
    radiusNm: el.radiusNm,
    irlStatus: el.irlStatus,
    localFuel: el.localFuel,
    localMx: el.localMx,
    clear: el.clear,
    close: el.close,
    filtersBtn: el.filtersBtn,
    filtersPanel: el.filtersPanel,
    count: el.count,
    copyIcaos: el.copyIcaos
  });

  const distanceTool = DistanceTool.create(map, {
    distFrom: el.distFrom,
    distTo: el.distTo,
    result: el.distanceResult,
    panel: el.distancePanel,
    btnToggle: el.distanceBtn,
    btnGo: el.distanceGo,
    btnSwap: el.distanceSwap,
    btnClear: el.distanceClear,
    btnClose: el.distanceClose
  });

  // Data loading
  async function load() {
    try {
      setLoading(true);
      const res = await fetch('./data/airports.geojson', {
        cache: 'no-cache'
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const gj = await res.json();
      allFeatures = Array.isArray(gj.features) ? gj.features : [];
    } catch (err) {
      console.error('GeoJSON fetch/parse failed:', err);
      alert('Failed to load airports.geojson');
      setLoading(false);
      return;
    }

    try {
      Search.build(allFeatures);
      queryUI.setAllFeatures(allFeatures);
      queryUI.populateSelects();
      if (window.SuggestionForms &&
          typeof window.SuggestionForms.refreshCountryStateOptions === 'function') {
        window.SuggestionForms.refreshCountryStateOptions();
      }
      queryUI.render();
      GlRenderer.fitTo(allFeatures);
    } catch (err) {
      console.error('Render failed:', err);
    } finally {
      setLoading(false);
    }
  }

  // boot
  load();
})();
