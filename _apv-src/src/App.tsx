import { useMemo, useRef, useState } from "react";
import type MapLibreGL from "maplibre-gl";
import { MapStage } from "./components/MapStage";
import { ControlPanel } from "./components/ControlPanel";
import { ExportButton } from "./components/ExportButton";
import { DEFAULT_CONFIG, type AppConfig } from "./lib/config";
import { useDebounced } from "./lib/useDebounced";

export default function App() {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const stageRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreGL.Map | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  // Debounce the heavy parts (routes, colors, animation) but keep viewport
  // and theme live so panning/zooming the map stays responsive.
  const debouncedConfig = useDebounced(config, 200);
  const mapConfig = useMemo<AppConfig>(
    () => ({
      ...debouncedConfig,
      // These three must be instant: panning, theme flips, and control
      // visibility should not wait 200ms.
      viewport: config.viewport,
      theme: config.theme,
      showMapControls: config.showMapControls,
    }),
    [debouncedConfig, config.viewport, config.theme, config.showMapControls],
  );

  return (
    <div className="apv-layout">
      <div className="apv-stage" ref={stageRef}>
        <MapStage
          config={mapConfig}
          onConfigChange={setConfig}
          onError={setLastError}
          mapRef={mapRef}
        />
      </div>

      <div className="apv-actions">
        <ExportButton stageRef={stageRef} mapRef={mapRef} />
        <button
          type="button"
          className="apv-btn apv-btn-ghost"
          onClick={() => setConfig(DEFAULT_CONFIG)}
        >
          Reset to defaults
        </button>
      </div>

      {lastError ? <div className="apv-error">{lastError}</div> : null}

      <ControlPanel config={config} onChange={setConfig} />
    </div>
  );
}
