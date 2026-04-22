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
  "name": "treatment type name",
  "category": "one of: preventive, restorative, endodontic, periodontal, prosthodontic, surgical, orthodontic, diagnostic, aesthetic, lab-fee, other",
  "codes": [{ "code": "procedure code", "description": "description", "price": number }],
  "termsAndConditions": "any T&Cs associated with this treatment, or empty string"
}

Return ONLY a valid JSON array. No prose, no markdown code fences.`;

// T&C rows in the dentist's spreadsheet use treatment category names as "codes"
// Map them to the dental code ranges they apply to
const TC_CATEGORY_MAP: Record<string, string> = {
  "Treatment": "general",
  "Consultation": "diagnostic",
  "Check Up": "diagnostic",
  "Scale and Polish": "preventive",
  "Restorations": "restorative",
  "Root Canal": "endodontic",
  "Crown and Bridge/ post and core": "prosthodontic",
  "Implants": "surgical",
  "Provisional crowns/prostheses": "prosthodontic",
};

export async function POST(request: Request) {
  try {
    await verifyAuth(request);

    const contentType = request.headers.get("content-type") || "";

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
        const result = parseWorkbook(workbook);
        return NextResponse.json(result);
      }

      const textContent = await file.text();
      return claudeParse(textContent, file.name);
    }

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

function parseWorkbook(workbook: ExcelJS.Workbook) {
  const treatments: ParsedTreatment[] = [];
  const termsAndConditions: Record<string, { description: string; tc: string; warranty: string }> = {};

  // ── 1. Parse Lookup Items ──────────────────────────────────
  const lookupSheet = workbook.getWorksheet("Lookup Items");
  if (lookupSheet) {
    lookupSheet.eachRow((row, rowNumber) => {
      if (rowNumber < 4) return;
      const code = cellValue(row.getCell(2));
      const description = cellValue(row.getCell(3));
      if (!code || !description) return;

      const codeStr = String(code).trim();
      const descStr = String(description).trim();
      const icd10Raw = cellValue(row.getCell(4));
      const icd10Str = icd10Raw ? String(icd10Raw).trim() : "";
      const unitCost = numValue(row.getCell(5));
      const labFee = numValue(row.getCell(6));
      const implantFee = numValue(row.getCell(7));
      const costRaw = cellValue(row.getCell(5));

      // Detect T&C rows: non-numeric codes that match known treatment categories
      if (codeStr in TC_CATEGORY_MAP) {
        termsAndConditions[codeStr] = {
          description: descStr,
          tc: icd10Str,
          warranty: costRaw ? String(costRaw) : "",
        };
        return;
      }

      const isLab = codeStr.startsWith("8099");
      const category = isLab ? "lab-fee" : categorizeCode(codeStr);

      treatments.push({
        code: codeStr,
        description: descStr,
        icd10: isICD10(icd10Str) ? icd10Str : "",
        unitCost: unitCost || 0,
        labFee: labFee || 0,
        implantFee: implantFee || 0,
        source: "Lookup Items",
        category,
        termsAndConditions: "",
        warranty: "",
        isLabFee: isLab,
      });
    });
  }

  // ── 2. Parse Aesthetic Pricing ─────────────────────────────
  const aestheticSheet = workbook.getWorksheet("Aesthetic Pricing");
  if (aestheticSheet) {
    aestheticSheet.eachRow((row, rowNumber) => {
      if (rowNumber < 2) return;
      const code = cellValue(row.getCell(1));
      const description = cellValue(row.getCell(2));
      if (!code || !description) return;

      const codeStr = String(code).trim();
      const descStr = String(description).trim();
      if (!descStr || descStr.toLowerCase().includes("aligner fees")) return;

      const price2024 = numValue(row.getCell(4));
      const priceOld = numValue(row.getCell(3));
      const price = price2024 || priceOld || 0;
      if (price === 0) return; // skip empty aesthetic rows

      // Don't duplicate if already in Lookup Items
      const exists = treatments.some((t) => t.code.toLowerCase() === codeStr.toLowerCase());
      if (exists) return;

      treatments.push({
        code: codeStr,
        description: descStr,
        icd10: "",
        unitCost: price,
        labFee: 0,
        implantFee: 0,
        source: "Aesthetic",
        category: "aesthetic",
        termsAndConditions: "",
        warranty: "",
        isLabFee: false,
      });
    });
  }

  // ── 3. Parse Pricing 2019 (only codes not already present) ─
  const pricing2019 = workbook.getWorksheet("Pricing 2019");
  if (pricing2019) {
    pricing2019.eachRow((row, rowNumber) => {
      if (rowNumber < 114) return;
      const code = cellValue(row.getCell(1));
      const description = cellValue(row.getCell(2));
      if (!code || !description) return;

      const codeStr = String(code).trim();
      const exists = treatments.some((t) => t.code === codeStr);
      if (exists) return;

      const price = numValue(row.getCell(4));
      if (!price) return;

      treatments.push({
        code: codeStr,
        description: String(description).trim(),
        icd10: "",
        unitCost: price,
        labFee: 0,
        implantFee: 0,
        source: "Pricing 2019",
        category: categorizeCode(codeStr),
        termsAndConditions: "",
        warranty: "",
        isLabFee: false,
      });
    });
  }

  // ── 4. Apply T&Cs to treatments by category ───────────────
  for (const [tcName, tcData] of Object.entries(termsAndConditions)) {
    const tcCategory = TC_CATEGORY_MAP[tcName];
    if (!tcCategory) continue;

    const fullTc = [tcData.description, tcData.tc].filter(Boolean).join("\n\n");

    for (const t of treatments) {
      if (tcCategory === "general" || t.category === tcCategory) {
        if (t.termsAndConditions) {
          t.termsAndConditions += "\n\n" + fullTc;
        } else {
          t.termsAndConditions = fullTc;
        }
        if (tcData.warranty && tcData.warranty !== "0") {
          t.warranty = tcData.warranty;
        }
      }
    }
  }

  // ── 5. Sort: procedures first, lab fees last ───────────────
  treatments.sort((a, b) => {
    if (a.isLabFee !== b.isLabFee) return a.isLabFee ? 1 : -1;
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.code.localeCompare(b.code, undefined, { numeric: true });
  });

  // Summary stats
  const stats = {
    total: treatments.length,
    procedures: treatments.filter((t) => !t.isLabFee).length,
    labFees: treatments.filter((t) => t.isLabFee).length,
    aesthetic: treatments.filter((t) => t.category === "aesthetic").length,
    withTCs: treatments.filter((t) => t.termsAndConditions).length,
    categories: [...new Set(treatments.map((t) => t.category))].sort(),
  };

  return { treatments, stats, termsAndConditions };
}

function categorizeCode(code: string): string {
  const c = code.toUpperCase();
  if (
    c.startsWith("NEURO") || c.startsWith("FILLER") || c.startsWith("SKIN") ||
    c.startsWith("APTOS") || c.startsWith("INVIS") || c.startsWith("SPARK") ||
    c.startsWith("HAIR") || c.startsWith("MESO")
  ) return "aesthetic";

  const num = parseInt(code);
  if (isNaN(num)) return "other";
  if (num >= 8099 && num <= 8099) return "lab-fee";
  if (num >= 8101 && num <= 8130) return "diagnostic";
  if (num >= 8131 && num <= 8160) return "preventive";
  if (num >= 8161 && num <= 8199) return "restorative";
  if (num >= 8200 && num <= 8299) return "endodontic";
  if (num >= 8300 && num <= 8399) return "prosthodontic";
  if (num >= 8400 && num <= 8499) return "surgical";
  if (num >= 8500 && num <= 8599) return "periodontal";
  if (num >= 8600 && num <= 8699) return "orthodontic";
  if (num >= 8700 && num <= 8999) return "restorative";
  if (num >= 9000 && num <= 9999) return "other";
  return "other";
}

function isICD10(value: string): boolean {
  return /^I[A-Z]\d/.test(value);
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
