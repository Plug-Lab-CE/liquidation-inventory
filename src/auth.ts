import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { eq } from "drizzle-orm";
import { devBypassSession, isAuthDevBypassEnabled } from "@/lib/dev-bypass";

const nextAuth = NextAuth({
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const { db } = await import("@/db");
        const { users } = await import("@/db/schema");
        const email = credentials?.email?.toString().trim().toLowerCase();
        const password = credentials?.password?.toString();
        if (!email || !password) return null;

        const [row] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);
        if (!row) return null;

        const ok = await compare(password, row.passwordHash);
        if (!ok) return null;

        return {
          id: row.id,
          email: row.email,
          name: row.name ?? undefined,
          role: row.role,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id!;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as "employee" | "administrator";
      }
      return session;
    },
  },
});

export const handlers = nextAuth.handlers;
export const signIn = nextAuth.signIn;
export const signOut = nextAuth.signOut;

/** Use in middleware only (supports `auth((req) => …)`). */
export const authMiddleware = nextAuth.auth;

/** Server/session: returns fake session when `AUTH_DEV_BYPASS` is enabled. */
/** Server / RSC session (no-arg). Middleware uses {@link authMiddleware}. */
export async function auth() {
  if (isAuthDevBypassEnabled()) {
    return devBypassSession();
  }
  return nextAuth.auth() as Promise<import("next-auth").Session | null>;
}
