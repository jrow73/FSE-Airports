import fs from "fs/promises";
import fetch from "node-fetch";
import { parse } from "csv-parse/sync";

// --------------------------
// CONFIG
// --------------------------
const FSE_CSV_URL = "https://server.fseconomy.net/static/airports.csv";
const IRL_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRDWuT9zq4W26nq7oO1g0_CPv3wejxh3JPzbrtBF529Zb3U4qcuOuhcXeOVgyNZ-jcWMEvJSiQKM4FX/pub?gid=888849407&single=true&output=csv";
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

// Columns we expect from the FSE CSV.
// If any of these disappear or get renamed, we want to know.
const REQUIRED_FSE_COLUMNS = [
  "icao",
  "lat",
  "lon",
  "type",
  "size",
  "name",
  "city",
  "state",
  "country",
  "elev",
  "surfaceType",
  "longestRwy",
  "services"
];

// --------------------------
// HELPERS
// --------------------------

// Generic CSV fetch (used for the IRL Google Sheet, which is well-formed)
async function fetchCsv(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}`);
  const text = await res.text();
  return parse(text, {
    columns: true,
    skip_empty_lines: true
  });
}

// FSE CSV fetch with header validation + column-count report, then relaxed parsing
async function fetchFseCsv(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}`);
  const text = await res.text();

  // First pass: parse as raw rows (arrays), respecting quotes.
  const rawRecords = parse(text, {
    skip_empty_lines: true,
    relax_column_count: true
  });

  if (!rawRecords.length) {
    console.warn("FSE CSV: file appears to be empty.");
    return [];
  }

  const headerRow = rawRecords[0];
  const expectedColumns = headerRow.length;

  // --- Header validation ---
  const headerSet = new Set(headerRow);
  const missing = REQUIRED_FSE_COLUMNS.filter((c) => !headerSet.has(c));
  const extras = headerRow.filter((c) => !REQUIRED_FSE_COLUMNS.includes(c));

  if (missing.length) {
    console.warn("FSE CSV: missing required columns:", missing);
    // If you ever want this to be fatal, uncomment:
    // throw new Error("FSE CSV schema changed: missing required columns.");
  } else {
    console.log("FSE CSV: all required columns are present.");
  }

  if (extras.length) {
    console.log(
      "FSE CSV: additional columns present (ignored by script):",
      extras
    );
  }

  // --- Per-record column-count check (sanity check) ---
  let badCount = 0;
  const examples = [];

  for (let i = 1; i < rawRecords.length; i++) {
    const row = rawRecords[i];
    const cols = row.length;
    if (cols !== expectedColumns) {
      badCount++;
      if (examples.length < 5) {
        examples.push({
          lineNumber: i + 1, // 1-based line number in CSV
          cols,
          row
        });
      }
    }
  }

  if (badCount > 0) {
    console.warn(
      `FSE CSV: found ${badCount} non-empty records with unexpected column count (expected ${expectedColumns}).`
    );
    console.warn("Here are up to 5 examples (parsed fields):");
    for (const ex of examples) {
      console.warn(
        `  Record at CSV line ${ex.lineNumber}: has ${ex.cols} columns.`,
        ex.row
      );
    }
  } else {
    console.log(
      `FSE CSV: all non-empty records have ${expectedColumns} columns.`
    );
  }

  // Second pass: parse into objects with column names, like your original script.
  // Any extra columns the server adds will be present on the row object, but
  // your code just ignores them.
  return parse(text, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true
  });
}

// --------------------------
// MAIN
// --------------------------
async function main() {
  console.log("Fetching source CSV data...");

  const [fseRows, irlRows] = await Promise.all([
    fetchFseCsv(FSE_CSV_URL),
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

    const localfuel = size >= 2500 || services >= 3 ? "yes" : "no";
    const localmx = size >= 2000 || services === 7 ? "yes" : "no";

    // Surface type lookup
    const surfaceCode = Number(row.surfaceType);
    const surfaceType = SURFACE_TYPES[surfaceCode] ?? `Unknown(${surfaceCode})`;

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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
