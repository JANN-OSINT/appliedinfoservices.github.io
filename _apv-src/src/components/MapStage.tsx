import { useMemo } from "react";
import { Map, MapControls, type MapViewport } from "@/components/ui/map";
import {
  FlightRoute,
  FlightRoutes,
  FlightMultiRoute,
  type FlightRouteData,
} from "@/components/ui/flight";
import type { AirportRef } from "@/components/ui/flight-airports";
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

type Props = {
  config: AppConfig;
  onConfigChange: (config: AppConfig) => void;
  onError: (err: string | null) => void;
};

export function MapStage({ config, onConfigChange, onError }: Props) {
  const mapStyles = useMemo(() => {
    if (config.basemap === "custom" && config.customStyleUrl) {
      return {
        light: config.customStyleUrl,
        dark: config.customStyleUrl,
      };
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

  const animate = config.animate
    ? {
        duration: config.animateDuration,
        loop: config.animateLoop,
        roundTrip: config.animateRoundTrip,
        iconSize: config.animateIconSize,
      }
    : false;

  const sharedRouteProps = {
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
  };

  // Parse all inputs up front so we can surface errors without crashing the
  // whole React tree. Any parse/resolve error is caught at the component
  // boundary and the flight layer is simply skipped.
  let flightLayer: JSX.Element | null = null;
  try {
    if (config.mode === "single") {
      const from = parseAirportRef(config.singleFrom) as AirportRef;
      const to = parseAirportRef(config.singleTo) as AirportRef;
      if (from && to) {
        flightLayer = <FlightRoute from={from} to={to} {...sharedRouteProps} />;
      }
    } else if (config.mode === "multi") {
      const routes: FlightRouteData[] = config.multiRoutes
        .filter((r) => r.from.trim() && r.to.trim())
        .map((r) => ({
          from: parseAirportRef(r.from) as AirportRef,
          to: parseAirportRef(r.to) as AirportRef,
          color: r.color,
          width: r.width,
          opacity: r.opacity,
          lineStyle: r.lineStyle,
          tripType: r.tripType,
        }));
      if (routes.length > 0) {
        flightLayer = <FlightRoutes routes={routes} {...sharedRouteProps} />;
      }
    } else {
      const waypoints = config.multiLegWaypoints
        .map((w) => parseAirportRef(w))
        .filter((w) => (typeof w === "string" ? w.length > 0 : true)) as AirportRef[];
      if (waypoints.length >= 2) {
        flightLayer = <FlightMultiRoute waypoints={waypoints} {...sharedRouteProps} />;
      }
    }
    // If we got here without throwing, clear any previous error
    // (deferred via microtask to avoid setState during render).
    queueMicrotask(() => onError(null));
  } catch (err) {
    queueMicrotask(() =>
      onError(err instanceof Error ? err.message : "Failed to resolve airports"),
    );
    flightLayer = null;
  }

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
