import { useEffect, useMemo, type MutableRefObject } from "react";
import type MapLibreGL from "maplibre-gl";
import { Map as MapLibreMap, MapControls, type MapViewport } from "@/components/ui/map";
import {
  FlightAirport,
  FlightRoute,
  FlightRoutes,
  FlightMultiRoute,
  type FlightRouteData,
} from "@/components/ui/flight";
import type { AirportRef } from "@/components/ui/flight-airports";
import { parseAirportRef, type AppConfig } from "@/lib/config";
import {
  resolveAirportCode,
  toLngLat,
  type ResolvedAirport,
} from "@/lib/airportIndex";

const BASEMAPS: Record<
  Exclude<AppConfig["basemap"], "custom">,
  { light: string; dark: string }
> = {
  "carto-positron": {
    light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
    dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  },
  "carto-dark-matter": {
    light: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
    dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  },
  "carto-voyager": {
    light: "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
    dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  },
};

/**
 * A route endpoint, after resolution. We carry both the `[lng, lat]` tuple
 * (used as the flightcn `AirportRef`) and, when the input resolved to a
 * known code, the full airport record — so we can render our own labeled
 * marker with the military base or ICAO-only airport name.
 */
type Endpoint = {
  ref: AirportRef;
  airport?: ResolvedAirport;
};

/**
 * Resolve a user-entered token into a route endpoint. Accepts:
 *   - IATA codes ("LAX", "JFK")
 *   - ICAO codes ("KJFK", "KDOV", "EGLL")
 *   - Coordinate pairs ("121.5, 25")
 *
 * Returns null for partial / unrecognized input so the render loop doesn't
 * thrash while the user is mid-typing.
 */
function resolveEndpoint(input: string): Endpoint | null {
  const parsed = parseAirportRef(input);
  if (Array.isArray(parsed)) {
    return { ref: parsed };
  }
  if (typeof parsed !== "string" || parsed.length === 0) return null;
  const resolved = resolveAirportCode(parsed);
  if (!resolved) return null;
  return { ref: toLngLat(resolved), airport: resolved };
}

type Props = {
  config: AppConfig;
  onConfigChange: (config: AppConfig) => void;
  onError: (err: string | null) => void;
  /** Exposes the underlying MapLibre instance to the parent so the export
   *  flow can read the GL canvas directly. */
  mapRef?: MutableRefObject<MapLibreGL.Map | null>;
};

export function MapStage({ config, onConfigChange, onError, mapRef }: Props) {
  const mapStyles = useMemo(() => {
    if (config.basemap === "custom" && config.customStyleUrl) {
      return { light: config.customStyleUrl, dark: config.customStyleUrl };
    }
    return BASEMAPS[config.basemap as keyof typeof BASEMAPS] ?? BASEMAPS["carto-positron"];
  }, [config.basemap, config.customStyleUrl]);

  const projection = useMemo(
    () =>
      config.projection === "globe"
        ? ({ type: "globe" } as const)
        : ({ type: "mercator" } as const),
    [config.projection],
  );

  const animate = useMemo(
    () =>
      config.animate
        ? {
            duration: config.animateDuration,
            loop: config.animateLoop,
            roundTrip: config.animateRoundTrip,
            iconSize: config.animateIconSize,
          }
        : false,
    [
      config.animate,
      config.animateDuration,
      config.animateLoop,
      config.animateRoundTrip,
      config.animateIconSize,
    ],
  );

  // Props shared across every flight component. We suppress flightcn's
  // built-in airport markers (`showAirports: false`) and render our own
  // below — flightcn only knows the 515 bundled civilian airports, so its
  // built-in labels would be empty for military bases and ICAO-only fields.
  const sharedRouteProps = useMemo(
    () => ({
      color: config.color,
      width: config.width,
      opacity: config.opacity,
      lineStyle: config.lineStyle,
      npoints: config.npoints,
      showAirports: false,
      interactive: config.interactive,
      hoverEffect: config.hoverEffect,
      tripType: config.tripType,
      animate,
    }),
    [
      config.color,
      config.width,
      config.opacity,
      config.lineStyle,
      config.npoints,
      config.interactive,
      config.hoverEffect,
      config.tripType,
      animate,
    ],
  );

  // Resolve the route endpoints + collect every referenced airport so we can
  // render labeled markers for all of them, including military bases and
  // ICAO-only airfields that flightcn's bundled dictionary doesn't know about.
  const { flightLayer, markerAirports } = useMemo<{
    flightLayer: JSX.Element | null;
    markerAirports: ResolvedAirport[];
  }>(() => {
    const seen = new Map<string, ResolvedAirport>();
    const pushMarker = (a?: ResolvedAirport) => {
      if (!a) return;
      const key = a.icao ?? a.iata ?? `${a.longitude},${a.latitude}`;
      if (!seen.has(key)) seen.set(key, a);
    };

    try {
      if (config.mode === "single") {
        const from = resolveEndpoint(config.singleFrom);
        const to = resolveEndpoint(config.singleTo);
        if (!from || !to) return { flightLayer: null, markerAirports: [] };
        pushMarker(from.airport);
        pushMarker(to.airport);
        return {
          flightLayer: (
            <FlightRoute from={from.ref} to={to.ref} {...sharedRouteProps} />
          ),
          markerAirports: Array.from(seen.values()),
        };
      }

      if (config.mode === "multi") {
        const routes: FlightRouteData[] = [];
        for (const r of config.multiRoutes) {
          const from = resolveEndpoint(r.from);
          const to = resolveEndpoint(r.to);
          if (!from || !to) continue;
          pushMarker(from.airport);
          pushMarker(to.airport);
          routes.push({
            from: from.ref,
            to: to.ref,
            color: r.color,
            width: r.width,
            opacity: r.opacity,
            lineStyle: r.lineStyle,
            tripType: r.tripType,
          });
        }
        if (routes.length === 0)
          return { flightLayer: null, markerAirports: [] };
        return {
          flightLayer: (
            <FlightRoutes routes={routes} {...sharedRouteProps} />
          ),
          markerAirports: Array.from(seen.values()),
        };
      }

      // multi-leg
      const waypointRefs: AirportRef[] = [];
      for (const w of config.multiLegWaypoints) {
        const ep = resolveEndpoint(w);
        if (!ep) continue;
        waypointRefs.push(ep.ref);
        pushMarker(ep.airport);
      }
      if (waypointRefs.length < 2)
        return { flightLayer: null, markerAirports: [] };
      return {
        flightLayer: (
          <FlightMultiRoute
            waypoints={waypointRefs}
            {...sharedRouteProps}
          />
        ),
        markerAirports: Array.from(seen.values()),
      };
    } catch {
      return { flightLayer: null, markerAirports: [] };
    }
  }, [
    config.mode,
    config.singleFrom,
    config.singleTo,
    config.multiRoutes,
    config.multiLegWaypoints,
    sharedRouteProps,
  ]);

  // Surface "no valid routes" as a user-facing hint without spamming
  // setState during render.
  useEffect(() => {
    if (flightLayer == null) {
      onError(
        config.mode === "multi-leg"
          ? "Enter at least two valid airport codes (IATA, ICAO, or lng,lat) to draw a multi-leg journey."
          : "Enter valid airport codes (e.g. LAX, KJFK, KDOV) or lng,lat coordinates to draw a route.",
      );
    } else {
      onError(null);
    }
  }, [flightLayer, config.mode, onError]);

  const handleViewportChange = (vp: MapViewport) => {
    onConfigChange({ ...config, viewport: vp });
  };

  return (
    <MapLibreMap
      ref={mapRef}
      className="size-full"
      theme={config.theme}
      styles={mapStyles}
      projection={projection}
      viewport={config.viewport}
      onViewportChange={handleViewportChange}
      // @ts-expect-error — MapLibre WebGL option, valid at runtime, required for canvas export
      preserveDrawingBuffer={true}
    >
      {config.showMapControls ? <MapControls /> : null}
      {flightLayer}
      {config.showAirports &&
        markerAirports.map((a) => (
          <FlightAirport
            key={a.icao ?? a.iata ?? `${a.longitude},${a.latitude}`}
            longitude={a.longitude}
            latitude={a.latitude}
            name={a.code}
            showLabel={config.showLabel}
            labelPosition={config.labelPosition}
          />
        ))}
    </MapLibreMap>
  );
}
