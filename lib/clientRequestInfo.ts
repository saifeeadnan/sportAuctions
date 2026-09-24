// For analytics only — these headers are client-supplied unless a trusted
// proxy overwrites them, so never use them for an access decision.

/** The visitor's own IP. Behind Cloudflare that's `cf-connecting-ip`; else the
 * FIRST entry of `x-forwarded-for`, which is a comma-separated chain where
 * everything after the first hop is proxies, not the user (storing the whole
 * header, as this used to, recorded "client, proxy1, proxy2"). */
export function clientIpFromHeaders(headers: Headers): string | undefined {
  const cloudflare = headers.get("cf-connecting-ip")?.trim();
  if (cloudflare) return cloudflare;
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  return headers.get("x-real-ip")?.trim() || undefined;
}

/** Capped so an absurdly long header can't bloat a row. */
export function userAgentFromHeaders(headers: Headers): string | undefined {
  const userAgent = headers.get("user-agent")?.trim();
  return userAgent ? userAgent.slice(0, 300) : undefined;
}
