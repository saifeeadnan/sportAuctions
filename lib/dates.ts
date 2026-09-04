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
