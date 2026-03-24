import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      role: "employee" | "administrator";
    };
  }

  interface User {
    role: "employee" | "administrator";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: "employee" | "administrator";
  }
}
