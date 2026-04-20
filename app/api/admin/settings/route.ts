import { NextResponse } from "next/server";
import { verifyAuth, getPracticeRef } from "@/lib/firebase";
import type { PracticeSettings } from "@/lib/types";

const DEFAULT_SETTINGS: PracticeSettings = {
  name: "",
  logo: "",
  address: "",
  phone: "",
  email: "",
  vatNumber: "",
  currency: "USD",
  vatRate: 0,
  quoteValidityDays: 30,
  defaultPaymentTerms: "",
};

export async function GET(request: Request) {
  try {
    const { practiceId } = await verifyAuth(request);
    const ref = getPracticeRef(practiceId);
    const doc = await ref.get();
    const data = doc.exists ? (doc.data() as PracticeSettings) : DEFAULT_SETTINGS;
    return NextResponse.json(data);
  } catch (error) {
    console.error("[admin/settings] GET error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { practiceId } = await verifyAuth(request);
    const ref = getPracticeRef(practiceId);
    const body = (await request.json()) as Partial<PracticeSettings>;
    await ref.set(body, { merge: true });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[admin/settings] PUT error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
