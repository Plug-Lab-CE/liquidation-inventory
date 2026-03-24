"use client";

import type { ItemDto } from "@/lib/api-types";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { NotFoundException } from "@zxing/library";
import { useCallback, useEffect, useRef, useState } from "react";

export function BarcodeScanModal({
  open,
  onClose,
  onFound,
}: {
  open: boolean;
  onClose: () => void;
  onFound: (item: ItemDto) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const consumedRef = useRef(false);
  const onFoundRef = useRef(onFound);
  const onCloseRef = useRef(onClose);

  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState("");
  const [camState, setCamState] = useState<"idle" | "starting" | "live" | "failed">("idle");

  onFoundRef.current = onFound;
  onCloseRef.current = onClose;

  const stopScanner = useCallback(() => {
    try {
      controlsRef.current?.stop();
    } catch {
      /* ignore */
    }
    controlsRef.current = null;
    readerRef.current = null;
  }, []);

  const lookup = useCallback(
    async (raw: string) => {
      const code = raw.trim();
      if (!code) return false;
      setBusy(true);
      setErr(null);
      const res = await fetch(`/api/items/lookup/barcode?code=${encodeURIComponent(code)}`);
      const data = await res.json().catch(() => ({}));
      setBusy(false);
      if (!res.ok) {
        setErr(typeof data.error === "string" ? data.error : "Lookup failed");
        return false;
      }
      stopScanner();
      onFoundRef.current(data.item as ItemDto);
      onCloseRef.current();
      return true;
    },
    [stopScanner],
  );

  useEffect(() => {
    if (!open) {
      stopScanner();
      consumedRef.current = false;
      setManual("");
      setErr(null);
      setBusy(false);
      setCamState("idle");
      return;
    }

    consumedRef.current = false;
    setCamState("starting");
    setErr(null);

    const video = videoRef.current;
    if (!video) {
      setCamState("failed");
      setErr("Camera preview not ready.");
      return;
    }

    const reader = new BrowserMultiFormatReader(undefined, {
      delayBetweenScanAttempts: 400,
      delayBetweenScanSuccess: 1500,
    });
    readerRef.current = reader;

    let cancelled = false;

    const start = () => {
      reader
        .decodeFromVideoDevice(undefined, video, (result, error, controls) => {
          if (cancelled) return;
          controlsRef.current = controls;
          setCamState("live");

          if (consumedRef.current) return;

          if (result) {
            consumedRef.current = true;
            void lookup(result.getText()).then((ok) => {
              if (!ok) consumedRef.current = false;
            });
            return;
          }

          if (error && !(error instanceof NotFoundException)) {
            setErr(error.message || "Scan error");
          }
        })
        .catch((e: unknown) => {
          if (cancelled) return;
          setCamState("failed");
          setErr(e instanceof Error ? e.message : "Could not open camera");
        });
    };

    const frame = requestAnimationFrame(start);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      stopScanner();
    };
  }, [open, lookup, stopScanner]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-zinc-950 p-4 text-white">
      <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Scan product barcode</h2>
        <button
          type="button"
          onClick={() => {
            stopScanner();
            onClose();
          }}
          className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium hover:bg-white/20"
        >
          Close
        </button>
      </div>

      <p className="mb-2 shrink-0 text-sm text-zinc-400">
        Point the camera at the item UPC. Matches pending lines that have a UPC on the manifest.
      </p>

      <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl bg-black">
        <video
          ref={videoRef}
          className="h-full max-h-[min(50vh,360px)] w-full object-cover sm:max-h-[min(55vh,420px)]"
          playsInline
          muted
        />
        {camState === "starting" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm">
            Starting camera…
          </div>
        )}
      </div>

      {err && (
        <p className="mt-3 shrink-0 text-sm text-amber-300" role="alert">
          {err}
        </p>
      )}

      <div className="mt-4 shrink-0 border-t border-white/10 pt-4">
        <p className="mb-2 text-xs text-zinc-500">
          Or type digits from a handheld scanner / label:
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="UPC / EAN digits"
            value={manual}
            disabled={busy}
            onChange={(e) => setManual(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void lookup(manual);
            }}
            className="flex-1 rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-zinc-100 placeholder:text-zinc-500"
          />
          <button
            type="button"
            disabled={busy || !manual.trim()}
            onClick={() => void lookup(manual)}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {busy ? "Looking up…" : "Look up"}
          </button>
        </div>
      </div>
    </div>
  );
}
