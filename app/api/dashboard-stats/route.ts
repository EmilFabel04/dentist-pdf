import { NextResponse } from "next/server";
import { verifyAuth, getPracticeRef } from "@/lib/firebase";

export async function GET(request: Request) {
  try {
    const { practiceId } = await verifyAuth(request);
    const ref = getPracticeRef(practiceId);

    const [patientsSnap, treatmentsSnap] = await Promise.all([
      ref.collection("patients").count().get(),
      ref.collection("treatments").count().get(),
    ]);

    return NextResponse.json({
      totalPatients: patientsSnap.data().count,
      totalTreatments: treatmentsSnap.data().count,
    });
  } catch (error) {
    console.error("[dashboard-stats] error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 401 });
  }
}
