import { useEffect, useMemo } from "react";
import { Map, MapControls, type MapViewport } from "@/components/ui/map";
import {
  FlightRoute,
  FlightRoutes,
  FlightMultiRoute,
  type FlightRouteData,
} from "@/components/ui/flight";
import { airports, type AirportRef } from "@/components/ui/flight-airports";
import { parseAirportRef, type AppConfig } from "@/lib/config";

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
 * Only accept airport refs that are fully resolvable — a coordinate tuple,
 * or an IATA code that exists in the bundled dataset. Partial/invalid
 * entries are skipped silently instead of thrashing the render loop.
 */
function toValidRef(input: string): AirportRef | null {
  const parsed = parseAirportRef(input);
  if (Array.isArray(parsed)) return parsed;
  if (typeof parsed === "string" && parsed.length === 3 && airports[parsed]) {
    return parsed;
  }
  return null;
}

type Props = {
  config: AppConfig;
  onConfigChange: (config: AppConfig) => void;
  onError: (err: string | null) => void;
};

export function MapStage({ config, onConfigChange, onError }: Props) {
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

  const sharedRouteProps = useMemo(
    () => ({
      color: config.color,
      width: config.width,
      opacity: config.opacity,
      lineStyle: config.lineStyle,
      npoints: config.npoints,
      showAirports: config.showAirports,
      showLabel: config.showLabel,
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
      config.showAirports,
      config.showLabel,
      config.interactive,
      config.hoverEffect,
      config.tripType,
      animate,
    ],
  );

  // Resolve the flight layer off the render hot path. Only fully valid
  // airport refs make it through; partial/invalid inputs are dropped
  // silently so typing "L" → "LA" → "LAX" doesn't thrash MapLibre.
  const flightLayer = useMemo<JSX.Element | null>(() => {
    try {
      if (config.mode === "single") {
        const from = toValidRef(config.singleFrom);
        const to = toValidRef(config.singleTo);
        if (!from || !to) return null;
        return <FlightRoute from={from} to={to} {...sharedRouteProps} />;
      }

      if (config.mode === "multi") {
        const routes: FlightRouteData[] = [];
        for (const r of config.multiRoutes) {
          const from = toValidRef(r.from);
          const to = toValidRef(r.to);
          if (!from || !to) continue;
          routes.push({
            from,
            to,
            color: r.color,
            width: r.width,
            opacity: r.opacity,
            lineStyle: r.lineStyle,
            tripType: r.tripType,
          });
        }
        if (routes.length === 0) return null;
        return <FlightRoutes routes={routes} {...sharedRouteProps} />;
      }

      // multi-leg
      const waypoints: AirportRef[] = [];
      for (const w of config.multiLegWaypoints) {
        const ref = toValidRef(w);
        if (ref) waypoints.push(ref);
      }
      if (waypoints.length < 2) return null;
      return <FlightMultiRoute waypoints={waypoints} {...sharedRouteProps} />;
    } catch {
      return null;
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
          ? "Enter at least two valid airport codes to draw a multi-leg journey."
          : "Enter valid airport codes (e.g. LAX, TPE) or lng,lat coordinates to draw a route.",
      );
    } else {
      onError(null);
    }
  }, [flightLayer, config.mode, onError]);

  const handleViewportChange = (vp: MapViewport) => {
    onConfigChange({ ...config, viewport: vp });
  };

  return (
    <Map
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
    </Map>
  );
}
