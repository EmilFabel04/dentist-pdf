import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/firebase";
import type { SelectedTreatment } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: Request) {
  try {
    await verifyAuth(request);
    const { instructions, currentTreatments, allTreatments } = (await request.json()) as {
      instructions: string;
      currentTreatments: SelectedTreatment[];
      allTreatments: { id: string; name: string; category: string; codes: { code: string; description: string; price: number }[] }[];
    };

    const currentSummary = currentTreatments.map(st =>
      `- ${st.treatment.name} (${st.treatment.category}): ${st.selectedCodes.map(c => `${c.code} "${c.description}" x${c.quantity} @ ${c.price}`).join(", ")}`
    ).join("\n");

    const availableTreatments = allTreatments.map(t =>
      `- ${t.name} [${t.id}] (${t.category}): ${t.codes.map(c => `${c.code} "${c.description}" @ ${c.price}`).join(", ")}`
    ).join("\n");

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: `You are a dental estimate assistant. You will receive the current treatment estimate, a list of all available treatments, and instructions from the dentist on what to change.

Modify the estimate according to the instructions. Return ONLY a valid JSON array of the updated treatments in this exact format:
[
  {
    "treatmentId": "firestore-id",
    "treatmentName": "name",
    "category": "category",
    "codes": [{ "code": "8109", "description": "...", "price": 177, "quantity": 2 }]
  }
]

Rules:
- Only add treatments that exist in the available treatments list
- Use the exact treatmentId from the available list
- Adjust quantities as instructed
- Remove treatments if instructed
- Keep unchanged treatments as they are
- Return valid JSON only, no prose, no markdown fences`,
      messages: [{
        role: "user",
        content: `Current estimate:\n${currentSummary}\n\nAvailable treatments:\n${availableTreatments}\n\nDentist instructions: ${instructions}`,
      }],
    });

    const textBlock = message.content.find(b => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json({ error: "No response from Claude" }, { status: 502 });
    }

    const raw = textBlock.text.trim();
    const jsonText = raw.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1]?.trim() ?? raw;

    let updated;
    try {
      updated = JSON.parse(jsonText);
    } catch {
      return NextResponse.json({ error: "Claude returned non-JSON", raw }, { status: 502 });
    }

    return NextResponse.json({ updated });
  } catch (error) {
    console.error("[refine-estimate] error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
