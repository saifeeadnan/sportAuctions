import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/auth.config";
import { createAnalyticsSession, recordLogin } from "@/lib/services/analytics.service";

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

        const user = await prisma.user.findUnique({ where: { loginId } });
        if (!user) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

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
          role: user.role,
          leagueId: user.leagueId,
          analyticsSessionId: analyticsSession?.id ?? "",
        };
      },
    }),
  ],
});
