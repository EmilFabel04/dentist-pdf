import { NextResponse } from "next/server";
import { verifyAuth, getPracticeRef } from "@/lib/firebase";
import type { Treatment } from "@/lib/types";

export async function GET(request: Request) {
  try {
    const { practiceId } = await verifyAuth(request);
    const ref = getPracticeRef(practiceId);
    const snapshot = await ref.collection("treatments").orderBy("name").get();
    const treatments: Treatment[] = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Treatment[];
    return NextResponse.json(treatments);
  } catch (error) {
    console.error("[admin/treatments] GET error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { practiceId } = await verifyAuth(request);
    const ref = getPracticeRef(practiceId);
    const body = (await request.json()) as Omit<Treatment, "id">;
    const docRef = await ref.collection("treatments").add(body);
    return NextResponse.json({ id: docRef.id }, { status: 201 });
  } catch (error) {
    console.error("[admin/treatments] POST error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
