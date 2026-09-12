import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { creditVerifiedDepositInTransaction } from "@/lib/wallet";
import { prisma } from "@/lib/prisma";

async function cleanupWalletFixture(walletId: string, userId: string) {
  await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Wallet" WHERE "id" = CAST(${walletId} AS UUID) FOR UPDATE
    `;
    if (locked.length === 0) return;
    await tx.walletTransaction.deleteMany({ where: { walletId } });
    await tx.walletDeposit.deleteMany({ where: { walletId } });
    await tx.wallet.deleteMany({ where: { id: walletId } });
  });
  await prisma.user.deleteMany({ where: { id: userId } });
}

test("a verified deposit can credit the wallet only once for its UUID", async () => {
  const user = await prisma.user.create({ data: { email: `payu-deposit-${crypto.randomUUID()}@example.test`, status: "ACTIVE" } });
  const wallet = await prisma.wallet.create({ data: { userId: user.id, currency: "INR", balance: "1000.00" } });
  const depositId = crypto.randomUUID();

  try {
    await prisma.$transaction((tx) => creditVerifiedDepositInTransaction(tx, { walletId: wallet.id, amount: "500.00", currency: "INR", depositId }));
    await prisma.$transaction((tx) => creditVerifiedDepositInTransaction(tx, { walletId: wallet.id, amount: "500.00", currency: "INR", depositId }));

    const finalWallet = await prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id }, select: { balance: true } });
    assert.equal(finalWallet.balance.toString(), "1500");
    assert.equal(await prisma.walletTransaction.count({ where: { walletId: wallet.id, referenceType: "DEPOSIT", referenceId: depositId, type: "CREDIT", category: "DEPOSIT" } }), 1);
  } finally {
    await cleanupWalletFixture(wallet.id, user.id);
  }
});
