/**
 * Central config model for the APV tool. Every field here corresponds to a
 * prop on a flightcn or mapcn component, surfaced as a UI control in the
 * ControlPanel. No prop is hardcoded in MapStage — every value flows from
 * this object.
 */

export type FlightMode = "single" | "multi" | "multi-leg";
export type LineStyle = "solid" | "dash" | "dot";
export type TripType = "one-way" | "round-trip";
export type MapTheme = "light" | "dark";
export type ProjectionKind = "mercator" | "globe";
export type BasemapKind = "carto-positron" | "carto-dark-matter" | "carto-voyager" | "custom";

export type RouteEntry = {
  id: string;
  from: string;
  to: string;
  color?: string;
  width?: number;
  opacity?: number;
  lineStyle?: LineStyle;
  tripType?: TripType;
};

export type AppConfig = {
  /* ── Map ──────────────────────────────────────────────────── */
  theme: MapTheme;
  projection: ProjectionKind;
  showMapControls: boolean;
  basemap: BasemapKind;
  customStyleUrl: string;
  viewport: {
    center: [number, number];
    zoom: number;
    bearing: number;
    pitch: number;
  };

  /* ── Mode ─────────────────────────────────────────────────── */
  mode: FlightMode;

  /* Single route */
  singleFrom: string;
  singleTo: string;

  /* Multi-independent routes */
  multiRoutes: RouteEntry[];

  /* Multi-leg waypoints */
  multiLegWaypoints: string[];

  /* ── Shared render options ───────────────────────────────── */
  color: string;
  width: number;
  opacity: number;
  lineStyle: LineStyle;
  npoints: number;
  showAirports: boolean;
  showLabel: boolean;
  labelPosition: "top" | "bottom";
  interactive: boolean;
  hoverEffect: boolean;
  tripType: TripType;

  /* ── Animation ───────────────────────────────────────────── */
  animate: boolean;
  animateDuration: number;
  animateLoop: boolean;
  animateRoundTrip: boolean;
  animateIconSize: number;
};

export const DEFAULT_CONFIG: AppConfig = {
  theme: "light",
  projection: "mercator",
  showMapControls: true,
  basemap: "carto-positron",
  customStyleUrl: "",
  viewport: {
    center: [20, 25],
    zoom: 1.2,
    bearing: 0,
    pitch: 0,
  },

  mode: "single",

  singleFrom: "TPE",
  singleTo: "LAX",

  multiRoutes: [
    { id: "r1", from: "JFK", to: "LHR" },
    { id: "r2", from: "JFK", to: "NRT" },
    { id: "r3", from: "JFK", to: "GRU" },
  ],

  multiLegWaypoints: ["LAX", "HNL", "NRT", "SIN", "DXB"],

  color: "#0057b8",
  width: 2,
  opacity: 0.7,
  lineStyle: "solid",
  npoints: 100,
  showAirports: true,
  showLabel: true,
  labelPosition: "top",
  interactive: true,
  hoverEffect: true,
  tripType: "one-way",

  animate: false,
  animateDuration: 4000,
  animateLoop: true,
  animateRoundTrip: false,
  animateIconSize: 24,
};

/**
 * Parse a user-entered airport string. Accepts IATA codes ("TPE", "lax"),
 * ICAO codes ("KJFK", "EGLL", "KDOV"), or comma-separated coordinates
 * ("121.5, 25"). Returns the string uppercased so the resolver in
 * airportIndex.ts can look it up in either the IATA or ICAO table, or a
 * [lng, lat] tuple for raw coordinates.
 */
export function parseAirportRef(input: string): string | [number, number] {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  // Coordinate pair: "lng,lat" or "lng lat"
  const parts = trimmed.split(/[,\s]+/).filter(Boolean);
  if (parts.length === 2 && parts.every((p) => !isNaN(Number(p)))) {
    return [Number(parts[0]), Number(parts[1])] as [number, number];
  }
  return trimmed.toUpperCase();
}
