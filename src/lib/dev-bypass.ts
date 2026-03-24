import type { Session } from "next-auth";

/** When true, skip real login and use a fake admin session (local preview only). */
export function isAuthDevBypassEnabled(): boolean {
  const v = process.env.AUTH_DEV_BYPASS;
  return v === "1" || v === "true" || v === "yes";
}

/**
 * Placeholder user id — not inserted into DB; omit FKs that reference users in API routes when bypassing.
 */
export const AUTH_DEV_BYPASS_USER_ID = "00000000-0000-4000-8000-000000000001";

export function devBypassSession(): Session {
  return {
    user: {
      id: AUTH_DEV_BYPASS_USER_ID,
      email: "preview@local.dev",
      name: "Preview (dev bypass)",
      role: "administrator",
    },
    expires: new Date(Date.now() + 86400000 * 7).toISOString(),
  };
}
