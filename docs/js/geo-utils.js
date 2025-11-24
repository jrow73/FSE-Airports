// geo-utils.js
// Shared geographic utilities (lat/lon parsing + distance)

(function (global) {
  'use strict';

function parseLatLon(text) {
  if (!text) return null;
  let s = text.trim().toLowerCase();
  if (!s) return null;

  // Normalize separators
  s = s.replace(/,/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  const tokens = s.split(' ');
  const isDir = t => /^[nsew]$/.test(t);

  // --- helpers ------------------------------------------------------------

  // Decimal degrees token: optional dir prefix/suffix + number, e.g. n41.5, 87.6w
  const parseDecimalToken = tok => {
    const m = tok.match(/^([nsew])?(-?\d+(?:\.\d+)?)([nsew])?$/i);
    if (!m) return null;
    const dir = (m[1] || m[3] || '').toLowerCase();
    const val = parseFloat(m[2]);
    if (!Number.isFinite(val)) return null;
    return { dir, val };
  };

  // DMS token: optional dir prefix/suffix + degrees + optional minutes + optional seconds.
  // Examples it accepts:
  //   n61°33.56'
  //   61°33.56'n
  //   61°33'30"n
  //   w149°37.46'
  const parseDmsToken = tok => {
    if (!tok) return null;
    tok = tok.trim().toLowerCase();

    let dir = '';
    // Leading direction
    if (/^[nsew]/.test(tok)) {
      dir = tok[0];
      tok = tok.slice(1).trim();
    }
    // Trailing direction
    if (/[nsew]$/.test(tok)) {
      dir = tok[tok.length - 1];
      tok = tok.slice(0, -1).trim();
    }

    // Extract up to 3 numeric parts: deg, min, sec
    const nums = tok.match(/\d+(?:\.\d+)?/g) || [];
    if (!nums.length) return null;

    const deg = parseFloat(nums[0]);
    const min = nums.length > 1 ? parseFloat(nums[1]) : 0;
    const sec = nums.length > 2 ? parseFloat(nums[2]) : 0;

    if (!Number.isFinite(deg) || !Number.isFinite(min) || !Number.isFinite(sec)) {
      return null;
    }
    if (deg < 0 || deg > 180) return null;
    if (min < 0 || min >= 60) return null;
    if (sec < 0 || sec >= 60) return null;

    const val = deg + min / 60 + sec / 3600;
    return { dir, val };
  };

  // Decide whether this looks like DMS at all
  const hasDms = tokens.some(t => /[°'"]/.test(t));

  let latVal = null;
  let lonVal = null;

  // --- DMS path -----------------------------------------------------------
  if (hasDms) {
    if (tokens.length === 2) {
      // e.g. "n61°33.56' w149°37.46'"
      const c1 = parseDmsToken(tokens[0]);
      const c2 = parseDmsToken(tokens[1]);
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
        // no explicit dirs, assume lat, lon
        latVal = c1.val;
        lonVal = c2.val;
      }
    } else if (tokens.length === 3) {
      // Patterns like "61°33.56' n 149°37.46'w" or "n 61°33.56' 149°37.46'w"
      const dirs = tokens.filter(isDir);
      const nums = tokens.filter(t => !isDir(t)).map(parseDmsToken);
      if (nums.length !== 2 || nums.some(x => !x)) return null;

      const c1 = nums[0];
      const c2 = nums[1];

      const firstDir = dirs[0] || c1.dir;
      const secondDir = dirs[1] || c2.dir;

      if ((firstDir === 'n' || firstDir === 's') &&
          (secondDir === 'e' || secondDir === 'w')) {
        latVal = c1.val * (firstDir === 's' ? -1 : 1);
        lonVal = c2.val * (secondDir === 'w' ? -1 : 1);
      } else if ((secondDir === 'n' || secondDir === 's') &&
                 (firstDir === 'e' || firstDir === 'w')) {
        latVal = c2.val * (secondDir === 's' ? -1 : 1);
        lonVal = c1.val * (firstDir === 'w' ? -1 : 1);
      } else {
        return null;
      }
    } else {
      return null;
    }
  } else {
    // --- existing decimal-degrees path ------------------------------------
    if (tokens.length === 2) {
      const c1 = parseDecimalToken(tokens[0]);
      const c2 = parseDecimalToken(tokens[1]);
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
        // no explicit dirs, assume lat, lon
        latVal = c1.val;
        lonVal = c2.val;
      }
    } else if (tokens.length === 3) {
      const dirs = tokens.filter(isDir);
      const nums = tokens.filter(t => !isDir(t)).map(parseDecimalToken);
      if (nums.length !== 2 || nums.some(x => !x)) return null;

      const c1 = nums[0];
      const c2 = nums[1];

      const firstDir = dirs[0] || c1.dir;
      const secondDir = dirs[1] || c2.dir;

      if ((firstDir === 'n' || firstDir === 's') &&
          (secondDir === 'e' || secondDir === 'w')) {
        latVal = c1.val * (firstDir === 's' ? -1 : 1);
        lonVal = c2.val * (secondDir === 'w' ? -1 : 1);
      } else if ((secondDir === 'n' || secondDir === 's') &&
                 (firstDir === 'e' || firstDir === 'w')) {
        latVal = c2.val * (secondDir === 's' ? -1 : 1);
        lonVal = c1.val * (firstDir === 'w' ? -1 : 1);
      } else {
        return null;
      }
    } else {
      return null;
    }
  }

  if (!Number.isFinite(latVal) || !Number.isFinite(lonVal)) return null;
  if (Math.abs(latVal) > 90 || Math.abs(lonVal) > 180) return null;

  return { lat: latVal, lon: lonVal };
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

  global.GeoUtil = { parseLatLon, haversineNm };
})(window);
