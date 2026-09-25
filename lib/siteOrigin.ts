const LOOPBACK = /^(localhost|127\.\d+\.\d+\.\d+|\[?::1\]?)$/i;

function originOf(raw: string | null | undefined): URL | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? new URL(url.origin) : null;
  } catch {
    return null;
  }
}

/**
 * The public address of the site, for links a chat app or crawler has to open
 * (preview images). Takes NEXTAUTH_URL when it is set and public, otherwise the
 * address this request arrived on, and only settles for a localhost address
 * when that is all there is — so a production deploy without NEXTAUTH_URL, or
 * with it copied from a dev machine, never advertises localhost.
 */
export function publicOrigin(input: {
  envUrl?: string | null;
  /** Host (or x-forwarded-host) header; a comma-separated list keeps its first entry. */
  host?: string | null;
  /** x-forwarded-proto header; anything but http/https is ignored. */
  proto?: string | null;
}): URL | undefined {
  const host = input.host?.split(",")[0]?.trim();
  const proto = input.proto?.split(",")[0]?.trim().toLowerCase();
  const hostname = host ? originOf(`http://${host}`)?.hostname : undefined;
  const scheme = proto === "http" || proto === "https" ? proto : hostname && LOOPBACK.test(hostname) ? "http" : "https";

  const candidates = [originOf(input.envUrl), host ? originOf(`${scheme}://${host}`) : null].filter(
    (u): u is URL => u !== null
  );
  return candidates.find((u) => !LOOPBACK.test(u.hostname)) ?? candidates[0];
}
