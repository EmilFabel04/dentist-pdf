import Anthropic from "@anthropic-ai/sdk";
import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/firebase";
import type { ParsedTreatment } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

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

    const contentType = request.headers.get("content-type") || "";

    // ── Smart Excel parser (FormData upload) ──────────────────────
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json({ error: "No file provided" }, { status: 400 });
      }

      const ext = file.name.split(".").pop()?.toLowerCase();

      if (ext === "xlsx") {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(arrayBuffer);

        const treatments: ParsedTreatment[] = [];

        // Parse Lookup Items sheet
        const lookupSheet = workbook.getWorksheet("Lookup Items");
        if (lookupSheet) {
          lookupSheet.eachRow((row, rowNumber) => {
            if (rowNumber < 4) return; // skip header rows
            const code = cellValue(row.getCell(2));
            const description = cellValue(row.getCell(3));
            if (!code || !description) return;

            const unitCost = numValue(row.getCell(5));
            const labFee = numValue(row.getCell(6));
            const implantFee = numValue(row.getCell(7));
            const icd10 = cellValue(row.getCell(4));

            treatments.push({
              code: String(code),
              description: String(description),
              icd10: icd10 ? String(icd10) : "",
              unitCost: unitCost || 0,
              labFee: labFee || 0,
              implantFee: implantFee || 0,
              source: "Lookup Items",
            });
          });
        }

        // Parse Aesthetic Pricing sheet
        const aestheticSheet = workbook.getWorksheet("Aesthetic Pricing");
        if (aestheticSheet) {
          aestheticSheet.eachRow((row, rowNumber) => {
            if (rowNumber < 2) return;
            const code = cellValue(row.getCell(1));
            const description = cellValue(row.getCell(2));
            if (!code || !description) return;

            const price2024 = numValue(row.getCell(4));
            const priceOld = numValue(row.getCell(3));

            treatments.push({
              code: String(code),
              description: String(description),
              icd10: "",
              unitCost: price2024 || priceOld || 0,
              labFee: 0,
              implantFee: 0,
              source: "Aesthetic",
            });
          });
        }

        // Parse Pricing 2019 sheet (headers at row 110, data at 114+)
        const pricing2019 = workbook.getWorksheet("Pricing 2019");
        if (pricing2019) {
          pricing2019.eachRow((row, rowNumber) => {
            if (rowNumber < 114) return;
            const code = cellValue(row.getCell(1));
            const description = cellValue(row.getCell(2));
            if (!code || !description) return;

            const price = numValue(row.getCell(4));

            // Only add if not already in lookup items
            const exists = treatments.some((t) => t.code === String(code));
            if (!exists) {
              treatments.push({
                code: String(code),
                description: String(description),
                icd10: "",
                unitCost: price || 0,
                labFee: 0,
                implantFee: 0,
                source: "Pricing 2019",
              });
            }
          });
        }

        return NextResponse.json({ treatments, count: treatments.length });
      }

      // Non-xlsx file uploaded via FormData — read as text and fall through to Claude
      const textContent = await file.text();
      return claudeParse(textContent, file.name);
    }

    // ── Legacy JSON body (docx/pdf text sent from client) ─────────
    const { content, filename } = (await request.json()) as {
      content: string;
      filename: string;
    };

    if (!content) {
      return NextResponse.json({ error: "No content provided" }, { status: 400 });
    }

    return claudeParse(content, filename);
  } catch (error) {
    console.error("[parse-treatments] error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

/** Fallback: send text content to Claude for parsing */
async function claudeParse(content: string, filename: string) {
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
}

function cellValue(cell: ExcelJS.Cell): string | number | null {
  const v = cell.value;
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && "result" in v) return (v as { result: string | number }).result;
  if (typeof v === "object" && "text" in v) return (v as { text: string }).text;
  return v as string | number;
}

function numValue(cell: ExcelJS.Cell): number | null {
  const v = cellValue(cell);
  if (v === null) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return isNaN(n) ? null : n;
}
