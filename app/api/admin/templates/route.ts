import { NextResponse } from "next/server";
import { practiceRef } from "@/lib/firebase";
import type { Template } from "@/lib/types";

export async function GET() {
  try {
    const snapshot = await practiceRef.collection("templates").orderBy("name").get();
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
    const body = (await request.json()) as Omit<Template, "id">;
    const ref = await practiceRef.collection("templates").add(body);
    return NextResponse.json({ id: ref.id }, { status: 201 });
  } catch (error) {
    console.error("[admin/templates] POST error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
