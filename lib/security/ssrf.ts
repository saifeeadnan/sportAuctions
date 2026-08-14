import dns from "node:dns/promises";
import net from "node:net";

/**
 * True if `ip` is loopback, private, link-local, or otherwise a
 * non-public/reserved address — covers the ranges commonly abused for SSRF,
 * including cloud metadata endpoints (169.254.169.254 lives in the link-local
 * range).
 */
export function isPrivateOrReservedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b, c] = ip.split(".").map(Number);
    if (a === 0) return true; // "this" network
    if (a === 10) return true; // private
    if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 0 && (c === 0 || c === 2)) return true; // IETF/documentation
    if (a === 192 && b === 168) return true; // private
    if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
    if (a === 198 && b === 51 && c === 100) return true; // documentation
    if (a === 203 && b === 0 && c === 113) return true; // documentation
    if (a >= 224) return true; // multicast + reserved
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true; // loopback / unspecified
    if (/^fe[89ab][0-9a-f]:/.test(lower)) return true; // link-local fe80::/10
    if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true; // unique local fc00::/7
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateOrReservedIp(mapped[1]);
    return false;
  }
  return true; // unrecognized format — fail closed
}

/**
 * Guards against SSRF before a server-side fetch of a user-supplied URL —
 * resolves the hostname and rejects anything pointing at a private/internal
 * address. Checks the *resolved* IP, not just the hostname text, so a
 * DNS-rebinding attempt (a public-looking hostname that resolves to an
 * internal address) is still caught. Only http/https are allowed.
 */
export async function isSafePublicUrl(rawUrl: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;

  try {
    const { address } = await dns.lookup(parsed.hostname);
    return !isPrivateOrReservedIp(address);
  } catch {
    return false;
  }
}
