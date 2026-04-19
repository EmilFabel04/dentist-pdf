import { NextResponse } from "next/server";
import { practiceRef } from "@/lib/firebase";
import type { Treatment } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = (await request.json()) as Omit<Treatment, "id">;
    await practiceRef.collection("treatments").doc(id).set(body);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[admin/treatments/id] PUT error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    await practiceRef.collection("treatments").doc(id).delete();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[admin/treatments/id] DELETE error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
