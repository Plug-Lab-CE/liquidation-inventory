"use client";

import { useCallback, useState } from "react";

export default function UploadPage() {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onDrop = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setStatus("Please upload a CSV file");
      return;
    }
    setBusy(true);
    setStatus(null);
    const fd = new FormData();
    fd.set("file", file);
    const res = await fetch("/api/manifests", { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setStatus(data.error ?? "Upload failed");
      return;
    }
    if (data.status === "ready") {
      setStatus(
        `Manifest processed (in-memory preview). ID: ${data.id}. Open Pending to review items.`,
      );
      return;
    }
    setStatus(`Upload started. Manifest ID: ${data.id}. Processing in background — check Pending in a moment.`);
  }, []);

  const loadSample = useCallback(async () => {
    setBusy(true);
    setStatus(null);
    const res = await fetch("/api/manifests/load-sample", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setStatus(data.error ?? "Could not load sample");
      return;
    }
    setStatus(data.message ?? `Sample loaded. Manifest ID: ${data.id}. Open Pending.`);
  }, []);

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
          {busy ? "Uploading…" : "Click or drag CSV here"}
        </span>
        <span className="mt-2 text-sm text-zinc-500">Max size enforced server-side</span>
      </label>
      {status && <p className="text-sm text-zinc-700">{status}</p>}
    </div>
  );
}
