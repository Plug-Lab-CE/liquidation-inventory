import { authMiddleware } from "@/auth";
import { isAuthDevBypassEnabled } from "@/lib/dev-bypass";
import { NextResponse } from "next/server";

export default authMiddleware((req) => {
  const path = req.nextUrl.pathname;

  if (isAuthDevBypassEnabled()) {
    if (path.startsWith("/login")) {
      return NextResponse.redirect(new URL("/upload", req.nextUrl.origin));
    }
    return NextResponse.next();
  }

  const isLoggedIn = !!req.auth;
  const isLogin = path.startsWith("/login");
  const isAuthApi = path.startsWith("/api/auth");

  if (isAuthApi) {
    return NextResponse.next();
  }

  if (path.startsWith("/api/")) {
    if (!isLoggedIn) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  if (!isLoggedIn && !isLogin) {
    const url = new URL("/login", req.nextUrl.origin);
    url.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  if (isLoggedIn && isLogin) {
    return NextResponse.redirect(new URL("/", req.nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
