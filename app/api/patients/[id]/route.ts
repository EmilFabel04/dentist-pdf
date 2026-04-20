import { NextResponse } from "next/server";
import { verifyAuth, getPracticeRef } from "@/lib/firebase";
import type { Patient } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const { practiceId } = await verifyAuth(request);
    const { id } = await params;
    const doc = await getPracticeRef(practiceId).collection("patients").doc(id).get();
    if (!doc.exists) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }
    return NextResponse.json({ id: doc.id, ...doc.data() } as Patient);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 401 });
  }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const { practiceId } = await verifyAuth(request);
    const { id } = await params;
    const body = (await request.json()) as Partial<Patient>;
    await getPracticeRef(practiceId).collection("patients").doc(id).set(body, { merge: true });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 401 });
  }
}
