import JSZip from "jszip";
import { verifyAuth } from "@/lib/firebase";
import { getTemplateBuffer } from "@/lib/templates";
import type { SelectedTreatment, PracticeSettings } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type BasicCodeItem = {
  code: string;
  description: string;
  price: number;
  quantity: number;
};

type Body = {
  patientName: string;
  date: string;
  quoteRef: string;
  selectedTreatments: SelectedTreatment[];
  settings: PracticeSettings;
  discount?: number;
  appointmentCount?: number;
  basicCodes?: BasicCodeItem[];
};

/*
  Template "Full Estimate" sheet layout (xl/worksheets/sheet1.xml):

  Row 17:  B17 = "Dear [name]",  K17 = "Date: [date]"
  Rows 31-37: Appointment breakdown (F = treatments, L = appointment length)
  Row 44: Column headers (D=Code, E:G=Description, H=ICD-10, I=Provider, J=Tooth, K=Price, L=Units, M=Total)
  Rows 45-77: Treatment line items (33 available rows)
      - D: Item Code (direct value)
      - E: Description (currently VLOOKUP — replace with inline string)
      - H: ICD-10 (currently VLOOKUP — replace with inline string)
      - K: Unit Price (currently VLOOKUP — replace with number)
      - L: Units (number)
      - M: Total (K*L formula or direct number)
  Row 78-80: Discount rows (M = discount amounts)
  Row 81: Total after discount (M81)
  Row 89: Third party total (M89)
  Row 90: Grand total (M90)
  Row 41: Grand total preview (L:N merged)
*/

export async function POST(request: Request) {
  try {
    await verifyAuth(request);
    const body = (await request.json()) as Body;
    const {
      patientName,
      date,
      selectedTreatments,
      settings,
      appointmentCount = 1,
      basicCodes = [],
    } = body;

    // Load the actual template
    const templateBuf = await getTemplateBuffer("templates/estimate-template.xlsx");
    const zip = await JSZip.loadAsync(templateBuf);

    // Get the Full Estimate sheet XML
    let sheetXml = await zip.file("xl/worksheets/sheet1.xml")!.async("string");

    // ── 0. Strip ALL formulas from the sheet ──────────────
    // The template has 165 VLOOKUP formulas referencing Table1/Table2.
    // These break because we're providing data directly, not via the lookup table.
    // Replace every formula cell with either its cached value or empty.
    sheetXml = stripAllFormulas(sheetXml);

    // Also strip formulas from third-party fee rows (84-88) and T&C rows (154-159)
    for (let r = 84; r <= 88; r++) {
      for (const col of ["D", "E", "F", "G", "H", "I", "J", "K", "L", "M"]) {
        sheetXml = clearCell(sheetXml, `${col}${r}`);
      }
    }

    // ── 1. Fill patient name and date (row 17) ──────────────
    sheetXml = setCellInlineString(sheetXml, "B17", `Dear ${patientName}`);
    sheetXml = setCellInlineString(sheetXml, "K17", `Date: ${date}`);

    // ── 2. Fill appointment breakdown (rows 31-37) ──────────
    for (let i = 0; i < 7; i++) {
      const row = 31 + i;
      if (i < appointmentCount) {
        // Leave the "Appointment N" label as-is, fill treatments summary
        const apptTreatments = getAppointmentTreatments(selectedTreatments, i, appointmentCount);
        const summary = apptTreatments.map(st =>
          st.selectedCodes.map(c => c.description).join(", ")
        ).join("; ");
        sheetXml = setCellInlineString(sheetXml, `F${row}`, summary || "Basic codes");
      } else {
        // Clear unused appointment rows
        sheetXml = setCellInlineString(sheetXml, `F${row}`, "");
        sheetXml = setCellInlineString(sheetXml, `L${row}`, "");
      }
    }

    // ── 3. Build line items ─────────────────────────────────
    type LineItem = {
      code: string;
      description: string;
      icd10: string;
      price: number;
      quantity: number;
      total: number;
    };

    const lineItems: LineItem[] = [];

    // Basic codes per appointment
    for (let apt = 0; apt < appointmentCount; apt++) {
      for (const bc of basicCodes) {
        lineItems.push({
          code: bc.code,
          description: bc.description,
          icd10: "",
          price: bc.price,
          quantity: bc.quantity,
          total: bc.price * bc.quantity,
        });
      }
    }

    // Selected treatments
    for (const st of selectedTreatments) {
      for (const sc of st.selectedCodes) {
        const matchingCode = st.treatment.codes.find(c => c.code === sc.code);
        lineItems.push({
          code: sc.code,
          description: sc.description,
          icd10: matchingCode?.icd10 || "",
          price: sc.price,
          quantity: sc.quantity,
          total: sc.price * sc.quantity,
        });
      }
    }

    // ── 4. Fill treatment rows 45-77 ────────────────────────
    const maxRows = 33; // rows 45-77
    let grandTotal = 0;

    for (let i = 0; i < maxRows; i++) {
      const row = 45 + i;
      if (i < lineItems.length) {
        const item = lineItems[i];
        sheetXml = setCellInlineString(sheetXml, `D${row}`, item.code);
        sheetXml = setCellInlineString(sheetXml, `E${row}`, item.description);
        // Clear F and G (merged with E in display)
        sheetXml = clearCell(sheetXml, `F${row}`);
        sheetXml = clearCell(sheetXml, `G${row}`);
        sheetXml = setCellInlineString(sheetXml, `H${row}`, item.icd10);
        sheetXml = setCellNumber(sheetXml, `K${row}`, item.price);
        sheetXml = setCellNumber(sheetXml, `L${row}`, item.quantity);
        sheetXml = setCellNumber(sheetXml, `M${row}`, item.total);
        grandTotal += item.total;
      } else {
        // Clear unused rows
        for (const col of ["D", "E", "F", "G", "H", "I", "J", "K", "L", "M"]) {
          sheetXml = clearCell(sheetXml, `${col}${row}`);
        }
      }
    }

    // ── 5. Update discount rows (78-80) ─────────────────────
    sheetXml = setCellNumber(sheetXml, "M78", grandTotal * 0.95);  // 5% discount total
    sheetXml = setCellNumber(sheetXml, "M79", grandTotal * 0.90);  // 10% discount total
    sheetXml = setCellNumber(sheetXml, "M80", grandTotal * 0.85);  // 15% discount total

    // ── 6. Update totals ────────────────────────────────────
    sheetXml = setCellNumber(sheetXml, "M81", grandTotal);   // Total after discount
    sheetXml = setCellNumber(sheetXml, "M89", 0);            // Third party total
    sheetXml = setCellNumber(sheetXml, "M90", grandTotal);   // Grand total

    // Update grand total preview (row 41) — cells L41, M41, N41
    sheetXml = setCellNumber(sheetXml, "L41", grandTotal);
    sheetXml = setCellNumber(sheetXml, "M41", grandTotal);
    sheetXml = setCellNumber(sheetXml, "N41", grandTotal);

    // ── 7. Save modified sheet back to ZIP ──────────────────
    zip.file("xl/worksheets/sheet1.xml", sheetXml);

    // Remove calcChain.xml to avoid stale formula errors
    zip.remove("xl/calcChain.xml");
    // Also remove the calcChain reference from [Content_Types].xml
    let contentTypes = await zip.file("[Content_Types].xml")!.async("string");
    contentTypes = contentTypes.replace(
      /<Override PartName="\/xl\/calcChain\.xml"[^/]*\/>/,
      ""
    );
    zip.file("[Content_Types].xml", contentTypes);

    // Remove calcChain from workbook relationships
    let wbRels = await zip.file("xl/_rels/workbook.xml.rels")!.async("string");
    wbRels = wbRels.replace(
      /<Relationship[^>]*Target="calcChain\.xml"[^/]*\/>/,
      ""
    );
    zip.file("xl/_rels/workbook.xml.rels", wbRels);

    // ── 8. Generate output ──────────────────────────────────
    const buffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    const filename = `estimate-${slug(patientName)}-${date}.xlsx`;

    return new Response(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("[xlsx] error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// ── XML manipulation helpers ────────────────────────────────

/**
 * Replace a cell's value with an inline string.
 * Changes the cell type to "inlineStr" and uses <is><t>value</t></is>
 * instead of shared string references.
 */
function setCellInlineString(xml: string, cellRef: string, value: string): string {
  const escaped = escapeXml(value);
  const cellRegex = new RegExp(
    `<c r="${cellRef}"([^>]*)>([\\s\\S]*?)</c>`,
    ""
  );
  const selfCloseRegex = new RegExp(
    `<c r="${cellRef}"([^/]*?)/>`,
    ""
  );

  const replacement = `<c r="${cellRef}" t="inlineStr"><is><t>${escaped}</t></is></c>`;

  if (cellRegex.test(xml)) {
    // Cell exists with content — replace it
    return xml.replace(cellRegex, (_match, attrs) => {
      // Preserve style (s="N") if present
      const styleMatch = attrs.match(/s="(\d+)"/);
      const style = styleMatch ? ` s="${styleMatch[1]}"` : "";
      return `<c r="${cellRef}"${style} t="inlineStr"><is><t>${escaped}</t></is></c>`;
    });
  } else if (selfCloseRegex.test(xml)) {
    // Cell exists but is self-closing (empty) — replace it
    return xml.replace(selfCloseRegex, (_match, attrs) => {
      const styleMatch = attrs.match(/s="(\d+)"/);
      const style = styleMatch ? ` s="${styleMatch[1]}"` : "";
      return `<c r="${cellRef}"${style} t="inlineStr"><is><t>${escaped}</t></is></c>`;
    });
  }

  // Cell doesn't exist — insert it into the correct row
  return insertCellInRow(xml, cellRef, replacement);
}

/**
 * Replace a cell's value with a number.
 */
function setCellNumber(xml: string, cellRef: string, value: number): string {
  const cellRegex = new RegExp(
    `<c r="${cellRef}"([^>]*)>([\\s\\S]*?)</c>`,
    ""
  );
  const selfCloseRegex = new RegExp(
    `<c r="${cellRef}"([^/]*?)/>`,
    ""
  );

  const makeCell = (style: string) =>
    `<c r="${cellRef}"${style}><v>${value}</v></c>`;

  if (cellRegex.test(xml)) {
    return xml.replace(cellRegex, (_match, attrs) => {
      const styleMatch = attrs.match(/s="(\d+)"/);
      const style = styleMatch ? ` s="${styleMatch[1]}"` : "";
      return makeCell(style);
    });
  } else if (selfCloseRegex.test(xml)) {
    return xml.replace(selfCloseRegex, (_match, attrs) => {
      const styleMatch = attrs.match(/s="(\d+)"/);
      const style = styleMatch ? ` s="${styleMatch[1]}"` : "";
      return makeCell(style);
    });
  }

  return insertCellInRow(xml, cellRef, makeCell(""));
}

/**
 * Clear a cell's value (make it empty but keep style).
 */
function clearCell(xml: string, cellRef: string): string {
  const cellRegex = new RegExp(
    `<c r="${cellRef}"([^>]*)>([\\s\\S]*?)</c>`,
    ""
  );

  if (cellRegex.test(xml)) {
    return xml.replace(cellRegex, (_match, attrs) => {
      const styleMatch = attrs.match(/s="(\d+)"/);
      const style = styleMatch ? ` s="${styleMatch[1]}"` : "";
      return `<c r="${cellRef}"${style}/>`;
    });
  }
  return xml;
}

/**
 * Insert a cell XML into the correct row.
 */
function insertCellInRow(xml: string, cellRef: string, cellXml: string): string {
  const rowNum = cellRef.replace(/[A-Z]+/, "");
  const rowRegex = new RegExp(
    `(<row r="${rowNum}"[^>]*>)([\\s\\S]*?)(</row>)`,
    ""
  );

  if (rowRegex.test(xml)) {
    return xml.replace(rowRegex, `$1$2${cellXml}$3`);
  }
  return xml;
}

function getAppointmentTreatments(
  treatments: SelectedTreatment[],
  appointmentIndex: number,
  totalAppointments: number,
): SelectedTreatment[] {
  if (totalAppointments <= 1) return treatments;
  return treatments.filter((_, idx) => idx % totalAppointments === appointmentIndex);
}

/**
 * Strip ALL formula elements from the sheet XML.
 * Replaces <f>...</f> and <f .../> tags, keeping cached <v> values.
 * Also removes t="e" (error type) from cells that had broken formulas.
 */
function stripAllFormulas(xml: string): string {
  // Remove <f>...</f> tags (formulas with content)
  let result = xml.replace(/<f>[^<]*<\/f>/g, "");
  // Remove <f .../> tags (shared formulas etc)
  result = result.replace(/<f[^>]*\/>/g, "");
  // Remove <f ...>...</f> tags (formulas with attributes)
  result = result.replace(/<f[^>]*>[^<]*<\/f>/g, "");
  // Remove t="e" (error type) — these cells had #N/A, change to plain value
  result = result.replace(/ t="e"/g, "");
  return result;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "patient";
}
