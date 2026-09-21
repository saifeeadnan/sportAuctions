export const NAME_PART_MAX_LENGTH = 60;

/** User.name is a single column, so the profile form's separate first/last
 * inputs are just a view over it: first word vs. the rest. Recombining with
 * joinName reproduces a normally-spaced name exactly, so re-saving an
 * untouched form never changes it. */
export function splitName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim();
  const firstSpace = trimmed.indexOf(" ");
  if (firstSpace === -1) return { firstName: trimmed, lastName: "" };
  return { firstName: trimmed.slice(0, firstSpace), lastName: trimmed.slice(firstSpace + 1).trim() };
}

/** Returns the normalized single-column name, or a short error code — the
 * same code convention updateUserProfile's other validation failures use.
 * A last name is optional (single-word names exist, e.g. "Admin"). */
export function joinName(
  firstName: string,
  lastName: string
): { name: string } | { error: "name-required" | "name-too-long" } {
  const first = firstName.trim().replace(/\s+/g, " ");
  const last = lastName.trim().replace(/\s+/g, " ");
  if (!first) return { error: "name-required" };
  if (first.length > NAME_PART_MAX_LENGTH || last.length > NAME_PART_MAX_LENGTH) {
    return { error: "name-too-long" };
  }
  return { name: last ? `${first} ${last}` : first };
}
