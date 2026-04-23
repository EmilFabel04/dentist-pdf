import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont, RGB } from "pdf-lib";
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

// ── Colors ──────────────────────────────────────────────────
const GREEN: RGB = rgb(0.34, 0.57, 0.34);
const DARK: RGB = rgb(0.1, 0.1, 0.1);
const GRAY: RGB = rgb(0.4, 0.4, 0.4);
const LIGHT_GRAY: RGB = rgb(0.85, 0.85, 0.85);
const LIGHT_GREEN: RGB = rgb(0.91, 0.96, 0.91);
const WHITE: RGB = rgb(1, 1, 1);
const BLACK: RGB = rgb(0, 0, 0);
const TABLE_BORDER: RGB = rgb(0.6, 0.6, 0.6);

// ── Page dimensions (A4) ────────────────────────────────────
const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN_L = 40;
const MARGIN_R = 40;
const CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R;
const MARGIN_BOTTOM = 40;

// ── Drawing context ─────────────────────────────────────────
type DrawCtx = {
  doc: PDFDocument;
  font: PDFFont;
  boldFont: PDFFont;
  italicFont: PDFFont;
  boldItalicFont: PDFFont;
  page: PDFPage;
  y: number;
};

// ── Main handler ────────────────────────────────────────────
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

    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
    const italicFont = await doc.embedFont(StandardFonts.HelveticaOblique);
    const boldItalicFont = await doc.embedFont(StandardFonts.HelveticaBoldOblique);

    const ctx: DrawCtx = {
      doc,
      font,
      boldFont,
      italicFont,
      boldItalicFont,
      page: doc.addPage([PAGE_W, PAGE_H]),
      y: PAGE_H - 40,
    };

    // ================================================================
    // PAGE 1
    // ================================================================

    drawPage1(ctx, {
      patientName,
      date,
      settings,
      selectedTreatments,
      appointmentCount,
      basicCodes,
      discount,
    });

    // ================================================================
    // PAGE 2
    // ================================================================

    newPage(ctx);
    drawPage2(ctx, {
      patientName,
      settings,
      selectedTreatments,
    });

    // ================================================================
    // PAGE 3
    // ================================================================

    newPage(ctx);
    drawPage3(ctx, {
      patientName,
      settings,
      selectedTreatments,
    });

    // ── Save and return ──
    const pdfBytes = await doc.save();
    const filename = `estimate-${slug(patientName)}-${date}.pdf`;

    return new Response(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("[estimate-pdf] error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// ================================================================
// PAGE 1: Header + Intro + Appointments + Treatment Table
// ================================================================

function drawPage1(
  ctx: DrawCtx,
  opts: {
    patientName: string;
    date: string;
    settings: PracticeSettings;
    selectedTreatments: SelectedTreatment[];
    appointmentCount: number;
    basicCodes: BasicCodeItem[];
    discount?: number;
  }
) {
  const {
    patientName,
    date,
    settings,
    selectedTreatments,
    appointmentCount,
    basicCodes,
    discount,
  } = opts;
  const { font, boldFont, italicFont } = ctx;

  // ── Logo space (skip for now) ──
  ctx.y -= 10;

  // ── Practice header (centered) ──
  drawCenteredText(ctx, settings.name || "Dr Sheryl Smithies BChD (PRET)", {
    size: 12,
    font: boldFont,
    color: GREEN,
  });
  ctx.y -= 2;

  if (settings.phone) {
    drawCenteredText(ctx, `T: ${settings.phone}`, {
      size: 8,
      font,
      color: GRAY,
    });
  }

  const practiceInfoParts: string[] = [];
  if (settings.vatNumber) practiceInfoParts.push(`Practice Number: ${settings.vatNumber}`);
  if (practiceInfoParts.length > 0) {
    drawCenteredText(ctx, practiceInfoParts.join(". "), {
      size: 8,
      font,
      color: GRAY,
    });
  }

  if (settings.phone) {
    drawCenteredText(ctx, `t: ${settings.phone}`, {
      size: 8,
      font,
      color: GRAY,
    });
  }

  if (settings.email) {
    drawCenteredText(ctx, `e: ${settings.email}`, {
      size: 8,
      font,
      color: GRAY,
    });
  }

  ctx.y -= 12;

  // ── Patient greeting: Dear / Date ──
  ctx.page.drawText(`Dear ${patientName}`, {
    x: MARGIN_L,
    y: ctx.y,
    size: 10,
    font,
    color: DARK,
  });

  const dateStr = `Date: ${date}`;
  const dateW = font.widthOfTextAtSize(dateStr, 10);
  ctx.page.drawText(dateStr, {
    x: PAGE_W - MARGIN_R - dateW,
    y: ctx.y,
    size: 10,
    font,
    color: DARK,
  });
  ctx.y -= 18;

  // ── Intro paragraphs ──
  const introText =
    "I hope this letter finds you well. Following your recent appointment and review of the available information, my advice for treatment is as per the following estimate. This estimate details the necessary appointments and sequence of treatment.";
  drawWrappedText(ctx, introText, { size: 8, font, color: DARK });
  ctx.y -= 8;

  const nbText = `NB: This estimate is valid for ${settings.quoteValidityDays || 6} months. Fees increase at the beginning of each calendar year, therefore, fees will be adjusted accordingly should your treatment plan extend into a new year. 3rd party provider fees are subject to change depending on the provider.`;
  drawWrappedText(ctx, nbText, { size: 7, font: italicFont, color: GRAY });
  ctx.y -= 12;

  // ── "Proposed Treatment Plan:" heading ──
  ctx.page.drawText("Proposed Treatment Plan:", {
    x: MARGIN_L,
    y: ctx.y,
    size: 11,
    font: boldFont,
    color: GREEN,
  });
  ctx.y -= 16;

  // ── Appointment Breakdown table ──
  const apptTableColWidths = [40, 320, 155];
  const apptTableX = MARGIN_L;
  const apptTableW = CONTENT_W;
  const apptRowH = 16;

  // Header row
  drawTableHeaderRow(ctx, apptTableX, apptTableW, apptRowH, [
    { text: "", width: apptTableColWidths[0] },
    { text: "Treatments", width: apptTableColWidths[1] },
    { text: "Appointment Length", width: apptTableColWidths[2] },
  ]);

  // Data rows — dynamic based on actual appointment count
  for (let i = 0; i < appointmentCount; i++) {
    ensureSpace(ctx, apptRowH);
    const cellData = [
      { text: `Appointment ${i + 1}`, width: apptTableColWidths[0] + apptTableColWidths[1] },
      { text: "", width: apptTableColWidths[2] },
    ];

    // Draw row borders
    const rowY = ctx.y;
    ctx.page.drawRectangle({
      x: apptTableX,
      y: rowY - apptRowH + 4,
      width: apptTableW,
      height: apptRowH,
      borderColor: TABLE_BORDER,
      borderWidth: 0.5,
      color: WHITE,
    });

    // Vertical dividers
    let divX = apptTableX;
    for (const cw of apptTableColWidths) {
      divX += cw;
      if (divX < apptTableX + apptTableW) {
        drawVLine(ctx.page, divX, rowY + 4, apptRowH);
      }
    }

    // Text
    ctx.page.drawText(`Appointment ${i + 1}`, {
      x: apptTableX + 4,
      y: rowY - 8,
      size: 8,
      font,
      color: DARK,
    });

    ctx.y -= apptRowH;
  }

  ctx.y -= 10;

  // ── Cost intro ──
  ensureSpace(ctx, 16);
  drawWrappedText(
    ctx,
    "The expected costs of the proposed dental treatment are as follows:",
    { size: 9, font, color: DARK }
  );
  ctx.y -= 6;

  // ── Grand Total line ──
  ensureSpace(ctx, 20);

  // Compute grand total
  let grandTotal = 0;
  for (let apt = 0; apt < appointmentCount; apt++) {
    for (const bc of basicCodes) {
      grandTotal += bc.price * bc.quantity;
    }
  }
  for (const st of selectedTreatments) {
    for (const sc of st.selectedCodes) {
      grandTotal += sc.price * sc.quantity;
    }
  }

  // Third party fees total
  let thirdPartyTotal = 0;
  for (const st of selectedTreatments) {
    for (const sc of st.selectedCodes) {
      const matchingCode = st.treatment.codes.find((c) => c.code === sc.code);
      if (matchingCode) {
        thirdPartyTotal += ((matchingCode.labFee || 0) + (matchingCode.implantFee || 0)) * sc.quantity;
      }
    }
  }

  const grandTotalWithLab = grandTotal + thirdPartyTotal;

  ctx.page.drawRectangle({
    x: MARGIN_L,
    y: ctx.y - 6,
    width: CONTENT_W,
    height: 18,
    color: LIGHT_GREEN,
  });

  ctx.page.drawText("Grand Total For This Estimate (including lab fee approximation)", {
    x: MARGIN_L + 4,
    y: ctx.y,
    size: 8,
    font: boldFont,
    color: DARK,
  });

  const grandTotalStr = fmtR(grandTotalWithLab);
  const grandTotalW = boldFont.widthOfTextAtSize(grandTotalStr, 10);
  ctx.page.drawText(grandTotalStr, {
    x: PAGE_W - MARGIN_R - grandTotalW - 4,
    y: ctx.y,
    size: 10,
    font: boldFont,
    color: GREEN,
  });
  ctx.y -= 20;

  // ── Treatment line items table ──
  // Columns: Item Code | Description | ICD-10 Codes | Provider | Tooth Numbers | Per Unit Price | Units | Total
  const treatColWidths = [50, 120, 55, 50, 50, 60, 35, 95];
  const treatHeaders = [
    "Item Code",
    "Description",
    "ICD-10 Codes",
    "Provider",
    "Tooth Numbers",
    "Per Unit Price",
    "Units",
    "Total",
  ];
  const tableX = MARGIN_L;

  // Table header
  drawTableHeaderRow(ctx, tableX, CONTENT_W, 16, treatHeaders.map((h, i) => ({
    text: h,
    width: treatColWidths[i],
  })));

  // Compute cumulative X positions for columns
  const treatColX: number[] = [];
  let cx = tableX;
  for (const w of treatColWidths) {
    treatColX.push(cx);
    cx += w;
  }

  const rowH = 13;

  // Basic codes per appointment
  for (let apt = 0; apt < appointmentCount; apt++) {
    // Appointment sub-header
    ensureSpace(ctx, rowH);
    ctx.page.drawRectangle({
      x: tableX,
      y: ctx.y - rowH + 4,
      width: CONTENT_W,
      height: rowH,
      color: LIGHT_GREEN,
    });
    drawHLine(ctx.page, tableX, ctx.y + 4, CONTENT_W, TABLE_BORDER);
    ctx.page.drawText(`Appointment ${apt + 1}`, {
      x: tableX + 4,
      y: ctx.y - 6,
      size: 7,
      font: boldFont,
      color: GREEN,
    });
    ctx.y -= rowH;

    for (const bc of basicCodes) {
      ensureSpace(ctx, rowH);
      const lineTotal = bc.price * bc.quantity;
      drawTreatmentRow(ctx, treatColX, treatColWidths, rowH, {
        code: bc.code,
        desc: bc.description,
        icd10: "",
        provider: "",
        toothNumbers: "",
        unitPrice: fmtR(bc.price),
        units: String(bc.quantity),
        total: fmtR(lineTotal),
      });
    }
  }

  // Selected treatments
  for (const st of selectedTreatments) {
    for (const sc of st.selectedCodes) {
      ensureSpace(ctx, rowH);
      const lineTotal = sc.price * sc.quantity;
      const matchingCode = st.treatment.codes.find((c) => c.code === sc.code);
      drawTreatmentRow(ctx, treatColX, treatColWidths, rowH, {
        code: sc.code,
        desc: truncate(sc.description, 28),
        icd10: matchingCode?.icd10 || "",
        provider: "",
        toothNumbers: "",
        unitPrice: fmtR(sc.price),
        units: String(sc.quantity),
        total: fmtR(lineTotal),
      });
    }
  }

  // Bottom line of table
  drawHLine(ctx.page, tableX, ctx.y + 4, CONTENT_W, TABLE_BORDER);
  ctx.y -= 4;

  // ── Discount rows ──
  const discountRows = [
    { label: "DISCOUNT 5%", pct: 0.05 },
    { label: "DISCOUNT 10%", pct: 0.1 },
    { label: "DISCOUNT 15%", pct: 0.15 },
  ];

  for (const dr of discountRows) {
    ensureSpace(ctx, 12);
    const discountAmt = grandTotal * dr.pct;
    const afterDiscount = grandTotal - discountAmt;

    ctx.page.drawText(dr.label, {
      x: MARGIN_L + 4,
      y: ctx.y,
      size: 7,
      font: italicFont,
      color: GREEN,
    });

    const dStr = fmtR(afterDiscount);
    const dW = font.widthOfTextAtSize(dStr, 7);
    ctx.page.drawText(dStr, {
      x: PAGE_W - MARGIN_R - dW - 4,
      y: ctx.y,
      size: 7,
      font,
      color: DARK,
    });
    ctx.y -= 12;
  }

  ctx.y -= 2;
  ensureSpace(ctx, 12);
  ctx.page.drawText(
    "Discounts above are only valid for deposit/full payment within 30 days",
    { x: MARGIN_L + 4, y: ctx.y, size: 6, font: italicFont, color: GRAY }
  );
  ctx.y -= 14;

  // ── TOTAL line ──
  ensureSpace(ctx, 18);
  drawHLine(ctx.page, MARGIN_L, ctx.y + 6, CONTENT_W, TABLE_BORDER);
  ctx.page.drawText(
    "TOTAL (incl discount for our fees, excl 3rd party fees):",
    { x: MARGIN_L + 4, y: ctx.y, size: 8, font: boldFont, color: DARK }
  );
  const totalAfterDiscount = discount ? grandTotal - discount : grandTotal;
  const totalStr = fmtR(totalAfterDiscount);
  const totalW = boldFont.widthOfTextAtSize(totalStr, 10);
  ctx.page.drawText(totalStr, {
    x: PAGE_W - MARGIN_R - totalW - 4,
    y: ctx.y - 1,
    size: 10,
    font: boldFont,
    color: GREEN,
  });
  ctx.y -= 12;
}

// ================================================================
// PAGE 2: Third Party Fees + Tooth Diagram + Consent + T&Cs
// ================================================================

function drawPage2(
  ctx: DrawCtx,
  opts: {
    patientName: string;
    settings: PracticeSettings;
    selectedTreatments: SelectedTreatment[];
  }
) {
  const { patientName, settings, selectedTreatments } = opts;
  const { font, boldFont, italicFont } = ctx;

  // ── Third Party Fees section ──
  ctx.page.drawText("Third Party Fees", {
    x: MARGIN_L,
    y: ctx.y,
    size: 10,
    font: boldFont,
    color: GREEN,
  });
  ctx.y -= 16;

  const treatColWidths = [50, 120, 55, 50, 50, 60, 35, 95];
  const treatHeaders = [
    "Item Code",
    "Description",
    "ICD-10 Codes",
    "Provider",
    "Tooth Numbers",
    "Per Unit Price",
    "Units",
    "Total",
  ];
  const tableX = MARGIN_L;

  // Table header
  drawTableHeaderRow(ctx, tableX, CONTENT_W, 16, treatHeaders.map((h, i) => ({
    text: h,
    width: treatColWidths[i],
  })));

  const treatColX: number[] = [];
  let cx = tableX;
  for (const w of treatColWidths) {
    treatColX.push(cx);
    cx += w;
  }

  const rowH = 13;
  let thirdPartyTotal = 0;

  // Third party items (lab fees, implant fees)
  for (const st of selectedTreatments) {
    for (const sc of st.selectedCodes) {
      const matchingCode = st.treatment.codes.find((c) => c.code === sc.code);
      if (matchingCode && ((matchingCode.labFee && matchingCode.labFee > 0) || (matchingCode.implantFee && matchingCode.implantFee > 0))) {
        if (matchingCode.labFee && matchingCode.labFee > 0) {
          ensureSpace(ctx, rowH);
          const lineTotal = matchingCode.labFee * sc.quantity;
          thirdPartyTotal += lineTotal;
          drawTreatmentRow(ctx, treatColX, treatColWidths, rowH, {
            code: sc.code,
            desc: `Lab fee - ${truncate(sc.description, 18)}`,
            icd10: "",
            provider: "Lab",
            toothNumbers: "",
            unitPrice: fmtR(matchingCode.labFee),
            units: String(sc.quantity),
            total: fmtR(lineTotal),
          });
        }
        if (matchingCode.implantFee && matchingCode.implantFee > 0) {
          ensureSpace(ctx, rowH);
          const lineTotal = matchingCode.implantFee * sc.quantity;
          thirdPartyTotal += lineTotal;
          drawTreatmentRow(ctx, treatColX, treatColWidths, rowH, {
            code: sc.code,
            desc: `Implant - ${truncate(sc.description, 18)}`,
            icd10: "",
            provider: "Supplier",
            toothNumbers: "",
            unitPrice: fmtR(matchingCode.implantFee),
            units: String(sc.quantity),
            total: fmtR(lineTotal),
          });
        }
      }
    }
  }

  // Bottom line
  drawHLine(ctx.page, tableX, ctx.y + 4, CONTENT_W, TABLE_BORDER);
  ctx.y -= 4;

  // TOTAL row
  ensureSpace(ctx, 14);
  ctx.page.drawText("TOTAL", {
    x: MARGIN_L + 4,
    y: ctx.y,
    size: 8,
    font: boldFont,
    color: DARK,
  });
  const tpTotalStr = fmtR(thirdPartyTotal);
  const tpTotalW = boldFont.widthOfTextAtSize(tpTotalStr, 8);
  ctx.page.drawText(tpTotalStr, {
    x: PAGE_W - MARGIN_R - tpTotalW - 4,
    y: ctx.y,
    size: 8,
    font: boldFont,
    color: DARK,
  });
  ctx.y -= 14;

  // Total including lab fee approximation
  ensureSpace(ctx, 14);
  ctx.page.drawText("Total (including lab fee approximation)", {
    x: MARGIN_L + 4,
    y: ctx.y,
    size: 8,
    font: boldFont,
    color: DARK,
  });
  const inclLabStr = fmtR(thirdPartyTotal);
  const inclLabW = boldFont.widthOfTextAtSize(inclLabStr, 8);
  ctx.page.drawText(inclLabStr, {
    x: PAGE_W - MARGIN_R - inclLabW - 4,
    y: ctx.y,
    size: 8,
    font: boldFont,
    color: GREEN,
  });
  ctx.y -= 20;

  // ── Tooth diagram area ──
  drawToothDiagramLabels(ctx);
  ctx.y -= 14;

  // ── Consent section ──
  ensureSpace(ctx, 20);
  ctx.page.drawText("Consent", {
    x: MARGIN_L,
    y: ctx.y,
    size: 10,
    font: boldFont,
    color: GREEN,
  });
  ctx.y -= 14;

  drawWrappedText(
    ctx,
    "Kindly Read the Terms and Conditions below, sign and send back to us.",
    { size: 7, font: italicFont, color: GRAY }
  );
  ctx.y -= 6;

  drawWrappedText(
    ctx,
    `I, _______________ hereby accept this estimate from ${settings.name || "Dr Smithies"} ("the dentist") in the amount of R_______________ ("the quoted amount"). I accept this treatment on the conditions as set out below:`,
    { size: 8, font, color: DARK }
  );
  ctx.y -= 4;

  drawWrappedText(
    ctx,
    "I acknowledge that the dentist may be required to do additional work, alter or adjust treatment during the course of the planned treatment and I hereby consent to these changes in advance. I understand that the quoted fees may differ depending on the changes made.",
    { size: 8, font, color: DARK }
  );
  ctx.y -= 10;

  // ── Payment Options ──
  ensureSpace(ctx, 20);
  ctx.page.drawText("Payment Options", {
    x: MARGIN_L,
    y: ctx.y,
    size: 10,
    font: boldFont,
    color: GREEN,
  });
  ctx.y -= 14;

  drawWrappedText(
    ctx,
    "Payment Option 1 = full payment on acceptance of estimate. 5% discount on our fees (not applicable to 3rd party fees).",
    { size: 8, font, color: DARK }
  );
  ctx.y -= 4;
  drawWrappedText(
    ctx,
    "Payment Option 2 = pay 50% deposit on acceptance of estimate and the balance before the last appointment.",
    { size: 8, font, color: DARK }
  );
  ctx.y -= 10;

  // ── Domicilium Citandi Et Executandi ──
  ensureSpace(ctx, 16);
  ctx.page.drawText("Domicilium Citandi Et Executandi", {
    x: MARGIN_L,
    y: ctx.y,
    size: 9,
    font: boldFont,
    color: GREEN,
  });
  ctx.y -= 12;

  drawWrappedText(
    ctx,
    "The patient chooses the address given above as the address at which all legal documents may be served on the patient (domicilium citandi et executandi).",
    { size: 7, font, color: DARK }
  );
  ctx.y -= 8;

  // ── General T&Cs ──
  ensureSpace(ctx, 16);
  ctx.page.drawText("General Terms and Conditions", {
    x: MARGIN_L,
    y: ctx.y,
    size: 9,
    font: boldFont,
    color: GREEN,
  });
  ctx.y -= 12;

  const generalTCs = [
    "No alteration, cancellation or variation of this document shall be of any force or effect unless reduced to writing and signed by both parties.",
    "This document contains the entire agreement between the parties and neither party shall be bound by any undertakings, representations, warranties or the like not recorded herein.",
    "Any indulgence granted to the patient by the dentist shall not constitute a waiver of any rights by the dentist.",
    "Prices include 15% VAT. No refunds will be entertained on treatment already delivered.",
    "This estimate does not include any fees that other specialists may charge for their services.",
    "Please note that any third party fees are just approximate costs and are subject to change from the third party provider.",
  ];

  for (const tc of generalTCs) {
    ensureSpace(ctx, 12);
    drawWrappedText(ctx, `\u2022 ${tc}`, { size: 6.5, font, color: DARK });
    ctx.y -= 3;
  }
  ctx.y -= 6;

  // ── Cancellations ──
  ensureSpace(ctx, 16);
  ctx.page.drawText("Cancellations", {
    x: MARGIN_L,
    y: ctx.y,
    size: 9,
    font: boldFont,
    color: GREEN,
  });
  ctx.y -= 12;

  drawWrappedText(
    ctx,
    "Appointments that are cancelled with less than 24 hours notice will be charged a cancellation fee at the discretion of the practice.",
    { size: 7, font, color: DARK }
  );
  ctx.y -= 8;

  // ── Information about your treatment ──
  ensureSpace(ctx, 16);
  ctx.page.drawText("Information about your treatment:", {
    x: MARGIN_L,
    y: ctx.y,
    size: 9,
    font: boldFont,
    color: GREEN,
  });
  ctx.y -= 12;

  const infoItems = [
    "Dental checkups: Regular dental checkups are recommended every 6 months to ensure early detection and treatment of any dental issues.",
    "Dental cleans: Professional dental cleaning removes tartar and plaque that cannot be removed by regular brushing and flossing.",
    "Bite plate: A bite plate may be recommended to protect your teeth from grinding (bruxism) or to correct bite issues.",
    "Provisional fillings: Provisional (temporary) fillings are placed as an interim measure and should be replaced with a permanent restoration as soon as possible.",
    "Implant failure: Although rare, implant failure can occur. Factors such as smoking, medical conditions, and oral hygiene can affect the success rate of dental implants.",
    "Warranty terms: Warranties on dental work are subject to the patient maintaining regular checkups and following all aftercare instructions provided.",
  ];

  for (let i = 0; i < infoItems.length; i++) {
    ensureSpace(ctx, 12);
    drawWrappedText(ctx, `${i + 1}. ${infoItems[i]}`, {
      size: 6.5,
      font,
      color: DARK,
    });
    ctx.y -= 3;
  }
}

// ================================================================
// PAGE 3: Treatment Type / What to Expect + Signature + Banking
// ================================================================

function drawPage3(
  ctx: DrawCtx,
  opts: {
    patientName: string;
    settings: PracticeSettings;
    selectedTreatments: SelectedTreatment[];
  }
) {
  const { patientName, settings, selectedTreatments } = opts;
  const { font, boldFont, italicFont } = ctx;

  // ── Practice header ──
  drawCenteredText(ctx, settings.name || "Dr Sheryl Smithies BChD (PRET)", {
    size: 12,
    font: boldFont,
    color: GREEN,
  });
  ctx.y -= 8;

  // ── Treatment Type / What to Expect table ──
  ctx.page.drawText("Treatment Type / What to Expect and Aftercare", {
    x: MARGIN_L,
    y: ctx.y,
    size: 10,
    font: boldFont,
    color: GREEN,
  });
  ctx.y -= 14;

  const treatTypeColWidths = [100, 340, 75];
  const ttHeaders = ["Treatment Type", "What to Expect and Aftercare", "Initial"];
  const ttTableX = MARGIN_L;

  // Header
  drawTableHeaderRow(ctx, ttTableX, CONTENT_W, 16, ttHeaders.map((h, i) => ({
    text: h,
    width: treatTypeColWidths[i],
  })));

  // PPE row (always present)
  const ppeRowH = 30;
  ensureSpace(ctx, ppeRowH);
  drawTreatmentTypeRow(ctx, ttTableX, treatTypeColWidths, ppeRowH, {
    type: "PPE and Infection Control",
    description: "Standard infection control and PPE protocols are followed for all treatments to ensure your safety.",
  });

  // Dynamic rows from selected treatments — use treatment name, deduplicate by T&C content
  const treatmentTCs = new Map<string, string>();
  for (const st of selectedTreatments) {
    if (st.treatment.termsAndConditions) {
      // Use the treatment name as display, skip if we already have this exact T&C
      const tcText = st.treatment.termsAndConditions.replace(/---/g, "").trim();
      const existingValues = [...treatmentTCs.values()];
      if (!existingValues.some(v => v === tcText)) {
        const displayName = formatCategoryName(st.treatment.category || st.treatment.name);
        treatmentTCs.set(displayName, tcText);
      }
    }
  }

  for (const [category, tc] of treatmentTCs) {
    // Calculate row height based on text length
    const maxDescWidth = treatTypeColWidths[1] - 8;
    const descLines = wrapTextToLines(tc, maxDescWidth, font, 6.5);
    const dynamicRowH = Math.max(30, descLines.length * 9 + 10);

    ensureSpace(ctx, dynamicRowH);
    drawTreatmentTypeRow(ctx, ttTableX, treatTypeColWidths, dynamicRowH, {
      type: category,
      description: tc,
    });
  }

  // Bottom line of table
  drawHLine(ctx.page, ttTableX, ctx.y + 4, CONTENT_W, TABLE_BORDER);

  ctx.y -= 20;

  // ── Signature section ──
  ensureSpace(ctx, 40);

  ctx.page.drawText("Signed ___________________________________", {
    x: MARGIN_L,
    y: ctx.y,
    size: 9,
    font,
    color: DARK,
  });
  ctx.page.drawText("Name: ___________________________________", {
    x: PAGE_W / 2 + 20,
    y: ctx.y,
    size: 9,
    font,
    color: DARK,
  });
  ctx.y -= 18;

  ctx.page.drawText("Address: ________________________________________________________________", {
    x: MARGIN_L,
    y: ctx.y,
    size: 9,
    font,
    color: DARK,
  });
  ctx.y -= 18;

  ctx.page.drawText("Date: ___________________________________", {
    x: MARGIN_L,
    y: ctx.y,
    size: 9,
    font,
    color: DARK,
  });
  ctx.y -= 30;

  // ── Bottom section: Kind Regards + Banking Details ──
  ensureSpace(ctx, 120);

  const leftX = MARGIN_L;
  const rightX = PAGE_W / 2 + 40;

  // Left side: Kind Regards
  ctx.page.drawText("Kind Regards,", {
    x: leftX,
    y: ctx.y,
    size: 9,
    font,
    color: DARK,
  });

  // Right side: Banking Details
  ctx.page.drawText("Banking Details for EFT payments:", {
    x: rightX,
    y: ctx.y,
    size: 9,
    font: boldFont,
    color: DARK,
  });
  ctx.y -= 14;

  const bankDetails = [
    ["Bank:", "FNB"],
    ["Branch code:", "255655"],
    ["Acc Name:", "The Smile Emporium INC"],
    ["Acc no:", "62695604176"],
    ["Ref:", "Your name and surname"],
  ];

  for (const [label, value] of bankDetails) {
    ctx.page.drawText(label, {
      x: rightX,
      y: ctx.y,
      size: 8,
      font,
      color: DARK,
    });
    ctx.page.drawText(value, {
      x: rightX + 70,
      y: ctx.y,
      size: 8,
      font,
      color: DARK,
    });
    ctx.y -= 12;
  }

  // Left: Doctor name
  ctx.page.drawText("Sheryl Smithies", {
    x: leftX,
    y: ctx.y + 24,
    size: 9,
    font,
    color: DARK,
  });
  ctx.page.drawText(settings.name || "Dr Sheryl Smithies", {
    x: leftX,
    y: ctx.y + 12,
    size: 9,
    font: boldFont,
    color: DARK,
  });

  // SWIFT code on the right
  ctx.page.drawText("SWIFT: FIRNZAJJ", {
    x: rightX,
    y: ctx.y,
    size: 8,
    font,
    color: DARK,
  });
}

// ================================================================
// Drawing Helpers
// ================================================================

function newPage(ctx: DrawCtx) {
  ctx.page = ctx.doc.addPage([PAGE_W, PAGE_H]);
  ctx.y = PAGE_H - 40;
}

function ensureSpace(ctx: DrawCtx, needed: number) {
  if (ctx.y - needed < MARGIN_BOTTOM) {
    newPage(ctx);
  }
}

function drawCenteredText(
  ctx: DrawCtx,
  text: string,
  opts: { size: number; font: PDFFont; color: RGB }
) {
  const w = opts.font.widthOfTextAtSize(text, opts.size);
  ctx.page.drawText(text, {
    x: (PAGE_W - w) / 2,
    y: ctx.y,
    size: opts.size,
    font: opts.font,
    color: opts.color,
  });
  ctx.y -= opts.size + 4;
}

function drawWrappedText(
  ctx: DrawCtx,
  text: string,
  opts: { size: number; font: PDFFont; color: RGB; indent?: number }
) {
  const indent = opts.indent || 0;
  const maxWidth = CONTENT_W - indent;
  // Clean newlines and non-printable chars
  const clean = text.replace(/\r?\n/g, " ").replace(/[^\x20-\x7E]/g, " ");
  const words = clean.split(/\s+/).filter(Boolean);
  let line = "";

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    const testWidth = opts.font.widthOfTextAtSize(testLine, opts.size);
    if (testWidth > maxWidth && line) {
      ensureSpace(ctx, opts.size + 3);
      ctx.page.drawText(line, {
        x: MARGIN_L + indent,
        y: ctx.y,
        size: opts.size,
        font: opts.font,
        color: opts.color,
      });
      ctx.y -= opts.size + 3;
      line = word;
    } else {
      line = testLine;
    }
  }

  if (line) {
    ensureSpace(ctx, opts.size + 3);
    ctx.page.drawText(line, {
      x: MARGIN_L + indent,
      y: ctx.y,
      size: opts.size,
      font: opts.font,
      color: opts.color,
    });
    ctx.y -= opts.size + 3;
  }
}

function wrapTextToLines(
  text: string,
  maxWidth: number,
  font: PDFFont,
  size: number
): string[] {
  // Split on newlines first, then wrap each line by words
  const paragraphs = text.replace(/\r\n/g, "\n").split("\n");
  const lines: string[] = [];

  for (const para of paragraphs) {
    // Clean any non-printable characters
    const clean = para.replace(/[^\x20-\x7E]/g, " ").trim();
    if (!clean) {
      lines.push("");
      continue;
    }
    const words = clean.split(/\s+/);
    let line = "";

    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word;
      const testWidth = font.widthOfTextAtSize(testLine, size);
      if (testWidth > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = testLine;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

function drawHLine(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  color: RGB = LIGHT_GRAY
) {
  page.drawLine({
    start: { x, y },
    end: { x: x + width, y },
    thickness: 0.5,
    color,
  });
}

function drawVLine(
  page: PDFPage,
  x: number,
  y: number,
  height: number,
  color: RGB = TABLE_BORDER
) {
  page.drawLine({
    start: { x, y },
    end: { x, y: y - height },
    thickness: 0.5,
    color,
  });
}

function drawTableHeaderRow(
  ctx: DrawCtx,
  x: number,
  width: number,
  height: number,
  columns: { text: string; width: number }[]
) {
  ensureSpace(ctx, height);
  const rowY = ctx.y;

  // Background
  ctx.page.drawRectangle({
    x,
    y: rowY - height + 4,
    width,
    height,
    color: LIGHT_GRAY,
    borderColor: TABLE_BORDER,
    borderWidth: 0.5,
  });

  // Column dividers and text
  let colX = x;
  for (const col of columns) {
    // Vertical divider
    if (colX > x) {
      drawVLine(ctx.page, colX, rowY + 4, height);
    }

    // Header text
    ctx.page.drawText(col.text, {
      x: colX + 3,
      y: rowY - 8,
      size: 6.5,
      font: ctx.boldFont,
      color: DARK,
    });

    colX += col.width;
  }

  ctx.y -= height;
}

type TreatmentRowData = {
  code: string;
  desc: string;
  icd10: string;
  provider: string;
  toothNumbers: string;
  unitPrice: string;
  units: string;
  total: string;
};

function drawTreatmentRow(
  ctx: DrawCtx,
  colX: number[],
  colWidths: number[],
  rowH: number,
  data: TreatmentRowData
) {
  const rowY = ctx.y;
  const sz = 7;
  const f = ctx.font;

  // Row border
  drawHLine(ctx.page, colX[0], rowY + 4, CONTENT_W, TABLE_BORDER);

  // Draw vertical dividers
  for (let i = 1; i < colX.length; i++) {
    drawVLine(ctx.page, colX[i], rowY + 4, rowH);
  }
  // Right edge
  drawVLine(ctx.page, colX[0] + CONTENT_W, rowY + 4, rowH);
  // Left edge
  drawVLine(ctx.page, colX[0], rowY + 4, rowH);

  const textY = rowY - 6;

  // Item Code
  ctx.page.drawText(data.code, { x: colX[0] + 3, y: textY, size: sz, font: f, color: DARK });
  // Description
  ctx.page.drawText(data.desc, { x: colX[1] + 3, y: textY, size: sz, font: f, color: DARK });
  // ICD-10
  if (data.icd10) {
    ctx.page.drawText(data.icd10, { x: colX[2] + 3, y: textY, size: 6, font: f, color: GRAY });
  }
  // Provider
  if (data.provider) {
    ctx.page.drawText(data.provider, { x: colX[3] + 3, y: textY, size: sz, font: f, color: DARK });
  }
  // Tooth Numbers
  if (data.toothNumbers) {
    ctx.page.drawText(data.toothNumbers, { x: colX[4] + 3, y: textY, size: sz, font: f, color: DARK });
  }
  // Per Unit Price
  ctx.page.drawText(data.unitPrice, { x: colX[5] + 3, y: textY, size: sz, font: f, color: DARK });
  // Units
  ctx.page.drawText(data.units, { x: colX[6] + 3, y: textY, size: sz, font: f, color: DARK });
  // Total (right-aligned)
  const totalW = f.widthOfTextAtSize(data.total, sz);
  ctx.page.drawText(data.total, {
    x: colX[7] + colWidths[7] - totalW - 4,
    y: textY,
    size: sz,
    font: f,
    color: DARK,
  });

  ctx.y -= rowH;
}

function drawTreatmentTypeRow(
  ctx: DrawCtx,
  tableX: number,
  colWidths: number[],
  rowH: number,
  data: { type: string; description: string }
) {
  const rowY = ctx.y;
  const { font, boldFont } = ctx;

  // Row outline
  ctx.page.drawRectangle({
    x: tableX,
    y: rowY - rowH + 4,
    width: CONTENT_W,
    height: rowH,
    borderColor: TABLE_BORDER,
    borderWidth: 0.5,
    color: WHITE,
  });

  // Column dividers
  let divX = tableX;
  for (const cw of colWidths) {
    divX += cw;
    if (divX < tableX + CONTENT_W) {
      drawVLine(ctx.page, divX, rowY + 4, rowH);
    }
  }

  // Treatment type (bold, left column)
  const typeLines = wrapTextToLines(data.type, colWidths[0] - 8, boldFont, 7);
  let typeY = rowY - 8;
  for (const line of typeLines) {
    ctx.page.drawText(line, {
      x: tableX + 4,
      y: typeY,
      size: 7,
      font: boldFont,
      color: DARK,
    });
    typeY -= 9;
  }

  // Description (middle column, wrapped)
  const descCol2X = tableX + colWidths[0];
  const descMaxW = colWidths[1] - 8;
  const descLines = wrapTextToLines(data.description, descMaxW, font, 6.5);
  let descY = rowY - 8;
  for (const line of descLines) {
    ctx.page.drawText(line, {
      x: descCol2X + 4,
      y: descY,
      size: 6.5,
      font,
      color: DARK,
    });
    descY -= 9;
  }

  ctx.y -= rowH;
}

function drawToothDiagramLabels(ctx: DrawCtx) {
  const { font, boldFont, italicFont } = ctx;

  ensureSpace(ctx, 50);

  // Title
  ctx.page.drawText("Tooth Diagram", {
    x: MARGIN_L,
    y: ctx.y,
    size: 9,
    font: boldFont,
    color: GREEN,
  });
  ctx.y -= 14;

  // Upper teeth labels
  const upperRight = [18, 17, 16, 15, 14, 13, 12, 11];
  const upperLeft = [21, 22, 23, 24, 25, 26, 27, 28];
  const lowerRight = [48, 47, 46, 45, 44, 43, 42, 41];
  const lowerLeft = [31, 32, 33, 34, 35, 36, 37, 38];

  const centerX = PAGE_W / 2;
  const spacing = 28;

  // "Patient's Right" label
  ctx.page.drawText("Patient's Right", {
    x: MARGIN_L,
    y: ctx.y + 6,
    size: 6,
    font: italicFont,
    color: GRAY,
  });

  // "Patient's Left" label
  const plText = "Patient's Left";
  const plW = italicFont.widthOfTextAtSize(plText, 6);
  ctx.page.drawText(plText, {
    x: PAGE_W - MARGIN_R - plW,
    y: ctx.y + 6,
    size: 6,
    font: italicFont,
    color: GRAY,
  });

  // Upper row
  for (let i = 0; i < upperRight.length; i++) {
    const x = centerX - (i + 1) * spacing + spacing / 2;
    ctx.page.drawText(String(upperRight[i]), {
      x,
      y: ctx.y,
      size: 6,
      font,
      color: DARK,
    });
  }
  for (let i = 0; i < upperLeft.length; i++) {
    const x = centerX + i * spacing + spacing / 2;
    ctx.page.drawText(String(upperLeft[i]), {
      x,
      y: ctx.y,
      size: 6,
      font,
      color: DARK,
    });
  }

  // Center line
  drawVLine(ctx.page, centerX, ctx.y + 6, 24, GRAY);
  ctx.y -= 6;
  drawHLine(ctx.page, MARGIN_L + 40, ctx.y, CONTENT_W - 80, GRAY);
  ctx.y -= 6;

  // Lower row
  for (let i = 0; i < lowerRight.length; i++) {
    const x = centerX - (i + 1) * spacing + spacing / 2;
    ctx.page.drawText(String(lowerRight[i]), {
      x,
      y: ctx.y,
      size: 6,
      font,
      color: DARK,
    });
  }
  for (let i = 0; i < lowerLeft.length; i++) {
    const x = centerX + i * spacing + spacing / 2;
    ctx.page.drawText(String(lowerLeft[i]), {
      x,
      y: ctx.y,
      size: 6,
      font,
      color: DARK,
    });
  }

  ctx.y -= 10;
}

// ── Formatting helpers ──────────────────────────────────────

function fmtR(n: number): string {
  return `R ${n.toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function truncate(s: string, maxLen: number): string {
  return s.length > maxLen ? s.substring(0, maxLen - 1) + "\u2026" : s;
}

function formatCategoryName(category: string): string {
  const names: Record<string, string> = {
    diagnostic: "Consultation / Check Up",
    preventive: "Scale and Polish / Hygiene",
    restorative: "Restorations",
    endodontic: "Root Canal Treatment",
    crown: "Crown and Bridge",
    bridge: "Crown and Bridge",
    prosthodontic: "Prosthodontics",
    implant: "Implants",
    surgical: "Oral Surgery",
    periodontal: "Periodontics",
    orthodontic: "Orthodontics",
    aesthetic: "Aesthetic Treatments",
    basic: "Basic Per-Visit",
  };
  return names[category] || category.charAt(0).toUpperCase() + category.slice(1);
}

function slug(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "patient"
  );
}
