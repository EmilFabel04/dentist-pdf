import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/firebase";

export const runtime = "nodejs";
export const maxDuration = 120;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PARSE_PROMPT = `You are a dental data extraction assistant. Given the content of a document (spreadsheet data, Word document, or PDF), extract all dental treatments and return them as a JSON array.

For each treatment return:
{
  "name": "treatment type name (e.g. Crown, Root Canal, Filling)",
  "category": "one of: preventive, restorative, endodontic, periodontal, prosthodontic, surgical, orthodontic, diagnostic, other",
  "codes": [{ "code": "procedure code", "description": "description", "price": number }],
  "termsAndConditions": "any T&Cs associated with this treatment, or empty string"
}

Return ONLY a valid JSON array. No prose, no markdown code fences.
If prices are in a non-USD currency, keep the original numbers — do not convert.
Group related procedure codes under the same treatment type.`;

export async function POST(request: Request) {
  try {
    await verifyAuth(request);
    const { content, filename } = (await request.json()) as {
      content: string;
      filename: string;
    };

    if (!content) {
      return NextResponse.json({ error: "No content provided" }, { status: 400 });
    }

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: PARSE_PROMPT,
      messages: [
        {
          role: "user",
          content: `File: ${filename}\n\nContent:\n${content}\n\nExtract all treatments as JSON array.`,
        },
      ],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json({ error: "No response from Claude" }, { status: 502 });
    }

    const raw = textBlock.text.trim();
    const jsonText = raw.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1]?.trim() ?? raw;

    let treatments;
    try {
      treatments = JSON.parse(jsonText);
    } catch {
      return NextResponse.json({ error: "Claude returned non-JSON", raw }, { status: 502 });
    }

    return NextResponse.json({ treatments });
  } catch (error) {
    console.error("[parse-treatments] error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
