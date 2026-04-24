import { NextResponse } from "next/server";
import { verifyAuth, getPracticeRef } from "@/lib/firebase";
import type { TreatmentPreset } from "@/lib/types";

export async function GET(request: Request) {
  try {
    const { practiceId } = await verifyAuth(request);
    const snapshot = await getPracticeRef(practiceId)
      .collection("presets")
      .orderBy("name")
      .get();
    const presets: TreatmentPreset[] = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as TreatmentPreset[];
    return NextResponse.json(presets);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const { practiceId } = await verifyAuth(request);
    const body = (await request.json()) as Omit<TreatmentPreset, "id">;
    const ref = await getPracticeRef(practiceId).collection("presets").add({
      ...body,
      createdAt: new Date().toISOString(),
    });
    return NextResponse.json({ id: ref.id }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 401 });
  }
}
