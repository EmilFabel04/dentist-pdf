import ExcelJS from "exceljs";
import { verifyAuth } from "@/lib/firebase";
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

    const currency = settings.currency || "USD";
    const currencyFmt = `"${currency}" #,##0.00`;
    const blueColor = "FF0F62FE";
    const lightBlueBg = "FFE8EDFF";
    const headerGrayBg = "FFF0F3F9";

    const workbook = new ExcelJS.Workbook();

    /* ═══════════════════════════════════════════════════════════
       Sheet 1: Full Estimate (professional letter format)
       ═══════════════════════════════════════════════════════════ */
    const ws = workbook.addWorksheet("Full Estimate");

    ws.columns = [
      { key: "code", width: 12 },
      { key: "description", width: 45 },
      { key: "qty", width: 8 },
      { key: "price", width: 14 },
      { key: "amount", width: 14 },
    ];

    /* ── Header Section (rows 1-7) ──────────────────────────── */

    // Row 1: empty
    // Row 2: Practice name
    ws.mergeCells("A2:E2");
    const practiceNameCell = ws.getCell("A2");
    practiceNameCell.value = settings.name;
    practiceNameCell.font = { bold: true, size: 14, color: { argb: blueColor } };

    // Row 3: Phone number
    ws.mergeCells("A3:E3");
    ws.getCell("A3").value = settings.phone;

    // Row 4: Practice Number (stored in vatNumber field)
    ws.mergeCells("A4:E4");
    ws.getCell("A4").value = `Practice Number: ${settings.vatNumber}`;

    // Row 5: Email
    ws.mergeCells("A5:E5");
    ws.getCell("A5").value = settings.email;

    // Rows 6-7: Empty

    /* ── Patient Section (rows 8-11) ────────────────────────── */

    // Row 8: "Dear [patient name]" + "Date:" right-aligned in col E
    ws.getCell("A8").value = `Dear ${patientName}`;
    ws.getCell("A8").font = { size: 11 };
    ws.getCell("E8").value = `Date: ${date}`;
    ws.getCell("E8").alignment = { horizontal: "right" };
    ws.getCell("E8").font = { size: 11 };

    // Row 9: Empty

    // Rows 10-11: Professional greeting paragraph (merged A10:E11)
    ws.mergeCells("A10:E11");
    const greetingCell = ws.getCell("A10");
    greetingCell.value =
      "I hope this letter finds you well. Following your recent appointment and review of the available information, my advice for treatment is as per the following estimate. This estimate details the necessary appointments and sequence of treatment.";
    greetingCell.alignment = { wrapText: true, vertical: "top" };
    greetingCell.font = { size: 11 };
    ws.getRow(10).height = 22;
    ws.getRow(11).height = 22;

    // Row 12: Empty

    /* ── Validity Note (rows 13-14) ─────────────────────────── */
    ws.mergeCells("A13:E14");
    const validityCell = ws.getCell("A13");
    validityCell.value = `NB: This estimate is valid for ${settings.quoteValidityDays} days. Fees increase at the beginning of each calendar year, therefore, fees will be adjusted accordingly should your treatment plan extend into a new year. 3rd party provider fees are subject to change depending on the provider.`;
    validityCell.alignment = { wrapText: true, vertical: "top" };
    validityCell.font = { italic: true, size: 11 };
    ws.getRow(13).height = 22;
    ws.getRow(14).height = 22;

    // Row 15: Empty

    /* ── Treatment Plan Section ──────────────────────────────── */

    // Row 16: "Proposed Treatment Plan:"
    ws.mergeCells("A16:E16");
    const planTitleCell = ws.getCell("A16");
    planTitleCell.value = "Proposed Treatment Plan:";
    planTitleCell.font = { bold: true, size: 12, color: { argb: blueColor } };

    // Row 17: Empty

    // Row 18: Column headers
    const headerRowNum = 18;
    const headers = ["Code", "Description", "Qty", "Unit Price", "Amount"];
    headers.forEach((h, i) => {
      const cell = ws.getCell(headerRowNum, i + 1);
      cell.value = h;
      cell.font = { bold: true, size: 11 };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: headerGrayBg },
      };
      cell.border = {
        bottom: { style: "thin" },
      };
      if (i >= 2) {
        cell.alignment = { horizontal: "center" };
      }
    });

    let row = headerRowNum + 1;
    let grandTotal = 0;

    // Determine number of appointments
    const numAppointments = appointmentCount || selectedTreatments.length || 1;

    // Distribute treatments across appointments
    // If appointmentCount is provided, group treatments accordingly;
    // otherwise each treatment is its own appointment
    const treatmentsPerAppointment: SelectedTreatment[][] = [];
    if (appointmentCount && appointmentCount > 0) {
      // Spread treatments across the specified number of appointments
      for (let i = 0; i < appointmentCount; i++) {
        treatmentsPerAppointment.push([]);
      }
      selectedTreatments.forEach((st, idx) => {
        const apptIdx = idx % appointmentCount;
        treatmentsPerAppointment[apptIdx].push(st);
      });
    } else {
      // Each treatment becomes its own appointment
      selectedTreatments.forEach((st) => {
        treatmentsPerAppointment.push([st]);
      });
    }

    for (let apptIdx = 0; apptIdx < treatmentsPerAppointment.length; apptIdx++) {
      const apptTreatments = treatmentsPerAppointment[apptIdx];

      /* Appointment header row */
      ws.mergeCells(row, 1, row, 5);
      const apptHeaderCell = ws.getCell(row, 1);
      apptHeaderCell.value = `Appointment ${apptIdx + 1}`;
      apptHeaderCell.font = { bold: true, size: 11, color: { argb: blueColor } };
      apptHeaderCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: lightBlueBg },
      };
      row++;

      let appointmentSubtotal = 0;

      /* Basic codes for this appointment */
      if (basicCodes && basicCodes.length > 0) {
        for (const bc of basicCodes) {
          const lineTotal = bc.price * bc.quantity;
          appointmentSubtotal += lineTotal;

          ws.getCell(row, 1).value = bc.code;
          ws.getCell(row, 2).value = bc.description;
          const qtyCell = ws.getCell(row, 3);
          qtyCell.value = bc.quantity;
          qtyCell.alignment = { horizontal: "center" };
          const priceCell = ws.getCell(row, 4);
          priceCell.value = bc.price;
          priceCell.numFmt = currencyFmt;
          priceCell.alignment = { horizontal: "right" };
          const totalCell = ws.getCell(row, 5);
          totalCell.value = lineTotal;
          totalCell.numFmt = currencyFmt;
          totalCell.alignment = { horizontal: "right" };
          row++;
        }
      }

      /* Treatment-specific codes */
      for (const st of apptTreatments) {
        for (const sc of st.selectedCodes) {
          const lineTotal = sc.price * sc.quantity;
          appointmentSubtotal += lineTotal;

          ws.getCell(row, 1).value = sc.code;
          ws.getCell(row, 2).value = sc.description;
          const qtyCell = ws.getCell(row, 3);
          qtyCell.value = sc.quantity;
          qtyCell.alignment = { horizontal: "center" };
          const priceCell = ws.getCell(row, 4);
          priceCell.value = sc.price;
          priceCell.numFmt = currencyFmt;
          priceCell.alignment = { horizontal: "right" };
          const totalCell = ws.getCell(row, 5);
          totalCell.value = lineTotal;
          totalCell.numFmt = currencyFmt;
          totalCell.alignment = { horizontal: "right" };
          row++;
        }
      }

      /* Subtotal row for this appointment */
      ws.getCell(row, 4).value = "Subtotal";
      ws.getCell(row, 4).font = { italic: true, size: 11 };
      ws.getCell(row, 4).alignment = { horizontal: "right" };
      const subCell = ws.getCell(row, 5);
      subCell.value = appointmentSubtotal;
      subCell.numFmt = currencyFmt;
      subCell.font = { bold: true };
      subCell.alignment = { horizontal: "right" };
      subCell.border = { top: { style: "thin" } };
      row++;

      grandTotal += appointmentSubtotal;

      // Empty row between appointments
      row++;
    }

    /* ── Totals Section ─────────────────────────────────────── */

    /* Discount row */
    if (discount && discount > 0) {
      ws.getCell(row, 4).value = "Discount";
      ws.getCell(row, 4).font = { color: { argb: "FF198038" } };
      ws.getCell(row, 4).alignment = { horizontal: "right" };
      const discCell = ws.getCell(row, 5);
      discCell.value = -discount;
      discCell.numFmt = currencyFmt;
      discCell.font = { color: { argb: "FF198038" } };
      discCell.alignment = { horizontal: "right" };
      row++;
      grandTotal -= discount;
    }

    /* Subtotal (excl VAT) */
    ws.getCell(row, 4).value = "Subtotal (excl. VAT)";
    ws.getCell(row, 4).font = { bold: true, size: 11 };
    ws.getCell(row, 4).alignment = { horizontal: "right" };
    const subtotalExclCell = ws.getCell(row, 5);
    subtotalExclCell.value = grandTotal;
    subtotalExclCell.numFmt = currencyFmt;
    subtotalExclCell.font = { bold: true, size: 11 };
    subtotalExclCell.alignment = { horizontal: "right" };
    row++;

    /* VAT */
    if (settings.vatRate && settings.vatRate > 0) {
      const vatAmount = grandTotal * (settings.vatRate / 100);

      ws.getCell(row, 4).value = `VAT (${settings.vatRate}%)`;
      ws.getCell(row, 4).alignment = { horizontal: "right" };
      const vatCell = ws.getCell(row, 5);
      vatCell.value = vatAmount;
      vatCell.numFmt = currencyFmt;
      vatCell.alignment = { horizontal: "right" };
      row++;

      const finalTotal = grandTotal + vatAmount;

      /* TOTAL row */
      ws.getCell(row, 4).value = "TOTAL";
      ws.getCell(row, 4).font = { bold: true, size: 14 };
      ws.getCell(row, 4).alignment = { horizontal: "right" };
      const totalCell = ws.getCell(row, 5);
      totalCell.value = finalTotal;
      totalCell.numFmt = currencyFmt;
      totalCell.font = { bold: true, size: 14 };
      totalCell.alignment = { horizontal: "right" };
      totalCell.border = { top: { style: "double" } };
      row++;
    } else {
      /* TOTAL row (no VAT) */
      ws.getCell(row, 4).value = "TOTAL";
      ws.getCell(row, 4).font = { bold: true, size: 14 };
      ws.getCell(row, 4).alignment = { horizontal: "right" };
      const totalCell = ws.getCell(row, 5);
      totalCell.value = grandTotal;
      totalCell.numFmt = currencyFmt;
      totalCell.font = { bold: true, size: 14 };
      totalCell.alignment = { horizontal: "right" };
      totalCell.border = { top: { style: "double" } };
      row++;
    }

    /* Empty row */
    row++;

    /* Payment terms */
    ws.mergeCells(row, 1, row, 5);
    const paymentCell = ws.getCell(row, 1);
    paymentCell.value = settings.defaultPaymentTerms;
    paymentCell.font = { italic: true, color: { argb: "FF999999" }, size: 10 };
    paymentCell.alignment = { wrapText: true };

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
      color: { argb: blueColor },
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
