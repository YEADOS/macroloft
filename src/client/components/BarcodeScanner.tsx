import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

export default function BarcodeScanner({
  onScan,
  onClose,
}: {
  onScan: (code: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    let stop: (() => void) | undefined;
    let done = false;
    reader
      .decodeFromVideoDevice(undefined, videoRef.current!, (result, _err, controls) => {
        stop = () => controls.stop();
        if (result && !done) {
          done = true;
          controls.stop();
          onScan(result.getText());
        }
      })
      .catch((e) => {
        setError(
          window.isSecureContext
            ? `Camera error: ${e.message}`
            : "Camera needs HTTPS — open the app via its tailscale-serve URL.",
        );
      });
    return () => stop?.();
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90">
      <div className="flex items-center justify-between p-4">
        <span className="plaque !text-white">Scan barcode</span>
        <button onClick={onClose} className="plaque !text-white">
          ✕ Close
        </button>
      </div>
      {error ? (
        <div className="m-6 border rule p-4 font-mono text-sm text-amber">{error}</div>
      ) : (
        <div className="relative mx-auto w-full max-w-md flex-1">
          <video ref={videoRef} className="h-full w-full object-cover" />
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 h-32 w-64 -translate-x-1/2 -translate-y-1/2"
            style={{ border: "2px solid var(--accent)", boxShadow: "0 0 20px rgba(232,161,61,.4)" }}
          />
        </div>
      )}
    </div>
  );
}
