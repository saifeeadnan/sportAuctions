"use client";

import { useRouter } from "next/navigation";
import { usePickleballLive } from "@/hooks/usePickleballLive";

/** Invisible shim: re-renders the (server-rendered) page it's dropped into
 * whenever a game is scored, so the public standings/results page stays live
 * without a manual reload. */
export function PickleballLiveRefresh({ token }: { token: string }) {
  const router = useRouter();
  usePickleballLive({ token }, () => router.refresh());
  return null;
}
