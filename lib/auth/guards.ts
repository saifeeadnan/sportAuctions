import { auth } from "@/auth";

export type Role = "ADMIN" | "TEAM_MANAGER" | "AUCTIONEER" | "VIEWER";

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export async function requireSession() {
  const session = await auth();
  if (!session?.user) {
    throw new AuthError("Not authenticated");
  }
  return session;
}

export async function requireRole(...roles: Role[]) {
  const session = await requireSession();
  if (!roles.includes(session.user.role as Role)) {
    throw new AuthError(`Requires role: ${roles.join(" or ")}`);
  }
  return session;
}
