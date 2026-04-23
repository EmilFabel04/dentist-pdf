import ExcelJS from "exceljs";
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

/* ─── Template cell positions ────────────────────────────────────
 *
 *  Row  17, Col  2 (B17):  "Dear" + patient name
 *  Row  17, Col 11 (K17):  "Date:" + date value
 *
 *  Row  30: Appointment breakdown headers
 *  Rows 31-37: Appointment rows
 *      Col  3-4  (C:D):   "Appointment N" label
 *      Col  6-11 (F:K):   Treatments description (merged F:K)
 *      Col 12-14 (L:N):   Appointment length (merged L:N)
 *
 *  Row  41, Col 12-14 (L:N): Grand Total formula cell (=M90)
 *
 *  Row  44: Column headers
 *  Rows 45-77: Treatment line items
 *      Col  4  (D):   Item Code
 *      Col  5-7 (E:G): Description (merged)
 *      Col  8  (H):   ICD-10
 *      Col  9  (I):   Provider
 *      Col 10  (J):   Tooth Numbers
 *      Col 11  (K):   Per Unit Price
 *      Col 12  (L):   Units
 *      Col 13  (M):   Total (K*L)
 *
 *  Rows 78-80: Discount rows (5%, 10%, 15%)
 *  Row  81, Col 13 (M): SUM(M45:M80)  = total incl discount
 *  Row  83: Third Party Fees header
 *  Rows 84-88: Third party line items
 *  Row  89, Col 13 (M): SUM(M84:M88)
 *  Row  90, Col 13 (M): SUM(M84:M88)+M81 = grand total
 * ──────────────────────────────────────────────────────────────── */

const DATA_ROW_START = 45;
const DATA_ROW_END = 77;

export async function POST(request: Request) {
  try {
    await verifyAuth(request);
    const body = (await request.json()) as Body;
    const {
      patientName,
      date,
      quoteRef,
      selectedTreatments,
      settings,
      discount,
      appointmentCount,
      basicCodes,
    } = body;

    /* ── 1. Load the template ─────────────────────────────────── */
    const templateBuf = await getTemplateBuffer(
      "templates/estimate-template.xlsx"
    );
    const workbook = new ExcelJS.Workbook();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(templateBuf as any);

    const ws = workbook.getWorksheet("Full Estimate");
    if (!ws) {
      throw new Error("Template missing 'Full Estimate' worksheet");
    }

    /* ── 2. Fill patient info & date ──────────────────────────── */
    ws.getCell(17, 2).value = `Dear ${patientName}`;
    ws.getCell(17, 11).value = `Date: ${date}`;

    /* ── 3. Clear sample data rows (45-77) ────────────────────── */
    // Clear cell values but keep row/cell formatting intact
    for (let r = DATA_ROW_START; r <= DATA_ROW_END; r++) {
      for (const col of [4, 5, 6, 7, 8, 9, 10, 11, 12, 13]) {
        ws.getCell(r, col).value = null;
      }
    }

    /* ── 4. Build flat list of treatment line items ────────────── */
    type LineItem = {
      code: string;
      description: string;
      icd10?: string;
      price: number;
      quantity: number;
      total: number;
    };

    const lineItems: LineItem[] = [];

    // Distribute treatments across appointments
    const numAppointments =
      appointmentCount || selectedTreatments.length || 1;
    const treatmentsPerAppointment: SelectedTreatment[][] = [];

    if (appointmentCount && appointmentCount > 0) {
      for (let i = 0; i < appointmentCount; i++) {
        treatmentsPerAppointment.push([]);
      }
      selectedTreatments.forEach((st, idx) => {
        const apptIdx = idx % appointmentCount;
        treatmentsPerAppointment[apptIdx].push(st);
      });
    } else {
      selectedTreatments.forEach((st) => {
        treatmentsPerAppointment.push([st]);
      });
    }

    // Basic codes (added to every appointment)
    const basicItems: LineItem[] = [];
    if (basicCodes && basicCodes.length > 0) {
      for (const bc of basicCodes) {
        basicItems.push({
          code: bc.code,
          description: bc.description,
          price: bc.price,
          quantity: bc.quantity,
          total: bc.price * bc.quantity,
        });
      }
    }

    // Collect all items per appointment (for breakdown) and flat list
    const appointmentItems: { items: LineItem[]; subtotal: number }[] = [];

    for (
      let apptIdx = 0;
      apptIdx < treatmentsPerAppointment.length;
      apptIdx++
    ) {
      const apptTreatments = treatmentsPerAppointment[apptIdx];
      const items: LineItem[] = [...basicItems];

      for (const st of apptTreatments) {
        for (const sc of st.selectedCodes) {
          items.push({
            code: sc.code,
            description: sc.description,
            price: sc.price,
            quantity: sc.quantity,
            total: sc.price * sc.quantity,
          });
        }
      }

      const subtotal = items.reduce((s, it) => s + it.total, 0);
      appointmentItems.push({ items, subtotal });
    }

    // Flatten to a single list for the line items area
    for (const appt of appointmentItems) {
      lineItems.push(...appt.items);
    }

    /* ── 5. Fill appointment breakdown (rows 31-37) ───────────── */
    for (let i = 0; i < 7; i++) {
      const row = 31 + i;
      if (i < appointmentItems.length) {
        const appt = appointmentItems[i];
        // Treatments description — summarize the codes
        const treatmentDesc = appt.items.map((it) => it.code).join(", ");
        ws.getCell(row, 6).value = treatmentDesc;
      } else {
        // Clear unused appointment rows
        ws.getCell(row, 6).value = null;
        ws.getCell(row, 12).value = null;
      }
    }

    /* ── 6. Fill treatment line items (rows 45+) ──────────────── */
    let grandTotal = 0;
    const maxRows = DATA_ROW_END - DATA_ROW_START + 1; // 33 available rows
    const itemsToWrite = lineItems.slice(0, maxRows);

    for (let i = 0; i < itemsToWrite.length; i++) {
      const r = DATA_ROW_START + i;
      const item = itemsToWrite[i];

      ws.getCell(r, 4).value = item.code; // D: Item Code
      ws.getCell(r, 5).value = item.description; // E: Description (merged E:G)
      if (item.icd10) {
        ws.getCell(r, 8).value = item.icd10; // H: ICD-10
      }
      ws.getCell(r, 11).value = item.price; // K: Per Unit Price
      ws.getCell(r, 12).value = item.quantity; // L: Units
      ws.getCell(r, 13).value = item.total; // M: Total

      grandTotal += item.total;
    }

    /* ── 7. Update discount rows (78-80) ──────────────────────── */
    // The template has formula-based discount rows.
    // Replace formulas with computed values based on actual grand total.
    const discount5 = grandTotal * 0.05;
    const discount10 = grandTotal * 0.1;
    const discount15 = grandTotal * 0.15;

    ws.getCell(78, 13).value = discount5;
    ws.getCell(79, 13).value = discount10;
    ws.getCell(80, 13).value = discount15;

    /* ── 8. Update totals ─────────────────────────────────────── */
    // Row 81, Col 13: Total (incl discount for our fees, excl 3rd party)
    // If a specific discount was passed, apply it
    let totalAfterDiscount = grandTotal;
    if (discount && discount > 0) {
      totalAfterDiscount = grandTotal - discount;
    }
    ws.getCell(81, 13).value = totalAfterDiscount;

    // Clear third-party rows 84-88 (no third-party items from the app)
    for (let r = 84; r <= 88; r++) {
      for (const col of [4, 5, 6, 7, 8, 9, 10, 11, 12, 13]) {
        ws.getCell(r, col).value = null;
      }
    }

    // Row 89: Third party total = 0
    ws.getCell(89, 13).value = 0;

    // Row 90: Grand total = total after discount + third party (0)
    ws.getCell(90, 13).value = totalAfterDiscount;

    // Row 41: Grand total header formula cell — replace with computed value
    ws.getCell(41, 12).value = totalAfterDiscount;
    ws.getCell(41, 13).value = totalAfterDiscount;
    ws.getCell(41, 14).value = totalAfterDiscount;

    /* ── 9. Write buffer and respond ──────────────────────────── */
    const arrayBuffer = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.from(arrayBuffer);

    return new Response(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="estimate-${quoteRef}.xlsx"`,
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
