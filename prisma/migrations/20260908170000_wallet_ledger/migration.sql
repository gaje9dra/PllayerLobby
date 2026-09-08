CREATE TYPE "WalletTransactionType" AS ENUM ('CREDIT', 'DEBIT');
CREATE TYPE "WalletTransactionCategory" AS ENUM ('PRIZE', 'REFUND', 'WITHDRAWAL', 'ENTRY_FEE', 'ADJUSTMENT');
CREATE TYPE "WalletReferenceType" AS ENUM ('PRIZE_SETTLEMENT', 'REFUND', 'WITHDRAWAL', 'ENTRY_PAYMENT', 'ADJUSTMENT');

CREATE TABLE "Wallet" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
  "balance" DECIMAL(20,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Wallet_userId_key" UNIQUE ("userId"),
  CONSTRAINT "Wallet_balance_nonnegative_check" CHECK ("balance" >= 0),
  CONSTRAINT "Wallet_currency_check" CHECK ("currency" = 'INR')
);

CREATE TABLE "WalletTransaction" (
  "id" UUID NOT NULL,
  "walletId" UUID NOT NULL,
  "type" "WalletTransactionType" NOT NULL,
  "category" "WalletTransactionCategory" NOT NULL,
  "amount" DECIMAL(20,2) NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  "referenceType" "WalletReferenceType" NOT NULL,
  "referenceId" UUID NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WalletTransaction_amount_positive_check" CHECK ("amount" > 0),
  CONSTRAINT "WalletTransaction_currency_check" CHECK ("currency" = 'INR'),
  CONSTRAINT "WalletTransaction_walletId_referenceType_referenceId_type_category_key" UNIQUE ("walletId", "referenceType", "referenceId", "type", "category")
);

CREATE INDEX "Wallet_createdAt_idx" ON "Wallet"("createdAt");
CREATE INDEX "WalletTransaction_walletId_idx" ON "WalletTransaction"("walletId");
CREATE INDEX "WalletTransaction_createdAt_idx" ON "WalletTransaction"("createdAt");
CREATE INDEX "WalletTransaction_referenceType_referenceId_idx" ON "WalletTransaction"("referenceType", "referenceId");

ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
