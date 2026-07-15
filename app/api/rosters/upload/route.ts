import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { toErrorResponse } from "@/lib/api/errors";
import { parseRosterFile, createRosterFromUpload } from "@/lib/services/roster.service";

export async function POST(req: Request) {
  try {
    const session = await requireRole("ADMIN");

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
      const roster = await createRosterFromUpload(rosterName, validRows, session.user.id);
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
  } catch (error) {
    return toErrorResponse(error);
  }
}
