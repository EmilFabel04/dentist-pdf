import { NextResponse } from "next/server";
import { verifyAuth, getPracticeRef } from "@/lib/firebase";
import type { Treatment, ParsedTreatment } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const { practiceId } = await verifyAuth(request);
    const body = await request.json();

    let treatmentsToSave: Omit<Treatment, "id">[];

    if (body.parsed) {
      treatmentsToSave = (body.parsed as ParsedTreatment[]).map((p) => ({
        name: p.description,
        category: p.category || "other",
        codes: [
          {
            code: p.code,
            description: p.description,
            price: p.unitCost,
            icd10: p.icd10 || undefined,
            labFee: p.labFee || undefined,
            implantFee: p.implantFee || undefined,
          },
        ],
        termsAndConditions: p.termsAndConditions || "",
      }));
    } else {
      treatmentsToSave = body.treatments as Omit<Treatment, "id">[];
    }

    const ref = getPracticeRef(practiceId);
    const chunks: Omit<Treatment, "id">[][] = [];
    for (let i = 0; i < treatmentsToSave.length; i += 450) {
      chunks.push(treatmentsToSave.slice(i, i + 450));
    }

    const ids: string[] = [];
    for (const chunk of chunks) {
      const batch = ref.firestore.batch();
      for (const t of chunk) {
        const docRef = ref.collection("treatments").doc();
        batch.set(docRef, t);
        ids.push(docRef.id);
      }
      await batch.commit();
    }

    return NextResponse.json({ ids, count: ids.length }, { status: 201 });
  } catch (error) {
    console.error("[treatments/batch] error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
