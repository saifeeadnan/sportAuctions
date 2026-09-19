"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/guards";
import { toActionResult, type ActionResult } from "@/lib/actions/result";
import { linkPlayerPhotoToProfile, linkPlayerPhotosToProfile } from "@/lib/services/playerPhoto.service";
import { ValidationError } from "@/lib/errors";

// The unused prevState param lets this bind directly into useActionState
// (ActionResultForm) as `linkPlayerPhotoToProfileAction.bind(null, playerId)`,
// same convention as createPlayerAction.
export async function linkPlayerPhotoToProfileAction(
  playerId: string,
  _prevState: unknown,
  _formData: FormData
): Promise<ActionResult> {
  return toActionResult(async () => {
    const session = await requireSession();
    await linkPlayerPhotoToProfile(session.user.id, playerId);
    revalidatePath("/profile");
  });
}

export async function linkSelectedPlayerPhotosToProfileAction(
  _prevState: unknown,
  formData: FormData
): Promise<ActionResult> {
  return toActionResult(async () => {
    const session = await requireSession();
    const playerIds = formData.getAll("playerIds").map(String);
    if (playerIds.length === 0) {
      throw new ValidationError("Select at least one roster photo to link");
    }
    await linkPlayerPhotosToProfile(session.user.id, playerIds);
    revalidatePath("/profile");
  });
}
