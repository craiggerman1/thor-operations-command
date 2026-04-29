import { NextRequest, NextResponse } from "next/server";

const REALM = "Thor Operations Command";

export function middleware(request: NextRequest) {
  const sitePassword = process.env.TOC_SITE_PASSWORD;

  if (!sitePassword) {
    return NextResponse.next();
  }

  const expectedUser = process.env.TOC_SITE_USER || "thor";
  const authorization = request.headers.get("authorization");

  if (authorization?.startsWith("Basic ")) {
    const encoded = authorization.slice("Basic ".length);
    const decoded = atob(encoded);
    const separatorIndex = decoded.indexOf(":");
    const user = decoded.slice(0, separatorIndex);
    const password = decoded.slice(separatorIndex + 1);

    if (user === expectedUser && password === sitePassword) {
      return NextResponse.next();
    }
  }

  return new NextResponse("TOC is private.", {
    status: 401,
    headers: {
      "WWW-Authenticate": `Basic realm="${REALM}", charset="UTF-8"`
    }
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|assets|favicon.ico).*)"]
};
