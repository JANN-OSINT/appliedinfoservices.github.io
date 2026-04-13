#!/usr/bin/env node
/**
 * Fetches the OurAirports master CSV, filters to airports we care about
 * (major civilian + military bases), and emits a TypeScript module at
 * src/lib/extended-airports.ts.
 *
 * Run manually when the airport data needs refreshing:
 *   node scripts/build-airports.mjs
 *
 * The generated file is committed to the repo; runtime code doesn't hit
 * the network.
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, "../src/lib/extended-airports.ts");
const CSV_URL =
  "https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv";
// Optional local path — if this file exists we read it instead of hitting
// the network. Lets the script work in sandboxes without outbound fetch.
const LOCAL_CSV = process.env.AIRPORTS_CSV || "/tmp/airports.csv";

// Regex for detecting military installations in the OurAirports name/keywords.
// Covers US Air Force, Navy, Army, Marine Corps, Coast Guard, and common
// NATO/allied naming conventions.
const MILITARY_NAME_RE =
  /\b(Air Force Base|AFB|Air Base|AB|Naval Air Station|NAS|Naval Station|Air Station|Joint Base|Army Airfield|AAF|Marine Corps|MCAS|Coast Guard|RAF |RNAS|JASDF|JMSDF|PLAAF|PLANAF|Military|Fliegerhorst|Base A[eé]rienne|Base A[eé]ronavale)\b/i;

// Keywords column hit for "military" is a strong signal as well.
const MILITARY_KEYWORDS_RE = /\bmilitary\b/i;

/** Minimal RFC 4180 CSV parser — handles quoted fields with embedded commas. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else if (c === "\r") {
        // skip; handled by \n
      } else {
        field += c;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

async function loadCsv() {
  try {
    const buf = await readFile(LOCAL_CSV, "utf8");
    console.log(`Using local CSV at ${LOCAL_CSV} (${buf.length} bytes)`);
    return buf;
  } catch {
    console.log(`Fetching ${CSV_URL} …`);
    const res = await fetch(CSV_URL);
    if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
    const t = await res.text();
    console.log(`  ${t.length} bytes downloaded`);
    return t;
  }
}

async function main() {
  const text = await loadCsv();

  const rows = parseCsv(text);
  const header = rows[0];
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  console.log(`  ${rows.length - 1} rows parsed`);

  const required = [
    "ident",
    "type",
    "name",
    "latitude_deg",
    "longitude_deg",
    "iso_country",
    "municipality",
    "icao_code",
    "iata_code",
    "keywords",
  ];
  for (const col of required) {
    if (!(col in idx)) throw new Error(`CSV missing column: ${col}`);
  }

  let civilian = 0;
  let military = 0;
  const out = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.length < header.length) continue;

    const type = row[idx.type];
    if (
      type === "closed" ||
      type === "heliport" ||
      type === "seaplane_base" ||
      type === "balloonport"
    ) {
      continue;
    }

    const name = row[idx.name] || "";
    const keywords = row[idx.keywords] || "";
    const iata = (row[idx.iata_code] || "").trim().toUpperCase();
    const icao = (row[idx.icao_code] || "").trim().toUpperCase();
    const ident = (row[idx.ident] || "").trim().toUpperCase();
    const lat = Number(row[idx.latitude_deg]);
    const lng = Number(row[idx.longitude_deg]);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const isMilitary =
      MILITARY_NAME_RE.test(name) || MILITARY_KEYWORDS_RE.test(keywords);

    const isMajorCivilian =
      (type === "large_airport" || type === "medium_airport") && (iata || icao);

    if (!isMilitary && !isMajorCivilian) continue;

    // Prefer icao_code column, fall back to ident when it looks like an ICAO
    // (4 uppercase letters). Some small military fields lack icao_code but
    // have an ident like "KDOV".
    const effectiveIcao =
      icao || (/^[A-Z]{4}$/.test(ident) ? ident : "") || undefined;

    // Skip entries with no usable identifier at all — we'd never be able to
    // look them up.
    if (!iata && !effectiveIcao) continue;

    const record = {
      iata: iata || undefined,
      icao: effectiveIcao,
      name,
      city: row[idx.municipality] || "",
      country: row[idx.iso_country] || "",
      latitude: Number(lat.toFixed(5)),
      longitude: Number(lng.toFixed(5)),
      type: isMilitary
        ? "military"
        : type === "large_airport"
          ? "large"
          : "medium",
    };

    out.push(record);
    if (isMilitary) military++;
    else civilian++;
  }

  // Sort deterministically: type priority, then IATA, then ICAO.
  const TYPE_RANK = { large: 0, military: 1, medium: 2 };
  out.sort((a, b) => {
    const rankDiff = (TYPE_RANK[a.type] ?? 9) - (TYPE_RANK[b.type] ?? 9);
    if (rankDiff !== 0) return rankDiff;
    const aKey = a.iata ?? a.icao ?? "";
    const bKey = b.iata ?? b.icao ?? "";
    return aKey.localeCompare(bKey);
  });

  console.log(`  ${civilian} major civilian + ${military} military = ${out.length} total`);

  // Format as JSON (with key quoting stripped for compactness — TS lets us
  // write { iata: "JFK", ... } without quotes, but since we're generating,
  // we'll use JSON.stringify and let the formatter deal with it).
  const header1 =
    `// AUTO-GENERATED by scripts/build-airports.mjs — do not edit by hand.\n` +
    `// Source: ${CSV_URL}\n` +
    `// Run \`node scripts/build-airports.mjs\` from _apv-src to refresh.\n` +
    `// Totals: ${civilian} major civilian airports, ${military} military installations.\n\n` +
    `export type ExtendedAirportType = "large" | "medium" | "military";\n\n` +
    `export type ExtendedAirport = {\n` +
    `  iata?: string;\n` +
    `  icao?: string;\n` +
    `  name: string;\n` +
    `  city: string;\n` +
    `  country: string;\n` +
    `  latitude: number;\n` +
    `  longitude: number;\n` +
    `  type: ExtendedAirportType;\n` +
    `};\n\n` +
    `export const EXTENDED_AIRPORTS: readonly ExtendedAirport[] = `;

  const body = JSON.stringify(out, null, 0)
    // Light pretty-print: one entry per line.
    .replace(/},\{/g, "},\n  {")
    .replace(/^\[/, "[\n  ")
    .replace(/\]$/, "\n]");

  await writeFile(OUT_PATH, header1 + body + " as const;\n");
  console.log(`  wrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
