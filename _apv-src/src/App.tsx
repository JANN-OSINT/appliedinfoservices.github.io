import { useRef, useState } from "react";
import { MapStage } from "./components/MapStage";
import { ControlPanel } from "./components/ControlPanel";
import { ExportButton } from "./components/ExportButton";
import { DEFAULT_CONFIG, type AppConfig } from "./lib/config";

export default function App() {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const stageRef = useRef<HTMLDivElement>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  return (
    <div className="apv-layout">
      <div className="apv-stage" ref={stageRef}>
        <MapStage config={config} onConfigChange={setConfig} onError={setLastError} />
      </div>

      <div className="apv-actions">
        <ExportButton stageRef={stageRef} />
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
