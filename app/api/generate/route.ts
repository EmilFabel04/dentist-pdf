import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import type { Report } from "@/lib/types";
export type { Report };

export const runtime = "nodejs";
export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a dental consultation assistant. Given a transcript of a dentist's consultation notes and X-ray images, extract and structure the following as JSON:
{
  patientSummary: string,
  findings: [{ tooth: string, observation: string, severity: 'normal' | 'monitor' | 'urgent' }],
  recommendations: string[],
  followUp: string,
  suggestedTreatments: string[]
}
suggestedTreatments should list treatment type names mentioned or implied in the transcript (e.g. "Crown", "Root Canal", "Filling", "Implant", "Extraction", "Cleaning").
Be clinical and concise. Do not invent findings not mentioned in the transcript or visible in the images.`;

type ImageInput = {
  base64: string;
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
};

export async function POST(request: Request) {
  try {
    const { transcript, images } = (await request.json()) as {
      transcript: string;
      images: ImageInput[];
    };

    if (!transcript) {
      return NextResponse.json({ error: "Missing transcript" }, { status: 400 });
    }

    const imageBlocks = (images ?? []).map((img) => ({
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: img.mediaType,
        data: img.base64,
      },
    }));

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            ...imageBlocks,
            {
              type: "text",
              text: `Consultation transcript:\n\n${transcript}\n\nReturn ONLY valid JSON matching the schema. No prose, no markdown code fences.`,
            },
          ],
        },
      ],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json(
        { error: "No text response from Claude" },
        { status: 502 }
      );
    }

    const raw = textBlock.text.trim();
    const jsonText = stripCodeFences(raw);

    let report: Report;
    try {
      report = JSON.parse(jsonText) as Report;
    } catch {
      return NextResponse.json(
        { error: "Claude returned non-JSON output", raw },
        { status: 502 }
      );
    }

    return NextResponse.json({ report });
  } catch (error) {
    console.error("[generate] error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

function stripCodeFences(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return fenced ? fenced[1].trim() : text;
}
