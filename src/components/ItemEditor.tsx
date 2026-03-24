"use client";

import type { ItemDto } from "@/lib/api-types";
import {
  extractDroppedImages,
  isPlausibleHttpImageUrl,
} from "@/lib/extract-dropped-images";
import { imageSrcForDisplay } from "@/lib/image-display";
import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";

const LOOKUP_STAGE_MESSAGES: { ms: number; label: string }[] = [
  { ms: 0, label: "Sending product title, brand, and UPC to OpenAI…" },
  { ms: 2800, label: "Searching the web for product photos (when web search is available)…" },
  { ms: 6500, label: "Collecting direct image URLs from search results…" },
  { ms: 11000, label: "Checking each URL returns real image data…" },
  { ms: 16_000, label: "Saving candidate thumbnails to this item…" },
];

const DISCOUNTS = [30, 40, 50, 60] as const;

type Mode = "pending" | "approval";

export function ItemEditor({
  item,
  mode,
  onClose,
  onSaved,
}: {
  item: ItemDto;
  mode: Mode;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [local, setLocal] = useState(item);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [lookupProgress, setLookupProgress] = useState<number | null>(null);
  const [lookupLabel, setLookupLabel] = useState("");
  const lookupTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const photoDropDepth = useRef(0);
  const [photosDropActive, setPhotosDropActive] = useState(false);

  const clearLookupTicker = useCallback(() => {
    if (lookupTickRef.current) {
      clearInterval(lookupTickRef.current);
      lookupTickRef.current = null;
    }
  }, []);

  useEffect(() => {
    setLocal(item);
  }, [item]);

  useEffect(() => () => clearLookupTicker(), [clearLookupTicker]);

  const patch = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true);
      setMsg(null);
      const res = await fetch(`/api/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      setBusy(false);
      if (!res.ok) {
        setMsg(data.error ? JSON.stringify(data.error) : "Save failed");
        return null;
      }
      const next = data.item as ItemDto;
      setLocal(next);
      onSaved();
      return next;
    },
    [item.id, onSaved],
  );

  const uploadImageFileAndRefresh = useCallback(
    async (file: File): Promise<string[] | null> => {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch(`/api/items/${item.id}/upload-image`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { selectedImageUrls: string[] };
      setLocal((p) => ({ ...p, selectedImageUrls: data.selectedImageUrls }));
      onSaved();
      return data.selectedImageUrls;
    },
    [item.id, onSaved],
  );

  async function handlePhotoDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    photoDropDepth.current = 0;
    setPhotosDropActive(false);

    if (busy) return;

    const { files, urls } = extractDroppedImages(e.dataTransfer);
    let validUrls = urls.filter(isPlausibleHttpImageUrl);
    // Browsers often attach both a File and the page’s image URL for one drag (e.g. Google Images).
    // Uploading the file already adds the photo; merging URLs would duplicate it.
    if (files.length > 0) {
      validUrls = [];
    }

    if (files.length === 0 && validUrls.length === 0) {
      setMsg(
        "No images in that drop. Drag the picture from Google Images (not the page tab), or drop an image file.",
      );
      return;
    }

    setBusy(true);
    setMsg(null);

    let selected = [...(local.selectedImageUrls ?? [])];

    try {
      for (const f of files) {
        const next = await uploadImageFileAndRefresh(f);
        if (!next) {
          setMsg("Could not upload one or more dropped files.");
          break;
        }
        selected = next;
      }

      if (validUrls.length > 0) {
        const merged = [...new Set([...selected, ...validUrls])];
        const final = merged.slice(0, 10);
        const overflow = merged.length - final.length;
        if (overflow > 0) {
          setMsg(`At most 10 photos — ${overflow} link(s) were not added.`);
        }
        const sameLen = final.length === selected.length;
        const sameItems =
          sameLen && final.every((u, i) => u === selected[i]);
        if (!sameItems) {
          await patch({ selectedImageUrls: final });
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function runImageLookup() {
    setBusy(true);
    setMsg(null);
    clearLookupTicker();
    setLookupProgress(0);
    setLookupLabel(LOOKUP_STAGE_MESSAGES[0]!.label);

    const started = Date.now();
    let fakePct = 0;
    lookupTickRef.current = setInterval(() => {
      const elapsed = Date.now() - started;
      let label = LOOKUP_STAGE_MESSAGES[0]!.label;
      for (let i = LOOKUP_STAGE_MESSAGES.length - 1; i >= 0; i--) {
        if (elapsed >= LOOKUP_STAGE_MESSAGES[i]!.ms) {
          label = LOOKUP_STAGE_MESSAGES[i]!.label;
          break;
        }
      }
      setLookupLabel(label);
      fakePct += (92 - fakePct) * 0.048 + Math.random() * 0.4;
      setLookupProgress(Math.min(Math.round(fakePct), 91));
    }, 280);

    try {
      const res = await fetch(`/api/items/${item.id}/image-lookup`, { method: "POST" });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setLookupProgress(null);
        setLookupLabel("");
        setMsg(data.error ?? "Lookup failed");
        return;
      }

      setLookupProgress(100);
      setLookupLabel("Finished — thumbnails updated");
      setLocal((prev) => ({ ...prev, candidateImageUrls: data.candidateImageUrls ?? [] }));
      if (data.message) setMsg(data.message);
      onSaved();
      window.setTimeout(() => {
        setLookupProgress(null);
        setLookupLabel("");
      }, 900);
    } catch {
      setLookupProgress(null);
      setLookupLabel("");
      setMsg("Lookup failed");
    } finally {
      clearLookupTicker();
      setBusy(false);
    }
  }

  function toggleSelected(url: string) {
    const set = new Set(local.selectedImageUrls ?? []);
    if (set.has(url)) set.delete(url);
    else set.add(url);
    void patch({ selectedImageUrls: [...set] });
  }

  const candidates = [
    ...new Set([...(local.candidateImageUrls ?? []), ...(local.selectedImageUrls ?? [])]),
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[min(92vh,900px)] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-zinc-200 px-4 py-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">{local.title}</h2>
            <p className="text-xs text-zinc-500">
              {local.brand} · Qty {local.quantity} · {local.category}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1 text-sm text-zinc-600 hover:bg-zinc-100"
          >
            Close
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="flex flex-col gap-4 text-sm">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div>
                <span className="text-zinc-500">Unit retail</span>
                <p className="font-medium">${local.unitRetail ?? "—"}</p>
              </div>
              <div>
                <span className="text-zinc-500">Ext. retail</span>
                <p className="font-medium">${local.extRetail ?? "—"}</p>
              </div>
              <div>
                <span className="text-zinc-500">UPC</span>
                <p className="font-mono text-xs">{local.upc ?? "—"}</p>
              </div>
              <div>
                <span className="text-zinc-500">Condition</span>
                <p>{local.condition ?? "—"}</p>
              </div>
              <div className="col-span-2">
                <span className="text-zinc-500">Pallet / Lot</span>
                <p className="break-all text-xs">
                  {(local.palletIds ?? []).join(", ") || "—"} /{" "}
                  {(local.lotIds ?? []).join(", ") || "—"}
                </p>
              </div>
            </div>

            {mode === "pending" && (
              <>
                <div>
                  <span className="font-medium text-zinc-800">Discount</span>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {DISCOUNTS.map((d) => (
                      <button
                        key={d}
                        type="button"
                        disabled={busy}
                        onClick={() => void patch({ discountPercent: d })}
                        className={`rounded-full px-4 py-2 text-sm font-medium ${
                          local.discountPercent === d
                            ? "bg-zinc-900 text-white"
                            : "bg-zinc-100 text-zinc-800 hover:bg-zinc-200"
                        }`}
                      >
                        {d}% off
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="font-medium text-zinc-800">Sale price</span>
                  <p className="mt-1 text-lg font-semibold text-emerald-700">
                    ${local.salePrice ?? "—"}
                  </p>
                </div>
                <label className="block">
                  <span className="font-medium text-zinc-800">Condition notes</span>
                  <textarea
                    className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900"
                    rows={3}
                    value={local.conditionNotes ?? ""}
                    onChange={(e) =>
                      setLocal((prev) => ({ ...prev, conditionNotes: e.target.value }))
                    }
                    onBlur={() => {
                      if ((local.conditionNotes ?? "") !== (item.conditionNotes ?? "")) {
                        void patch({ conditionNotes: local.conditionNotes || null });
                      }
                    }}
                  />
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={local.accountedFor}
                    disabled={busy}
                    onChange={(e) => void patch({ accountedFor: e.target.checked })}
                  />
                  <span>Accounted for</span>
                </label>
              </>
            )}

            {mode === "approval" && (
              <>
                <label className="block">
                  <span className="font-medium text-zinc-800">Title</span>
                  <input
                    className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
                    value={local.title}
                    onChange={(e) => setLocal((p) => ({ ...p, title: e.target.value }))}
                    onBlur={() => {
                      if (local.title !== item.title) void patch({ title: local.title });
                    }}
                  />
                </label>
                <label className="block">
                  <span className="font-medium text-zinc-800">Description</span>
                  <textarea
                    className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
                    rows={4}
                    value={local.description ?? ""}
                    onChange={(e) => setLocal((p) => ({ ...p, description: e.target.value }))}
                    onBlur={() => {
                      if (local.description !== item.description) {
                        void patch({ description: local.description || null });
                      }
                    }}
                  />
                </label>
                <label className="block">
                  <span className="font-medium text-zinc-800">Sale price (override)</span>
                  <input
                    className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono"
                    value={local.salePrice ?? ""}
                    onChange={(e) => setLocal((p) => ({ ...p, salePrice: e.target.value }))}
                    onBlur={() => {
                      if (local.salePrice !== item.salePrice) {
                        void patch({ salePrice: local.salePrice || null });
                      }
                    }}
                  />
                </label>
                <p className="text-zinc-500">Compare-at on Shopify uses unit retail: ${local.unitRetail}</p>
              </>
            )}

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-zinc-800">Photos</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void runImageLookup()}
                  className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                >
                  AI image lookup
                </button>
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                Select thumbnails to publish. AI uses OpenAI web search when available.
              </p>
              <div
                role="region"
                aria-label="Drop zone for photos"
                className={`mt-3 flex min-h-[128px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
                  photosDropActive
                    ? "border-emerald-500 bg-emerald-50"
                    : "border-zinc-300 bg-zinc-50 hover:border-zinc-400"
                } ${busy ? "opacity-60" : ""}`}
                onDragEnter={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  photoDropDepth.current += 1;
                  setPhotosDropActive(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  photoDropDepth.current -= 1;
                  if (photoDropDepth.current <= 0) {
                    photoDropDepth.current = 0;
                    setPhotosDropActive(false);
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.dataTransfer.dropEffect = "copy";
                }}
                onDrop={(e) => void handlePhotoDrop(e)}
              >
                <svg
                  className={`h-10 w-10 shrink-0 ${photosDropActive ? "text-emerald-600" : "text-zinc-400"}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3A1.5 1.5 0 0 0 1.5 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"
                  />
                </svg>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-zinc-800">Drop images here</p>
                  <p className="text-xs text-zinc-500">
                    Image files, or drag pictures from Google Images into this box
                  </p>
                </div>
              </div>
              {lookupProgress !== null && (
                <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                  <div className="mb-2 flex items-start justify-between gap-3 text-xs">
                    <span className="font-medium leading-snug text-zinc-800">{lookupLabel}</span>
                    <span className="shrink-0 tabular-nums text-zinc-500">{lookupProgress}%</span>
                  </div>
                  <div
                    className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-200"
                    role="progressbar"
                    aria-valuenow={lookupProgress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="AI image lookup progress"
                  >
                    <div
                      className="h-full rounded-full bg-zinc-900 transition-[width] duration-300 ease-out"
                      style={{ width: `${lookupProgress}%` }}
                    />
                  </div>
                </div>
              )}
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {candidates.length === 0 && (
                  <p className="col-span-full text-zinc-500">No images yet.</p>
                )}
                {candidates.map((url) => {
                  const selected = (local.selectedImageUrls ?? []).includes(url);
                  return (
                    <button
                      key={url}
                      type="button"
                      onClick={() => toggleSelected(url)}
                      className={`relative overflow-hidden rounded-lg border-2 ${
                        selected ? "border-emerald-600" : "border-zinc-200"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={imageSrcForDisplay(url)}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="aspect-square w-full bg-zinc-100 object-cover"
                      />
                      {selected && (
                        <span className="absolute right-1 top-1 rounded bg-emerald-600 px-1.5 text-[10px] text-white">
                          On
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-zinc-600">
                <input
                  type="file"
                  accept="image/*"
                  className="text-xs"
                  disabled={busy}
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    setBusy(true);
                    setMsg(null);
                    const ok = await uploadImageFileAndRefresh(f);
                    setBusy(false);
                    e.target.value = "";
                    if (!ok) setMsg("Upload failed");
                  }}
                />
                Upload photo file
              </label>
            </div>

            {msg && <p className="text-sm text-amber-800">{msg}</p>}
          </div>
        </div>
        <div className="border-t border-zinc-200 px-4 py-3">
          {mode === "pending" && (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                const res = await fetch(`/api/items/${item.id}/submit-approval`, {
                  method: "POST",
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                  setMsg(data.error ?? "Cannot submit");
                  return;
                }
                onSaved();
                onClose();
              }}
              className="w-full rounded-lg bg-emerald-700 py-3 font-medium text-white disabled:opacity-50"
            >
              Send to approval
            </button>
          )}
          {mode === "approval" && (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const res = await fetch(`/api/items/${item.id}/publish-shopify`, {
                  method: "POST",
                });
                const data = await res.json().catch(() => ({}));
                setBusy(false);
                if (!res.ok) {
                  setMsg(data.error ?? "Shopify publish failed");
                  return;
                }
                onSaved();
                onClose();
              }}
              className="w-full rounded-lg bg-violet-700 py-3 font-medium text-white disabled:opacity-50"
            >
              Publish to Shopify
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
