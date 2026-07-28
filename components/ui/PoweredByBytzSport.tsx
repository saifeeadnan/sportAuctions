import { BytzSportMark } from "@/components/ui/BytzSportMark";

export function PoweredByBytzSport({ className = "" }: { className?: string }) {
  return (
    <p
      className={`inline-flex items-center gap-1.5 text-xs text-black/50 dark:text-white/50 ${className}`}
    >
      <BytzSportMark className="h-3.5 w-3.5 shrink-0" />
      A BytzSport.AI product
    </p>
  );
}
