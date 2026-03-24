"use client";

import { BarcodeScanModal } from "@/components/BarcodeScanModal";
import { ItemEditor } from "@/components/ItemEditor";
import type { ItemDto } from "@/lib/api-types";
import { useCallback, useEffect, useState } from "react";

export default function PendingPage() {
  const [items, setItems] = useState<ItemDto[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ItemDto | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    const res = await fetch(`/api/items?status=pending_review&page=${p}`);
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) return;
    setItems(data.items ?? []);
    setTotalPages(data.totalPages ?? 1);
    setPage(data.page ?? 1);
  }, []);

  useEffect(() => {
    const id = requestAnimationFrame(() => void load(1));
    return () => cancelAnimationFrame(id);
  }, [load]);

  async function bulkSubmit() {
    if (selectedIds.size === 0) return;
    setBulkMsg(null);
    const res = await fetch("/api/items/bulk-submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...selectedIds] }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBulkMsg(data.error ? JSON.stringify(data.error) : "Bulk submit failed");
      return;
    }
    setBulkMsg(`Submitted ${data.submitted}. Failed: ${data.failed?.length ?? 0}`);
    setSelectedIds(new Set());
    void load(page);
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  const onScanFound = useCallback((item: ItemDto) => {
    setSelected(item);
    setScanOpen(false);
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Pending inventory</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Deduped lines from manifests. Set discount, notes, photos, then send to approval.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {bulkMsg && <span className="text-sm text-zinc-600">{bulkMsg}</span>}
          <button
            type="button"
            onClick={() => setScanOpen(true)}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
          >
            Scan barcode
          </button>
          <button
            type="button"
            disabled={selectedIds.size === 0}
            onClick={() => void bulkSubmit()}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            Send selected to approval
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-zinc-500">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-zinc-500">No pending items. Upload a manifest first.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((it) => (
            <li
              key={it.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
            >
              <input
                type="checkbox"
                checked={selectedIds.has(it.id)}
                onChange={() => toggleSelect(it.id)}
                className="h-4 w-4"
              />
              <div className="h-14 w-14 shrink-0 rounded-lg bg-zinc-100" title="No manifest image" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-zinc-900">{it.title}</p>
                <p className="text-xs text-zinc-500">
                  Qty {it.quantity} · ${it.unitRetail} retail · {it.accountedFor ? "✓ counted" : "not counted"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(it)}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
              >
                Open
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex justify-center gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => void load(page - 1)}
          className="rounded border border-zinc-300 px-3 py-1 text-sm disabled:opacity-40"
        >
          Previous
        </button>
        <span className="py-1 text-sm text-zinc-600">
          Page {page} / {totalPages}
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => void load(page + 1)}
          className="rounded border border-zinc-300 px-3 py-1 text-sm disabled:opacity-40"
        >
          Next
        </button>
      </div>

      <BarcodeScanModal
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onFound={onScanFound}
      />

      {selected && (
        <ItemEditor
          item={selected}
          mode="pending"
          onClose={() => setSelected(null)}
          onSaved={() => void load(page)}
        />
      )}
    </div>
  );
}
