"use client";

import {
  pollManifestUntilDone,
  postManifestWithUploadProgress,
} from "@/lib/upload-manifest-client";
import { useCallback, useEffect, useRef, useState } from "react";

type Stage = "idle" | "upload" | "server" | "poll" | "done" | "error";

/** First ~28% = real upload bytes; rest = estimated while server works or polls. */
const UPLOAD_SHARE = 0.28;

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UploadPage() {
  const [stage, setStage] = useState<Stage>("idle");
  const [uploadPct, setUploadPct] = useState(0);
  const [overallPct, setOverallPct] = useState(0);
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const serverCreepRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sampleCreepRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearServerCreep = useCallback(() => {
    if (serverCreepRef.current) {
      clearInterval(serverCreepRef.current);
      serverCreepRef.current = null;
    }
  }, []);

  const clearSampleCreep = useCallback(() => {
    if (sampleCreepRef.current) {
      clearInterval(sampleCreepRef.current);
      sampleCreepRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearServerCreep();
      clearSampleCreep();
    };
  }, [clearServerCreep, clearSampleCreep]);

  const startServerCreep = useCallback(() => {
    clearServerCreep();
    serverCreepRef.current = setInterval(() => {
      setOverallPct((p) => (p >= 92 ? p : p + 1));
    }, 130);
  }, [clearServerCreep]);

  const reset = useCallback(() => {
    clearServerCreep();
    clearSampleCreep();
    setStage("idle");
    setUploadPct(0);
    setOverallPct(0);
    setTitle("");
    setDetail(null);
  }, [clearServerCreep, clearSampleCreep]);

  const onDrop = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith(".csv")) {
        setStage("error");
        setTitle("Invalid file");
        setDetail("Please upload a CSV file.");
        return;
      }

      setBusy(true);
      reset();
      setStage("upload");
      setTitle("Uploading file");
      setDetail(`${file.name} · ${formatBytes(file.size)}`);

      const fd = new FormData();
      fd.set("file", file);

      const result = await postManifestWithUploadProgress(
        fd,
        (pct, loaded, total) => {
          setUploadPct(pct);
          setOverallPct(Math.min(28, Math.round(pct * UPLOAD_SHARE)));
          setDetail(`${file.name} · ${formatBytes(loaded)} / ${formatBytes(total)}`);
        },
        () => {
          setStage("server");
          setTitle("Processing on server");
          setDetail(
            "Parsing CSV, deduplicating lines, and normalizing listings (may take a minute if AI is enabled)…",
          );
          setOverallPct((p) => Math.max(28, Math.round(p)));
          startServerCreep();
        },
      );

      setUploadPct(100);
      clearServerCreep();

      if (!result.ok) {
        setBusy(false);
        setOverallPct(0);
        setStage("error");
        setTitle("Upload failed");
        setDetail(result.data.error ?? `Request failed (${result.status || "network"})`);
        return;
      }

      const data = result.data;

      if (data.status === "ready") {
        setOverallPct(100);
        setBusy(false);
        setStage("done");
        setTitle("Manifest ready");
        setDetail(
          `In-memory preview · ID ${data.id}. Open Pending to review items.`,
        );
        return;
      }

      if (data.status === "processing") {
        setStage("poll");
        setTitle("Background processing");
        setDetail("File saved. Deduping rows and building inventory…");
        setOverallPct((p) => Math.max(p, 48));

        try {
          const final = await pollManifestUntilDone(data.id, {
            onStatus: (st, itemCount, attempt) => {
              const pollFloor = 48 + Math.min(47, attempt * 3);
              setOverallPct((p) => Math.max(p, pollFloor));
              if (st === "processing") {
                setDetail("Still processing — normalizing product titles and descriptions…");
              }
              if (st === "ready" && itemCount != null) {
                setDetail(`Done — ${itemCount} line(s) in inventory.`);
              }
            },
          });

          setOverallPct(100);

          if (final.status === "ready") {
            setStage("done");
            setTitle("Manifest ready");
            setDetail(
              final.itemCount != null
                ? `PostgreSQL · ${final.itemCount} line(s) loaded. Open Pending to review.`
                : `PostgreSQL · ID ${data.id}. Open Pending to review.`,
            );
          } else {
            setStage("error");
            setTitle("Processing failed");
            setDetail(final.errorMessage ?? "Manifest processing failed.");
          }
        } catch (e) {
          setStage("error");
          setTitle("Timed out");
          setDetail(
            e instanceof Error ? e.message : "Still processing — refresh Pending in a moment.",
          );
        } finally {
          setBusy(false);
        }
        return;
      }

      setBusy(false);
      setOverallPct(100);
      setStage("done");
      setTitle("Done");
      setDetail(JSON.stringify(data));
    },
    [reset, startServerCreep, clearServerCreep],
  );

  const loadSample = useCallback(async () => {
    setBusy(true);
    reset();
    setStage("server");
    setTitle("Loading sample");
    setDetail("Fetching bundled CSV and building inventory…");
    setOverallPct(8);

    clearSampleCreep();
    sampleCreepRef.current = setInterval(() => {
      setOverallPct((p) => (p >= 88 ? p : p + 2));
    }, 120);

    const res = await fetch("/api/manifests/load-sample", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    clearSampleCreep();
    setBusy(false);

    if (!res.ok) {
      setOverallPct(0);
      setStage("error");
      setTitle("Could not load sample");
      setDetail(data.error ?? "Request failed");
      return;
    }

    setOverallPct(100);
    setStage("done");
    setTitle("Sample loaded");
    setDetail(data.message ?? `Manifest ID: ${data.id}. Open Pending.`);
  }, [reset, clearSampleCreep]);

  const showBar = stage !== "idle" && stage !== "done" && stage !== "error";
  const displayPct = Math.min(100, Math.max(0, Math.round(overallPct)));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Upload manifest</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Drop a B-Stock style CSV. Rows are deduplicated by UPC and normalized with AI when{" "}
          <code className="rounded bg-zinc-100 px-1">OPENAI_API_KEY</code> is set. If{" "}
          <code className="rounded bg-zinc-100 px-1">DATABASE_URL</code> is unset, uploads stay in
          server memory until you restart the dev server.
        </p>
      </div>

      {showBar && (
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="font-medium text-zinc-900">{title || "Working…"}</span>
            <span className="tabular-nums text-lg font-semibold text-emerald-700">
              {displayPct}%
            </span>
          </div>
          <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-zinc-200">
            <div
              className="h-full rounded-full bg-emerald-600 transition-[width] duration-200 ease-out"
              style={{ width: `${displayPct}%` }}
            />
          </div>
          <p className="mt-2 text-xs leading-relaxed text-zinc-600">{detail}</p>
          <p className="mt-1 text-[11px] text-zinc-400">
            {stage === "upload" && uploadPct < 100
              ? "Progress while sending the file is exact; after that, overall % is estimated until the server finishes."
              : stage === "server" || stage === "poll"
                ? "Overall % is estimated while the server works (parsing, dedupe, AI). You’ll see 100% when it’s done."
                : null}
          </p>
        </div>
      )}

      {stage === "done" && title && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 text-sm">
          <p className="font-medium text-emerald-900">{title}</p>
          {detail && <p className="mt-1 text-emerald-800/90">{detail}</p>}
        </div>
      )}

      {stage === "error" && title && (
        <div className="rounded-xl border border-red-200 bg-red-50/80 p-4 text-sm">
          <p className="font-medium text-red-900">{title}</p>
          {detail && <p className="mt-1 text-red-800/90">{detail}</p>}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void loadSample()}
          className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:opacity-40"
        >
          Load bundled wall-décor sample (no DB)
        </button>
      </div>
      <label
        className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50 px-6 py-16 text-center transition-colors hover:border-zinc-400 hover:bg-zinc-100"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files[0];
          if (f) void onDrop(f);
        }}
      >
        <input
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onDrop(f);
          }}
        />
        <span className="font-medium text-zinc-800">
          {busy ? "Working…" : "Click or drag CSV here"}
        </span>
        <span className="mt-2 text-sm text-zinc-500">Max size enforced server-side</span>
      </label>
    </div>
  );
}
