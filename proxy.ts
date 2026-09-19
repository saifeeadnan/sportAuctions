import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

const protectedPrefixes = ["/admin", "/manager", "/auctioneer", "/viewer"];

// The OBS broadcast canvas is deliberately public (dropped into OBS as a
// browser source, which carries no session cookie, and shared with
// co-streamers) — same posture as /highlights/[token] and
// /roster-card/[token], which sit outside every protected prefix entirely.
// This one has to be carved out of /auctioneer instead of moved out from
// under it, since its URL is already in use.
const publicExceptions = [/^\/auctioneer\/auctions\/[^/]+\/broadcast$/];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  if (publicExceptions.some((re) => re.test(pathname))) return;

  const isProtected = protectedPrefixes.some((prefix) =>
    pathname.startsWith(prefix)
  );

  if (isProtected && !req.auth?.user) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    return NextResponse.redirect(loginUrl);
  }
});

export const config = {
  matcher: ["/admin/:path*", "/manager/:path*", "/auctioneer/:path*", "/viewer/:path*"],
};
