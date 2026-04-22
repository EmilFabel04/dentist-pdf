import { NextResponse } from "next/server";
import { verifyAuth, getPracticeRef } from "@/lib/firebase";
import type { Treatment, ParsedTreatment } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const { practiceId } = await verifyAuth(request);
    const body = await request.json();

    let treatmentsToSave: Omit<Treatment, "id">[];

    if (body.parsed) {
      // Convert flat parsed treatments into grouped Treatment objects
      // Each parsed treatment becomes its own Treatment with a single code
      treatmentsToSave = (body.parsed as ParsedTreatment[]).map((p) => ({
        name: p.description,
        category: categorizeCode(p.code),
        codes: [
          {
            code: p.code,
            description: p.description,
            price: p.unitCost,
            icd10: p.icd10,
            labFee: p.labFee,
            implantFee: p.implantFee,
          },
        ],
        termsAndConditions: "",
      }));
    } else {
      treatmentsToSave = body.treatments as Omit<Treatment, "id">[];
    }

    const ref = getPracticeRef(practiceId);
    // Firestore batch limit is 500, chunk if needed
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

function categorizeCode(code: string): string {
  const c = code.toUpperCase();
  if (
    c.startsWith("NEURO") ||
    c.startsWith("FILLER") ||
    c.startsWith("SKIN") ||
    c.startsWith("APTOS") ||
    c.startsWith("INVIS") ||
    c.startsWith("SPARK")
  )
    return "aesthetic";
  const num = parseInt(code);
  if (isNaN(num)) return "other";
  if (num >= 8101 && num <= 8115) return "diagnostic";
  if (num >= 8116 && num <= 8160) return "preventive";
  if (num >= 8161 && num <= 8200) return "restorative";
  if (num >= 8201 && num <= 8300) return "endodontic";
  if (num >= 8301 && num <= 8400) return "prosthodontic";
  if (num >= 8401 && num <= 8500) return "surgical";
  if (num >= 8501 && num <= 8600) return "periodontal";
  if (num >= 8601 && num <= 8700) return "orthodontic";
  return "other";
}
