import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/guards";
import { toErrorResponse } from "@/lib/api/errors";
import { getAuctionState } from "@/lib/services/auctionState.service";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const { id } = await params;
    const state = await getAuctionState(id);
    if (!state) {
      return NextResponse.json({ error: "Auction not found" }, { status: 404 });
    }
    return NextResponse.json(state);
  } catch (error) {
    return toErrorResponse(error);
  }
}
