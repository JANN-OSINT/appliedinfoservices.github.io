import { useState, type RefObject } from "react";
import { toPng } from "html-to-image";

type Props = {
  stageRef: RefObject<HTMLDivElement>;
};

/**
 * Exports the current map stage (WebGL canvas + React-managed DOM markers
 * and labels) as a composited PNG. Requires the underlying maplibre-gl Map
 * to have been created with `preserveDrawingBuffer: true` (passed through
 * from MapStage) so the canvas can be read back into a raster.
 */
export function ExportButton({ stageRef }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleExport = async () => {
    if (!stageRef.current || busy) return;
    setBusy(true);
    setErr(null);
    try {
      // Force MapLibre to render the next frame synchronously so the canvas
      // contents are fresh when html-to-image reads them back.
      const canvas = stageRef.current.querySelector("canvas");
      if (canvas && (canvas as any).__maplibreMap) {
        try {
          (canvas as any).__maplibreMap.triggerRepaint();
        } catch {
          /* ignore */
        }
      }
      // Small delay to let the map finish rendering after any recent state change.
      await new Promise((r) => setTimeout(r, 150));

      const dataUrl = await toPng(stageRef.current, {
        pixelRatio: 2,
        cacheBust: true,
        skipFonts: false,
      });

      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `apv-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      setErr(
        "Export failed. Some basemap tiles may be blocking cross-origin canvas reads.",
      );
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
      {err ? <span className="apv-hint" style={{ color: "#9b2c2c" }}>{err}</span> : null}
    </>
  );
}
