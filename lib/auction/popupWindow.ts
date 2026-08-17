"use client";

/**
 * Opens a page as a real separate browser window (not an in-page overlay) —
 * sized generously and centered against the screen the click happened on,
 * capped so it never requests more than the screen actually has. Must be
 * called synchronously from a click handler (no `await` before it) or popup
 * blockers will swallow it.
 */
function openCenteredPopup(path: string, windowKey: string) {
  const width = Math.min(1400, window.screen.availWidth - 80);
  const height = Math.min(950, window.screen.availHeight - 80);
  const left = Math.max(0, Math.round((window.screen.availWidth - width) / 2));
  const top = Math.max(0, Math.round((window.screen.availHeight - height) / 2));

  window.open(path, windowKey, `width=${width},height=${height},left=${left},top=${top},noopener,noreferrer`);
}

export function openAnalyticsDashboardWindow(teamAuctionEntryId: string) {
  openCenteredPopup(`/manager/teams/${teamAuctionEntryId}/analytics`, `analytics-dashboard-${teamAuctionEntryId}`);
}

/** Same as openAnalyticsDashboardWindow, but for the parallel v2 console —
 * a distinct window key so both can be open side by side for comparison. */
export function openAnalyticsV2DashboardWindow(teamAuctionEntryId: string) {
  openCenteredPopup(
    `/manager/teams/${teamAuctionEntryId}/analytics-v2`,
    `analytics-v2-dashboard-${teamAuctionEntryId}`
  );
}
