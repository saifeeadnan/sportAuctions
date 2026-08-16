import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      isSiteAdmin: boolean;
      memberships: { leagueId: string; role: string }[];
      analyticsSessionId: string;
    } & DefaultSession["user"];
  }

  interface User {
    isSiteAdmin: boolean;
    memberships: { leagueId: string; role: string }[];
    analyticsSessionId: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    isSiteAdmin: boolean;
    memberships: { leagueId: string; role: string }[];
    analyticsSessionId: string;
  }
}
