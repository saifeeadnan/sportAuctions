/**
 * Tournament start/end dates are stored as UTC-midnight timestamps (parsed
 * from a plain "YYYY-MM-DD" `<input type="date">` value — the ECMAScript
 * date-only string format is always interpreted as UTC) but represent a pure
 * calendar date with no time-of-day meaning. Reading them back with
 * local-timezone methods (`.toDateString()`, `new Date(x).getFullYear()`,
 * etc.) can shift the displayed date by a day whenever the server's local
 * timezone is behind UTC. These helpers read/write using UTC fields
 * consistently, so what's displayed always matches what was actually typed.
 */

export function toDateInputValue(date: Date | string): string {
  return new Date(date).toISOString().slice(0, 10);
}

export function formatCalendarDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** The named zone a deadline like the fantasy lock date is set and shown
 * in — a fixed zone, not each viewer's own device zone, since a deadline
 * has to mean the same instant no matter who's looking at it or where the
 * admin who set it happened to be sitting. Matches formatDateTime's "ET". */
export const DEADLINE_TIME_ZONE = "America/New_York";

/** Formats a real instant as the "YYYY-MM-DDTHH:mm" wall-clock string it
 * reads as in `timeZone` — the value to preload into an
 * `<input type="datetime-local">` so the field shows (and edits) the time in
 * that zone rather than whatever zone the browser's OS happens to be set
 * to. */
export function toZonedDateTimeInputValue(date: Date | string, timeZone: string): string {
  const parts = zonedParts(new Date(date), timeZone);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/**
 * Inverse of the above: parses a "YYYY-MM-DDTHH:mm" (or with seconds)
 * wall-clock string AS IF it were local time in `timeZone`, returning the
 * real UTC instant. There's no built-in "construct a Date from zoned
 * wall-clock components," so this uses the standard Intl-based trick: guess
 * an instant, see what wall-clock that guess actually reads as in
 * `timeZone` (which reveals that zone's UTC offset AT THAT GUESS), and
 * correct the guess by the difference — repeated to a fixed point, since a
 * single correction can guess an instant on the wrong side of a DST
 * transition (its offset differs from the offset that applies to the real
 * answer); two more passes always converges for any real-world zone, since
 * a correction can cross at most one transition at a time.
 */
export function fromZonedDateTimeInputValue(value: string, timeZone: string): Date {
  const [datePart, timePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute, second] = (timePart ?? "00:00").split(":").map(Number);
  const wallClockAsUtcMs = Date.UTC(year, month - 1, day, hour, minute, second || 0);

  let guessMs = wallClockAsUtcMs;
  for (let i = 0; i < 3; i++) {
    const parts = zonedParts(new Date(guessMs), timeZone);
    const guessReadsAsMs = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute)
    );
    const offsetAtGuessMs = guessReadsAsMs - guessMs;
    guessMs = wallClockAsUtcMs - offsetAtGuessMs;
  }
  return new Date(guessMs);
}

function zonedParts(date: Date, timeZone: string) {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  return Object.fromEntries(formatted.map((p) => [p.type, p.value])) as Record<
    "year" | "month" | "day" | "hour" | "minute",
    string
  >;
}

/**
 * A real instant (a points upload, a login) rather than a calendar date — so
 * unlike formatCalendarDate this is NOT UTC-pinned. Rendered in Eastern time
 * ("America/New_York", not a fixed "EST" offset, so it stays right across the
 * EST/EDT switch) with an explicit "ET" suffix — the admin analytics page's
 * long-standing convention. Component options rather than dateStyle/timeStyle
 * so Hermes (the mobile app imports this file too) renders the same string
 * as V8 does.
 */
export function formatDateTime(date: Date | string): string {
  return (
    new Date(date).toLocaleString("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }) + " ET"
  );
}
