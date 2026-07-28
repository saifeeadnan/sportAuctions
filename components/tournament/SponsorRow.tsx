import { SponsorLink } from "@/components/tournament/SponsorLink";

type Sponsor = { id: string; name: string; websiteUrl: string | null };

export function SponsorRow({ sponsors }: { sponsors: Sponsor[] }) {
  if (sponsors.length === 0) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap mt-2">
      <span className="text-xs text-black/50 dark:text-white/50">Sponsored by</span>
      {sponsors.map((sponsor) => {
        const logo = (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/tournament-sponsors/${sponsor.id}`}
            alt={sponsor.name}
            title={sponsor.name}
            className="h-8 w-8 rounded object-contain bg-white dark:bg-white/10 border border-black/10 dark:border-white/10 p-1"
          />
        );
        return sponsor.websiteUrl ? (
          <SponsorLink key={sponsor.id} sponsorId={sponsor.id} websiteUrl={sponsor.websiteUrl}>
            {logo}
          </SponsorLink>
        ) : (
          <span key={sponsor.id}>{logo}</span>
        );
      })}
    </div>
  );
}
