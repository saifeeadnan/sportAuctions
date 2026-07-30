import type { NextAuthConfig } from "next-auth";

export const authConfig: NextAuthConfig = {
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) {
        token.id = (user as { id: string }).id;
        token.role = (user as { role: string }).role;
        token.leagueId = (user as { leagueId: string | null }).leagueId;
        token.analyticsSessionId = (user as { analyticsSessionId: string }).analyticsSessionId;
      }
      return token;
    },
    session: async ({ session, token }) => {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.leagueId = token.leagueId as string | null;
        session.user.analyticsSessionId = token.analyticsSessionId as string;
      }
      return session;
    },
  },
};
