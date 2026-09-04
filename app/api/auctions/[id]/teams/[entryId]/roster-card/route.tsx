import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, allLeagueIds, assertInScope, AuthError } from "@/lib/auth/guards";
import { toErrorResponse } from "@/lib/api/errors";
import { getTeamSponsorImageContent } from "@/lib/services/teamSponsorImage.service";
import { isSafePublicUrl } from "@/lib/security/ssrf";

const SIZE = 1080;
const MAX_PLAYERS_SHOWN = 15;
const PLAYER_PHOTO_SIZE = 250;
const SPONSOR_LOGO_SIZE = 200;
const AVATAR_COLORS = ["#6366F1", "#F0653F", "#38BDF8", "#4ADE80", "#F472B6", "#FBBF24"];

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
 *
 * Source photos can be multi-megabyte, multi-megapixel camera originals —
 * Satori has to decode each embedded image to a raw pixel buffer to
 * composite it, and leaving them full-size was enough to get the whole
 * process OOM-killed on a small hosting instance. Resizing down to roughly
 * display size first (via sharp) keeps that decode cheap regardless of how
 * large the source file is.
 */
async function loadPhotoAsDataUri(photoUrl: string, timeoutMs = 4000): Promise<string | null> {
  try {
    let buffer: Buffer;
    if (photoUrl.startsWith("/")) {
      const filePath = path.join(process.cwd(), "public", photoUrl);
      buffer = await readFile(filePath);
    } else {
      // SSRF guard — this is a server-side fetch of a URL an admin typed
      // into a roster upload, so it must never be trusted to point at an
      // internal/private address (e.g. a cloud metadata endpoint).
      if (!(await isSafePublicUrl(photoUrl))) return null;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      // Redirects are rejected rather than followed — a redirect target
      // could point at an internal address even when the original URL
      // passed the safety check above.
      const res = await fetch(photoUrl, { signal: controller.signal, redirect: "manual" });
      clearTimeout(timeout);
      if (!res.ok) return null;
      buffer = Buffer.from(await res.arrayBuffer());
    }

    const resized = await sharp(buffer)
      .resize(PLAYER_PHOTO_SIZE, PLAYER_PHOTO_SIZE, { fit: "cover" })
      .jpeg({ quality: 82 })
      .toBuffer();
    return `data:image/jpeg;base64,${resized.toString("base64")}`;
  } catch {
    return null;
  }
}

/** Same over-sized-source concern as player photos — an admin-uploaded logo
 * could be an arbitrarily large PNG/JPEG. Resized before embedding, keeping
 * the original format (and transparency, for a PNG logo) rather than
 * normalizing to JPEG the way player photos are. */
async function resizeSponsorLogo(data: Buffer, mimeType: string): Promise<string | null> {
  try {
    const resized = await sharp(data)
      .resize(SPONSOR_LOGO_SIZE, SPONSOR_LOGO_SIZE, { fit: "inside", withoutEnlargement: true })
      .toBuffer();
    return `data:${mimeType};base64,${resized.toString("base64")}`;
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
      include: { team: true, auction: { include: { tournament: true } } },
    });
    if (!entry || entry.auctionId !== auctionId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const session = await requireSession();
    const isManager = session.user.memberships.some((m) => m.role === "TEAM_MANAGER");
    const isAdminRole =
      session.user.isSiteAdmin || session.user.memberships.some((m) => m.role === "LEAGUE_ADMIN");
    if (isManager) {
      if (entry.team.managerId !== session.user.id) {
        throw new AuthError("You do not manage this team");
      }
    } else if (isAdminRole) {
      assertInScope(allLeagueIds(session), entry.auction.tournament.leagueId);
    } else {
      throw new AuthError("Not authorized to view this team's roster card");
    }

    const confirmedPlayers = await prisma.auctionPlayer.findMany({
      where: { soldToEntryId: entryId },
      include: { player: true, category: true },
      orderBy: { player: { name: "asc" } },
    });
    // The captain (if assigned) leads the card, ahead of the alphabetical
    // order everyone else keeps — sorted before the MAX_PLAYERS_SHOWN slice
    // so a captain is never pushed into the "+N more" overflow tile.
    const captainId = entry.captainAuctionPlayerId;
    const orderedPlayers = captainId
      ? [
          ...confirmedPlayers.filter((ap) => ap.id === captainId),
          ...confirmedPlayers.filter((ap) => ap.id !== captainId),
        ]
      : confirmedPlayers;
    const shown = orderedPlayers.slice(0, MAX_PLAYERS_SHOWN);
    const overflowCount = orderedPlayers.length - shown.length;

    // Processed one at a time (not Promise.all) — each source photo can be a
    // multi-megabyte camera original, and decoding several of those
    // concurrently is exactly what was spiking memory enough to get the
    // whole process OOM-killed; sequential keeps the peak bounded.
    const sponsorImage = await getTeamSponsorImageContent(entry.teamId);
    const playerPhotoDataUris: (string | null)[] = [];
    for (const ap of shown) {
      playerPhotoDataUris.push(
        ap.player.photoUrl ? await loadPhotoAsDataUri(ap.player.photoUrl) : null
      );
    }

    const sponsorDataUri = sponsorImage
      ? await resizeSponsorLogo(Buffer.from(sponsorImage.data), sponsorImage.mimeType)
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
            {!sponsorDataUri && (
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
            )}
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
                  {ap.id === captainId && (
                    // Its own line below the name, not inline beside it — a
                    // wrapped two-line name would otherwise leave "(C)"
                    // vertically stranded between the lines.
                    <div
                      style={{
                        display: "flex",
                        marginTop: 4,
                        padding: "1px 10px",
                        borderRadius: 999,
                        background: "rgba(245, 158, 11, 0.15)",
                        color: "#FBBF24",
                        fontSize: 14,
                        fontWeight: 700,
                      }}
                    >
                      (C)
                    </div>
                  )}
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
