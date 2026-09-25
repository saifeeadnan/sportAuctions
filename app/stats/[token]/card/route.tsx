import { ImageResponse } from "next/og";
import { getPublicTournamentStats } from "@/lib/services/tournamentStats.service";
import { buildPlayerIndex, cardStats, findExactPlayer, playerStats } from "@/lib/statsPlayerView";

const WIDTH = 1200;
const HEIGHT = 630;

/** Long names and long values get smaller type so they still fit their space. */
const nameSize = (name: string) => (name.length > 30 ? 52 : name.length > 22 ? 64 : 76);
const valueSize = (value: string) => (value.length > 14 ? 24 : value.length > 8 ? 34 : 44);

/**
 * A picture of one player's stats — the image a link preview shows and the one
 * behind "Download image". Public, like the stats page itself: the token in the
 * URL is the only access control, so this never checks a session. It draws from
 * getPublicTournamentStats, so anything an admin hid is not on the card either.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const url = new URL(req.url);

  const stats = await getPublicTournamentStats(token);
  if (!stats) return new Response("Not found", { status: 404 });

  const index = buildPlayerIndex(stats.sheets);
  const player = findExactPlayer(index, url.searchParams.get("player") ?? "");
  if (!player) return new Response("Player not found", { status: 404 });

  const facts = cardStats(playerStats(index, player));
  const filename = `${player.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "player"}-stats.png`;
  const download = url.searchParams.get("download") === "1";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#05060c",
          backgroundImage: "radial-gradient(circle at 15% 0%, rgba(99,102,241,0.38), rgba(5,6,12,0) 60%)",
          padding: "44px 56px",
          fontFamily: "sans-serif",
          color: "#ffffff",
        }}
      >
        <div style={{ display: "flex", fontSize: 22, letterSpacing: 6, color: "#a5b4fc", textTransform: "uppercase" }}>
          Tournament statistics
        </div>
        <div style={{ display: "flex", fontSize: nameSize(player), fontWeight: 700, marginTop: 10, lineHeight: 1.05 }}>{player}</div>
        <div style={{ display: "flex", fontSize: 26, color: "rgba(255,255,255,0.6)", marginTop: 10 }}>
          {stats.leagueName}
          {stats.label ? ` · ${stats.label}` : ""}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 28 }}>
          {facts.map((fact, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                width: 258,
                height: 98,
                padding: "0 22px",
                borderRadius: 20,
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.10)",
              }}
            >
              <div style={{ display: "flex", fontSize: valueSize(fact.value), fontWeight: 700, lineHeight: 1.1 }}>{fact.value}</div>
              <div
                style={{
                  display: "flex",
                  fontSize: 18,
                  marginTop: 4,
                  color: "rgba(255,255,255,0.55)",
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                  textOverflow: "ellipsis",
                }}
              >
                {fact.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      headers: {
        "Cache-Control": "public, max-age=300",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      },
    }
  );
}
