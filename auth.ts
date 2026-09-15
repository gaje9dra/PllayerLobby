import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { UserRole, UserStatus } from "@/app/generated/prisma/client";

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
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.status = user.status;
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id;
        if (token.role) {
          session.user.role = token.role;
        }
        if (token.status) {
          session.user.status = token.status;
        }
      }

      return session;
    },
  },
});
