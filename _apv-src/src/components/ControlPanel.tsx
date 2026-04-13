import { airports } from "@/components/ui/flight-airports";
import type { AppConfig, FlightMode, LineStyle, TripType, BasemapKind, MapTheme, ProjectionKind, RouteEntry } from "@/lib/config";

type Props = {
  config: AppConfig;
  onChange: (config: AppConfig) => void;
};

/** Airport datalist — rendered once and referenced by id from every input. */
function AirportDatalist() {
  const codes = Object.keys(airports).sort();
  return (
    <datalist id="apv-airport-list">
      {codes.map((code) => {
        const a = airports[code];
        return (
          <option key={code} value={code}>
            {a.name} — {a.city}, {a.country}
          </option>
        );
      })}
    </datalist>
  );
}

function Range({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="apv-field">
      <span className="apv-label">{label}</span>
      <div className="apv-range-row">
        <input
          type="range"
          min={min}
          max={max}
          step={step ?? 1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <output>
          {value}
          {suffix ?? ""}
        </output>
      </div>
    </div>
  );
}

function Switch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="apv-switch">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

function Select<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="apv-field">
      <span className="apv-label">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function AirportInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="apv-field">
      <span className="apv-label">{label}</span>
      <input
        type="text"
        list="apv-airport-list"
        value={value}
        placeholder={placeholder ?? "IATA code or lng,lat"}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

const LINE_STYLES: readonly { value: LineStyle; label: string }[] = [
  { value: "solid", label: "Solid" },
  { value: "dash", label: "Dashed" },
  { value: "dot", label: "Dotted" },
];

const TRIP_TYPES: readonly { value: TripType; label: string }[] = [
  { value: "one-way", label: "One-way" },
  { value: "round-trip", label: "Round-trip" },
];

const THEMES: readonly { value: MapTheme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const PROJECTIONS: readonly { value: ProjectionKind; label: string }[] = [
  { value: "mercator", label: "Mercator (2D)" },
  { value: "globe", label: "Globe (3D)" },
];

const BASEMAPS: readonly { value: BasemapKind; label: string }[] = [
  { value: "carto-positron", label: "CARTO Positron" },
  { value: "carto-dark-matter", label: "CARTO Dark Matter" },
  { value: "carto-voyager", label: "CARTO Voyager" },
  { value: "custom", label: "Custom style URL" },
];

const LABEL_POSITIONS = [
  { value: "top" as const, label: "Top" },
  { value: "bottom" as const, label: "Bottom" },
];

export function ControlPanel({ config, onChange }: Props) {
  const set = <K extends keyof AppConfig>(key: K, value: AppConfig[K]) =>
    onChange({ ...config, [key]: value });

  const setViewport = (patch: Partial<AppConfig["viewport"]>) =>
    onChange({ ...config, viewport: { ...config.viewport, ...patch } });

  const updateRoute = (id: string, patch: Partial<RouteEntry>) =>
    onChange({
      ...config,
      multiRoutes: config.multiRoutes.map((r) =>
        r.id === id ? { ...r, ...patch } : r,
      ),
    });

  const addRoute = () =>
    onChange({
      ...config,
      multiRoutes: [
        ...config.multiRoutes,
        {
          id: `r${Date.now()}`,
          from: "",
          to: "",
        },
      ],
    });

  const removeRoute = (id: string) =>
    onChange({
      ...config,
      multiRoutes: config.multiRoutes.filter((r) => r.id !== id),
    });

  const updateWaypoint = (idx: number, value: string) =>
    onChange({
      ...config,
      multiLegWaypoints: config.multiLegWaypoints.map((w, i) =>
        i === idx ? value : w,
      ),
    });

  const addWaypoint = () =>
    onChange({
      ...config,
      multiLegWaypoints: [...config.multiLegWaypoints, ""],
    });

  const removeWaypoint = (idx: number) =>
    onChange({
      ...config,
      multiLegWaypoints: config.multiLegWaypoints.filter((_, i) => i !== idx),
    });

  return (
    <>
      <AirportDatalist />

      {/* Mode selector */}
      <div className="apv-mode-tabs" role="tablist">
        {(["single", "multi", "multi-leg"] as FlightMode[]).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={config.mode === m}
            className={config.mode === m ? "active" : ""}
            onClick={() => set("mode", m)}
          >
            {m === "single"
              ? "Single route"
              : m === "multi"
                ? "Multiple routes"
                : "Multi-leg journey"}
          </button>
        ))}
      </div>

      {/* Route definition */}
      <div className="apv-panel">
        <h3>Route</h3>

        {config.mode === "single" ? (
          <div className="apv-grid">
            <AirportInput
              label="From"
              value={config.singleFrom}
              onChange={(v) => set("singleFrom", v)}
            />
            <AirportInput
              label="To"
              value={config.singleTo}
              onChange={(v) => set("singleTo", v)}
            />
          </div>
        ) : null}

        {config.mode === "multi" ? (
          <div className="apv-route-rows">
            {config.multiRoutes.map((r) => (
              <div key={r.id} className="apv-route-row">
                <AirportInput
                  label="From"
                  value={r.from}
                  onChange={(v) => updateRoute(r.id, { from: v })}
                />
                <AirportInput
                  label="To"
                  value={r.to}
                  onChange={(v) => updateRoute(r.id, { to: v })}
                />
                <button
                  type="button"
                  className="apv-remove"
                  onClick={() => removeRoute(r.id)}
                  aria-label={`Remove route ${r.from} → ${r.to}`}
                >
                  ×
                </button>
              </div>
            ))}
            <button type="button" className="apv-btn apv-btn-ghost" onClick={addRoute}>
              + Add route
            </button>
          </div>
        ) : null}

        {config.mode === "multi-leg" ? (
          <div className="apv-route-rows">
            {config.multiLegWaypoints.map((w, i) => (
              <div key={i} className="apv-route-row">
                <AirportInput
                  label={`Waypoint ${i + 1}`}
                  value={w}
                  onChange={(v) => updateWaypoint(i, v)}
                />
                <div />
                <button
                  type="button"
                  className="apv-remove"
                  onClick={() => removeWaypoint(i)}
                  aria-label={`Remove waypoint ${i + 1}`}
                >
                  ×
                </button>
              </div>
            ))}
            <button type="button" className="apv-btn apv-btn-ghost" onClick={addWaypoint}>
              + Add waypoint
            </button>
            <div className="apv-hint">Minimum 2 waypoints required to draw a multi-leg journey.</div>
          </div>
        ) : null}
      </div>

      {/* Render options */}
      <div className="apv-panel">
        <h3>Appearance</h3>
        <div className="apv-grid">
          <div className="apv-field">
            <span className="apv-label">Color</span>
            <input
              type="color"
              value={config.color}
              onChange={(e) => set("color", e.target.value)}
            />
          </div>
          <Range
            label="Line width"
            value={config.width}
            min={1}
            max={10}
            onChange={(v) => set("width", v)}
          />
          <Range
            label="Opacity"
            value={config.opacity}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) => set("opacity", v)}
          />
          <Select
            label="Line style"
            value={config.lineStyle}
            options={LINE_STYLES}
            onChange={(v) => set("lineStyle", v)}
          />
          <Range
            label="Arc resolution (npoints)"
            value={config.npoints}
            min={10}
            max={400}
            onChange={(v) => set("npoints", v)}
          />
          <Select
            label="Trip type"
            value={config.tripType}
            options={TRIP_TYPES}
            onChange={(v) => set("tripType", v)}
          />
          <div className="apv-field">
            <span className="apv-label">Airport display</span>
            <Switch
              label="Show airports"
              checked={config.showAirports}
              onChange={(v) => set("showAirports", v)}
            />
            <Switch
              label="Show labels"
              checked={config.showLabel}
              onChange={(v) => set("showLabel", v)}
            />
          </div>
          <Select
            label="Label position"
            value={config.labelPosition}
            options={LABEL_POSITIONS}
            onChange={(v) => set("labelPosition", v)}
          />
          <div className="apv-field">
            <span className="apv-label">Interaction</span>
            <Switch
              label="Interactive"
              checked={config.interactive}
              onChange={(v) => set("interactive", v)}
            />
            <Switch
              label="Hover effect"
              checked={config.hoverEffect}
              onChange={(v) => set("hoverEffect", v)}
            />
          </div>
        </div>
      </div>

      {/* Animation */}
      <div className="apv-panel">
        <h3>Animation</h3>
        <div className="apv-grid">
          <div className="apv-field">
            <span className="apv-label">Animate</span>
            <Switch
              label="Enable animation"
              checked={config.animate}
              onChange={(v) => set("animate", v)}
            />
          </div>
          <Range
            label="Duration (ms)"
            value={config.animateDuration}
            min={500}
            max={10000}
            step={100}
            suffix="ms"
            onChange={(v) => set("animateDuration", v)}
          />
          <Range
            label="Icon size"
            value={config.animateIconSize}
            min={8}
            max={64}
            suffix="px"
            onChange={(v) => set("animateIconSize", v)}
          />
          <div className="apv-field">
            <span className="apv-label">Playback</span>
            <Switch
              label="Loop"
              checked={config.animateLoop}
              onChange={(v) => set("animateLoop", v)}
            />
            <Switch
              label="Round trip"
              checked={config.animateRoundTrip}
              onChange={(v) => set("animateRoundTrip", v)}
            />
          </div>
        </div>
      </div>

      {/* Map settings */}
      <div className="apv-panel">
        <h3>Map</h3>
        <div className="apv-grid">
          <Select
            label="Theme"
            value={config.theme}
            options={THEMES}
            onChange={(v) => set("theme", v)}
          />
          <Select
            label="Projection"
            value={config.projection}
            options={PROJECTIONS}
            onChange={(v) => set("projection", v)}
          />
          <Select
            label="Basemap"
            value={config.basemap}
            options={BASEMAPS}
            onChange={(v) => set("basemap", v)}
          />
          {config.basemap === "custom" ? (
            <div className="apv-field">
              <span className="apv-label">Custom style URL</span>
              <input
                type="url"
                value={config.customStyleUrl}
                placeholder="https://example.com/style.json"
                onChange={(e) => set("customStyleUrl", e.target.value)}
              />
              <div className="apv-hint">Must be a valid MapLibre style JSON URL.</div>
            </div>
          ) : null}
          <div className="apv-field">
            <span className="apv-label">Controls</span>
            <Switch
              label="Show zoom / compass / fullscreen"
              checked={config.showMapControls}
              onChange={(v) => set("showMapControls", v)}
            />
          </div>
          <div className="apv-field">
            <span className="apv-label">Longitude</span>
            <input
              type="number"
              step={0.5}
              value={config.viewport.center[0]}
              onChange={(e) =>
                setViewport({
                  center: [Number(e.target.value), config.viewport.center[1]],
                })
              }
            />
          </div>
          <div className="apv-field">
            <span className="apv-label">Latitude</span>
            <input
              type="number"
              step={0.5}
              value={config.viewport.center[1]}
              onChange={(e) =>
                setViewport({
                  center: [config.viewport.center[0], Number(e.target.value)],
                })
              }
            />
          </div>
          <Range
            label="Zoom"
            value={config.viewport.zoom}
            min={0}
            max={22}
            step={0.1}
            onChange={(v) => setViewport({ zoom: v })}
          />
          <Range
            label="Bearing"
            value={config.viewport.bearing}
            min={-180}
            max={180}
            step={1}
            suffix="°"
            onChange={(v) => setViewport({ bearing: v })}
          />
          <Range
            label="Pitch"
            value={config.viewport.pitch}
            min={0}
            max={85}
            step={1}
            suffix="°"
            onChange={(v) => setViewport({ pitch: v })}
          />
        </div>
      </div>
    </>
  );
}
