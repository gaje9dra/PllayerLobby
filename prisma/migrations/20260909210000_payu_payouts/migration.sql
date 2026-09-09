-- Phase 5.5 PayU Payouts enum additions.
-- Kept separate from objects that reference the new enum values so PostgreSQL
-- can commit the enum additions before they are used by later statements.
ALTER TYPE "WalletReferenceType" ADD VALUE 'WITHDRAWAL_PAYOUT';
ALTER TYPE "WithdrawalRequestStatus" ADD VALUE 'PAYOUT_INITIATED';
ALTER TYPE "WithdrawalRequestStatus" ADD VALUE 'PROCESSING';
ALTER TYPE "WithdrawalRequestStatus" ADD VALUE 'PAID';
ALTER TYPE "WithdrawalRequestStatus" ADD VALUE 'FAILED';
ALTER TYPE "WithdrawalRequestStatus" ADD VALUE 'REVERSED';
