import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { Prisma, WalletDepositStatus } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";

test("pending deposit persistence leaves wallet balance unchanged", async () => {
  const user = await prisma.user.create({ data: { email: `deposit-test-${crypto.randomUUID()}@example.test`, status: "ACTIVE" } });
  const wallet = await prisma.wallet.create({ data: { userId: user.id, currency: "INR", balance: "500.00" } });
  const amount = "1000.00";
  const reference = `DEP-${crypto.randomBytes(9).toString("base64url").replace(/[-_]/g, "A").toUpperCase()}`;
  const idempotencyKey = `deposit-${crypto.randomUUID()}`;

  try {
    const deposit = await prisma.walletDeposit.create({ data: { userId: user.id, walletId: wallet.id, amount, currency: "INR", status: WalletDepositStatus.PENDING, reference, idempotencyKey } });
    assert.equal(deposit.status, WalletDepositStatus.PENDING);

    const unchanged = await prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id }, select: { balance: true } });
    assert.equal(unchanged.balance.toString(), "500.00");

    const ledgerCount = await prisma.walletTransaction.count({ where: { walletId: wallet.id } });
    assert.equal(ledgerCount, 0);

    await assert.rejects(
      prisma.walletDeposit.create({ data: { userId: user.id, walletId: wallet.id, amount, currency: "INR", status: WalletDepositStatus.PENDING, reference: `DEP-${crypto.randomBytes(9).toString("base64url").replace(/[-_]/g, "A").toUpperCase()}`, idempotencyKey } }),
      (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002",
    );
  } finally {
    await prisma.walletDeposit.deleteMany({ where: { walletId: wallet.id } });
    await prisma.wallet.delete({ where: { id: wallet.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});
