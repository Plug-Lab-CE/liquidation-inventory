import { Nav } from "@/components/Nav";
import { isAuthDevBypassEnabled } from "@/lib/dev-bypass";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {isAuthDevBypassEnabled() && (
        <div className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-950">
          <strong>Dev preview:</strong> <code className="rounded bg-amber-200/80 px-1">AUTH_DEV_BYPASS</code>{" "}
          is on — login is skipped. Do not use in production.
        </div>
      )}
      <Nav />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-6">{children}</main>
    </>
  );
}
