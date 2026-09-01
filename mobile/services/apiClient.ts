type AuthHandlers = { getToken: () => string | null; onUnauthorized: () => void };

let handlers: AuthHandlers = { getToken: () => null, onUnauthorized: () => {} };

/** Lets AuthContext wire itself up without this file needing to import React
 * — keeps this a plain fetch wrapper, safe to call from anywhere. */
export function configureAuthHandlers(h: AuthHandlers) {
  handlers = h;
}

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "";

/** Several fields coming back from the API (Player.photoUrl, sponsor logo
 * fallbacks) are root-relative paths like "/images/foo.jpg" — the web app
 * can use those directly in an <img> since a browser resolves them against
 * the current page's origin, but React Native's Image has no such concept
 * and would just silently fail to load a bare relative path. Absolute URLs
 * (an admin can also paste a full external link) are returned unchanged. */
export function resolveMediaUrl(url: string | null): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `${BASE_URL}${url}`;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const TIMEOUT_MS = 15_000;

// lib/auth/guards.ts's requireSession() throws this exact message when
// there's no valid session at all (missing/expired/tampered token) — the
// one case that should force a logout. requireRole()/assertInScope() also
// map to the same 403 status (AuthError has no separate status of its own)
// but with a DIFFERENT message ("Requires role: ...", "This resource
// belongs to a different league") for an authenticated session that simply
// lacks permission for THIS action — that must NOT log the whole app out,
// or navigating into any role-gated screen your account isn't fully
// privileged for would silently bounce you back to the sign-in screen.
const SESSION_INVALID_MESSAGE = "Not authenticated";

/** A genuinely invalid session forces the same logout path a manual tap
 * takes — every real auth failure lands on a clean login screen instead of
 * an uncaught error, unlike the web app's own app/viewer/layout.tsx rough
 * edge (deliberately not replicated here). A dead/unreachable API_URL (e.g.
 * an expired dev tunnel) would otherwise hang the underlying fetch()
 * indefinitely with no visible error — the AbortController timeout below
 * turns that into a clear, bounded failure instead of a silently "stuck" UI. */
export async function apiFetch<T>(path: string, init?: RequestInit & { skipAuth?: boolean }): Promise<T> {
  if (!BASE_URL) {
    throw new ApiError("EXPO_PUBLIC_API_URL is not set — check mobile/.env", 0);
  }

  const token = handlers.getToken();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(!init?.skipAuth && token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new ApiError(
        "Couldn't reach the server — check EXPO_PUBLIC_API_URL in mobile/.env is still the current tunnel URL",
        0
      );
    }
    throw new ApiError("Couldn't reach the server — check your connection", 0);
  } finally {
    clearTimeout(timeout);
  }

  const body = await res.json().catch(() => ({}));

  if (res.status === 403 && !init?.skipAuth && body.error === SESSION_INVALID_MESSAGE) {
    handlers.onUnauthorized();
  }

  if (!res.ok) {
    throw new ApiError(body.error ?? "Something went wrong", res.status);
  }
  return body as T;
}
