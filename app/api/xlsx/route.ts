import ExcelJS from "exceljs";
import type { SelectedTreatment, PracticeSettings } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  patientName: string;
  date: string;
  quoteRef: string;
  selectedTreatments: SelectedTreatment[];
  settings: PracticeSettings;
  discount?: number;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const {
      patientName,
      date,
      quoteRef,
      selectedTreatments,
      settings,
      discount,
    } = body;

    const currency = settings.currency || "USD";
    const currencyFmt = `"${currency}" #,##0.00`;

    const workbook = new ExcelJS.Workbook();

    /* ═══════════════════════════════════════════════════════════
       Sheet 1: Estimate
       ═══════════════════════════════════════════════════════════ */
    const ws = workbook.addWorksheet("Estimate");

    ws.columns = [
      { key: "code", width: 14 },
      { key: "description", width: 40 },
      { key: "qty", width: 8 },
      { key: "price", width: 14 },
      { key: "total", width: 14 },
    ];

    /* Row 1 – Practice name */
    ws.mergeCells("A1:E1");
    const titleCell = ws.getCell("A1");
    titleCell.value = settings.name;
    titleCell.font = { bold: true, size: 16, color: { argb: "FF3B82F6" } };

    /* Row 2 – Address */
    ws.mergeCells("A2:E2");
    ws.getCell("A2").value = settings.address;

    /* Row 3 – Phone | Email */
    ws.mergeCells("A3:E3");
    ws.getCell("A3").value = `${settings.phone}  |  ${settings.email}`;

    /* Row 5 – Patient + Date */
    ws.getCell("A5").value = "Patient:";
    ws.getCell("A5").font = { bold: true };
    ws.getCell("B5").value = patientName;
    ws.getCell("D5").value = "Date:";
    ws.getCell("D5").font = { bold: true };
    ws.getCell("E5").value = date;

    /* Row 6 – Quote Ref */
    ws.getCell("A6").value = "Quote Ref:";
    ws.getCell("A6").font = { bold: true };
    ws.getCell("B6").value = quoteRef;

    /* Row 8 – Column headers */
    const headerRow = 8;
    const headers = ["Code", "Description", "Qty", "Unit Price", "Total"];
    headers.forEach((h, i) => {
      const cell = ws.getCell(headerRow, i + 1);
      cell.value = h;
      cell.font = { bold: true };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF0F3F9" },
      };
      cell.border = {
        bottom: { style: "thin" },
      };
    });

    let row = headerRow + 1;
    let grandTotal = 0;

    for (const st of selectedTreatments) {
      /* Group header */
      ws.mergeCells(row, 1, row, 5);
      const groupCell = ws.getCell(row, 1);
      groupCell.value = st.treatment.name;
      groupCell.font = { bold: true, color: { argb: "FF3B82F6" } };
      groupCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE8EDFF" },
      };
      row++;

      let subtotal = 0;

      for (const sc of st.selectedCodes) {
        const lineTotal = sc.price * sc.quantity;
        subtotal += lineTotal;

        ws.getCell(row, 1).value = sc.code;
        ws.getCell(row, 2).value = sc.description;
        const qtyCell = ws.getCell(row, 3);
        qtyCell.value = sc.quantity;
        qtyCell.alignment = { horizontal: "center" };
        const priceCell = ws.getCell(row, 4);
        priceCell.value = sc.price;
        priceCell.numFmt = currencyFmt;
        const totalCell = ws.getCell(row, 5);
        totalCell.value = lineTotal;
        totalCell.numFmt = currencyFmt;
        row++;
      }

      /* Subtotal row */
      ws.getCell(row, 4).value = "Subtotal";
      ws.getCell(row, 4).font = { italic: true };
      ws.getCell(row, 4).alignment = { horizontal: "right" };
      const subCell = ws.getCell(row, 5);
      subCell.value = subtotal;
      subCell.numFmt = currencyFmt;
      subCell.font = { bold: true };
      subCell.border = { top: { style: "thin" } };
      row++;

      grandTotal += subtotal;
    }

    /* Discount row */
    if (discount && discount > 0) {
      ws.getCell(row, 4).value = "Discount";
      ws.getCell(row, 4).font = { color: { argb: "FF198038" } };
      ws.getCell(row, 4).alignment = { horizontal: "right" };
      const discCell = ws.getCell(row, 5);
      discCell.value = -discount;
      discCell.numFmt = currencyFmt;
      discCell.font = { color: { argb: "FF198038" } };
      row++;
      grandTotal -= discount;
    }

    /* Grand total row */
    ws.getCell(row, 4).value = "Total";
    ws.getCell(row, 4).font = { bold: true, size: 12 };
    ws.getCell(row, 4).alignment = { horizontal: "right" };
    const gtCell = ws.getCell(row, 5);
    gtCell.value = grandTotal;
    gtCell.numFmt = currencyFmt;
    gtCell.font = { bold: true, size: 12 };
    gtCell.border = { top: { style: "double" } };
    row++;

    /* VAT */
    if (settings.vatRate && settings.vatRate > 0) {
      const vatAmount = grandTotal * (settings.vatRate / 100);
      ws.getCell(row, 4).value = `VAT (${settings.vatRate}%)`;
      ws.getCell(row, 4).alignment = { horizontal: "right" };
      const vatCell = ws.getCell(row, 5);
      vatCell.value = vatAmount;
      vatCell.numFmt = currencyFmt;
      row++;

      const finalTotal = grandTotal + vatAmount;
      ws.getCell(row, 4).value = "Final Total";
      ws.getCell(row, 4).font = { bold: true, size: 14 };
      ws.getCell(row, 4).alignment = { horizontal: "right" };
      const finalCell = ws.getCell(row, 5);
      finalCell.value = finalTotal;
      finalCell.numFmt = currencyFmt;
      finalCell.font = { bold: true, size: 14 };
      row++;
    }

    /* Quote validity + payment terms */
    row++;
    ws.getCell(row, 1).value = `Quote valid for ${settings.quoteValidityDays} days from date of issue.`;
    ws.getCell(row, 1).font = { italic: true, color: { argb: "FF999999" } };
    row++;
    ws.getCell(row, 1).value = settings.defaultPaymentTerms;
    ws.getCell(row, 1).font = { italic: true, color: { argb: "FF999999" } };

    /* ═══════════════════════════════════════════════════════════
       Sheet 2: Terms & Conditions
       ═══════════════════════════════════════════════════════════ */
    const tcSheet = workbook.addWorksheet("Terms & Conditions");
    tcSheet.getColumn(1).width = 80;

    let tcRow = 1;
    tcSheet.getCell(tcRow, 1).value = "Terms & Conditions";
    tcSheet.getCell(tcRow, 1).font = {
      bold: true,
      size: 16,
      color: { argb: "FF3B82F6" },
    };
    tcRow += 2;

    for (const st of selectedTreatments) {
      if (!st.treatment.termsAndConditions) continue;

      tcSheet.getCell(tcRow, 1).value = st.treatment.name;
      tcSheet.getCell(tcRow, 1).font = { bold: true, size: 12 };
      tcRow++;

      const lines = st.treatment.termsAndConditions.split("\n");
      for (const line of lines) {
        tcSheet.getCell(tcRow, 1).value = line;
        tcRow++;
      }

      tcRow++; // blank row between treatments
    }

    /* ── Write buffer and respond ─────────────────────────────── */
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
