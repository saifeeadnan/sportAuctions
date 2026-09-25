// The stats page keeps its place in the URL — the open tab in the hash, the chosen
// player(s) in ?player= and ?vs= — so a link opens exactly what its sender was
// looking at. The hash is read here with useSyncExternalStore; ?player= and ?vs=
// are read on the server and passed down, so the server's HTML and the browser's
// first render agree. writeUrl changes either (replaceState, so the back button
// isn't filled with every keystroke).

const URL_EVENT = "stats-url-change";

export function subscribeUrl(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  window.addEventListener("popstate", onChange);
  window.addEventListener(URL_EVENT, onChange);
  return () => {
    window.removeEventListener("hashchange", onChange);
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(URL_EVENT, onChange);
  };
}

export const getHash = () => window.location.hash;
/** What the server renders: nothing in the URL is known there. */
export const getServerUrlPart = () => "";

export function decodeHash(hash: string): string {
  try {
    return decodeURIComponent(hash.replace(/^#/, ""));
  } catch {
    return "";
  }
}

/** Changes the hash and/or query parameters in place (null removes one) and tells subscribers. */
export function writeUrl(update: { hash?: string | null; params?: Record<string, string | null> }) {
  const url = new URL(window.location.href);
  for (const [name, value] of Object.entries(update.params ?? {})) {
    if (value === null) url.searchParams.delete(name);
    else url.searchParams.set(name, value);
  }
  if (update.hash !== undefined) url.hash = update.hash === null ? "" : `#${encodeURIComponent(update.hash)}`;
  const next = `${url.pathname}${url.search}${url.hash}`;
  if (next === `${window.location.pathname}${window.location.search}${window.location.hash}`) return;
  window.history.replaceState(null, "", next);
  window.dispatchEvent(new Event(URL_EVENT));
}
