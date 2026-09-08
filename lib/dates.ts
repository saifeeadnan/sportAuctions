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
