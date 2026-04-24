import { NextResponse } from "next/server";
import { verifyAuth, getPracticeRef } from "@/lib/firebase";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, { params }: Params) {
  try {
    const { practiceId } = await verifyAuth(request);
    const { id } = await params;
    await getPracticeRef(practiceId).collection("presets").doc(id).delete();
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 401 });
  }
}
