import { NextResponse } from "next/server";
import { verifyAuth, getPracticeRef } from "@/lib/firebase";
import type { Treatment } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const { practiceId } = await verifyAuth(request);
    const { treatments } = (await request.json()) as {
      treatments: Omit<Treatment, "id">[];
    };

    const ref = getPracticeRef(practiceId);
    const batch = ref.firestore.batch();
    const ids: string[] = [];

    for (const t of treatments) {
      const docRef = ref.collection("treatments").doc();
      batch.set(docRef, t);
      ids.push(docRef.id);
    }

    await batch.commit();
    return NextResponse.json({ ids }, { status: 201 });
  } catch (error) {
    console.error("[treatments/batch] error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
