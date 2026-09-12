import { NextResponse } from "next/server";
import { getCurrentUserDeposit } from "@/lib/wallet-deposit";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const deposit = await getCurrentUserDeposit(id);
    if (!deposit) return NextResponse.json({ error: "Deposit not found." }, { status: 404 });
    return NextResponse.json({
      deposit: {
        id: deposit.id,
        amount: deposit.amount.toString(),
        currency: deposit.currency,
        status: deposit.status,
        reference: deposit.reference,
        providerReference: deposit.providerReference,
        createdAt: deposit.createdAt,
        updatedAt: deposit.updatedAt,
      },
    });
  } catch {
    return NextResponse.json({ error: "Unable to retrieve this deposit." }, { status: 401 });
  }
}
