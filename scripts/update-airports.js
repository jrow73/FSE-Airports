import fs from "fs/promises";
import fetch from "node-fetch";
import { parse } from "csv-parse/sync";

// --------------------------
// CONFIG
// --------------------------
const FSE_CSV_URL = "https://server.fseconomy.net/static/airports.csv";
const IRL_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRDWuT9zq4W26nq7oO1g0_CPv3wejxh3JPzbrtBF529Zb3U4qcuOuhcXeOVgyNZ-jcWMEvJSiQKM4FX/pub?gid=888849407&single=true&output=csv";
const OUTPUT_PATH = "docs/data/airports.geojson";

// Surface type mapping
const SURFACE_TYPES = {
  1: "Asphalt",
  2: "Concrete",
  3: "Coral",
  4: "Dirt",
  5: "Grass",
  6: "Gravel",
  7: "Helipad",
  8: "Oil Treated",
  9: "Snow",
  10: "Steel Mats",
  11: "Water"
};

// --------------------------
// HELPERS
// --------------------------
async function fetchCsv(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}`);
  const text = await res.text();
  return parse(text, { columns: true, skip_empty_lines: true });
}

// --------------------------
// MAIN
// --------------------------
async function main() {
  console.log("Fetching source CSV data...");
  const [fseRows, irlRows] = await Promise.all([
    fetchCsv(FSE_CSV_URL),
    fetchCsv(IRL_CSV_URL)
  ]);

  console.log("Building IRL ICAO lookup map...");
  // Expect columns: FSE-ICAO, IRL-ICAO
  const irlMap = new Map();
for (const row of irlRows) {
  const key = row["FSE-ICAO"]?.trim();
  let value = row["IRL-ICAO"]?.trim();

  // Normalize: treat blank or "null" strings as missing
  if (!value || value.toLowerCase() === "null") {
    value = null;
  }

  if (key) irlMap.set(key, value);
}

  console.log("Converting rows to GeoJSON features...");
  const features = [];

  for (const row of fseRows) {
    const lat = parseFloat(row.lat);
    const lon = parseFloat(row.lon);
    if (Number.isNaN(lat) || Number.isNaN(lon)) continue;

    const fseIcao = row.icao;
    const irlIcao = irlMap.get(fseIcao) ?? null;

    // Derived fields
    const hasRealAirport = irlIcao !== null && irlIcao !== "";
    const icaoCorrect = hasRealAirport && irlIcao === fseIcao;

    const size = Number(row.size);
    const services = Number(row.services);

    const localfuel = (size >= 2500 || services >= 3) ? "yes" : "no";
    const localmx = (size >= 2000 || services === 7) ? "yes" : "no";

    // Surface type lookup
    const surfaceCode = Number(row.surfaceType);
    const surfaceType =
      SURFACE_TYPES[surfaceCode] ?? `Unknown(${surfaceCode})`;

    const feature = {
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [lon, lat]
      },
      properties: {
        // original fields
        icao: row.icao,
        name: row.name,
        city: row.city,
        state: row.state,
        country: row.country,
        type: row.type,
        size,
        elev: Number(row.elev),
        longestRwy: Number(row.longestRwy),
        services,

        // replaced surface type
        surfaceType,

        // new fields
        irlicao: irlIcao,
        hasRealAirport,
        icaoCorrect,
        localfuel,
        localmx
      }
    };

    features.push(feature);
  }

  console.log(`Writing ${features.length} features to ${OUTPUT_PATH}...`);
  const geojson = {
    type: "FeatureCollection",
    features
  };

  await fs.writeFile(OUTPUT_PATH, JSON.stringify(geojson));
  console.log("Done! GeoJSON updated.");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
