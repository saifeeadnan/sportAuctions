import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        loginId: { label: "Login ID", type: "text" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const loginId = credentials?.loginId as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!loginId || !password) return null;

        const user = await prisma.user.findUnique({ where: { loginId } });
        if (!user) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
});
