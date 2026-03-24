"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

const links = [
  { href: "/upload", label: "Upload" },
  { href: "/pending", label: "Pending" },
  { href: "/approval", label: "Approval" },
];

export function Nav() {
  const pathname = usePathname();
  const { data } = useSession();

  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-6">
          <Link href="/upload" className="font-semibold text-zinc-900">
            Liquidation Inventory
          </Link>
          <nav className="flex flex-wrap gap-1">
            {links.map((l) => {
              const active = pathname === l.href || pathname.startsWith(l.href + "/");
              if (l.href === "/approval" && data?.user?.role !== "administrator") {
                return null;
              }
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                    active ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"
                  }`}
                >
                  {l.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm text-zinc-600">
          <span className="hidden sm:inline">{data?.user?.email}</span>
          <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs uppercase">
            {data?.user?.role}
          </span>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-zinc-800 hover:bg-zinc-50"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
