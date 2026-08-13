import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, scopeLeagueId, assertInScope, AuthError } from "@/lib/auth/guards";
import { toErrorResponse } from "@/lib/api/errors";
import { getTeamSponsorImageContent } from "@/lib/services/teamSponsorImage.service";

const SIZE = 1080;
const MAX_PLAYERS_SHOWN = 15;
const AVATAR_COLORS = ["#6366F1", "#F0653F", "#38BDF8", "#4ADE80", "#F472B6", "#FBBF24"];
const EXTENSION_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0]?.[0] ?? "?").toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/**
 * A player's photoUrl is either a relative path into this app's own public/
 * directory (the common case for a bulk-imported roster — read straight off
 * disk, no network round-trip) or a full external URL with no uptime
 * guarantee (fetched with a short timeout). Either way, any failure just
 * falls back to an initials avatar rather than failing the whole card.
 */
async function loadPhotoAsDataUri(photoUrl: string, timeoutMs = 4000): Promise<string | null> {
  try {
    if (photoUrl.startsWith("/")) {
      const filePath = path.join(process.cwd(), "public", photoUrl);
      const buffer = await readFile(filePath);
      const ext = path.extname(photoUrl).slice(1).toLowerCase();
      const mimeType = EXTENSION_MIME[ext] ?? "image/jpeg";
      return `data:${mimeType};base64,${buffer.toString("base64")}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(photoUrl, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const buffer = Buffer.from(await res.arrayBuffer());
    return `data:${contentType};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  try {
    const { id: auctionId, entryId } = await params;

    const entry = await prisma.teamAuctionEntry.findUnique({
      where: { id: entryId },
      include: { team: true, auction: { include: { tournament: { include: { league: true } } } } },
    });
    if (!entry || entry.auctionId !== auctionId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const session = await requireSession();
    if (session.user.role === "TEAM_MANAGER") {
      if (entry.team.managerId !== session.user.id) {
        throw new AuthError("You do not manage this team");
      }
    } else if (session.user.role === "ADMIN" || session.user.role === "LEAGUE_ADMIN") {
      assertInScope(scopeLeagueId(session), entry.auction.tournament.leagueId);
    } else {
      throw new AuthError("Not authorized to view this team's roster card");
    }

    const confirmedPlayers = await prisma.auctionPlayer.findMany({
      where: { soldToEntryId: entryId },
      include: { player: true, category: true },
      orderBy: { player: { name: "asc" } },
    });
    const shown = confirmedPlayers.slice(0, MAX_PLAYERS_SHOWN);
    const overflowCount = confirmedPlayers.length - shown.length;

    const [sponsorImage, playerPhotoDataUris] = await Promise.all([
      getTeamSponsorImageContent(entry.teamId),
      Promise.all(
        shown.map((ap) => (ap.player.photoUrl ? loadPhotoAsDataUri(ap.player.photoUrl) : null))
      ),
    ]);

    const sponsorDataUri = sponsorImage
      ? `data:${sponsorImage.mimeType};base64,${Buffer.from(sponsorImage.data).toString("base64")}`
      : null;

    const downloadFilename = `${entry.team.name.replace(/[^a-z0-9-]+/gi, "-")}-roster.png`;

    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            background: "#000000",
            padding: "72px 64px",
            fontFamily: "sans-serif",
          }}
        >
          {/* Team identity */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            {sponsorDataUri ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={sponsorDataUri}
                width={180}
                height={180}
                style={{
                  borderRadius: 24,
                  objectFit: "contain",
                  background: "white",
                  padding: 16,
                }}
              />
            ) : (
              <div
                style={{
                  display: "flex",
                  width: 180,
                  height: 180,
                  borderRadius: "50%",
                  background: colorFor(entry.team.name),
                  color: "white",
                  fontSize: 64,
                  fontWeight: 700,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {initials(entry.team.name)}
              </div>
            )}
            <div
              style={{
                fontSize: 54,
                fontWeight: 700,
                color: "#FFFFFF",
                marginTop: 20,
                textAlign: "center",
              }}
            >
              {entry.team.name}
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                fontSize: 24,
                color: "#9CA3AF",
                marginTop: 6,
              }}
            >
              {entry.auction.tournament.name} · {entry.auction.tournament.league.name}
            </div>
          </div>

          {/* Player grid */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: 20,
              marginTop: 48,
              flex: 1,
              alignContent: "flex-start",
            }}
          >
            {shown.map((ap, i) => {
              const photo = playerPhotoDataUris[i];
              return (
                <div
                  key={ap.id}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    width: 150,
                  }}
                >
                  {photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photo}
                      width={125}
                      height={125}
                      style={{ borderRadius: "50%", objectFit: "cover" }}
                    />
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        width: 125,
                        height: 125,
                        borderRadius: "50%",
                        background: colorFor(ap.player.name),
                        color: "white",
                        fontSize: 39,
                        fontWeight: 700,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {initials(ap.player.name)}
                    </div>
                  )}
                  <div
                    style={{
                      fontSize: 19,
                      fontWeight: 600,
                      color: "#FFFFFF",
                      marginTop: 10,
                      textAlign: "center",
                    }}
                  >
                    {ap.player.name}
                  </div>
                  <div style={{ fontSize: 15, color: "#9CA3AF", marginTop: 2 }}>
                    {ap.category.name}
                  </div>
                </div>
              );
            })}
            {overflowCount > 0 && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 150,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    width: 125,
                    height: 125,
                    borderRadius: "50%",
                    background: "#374151",
                    color: "#F9FAFB",
                    fontSize: 34,
                    fontWeight: 700,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {`+${overflowCount}`}
                </div>
                <div style={{ fontSize: 15, color: "#9CA3AF", marginTop: 10 }}>more</div>
              </div>
            )}
          </div>
        </div>
      ),
      {
        width: SIZE,
        height: SIZE,
        headers: { "Content-Disposition": `attachment; filename="${downloadFilename}"` },
      }
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
