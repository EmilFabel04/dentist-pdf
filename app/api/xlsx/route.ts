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

// Matching the dentist's template styling exactly
const GREEN = "579158";
const LIGHT_GREEN = "e8f5e9";
const DARK = "1a1a1a";
const GRAY = "666666";

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
      appointmentCount = 1,
      basicCodes = [],
    } = body;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = settings.name || "Dental Practice";
    const ws = workbook.addWorksheet("Estimate", {
      pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true },
    });

    // Column widths matching the template
    ws.columns = [
      { width: 2 },   // A - margin
      { width: 4 },   // B
      { width: 6 },   // C
      { width: 10 },  // D - Item Code
      { width: 22 },  // E - Description
      { width: 14 },  // F - Description cont
      { width: 10 },  // G
      { width: 12 },  // H - ICD-10
      { width: 10 },  // I - Provider
      { width: 10 },  // J - Tooth Nums
      { width: 12 },  // K - Unit Price
      { width: 6 },   // L - Units
      { width: 14 },  // M - Total
      { width: 4 },   // N
    ];

    let row = 1;

    // ── Practice Header (rows 1-6) ───────────────────────────
    row = 2;
    ws.mergeCells(row, 3, row, 13);
    const nameCell = ws.getCell(row, 3);
    nameCell.value = settings.name || "Dr Sheryl Smithies BChD (PRET)";
    nameCell.font = { bold: true, size: 14, color: { argb: `FF${GREEN}` } };
    nameCell.alignment = { horizontal: "center" };

    row = 3;
    ws.mergeCells(row, 3, row, 13);
    ws.getCell(row, 3).value = settings.phone ? `T: ${settings.phone}` : "";
    ws.getCell(row, 3).font = { size: 9, color: { argb: `FF${GRAY}` } };
    ws.getCell(row, 3).alignment = { horizontal: "center" };

    row = 4;
    ws.mergeCells(row, 3, row, 13);
    ws.getCell(row, 3).value = settings.vatNumber ? `Practice Number: ${settings.vatNumber}` : "";
    ws.getCell(row, 3).font = { size: 9, color: { argb: `FF${GRAY}` } };
    ws.getCell(row, 3).alignment = { horizontal: "center" };

    row = 5;
    ws.mergeCells(row, 3, row, 13);
    ws.getCell(row, 3).value = settings.email ? `e: ${settings.email}` : "";
    ws.getCell(row, 3).font = { size: 9, color: { argb: `FF${GRAY}` } };
    ws.getCell(row, 3).alignment = { horizontal: "center" };

    // ── Patient Greeting (row 8) ─────────────────────────────
    row = 8;
    ws.getCell(row, 2).value = `Dear ${patientName}`;
    ws.getCell(row, 2).font = { size: 12 };
    ws.getCell(row, 11).value = `Date: ${date}`;
    ws.getCell(row, 11).font = { size: 10 };
    ws.getRow(row).height = 24;

    // ── Intro Letter (rows 10-11) ────────────────────────────
    row = 10;
    ws.mergeCells(row, 2, row + 1, 14);
    const introCell = ws.getCell(row, 2);
    introCell.value = "I hope this letter finds you well. Following your recent appointment and review of the available information, my advice for treatment is as per the following estimate. This estimate details the necessary appointments and sequence of treatment.";
    introCell.font = { size: 9, color: { argb: `FF${DARK}` } };
    introCell.alignment = { wrapText: true, vertical: "top" };
    ws.getRow(row).height = 15;
    ws.getRow(row + 1).height = 15;

    // ── NB Note (rows 13-14) ─────────────────────────────────
    row = 13;
    ws.mergeCells(row, 2, row + 1, 14);
    const nbCell = ws.getCell(row, 2);
    nbCell.value = `NB: This estimate is valid for ${settings.quoteValidityDays || 6} months. Fees increase at the beginning of each calendar year, therefore, fees will be adjusted accordingly should your treatment plan extend into a new year. 3rd party provider fees are subject to change depending on the provider.`;
    nbCell.font = { size: 8, italic: true, color: { argb: `FF${GRAY}` } };
    nbCell.alignment = { wrapText: true, vertical: "top" };

    // ── Proposed Treatment Plan Header (row 16) ──────────────
    row = 16;
    ws.mergeCells(row, 2, row, 5);
    ws.getCell(row, 2).value = "Proposed Treatment Plan:";
    ws.getCell(row, 2).font = { bold: true, size: 11, color: { argb: `FF${GREEN}` } };

    // ── Appointment Breakdown (rows 18-25) ───────────────────
    row = 18;
    ws.mergeCells(row, 2, row, 5);
    ws.getCell(row, 2).value = "Appointment Breakdown:";
    ws.getCell(row, 2).font = { bold: true, size: 10 };

    ws.mergeCells(row, 6, row, 10);
    ws.getCell(row, 6).value = "Treatments";
    ws.getCell(row, 6).font = { bold: true, size: 10 };

    ws.mergeCells(row, 12, row, 14);
    ws.getCell(row, 12).value = "Appointment Length";
    ws.getCell(row, 12).font = { bold: true, size: 10 };

    for (let i = 0; i < Math.min(appointmentCount, 7); i++) {
      row = 19 + i;
      ws.mergeCells(row, 3, row, 4);
      ws.getCell(row, 3).value = `Appointment ${i + 1}`;
      ws.getCell(row, 3).font = { size: 9 };
      // Treatments summary for this appointment
      ws.mergeCells(row, 6, row, 10);
      ws.getCell(row, 6).font = { size: 8, color: { argb: `FF${GRAY}` } };
    }

    // ── Cost intro text ──────────────────────────────────────
    row = 27;
    ws.mergeCells(row, 2, row, 12);
    ws.getCell(row, 2).value = "The expected costs of the proposed dental treatment are as follows:";
    ws.getCell(row, 2).font = { size: 9 };

    // ── Grand Total Preview ──────────────────────────────────
    row = 29;
    ws.mergeCells(row, 2, row, 10);
    ws.getCell(row, 2).value = "Grand Total For This Estimate (including lab fee approximation):";
    ws.getCell(row, 2).font = { bold: true, size: 10 };

    // ── Column Headers (row 31) ──────────────────────────────
    row = 31;
    const headers = [
      { col: 4, text: "Item Code", width: 1 },
      { col: 5, text: "Description", width: 3 },
      { col: 8, text: "ICD-10", width: 1 },
      { col: 9, text: "Provider", width: 1 },
      { col: 10, text: "Tooth Nums", width: 1 },
      { col: 11, text: "Per Unit Price", width: 1 },
      { col: 12, text: "Units", width: 1 },
      { col: 13, text: "Total", width: 1 },
    ];
    for (const h of headers) {
      if (h.width > 1) {
        ws.mergeCells(row, h.col, row, h.col + h.width - 1);
      }
      const cell = ws.getCell(row, h.col);
      cell.value = h.text;
      cell.font = { bold: true, size: 8, color: { argb: "FF333333" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${LIGHT_GREEN}` } };
      cell.border = { bottom: { style: "thin", color: { argb: "FFcccccc" } } };
      cell.alignment = { horizontal: "center" };
    }

    // ── Treatment Line Items (row 32+) ───────────────────────
    row = 32;
    let grandTotal = 0;
    const fmt = `#,##0.00`;

    // Basic codes per appointment
    for (let apt = 0; apt < appointmentCount; apt++) {
      // Appointment header
      ws.mergeCells(row, 3, row, 13);
      ws.getCell(row, 3).value = `Appointment ${apt + 1}`;
      ws.getCell(row, 3).font = { bold: true, size: 9, color: { argb: `FF${GREEN}` } };
      ws.getCell(row, 3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${LIGHT_GREEN}` } };
      row++;

      // Basic codes
      for (const bc of basicCodes) {
        const lineTotal = bc.price * bc.quantity;
        ws.getCell(row, 4).value = bc.code;
        ws.getCell(row, 4).font = { size: 8 };
        ws.mergeCells(row, 5, row, 7);
        ws.getCell(row, 5).value = bc.description;
        ws.getCell(row, 5).font = { size: 8 };
        ws.getCell(row, 11).value = bc.price;
        ws.getCell(row, 11).numFmt = fmt;
        ws.getCell(row, 11).font = { size: 8 };
        ws.getCell(row, 12).value = bc.quantity;
        ws.getCell(row, 12).font = { size: 8 };
        ws.getCell(row, 12).alignment = { horizontal: "center" };
        ws.getCell(row, 13).value = lineTotal;
        ws.getCell(row, 13).numFmt = fmt;
        ws.getCell(row, 13).font = { size: 8 };
        grandTotal += lineTotal;
        row++;
      }
    }

    // Selected treatments
    for (const st of selectedTreatments) {
      for (const sc of st.selectedCodes) {
        const lineTotal = sc.price * sc.quantity;
        ws.getCell(row, 4).value = sc.code;
        ws.getCell(row, 4).font = { size: 8 };
        ws.mergeCells(row, 5, row, 7);
        ws.getCell(row, 5).value = sc.description;
        ws.getCell(row, 5).font = { size: 8 };
        const matchingCode = st.treatment.codes.find(c => c.code === sc.code);
        if (matchingCode?.icd10) {
          ws.getCell(row, 8).value = matchingCode.icd10;
          ws.getCell(row, 8).font = { size: 7, color: { argb: `FF${GRAY}` } };
        }
        ws.getCell(row, 11).value = sc.price;
        ws.getCell(row, 11).numFmt = fmt;
        ws.getCell(row, 11).font = { size: 8 };
        ws.getCell(row, 12).value = sc.quantity;
        ws.getCell(row, 12).font = { size: 8 };
        ws.getCell(row, 12).alignment = { horizontal: "center" };
        ws.getCell(row, 13).value = lineTotal;
        ws.getCell(row, 13).numFmt = fmt;
        ws.getCell(row, 13).font = { size: 8 };
        grandTotal += lineTotal;
        row++;
      }
    }

    // ── Discount Rows ────────────────────────────────────────
    row++;
    const discount5 = grandTotal * 0.05;
    const discount10 = grandTotal * 0.1;
    const discount15 = grandTotal * 0.15;

    for (const [label, amt] of [
      ["DISCOUNT 5% VALID 30 DAYS", discount5],
      ["DISCOUNT 10% VALID FOR 30 DAYS", discount10],
      ["DISCOUNT 15% VALID FOR 30 DAYS", discount15],
    ] as [string, number][]) {
      ws.mergeCells(row, 5, row, 7);
      ws.getCell(row, 5).value = label;
      ws.getCell(row, 5).font = { size: 8, italic: true, color: { argb: `FF${GREEN}` } };
      ws.getCell(row, 13).value = grandTotal - amt;
      ws.getCell(row, 13).numFmt = fmt;
      ws.getCell(row, 13).font = { size: 8 };
      row++;
    }

    // Discount note
    ws.mergeCells(row, 3, row, 6);
    ws.getCell(row, 3).value = "Discounts above are only valid for deposit/full payment within 30 days.";
    ws.getCell(row, 3).font = { size: 7, italic: true, color: { argb: `FF${GRAY}` } };
    ws.mergeCells(row, 7, row, 12);
    ws.getCell(row, 7).value = "TOTAL (incl discount for our fees, excl 3rd party fees):";
    ws.getCell(row, 7).font = { bold: true, size: 8 };

    const totalAfterDiscount = discount ? grandTotal - discount : grandTotal;
    ws.getCell(row, 13).value = totalAfterDiscount;
    ws.getCell(row, 13).numFmt = fmt;
    ws.getCell(row, 13).font = { bold: true, size: 10 };
    ws.getCell(row, 13).border = { top: { style: "double", color: { argb: "FF000000" } } };
    row++;

    // Review request
    ws.mergeCells(row, 3, row, 13);
    ws.getCell(row, 3).value = "For the discount we will request that you review our practice on Google.";
    ws.getCell(row, 3).font = { size: 7, italic: true, color: { argb: `FF${GRAY}` } };
    row += 2;

    // ── Grand Total Preview (fill in row 29) ─────────────────
    ws.mergeCells(29, 12, 29, 14);
    ws.getCell(29, 12).value = totalAfterDiscount;
    ws.getCell(29, 12).numFmt = fmt;
    ws.getCell(29, 12).font = { bold: true, size: 12, color: { argb: `FF${GREEN}` } };

    // ── Consent Section ──────────────────────────────────────
    row += 1;
    ws.mergeCells(row, 2, row, 14);
    ws.getCell(row, 2).value = `I, _________________________________________________ ("the patient") hereby accept the proposed dental treatment recommended by ${settings.name || "the dentist"} in the amount of R________________. I accept this treatment on the conditions as set out below:`;
    ws.getCell(row, 2).font = { size: 8 };
    ws.getCell(row, 2).alignment = { wrapText: true };
    ws.getRow(row).height = 30;
    row += 2;

    ws.mergeCells(row, 2, row, 14);
    ws.getCell(row, 2).value = "I acknowledge that the dentist may be required to alter or add treatment during the course of the planned treatment and I hereby consent to these changes in advance. I understand that the quoted fees may differ depending on the changes made. I understand that prices are inclusive of 15% VAT.";
    ws.getCell(row, 2).font = { size: 8 };
    ws.getCell(row, 2).alignment = { wrapText: true };
    ws.getRow(row).height = 30;
    row += 2;

    // ── Payment Options ──────────────────────────────────────
    ws.getCell(row, 2).value = "Payment Options";
    ws.getCell(row, 2).font = { bold: true, size: 10, color: { argb: `FF${GREEN}` } };
    row += 2;

    ws.mergeCells(row, 2, row, 14);
    ws.getCell(row, 2).value = "Payment Option 1 = full payment on acceptance of estimate. 5% discount on our fees (not applicable to 3rd party fees).";
    ws.getCell(row, 2).font = { size: 8 };
    row++;

    ws.mergeCells(row, 2, row, 14);
    ws.getCell(row, 2).value = "Payment Option 2 = pay 50% deposit on acceptance of estimate and the balance before the last appointment.";
    ws.getCell(row, 2).font = { size: 8 };
    row += 2;

    // ── T&Cs ─────────────────────────────────────────────────
    ws.getCell(row, 2).value = "General";
    ws.getCell(row, 2).font = { bold: true, size: 10, color: { argb: `FF${GREEN}` } };
    row++;

    const generalTCs = [
      "Prices include 15% VAT. No refunds will be entertained on treatment already delivered.",
      "This estimate does not include any fees that other specialists may charge for their services.",
      "Please note that any third party fees are just approximate costs and are subject to change from the third party provider.",
    ];

    for (const tc of generalTCs) {
      ws.mergeCells(row, 2, row, 14);
      ws.getCell(row, 2).value = tc;
      ws.getCell(row, 2).font = { size: 8 };
      ws.getCell(row, 2).alignment = { wrapText: true };
      row++;
    }
    row++;

    // Cancellations
    ws.getCell(row, 2).value = "Cancellations";
    ws.getCell(row, 2).font = { bold: true, size: 10, color: { argb: `FF${GREEN}` } };
    row++;
    ws.mergeCells(row, 2, row, 14);
    ws.getCell(row, 2).value = "Appointments that are cancelled with less than 24 hours notice will be charged a cancellation fee at the discretion of the practice.";
    ws.getCell(row, 2).font = { size: 8 };
    ws.getCell(row, 2).alignment = { wrapText: true };
    row += 2;

    // Treatment-specific T&Cs
    const treatmentTCs = new Map<string, string>();
    for (const st of selectedTreatments) {
      if (st.treatment.termsAndConditions) {
        treatmentTCs.set(st.treatment.name, st.treatment.termsAndConditions);
      }
    }

    if (treatmentTCs.size > 0) {
      ws.getCell(row, 2).value = "Information about your treatment:";
      ws.getCell(row, 2).font = { bold: true, size: 10, color: { argb: `FF${GREEN}` } };
      row++;

      for (const [name, tc] of treatmentTCs) {
        ws.getCell(row, 3).value = name;
        ws.getCell(row, 3).font = { bold: true, size: 9 };
        row++;
        for (const line of tc.split("\n").filter(Boolean)) {
          ws.mergeCells(row, 4, row, 13);
          ws.getCell(row, 4).value = line;
          ws.getCell(row, 4).font = { size: 8 };
          ws.getCell(row, 4).alignment = { wrapText: true };
          row++;
        }
        row++;
      }
    }

    // ── Signature ────────────────────────────────────────────
    row += 2;
    ws.getCell(row, 3).value = "Signed";
    ws.getCell(row, 3).font = { size: 9 };
    ws.getCell(row, 4).value = "_________________________________";
    ws.getCell(row, 8).value = "Name:_____________________________________";
    row += 2;
    ws.getCell(row, 3).value = "Date:";
    ws.getCell(row, 3).font = { size: 9 };
    ws.getCell(row, 4).value = "_________________________________";
    row += 3;

    // ── Kind Regards + Banking ───────────────────────────────
    ws.getCell(row, 3).value = "Kind Regards,";
    ws.getCell(row, 3).font = { size: 9 };
    ws.getCell(row, 10).value = "Banking Details for EFT payments:";
    ws.getCell(row, 10).font = { bold: true, size: 9 };
    row++;
    ws.getCell(row, 10).value = "Bank";
    ws.getCell(row, 11).value = "FNB";
    ws.getCell(row, 10).font = { size: 8 };
    ws.getCell(row, 11).font = { size: 8 };
    row++;
    ws.getCell(row, 10).value = "Branch code";
    ws.getCell(row, 11).value = "255655";
    ws.getCell(row, 10).font = { size: 8 };
    ws.getCell(row, 11).font = { size: 8 };
    row++;
    ws.getCell(row, 10).value = "Acc Name";
    ws.getCell(row, 11).value = "The Smile Emporium INC";
    ws.getCell(row, 10).font = { size: 8 };
    ws.getCell(row, 11).font = { size: 8 };
    row++;
    ws.getCell(row, 10).value = "Acc no";
    ws.getCell(row, 11).value = "62695604176";
    ws.getCell(row, 10).font = { size: 8 };
    ws.getCell(row, 11).font = { size: 8 };
    row++;
    ws.getCell(row, 10).value = "Ref";
    ws.getCell(row, 11).value = "Your name and surname.";
    ws.getCell(row, 10).font = { size: 8 };
    ws.getCell(row, 11).font = { size: 8 };
    row += 2;

    ws.getCell(row, 3).value = settings.name || "Dr Sheryl Smithies";
    ws.getCell(row, 3).font = { bold: true, size: 10 };
    row++;
    ws.getCell(row, 10).value = "SWIFT";
    ws.getCell(row, 11).value = "FIRNZAJJ";
    ws.getCell(row, 10).font = { size: 8 };
    ws.getCell(row, 11).font = { size: 8 };

    // ── Write output ─────────────────────────────────────────
    const arrayBuffer = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const filename = `estimate-${slug(patientName)}-${date}.xlsx`;

    return new Response(buffer as unknown as BodyInit, {
      status: 200,
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

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "patient";
}
