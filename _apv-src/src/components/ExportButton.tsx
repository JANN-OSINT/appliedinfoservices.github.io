import { useState, type MutableRefObject, type RefObject } from "react";
import type MapLibreGL from "maplibre-gl";
import { toPng } from "html-to-image";

type Props = {
  stageRef: RefObject<HTMLDivElement>;
  mapRef: MutableRefObject<MapLibreGL.Map | null>;
};

/**
 * Exports the current map stage as a composited PNG. Uses a two-layer
 * capture because MapLibre's WebGL canvas doesn't round-trip through
 * html-to-image's SVG-foreignObject serializer reliably:
 *
 *   1. Read the GL canvas directly via `map.getCanvas().toDataURL()` —
 *      this captures the basemap tiles plus any GL layers (flightcn draws
 *      its route arcs as `line` layers, so they're included for free).
 *   2. Capture the DOM overlay (airport markers, labels, animated plane
 *      icon, map controls, attribution) with html-to-image, filtering
 *      out the GL canvas so it doesn't get drawn into a blank square.
 *   3. Composite both onto a single output canvas at the stage's
 *      dimensions × devicePixelRatio and download it.
 *
 * The map is passed `preserveDrawingBuffer: true` in MapStage so the GL
 * backing store is readable at the moment we call toDataURL.
 */
export function ExportButton({ stageRef, mapRef }: Props) {
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
      // 1. Wait for any in-flight tile loads / camera animation to settle.
      await new Promise<void>((resolve) => {
        if (map.loaded() && !map.isMoving() && !map.isZooming()) {
          resolve();
        } else {
          map.once("idle", () => resolve());
        }
      });

      // 2. Force a fresh render and read the GL canvas synchronously inside
      //    MapLibre's `render` event — this fires after the GL paint but
      //    before the browser buffer swap, so toDataURL() is guaranteed to
      //    see actual pixel data even when preserveDrawingBuffer is true.
      //    A 5-second timeout guards against maps that never re-render
      //    (e.g. fully static with no tiles in flight).
      const bgDataUrl = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Map render timed out — try again.")),
          5000,
        );
        map.once("render", () => {
          clearTimeout(timer);
          try {
            resolve(map.getCanvas().toDataURL("image/png"));
          } catch {
            reject(
              new Error(
                "Basemap export blocked by cross-origin tile provider. " +
                  "Try a different basemap style.",
              ),
            );
          }
        });
        map.triggerRepaint();
      });

      // 4. Capture the DOM overlay (markers, labels, controls). Filter
      //    out every <canvas> — we have our own basemap readback, and
      //    leaving the GL canvas in would just draw a blank rectangle
      //    over our basemap during compositing.
      const pixelRatio = window.devicePixelRatio || 2;
      const fgDataUrl = await toPng(stage, {
        filter: (node) =>
          !(node instanceof HTMLElement) || node.tagName !== "CANVAS",
        pixelRatio,
        cacheBust: true,
        backgroundColor: undefined,
      });

      // 5. Composite bg + fg onto a single output canvas.
      const w = stage.clientWidth;
      const h = stage.clientHeight;
      const out = document.createElement("canvas");
      out.width = Math.max(1, Math.round(w * pixelRatio));
      out.height = Math.max(1, Math.round(h * pixelRatio));
      const ctx = out.getContext("2d");
      if (!ctx) throw new Error("2D canvas context unavailable");

      const loadImg = (src: string) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error("Image decode failed"));
          img.src = src;
        });

      const [bg, fg] = await Promise.all([
        loadImg(bgDataUrl),
        loadImg(fgDataUrl),
      ]);
      ctx.drawImage(bg, 0, 0, out.width, out.height);
      ctx.drawImage(fg, 0, 0, out.width, out.height);

      // 6. Download as PNG.
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
