import { useState, type MutableRefObject, type RefObject } from "react";
import type MapLibreGL from "maplibre-gl";
import type { AppConfig, MapTheme } from "@/lib/config";
import type { ResolvedAirport } from "@/lib/airportIndex";

type Props = {
  stageRef: RefObject<HTMLDivElement>;
  mapRef: MutableRefObject<MapLibreGL.Map | null>;
  markerAirportsRef: MutableRefObject<ResolvedAirport[]>;
  config: AppConfig;
};

/**
 * Exports the current APV map view as a PNG.
 *
 * This is a pure Canvas 2D composite — no `html-to-image`, no DOM-to-SVG
 * serialization, no foreignObject. The two-layer approach used previously
 * failed across browsers because (a) the stage `<div>` has an opaque CSS
 * background that obscured the GL canvas readback during compositing, and
 * (b) html-to-image can't reliably round-trip MapLibre's CSS-translate
 * marker transforms.
 *
 * The new pipeline:
 *
 *   1. Wait for MapLibre `idle` so tiles + flight-arc layers are committed.
 *   2. Read the GL backing store via `map.getCanvas().toDataURL()` —
 *      this captures basemap tiles PLUS all GL-drawn line layers
 *      (flightcn draws its route arcs into the WebGL canvas, so they come
 *      along for free). `canvasContextAttributes.preserveDrawingBuffer`
 *      is set in map.tsx so the readback returns real pixels.
 *   3. Draw the bg image onto an output canvas sized at
 *      `stage.clientWidth × stage.clientHeight × devicePixelRatio`, with
 *      `ctx.scale(dpr, dpr)` so the rest of the draw calls can use CSS px.
 *   4. For each airport in the route (via the shared `markerAirportsRef`),
 *      use `map.project([lng, lat])` to get screen pixels and draw a
 *      themed dot + optional label manually. This bypasses every failure
 *      mode of DOM serialization.
 *   5. Draw an attribution strip at the bottom-right.
 *   6. `toBlob` → object URL → `<a download>` → cleanup.
 *
 * v1 limitations:
 *   - Animated plane icon is not exported (it's a DOM marker).
 *   - MapLibre built-in controls (zoom/compass/fullscreen) are not
 *     exported — UI chrome shouldn't appear in a published map anyway.
 */

/* ── Marker visual spec ──────────────────────────────────────────
 * Mirrors flight.tsx:458–485 (the live <FlightAirport> dot):
 *   - 16 × 16 CSS px circle, border 2 px
 *   - Light theme: dark fill + white border
 *   - Dark theme:  light fill + neutral-700 border
 *   - Drop shadow: ~shadow-lg
 *
 * Label spec:
 *   - 10 px Inter / system-ui, font-weight 500
 *   - 4 px gap above or below the dot per labelPosition
 *   - Translucent text halo so labels stay legible on busy basemaps
 */
const MARKER_SIZE = 16;
const MARKER_BORDER = 2;
const LABEL_FONT_PX = 10;
const LABEL_GAP = 4;
const LABEL_HALO_STROKE = 3;

type ThemeColors = {
  fill: string;
  border: string;
  labelText: string;
  labelHalo: string;
  attributionBg: string;
  attributionText: string;
};

function colorsFor(theme: MapTheme): ThemeColors {
  return theme === "dark"
    ? {
        fill: "#f5f5f5",
        border: "#404040",
        labelText: "#f5f5f5",
        labelHalo: "rgba(0,0,0,0.70)",
        attributionBg: "rgba(0,0,0,0.55)",
        attributionText: "#f5f5f5",
      }
    : {
        fill: "#0a0a0a",
        border: "#ffffff",
        labelText: "#0a0a0a",
        labelHalo: "rgba(255,255,255,0.85)",
        attributionBg: "rgba(255,255,255,0.78)",
        attributionText: "#1a1f2e",
      };
}

const ATTRIBUTION_TEXT = "© OpenStreetMap contributors · © CARTO";
const ATTRIBUTION_FONT_PX = 10;
const ATTRIBUTION_PADDING_X = 6;
const ATTRIBUTION_PADDING_Y = 3;
const ATTRIBUTION_MARGIN = 6;

export function ExportButton({
  stageRef,
  mapRef,
  markerAirportsRef,
  config,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleExport = async () => {
    if (busy) return;
    const map = mapRef.current;
    const stage = stageRef.current;
    if (!map || !stage) {
      setErr("Map is not ready yet.");
      return;
    }

    setBusy(true);
    setErr(null);

    try {
      // 1. Wait for tiles + animations + fonts to settle.
      await waitForMapIdle(map);
      if (typeof document !== "undefined" && document.fonts?.ready) {
        try {
          await document.fonts.ready;
        } catch {
          /* non-fatal */
        }
      }
      // One extra frame so any layer added in this tick is committed
      // to the GL backing store before we read it.
      await new Promise<void>((r) => requestAnimationFrame(() => r()));

      // 2. Read the GL backing store. `preserveDrawingBuffer: true` is
      //    set in map.tsx so toDataURL returns real pixels.
      let bgDataUrl: string;
      try {
        bgDataUrl = map.getCanvas().toDataURL("image/png");
      } catch {
        throw new Error(
          "Basemap export blocked by cross-origin tile provider. " +
            "Try a different basemap style.",
        );
      }
      const bgImg = await loadImage(bgDataUrl);

      // 3. Allocate the output canvas at HiDPI resolution.
      const cssW = stage.clientWidth;
      const cssH = stage.clientHeight;
      const dpr = Math.max(1, window.devicePixelRatio || 1);

      const out = document.createElement("canvas");
      out.width = Math.max(1, Math.round(cssW * dpr));
      out.height = Math.max(1, Math.round(cssH * dpr));
      const ctx = out.getContext("2d");
      if (!ctx) throw new Error("2D canvas context unavailable");

      // After this scale, every subsequent draw call uses CSS pixels.
      ctx.scale(dpr, dpr);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      // 4. Paint the basemap + flight arcs as the background.
      //    The GL backing store is already at devicePixelRatio×,
      //    drawImage downsamples it to the CSS-pixel target cleanly.
      ctx.drawImage(bgImg, 0, 0, cssW, cssH);

      // 5. Draw markers + labels manually.
      const colors = colorsFor(config.theme);

      if (config.showAirports) {
        const markers = markerAirportsRef.current ?? [];
        for (const a of markers) {
          let pt: { x: number; y: number };
          try {
            pt = map.project([a.longitude, a.latitude]);
          } catch {
            continue;
          }
          if (
            !Number.isFinite(pt.x) ||
            !Number.isFinite(pt.y) ||
            pt.x < -MARKER_SIZE ||
            pt.y < -MARKER_SIZE ||
            pt.x > cssW + MARKER_SIZE ||
            pt.y > cssH + MARKER_SIZE
          ) {
            continue;
          }

          drawMarkerDot(ctx, pt.x, pt.y, colors);
          if (config.showLabel) {
            drawMarkerLabel(
              ctx,
              a.code,
              pt.x,
              pt.y,
              config.labelPosition,
              colors,
            );
          }
        }
      }

      // 6. Attribution strip, bottom-right.
      drawAttribution(ctx, cssW, cssH, colors);

      // 7. Encode + download.
      const blob = await new Promise<Blob | null>((resolve) =>
        out.toBlob(resolve, "image/png"),
      );
      if (!blob) throw new Error("PNG encoding failed");

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `apv-${new Date()
        .toISOString()
        .replace(/[:.]/g, "-")}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      const msg =
        error instanceof Error
          ? error.message
          : "Export failed. Some basemap tiles may be blocking cross-origin canvas reads.";
      setErr(msg);
      // eslint-disable-next-line no-console
      console.error("APV export error", error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="apv-btn"
        onClick={handleExport}
        disabled={busy}
        title="Export the current map view as a PNG"
      >
        {busy ? "Exporting…" : "Export PNG"}
      </button>
      {err ? (
        <span className="apv-hint" style={{ color: "#9b2c2c" }}>
          {err}
        </span>
      ) : null}
    </>
  );
}

/* ── helpers ─────────────────────────────────────────────────── */

/**
 * Resolves when the map is fully rendered and quiet. Has a safety timeout
 * because `idle` occasionally doesn't fire when the user clicks Export
 * mid-projection-swap or during a style reload — better a slightly early
 * export than a hung UI.
 */
function waitForMapIdle(map: MapLibreGL.Map): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };

    if (map.loaded() && !map.isMoving() && !map.isZooming()) {
      map.once("idle", finish);
      setTimeout(finish, 2000);
    } else {
      map.once("idle", finish);
      setTimeout(finish, 4000);
    }
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image decode failed"));
    img.src = src;
  });
}

function drawMarkerDot(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  colors: ThemeColors,
) {
  const r = MARKER_SIZE / 2;
  const innerR = r - MARKER_BORDER / 2;

  ctx.save();

  // Shadow under the dot (~Tailwind shadow-lg).
  ctx.shadowColor = "rgba(0,0,0,0.30)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 2;

  ctx.beginPath();
  ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
  ctx.fillStyle = colors.fill;
  ctx.fill();

  // Strip shadow off the stroke so the border stays crisp.
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  ctx.lineWidth = MARKER_BORDER;
  ctx.strokeStyle = colors.border;
  ctx.stroke();

  ctx.restore();
}

function drawMarkerLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  position: "top" | "bottom",
  colors: ThemeColors,
) {
  ctx.save();
  ctx.font = `500 ${LABEL_FONT_PX}px Inter, system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textAlign = "center";

  let baselineY: number;
  if (position === "top") {
    ctx.textBaseline = "alphabetic";
    baselineY = cy - MARKER_SIZE / 2 - LABEL_GAP;
  } else {
    ctx.textBaseline = "top";
    baselineY = cy + MARKER_SIZE / 2 + LABEL_GAP;
  }

  // Halo first (thick translucent stroke), then fill on top.
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  ctx.lineWidth = LABEL_HALO_STROKE;
  ctx.strokeStyle = colors.labelHalo;
  ctx.strokeText(text, cx, baselineY);

  ctx.fillStyle = colors.labelText;
  ctx.fillText(text, cx, baselineY);

  ctx.restore();
}

function drawAttribution(
  ctx: CanvasRenderingContext2D,
  cssW: number,
  cssH: number,
  colors: ThemeColors,
) {
  ctx.save();
  ctx.font = `400 ${ATTRIBUTION_FONT_PX}px Inter, system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  const metrics = ctx.measureText(ATTRIBUTION_TEXT);
  const textW = Math.ceil(metrics.width);
  const stripH = ATTRIBUTION_FONT_PX + ATTRIBUTION_PADDING_Y * 2;
  const stripW = textW + ATTRIBUTION_PADDING_X * 2;
  const stripX = cssW - stripW - ATTRIBUTION_MARGIN;
  const stripY = cssH - stripH - ATTRIBUTION_MARGIN;

  ctx.fillStyle = colors.attributionBg;
  ctx.fillRect(stripX, stripY, stripW, stripH);

  ctx.fillStyle = colors.attributionText;
  ctx.fillText(
    ATTRIBUTION_TEXT,
    stripX + ATTRIBUTION_PADDING_X,
    stripY + ATTRIBUTION_PADDING_Y + ATTRIBUTION_FONT_PX - 1,
  );

  ctx.restore();
}
