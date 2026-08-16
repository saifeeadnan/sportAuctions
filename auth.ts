import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/auth.config";
import { createAnalyticsSession, recordLogin } from "@/lib/services/analytics.service";

// A distinct `code` (surfaced via the thrown error, not the generic "wrong
// credentials" case) so the login page can show a specific message instead
// of implying the password was wrong.
export class AccountDisabledSignin extends CredentialsSignin {
  code = "account_disabled";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        loginId: { label: "Login ID", type: "text" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials, request) => {
        const loginId = credentials?.loginId as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!loginId || !password) return null;

        const user = await prisma.user.findUnique({
          where: { loginId },
          // Only active (approved) memberships grant session access — a
          // pending self-registration for a second league shouldn't let
          // someone act in that league until its admin approves it.
          include: { memberships: { where: { isActive: true }, select: { leagueId: true, role: true } } },
        });
        if (!user) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        // Checked only after the password is confirmed correct, so a
        // brute-force attempt against an unknown password can't be used to
        // probe whether an account has been disabled.
        if (!user.isActive) throw new AccountDisabledSignin();

        // Analytics writes are best-effort — a hiccup here must never block a
        // legitimate login.
        const analyticsSession = await createAnalyticsSession(user.id).catch((err) => {
          console.error("[analytics] failed to create session:", err);
          return null;
        });
        await recordLogin({
          userId: user.id,
          ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
          userAgent: request.headers.get("user-agent") ?? undefined,
        }).catch((err) => console.error("[analytics] failed to record login:", err));

        return {
          id: user.id,
          name: user.name,
          isSiteAdmin: user.isSiteAdmin,
          memberships: user.memberships,
          analyticsSessionId: analyticsSession?.id ?? "",
        };
      },
    }),
  ],
});
