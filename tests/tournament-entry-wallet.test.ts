import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { createTournamentRegistrationForUser } from "@/lib/registration";

const now = new Date();

async function createFixture({ balance = "500.00", entryFee = "100.00", maxParticipants = 10, startOffsetMs = -60_000, endOffsetMs = 3_600_000 } = {}) {
  const game = await prisma.game.create({
    data: { name: `Test Game ${crypto.randomUUID()}`, slug: `test-${crypto.randomUUID()}`, code: `TEST-${crypto.randomBytes(5).toString("hex")}` },
  });
  const tournament = await prisma.tournament.create({
    data: {
      gameId: game.id,
      name: `Wallet Entry ${crypto.randomUUID()}`,
      slug: `wallet-entry-${crypto.randomUUID()}`,
      startTime: new Date(now.getTime() + 7_200_000),
      registrationStartTime: new Date(now.getTime() + startOffsetMs),
      registrationEndTime: new Date(now.getTime() + endOffsetMs),
      entryFee,
      prizePool: "0.00",
      maxParticipants,
      tournamentFormat: "SOLO",
      region: "IN",
      status: "REGISTRATION_OPEN",
    },
  });
  const user = await prisma.user.create({
    data: { email: `entry-${crypto.randomUUID()}@example.test`, status: "ACTIVE", role: "USER" },
  });
  const wallet = await prisma.wallet.create({ data: { userId: user.id, currency: "INR", balance } });
  return { game, tournament, user, wallet };
}

async function deleteTournamentFixture(tournamentId: string, gameId: string) {
  await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Tournament" WHERE "id" = CAST(${tournamentId} AS UUID) FOR UPDATE
    `;
    if (locked.length === 0) return;

    const registrations = await tx.registration.findMany({ where: { tournamentId }, select: { id: true } });
    const registrationIds = registrations.map((row) => row.id);

    await tx.tournamentPrizeSettlement.deleteMany({ where: { tournamentId } });
    await tx.tournamentRoom.deleteMany({ where: { tournamentId } });
    await tx.payment.deleteMany({ where: { registrationId: { in: registrationIds } } });
    await tx.registrationCode.deleteMany({ where: { registrationId: { in: registrationIds } } });
    await tx.tournamentResult.deleteMany({ where: { tournamentId } });
    await tx.tournamentPrize.deleteMany({ where: { tournamentId } });
    await tx.registration.deleteMany({ where: { tournamentId } });
    await tx.tournament.deleteMany({ where: { id: tournamentId } });
  });

  await prisma.game.deleteMany({ where: { id: gameId } });
}

async function deleteWalletFixture(walletId: string) {
  await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Wallet" WHERE "id" = CAST(${walletId} AS UUID) FOR UPDATE
    `;
    if (locked.length === 0) return;
    await tx.walletTransaction.deleteMany({ where: { walletId } });
    await tx.wallet.deleteMany({ where: { id: walletId } });
  });
}

async function deleteWalletAndTournamentFixture(walletId: string, tournamentId: string, gameId: string) {
  await prisma.$transaction(async (tx) => {
    const tournamentRows = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Tournament" WHERE "id" = CAST(${tournamentId} AS UUID) FOR UPDATE
    `;
    if (tournamentRows.length === 0) return;

    const walletRows = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Wallet" WHERE "id" = CAST(${walletId} AS UUID) FOR UPDATE
    `;
    if (walletRows.length === 0) return;

    const registrations = await tx.registration.findMany({ where: { tournamentId }, select: { id: true } });
    const registrationIds = registrations.map((row) => row.id);

    await tx.tournamentPrizeSettlement.deleteMany({ where: { tournamentId } });
    await tx.tournamentRoom.deleteMany({ where: { tournamentId } });
    await tx.payment.deleteMany({ where: { registrationId: { in: registrationIds } } });
    await tx.registrationCode.deleteMany({ where: { registrationId: { in: registrationIds } } });
    await tx.tournamentResult.deleteMany({ where: { tournamentId } });
    await tx.tournamentPrize.deleteMany({ where: { tournamentId } });
    await tx.registration.deleteMany({ where: { tournamentId } });
    await tx.walletTransaction.deleteMany({ where: { walletId } });
    await tx.tournament.deleteMany({ where: { id: tournamentId } });
    await tx.wallet.deleteMany({ where: { id: walletId } });
  });

  await prisma.game.deleteMany({ where: { id: gameId } });
}

async function cleanup(fixture: Awaited<ReturnType<typeof createFixture>>, extraUsers: string[] = []) {
  const userIds = [fixture.user.id, ...extraUsers];
  await deleteWalletAndTournamentFixture(fixture.wallet.id, fixture.tournament.id, fixture.game.id);
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

function registrationUser(user: { id: string }) {
  return { id: user.id, role: "USER" as const, status: "ACTIVE" as const };
}

test("paid tournament entry debits the authoritative wallet and confirms registration atomically", async () => {
  const fixture = await createFixture({ balance: "500.00", entryFee: "100.00" });
  try {
    const result = await createTournamentRegistrationForUser(registrationUser(fixture.user), fixture.tournament.id);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.entryFee, "100.00");
    assert.equal(result.walletBalance, "400");
    assert.equal((await prisma.wallet.findUniqueOrThrow({ where: { id: fixture.wallet.id } })).balance.toString(), "400");
    assert.equal((await prisma.registration.count({ where: { id: result.registrationId, status: "CONFIRMED" } })), 1);
    assert.equal(await prisma.walletTransaction.count({ where: { walletId: fixture.wallet.id, referenceType: "ENTRY_PAYMENT", referenceId: result.registrationId, type: "DEBIT", category: "ENTRY_FEE" } }), 1);
  } finally {
    await cleanup(fixture);
  }
});

test("insufficient balance creates no registration and no ledger debit", async () => {
  const fixture = await createFixture({ balance: "50.00", entryFee: "100.00" });
  try {
    const result = await createTournamentRegistrationForUser(registrationUser(fixture.user), fixture.tournament.id);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "INSUFFICIENT_BALANCE");
    assert.equal((await prisma.wallet.findUniqueOrThrow({ where: { id: fixture.wallet.id } })).balance.toString(), "50");
    assert.equal(await prisma.registration.count({ where: { tournamentId: fixture.tournament.id } }), 0);
    assert.equal(await prisma.walletTransaction.count({ where: { walletId: fixture.wallet.id, referenceType: "ENTRY_PAYMENT" } }), 0);
  } finally {
    await cleanup(fixture);
  }
});

test("exact balance is accepted and reaches zero", async () => {
  const fixture = await createFixture({ balance: "100.00", entryFee: "100.00" });
  try {
    const result = await createTournamentRegistrationForUser(registrationUser(fixture.user), fixture.tournament.id);
    assert.equal(result.ok, true);
    assert.equal((await prisma.wallet.findUniqueOrThrow({ where: { id: fixture.wallet.id } })).balance.toString(), "0");
  } finally {
    await cleanup(fixture);
  }
});

test("duplicate join requests produce one registration, one debit and one ledger transaction", async () => {
  const fixture = await createFixture({ balance: "100.00", entryFee: "100.00" });
  try {
    const [first, second] = await Promise.all([
      createTournamentRegistrationForUser(registrationUser(fixture.user), fixture.tournament.id),
      createTournamentRegistrationForUser(registrationUser(fixture.user), fixture.tournament.id),
    ]);
    const results = [first, second];
    assert.equal(results.filter((result) => result.ok).length, 1);
    assert.equal(await prisma.registration.count({ where: { tournamentId: fixture.tournament.id, status: "CONFIRMED" } }), 1);
    assert.equal(await prisma.walletTransaction.count({ where: { walletId: fixture.wallet.id, referenceType: "ENTRY_PAYMENT", type: "DEBIT", category: "ENTRY_FEE" } }), 1);
    assert.equal((await prisma.wallet.findUniqueOrThrow({ where: { id: fixture.wallet.id } })).balance.toString(), "0");
  } finally {
    await cleanup(fixture);
  }
});

test("concurrent spending from one wallet cannot overspend it", async () => {
  const fixture = await createFixture({ balance: "100.00", entryFee: "100.00" });
  const secondGame = await prisma.game.create({ data: { name: `Second Game ${crypto.randomUUID()}`, slug: `second-${crypto.randomUUID()}`, code: `SECOND-${crypto.randomBytes(5).toString("hex")}` } });
  const secondTournament = await prisma.tournament.create({
    data: {
      gameId: secondGame.id,
      name: `Second Entry ${crypto.randomUUID()}`,
      slug: `second-entry-${crypto.randomUUID()}`,
      startTime: new Date(now.getTime() + 7_200_000),
      registrationStartTime: new Date(now.getTime() - 60_000),
      registrationEndTime: new Date(now.getTime() + 3_600_000),
      entryFee: "100.00",
      prizePool: "0.00",
      maxParticipants: 10,
      tournamentFormat: "SOLO",
      region: "IN",
      status: "REGISTRATION_OPEN",
    },
  });
  try {
    const [first, second] = await Promise.all([
      createTournamentRegistrationForUser(registrationUser(fixture.user), fixture.tournament.id),
      createTournamentRegistrationForUser(registrationUser(fixture.user), secondTournament.id),
    ]);
    assert.equal([first, second].filter((result) => result.ok).length, 1);
    assert.equal((await prisma.wallet.findUniqueOrThrow({ where: { id: fixture.wallet.id } })).balance.toString(), "0");
  } finally {
    await deleteTournamentFixture(secondTournament.id, secondGame.id);
    await deleteWalletAndTournamentFixture(fixture.wallet.id, fixture.tournament.id, fixture.game.id);
    await prisma.user.deleteMany({ where: { id: fixture.user.id } });
  }
});

test("capacity race allows only the final available slot and rolls back the loser", async () => {
  const fixture = await createFixture({ balance: "100.00", entryFee: "100.00", maxParticipants: 1 });
  const secondUser = await prisma.user.create({ data: { email: `entry-cap-${crypto.randomUUID()}@example.test`, status: "ACTIVE", role: "USER" } });
  const secondWallet = await prisma.wallet.create({ data: { userId: secondUser.id, currency: "INR", balance: "100.00" } });
  try {
    const [first, second] = await Promise.all([
      createTournamentRegistrationForUser(registrationUser(fixture.user), fixture.tournament.id),
      createTournamentRegistrationForUser(registrationUser(secondUser), fixture.tournament.id),
    ]);
    assert.equal([first, second].filter((result) => result.ok).length, 1);
    assert.equal(await prisma.registration.count({ where: { tournamentId: fixture.tournament.id, status: "CONFIRMED" } }), 1);
    const balances = await Promise.all([
      prisma.wallet.findUniqueOrThrow({ where: { id: fixture.wallet.id }, select: { balance: true } }),
      prisma.wallet.findUniqueOrThrow({ where: { id: secondWallet.id }, select: { balance: true } }),
    ]);
    assert.equal(balances.filter((wallet) => wallet.balance.toString() === "0").length, 1);
    assert.equal(balances.filter((wallet) => wallet.balance.toString() === "100").length, 1);
  } finally {
    // Registration rows reference the tournament, and wallet transactions
    // reference the wallets. Remove the tournament/registrations first, then
    // delete both wallet ledgers. Doing this in the reverse order caused the
    // FK failures seen during the concurrent capacity test cleanup.
    await deleteTournamentFixture(fixture.tournament.id, fixture.game.id);
    await deleteWalletFixture(fixture.wallet.id);
    await deleteWalletFixture(secondWallet.id);
    await prisma.user.deleteMany({ where: { id: { in: [fixture.user.id, secondUser.id] } } });
  }
});

test("free tournaments confirm without creating a financial debit", async () => {
  const fixture = await createFixture({ balance: "0.00", entryFee: "0.00" });
  try {
    const result = await createTournamentRegistrationForUser(registrationUser(fixture.user), fixture.tournament.id);
    assert.equal(result.ok, true);
    assert.equal(await prisma.walletTransaction.count({ where: { walletId: fixture.wallet.id, referenceType: "ENTRY_PAYMENT" } }), 0);
    assert.equal(await prisma.registration.count({ where: { tournamentId: fixture.tournament.id, status: "CONFIRMED" } }), 1);
  } finally {
    await cleanup(fixture);
  }
});
