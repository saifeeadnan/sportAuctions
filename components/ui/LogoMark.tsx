// The LeagueForge mark: a forge hammer mid-strike, doubling as an auctioneer's
// gavel. `currentColor` drives the hammer so it adapts to light/dark text
// color wherever it's placed; the flame keeps its own fixed warm gradient.
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <defs>
        <radialGradient id="lf-flame-grad" cx="35%" cy="20%" r="90%">
          <stop offset="0%" stopColor="#F5B84C" />
          <stop offset="100%" stopColor="#E8531F" />
        </radialGradient>
      </defs>
      <g transform="translate(53,48) rotate(-42)" fill="currentColor">
        <polygon points="-2.5,-36 2.5,-36 5,3 -5,3" />
        <rect x="-17" y="-3" width="34" height="18" rx="9" />
      </g>
      <g transform="translate(50.4,68) rotate(12)">
        <path
          d="M0,-13 Q9,-2 4,8 Q2,13 0,13 Q-2,13 -4,6 Q-6,-2 0,-13 Z"
          fill="url(#lf-flame-grad)"
        />
      </g>
    </svg>
  );
}
