import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/firebase";
import type { Report } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: Request) {
  try {
    await verifyAuth(request);
    const { instructions, currentReport } = (await request.json()) as {
      instructions: string;
      currentReport: Report;
    };

    const currentSummary = [
      `Patient Summary: ${currentReport.patientSummary}`,
      `Findings:\n${currentReport.findings.map((f) => `- ${f.tooth}: ${f.observation} (${f.severity})`).join("\n")}`,
      `Recommendations:\n${currentReport.recommendations.map((r) => `- ${r}`).join("\n")}`,
      `Follow-up: ${currentReport.followUp}`,
    ].join("\n\n");

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: `You are a dental consultation report assistant. You have a current report and the dentist wants to make changes. Modify the report according to their instructions.

Return ONLY valid JSON matching this exact schema:
{
  "patientSummary": "string",
  "findings": [{ "tooth": "string", "observation": "string", "severity": "normal" | "monitor" | "urgent" }],
  "recommendations": ["string"],
  "followUp": "string",
  "suggestedTreatments": ["string"]
}

Rules:
- Apply the dentist's changes precisely
- Keep unchanged sections as they are
- Be clinical and concise
- Do not invent findings not mentioned
- Return valid JSON only, no prose, no markdown fences`,
      messages: [
        {
          role: "user",
          content: `Current report:\n${currentSummary}\n\nDentist instructions: ${instructions}`,
        },
      ],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json({ error: "No response from Claude" }, { status: 502 });
    }

    const raw = textBlock.text.trim();
    const jsonText = raw.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1]?.trim() ?? raw;

    let updated: Report;
    try {
      updated = JSON.parse(jsonText);
    } catch {
      return NextResponse.json({ error: "Claude returned non-JSON", raw }, { status: 502 });
    }

    return NextResponse.json({ report: updated });
  } catch (error) {
    console.error("[refine-report] error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
