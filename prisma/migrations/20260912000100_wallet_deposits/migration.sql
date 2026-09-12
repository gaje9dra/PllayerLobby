ALTER TYPE "WalletTransactionCategory" ADD VALUE 'DEPOSIT';
ALTER TYPE "WalletReferenceType" ADD VALUE 'DEPOSIT';
CREATE TYPE "WalletDepositStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'CANCELLED');

CREATE TABLE "WalletDeposit" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "walletId" UUID NOT NULL,
  "amount" DECIMAL(20,2) NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
  "status" "WalletDepositStatus" NOT NULL DEFAULT 'PENDING',
  "reference" VARCHAR(40) NOT NULL,
  "providerReference" VARCHAR(128),
  "idempotencyKey" VARCHAR(128) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WalletDeposit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WalletDeposit_reference_key" UNIQUE ("reference"),
  CONSTRAINT "WalletDeposit_providerReference_key" UNIQUE ("providerReference"),
  CONSTRAINT "WalletDeposit_userId_idempotencyKey_key" UNIQUE ("userId", "idempotencyKey"),
  CONSTRAINT "WalletDeposit_amount_positive_check" CHECK ("amount" > 0),
  CONSTRAINT "WalletDeposit_currency_check" CHECK ("currency" = 'INR')
);

CREATE INDEX "WalletDeposit_userId_status_idx" ON "WalletDeposit"("userId", "status");
CREATE INDEX "WalletDeposit_walletId_createdAt_idx" ON "WalletDeposit"("walletId", "createdAt");
CREATE INDEX "WalletDeposit_status_createdAt_idx" ON "WalletDeposit"("status", "createdAt");
CREATE INDEX "WalletDeposit_amount_createdAt_idx" ON "WalletDeposit"("amount", "createdAt");

ALTER TABLE "WalletDeposit" ADD CONSTRAINT "WalletDeposit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WalletDeposit" ADD CONSTRAINT "WalletDeposit_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
