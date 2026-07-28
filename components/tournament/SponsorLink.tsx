"use client";

export function SponsorLink({
  sponsorId,
  websiteUrl,
  className,
  children,
}: {
  sponsorId: string;
  websiteUrl: string;
  className?: string;
  children: React.ReactNode;
}) {
  function handleClick() {
    // Fire-and-forget — no preventDefault, no await, so the anchor's native
    // target="_blank" navigation is never delayed or blocked by this call.
    fetch("/api/analytics/sponsor-click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sponsorId }),
      keepalive: true,
    }).catch(() => {});
  }

  return (
    <a
      href={websiteUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={handleClick}
    >
      {children}
    </a>
  );
}
