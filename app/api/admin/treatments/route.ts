import { NextResponse } from "next/server";
import { practiceRef } from "@/lib/firebase";
import type { Treatment } from "@/lib/types";

export async function GET() {
  try {
    const snapshot = await practiceRef.collection("treatments").orderBy("name").get();
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
    const body = (await request.json()) as Omit<Treatment, "id">;
    const ref = await practiceRef.collection("treatments").add(body);
    return NextResponse.json({ id: ref.id }, { status: 201 });
  } catch (error) {
    console.error("[admin/treatments] POST error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
