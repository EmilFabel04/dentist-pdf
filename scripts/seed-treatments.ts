/**
 * Seed script: parses the dentist's Excel spreadsheet and pushes
 * organized treatments to Firestore.
 *
 * Usage: npx tsx scripts/seed-treatments.ts
 *
 * Requires: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY in .env.local
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as ExcelJS from "exceljs";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

// ── Firebase init ────────────────────────────────────────────
const app =
  getApps().length > 0
    ? getApps()[0]
    : initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
        }),
      });

const db = getFirestore(app);
const PRACTICE_ID = "default";
const practiceRef = db.collection("practices").doc(PRACTICE_ID);

// ── Types ────────────────────────────────────────────────────

type RawCode = {
  code: string;
  description: string;
  icd10: string;
  unitCost: number;
  labFee: number;
  implantFee: number;
  source: string;
};

type TreatmentGroup = {
  name: string;
  category: string;
  codes: {
    code: string;
    description: string;
    price: number;
    icd10?: string;
    labFee?: number;
    implantFee?: number;
  }[];
  termsAndConditions: string;
};

type TCEntry = {
  name: string;
  category: string;
  description: string;
  conditions: string;
  warranty: string;
};

// ── Category mapping ─────────────────────────────────────────

const CATEGORY_RANGES: [number, number, string, string][] = [
  [8099, 8099, "lab-fee", "Lab Fees"],
  [8101, 8130, "diagnostic", "Diagnostic & Examination"],
  [8131, 8160, "preventive", "Preventive & Basic"],
  [8161, 8199, "restorative", "Restorative"],
  [8200, 8260, "surgical", "Oral Surgery & Extractions"],
  [8261, 8299, "surgical", "Implant Surgery"],
  [8301, 8360, "endodontic", "Endodontics"],
  [8361, 8399, "restorative", "Restorative - Fillings"],
  [8400, 8499, "prosthodontic", "Crowns"],
  [8500, 8599, "prosthodontic", "Bridges & Fixed Prosthetics"],
  [8600, 8699, "prosthodontic", "Dentures & Removable"],
  [8700, 8799, "periodontal", "Periodontics"],
  [8800, 8899, "orthodontic", "Orthodontics"],
  [8900, 8999, "surgical", "Post-operative"],
];

// T&C rows use these "codes" as identifiers
const TC_ENTRIES: Record<string, string> = {
  Treatment: "general",
  Consultation: "diagnostic",
  "Check Up": "diagnostic",
  "Scale and Polish": "preventive",
  Restorations: "restorative",
  "Root Canal": "endodontic",
  "Crown and Bridge/ post and core": "prosthodontic",
  Implants: "surgical",
  "Provisional crowns/prostheses": "prosthodontic",
};

// ── Helpers ──────────────────────────────────────────────────

function cellValue(cell: ExcelJS.Cell): string | number | null {
  const v = cell.value;
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && "result" in v)
    return (v as { result: string | number }).result;
  if (typeof v === "object" && "text" in v) return (v as { text: string }).text;
  return v as string | number;
}

function numValue(cell: ExcelJS.Cell): number {
  const v = cellValue(cell);
  if (v === null) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return isNaN(n) ? 0 : n;
}

function categorize(code: string): string {
  const c = code.toUpperCase();
  if (
    c.startsWith("NEURO") ||
    c.startsWith("FILLER") ||
    c.startsWith("SKIN") ||
    c.startsWith("APTOS") ||
    c.startsWith("HAIR") ||
    c.startsWith("MESO") ||
    c.startsWith("INVIS") ||
    c.startsWith("SPARK")
  )
    return "aesthetic";

  const num = parseInt(code);
  if (isNaN(num)) return "other";

  for (const [min, max, cat] of CATEGORY_RANGES) {
    if (num >= min && num <= max) return cat;
  }
  return "other";
}

// Aesthetic treatments that bill under a standard code
// The internal name (e.g. NEUROFROWN) becomes the description variant,
// and the billing code (9099C) is the actual code used on invoices.
const AESTHETIC_BILLING_MAP: Record<string, string> = {
  NEUROFROWN: "9099C",
  NEUROBUNNY: "9099C",
  NEUROEYES: "9099C",
  NEUROFORE: "9099C",
  NEUROTMJ: "9099C",
  NEUROTMJTEMP: "9099C",
};

function mapToBillingCode(code: string): string {
  return AESTHETIC_BILLING_MAP[code.toUpperCase()] ?? code;
}

function isAestheticRemapped(code: string): boolean {
  return code.toUpperCase() in AESTHETIC_BILLING_MAP;
}

function baseCode(code: string): string {
  const num = parseInt(code);
  if (isNaN(num)) return code; // aesthetic / non-numeric — keep as-is
  // Strip trailing letters: "8109H" → "8109", "8099SEM" → "8099"
  return String(num);
}

function groupName(codes: RawCode[]): string {
  // Use the shortest description as the group name (usually the base variant)
  const sorted = [...codes].sort(
    (a, b) => a.description.length - b.description.length
  );
  let name = sorted[0].description;
  // Clean up: remove "on tooth num." and trailing whitespace
  name = name.replace(/\s+on tooth num\.?\s*$/, "");
  name = name.replace(/\s+per visit\s*$/i, "");
  name = name.trim();
  return name;
}

function isICD10(value: string): boolean {
  return /^I[A-Z]\d/.test(value);
}

// ── Main ─────────────────────────────────────────────────────

async function main() {
  console.log("Parsing spreadsheet...\n");

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(
    path.resolve(process.cwd(), "data/estimate-template.xlsx")
  );

  const rawCodes: RawCode[] = [];
  const tcEntries: TCEntry[] = [];

  // ── 1. Parse Lookup Items ──────────────────────────────────
  const lookupSheet = workbook.getWorksheet("Lookup Items");
  if (!lookupSheet) throw new Error("Lookup Items sheet not found");

  lookupSheet.eachRow((row, rowNumber) => {
    if (rowNumber < 4) return;
    const code = cellValue(row.getCell(2));
    const desc = cellValue(row.getCell(3));
    if (!code || !desc) return;

    const codeStr = String(code).trim();
    const descStr = String(desc).trim();
    const icd10Raw = cellValue(row.getCell(4));
    const icd10Str = icd10Raw ? String(icd10Raw).trim() : "";
    const costRaw = cellValue(row.getCell(5));

    // Detect T&C rows
    if (codeStr in TC_ENTRIES) {
      tcEntries.push({
        name: codeStr,
        category: TC_ENTRIES[codeStr],
        description: descStr,
        conditions: icd10Str,
        warranty: costRaw ? String(costRaw).trim() : "",
      });
      return;
    }

    // For remapped aesthetics (NEURO→9099C), use the billing code
    // but mark with a group key so they don't merge with Chlorhexidine
    const billingCode = mapToBillingCode(codeStr);
    const remapped = isAestheticRemapped(codeStr);

    rawCodes.push({
      code: billingCode,
      description: descStr,
      icd10: isICD10(icd10Str) ? icd10Str : "",
      unitCost: numValue(row.getCell(5)),
      labFee: numValue(row.getCell(6)),
      implantFee: numValue(row.getCell(7)),
      source: remapped ? "Aesthetic-Neuro" : "Lookup Items",
    });
  });

  // ── 2. Parse Aesthetic Pricing ─────────────────────────────
  const aestheticSheet = workbook.getWorksheet("Aesthetic Pricing");
  if (aestheticSheet) {
    aestheticSheet.eachRow((row, rowNumber) => {
      if (rowNumber < 2) return;
      const code = cellValue(row.getCell(1));
      const desc = cellValue(row.getCell(2));
      if (!code || !desc) return;

      const codeStr = String(code).trim();
      const descStr = String(desc).trim();
      if (!descStr || descStr.toLowerCase().includes("aligner fees")) return;

      const price2024 = numValue(row.getCell(4));
      const priceOld = numValue(row.getCell(3));
      const price = price2024 || priceOld;
      if (!price) return;

      // Skip if already in lookup items (lookup has newer prices)
      const exists = rawCodes.some(
        (r) => r.code.toLowerCase() === codeStr.toLowerCase()
      );
      if (!exists) {
        rawCodes.push({
          code: codeStr,
          description: descStr,
          icd10: "",
          unitCost: price,
          labFee: 0,
          implantFee: 0,
          source: "Aesthetic",
        });
      }
    });
  }

  console.log(`Parsed ${rawCodes.length} codes, ${tcEntries.length} T&C entries\n`);

  // ── 3. Group codes by base number ──────────────────────────
  // Use source as a prefix to prevent cross-source merging
  // (e.g. 9099C Chlorhexidine vs 9099C Neurotoxin)
  const groups = new Map<string, RawCode[]>();
  for (const code of rawCodes) {
    const base = baseCode(code.code);
    const groupKey = code.source === "Aesthetic-Neuro" ? "neuro-9099C" : base;
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey)!.push(code);
  }

  // ── 4. Build Treatment documents ───────────────────────────
  const treatments: TreatmentGroup[] = [];

  for (const [groupKey, codes] of groups) {
    // Determine category — override for known aesthetic groups
    const category = groupKey === "neuro-9099C"
      ? "aesthetic"
      : categorize(codes[0].code);
    const name = groupKey === "neuro-9099C"
      ? "Neurotoxin Injections"
      : groupName(codes);

    // Build T&Cs for this treatment's category
    const relevantTCs = tcEntries.filter(
      (tc) => tc.category === category || tc.category === "general"
    );
    const tcText = relevantTCs
      .map((tc) => {
        const parts = [tc.description, tc.conditions].filter(Boolean);
        const text = parts.join("\n");
        const warranty =
          tc.warranty && tc.warranty !== "0" && tc.warranty !== "Warranty"
            ? `\nWarranty: ${tc.warranty}`
            : "";
        return text + warranty;
      })
      .join("\n\n---\n\n");

    treatments.push({
      name,
      category,
      codes: codes.map((c) => ({
        code: c.code,
        description: c.description,
        price: c.unitCost,
        ...(c.icd10 ? { icd10: c.icd10 } : {}),
        ...(c.labFee ? { labFee: c.labFee } : {}),
        ...(c.implantFee ? { implantFee: c.implantFee } : {}),
      })),
      termsAndConditions: tcText,
    });
  }

  // Sort by category then name
  treatments.sort((a, b) => {
    const catOrder = [
      "diagnostic",
      "preventive",
      "restorative",
      "endodontic",
      "prosthodontic",
      "surgical",
      "periodontal",
      "orthodontic",
      "aesthetic",
      "lab-fee",
      "other",
    ];
    const ai = catOrder.indexOf(a.category);
    const bi = catOrder.indexOf(b.category);
    if (ai !== bi) return ai - bi;
    return a.name.localeCompare(b.name);
  });

  // ── 5. Print summary ──────────────────────────────────────
  const categoryCounts: Record<string, number> = {};
  for (const t of treatments) {
    categoryCounts[t.category] = (categoryCounts[t.category] || 0) + 1;
  }

  console.log("Treatment groups by category:");
  for (const [cat, count] of Object.entries(categoryCounts)) {
    console.log(`  ${cat}: ${count} groups`);
  }
  console.log(`\nTotal: ${treatments.length} treatment groups\n`);

  // Print a few examples
  console.log("Examples:");
  for (const t of treatments.slice(0, 5)) {
    console.log(
      `  [${t.category}] ${t.name} — ${t.codes.length} variant(s): ${t.codes.map((c) => c.code).join(", ")}`
    );
  }
  console.log("  ...\n");

  // ── 6. Push to Firestore ───────────────────────────────────
  console.log("Clearing existing treatments...");
  const existing = await practiceRef.collection("treatments").get();
  if (!existing.empty) {
    const deleteBatches: FirebaseFirestore.WriteBatch[] = [];
    let batch = db.batch();
    let count = 0;
    for (const doc of existing.docs) {
      batch.delete(doc.ref);
      count++;
      if (count >= 450) {
        deleteBatches.push(batch);
        batch = db.batch();
        count = 0;
      }
    }
    if (count > 0) deleteBatches.push(batch);
    for (const b of deleteBatches) await b.commit();
    console.log(`  Deleted ${existing.size} existing treatments`);
  }

  console.log("Writing new treatments...");
  let written = 0;
  const writeBatches: FirebaseFirestore.WriteBatch[] = [];
  let wBatch = db.batch();
  let wCount = 0;

  for (const t of treatments) {
    const ref = practiceRef.collection("treatments").doc();
    wBatch.set(ref, t);
    wCount++;
    written++;
    if (wCount >= 450) {
      writeBatches.push(wBatch);
      wBatch = db.batch();
      wCount = 0;
    }
  }
  if (wCount > 0) writeBatches.push(wBatch);

  for (const b of writeBatches) await b.commit();

  console.log(`\nDone! Wrote ${written} treatment groups to Firestore.`);
  console.log(
    `\nT&Cs applied to categories: ${[...new Set(tcEntries.map((t) => t.category))].join(", ")}`
  );
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
