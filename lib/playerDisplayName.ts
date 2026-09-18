/** "Abdulqadir Zumkhawala" -> "Abdulqadir Z." — keeps compact team-roster
 * displays (auctioneer console allocations, broadcast ticker) from getting
 * crowded with full names. */
export function shortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return fullName;
  const first = parts[0];
  const lastInitial = parts[parts.length - 1][0];
  return `${first} ${lastInitial}.`;
}
