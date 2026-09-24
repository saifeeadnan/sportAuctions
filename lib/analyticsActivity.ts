export const HEARTBEAT_INTERVAL_MS = 45_000;

// A tab left open on a visible screen isn't someone using the app — the old
// "tab is visible" rule credited hours to an unattended page. Interaction
// within this window counts as active. It's generous on purpose: people watch
// a live auction for a while between bids without touching anything, and that
// is real use worth counting.
export const IDLE_TIMEOUT_MS = 10 * 60_000;

// Any of these means a person is at the keyboard/screen. Listened for in the
// capture phase because `scroll` doesn't bubble.
export const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "scroll"] as const;

export function shouldSendHeartbeat(input: { visible: boolean; lastInteractionAt: number; now: number }): boolean {
  return input.visible && input.now - input.lastInteractionAt <= IDLE_TIMEOUT_MS;
}
