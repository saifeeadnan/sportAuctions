import { requireRole } from "@/lib/auth/guards";
import {
  getLoginSummary,
  getTimeSpentSummary,
  getSponsorClickSummary,
} from "@/lib/services/analytics.service";
import { card } from "@/lib/ui";
import { Badge } from "@/components/ui/Badge";

function formatDuration(ms: number) {
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

// "America/New_York" (not a fixed "EST" offset) so this stays correct across
// the EST/EDT daylight-saving switch instead of drifting an hour off twice a year.
function formatEastern(date: Date) {
  return (
    date.toLocaleString("en-US", {
      timeZone: "America/New_York",
      dateStyle: "medium",
      timeStyle: "short",
    }) + " ET"
  );
}

export default async function AdminAnalyticsPage() {
  await requireRole("ADMIN");

  const [logins, timeSpent, sponsorClicks] = await Promise.all([
    getLoginSummary(),
    getTimeSpentSummary(),
    getSponsorClickSummary(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold mb-1">Analytics</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Logins, time spent, and sponsor link engagement across the site.
        </p>
      </div>

      <section>
        <h2 className="text-lg font-medium mb-3">
          Recent logins <span className="text-black/50 dark:text-white/50">({logins.total} total)</span>
        </h2>
        {logins.recent.length === 0 ? (
          <p className="text-sm text-black/60 dark:text-white/60">No logins recorded yet.</p>
        ) : (
          <div className={`${card} overflow-x-auto`}>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left border-b border-black/10 dark:border-white/10">
                  <th className="py-2 pl-4 pr-4">User</th>
                  <th className="py-2 pr-4">Role</th>
                  <th className="py-2 pr-4">When</th>
                  <th className="py-2 pr-4">IP</th>
                </tr>
              </thead>
              <tbody>
                {logins.recent.map((event) => (
                  <tr key={event.id} className="border-b border-black/5 dark:border-white/5 last:border-0">
                    <td className="py-2 pl-4 pr-4">
                      {event.user.name} <span className="text-black/50 dark:text-white/50">({event.user.loginId})</span>
                    </td>
                    <td className="py-2 pr-4">
                      <Badge variant="info">{event.user.role}</Badge>
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap">{formatEastern(event.loginAt)}</td>
                    <td className="py-2 pr-4 text-black/50 dark:text-white/50">{event.ipAddress ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-medium mb-3">Time spent</h2>
        {timeSpent.length === 0 ? (
          <p className="text-sm text-black/60 dark:text-white/60">No session data recorded yet.</p>
        ) : (
          <div className={`${card} overflow-x-auto`}>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left border-b border-black/10 dark:border-white/10">
                  <th className="py-2 pl-4 pr-4">User</th>
                  <th className="py-2 pr-4">Role</th>
                  <th className="py-2 pr-4">Sessions</th>
                  <th className="py-2 pr-4">Total time</th>
                </tr>
              </thead>
              <tbody>
                {timeSpent.map((row) => (
                  <tr key={row.userId} className="border-b border-black/5 dark:border-white/5 last:border-0">
                    <td className="py-2 pl-4 pr-4">
                      {row.name} <span className="text-black/50 dark:text-white/50">({row.loginId})</span>
                    </td>
                    <td className="py-2 pr-4">
                      <Badge variant="info">{row.role}</Badge>
                    </td>
                    <td className="py-2 pr-4">{row.sessionCount}</td>
                    <td className="py-2 pr-4">{formatDuration(row.totalMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-medium mb-3">Sponsor link clicks</h2>
        {sponsorClicks.length === 0 ? (
          <p className="text-sm text-black/60 dark:text-white/60">No sponsor link clicks recorded yet.</p>
        ) : (
          <div className={`${card} overflow-x-auto`}>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left border-b border-black/10 dark:border-white/10">
                  <th className="py-2 pl-4 pr-4">Sponsor</th>
                  <th className="py-2 pr-4">Tournament</th>
                  <th className="py-2 pr-4">Clicks</th>
                </tr>
              </thead>
              <tbody>
                {sponsorClicks.map((row) => (
                  <tr key={row.sponsorId} className="border-b border-black/5 dark:border-white/5 last:border-0">
                    <td className="py-2 pl-4 pr-4">{row.sponsorName}</td>
                    <td className="py-2 pr-4 text-black/60 dark:text-white/60">{row.tournamentName ?? "—"}</td>
                    <td className="py-2 pr-4">{row.clicks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
