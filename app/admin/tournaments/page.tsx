import { TournamentsPanel } from "@/components/admin/TournamentsPanel";

export default async function TournamentsPage({
  searchParams,
}: {
  searchParams: Promise<{ league?: string }>;
}) {
  const { league } = await searchParams;
  return <TournamentsPanel selectedLeagueId={league} />;
}
