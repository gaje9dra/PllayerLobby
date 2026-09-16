import "server-only";

import { nextPowerOfTwo, roundName } from "@/lib/bracket-rules";

export type BracketParticipant = {
  registrationId: string;
  seed: number;
};

export type BracketPlanMatch = {
  matchNumber: number;
  slots: [
    { registrationId: string | null; seed: number | null; isBye: boolean; sourceMatchNumber: number | null },
    { registrationId: string | null; seed: number | null; isBye: boolean; sourceMatchNumber: number | null },
  ];
};

export type BracketPlanRound = {
  roundNumber: number;
  name: string;
  matches: BracketPlanMatch[];
};

export function buildSingleEliminationPlan(participants: BracketParticipant[]): BracketPlanRound[] {
  if (participants.length < 2) throw new Error("INSUFFICIENT_PARTICIPANTS");

  const bracketSize = nextPowerOfTwo(participants.length);
  const firstRoundMatches = bracketSize / 2;
  const fullMatches = participants.length - firstRoundMatches;
  const byeMatches = firstRoundMatches - fullMatches;
  const rounds: BracketPlanRound[] = [];
  const firstRound: BracketPlanMatch[] = [];
  let cursor = 0;

  for (let matchNumber = 1; matchNumber <= firstRoundMatches; matchNumber += 1) {
    const hasTwoParticipants = matchNumber <= fullMatches;
    const first = participants[cursor++];
    const second = hasTwoParticipants ? participants[cursor++] : undefined;
    const isBye = !second;
    firstRound.push({
      matchNumber,
      slots: [
        { registrationId: first?.registrationId ?? null, seed: first?.seed ?? null, isBye: false, sourceMatchNumber: null },
        { registrationId: second?.registrationId ?? null, seed: second?.seed ?? null, isBye, sourceMatchNumber: null },
      ],
    });
  }

  if (byeMatches < 0 || cursor !== participants.length) throw new Error("INVALID_BRACKET_PLAN");
  rounds.push({ roundNumber: 1, name: roundName(firstRoundMatches), matches: firstRound });

  let previousMatchCount = firstRoundMatches;
  let roundNumber = 2;
  while (previousMatchCount > 1) {
    const matchCount = previousMatchCount / 2;
    const matches: BracketPlanMatch[] = [];
    for (let matchNumber = 1; matchNumber <= matchCount; matchNumber += 1) {
      const sourceA = matchNumber * 2 - 1;
      const sourceB = matchNumber * 2;
      matches.push({
        matchNumber,
        slots: [
          { registrationId: null, seed: null, isBye: false, sourceMatchNumber: sourceA },
          { registrationId: null, seed: null, isBye: false, sourceMatchNumber: sourceB },
        ],
      });
    }
    rounds.push({ roundNumber, name: roundName(matchCount), matches });
    previousMatchCount = matchCount;
    roundNumber += 1;
  }

  return rounds;
}
