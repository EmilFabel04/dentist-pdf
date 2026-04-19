import { NextResponse } from "next/server";
import { practiceRef } from "@/lib/firebase";
import type { Treatment } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const { suggestedTreatments } = (await request.json()) as {
      suggestedTreatments: string[];
    };

    const snapshot = await practiceRef.collection("treatments").get();
    const allTreatments: Treatment[] = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Treatment[];

    const matched: Treatment[] = [];
    const used = new Set<string>();

    for (const suggestion of suggestedTreatments) {
      const lower = suggestion.toLowerCase();
      const match = allTreatments.find(
        (t) =>
          !used.has(t.id) &&
          (t.name.toLowerCase().includes(lower) ||
            lower.includes(t.name.toLowerCase()) ||
            t.codes.some(
              (c) =>
                c.description.toLowerCase().includes(lower) ||
                lower.includes(c.description.toLowerCase())
            ))
      );
      if (match) {
        matched.push(match);
        used.add(match.id);
      }
    }

    return NextResponse.json({ matched, all: allTreatments });
  } catch (error) {
    console.error("[match-treatments] error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
