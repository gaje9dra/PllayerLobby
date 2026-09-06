import Link from "next/link";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { siteConfig } from "@/config/site";

const errorMessages: Record<string, string> = {
  AccountSuspended: "This account is currently suspended. Please contact support if you believe this is a mistake.",
  AccountBanned: "This account has been banned and cannot access the platform.",
  AccessDenied: "Google sign-in could not be completed. Please try again.",
  Configuration: "Authentication is temporarily unavailable. Please try again later.",
  OAuthSignin: "We could not start Google sign-in. Please try again.",
  OAuthCallback: "Google sign-in could not be completed. Please try again.",
};

type LoginPageProps = {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const error = params.error ? errorMessages[params.error] ?? "Sign-in failed. Please try again." : null;
  const callbackUrl = params.callbackUrl?.startsWith("/") ? params.callbackUrl : "/dashboard";
  const googleConfigured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.AUTH_SECRET);

  return (
    <main className="flex min-h-[calc(100vh-9rem)] items-center justify-center px-4 py-16 sm:px-6">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-3 text-white" aria-label={`${siteConfig.name} home`}>
            <span className="grid size-11 place-items-center rounded-xl bg-lime-300 font-black text-slate-950">A</span>
            <span className="text-xl font-black tracking-tight">{siteConfig.name}</span>
          </Link>
        </div>

        <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 shadow-2xl shadow-black/20 sm:p-8">
          <div className="mb-8">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-lime-300">Secure access</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-white">Welcome to the arena.</h1>
            <p className="mt-3 text-sm leading-6 text-slate-400">Use your Google account to access your tournament profile.</p>
          </div>

          {!googleConfigured ? (
            <div role="alert" className="mb-5 rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm leading-6 text-amber-100">
              Google sign-in is not configured yet. Add the required authentication environment variables and restart the development server.
            </div>
          ) : null}

          {error ? (
            <div role="alert" className="mb-5 rounded-xl border border-red-400/20 bg-red-400/5 px-4 py-3 text-sm leading-6 text-red-200">
              {error}
            </div>
          ) : null}

          <GoogleSignInButton callbackUrl={callbackUrl} disabled={!googleConfigured} />

          <p className="mt-5 text-center text-xs leading-5 text-slate-500">
            Google is the only sign-in method supported on this platform.
          </p>
        </section>
      </div>
    </main>
  );
}
