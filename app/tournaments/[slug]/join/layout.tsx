import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tournament Joining",
  description: "Private tournament joining information.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function TournamentJoinLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
