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

    const parseToken = tok => {
      // optional dir prefix/suffix + number, e.g. n41.5, 87.6w
      const m = tok.match(/^([nsew])?(-?\d+(?:\.\d+)?)([nsew])?$/i);
      if (!m) return null;
      const dir = (m[1] || m[3] || '').toLowerCase();
      const val = parseFloat(m[2]);
      if (!Number.isFinite(val)) return null;
      return { dir, val };
    };

    let latVal = null;
    let lonVal = null;

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
        // no explicit dirs, assume lat, lon
        latVal = c1.val;
        lonVal = c2.val;
      }
    } else if (tokens.length === 3) {
      // Patterns like "41.5 n 87.6w" or "n 41.5 87.6w"
      const dirs = tokens.filter(isDir);
      const nums = tokens.filter(t => !isDir(t)).map(parseToken);
      if (nums.length !== 2) return null;

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
