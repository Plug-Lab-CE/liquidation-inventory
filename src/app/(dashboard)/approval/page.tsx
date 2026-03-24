"use client";

import { ItemEditor } from "@/components/ItemEditor";
import type { ItemDto } from "@/lib/api-types";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export default function ApprovalPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [items, setItems] = useState<ItemDto[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ItemDto | null>(null);

  useEffect(() => {
    if (status === "authenticated" && session?.user?.role !== "administrator") {
      router.replace("/pending");
    }
  }, [status, session?.user?.role, router]);

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    const res = await fetch(`/api/items?status=awaiting_approval&page=${p}`);
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) return;
    setItems(data.items ?? []);
    setTotalPages(data.totalPages ?? 1);
    setPage(data.page ?? 1);
  }, []);

  useEffect(() => {
    if (session?.user?.role !== "administrator") return;
    const id = requestAnimationFrame(() => void load(1));
    return () => cancelAnimationFrame(id);
  }, [session?.user?.role, load]);

  if (status === "loading" || session?.user?.role !== "administrator") {
    return <p className="text-zinc-500">Loading…</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Approval</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Review listings, adjust copy and price, then publish to Shopify.
        </p>
      </div>

      {loading ? (
        <p className="text-zinc-500">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-zinc-500">Nothing awaiting approval.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((it) => (
            <li
              key={it.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
            >
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-zinc-100">
                {it.selectedImageUrls?.[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={it.selectedImageUrls[0]}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-zinc-900">{it.title}</p>
                <p className="text-xs text-zinc-500">
                  Sale ${it.salePrice ?? "—"} · Retail ${it.unitRetail ?? "—"} · Qty {it.quantity}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(it)}
                className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white"
              >
                Review
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

      {selected && (
        <ItemEditor
          item={selected}
          mode="approval"
          onClose={() => setSelected(null)}
          onSaved={() => void load(page)}
        />
      )}
    </div>
  );
}
