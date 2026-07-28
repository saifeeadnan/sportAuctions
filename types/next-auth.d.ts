import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      leagueId: string | null;
      analyticsSessionId: string;
    } & DefaultSession["user"];
  }

  interface User {
    role: string;
    leagueId: string | null;
    analyticsSessionId: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: string;
    leagueId: string | null;
    analyticsSessionId: string;
  }
}
