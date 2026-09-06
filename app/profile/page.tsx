import type { Metadata } from "next";
import { requireActiveUser } from "@/lib/auth";
import { SectionContainer } from "@/components/ui/section-container";
import { ProfileAccountCard } from "@/components/profile/profile-card";
import { SignOutButton } from "@/components/auth/sign-out-button";

export const metadata: Metadata = {
  title: "Profile",
  description: "View your ArenaX account information.",
};

export default async function ProfilePage() {
  const user = await requireActiveUser();

  return (
    <SectionContainer className="py-12 sm:py-16 lg:py-20">
      <div className="flex flex-col gap-5 border-b border-white/10 pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-lime-300">
            Your account
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
            Profile
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">
            Your Google account information is shown below. Profile settings
            will be introduced in a future phase.
          </p>
        </div>
        <SignOutButton />
      </div>

      <div className="mt-8 max-w-3xl">
        <ProfileAccountCard user={user} />
      </div>
    </SectionContainer>
  );
}
