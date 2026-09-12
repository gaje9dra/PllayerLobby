import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { creditVerifiedDepositInTransaction } from "@/lib/wallet";

test("verified deposit credit is idempotent at the wallet ledger boundary", async () => {
  const user = await prisma.user.create({ data: { email: `payu-credit-${crypto.randomUUID()}@example.test`, status: "ACTIVE" } });
  const wallet = await prisma.wallet.create({ data: { userId: user.id, currency: "INR", balance: "1000.00" } });
  const depositId = crypto.randomUUID();

  try {
    await prisma.$transaction(async (tx) => {
      await creditVerifiedDepositInTransaction(tx, { walletId: wallet.id, amount: "500.00", currency: "INR", depositId });
    });
    await prisma.$transaction(async (tx) => {
      await creditVerifiedDepositInTransaction(tx, { walletId: wallet.id, amount: "500.00", currency: "INR", depositId });
    });

    const updatedWallet = await prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id }, select: { balance: true } });
    assert.equal(updatedWallet.balance.toString(), "1500");
    const entries = await prisma.walletTransaction.count({ where: { walletId: wallet.id, referenceType: "DEPOSIT", referenceId: depositId, type: "CREDIT", category: "DEPOSIT" } });
    assert.equal(entries, 1);
  } finally {
    await prisma.walletTransaction.deleteMany({ where: { walletId: wallet.id } });
    await prisma.wallet.delete({ where: { id: wallet.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});
