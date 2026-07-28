import { SponsorLink } from "@/components/tournament/SponsorLink";

type Sponsor = { id: string; name: string; websiteUrl: string | null };

/** A horizontal strip of sponsor logos for the bottom of a page — larger and
 * more prominent than SponsorRow's inline "Sponsored by" mention. */
export function SponsorRibbon({ sponsors }: { sponsors: Sponsor[] }) {
  if (sponsors.length === 0) return null;

  return (
    <div className="mt-4 pt-4 border-t border-black/[0.08] dark:border-white/10">
      <p className="text-xs text-black/50 dark:text-white/50 mb-2">Sponsors</p>
      <div className="flex flex-nowrap items-center gap-4 overflow-x-auto pb-2">
        {sponsors.map((sponsor) => {
          const logo = (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/tournament-sponsors/${sponsor.id}`}
              alt={sponsor.name}
              title={sponsor.name}
              className="h-28 w-28 rounded object-contain bg-white dark:bg-white/10 border border-black/10 dark:border-white/10 p-2"
            />
          );
          return sponsor.websiteUrl ? (
            <SponsorLink
              key={sponsor.id}
              sponsorId={sponsor.id}
              websiteUrl={sponsor.websiteUrl}
              className="shrink-0"
            >
              {logo}
            </SponsorLink>
          ) : (
            <span key={sponsor.id} className="shrink-0">
              {logo}
            </span>
          );
        })}
      </div>
    </div>
  );
}
