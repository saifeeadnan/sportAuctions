import Link from "next/link";
import { card, buttonPrimary } from "@/lib/ui";

const FEATURES: { title: string; description: string; icon: React.ReactNode }[] = [
  {
    title: "Roster management",
    description:
      "Upload player rosters with batting, bowling, and fielding ratings, then reuse them across seasons.",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 4.5a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM3.5 19.5a5.5 5.5 0 0 1 11 0M16.5 8.5a2.5 2.5 0 1 0 0-5M20.5 19.5a4.5 4.5 0 0 0-6.16-4.19"
      />
    ),
  },
  {
    title: "Pre-auction draft",
    description:
      "Managers pick their targets ahead of time. Contested picks flow straight into the live pool automatically.",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 4.5h6a1 1 0 0 1 1 1V6h-8v-.5a1 1 0 0 1 1-1ZM6 6h12v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V6ZM9 12.5l2 2 4-4.5"
      />
    ),
  },
  {
    title: "Live bidding console",
    description:
      "Run the auction with budget and squad-slot guardrails, random pick order, and instant updates everywhere.",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m14.5 3.5 6 6M2.5 21.5l5-1.2a2 2 0 0 0 1.06-.58l9.6-9.6a1.5 1.5 0 0 0 0-2.12l-2.6-2.6a1.5 1.5 0 0 0-2.12 0l-9.6 9.6a2 2 0 0 0-.58 1.06L2.5 21.5Z"
      />
    ),
  },
  {
    title: "Team strength analytics",
    description:
      "Watch squad balance and a computed strength score update live as every team fills out its roster.",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 20V10M10 20V4M16 20v-7M22 20H2"
      />
    ),
  },
];

export function LandingHero() {
  return (
    <div className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-20"
        style={{
          backgroundImage:
            "radial-gradient(55% 45% at 50% -5%, rgba(99,102,241,0.28), transparent 60%), radial-gradient(35% 35% at 88% 12%, rgba(16,185,129,0.16), transparent 60%), radial-gradient(35% 35% at 6% 18%, rgba(217,70,239,0.16), transparent 60%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 dark:hidden"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(0,0,0,0.09) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          maskImage: "linear-gradient(to bottom, black, transparent 75%)",
          WebkitMaskImage: "linear-gradient(to bottom, black, transparent 75%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 hidden dark:block"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.09) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          maskImage: "linear-gradient(to bottom, black, transparent 75%)",
          WebkitMaskImage: "linear-gradient(to bottom, black, transparent 75%)",
        }}
      />

      <div className="mx-auto max-w-5xl px-4 pt-20 pb-24 sm:pt-28 sm:pb-32">
        <div className="text-center">
          <span className="inline-flex items-center rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-700 dark:text-indigo-300">
            Draft &middot; bid &middot; win — all in one place
          </span>
          <h1 className="mt-5 text-4xl sm:text-6xl font-bold tracking-tight">
            <span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 dark:from-indigo-400 dark:via-violet-400 dark:to-fuchsia-400 bg-clip-text text-transparent">
              Sports Team
            </span>
            <br />
            Player Auction
          </h1>
          <p className="mt-5 text-lg text-black/60 dark:text-white/60 max-w-2xl mx-auto">
            Upload rosters, run pre-auction drafts, and bid live — with budgets, squad slots, and
            team strength tracked automatically for every team.
          </p>
          <div className="mt-8 flex justify-center">
            <Link href="/login" className={`${buttonPrimary} px-6 py-3 text-base`}>
              Log in to get started
            </Link>
          </div>
        </div>

        <div className="mt-20 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className={`${card} p-5`}>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 mb-3">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.75}
                  className="h-5 w-5"
                >
                  {f.icon}
                </svg>
              </div>
              <h2 className="font-medium mb-1">{f.title}</h2>
              <p className="text-sm text-black/60 dark:text-white/60">{f.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
