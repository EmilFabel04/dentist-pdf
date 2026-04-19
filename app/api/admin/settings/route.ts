import { NextResponse } from "next/server";
import { practiceRef } from "@/lib/firebase";
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

export async function GET() {
  try {
    const doc = await practiceRef.get();
    const data = doc.exists ? (doc.data() as PracticeSettings) : DEFAULT_SETTINGS;
    return NextResponse.json(data);
  } catch (error) {
    console.error("[admin/settings] GET error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as Partial<PracticeSettings>;
    await practiceRef.set(body, { merge: true });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[admin/settings] PUT error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
