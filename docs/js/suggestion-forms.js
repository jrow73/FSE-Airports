// js/suggestion-forms.js
// Handles "suggest change" + "suggest new airport" modals and form submission.

(function (global) {
  'use strict';

  const FORM_ACTION_URL =
    'https://script.google.com/macros/s/AKfycbyK-kXfWHPG_3mQCT9WkeHXoGHeWsjZ_H9G8ThlfyWUz529_xVwWxUP5WxfUkQANOjoIQ/exec';

  function $(id) {
    return document.getElementById(id);
  }

  let allowedCountries = null;
  let allowedStates = null;

  function initCountryStateOptionsFromSearch() {
    if (!global.Search) return;

    const countryListEl = $('new-country-list');
    const stateListEl = $('new-state-list');

    // Countries (required)
    if (countryListEl && typeof global.Search.countries === 'function') {
      const countries = global.Search.countries() || [];
      // normalize to uppercase for comparison
      allowedCountries = countries
        .map((c) => toProperCase(String(c).trim()))
        .filter(Boolean);
      countryListEl.innerHTML = '';
      allowedCountries.forEach((c) => {
        const opt = document.createElement('option');
        opt.value = c;
        countryListEl.appendChild(opt);
      });
    }

    // States (optional)
    if (stateListEl && typeof global.Search.states === 'function') {
      const states = global.Search.states() || [];
      allowedStates = states
        .map((s) => toProperCase(String(s).trim()))
        .filter(Boolean);
      stateListEl.innerHTML = '';
      allowedStates.forEach((s) => {
        const opt = document.createElement('option');
        opt.value = s;
        stateListEl.appendChild(opt);
      });
    }
  }

    function toProperCase(str) {
    if (!str) return '';
    return str
        .toLowerCase()
        .split(/\s+/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    }


  function showModal(modalId) {
    const el = $(modalId);
    if (!el) return;
    el.classList.remove('hidden');
    el.setAttribute('aria-hidden', 'false');
  }

  function hideModal(modalEl) {
    if (!modalEl) return;
    modalEl.classList.add('hidden');
    modalEl.setAttribute('aria-hidden', 'true');
  }

  // Close on backdrop / buttons with data-modal-close
  document.addEventListener('click', (evt) => {
    const closeTarget = evt.target.closest('[data-modal-close]');
    if (closeTarget) {
      const modal = closeTarget.closest('.suggest-modal');
      hideModal(modal);
      return;
    }
  });

  // ESC key closes whichever modal is open
  document.addEventListener('keydown', (evt) => {
    if (evt.key !== 'Escape') return;
    const openModal = document.querySelector('.suggest-modal:not(.hidden)');
    if (openModal) {
      hideModal(openModal);
    }
  });

  // ---------------------- CHANGE EXISTING AIRPORT ----------------------- //

  let currentChangeData = null;

  function initNumericFiltersChange() {
    ['proposed_elev', 'proposed_longest'].forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.addEventListener('input', () => {
        el.value = el.value.replace(/\D/g, '').slice(0, 5);
      });
    });
  }

  function initChangeCommentCounter() {
    const textarea = $('change-comments');
    const counter = $('change-comment-counter');
    if (!textarea || !counter) return;
    textarea.addEventListener('input', () => {
      const len = textarea.value.length;
      counter.textContent = `${len} / 255`;
    });
  }

  function validateChangeForm() {
    const statusEl = $('change-status');
    if (!statusEl) return false;

    const icao = ($('proposed_icao')?.value || '').trim();
    const elev = ($('proposed_elev')?.value || '').trim();
    const longest = ($('proposed_longest')?.value || '').trim();

    // ICAO: optional, but if present must be 3 or 4 alphanumeric characters
    if (icao && !/^[A-Za-z0-9]{3,4}$/.test(icao)) {
      statusEl.textContent =
        'ICAO must be 3 or 4 alphanumeric characters (A–Z, 0–9).';
      statusEl.className = 'suggest-status error';
      return false;
    }

    if (elev && !/^[0-9]{1,5}$/.test(elev)) {
      statusEl.textContent =
        'Elevation must be numeric only (up to 5 digits).';
      statusEl.className = 'suggest-status error';
      return false;
    }

    if (longest && !/^[0-9]{1,5}$/.test(longest)) {
      statusEl.textContent =
        'Longest runway must be numeric only (up to 5 digits).';
      statusEl.className = 'suggest-status error';
      return false;
    }

    return true;
  }

  function evaluateDuplicates() {
    const fieldPairs = [
      ['proposed_icao', 'cur-icao'],
      ['proposed_name', 'cur-name'],
      ['proposed_city', 'cur-city'],
      ['proposed_state', 'cur-state'],
      ['proposed_country', 'cur-country'],
      ['proposed_elev', 'cur-elev'],
      ['proposed_longest', 'cur-longest'],
      ['proposed_surface', 'cur-surface'],
      ['proposed_airportType', 'cur-airportType'],
    ];

    const submitBtn = $('change-submit-btn');
    const hintEl = $('change-submit-hint');

    let hasDuplicate = false;

    fieldPairs.forEach(([proposedId, currentId]) => {
      const inputEl = $(proposedId);
      const curEl = $(currentId);
      if (!inputEl || !curEl) return;

      // Clear previous highlighting
      inputEl.classList.remove('duplicate-field');
      curEl.classList.remove('duplicate-field');
      const labelEl = curEl.previousElementSibling;
      if (labelEl && labelEl.classList.contains('suggest-label')) {
        labelEl.classList.remove('duplicate-field');
      }

      const proposedRaw = inputEl.value || '';
      const currentRaw = curEl.textContent || '';

      const proposedVal = proposedRaw.trim();
      if (!proposedVal) return;

      const currentVal = currentRaw.trim();

      if (proposedVal.toLowerCase() === currentVal.toLowerCase()) {
        hasDuplicate = true;
        inputEl.classList.add('duplicate-field');
        curEl.classList.add('duplicate-field');
        if (labelEl && labelEl.classList.contains('suggest-label')) {
          labelEl.classList.add('duplicate-field');
        }
      }
    });

    if (submitBtn) {
      submitBtn.disabled = hasDuplicate;
      submitBtn.classList.toggle('suggest-btn-disabled', hasDuplicate);
    }

    if (hintEl) {
      hintEl.textContent = hasDuplicate
        ? 'Delete or change any suggestions that match the current values before submitting.'
        : '';
    }

    return hasDuplicate;
  }

  function initDuplicateWatcher() {
    const ids = [
      'proposed_icao',
      'proposed_name',
      'proposed_city',
      'proposed_state',
      'proposed_country',
      'proposed_elev',
      'proposed_longest',
      'proposed_surface',
      'proposed_airportType',
    ];

    ids.forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.addEventListener('input', evaluateDuplicates);
      el.addEventListener('change', evaluateDuplicates);
    });

    evaluateDuplicates();
  }

  function buildChangeSummaryCard(data) {
    const fseIcao = (data.fseIcao || '').toUpperCase();
    const irlIcao = (data.irlIcao || '').toUpperCase();
    const name = data.name || '';
    const locationLine = [data.city, data.state, data.country]
      .filter(Boolean)
      .join(', ');

    let icaoLine = '';

    if (fseIcao && irlIcao && fseIcao !== irlIcao) {
      icaoLine = `
        <div class="icao-line">
          <span class="icao fse">FSE: ${fseIcao}</span>
          <span class="icao irl">IRL: ${irlIcao}</span>
        </div>`;
    } else if (fseIcao && irlIcao && fseIcao === irlIcao) {
      icaoLine = `
        <div class="icao-line">
          <span class="icao both">ICAO: ${fseIcao}</span>
        </div>`;
    } else if (fseIcao && !irlIcao) {
      icaoLine = `
        <div class="icao-line">
          <span class="icao fse">FSE: ${fseIcao}</span>
          <span class="icao closed">(Closed)</span>
        </div>`;
    } else {
      icaoLine = `
        <div class="icao-line">
          <span class="icao closed">(No ICAO on file)</span>
        </div>`;
    }

    return `
      <div class="airport-card">
        ${icaoLine}
        <div class="airport-name">${name || ''}</div>
        <div class="airport-location">${locationLine}</div>
      </div>
    `;
  }

  function populateChangeForm(data) {
    currentChangeData = data || null;

    const summaryEl = $('change-airport-summary');
    if (summaryEl) {
      summaryEl.innerHTML = buildChangeSummaryCard(data);
    }

    // Fill "current" values (IRL fields)
    $('cur-icao').textContent = (data.irlIcao || '').toUpperCase() || '(none on file)';
    $('cur-name').textContent = data.name || '';
    $('cur-city').textContent = data.city || '';
    $('cur-state').textContent = data.state || '';
    $('cur-country').textContent = data.country || '';
    $('cur-elev').textContent = data.elev || '';
    $('cur-longest').textContent = data.longest || '';
    $('cur-surface').textContent = data.surface || '';
    $('cur-airportType').textContent = data.airportType || '(not set)';

    // Hidden FSE ICAO key
    $('icao-input').value = (data.fseIcao || '').toUpperCase();

    // Clear proposed fields + comments + status
    [
      'proposed_icao',
      'proposed_name',
      'proposed_city',
      'proposed_state',
      'proposed_country',
      'proposed_elev',
      'proposed_longest',
      'proposed_surface',
      'proposed_airportType',
    ].forEach((id) => {
      const el = $(id);
      if (el) el.value = '';
    });

    const comments = $('change-comments');
    if (comments) comments.value = '';
    const counter = $('change-comment-counter');
    if (counter) counter.textContent = '0 / 255';

    const statusEl = $('change-status');
    if (statusEl) {
      statusEl.textContent = '';
      statusEl.className = 'suggest-status';
    }
    const hintEl = $('change-submit-hint');
    if (hintEl) hintEl.textContent = '';

    evaluateDuplicates();
  }

  function buildChangePayload(formData) {
    if (!currentChangeData) return null;

    const fseIcao = (currentChangeData.fseIcao || '').toUpperCase();

    const currentMap = {
      icao: (currentChangeData.irlIcao || '').toUpperCase(),
      name: currentChangeData.name || '',
      city: currentChangeData.city || '',
      state: currentChangeData.state || '',
      country: currentChangeData.country || '',
      elev: currentChangeData.elev || '',
      longest: currentChangeData.longest || '',
      surface: currentChangeData.surface || '',
      airportType: currentChangeData.airportType || '',
    };

    const proposedFields = [
      ['IRL ICAO', 'proposed_icao', 'icao'],
      ['Name', 'proposed_name', 'name'],
      ['City', 'proposed_city', 'city'],
      ['State', 'proposed_state', 'state'],
      ['Country', 'proposed_country', 'country'],
      ['Elevation (ft)', 'proposed_elev', 'elev'],
      ['Longest runway (ft)', 'proposed_longest', 'longest'],
      ['Surface type', 'proposed_surface', 'surface'],
      ['Airport Type', 'proposed_airportType', 'airportType'],
    ];

    const userComments = (formData.get('comments') || '').toString().trim();

    const changes = [];
    let anyProposed = false;

    proposedFields.forEach(([label, propName, currentKey]) => {
      const raw = formData.get(propName);
      const proposedVal = raw ? raw.toString().trim() : '';
      if (!proposedVal) return;

      anyProposed = true;

      const currentValRaw =
        currentMap[currentKey] != null ? String(currentMap[currentKey]) : '';
      const currentVal = currentValRaw.trim();

      const normCurrent = currentVal.toLowerCase();
      const normProposed = proposedVal.toLowerCase();

      if (normProposed === normCurrent) return;

      changes.push({
        fieldName: label,
        currentValue: currentVal,
        proposedValue: proposedVal,
      });
    });

    if (changes.length === 0 && userComments) {
      changes.push({
        fieldName: 'General',
        currentValue: '',
        proposedValue: '',
      });
    }

    return {
      fseIcao,
      userComments,
      changes,
      anyProposed,
    };
  }

  function initChangeForm() {
    const form = $('change-form');
    if (!form) return;

    initNumericFiltersChange();
    initChangeCommentCounter();
    initDuplicateWatcher();

    const statusEl = $('change-status');

    form.addEventListener('submit', async (evt) => {
      evt.preventDefault();
      if (!statusEl) return;

      statusEl.textContent = '';
      statusEl.className = 'suggest-status';

      if (evaluateDuplicates()) {
        return;
      }

      if (!validateChangeForm()) {
        return;
      }

      const formData = new FormData(form);
      const built = buildChangePayload(formData);

      if (!built) {
        statusEl.textContent = 'Missing airport context; please try again.';
        statusEl.className = 'suggest-status error';
        return;
      }

      const { fseIcao, userComments, changes, anyProposed } = built;

      if (!changes.length) {
        if (anyProposed) {
          statusEl.textContent =
            'All proposed values already match the current values. Nothing to submit.';
        } else {
          statusEl.textContent =
            'Please propose at least one change or add a comment.';
        }
        statusEl.className = 'suggest-status error';
        return;
      }

      statusEl.textContent = 'Sending...';

      const payload = new URLSearchParams();
      payload.append('type', 'change');
      payload.append('icao', fseIcao);
      payload.append('comments', userComments);
      payload.append('changes', JSON.stringify(changes));

      try {
        await fetch(FORM_ACTION_URL, {
          method: 'POST',
          mode: 'no-cors',
          body: payload,
        });

        statusEl.textContent = 'Thank you! Your suggestion has been recorded.';
        statusEl.className = 'suggest-status ok';

        // Reset user-entered fields but keep the current airport context
        form.reset();

        if (currentChangeData) {
          const hiddenIcao = $('icao-input');
          if (hiddenIcao) {
            hiddenIcao.value = (currentChangeData.fseIcao || '').toUpperCase();
          }
        }

        // Reset duplicate highlighting / button state after reset
        evaluateDuplicates();
      } catch (err) {
        console.error(err);
        statusEl.textContent =
          'Sorry, something went wrong submitting your suggestion.';
        statusEl.className = 'suggest-status error';
      }

    });
  }

  // ---------------------- NEW AIRPORT FORM ----------------------- //

  function initNumericFiltersNew() {
    ['new-elev', 'new-longestRwy'].forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.addEventListener('input', () => {
        el.value = el.value.replace(/\D/g, '').slice(0, 5);
      });
    });
  }

  function initNewCommentCounter() {
    const textarea = $('new-comments');
    const counter = $('new-comment-counter');
    if (!textarea || !counter) return;
    textarea.addEventListener('input', () => {
      const len = textarea.value.length;
      counter.textContent = `${len} / 255`;
    });
  }

  function validateNewForm() {
    const statusEl = $('new-status');
    if (!statusEl) return false;

    const icao = ($('new-icao')?.value || '').trim();
    const name = ($('new-name')?.value || '').trim();
    const city = ($('new-city')?.value || '').trim();
    const state = ($('new-state')?.value || '').trim();
    const country = ($('new-country')?.value || '').trim();
    const elev = ($('new-elev')?.value || '').trim();
    const longest = ($('new-longestRwy')?.value || '').trim();
    const surface = ($('new-surfaceType')?.value || '').trim();
    const airportType = ($('new-airportType')?.value || '').trim();
    const lat = ($('new-lat')?.value || '').trim();
    const lon = ($('new-lon')?.value || '').trim();
    const comments = ($('new-comments')?.value || '').trim();

    // Required presence checks
    if (!icao) {
      statusEl.textContent = 'ICAO is required.';
      statusEl.className = 'suggest-status error';
      return false;
    }
    if (!/^[A-Za-z0-9]{3,4}$/.test(icao)) {
      statusEl.textContent =
        'ICAO must be 3 or 4 alphanumeric characters (A–Z, 0–9).';
      statusEl.className = 'suggest-status error';
      return false;
    }

    // ICAO must not already exist in the map data
    if (global.Search && typeof global.Search.byIcao === 'function') {
      const existing = global.Search.byIcao(icao.toUpperCase());
      if (existing) {
        statusEl.textContent =
          'That ICAO already exists in the current map data. ' +
          'If you are trying to correct that airport, please use the ' +
          '"Suggest changes to this airport" option instead of creating a new one.';
        statusEl.className = 'suggest-status error';
        return false;
      }
    }

    if (!name) {
      statusEl.textContent = 'Airport name is required.';
      statusEl.className = 'suggest-status error';
      return false;
    }
    if (!city) {
      statusEl.textContent = 'City is required.';
      statusEl.className = 'suggest-status error';
      return false;
    }
    if (!country) {
      statusEl.textContent = 'Country is required.';
      statusEl.className = 'suggest-status error';
      return false;
    }
    if (!elev) {
      statusEl.textContent = 'Elevation is required.';
      statusEl.className = 'suggest-status error';
      return false;
    }
    if (!longest) {
      statusEl.textContent = 'Longest runway is required.';
      statusEl.className = 'suggest-status error';
      return false;
    }
    if (!surface) {
      statusEl.textContent = 'Surface type is required.';
      statusEl.className = 'suggest-status error';
      return false;
    }
    if (!airportType) {
      statusEl.textContent = 'Airport type is required.';
      statusEl.className = 'suggest-status error';
      return false;
    }
    if (!lat || !lon) {
      statusEl.textContent =
        'Latitude and longitude are required (please create the pin from the map).';
      statusEl.className = 'suggest-status error';
      return false;
    }
    if (!comments) {
      statusEl.textContent =
        'Please provide a brief comment/description.';
      statusEl.className = 'suggest-status error';
      return false;
    }

    // Numeric format checks
    if (!/^[0-9]{1,5}$/.test(elev)) {
      statusEl.textContent =
        'Elevation must be numeric only (up to 5 digits).';
      statusEl.className = 'suggest-status error';
      return false;
    }
    if (!/^[0-9]{1,5}$/.test(longest)) {
      statusEl.textContent =
        'Longest runway must be numeric only (up to 5 digits).';
      statusEl.className = 'suggest-status error';
      return false;
    }

    // Country must match known list, if we have one
    if (allowedCountries && allowedCountries.length) {
      const countryNorm = country.trim();
      const match = allowedCountries.some(
        (c) => c.toLowerCase() === countryNorm.toLowerCase()
      );
      if (!match) {
        statusEl.textContent =
          'Country must match one of the existing countries in the map list (use the suggestions as you type).';
        statusEl.className = 'suggest-status error';
        return false;
      }
    }

    // State is optional, but if present must match known list
    if (state && allowedStates && allowedStates.length) {
      const stateNorm = state.trim();
      const match = allowedStates.some(
        (s) => s.toLowerCase() === stateNorm.toLowerCase()
      );
      if (!match) {
        statusEl.textContent =
          'State / province must match one of the existing entries in the map list (or leave it blank).';
        statusEl.className = 'suggest-status error';
        return false;
      }
    }

    return true;
  }

  function populateNewForm(latStr, lonStr) {
    const lat = $('new-lat');
    const lon = $('new-lon');
    if (lat) lat.value = latStr || '';
    if (lon) lon.value = lonStr || '';

    // Clear others & status
    ['new-icao', 'new-name', 'new-city', 'new-state', 'new-country', 'new-elev', 'new-longestRwy'].forEach(
      (id) => {
        const el = $(id);
        if (el) el.value = '';
      }
    );
    const surface = $('new-surfaceType');
    if (surface) surface.value = '';
    const airportType = $('new-airportType');
    if (airportType) airportType.value = '';
    const comments = $('new-comments');
    if (comments) comments.value = '';
    const counter = $('new-comment-counter');
    if (counter) counter.textContent = '0 / 255';
    const statusEl = $('new-status');
    if (statusEl) {
      statusEl.textContent = '';
      statusEl.className = 'suggest-status';
    }
  }

function initNewForm() {
  const form = $('new-airport-form');
  if (!form) return;

  initNumericFiltersNew();
  initNewCommentCounter();

  const statusEl = $('new-status');

  // Live ICAO duplicate check
  const icaoInput = $('new-icao');
  const submitBtn = form.querySelector('button[type="submit"]');

  if (icaoInput && statusEl && submitBtn) {
    icaoInput.addEventListener('input', () => {
      const raw = icaoInput.value || '';
      const val = raw.trim().toUpperCase();
      icaoInput.value = val; // force uppercase as they type

      // Clear any previous duplicate message from this live check
      statusEl.textContent = '';
      statusEl.className = 'suggest-status';

      // Empty → nothing to check yet
      if (!val) {
        submitBtn.disabled = false;
        submitBtn.classList.remove('suggest-btn-disabled');
        return;
      }

      // If it's not a plausible ICAO yet, don't do the duplicate check.
      // We'll still catch bad format in validateNewForm().
      if (!/^[A-Z0-9]{3,4}$/.test(val)) {
        submitBtn.disabled = false;
        submitBtn.classList.remove('suggest-btn-disabled');
        return;
      }

      // Check for duplicates in current map data
      if (window.Search && typeof window.Search.byIcao === 'function') {
        const exists = window.Search.byIcao(val);
        if (exists) {
          statusEl.textContent =
            'This ICAO already exists in the map. ' +
            'Use “Suggest changes to this airport” instead of creating a new one.';
          statusEl.className = 'suggest-status error';

          submitBtn.disabled = true;
          submitBtn.classList.add('suggest-btn-disabled');
          return;
        }
      }

      // No duplicate → allow submit
      submitBtn.disabled = false;
      submitBtn.classList.remove('suggest-btn-disabled');
    });
  }

    wireAutoCompleteAndIndicator(
    'new-country',
    'new-country-valid',
    () => allowedCountries,
    false // not optional
  );

  wireAutoCompleteAndIndicator(
    'new-state',
    'new-state-valid',
    () => allowedStates,
    true // optional
  );

  // Submit handler 
  form.addEventListener('submit', async (evt) => {
    evt.preventDefault();
    if (!statusEl) return;

    statusEl.textContent = '';
    statusEl.className = 'suggest-status';

    if (!validateNewForm()) {
      return;
    }

    statusEl.textContent = 'Sending...';

    const formData = new FormData(form);
    const payload = new URLSearchParams();

    payload.append('type', 'new');
    [
      'icao',
      'name',
      'city',
      'state',
      'country',
      'elev',
      'longestRwy',
      'surfaceType',
      'airportType',
      'lat',
      'lon',
      'comments',
    ].forEach((key) => {
      payload.append(key, formData.get(key) || '');
    });

    const latStr = formData.get('lat') || '';
    const lonStr = formData.get('lon') || '';

    try {
      await fetch(FORM_ACTION_URL, {
        method: 'POST',
        mode: 'no-cors',
        body: payload,
      });

      statusEl.textContent =
        'Thank you! Your new airport suggestion has been recorded.';
      statusEl.className = 'suggest-status ok';
      form.reset();
      // Restore lat/lon after reset
      $('new-lat').value = latStr || '';
      $('new-lon').value = lonStr || '';
    } catch (err) {
      console.error(err);
      statusEl.textContent =
        'Sorry, something went wrong submitting your suggestion.';
      statusEl.className = 'suggest-status error';
    }
  });
}

function wireAutoCompleteAndIndicator(inputId, indicatorId, getAllowedList, isOptional) {
  const input = $(inputId);
  const indicator = $(indicatorId);

  if (!input) return;

  function setIndicator(valid) {
    if (!indicator) return;
    indicator.classList.toggle('visible', valid);
  }

  input.addEventListener('input', () => {
    const raw = input.value || '';
    const val = raw.trim();
    if (!val) {
      // Empty: always "valid" for optional, not valid for required.
      setIndicator(isOptional);
      return;
    }

    const allowed = getAllowedList() || [];
    const lower = val.toLowerCase();

    const exact = allowed.some(
      (v) => v.toLowerCase() === lower
    );
    setIndicator(exact);
  });

  input.addEventListener('blur', () => {
    const raw = input.value || '';
    const val = raw.trim();
    if (!val) {
      setIndicator(isOptional);
      return;
    }

    const allowed = getAllowedList() || [];
    const lower = val.toLowerCase();

    // First: check for exact match
    const exactMatch = allowed.find(
      (v) => v.toLowerCase() === lower
    );
    if (exactMatch) {
      input.value = exactMatch; // normalize casing
      setIndicator(true);
      return;
    }

    // If not exact, see if it's a unique prefix
    const prefixMatches = allowed.filter((v) =>
      v.toLowerCase().startsWith(lower)
    );

    if (prefixMatches.length === 1) {
      // Unique prefix → autocomplete to full proper name
      input.value = prefixMatches[0];
      setIndicator(true);
      return;
    }

    // No unique or exact match
    setIndicator(false);
  });
}


  // ---------------------- PUBLIC API + EVENT DELEGATION ------------------- //

  const SuggestionForms = {
    _changeStore: Object.create(null),
    _changeKeySeq: 0,

    registerChangeAirport(data) {
      if (!data || !data.fseIcao) return null;
      const key = 'c' + ++this._changeKeySeq;
      this._changeStore[key] = data;
      return key;
    },

    openChangeModalByKey(key) {
      const data = this._changeStore[key];
      if (!data) return;
      populateChangeForm(data);
      showModal('changeModal');
    },

    openNewAirportModal(latStr, lonStr) {
      populateNewForm(latStr, lonStr);
      showModal('newModal');
    },
    refreshCountryStateOptions() {
      initCountryStateOptionsFromSearch();
    },
  };

  // Click delegation for links/buttons in popups
  document.addEventListener('click', (evt) => {
    const changeBtn = evt.target.closest('.js-open-suggest-change');
    if (changeBtn) {
      evt.preventDefault();
      const key = changeBtn.getAttribute('data-suggest-key');
      if (key) {
        SuggestionForms.openChangeModalByKey(key);
      }
      return;
    }

    const newBtn = evt.target.closest('.js-open-new-airport');
    if (newBtn) {
      evt.preventDefault();
      const latStr = newBtn.getAttribute('data-lat') || '';
      const lonStr = newBtn.getAttribute('data-lon') || '';
      SuggestionForms.openNewAirportModal(latStr, lonStr);
    }
  });

  // One-time form initialization
  initChangeForm();
  initNewForm();

  global.SuggestionForms = SuggestionForms;
})(window);
