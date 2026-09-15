import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { UserStatus } from "@/app/generated/prisma/client";

// Netlify + NextAuth v5: trust the deployment host and support both the
// canonical AUTH_* names and the older NEXTAUTH_/GOOGLE_* names.
const authSecret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
const googleClientId = process.env.AUTH_GOOGLE_ID || process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.AUTH_GOOGLE_SECRET || process.env.GOOGLE_CLIENT_SECRET;

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  adapter: PrismaAdapter(prisma),
  secret: authSecret,

  // With PrismaAdapter, Auth.js otherwise defaults to database sessions.
  // JWT sessions avoid an additional Session-table write/read on Netlify
  // serverless requests while the adapter still persists users/accounts.
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },

  providers: [
    Google({
      clientId: googleClientId ?? "",
      clientSecret: googleClientSecret ?? "",
      authorization: {
        params: {
          prompt: "select_account",
          access_type: "offline",
          response_type: "code",
        },
      },
    }),
  ],

  pages: {
    signIn: "/login",
  },

  callbacks: {
    async signIn({ user }) {
      if (!user.email) {
        return false;
      }

      const existingUser = await prisma.user.findUnique({
        where: { email: user.email },
        select: { status: true },
      });

      if (existingUser?.status === UserStatus.SUSPENDED) {
        return "/login?error=AccountSuspended";
      }

      if (existingUser?.status === UserStatus.BANNED) {
        return "/login?error=AccountBanned";
      }

      return true;
    },

    async jwt({ token, user }) {
      // Only store the stable user id in the JWT. Do not read role/status
      // from Auth.js's User | AdapterUser union because those custom Prisma
      // fields are not part of the upstream callback type.
      if (user?.id) {
        token.id = user.id;
      }

      return token;
    },

    async session({ session, token }) {
      const userId = typeof token.id === "string" ? token.id : null;

      if (!session.user || !userId) {
        return session;
      }

      // Read role/status from Prisma instead of the loosely typed Auth.js JWT.
      // This also ensures changes made by an admin take effect on the next
      // session request without relying on stale token values.
      const dbUser = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          role: true,
          status: true,
        },
      });

      if (!dbUser) {
        return session;
      }

      session.user.id = dbUser.id;
      session.user.role = dbUser.role;
      session.user.status = dbUser.status;

      return session;
    },
  },
});
