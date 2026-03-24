import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center bg-zinc-100 px-4">
      <Suspense fallback={<div className="text-zinc-500">Loading…</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
