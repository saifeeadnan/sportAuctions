import type { AuctionStatePlayer } from "@/lib/services/auctionState.service";
import { card } from "@/lib/ui";
import { DEFAULT_ON_CLOCK_VISIBLE_FIELDS, type OnClockTemplate, type OnClockFieldKey } from "@/lib/onClockDisplay";
import { ClassicTemplate } from "@/components/auction/onClockTemplates/ClassicTemplate";
import { PhotoFocusTemplate } from "@/components/auction/onClockTemplates/PhotoFocusTemplate";
import { StatsTableTemplate } from "@/components/auction/onClockTemplates/StatsTableTemplate";
import type { OnClockTemplateProps } from "@/components/auction/onClockTemplates/shared";

const TEMPLATE_COMPONENTS: Record<OnClockTemplate, (props: OnClockTemplateProps) => React.ReactElement> = {
  CLASSIC: ClassicTemplate,
  PHOTO_FOCUS: PhotoFocusTemplate,
  STATS_TABLE: StatsTableTemplate,
};

export function OnClockCard({
  player,
  template = "CLASSIC",
  visibleFields = DEFAULT_ON_CLOCK_VISIBLE_FIELDS,
  photoWidth = 128,
  photoHeight = 128,
}: {
  player?: AuctionStatePlayer;
  template?: OnClockTemplate;
  visibleFields?: OnClockFieldKey[];
  photoWidth?: number;
  photoHeight?: number;
}) {
  if (!player) {
    return (
      <div className={`${card} px-4 py-6 text-center`}>
        <p className="text-black/60 dark:text-white/60">No player is currently on the clock.</p>
      </div>
    );
  }
  const Template = TEMPLATE_COMPONENTS[template];
  return <Template player={player} visibleFields={visibleFields} photoWidth={photoWidth} photoHeight={photoHeight} />;
}
