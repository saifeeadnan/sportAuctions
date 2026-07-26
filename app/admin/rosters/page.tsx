import { RostersPanel } from "@/components/admin/RostersPanel";

export default async function RostersPage({
  searchParams,
}: {
  searchParams: Promise<{ league?: string }>;
}) {
  const { league } = await searchParams;
  return <RostersPanel selectedLeagueId={league} />;
}
