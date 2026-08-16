import type { NextAuthConfig } from "next-auth";

export const authConfig: NextAuthConfig = {
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) {
        const u = user as {
          id: string;
          isSiteAdmin: boolean;
          memberships: { leagueId: string; role: string }[];
          analyticsSessionId: string;
        };
        token.id = u.id;
        token.isSiteAdmin = u.isSiteAdmin;
        token.memberships = u.memberships;
        token.analyticsSessionId = u.analyticsSessionId;
      }
      return token;
    },
    session: async ({ session, token }) => {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.isSiteAdmin = token.isSiteAdmin as boolean;
        session.user.memberships = token.memberships as { leagueId: string; role: string }[];
        session.user.analyticsSessionId = token.analyticsSessionId as string;
      }
      return session;
    },
  },
};
