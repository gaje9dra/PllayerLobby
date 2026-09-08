-- Phase 5.2: distinguish approved prize entitlements from wallet-credited settlements.
ALTER TYPE "TournamentPrizeSettlementStatus" ADD VALUE 'CREDITED';
