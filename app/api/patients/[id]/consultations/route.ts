import { NextResponse } from "next/server";
import { verifyAuth, getPracticeRef } from "@/lib/firebase";
import type { Consultation } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const { practiceId } = await verifyAuth(request);
    const { id } = await params;
    const snapshot = await getPracticeRef(practiceId)
      .collection("patients").doc(id)
      .collection("consultations")
      .orderBy("createdAt", "desc")
      .get();
    const consultations: Consultation[] = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Consultation[];
    return NextResponse.json(consultations);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 401 });
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { practiceId } = await verifyAuth(request);
    const { id } = await params;
    const body = (await request.json()) as Omit<Consultation, "id">;
    const ref = await getPracticeRef(practiceId)
      .collection("patients").doc(id)
      .collection("consultations")
      .add({ ...body, createdAt: new Date().toISOString() });
    return NextResponse.json({ id: ref.id }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 401 });
  }
}
