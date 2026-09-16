/** How many of `soldPlayers` are on `teamEntryId`'s roster in `categoryName`.
 * `soldPlayers` should already be filtered to SOLD status by the caller. */
export function countInCategory<T extends { soldToEntryId: string | null; categoryName: string }>(
  soldPlayers: T[],
  teamEntryId: string,
  categoryName: string
): number {
  return soldPlayers.filter((p) => p.soldToEntryId === teamEntryId && p.categoryName === categoryName).length;
}

/** `cap == null` means no cap was configured — never "at or over". */
export function isAtOrOverCap(count: number, cap: number | null | undefined): boolean {
  return cap != null && count >= cap;
}
