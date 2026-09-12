import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { creditVerifiedDepositInTransaction } from "@/lib/wallet";

test("a verified deposit can credit the wallet only once for its reference", async () => {
  const user = await prisma.user.create({ data: { email: `payu-deposit-${crypto.randomUUID()}@example.test`, status: "ACTIVE" } });
  const wallet = await prisma.wallet.create({ data: { userId: user.id, currency: "INR", balance: "1000.00" } });
  const deposit = await prisma.walletDeposit.create({
    data: {
      userId: user.id,
      walletId: wallet.id,
      amount: "500.00",
      currency: "INR",
      status: "PENDING",
      reference: `DEP-${crypto.randomBytes(9).toString("base64url").replace(/[-_]/g, "A").toUpperCase()}`,
      idempotencyKey: crypto.randomUUID(),
    },
  });

  try {
    await prisma.$transaction((tx) => creditVerifiedDepositInTransaction(tx, { walletId: wallet.id, amount: "500.00", currency: "INR", depositId: deposit.id }));
    await prisma.$transaction((tx) => creditVerifiedDepositInTransaction(tx, { walletId: wallet.id, amount: "500.00", currency: "INR", depositId: deposit.id }));

    const finalWallet = await prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id }, select: { balance: true } });
    assert.equal(finalWallet.balance.toString(), "1500");
    assert.equal(await prisma.walletTransaction.count({ where: { walletId: wallet.id, referenceType: "DEPOSIT", referenceId: deposit.id, type: "CREDIT", category: "DEPOSIT" } }), 1);
  } finally {
    await prisma.walletTransaction.deleteMany({ where: { walletId: wallet.id } });
    await prisma.walletDeposit.delete({ where: { id: deposit.id } });
    await prisma.wallet.delete({ where: { id: wallet.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});
