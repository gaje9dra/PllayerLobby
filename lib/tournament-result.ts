import "server-only";

import { RegistrationStatus, TournamentResultStatus, TournamentStatus } from "@/app/generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { refreshTournamentLifecycle } from "@/lib/tournament-lifecycle";
import { canEditTournamentResult, canTransitionResultStatus, isRegistrationResultEligible, isResultTournamentEligible, isWinnerEligible, parsePositiveRank, parseScore } from "@/lib/tournament-result-rules";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type ResultOperation = { ok: true; resultId?: string } | { ok: false; message: string };
function isUniqueError(error: unknown) { return error && typeof error === "object" && "code" in error && error.code === "P2002"; }

async function getEligibleContext(tournamentId: string, registrationId: string) {
  if (!UUID.test(tournamentId) || !UUID.test(registrationId)) return null;
  await refreshTournamentLifecycle(tournamentId);
  const registration = await prisma.registration.findUnique({ where: { id: registrationId }, select: { id: true, tournamentId: true, status: true, tournament: { select: { id: true, status: true } } } });
  if (!registration || registration.tournamentId !== tournamentId || !isRegistrationResultEligible(registration.status) || !isResultTournamentEligible(registration.tournament.status)) return null;
  return registration;
}

export async function createTournamentResult(tournamentId: string, registrationId: string, rankInput: string, scoreInput: string): Promise<ResultOperation> {
  await requireAdmin();
  const rank = parsePositiveRank(rankInput);
  const score = parseScore(scoreInput);
  if (rank === null) return { ok: false, message: "Rank must be a positive integer." };
  if (score === null) return { ok: false, message: "Score must be a non-negative number with at most 6 decimal places." };
  if (!await getEligibleContext(tournamentId, registrationId)) return { ok: false, message: "Only confirmed registrations for LIVE or COMPLETED tournaments can receive results." };
  try {
    const result = await prisma.tournamentResult.create({ data: { tournamentId, registrationId, rank, score, resultStatus: TournamentResultStatus.DRAFT }, select: { id: true } });
    return { ok: true, resultId: result.id };
  } catch (error) {
    if (isUniqueError(error)) return { ok: false, message: "A result already exists for this registration." };
    console.error("Result creation failed:", error);
    return { ok: false, message: "Unable to create the result." };
  }
}

export async function updateTournamentResult(tournamentId: string, resultId: string, rankInput: string, scoreInput: string): Promise<ResultOperation> {
  await requireAdmin();
  const rank = parsePositiveRank(rankInput);
  const score = parseScore(scoreInput);
  if (rank === null) return { ok: false, message: "Rank must be a positive integer." };
  if (score === null) return { ok: false, message: "Score must be a non-negative number with at most 6 decimal places." };
  if (!UUID.test(tournamentId) || !UUID.test(resultId)) return { ok: false, message: "Invalid result identifier." };
  const result = await prisma.tournamentResult.findUnique({ where: { id: resultId }, select: { id: true, tournamentId: true, registrationId: true, resultStatus: true } });
  if (!result || result.tournamentId !== tournamentId || !canEditTournamentResult(result.resultStatus)) return { ok: false, message: "Only DRAFT results can be edited." };
  if (!await getEligibleContext(tournamentId, result.registrationId)) return { ok: false, message: "The registration is not eligible for a result." };
  try {
    await prisma.tournamentResult.update({ where: { id: result.id }, data: { rank, score } });
    return { ok: true, resultId: result.id };
  } catch (error) {
    console.error("Result update failed:", error);
    return { ok: false, message: "Unable to update the result." };
  }
}

async function transitionResult(tournamentId: string, resultId: string, target: TournamentResultStatus): Promise<ResultOperation> {
  await requireAdmin();
  if (!UUID.test(tournamentId) || !UUID.test(resultId)) return { ok: false, message: "Invalid result identifier." };
  const result = await prisma.tournamentResult.findUnique({ where: { id: resultId }, select: { id: true, tournamentId: true, registrationId: true, rank: true, score: true, resultStatus: true } });
  if (!result || result.tournamentId !== tournamentId) return { ok: false, message: "Result not found." };
  if (!canTransitionResultStatus(result.resultStatus, target)) return { ok: false, message: "That result status transition is not allowed." };
  if (!await getEligibleContext(tournamentId, result.registrationId)) return { ok: false, message: "The registration is not eligible for a result." };
  if (target === TournamentResultStatus.VERIFIED) {
    const duplicateRank = await prisma.tournamentResult.findFirst({ where: { tournamentId, rank: result.rank, resultStatus: TournamentResultStatus.VERIFIED, NOT: { id: result.id } }, select: { id: true } });
    if (duplicateRank) return { ok: false, message: "Another verified result already uses this rank. Ties are not enabled." };
    if (result.rank <= 0 || result.score.isNegative()) return { ok: false, message: "The result contains invalid rank or score data." };
  }
  try {
    await prisma.tournamentResult.update({ where: { id: result.id }, data: { resultStatus: target } });
    return { ok: true, resultId: result.id };
  } catch (error) {
    if (isUniqueError(error) && target === TournamentResultStatus.VERIFIED) return { ok: false, message: "Another verified result claimed this rank first. Refresh and review the rankings." };
    console.error("Result status update failed:", error);
    return { ok: false, message: "Unable to change the result status." };
  }
}

export async function verifyTournamentResult(tournamentId: string, resultId: string) { return transitionResult(tournamentId, resultId, TournamentResultStatus.VERIFIED); }
export async function disqualifyTournamentResult(tournamentId: string, resultId: string) { return transitionResult(tournamentId, resultId, TournamentResultStatus.DISQUALIFIED); }

export async function getOfficialTournamentResults(tournamentId: string) {
  if (!UUID.test(tournamentId)) return [];
  return prisma.tournamentResult.findMany({ where: { tournamentId, resultStatus: TournamentResultStatus.VERIFIED }, orderBy: [{ rank: "asc" }, { id: "asc" }], select: { id: true, rank: true, score: true, resultStatus: true, registration: { select: { user: { select: { name: true } } } } } });
}

export async function getTournamentResultSummary(tournamentId: string) {
  const [confirmed, entered, verified, disqualified] = await prisma.$transaction([
    prisma.registration.count({ where: { tournamentId, status: RegistrationStatus.CONFIRMED } }),
    prisma.tournamentResult.count({ where: { tournamentId } }),
    prisma.tournamentResult.count({ where: { tournamentId, resultStatus: TournamentResultStatus.VERIFIED } }),
    prisma.tournamentResult.count({ where: { tournamentId, resultStatus: TournamentResultStatus.DISQUALIFIED } }),
  ]);
  return { confirmed, entered, verified, disqualified, pendingVerification: Math.max(0, entered - verified - disqualified) };
}

export async function getWinnerCandidates(tournamentId: string) {
  const results = await prisma.tournamentResult.findMany({ where: { tournamentId, resultStatus: TournamentResultStatus.VERIFIED }, orderBy: [{ rank: "asc" }, { id: "asc" }], select: { id: true, rank: true, score: true, resultStatus: true, tournament: { select: { status: true } }, registration: { select: { status: true, user: { select: { id: true, name: true } } } } } });
  return results.filter((result) => isWinnerEligible({ tournamentStatus: result.tournament.status, registrationStatus: result.registration.status, resultStatus: result.resultStatus, rank: result.rank }));
}
