import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/errors";

export type RegisterSelfInput = {
  leagueId: string;
  loginId: string;
  password: string;
  confirmPassword: string;
};

/**
 * Self-service registration for a new user. Always creates a VIEWER account,
 * matched to an existing Player row (so fantasy-team eligibility and the
 * roster self-lock feature work immediately), and always inactive until a
 * League Admin approves it — mirrors the login/session guarantees already
 * enforced for disabled accounts in auth.ts, not new logic.
 */
export async function registerSelf(input: RegisterSelfInput) {
  const loginId = input.loginId.trim().toLowerCase();
  if (!loginId) throw new ValidationError("missing-login-id");
  if (input.password.length < 8) throw new ValidationError("short-password");
  if (input.password !== input.confirmPassword) throw new ValidationError("password-mismatch");

  const league = await prisma.league.findUnique({ where: { id: input.leagueId } });
  if (!league) throw new ValidationError("invalid-league");

  const existingUser = await prisma.user.findFirst({
    where: { loginId: { equals: loginId, mode: "insensitive" } },
  });
  if (existingUser) throw new ValidationError("already-registered");

  const player = await prisma.player.findFirst({
    where: {
      loginId: { equals: loginId, mode: "insensitive" },
      roster: { leagueId: league.id },
    },
  });
  if (!player) throw new ValidationError("player-not-found");

  const passwordHash = await bcrypt.hash(input.password, 10);

  return prisma.user.create({
    data: {
      loginId,
      name: player.name,
      role: "VIEWER",
      leagueId: league.id,
      passwordHash,
      isActive: false,
    },
  });
}
