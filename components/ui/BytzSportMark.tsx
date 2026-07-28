// A small badge mark for BytzSport.AI, LeagueForge's parent product — a
// notched-corner "chip" shape (digital/tech) with a single center node (a
// byte/data point), kept simple since it only ever appears at byline size.
export function BytzSportMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M5 4h10.5L19 7.5V20H8.5L5 16.5V4Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
    </svg>
  );
}
