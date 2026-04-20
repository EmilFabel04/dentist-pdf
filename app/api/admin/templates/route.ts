import { NextResponse } from "next/server";
import { verifyAuth, getPracticeRef } from "@/lib/firebase";
import type { Template } from "@/lib/types";

export async function GET(request: Request) {
  try {
    const { practiceId } = await verifyAuth(request);
    const ref = getPracticeRef(practiceId);
    const snapshot = await ref.collection("templates").orderBy("name").get();
    const templates: Template[] = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Template[];
    return NextResponse.json(templates);
  } catch (error) {
    console.error("[admin/templates] GET error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { practiceId } = await verifyAuth(request);
    const ref = getPracticeRef(practiceId);
    const body = (await request.json()) as Omit<Template, "id">;
    const docRef = await ref.collection("templates").add(body);
    return NextResponse.json({ id: docRef.id }, { status: 201 });
  } catch (error) {
    console.error("[admin/templates] POST error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
