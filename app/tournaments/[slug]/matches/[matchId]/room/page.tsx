import { SectionContainer } from "@/components/ui/section-container";
import { Button } from "@/components/ui/button";

export default async function MatchRoomPage({ params }: { params: Promise<{ slug: string; matchId: string }> }) {
  const { slug } = await params;
  return (
    <SectionContainer>
      <div className="mx-auto max-w-2xl py-12 sm:py-20">
        <p className="text-sm font-semibold text-lime-300">Private match access</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-white">Use Tournament Joining</h1>
        <p className="mt-4 text-sm leading-6 text-slate-400">Room credentials are released only through the server-authorized tournament access flow. Your access code, registration and assigned match are verified before credentials are returned.</p>
        <div className="mt-6"><Button href={`/tournaments/${encodeURIComponent(slug)}/join`}>Go to Tournament Joining</Button></div>
      </div>
    </SectionContainer>
  );
}
