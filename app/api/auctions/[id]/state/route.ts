import { NextResponse } from "next/server";
import { AuthError, requireSession } from "@/lib/auth/guards";
import { getAuctionState } from "@/lib/services/auctionState.service";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    throw error;
  }

  const { id } = await params;
  const state = await getAuctionState(id);
  if (!state) {
    return NextResponse.json({ error: "Auction not found" }, { status: 404 });
  }
  return NextResponse.json(state);
}
