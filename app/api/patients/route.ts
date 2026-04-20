import { NextResponse } from "next/server";
import { verifyAuth, getPracticeRef } from "@/lib/firebase";
import type { Patient } from "@/lib/types";

export async function GET(request: Request) {
  try {
    const { practiceId } = await verifyAuth(request);
    const snapshot = await getPracticeRef(practiceId)
      .collection("patients")
      .orderBy("name")
      .get();
    const patients: Patient[] = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Patient[];
    return NextResponse.json(patients);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const { practiceId } = await verifyAuth(request);
    const body = (await request.json()) as Omit<Patient, "id">;
    const ref = await getPracticeRef(practiceId).collection("patients").add({
      ...body,
      createdAt: new Date().toISOString(),
    });
    return NextResponse.json({ id: ref.id }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 401 });
  }
}
