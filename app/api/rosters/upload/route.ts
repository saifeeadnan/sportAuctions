import { NextResponse } from "next/server";
import { AuthError, requireRole } from "@/lib/auth/guards";
import { parseRosterFile, createRosterFromUpload } from "@/lib/services/roster.service";

export async function POST(req: Request) {
  let session;
  try {
    session = await requireRole("ADMIN");
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const rosterName = String(formData.get("rosterName") ?? "");
  const mode = String(formData.get("mode") ?? "preview");

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const { validRows, errors } = parseRosterFile(buffer, file.name);

  if (mode === "commit") {
    const roster = await createRosterFromUpload(
      rosterName,
      validRows,
      session.user.id
    );
    return NextResponse.json({
      rosterId: roster.id,
      validCount: validRows.length,
      errorCount: errors.length,
    });
  }

  return NextResponse.json({
    validCount: validRows.length,
    errors,
    sample: validRows.slice(0, 10),
  });
}
