import { auth } from "@/auth";
import type { Session } from "next-auth";
import { NextResponse } from "next/server";

export type AuthOk = { session: Session };
export type AuthErr = { response: NextResponse };

export async function requireSession(): Promise<AuthOk | AuthErr> {
  const session = await auth();
  if (!session?.user?.id) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { session };
}

export async function requireAdmin(): Promise<AuthOk | AuthErr> {
  const r = await requireSession();
  if ("response" in r) return r;
  if (r.session.user.role !== "administrator") {
    return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session: r.session };
}
