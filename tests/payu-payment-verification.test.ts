import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { verifyAndFinalizePayUWalletDeposit } from "@/lib/payu-wallet-deposit";
import { normalizePaymentAmount } from "@/lib/payu-verification-rules";

type DepositContext = {
  userId: string;
  walletId: string;
  depositId: string;
  reference: string;
  email: string;
  firstname: string;
  phone: string;
  productinfo: string;
  amount: string;
};

const originalFetch = globalThis.fetch;

function callbackHash(fields: {
  key: string;
  txnid: string;
  amount: string;
  productinfo: string;
  firstname: string;
  email: string;
  status: string;
  udf1?: string;
  udf2?: string;
  udf3?: string;
  udf4?: string;
  udf5?: string;
}) {
  const value = [
    process.env.PAYU_MERCHANT_SALT!,
    fields.status,
    "",
    "",
    "",
    "",
    "",
    fields.udf5 ?? "",
    fields.udf4 ?? "",
    fields.udf3 ?? "",
    fields.udf2 ?? "",
    fields.udf1 ?? "",
    fields.email,
    fields.firstname,
    fields.productinfo,
    fields.amount,
    fields.txnid,
    fields.key,
  ].join("|");
  return createHash("sha512").update(value, "utf8").digest("hex");
}

async function createContext(amount = "500.00"): Promise<DepositContext> {
  const userId = crypto.randomUUID();
  const reference = `DEP-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
  const email = `payu-verify-${crypto.randomUUID()}@example.test`;
  const firstname = "Payu";
  const phone = "9876543210";
  const productinfo = `PlayerLobby Wallet Deposit - ${reference}`;

  const user = await prisma.user.create({ data: { id: userId, email, name: `${firstname} Test`, phone, status: "ACTIVE" } });
  const wallet = await prisma.wallet.create({ data: { userId: user.id, currency: "INR", balance: "1000.00" } });
  const deposit = await prisma.walletDeposit.create({ data: { userId: user.id, walletId: wallet.id, amount, currency: "INR", status: "PENDING", reference, idempotencyKey: crypto.randomUUID() } });

  return { userId: user.id, walletId: wallet.id, depositId: deposit.id, reference, email, firstname, phone, productinfo, amount };
}

async function cleanup(context: DepositContext) {
  await prisma.walletTransaction.deleteMany({ where: { walletId: context.walletId } });
  await prisma.walletDeposit.deleteMany({ where: { id: context.depositId } });
  await prisma.wallet.delete({ where: { id: context.walletId } });
  await prisma.user.delete({ where: { id: context.userId } });
}

function successCallback(context: DepositContext, status = "success") {
  const base = {
    key: process.env.PAYU_MERCHANT_KEY!,
    txnid: context.reference,
    amount: context.amount,
    productinfo: context.productinfo,
    firstname: context.firstname,
    email: context.email,
    phone: context.phone,
    status,
    udf1: "",
    udf2: "",
    udf3: "",
    udf4: "",
    udf5: "",
  };
  return { ...base, hash: callbackHash(base), mihpayid: `mih-${crypto.randomUUID()}` };
}

function stubPayUVerification(context: DepositContext, status = "success", unmappedstatus = "captured", mihpayid = `mih-${crypto.randomUUID()}`) {
  globalThis.fetch = async () => new Response(JSON.stringify({
    status: 1,
    transaction_details: {
      [context.reference]: {
        txnid: context.reference,
        mihpayid,
        status,
        unmappedstatus,
        amt: context.amount,
        transaction_amount: context.amount,
        productinfo: context.productinfo,
        firstname: context.firstname,
        email: context.email,
        phone: context.phone,
      },
    },
  }), { status: 200, headers: { "content-type": "application/json" } });
  return mihpayid;
}

async function walletBalance(walletId: string) {
  const wallet = await prisma.wallet.findUniqueOrThrow({ where: { id: walletId }, select: { balance: true } });
  return wallet.balance.toString();
}

async function depositStatus(depositId: string) {
  return prisma.walletDeposit.findUniqueOrThrow({ where: { id: depositId }, select: { status: true, providerReference: true } });
}

try {
  test("PayU amount normalization is exact for large decimal values", () => {
    assert.equal(normalizePaymentAmount("10000000000000000.99"), "10000000000000000.99");
    assert.equal(normalizePaymentAmount("000500.0"), "500.00");
    assert.equal(normalizePaymentAmount("-1.00"), null);
  });

  test("valid verified success credits the wallet exactly once", async () => {
    const context = await createContext();
    const mihpayid = stubPayUVerification(context, "success", "captured", `mih-${crypto.randomUUID()}`);
    const callback = successCallback(context);
    callback.mihpayid = mihpayid;

    try {
      const first = await verifyAndFinalizePayUWalletDeposit(callback);
      const second = await verifyAndFinalizePayUWalletDeposit(callback);
      assert.equal(first.outcome, "SUCCESS");
      assert.equal(second.outcome, "SUCCESS");
      assert.equal(await walletBalance(context.walletId), "1500");
      assert.equal((await prisma.walletTransaction.count({ where: { walletId: context.walletId, referenceType: "DEPOSIT", referenceId: context.depositId, type: "CREDIT", category: "DEPOSIT" } })), 1);
      assert.equal((await depositStatus(context.depositId)).status, "SUCCESS");
    } finally {
      await cleanup(context);
    }
  });

  test("invalid callback hash cannot credit the wallet", async () => {
    const context = await createContext();
    stubPayUVerification(context);
    const callback = successCallback(context);
    callback.hash = "0".repeat(128);

    try {
      const result = await verifyAndFinalizePayUWalletDeposit(callback);
      assert.equal(result.outcome, "REJECTED");
      assert.equal(await walletBalance(context.walletId), "1000");
      assert.equal((await depositStatus(context.depositId)).status, "PENDING");
    } finally {
      await cleanup(context);
    }
  });

  test("amount tampering is rejected before wallet credit", async () => {
    const context = await createContext();
    stubPayUVerification(context);
    const callback = successCallback(context);
    callback.amount = "5000.00";
    callback.hash = callbackHash(callback);

    try {
      const result = await verifyAndFinalizePayUWalletDeposit(callback);
      assert.equal(result.outcome, "REJECTED");
      assert.equal(await walletBalance(context.walletId), "1000");
      assert.equal((await depositStatus(context.depositId)).status, "PENDING");
    } finally {
      await cleanup(context);
    }
  });

  test("provider transaction reuse is rejected", async () => {
    const first = await createContext();
    const second = await createContext();
    const reusedProviderId = `mih-${crypto.randomUUID()}`;
    stubPayUVerification(first, "success", "captured", reusedProviderId);
    const firstCallback = successCallback(first);
    firstCallback.mihpayid = reusedProviderId;
    stubPayUVerification(second, "success", "captured", reusedProviderId);
    const secondCallback = successCallback(second);
    secondCallback.mihpayid = reusedProviderId;

    try {
      const firstResult = await verifyAndFinalizePayUWalletDeposit(firstCallback);
      assert.equal(firstResult.outcome, "SUCCESS");
      const secondResult = await verifyAndFinalizePayUWalletDeposit(secondCallback);
      assert.equal(secondResult.outcome, "REJECTED");
      assert.equal(await walletBalance(first.walletId), "1500");
      assert.equal(await walletBalance(second.walletId), "1000");
    } finally {
      await cleanup(first);
      await cleanup(second);
    }
  });

  test("failed provider result never credits the wallet", async () => {
    const context = await createContext();
    stubPayUVerification(context, "failure", "failed");
    const callback = successCallback(context, "failure");

    try {
      const result = await verifyAndFinalizePayUWalletDeposit(callback);
      assert.equal(result.outcome, "FAILED");
      assert.equal(await walletBalance(context.walletId), "1000");
      assert.equal((await depositStatus(context.depositId)).status, "FAILED");
      assert.equal(await prisma.walletTransaction.count({ where: { walletId: context.walletId, referenceType: "DEPOSIT", category: "DEPOSIT" } }), 0);
    } finally {
      await cleanup(context);
    }
  });

  test("concurrent verified callbacks produce one wallet credit", async () => {
    const context = await createContext();
    const mihpayid = `mih-${crypto.randomUUID()}`;
    const callback = successCallback(context);
    callback.mihpayid = mihpayid;
    globalThis.fetch = async () => new Response(JSON.stringify({
      status: 1,
      transaction_details: {
        [context.reference]: {
          txnid: context.reference,
          mihpayid,
          status: "success",
          unmappedstatus: "captured",
          amt: context.amount,
          transaction_amount: context.amount,
          productinfo: context.productinfo,
          firstname: context.firstname,
          email: context.email,
          phone: context.phone,
        },
      },
    }), { status: 200, headers: { "content-type": "application/json" } });

    try {
      const results = await Promise.all([
        verifyAndFinalizePayUWalletDeposit(callback),
        verifyAndFinalizePayUWalletDeposit(callback),
      ]);
      assert.equal(await walletBalance(context.walletId), "1500");
      assert.equal(await prisma.walletTransaction.count({ where: { walletId: context.walletId, referenceType: "DEPOSIT", referenceId: context.depositId, type: "CREDIT", category: "DEPOSIT" } }), 1);
      assert.ok(results.every((result) => result.outcome === "SUCCESS" || result.outcome === "PENDING"));
    } finally {
      await cleanup(context);
    }
  });
} finally {
  globalThis.fetch = originalFetch;
}
