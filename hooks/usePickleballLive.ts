"use client";

import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

export type PickleballLiveIdentity = { eventId: string } | { token: string };

/**
 * Joins the right Socket.IO room for one pickleball event — authenticated by
 * eventId for the admin scoring console, or by the public token for the
 * standings/OBS pages — and calls `onUpdate` on every `pickleball:updated`
 * event. Deliberately doesn't merge/reduce payloads like useAuctionSocket
 * does (this feature's whole state is small): the caller decides what
 * "refetch" means — a `router.refresh()` for a normal page, or a client-side
 * `fetch()` of the public state route for the OBS view, where a navigation
 * would flash/flicker as an OBS browser source.
 */
export function usePickleballLive(identity: PickleballLiveIdentity, onUpdate: () => void): { connected: boolean } {
  const [connected, setConnected] = useState(false);
  // Kept in a ref, not the effect's dependency array — a fresh inline
  // callback every render must not tear down and reopen the connection.
  // Updated in its own effect (not during render) so a ref write never
  // risks a cascading re-render.
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  });

  const joinKey = "eventId" in identity ? `event:${identity.eventId}` : `token:${identity.token}`;

  useEffect(() => {
    const socket = io({ path: "/socket.io" });

    socket.on("connect", () => {
      setConnected(true);
      if ("eventId" in identity) socket.emit("pickleball:join", identity.eventId);
      else socket.emit("pickleball:join:public", identity.token);
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("pickleball:updated", () => onUpdateRef.current());

    return () => {
      socket.disconnect();
    };
    // joinKey stands in for identity's fields so this effect doesn't need
    // `identity` itself (a fresh object every render) in its deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinKey]);

  return { connected };
}
