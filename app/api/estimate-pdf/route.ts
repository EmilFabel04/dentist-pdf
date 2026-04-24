import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont, RGB, PDFImage } from "pdf-lib";
import { verifyAuth } from "@/lib/firebase";
import type { SelectedTreatment, PracticeSettings } from "@/lib/types";
import * as fs from "fs";
import * as path from "path";

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
  transcript?: string;
};

// ── Colors ──────────────────────────────────────────────────
const GREEN: RGB = rgb(0.34, 0.57, 0.34);
const DARK: RGB = rgb(0.1, 0.1, 0.1);
const GRAY: RGB = rgb(0.4, 0.4, 0.4);
const HEADER_BG: RGB = rgb(0.27, 0.27, 0.27); // dark gray for table headers
const LIGHT_GRAY_BG: RGB = rgb(0.92, 0.92, 0.92);
const YELLOW_HIGHLIGHT: RGB = rgb(1.0, 1.0, 0.6);
const WHITE: RGB = rgb(1, 1, 1);
const TABLE_BORDER: RGB = rgb(0.7, 0.7, 0.7);
const ALT_ROW_BG: RGB = rgb(0.97, 0.97, 0.97);

// ── Page dimensions (A4) ────────────────────────────────────
const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN_L = 50;
const MARGIN_R = 50;
const CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R; // 495
const MARGIN_BOTTOM = 50;

// ── Drawing context ─────────────────────────────────────────
type DrawCtx = {
  doc: PDFDocument;
  font: PDFFont;
  boldFont: PDFFont;
  italicFont: PDFFont;
  boldItalicFont: PDFFont;
  page: PDFPage;
  y: number;
  settings: PracticeSettings;
  logoImage: PDFImage | null;
  toothGraphImage: PDFImage | null;
  paymentImage: PDFImage | null;
  signatureImage: PDFImage | null;
};

// ── Utility: clean text for pdf-lib ─────────────────────────
function cleanText(text: string): string {
  return text
    .replace(/[\r\n\t]/g, " ")
    .replace(/[^\x20-\x7E]/g, "")
    .trim();
}

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
      transcript = "",
    } = body;

    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
    const italicFont = await doc.embedFont(StandardFonts.HelveticaOblique);
    const boldItalicFont = await doc.embedFont(
      StandardFonts.HelveticaBoldOblique
    );

    // Load logo and tooth graph images
    let logoImage: PDFImage | null = null;
    let toothGraphImage: PDFImage | null = null;
    try {
      const logoPath = path.resolve(process.cwd(), "logo/enamel-clinic.png");
      if (fs.existsSync(logoPath)) {
        const logoBytes = fs.readFileSync(logoPath);
        logoImage = await doc.embedPng(logoBytes);
      }
    } catch (e) {
      console.warn("[estimate-pdf] Could not load logo:", e);
    }
    try {
      const toothPath = path.resolve(process.cwd(), "logo/tooth-graph.png");
      if (fs.existsSync(toothPath)) {
        const toothBytes = fs.readFileSync(toothPath);
        toothGraphImage = await doc.embedPng(toothBytes);
      }
    } catch (e) {
      console.warn("[estimate-pdf] Could not load tooth graph:", e);
    }

    let paymentImage: PDFImage | null = null;
    try {
      const paymentPath = path.resolve(process.cwd(), "logo/payment.png");
      if (fs.existsSync(paymentPath)) {
        const paymentBytes = fs.readFileSync(paymentPath);
        paymentImage = await doc.embedPng(paymentBytes);
      }
    } catch (e) {
      console.warn("[estimate-pdf] Could not load payment image:", e);
    }

    let signatureImage: PDFImage | null = null;
    try {
      const sigPath = path.resolve(process.cwd(), "logo/signature.png");
      if (fs.existsSync(sigPath)) {
        const sigBytes = fs.readFileSync(sigPath);
        signatureImage = await doc.embedPng(sigBytes);
      }
    } catch (e) {
      console.warn("[estimate-pdf] Could not load signature image:", e);
    }

    const ctx: DrawCtx = {
      doc,
      font,
      boldFont,
      italicFont,
      boldItalicFont,
      page: doc.addPage([PAGE_W, PAGE_H]),
      y: 790,
      settings,
      logoImage,
      toothGraphImage,
      paymentImage,
      signatureImage,
    };

    // ================================================================
    // PAGE 1
    // ================================================================
    drawPage1(ctx, {
      patientName,
      date,
      selectedTreatments,
      appointmentCount,
      basicCodes,
      discount,
      transcript,
    });

    // ================================================================
    // PAGE 2
    // ================================================================
    newPage(ctx);
    drawPage2(ctx, {
      patientName,
      selectedTreatments,
      basicCodes,
      appointmentCount,
      discount,
    });

    // ================================================================
    // PAGE 3
    // ================================================================
    newPage(ctx);
    drawPage3(ctx, {
      patientName,
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
    selectedTreatments: SelectedTreatment[];
    appointmentCount: number;
    basicCodes: BasicCodeItem[];
    discount?: number;
    transcript?: string;
  }
) {
  const {
    patientName,
    date,
    selectedTreatments,
    appointmentCount,
    basicCodes,
    discount,
    transcript,
  } = opts;
  const { font, boldFont, italicFont, boldItalicFont, settings } = ctx;

  // Parse appointment details from transcript
  const appointmentDetails = parseAppointmentDetails(transcript || "", appointmentCount);

  // ── 1. Practice header (centered) ──
  drawPracticeHeader(ctx);
  ctx.y -= 25;

  // ── 2. Patient greeting: Dear / Date ──
  const cleanPatient = cleanText(patientName);
  ctx.page.drawText(`Dear ${cleanPatient}`, {
    x: MARGIN_L,
    y: ctx.y,
    size: 10,
    font,
    color: DARK,
  });

  const dateStr = cleanText(`Date: ${date}`);
  const dateW = font.widthOfTextAtSize(dateStr, 10);
  ctx.page.drawText(dateStr, {
    x: PAGE_W - MARGIN_R - dateW,
    y: ctx.y,
    size: 10,
    font,
    color: DARK,
  });
  ctx.y -= 20;

  // ── 3. Intro paragraph ──
  const introText =
    "I hope this letter finds you well. Following your recent appointment and review of the available information, my advice for treatment is as per the following estimate. This estimate details the necessary appointments and sequence of treatment.";
  drawWrappedText(ctx, introText, { size: 9, font, color: DARK });
  ctx.y -= 15;

  // ── 4. NB note ──
  const nbText = `NB: This estimate is valid for ${settings.quoteValidityDays || 6} months. Fees increase at the beginning of each calendar year, therefore, fees will be adjusted accordingly should your treatment plan extend into a new year. 3rd party provider fees are subject to change depending on the provider.`;
  drawWrappedText(ctx, nbText, { size: 8, font: boldItalicFont, color: DARK });
  ctx.y -= 20;

  // ── 5. "Proposed Treatment Plan:" heading ──
  drawSectionHeading(ctx, "Proposed Treatment Plan:");
  ctx.y -= 15;

  // ── 6. Appointment Breakdown table ──
  drawSubHeading(ctx, "Appointment Breakdown:");
  ctx.y -= 10;

  const apptColWidths = [120, 225, 150];
  const apptHeaders = ["", "Treatments", "Appointment Length"];
  const apptRowH = 18;

  drawTableHeader(ctx, MARGIN_L, CONTENT_W, apptRowH, apptHeaders, apptColWidths);

  for (let i = 0; i < appointmentCount; i++) {
    ensureSpace(ctx, apptRowH);
    const rowY = ctx.y;

    // Row background
    ctx.page.drawRectangle({
      x: MARGIN_L,
      y: rowY - apptRowH + 4,
      width: CONTENT_W,
      height: apptRowH,
      color: WHITE,
      borderColor: TABLE_BORDER,
      borderWidth: 0.5,
    });

    // Vertical dividers
    let divX = MARGIN_L;
    for (let c = 0; c < apptColWidths.length - 1; c++) {
      divX += apptColWidths[c];
      drawVLine(ctx.page, divX, rowY + 4, apptRowH);
    }

    // Appointment label
    ctx.page.drawText(cleanText(`Appointment ${i + 1}`), {
      x: MARGIN_L + 6,
      y: rowY - 11,
      size: 8,
      font,
      color: DARK,
    });

    // Treatments description
    const detail = appointmentDetails[i];
    if (detail?.treatments) {
      const treatText = truncateToWidth(
        cleanText(detail.treatments), apptColWidths[1] - 12, font, 7
      );
      ctx.page.drawText(treatText, {
        x: MARGIN_L + apptColWidths[0] + 6,
        y: rowY - 11,
        size: 7,
        font,
        color: DARK,
      });
    }

    // Appointment length
    if (detail?.length) {
      const lenText = truncateToWidth(
        cleanText(detail.length), apptColWidths[2] - 12, font, 7
      );
      ctx.page.drawText(lenText, {
        x: MARGIN_L + apptColWidths[0] + apptColWidths[1] + 6,
        y: rowY - 11,
        size: 7,
        font,
        color: DARK,
      });
    }

    ctx.y -= apptRowH;
  }

  ctx.y -= 20;

  // ── 7. Cost intro text ──
  ensureSpace(ctx, 16);
  drawWrappedText(
    ctx,
    "The expected costs of the proposed dental treatment are as follows:",
    { size: 9, font, color: DARK }
  );
  ctx.y -= 10;

  // ── Compute totals ──
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

  let thirdPartyTotal = 0;
  for (const st of selectedTreatments) {
    for (const sc of st.selectedCodes) {
      const matchingCode = st.treatment.codes.find((c) => c.code === sc.code);
      if (matchingCode) {
        thirdPartyTotal +=
          ((matchingCode.labFee || 0) + (matchingCode.implantFee || 0)) *
          sc.quantity;
      }
    }
  }

  const grandTotalWithLab = grandTotal + thirdPartyTotal;

  // ── 8. Grand Total preview line ──
  ensureSpace(ctx, 30);
  drawHLine(ctx.page, MARGIN_L, ctx.y + 2, CONTENT_W, TABLE_BORDER);

  ctx.page.drawText(
    cleanText(
      "Grand Total For This Estimate (including lab fee approximation)"
    ),
    {
      x: MARGIN_L + 6,
      y: ctx.y - 10,
      size: 9,
      font: boldFont,
      color: DARK,
    }
  );

  const grandTotalStr = fmtR(grandTotalWithLab);
  const grandTotalW = boldFont.widthOfTextAtSize(grandTotalStr, 12);
  ctx.page.drawText(grandTotalStr, {
    x: PAGE_W - MARGIN_R - grandTotalW - 6,
    y: ctx.y - 11,
    size: 12,
    font: boldFont,
    color: GREEN,
  });

  drawHLine(ctx.page, MARGIN_L, ctx.y - 18, CONTENT_W, TABLE_BORDER);
  ctx.y -= 25;

  // ── 9. Treatment line items table ──
  const treatColWidths = [45, 130, 55, 50, 50, 55, 35, 75];
  const treatHeaders = [
    "Item Code",
    "Description",
    "ICD-10",
    "Provider",
    "Tooth Nums",
    "Per Unit",
    "Units",
    "Total",
  ];

  drawTableHeader(
    ctx,
    MARGIN_L,
    CONTENT_W,
    16,
    treatHeaders,
    treatColWidths,
    true
  );

  const treatColX = computeColX(MARGIN_L, treatColWidths);
  const rowH = 16;
  let rowIndex = 0;

  // Basic codes per appointment
  for (let apt = 0; apt < appointmentCount; apt++) {
    // Appointment sub-header row
    ensureSpace(ctx, rowH);
    const subY = ctx.y;
    ctx.page.drawRectangle({
      x: MARGIN_L,
      y: subY - rowH + 4,
      width: CONTENT_W,
      height: rowH,
      color: LIGHT_GRAY_BG,
    });
    drawHLine(ctx.page, MARGIN_L, subY + 4, CONTENT_W, TABLE_BORDER);
    ctx.page.drawText(cleanText(`Appointment ${apt + 1}`), {
      x: MARGIN_L + 6,
      y: subY - 10,
      size: 8,
      font: boldFont,
      color: GREEN,
    });
    ctx.y -= rowH;
    rowIndex++;

    for (const bc of basicCodes) {
      ensureSpace(ctx, rowH);
      const lineTotal = bc.price * bc.quantity;
      drawTreatmentRow(ctx, treatColX, treatColWidths, rowH, rowIndex, {
        code: bc.code,
        desc: bc.description,
        icd10: "",
        provider: "",
        toothNumbers: "",
        unitPrice: fmtR(bc.price),
        units: String(bc.quantity),
        total: fmtR(lineTotal),
      });
      rowIndex++;
    }
  }

  // Selected treatments
  for (const st of selectedTreatments) {
    for (const sc of st.selectedCodes) {
      ensureSpace(ctx, rowH);
      const lineTotal = sc.price * sc.quantity;
      const matchingCode = st.treatment.codes.find((c) => c.code === sc.code);
      drawTreatmentRow(ctx, treatColX, treatColWidths, rowH, rowIndex, {
        code: sc.code,
        desc: sc.description,
        icd10: matchingCode?.icd10 || "",
        provider: "",
        toothNumbers: "",
        unitPrice: fmtR(sc.price),
        units: String(sc.quantity),
        total: fmtR(lineTotal),
      });
      rowIndex++;
    }
  }

  // Close bottom of table
  drawHLine(ctx.page, MARGIN_L, ctx.y + 4, CONTENT_W, TABLE_BORDER);
  ctx.y -= 6;

  // ── 10. Discount rows (yellow highlight) ──
  const discountRows = [
    { label: "DISCOUNT 5% VALID 30 DAYS", pct: 0.05 },
    { label: "DISCOUNT 10% VALID FOR 30 DAYS", pct: 0.1 },
    { label: "DISCOUNT 15% VALID FOR 30 DAYS", pct: 0.15 },
  ];

  for (const dr of discountRows) {
    ensureSpace(ctx, 16);
    const drY = ctx.y;
    const discountAmt = grandTotal * dr.pct;
    const afterDiscount = grandTotal - discountAmt;

    // Yellow background across full row
    ctx.page.drawRectangle({
      x: MARGIN_L,
      y: drY - 12,
      width: CONTENT_W,
      height: 16,
      color: YELLOW_HIGHLIGHT,
    });

    ctx.page.drawText(cleanText(dr.label), {
      x: MARGIN_L + 6,
      y: drY - 8,
      size: 8,
      font,
      color: DARK,
    });

    const dStr = fmtR(afterDiscount);
    const dW = font.widthOfTextAtSize(dStr, 8);
    ctx.page.drawText(dStr, {
      x: PAGE_W - MARGIN_R - dW - 6,
      y: drY - 8,
      size: 8,
      font,
      color: DARK,
    });
    ctx.y -= 16;
  }

  ctx.y -= 4;

  // ── 11. Discount note ──
  ensureSpace(ctx, 12);
  ctx.page.drawText(
    cleanText(
      "Discounts above are only valid for deposit/full payment within 30 days."
    ),
    {
      x: MARGIN_L + 6,
      y: ctx.y,
      size: 7,
      font: italicFont,
      color: GRAY,
    }
  );
  ctx.y -= 14;

  // ── 12. TOTAL line ──
  ensureSpace(ctx, 24);
  drawHLine(ctx.page, MARGIN_L, ctx.y + 4, CONTENT_W, TABLE_BORDER);
  drawHLine(ctx.page, MARGIN_L, ctx.y + 6, CONTENT_W, TABLE_BORDER); // double line

  ctx.page.drawText(
    cleanText("TOTAL (incl discount for our fees, excl 3rd party fees):"),
    {
      x: MARGIN_L + 6,
      y: ctx.y - 8,
      size: 10,
      font: boldFont,
      color: DARK,
    }
  );

  const totalAfterDiscount = discount ? grandTotal - discount : grandTotal;
  const totalStr = fmtR(totalAfterDiscount);
  const totalW = boldFont.widthOfTextAtSize(totalStr, 10);
  ctx.page.drawText(totalStr, {
    x: PAGE_W - MARGIN_R - totalW - 6,
    y: ctx.y - 8,
    size: 10,
    font: boldFont,
    color: GREEN,
  });
  ctx.y -= 16;
}

// ================================================================
// PAGE 2: Third Party Fees + Tooth Diagram + Consent + T&Cs
// ================================================================

function drawPage2(
  ctx: DrawCtx,
  opts: {
    patientName: string;
    selectedTreatments: SelectedTreatment[];
    basicCodes: BasicCodeItem[];
    appointmentCount: number;
    discount?: number;
  }
) {
  const { patientName, selectedTreatments, basicCodes, appointmentCount, discount } =
    opts;
  const { font, boldFont, italicFont, settings } = ctx;

  // ── 13. Third Party Fees section ──
  drawSectionHeading(ctx, "Third Party Fees");
  ctx.y -= 10;

  const treatColWidths = [45, 130, 55, 50, 50, 55, 35, 75];
  const treatHeaders = [
    "Item Code",
    "Description",
    "ICD-10",
    "Provider",
    "Tooth Nums",
    "Per Unit",
    "Units",
    "Total",
  ];

  drawTableHeader(
    ctx,
    MARGIN_L,
    CONTENT_W,
    16,
    treatHeaders,
    treatColWidths,
    true
  );

  const treatColX = computeColX(MARGIN_L, treatColWidths);
  const rowH = 16;
  let thirdPartyTotal = 0;
  let rowIndex = 0;

  for (const st of selectedTreatments) {
    for (const sc of st.selectedCodes) {
      const matchingCode = st.treatment.codes.find((c) => c.code === sc.code);

      // Only show lab fees that actually have amounts
      if (matchingCode?.labFee && matchingCode.labFee > 0) {
        ensureSpace(ctx, rowH);
        const lineTotal = matchingCode.labFee * sc.quantity;
        thirdPartyTotal += lineTotal;
        drawTreatmentRow(ctx, treatColX, treatColWidths, rowH, rowIndex, {
          code: "8099",
          desc: `Lab fee - ${sc.description}`,
          icd10: "",
          provider: "Lab",
          toothNumbers: "",
          unitPrice: fmtR(matchingCode.labFee),
          units: String(sc.quantity),
          total: fmtR(lineTotal),
        });
        rowIndex++;
      }

      // Only show implant fees that actually have amounts
      if (matchingCode?.implantFee && matchingCode.implantFee > 0) {
        ensureSpace(ctx, rowH);
        const lineTotal = matchingCode.implantFee * sc.quantity;
        thirdPartyTotal += lineTotal;
        drawTreatmentRow(ctx, treatColX, treatColWidths, rowH, rowIndex, {
          code: sc.code,
          desc: `Implant component - ${sc.description}`,
          icd10: "",
          provider: "Supplier",
          toothNumbers: "",
          unitPrice: fmtR(matchingCode.implantFee),
          units: String(sc.quantity),
          total: fmtR(lineTotal),
        });
        rowIndex++;
      }
    }
  }

  // Bottom line
  drawHLine(ctx.page, MARGIN_L, ctx.y + 4, CONTENT_W, TABLE_BORDER);
  ctx.y -= 4;

  // TOTAL row for third party
  ensureSpace(ctx, 18);
  ctx.page.drawText(cleanText("TOTAL"), {
    x: MARGIN_L + 6,
    y: ctx.y,
    size: 8,
    font: boldFont,
    color: DARK,
  });
  const tpTotalStr = fmtR(thirdPartyTotal);
  const tpTotalW = boldFont.widthOfTextAtSize(tpTotalStr, 8);
  ctx.page.drawText(tpTotalStr, {
    x: PAGE_W - MARGIN_R - tpTotalW - 6,
    y: ctx.y,
    size: 8,
    font: boldFont,
    color: DARK,
  });
  ctx.y -= 18;

  // ── 14. Total (including lab fee approximation) ──
  ensureSpace(ctx, 18);

  // Recompute grand total
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
  const totalAfterDiscount = discount ? grandTotal - discount : grandTotal;
  const grandTotalWithLab = totalAfterDiscount + thirdPartyTotal;

  ctx.page.drawText(
    cleanText("Total (including lab fee approximation)"),
    {
      x: MARGIN_L + 6,
      y: ctx.y,
      size: 9,
      font: boldFont,
      color: DARK,
    }
  );
  const inclLabStr = fmtR(grandTotalWithLab);
  const inclLabW = boldFont.widthOfTextAtSize(inclLabStr, 10);
  ctx.page.drawText(inclLabStr, {
    x: PAGE_W - MARGIN_R - inclLabW - 6,
    y: ctx.y,
    size: 10,
    font: boldFont,
    color: GREEN,
  });
  ctx.y -= 25;

  // ── 15. Tooth Diagram labels ──
  drawToothDiagramLabels(ctx);
  ctx.y -= 20;

  // ── 16. Consent section ──
  ensureSpace(ctx, 20);
  drawSectionHeading(ctx, "Consent");
  ctx.y -= 10;

  drawWrappedText(
    ctx,
    "Kindly Read the Terms and Conditions below, sign and send back to us.",
    { size: 8, font: italicFont, color: GRAY }
  );
  ctx.y -= 8;

  const consentName = cleanText(settings.name || "Dr Smithies");
  drawWrappedText(
    ctx,
    `I, _______________ hereby accept this estimate from ${consentName} ("the dentist") in the amount of R_______________ ("the quoted amount"). I accept this treatment on the conditions as set out below:`,
    { size: 8, font, color: DARK }
  );
  ctx.y -= 6;

  drawWrappedText(
    ctx,
    "I acknowledge that the dentist may be required to do additional work, alter or adjust treatment during the course of the planned treatment and I hereby consent to these changes in advance. I understand that the quoted fees may differ depending on the changes made.",
    { size: 8, font, color: DARK }
  );
  ctx.y -= 15;

  // ── 17. Payment Options ──
  ensureSpace(ctx, 20);
  drawSectionHeading(ctx, "Payment Options");
  ctx.y -= 10;

  drawWrappedText(
    ctx,
    "Payment Option 1 = full payment on acceptance of estimate. 5% discount on our fees (not applicable to 3rd party fees).",
    { size: 8, font, color: DARK }
  );
  ctx.y -= 6;
  drawWrappedText(
    ctx,
    "Payment Option 2 = pay 50% deposit on acceptance of estimate and the balance before the last appointment.",
    { size: 8, font, color: DARK }
  );
  ctx.y -= 15;

  // ── 18. Domicilium ──
  ensureSpace(ctx, 20);
  drawSectionHeading(ctx, "Domicilium Citandi Et Executandi");
  ctx.y -= 10;

  drawWrappedText(
    ctx,
    "The patient chooses the address given above as the address at which all legal documents may be served on the patient (domicilium citandi et executandi).",
    { size: 7.5, font, color: DARK }
  );
  ctx.y -= 15;

  // ── 19. General Terms and Conditions ──
  ensureSpace(ctx, 20);
  drawSectionHeading(ctx, "General Terms and Conditions");
  ctx.y -= 10;

  const generalTCs = [
    "No alteration, cancellation or variation of this document shall be of any force or effect unless reduced to writing and signed by both parties.",
    "This document contains the entire agreement between the parties and neither party shall be bound by any undertakings, representations, warranties or the like not recorded herein.",
    "Any indulgence granted to the patient by the dentist shall not constitute a waiver of any rights by the dentist.",
    "Prices include 15% VAT. No refunds will be entertained on treatment already delivered.",
    "This estimate does not include any fees that other specialists may charge for their services.",
    "Please note that any third party fees are just approximate costs and are subject to change from the third party provider.",
  ];

  for (const tc of generalTCs) {
    ensureSpace(ctx, 14);
    drawWrappedText(ctx, `- ${tc}`, { size: 7.5, font, color: DARK });
    ctx.y -= 4;
  }
  ctx.y -= 10;

  // ── 20. Cancellations ──
  ensureSpace(ctx, 20);
  drawSectionHeading(ctx, "Cancellations");
  ctx.y -= 10;

  drawWrappedText(
    ctx,
    "Appointments that are cancelled with less than 24 hours notice will be charged a cancellation fee at the discretion of the practice.",
    { size: 7.5, font, color: DARK }
  );
  ctx.y -= 15;

  // ── 21. Information about your treatment ──
  ensureSpace(ctx, 20);
  drawSectionHeading(ctx, "Information about your treatment:");
  ctx.y -= 10;

  const infoItems = [
    "Dental checkups: Regular dental checkups are recommended every 6 months to ensure early detection and treatment of any dental issues.",
    "Dental cleans: Professional dental cleaning removes tartar and plaque that cannot be removed by regular brushing and flossing.",
    "Bite plate: A bite plate may be recommended to protect your teeth from grinding (bruxism) or to correct bite issues.",
    "Provisional fillings: Provisional (temporary) fillings are placed as an interim measure and should be replaced with a permanent restoration as soon as possible.",
    "Implant failure: Although rare, implant failure can occur. Factors such as smoking, medical conditions, and oral hygiene can affect the success rate of dental implants.",
    "Warranty terms: Warranties on dental work are subject to the patient maintaining regular checkups and following all aftercare instructions provided.",
  ];

  for (let i = 0; i < infoItems.length; i++) {
    ensureSpace(ctx, 14);
    drawWrappedText(ctx, `${i + 1}. ${infoItems[i]}`, {
      size: 7.5,
      font,
      color: DARK,
    });
    ctx.y -= 4;
  }
}

// ================================================================
// PAGE 3: Treatment Type / What to Expect + Signature + Banking
// ================================================================

function drawPage3(
  ctx: DrawCtx,
  opts: {
    patientName: string;
    selectedTreatments: SelectedTreatment[];
  }
) {
  const { patientName, selectedTreatments } = opts;
  const { font, boldFont, italicFont, settings } = ctx;

  // ── 22. Treatment Type / What to Expect table ──
  drawSectionHeading(ctx, "Treatment Type / What to Expect and Aftercare");
  ctx.y -= 10;

  const ttColWidths = [90, 165, 165, 75];
  const ttHeaders = ["Treatment Type", "What to Expect and Aftercare", "Terms and Conditions", "Warranty"];

  drawTableHeader(ctx, MARGIN_L, CONTENT_W, 16, ttHeaders, ttColWidths, true);

  // PPE row (always present)
  drawTreatmentTypeRow(ctx, MARGIN_L, ttColWidths, {
    type: "PPE and Infection Control",
    whatToExpect: "Standard infection control and PPE protocols are followed for all treatments to ensure your safety.",
    termsAndConditions: "",
    warranty: "",
  });

  // Dynamic rows from selected treatments
  const treatmentTCRows = new Map<string, { whatToExpect: string; termsAndConditions: string; warranty: string }>();
  for (const st of selectedTreatments) {
    if (st.treatment.termsAndConditions) {
      const displayName = formatCategoryName(
        st.treatment.category || st.treatment.name
      );
      if (treatmentTCRows.has(displayName)) continue;

      const rawTC = st.treatment.termsAndConditions.replace(/---/g, "").trim();

      // Parse out warranty info (e.g. "Warranty: 3 years" or "Warranty: N/A")
      let warranty = "";
      const warrantyMatch = rawTC.match(/Warranty\s*:\s*([^\n.]+)/i);
      if (warrantyMatch) {
        warranty = warrantyMatch[1].trim();
      }

      // Split into What to Expect and Terms and Conditions sections
      let whatToExpect = "";
      let termsText = "";

      // Try to split on "Terms and Conditions" or "T&C" markers
      const tcSplitRegex = /Terms\s+and\s+Conditions\s*:/i;
      const parts = rawTC.split(tcSplitRegex);
      if (parts.length >= 2) {
        whatToExpect = parts[0].replace(/What\s+to\s+Expect\s*(and\s+Aftercare)?\s*:/i, "").trim();
        termsText = parts[1].replace(/Warranty\s*:\s*[^\n.]*/i, "").trim();
      } else {
        // If no split marker, use the whole text as whatToExpect
        whatToExpect = rawTC.replace(/Warranty\s*:\s*[^\n.]*/i, "").trim();
        termsText = "";
      }

      // Remove trailing/leading punctuation artefacts
      whatToExpect = whatToExpect.replace(/^[-\s]+|[-\s]+$/g, "").trim();
      termsText = termsText.replace(/^[-\s]+|[-\s]+$/g, "").trim();

      treatmentTCRows.set(displayName, {
        whatToExpect: cleanText(whatToExpect),
        termsAndConditions: cleanText(termsText),
        warranty: cleanText(warranty),
      });
    }
  }

  for (const [category, data] of treatmentTCRows) {
    drawTreatmentTypeRow(ctx, MARGIN_L, ttColWidths, {
      type: category,
      whatToExpect: data.whatToExpect,
      termsAndConditions: data.termsAndConditions,
      warranty: data.warranty,
    });
  }

  // Bottom border of table
  drawHLine(ctx.page, MARGIN_L, ctx.y + 4, CONTENT_W, TABLE_BORDER);
  ctx.y -= 25;

  // ── 23. Signature section ──
  ensureSpace(ctx, 60);

  ctx.page.drawText(
    cleanText("Signed ___________________________________"),
    {
      x: MARGIN_L,
      y: ctx.y,
      size: 9,
      font,
      color: DARK,
    }
  );
  ctx.page.drawText(
    cleanText("Name: ___________________________________"),
    {
      x: PAGE_W / 2 + 20,
      y: ctx.y,
      size: 9,
      font,
      color: DARK,
    }
  );
  ctx.y -= 20;

  ctx.page.drawText(
    cleanText(
      "Address: ________________________________________________________________"
    ),
    {
      x: MARGIN_L,
      y: ctx.y,
      size: 9,
      font,
      color: DARK,
    }
  );
  ctx.y -= 20;

  ctx.page.drawText(
    cleanText("Date: ___________________________________"),
    {
      x: MARGIN_L,
      y: ctx.y,
      size: 9,
      font,
      color: DARK,
    }
  );
  ctx.y -= 35;

  // ── 24. Bottom section: Kind Regards + Signature + Banking ──
  ensureSpace(ctx, 140);

  const leftX = MARGIN_L;
  const rightX = PAGE_W / 2 + 20;
  const startY = ctx.y;

  // ── LEFT SIDE: Kind Regards + Signature + Doctor Name ──
  ctx.page.drawText(cleanText("Kind Regards,"), {
    x: leftX,
    y: startY,
    size: 9,
    font,
    color: DARK,
  });

  let leftY = startY - 20;

  // Signature image
  if (ctx.signatureImage) {
    const sigDims = ctx.signatureImage.scale(0.1);
    const sigW = Math.min(sigDims.width, 130);
    const sigH = (sigW / sigDims.width) * sigDims.height;
    ctx.page.drawImage(ctx.signatureImage, {
      x: leftX,
      y: leftY - sigH,
      width: sigW,
      height: sigH,
    });
    leftY -= sigH + 6;
  } else {
    ctx.page.drawText(cleanText("Sheryl Smithies"), {
      x: leftX,
      y: leftY,
      size: 14,
      font: italicFont,
      color: DARK,
    });
    leftY -= 18;
  }

  // Doctor name
  ctx.page.drawText(cleanText(settings.name || "Dr Sheryl Smithies"), {
    x: leftX,
    y: leftY,
    size: 9,
    font: boldFont,
    color: DARK,
  });

  // ── RIGHT SIDE: Banking Details ──
  ctx.page.drawText(cleanText("Banking Details for EFT payments:"), {
    x: rightX,
    y: startY,
    size: 9,
    font: boldFont,
    color: DARK,
  });

  let rightY = startY - 16;
  const bankDetails = [
    ["Bank:", "FNB"],
    ["Branch code:", "255655"],
    ["Acc Name:", "The Smile Emporium INC"],
    ["Acc no:", "62695604176"],
    ["Ref:", "Your name and surname"],
    ["SWIFT:", "FIRNZAJJ"],
  ];

  for (const [label, value] of bankDetails) {
    ctx.page.drawText(cleanText(label), {
      x: rightX,
      y: rightY,
      size: 8,
      font,
      color: DARK,
    });
    ctx.page.drawText(cleanText(value), {
      x: rightX + 75,
      y: rightY,
      size: 8,
      font,
      color: DARK,
    });
    rightY -= 13;
  }

  // Move ctx.y to below whichever side went lower
  ctx.y = Math.min(leftY, rightY) - 20;

  // ── 25. Payment image (below everything, centered) ──
  if (ctx.paymentImage) {
    const payDims = ctx.paymentImage.scale(0.3);
    const payW = Math.min(payDims.width, 200);
    const payH = (payW / payDims.width) * payDims.height;

    ensureSpace(ctx, payH + 10);

    ctx.page.drawImage(ctx.paymentImage, {
      x: (PAGE_W - payW) / 2,
      y: ctx.y - payH,
      width: payW,
      height: payH,
    });
    ctx.y -= payH + 10;
  }
}

// ================================================================
// Drawing Helpers
// ================================================================

/** Add a new A4 page and reset Y */
function newPage(ctx: DrawCtx) {
  ctx.page = ctx.doc.addPage([PAGE_W, PAGE_H]);
  ctx.y = 790;
}

/** Ensure enough vertical space; if not, start a new page */
function ensureSpace(ctx: DrawCtx, needed: number) {
  if (ctx.y - needed < MARGIN_BOTTOM) {
    newPage(ctx);
  }
}

/** Draw the full practice header (for page 1) */
function drawPracticeHeader(ctx: DrawCtx) {
  const { boldFont, font, settings } = ctx;

  // Logo image centered at top
  if (ctx.logoImage) {
    const logoDims = ctx.logoImage.scale(0.25);
    const logoW = Math.min(logoDims.width, 300);
    const logoH = (logoW / logoDims.width) * logoDims.height;
    ctx.page.drawImage(ctx.logoImage, {
      x: (PAGE_W - logoW) / 2,
      y: ctx.y - logoH + 10,
      width: logoW,
      height: logoH,
    });
    ctx.y -= logoH + 8;
  }

  // Practice name - 13pt bold green centered
  const practiceName = cleanText(
    settings.name || "Dr Sheryl Smithies BChD (PRET)"
  );
  drawCenteredText(ctx, practiceName, {
    size: 13,
    font: boldFont,
    color: GREEN,
  });

  // Phone - 8pt gray centered
  if (settings.phone) {
    drawCenteredText(ctx, cleanText(`T: ${settings.phone}`), {
      size: 8,
      font,
      color: GRAY,
    });
  }

  // Practice number / VAT - 8pt gray centered
  if (settings.vatNumber) {
    drawCenteredText(
      ctx,
      cleanText(
        `Practice Number: ${settings.vatNumber}. VAT ${settings.vatNumber}`
      ),
      { size: 8, font, color: GRAY }
    );
  }

  // Phone again - 8pt gray centered
  if (settings.phone) {
    drawCenteredText(ctx, cleanText(`t: ${settings.phone}`), {
      size: 8,
      font,
      color: GRAY,
    });
  }

  // Email - 8pt gray centered
  if (settings.email) {
    drawCenteredText(ctx, cleanText(`e: ${settings.email}`), {
      size: 8,
      font,
      color: GRAY,
    });
  }
}

/** Draw a small header on continuation pages */
function drawSmallHeader(ctx: DrawCtx) {
  const name = cleanText(
    ctx.settings.name || "Dr Sheryl Smithies BChD (PRET)"
  );
  const w = ctx.boldFont.widthOfTextAtSize(name, 10);
  ctx.page.drawText(name, {
    x: (PAGE_W - w) / 2,
    y: ctx.y,
    size: 10,
    font: ctx.boldFont,
    color: GREEN,
  });
  ctx.y -= 14;
}

/** Draw a section heading - 11pt bold green with a thin line underneath */
function drawSectionHeading(ctx: DrawCtx, text: string) {
  ensureSpace(ctx, 20);
  ctx.page.drawText(cleanText(text), {
    x: MARGIN_L,
    y: ctx.y,
    size: 11,
    font: ctx.boldFont,
    color: GREEN,
  });
  ctx.y -= 3;
  drawHLine(ctx.page, MARGIN_L, ctx.y, CONTENT_W, TABLE_BORDER);
  ctx.y -= 2;
}

/** Draw a sub-heading - 10pt bold green */
function drawSubHeading(ctx: DrawCtx, text: string) {
  ensureSpace(ctx, 16);
  ctx.page.drawText(cleanText(text), {
    x: MARGIN_L,
    y: ctx.y,
    size: 10,
    font: ctx.boldFont,
    color: GREEN,
  });
  ctx.y -= 14;
}

/** Draw centered text and advance Y */
function drawCenteredText(
  ctx: DrawCtx,
  text: string,
  opts: { size: number; font: PDFFont; color: RGB }
) {
  const cleaned = cleanText(text);
  const w = opts.font.widthOfTextAtSize(cleaned, opts.size);
  ctx.page.drawText(cleaned, {
    x: (PAGE_W - w) / 2,
    y: ctx.y,
    size: opts.size,
    font: opts.font,
    color: opts.color,
  });
  ctx.y -= opts.size + 4;
}

/** Draw word-wrapped text */
function drawWrappedText(
  ctx: DrawCtx,
  text: string,
  opts: { size: number; font: PDFFont; color: RGB; indent?: number }
) {
  const indent = opts.indent || 0;
  const maxWidth = CONTENT_W - indent;
  const clean = cleanText(text);
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

/** Wrap text into lines for measuring height */
function wrapTextToLines(
  text: string,
  maxWidth: number,
  font: PDFFont,
  size: number
): string[] {
  const paragraphs = text.replace(/\r\n/g, "\n").split("\n");
  const lines: string[] = [];

  for (const para of paragraphs) {
    const clean = cleanText(para);
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

/** Draw horizontal line */
function drawHLine(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  color: RGB = TABLE_BORDER
) {
  page.drawLine({
    start: { x, y },
    end: { x: x + width, y },
    thickness: 0.5,
    color,
  });
}

/** Draw vertical line */
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

/** Compute cumulative column X positions */
function computeColX(startX: number, colWidths: number[]): number[] {
  const positions: number[] = [];
  let x = startX;
  for (const w of colWidths) {
    positions.push(x);
    x += w;
  }
  return positions;
}

/** Draw a table header row with dark background and white text */
function drawTableHeader(
  ctx: DrawCtx,
  x: number,
  width: number,
  height: number,
  headers: string[],
  colWidths: number[],
  darkStyle = false
) {
  ensureSpace(ctx, height);
  const rowY = ctx.y;

  const bgColor = darkStyle ? HEADER_BG : LIGHT_GRAY_BG;
  const textColor = darkStyle ? WHITE : DARK;

  // Background
  ctx.page.drawRectangle({
    x,
    y: rowY - height + 4,
    width,
    height,
    color: bgColor,
    borderColor: TABLE_BORDER,
    borderWidth: 0.5,
  });

  // Column dividers and text
  let colX = x;
  for (let i = 0; i < headers.length; i++) {
    if (colX > x) {
      drawVLine(ctx.page, colX, rowY + 4, height);
    }

    const headerText = cleanText(headers[i]);
    // Truncate header if too wide
    const maxW = colWidths[i] - 6;
    const truncated = truncateToWidth(headerText, maxW, ctx.boldFont, 8);

    ctx.page.drawText(truncated, {
      x: colX + 4,
      y: rowY - 10,
      size: 8,
      font: ctx.boldFont,
      color: textColor,
    });

    colX += colWidths[i];
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

/** Draw a single treatment data row with alternating backgrounds */
function drawTreatmentRow(
  ctx: DrawCtx,
  colX: number[],
  colWidths: number[],
  rowH: number,
  rowIndex: number,
  data: TreatmentRowData
) {
  const rowY = ctx.y;
  const sz = 8;
  const f = ctx.font;

  // Alternating row bg
  const bgColor = rowIndex % 2 === 0 ? WHITE : ALT_ROW_BG;
  ctx.page.drawRectangle({
    x: colX[0],
    y: rowY - rowH + 4,
    width: CONTENT_W,
    height: rowH,
    color: bgColor,
  });

  // Row border top
  drawHLine(ctx.page, colX[0], rowY + 4, CONTENT_W, TABLE_BORDER);

  // Draw vertical dividers
  for (let i = 0; i < colX.length; i++) {
    drawVLine(ctx.page, colX[i], rowY + 4, rowH);
  }
  // Right edge
  drawVLine(ctx.page, colX[0] + CONTENT_W, rowY + 4, rowH);

  const textY = rowY - 10;

  // Clean and truncate all cell text
  const codeText = truncateToWidth(cleanText(data.code), colWidths[0] - 6, f, sz);
  const descText = truncateToWidth(cleanText(data.desc), colWidths[1] - 6, f, sz);
  const icd10Text = truncateToWidth(cleanText(data.icd10), colWidths[2] - 6, f, sz);
  const provText = truncateToWidth(cleanText(data.provider), colWidths[3] - 6, f, sz);
  const toothText = truncateToWidth(cleanText(data.toothNumbers), colWidths[4] - 6, f, sz);
  const unitPriceText = cleanText(data.unitPrice);
  const unitsText = cleanText(data.units);
  const totalText = cleanText(data.total);

  // Item Code
  ctx.page.drawText(codeText, {
    x: colX[0] + 4,
    y: textY,
    size: sz,
    font: f,
    color: DARK,
  });
  // Description
  ctx.page.drawText(descText, {
    x: colX[1] + 4,
    y: textY,
    size: sz,
    font: f,
    color: DARK,
  });
  // ICD-10
  if (icd10Text) {
    ctx.page.drawText(icd10Text, {
      x: colX[2] + 4,
      y: textY,
      size: sz,
      font: f,
      color: GRAY,
    });
  }
  // Provider
  if (provText) {
    ctx.page.drawText(provText, {
      x: colX[3] + 4,
      y: textY,
      size: sz,
      font: f,
      color: DARK,
    });
  }
  // Tooth Numbers
  if (toothText) {
    ctx.page.drawText(toothText, {
      x: colX[4] + 4,
      y: textY,
      size: sz,
      font: f,
      color: DARK,
    });
  }
  // Per Unit Price (right-aligned)
  const upW = f.widthOfTextAtSize(unitPriceText, sz);
  ctx.page.drawText(unitPriceText, {
    x: colX[5] + colWidths[5] - upW - 4,
    y: textY,
    size: sz,
    font: f,
    color: DARK,
  });
  // Units (right-aligned)
  const uW = f.widthOfTextAtSize(unitsText, sz);
  ctx.page.drawText(unitsText, {
    x: colX[6] + colWidths[6] - uW - 4,
    y: textY,
    size: sz,
    font: f,
    color: DARK,
  });
  // Total (right-aligned)
  const tW = f.widthOfTextAtSize(totalText, sz);
  ctx.page.drawText(totalText, {
    x: colX[7] + colWidths[7] - tW - 4,
    y: textY,
    size: sz,
    font: f,
    color: DARK,
  });

  ctx.y -= rowH;
}

/** Draw a treatment type row with wrapped text (4-column layout) */
function drawTreatmentTypeRow(
  ctx: DrawCtx,
  tableX: number,
  colWidths: number[],
  data: { type: string; whatToExpect: string; termsAndConditions: string; warranty: string }
) {
  const { font, boldFont } = ctx;
  const lineH = 9;
  const fontSize = 6;

  // Calculate required row height based on content in each column
  const maxTypeWidth = colWidths[0] - 8;
  const maxExpectWidth = colWidths[1] - 8;
  const maxTCWidth = colWidths[2] - 8;
  const maxWarrantyWidth = colWidths[3] - 8;

  const typeLines = wrapTextToLines(cleanText(data.type), maxTypeWidth, boldFont, 7);
  const expectLines = wrapTextToLines(cleanText(data.whatToExpect), maxExpectWidth, font, fontSize);
  const tcLines = wrapTextToLines(cleanText(data.termsAndConditions), maxTCWidth, font, fontSize);
  const warrantyLines = wrapTextToLines(cleanText(data.warranty), maxWarrantyWidth, font, fontSize);

  const maxLines = Math.max(typeLines.length, expectLines.length, tcLines.length, warrantyLines.length);
  const rowH = Math.max(30, maxLines * lineH + 12);

  ensureSpace(ctx, rowH);

  const rowY = ctx.y;

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

  // Col 1: Treatment type (bold)
  let typeY = rowY - 10;
  for (const line of typeLines) {
    ctx.page.drawText(line, {
      x: tableX + 4,
      y: typeY,
      size: 7,
      font: boldFont,
      color: DARK,
    });
    typeY -= lineH;
  }

  // Col 2: What to Expect and Aftercare
  const col2X = tableX + colWidths[0];
  let expectY = rowY - 10;
  for (const line of expectLines) {
    ctx.page.drawText(line, {
      x: col2X + 4,
      y: expectY,
      size: fontSize,
      font,
      color: DARK,
    });
    expectY -= lineH;
  }

  // Col 3: Terms and Conditions
  const col3X = col2X + colWidths[1];
  let tcY = rowY - 10;
  for (const line of tcLines) {
    ctx.page.drawText(line, {
      x: col3X + 4,
      y: tcY,
      size: fontSize,
      font,
      color: DARK,
    });
    tcY -= lineH;
  }

  // Col 4: Warranty
  const col4X = col3X + colWidths[2];
  let warrantyY = rowY - 10;
  for (const line of warrantyLines) {
    ctx.page.drawText(line, {
      x: col4X + 4,
      y: warrantyY,
      size: fontSize,
      font,
      color: DARK,
    });
    warrantyY -= lineH;
  }

  ctx.y -= rowH;
}

/** Draw tooth diagram */
function drawToothDiagramLabels(ctx: DrawCtx) {
  const { font, italicFont } = ctx;

  // If we have the tooth graph image, use it
  if (ctx.toothGraphImage) {
    const imgDims = ctx.toothGraphImage.scale(0.5);
    const imgW = Math.min(imgDims.width, CONTENT_W);
    const imgH = (imgW / imgDims.width) * imgDims.height;

    ensureSpace(ctx, imgH + 30);
    drawSectionHeading(ctx, "Tooth Diagram");
    ctx.y -= 5;

    ctx.page.drawImage(ctx.toothGraphImage, {
      x: (PAGE_W - imgW) / 2,
      y: ctx.y - imgH,
      width: imgW,
      height: imgH,
    });
    ctx.y -= imgH + 10;
    return;
  }

  // Fallback: draw tooth number labels
  ensureSpace(ctx, 55);
  drawSectionHeading(ctx, "Tooth Diagram");
  ctx.y -= 10;

  const upperRight = [18, 17, 16, 15, 14, 13, 12, 11];
  const upperLeft = [21, 22, 23, 24, 25, 26, 27, 28];
  const lowerRight = [48, 47, 46, 45, 44, 43, 42, 41];
  const lowerLeft = [31, 32, 33, 34, 35, 36, 37, 38];

  const centerX = PAGE_W / 2;
  const spacing = 26;

  ctx.page.drawText(cleanText("Patient's Right"), {
    x: MARGIN_L,
    y: ctx.y + 6,
    size: 7,
    font: italicFont,
    color: GRAY,
  });

  const plText = cleanText("Patient's Left");
  const plW = italicFont.widthOfTextAtSize(plText, 7);
  ctx.page.drawText(plText, {
    x: PAGE_W - MARGIN_R - plW,
    y: ctx.y + 6,
    size: 7,
    font: italicFont,
    color: GRAY,
  });

  for (let i = 0; i < upperRight.length; i++) {
    const x = centerX - (i + 1) * spacing + spacing / 2;
    ctx.page.drawText(String(upperRight[i]), {
      x,
      y: ctx.y,
      size: 7,
      font,
      color: DARK,
    });
  }
  for (let i = 0; i < upperLeft.length; i++) {
    const x = centerX + i * spacing + spacing / 2;
    ctx.page.drawText(String(upperLeft[i]), {
      x,
      y: ctx.y,
      size: 7,
      font,
      color: DARK,
    });
  }

  // Center line
  drawVLine(ctx.page, centerX, ctx.y + 6, 24, GRAY);
  ctx.y -= 6;
  drawHLine(ctx.page, MARGIN_L + 40, ctx.y, CONTENT_W - 80, GRAY);
  ctx.y -= 8;

  // Lower row
  for (let i = 0; i < lowerRight.length; i++) {
    const x = centerX - (i + 1) * spacing + spacing / 2;
    ctx.page.drawText(String(lowerRight[i]), {
      x,
      y: ctx.y,
      size: 7,
      font,
      color: DARK,
    });
  }
  for (let i = 0; i < lowerLeft.length; i++) {
    const x = centerX + i * spacing + spacing / 2;
    ctx.page.drawText(String(lowerLeft[i]), {
      x,
      y: ctx.y,
      size: 7,
      font,
      color: DARK,
    });
  }

  ctx.y -= 12;
}

// ── Formatting helpers ──────────────────────────────────────

function fmtR(n: number): string {
  return `R ${n.toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Truncate string to fit within pixel width, adding "..." if needed */
function truncateToWidth(
  text: string,
  maxWidth: number,
  font: PDFFont,
  size: number
): string {
  if (!text) return "";
  const w = font.widthOfTextAtSize(text, size);
  if (w <= maxWidth) return text;

  // Binary search for the right length
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const candidate = text.substring(0, mid) + "...";
    const cw = font.widthOfTextAtSize(candidate, size);
    if (cw <= maxWidth) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  if (lo <= 1) return "...";
  return text.substring(0, lo - 1) + "...";
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
  return (
    names[category] || category.charAt(0).toUpperCase() + category.slice(1)
  );
}

function slug(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "patient"
  );
}

/** Parse appointment details from transcript text */
function parseAppointmentDetails(
  transcript: string,
  count: number
): { treatments: string; length: string }[] {
  const results: { treatments: string; length: string }[] = [];

  // Try to find "Appointment N:" patterns in the transcript
  for (let i = 1; i <= count; i++) {
    const patterns = [
      new RegExp(`appointment\\s*${i}[:\\.]?\\s*(.+?)(?=appointment\\s*${i + 1}|$)`, "is"),
      new RegExp(`visit\\s*${i}[:\\.]?\\s*(.+?)(?=visit\\s*${i + 1}|appointment|$)`, "is"),
      new RegExp(`${ordinal(i)}\\s*(?:visit|appointment)[:\\.]?\\s*(.+?)(?=${ordinal(i + 1)}|appointment|visit|$)`, "is"),
    ];

    let content = "";
    for (const pat of patterns) {
      const m = transcript.match(pat);
      if (m?.[1]) {
        content = m[1].trim();
        break;
      }
    }

    // Extract appointment length if mentioned
    let length = "";
    const timeMatch = content.match(/(?:estimated\s+)?(?:appointment\s+)?length\s*[:\-]?\s*([\d.]+\s*(?:hour|hr|min)[s]?)/i)
      || content.match(/([\d.]+\s*(?:hour|hr|min)[s]?)/i);
    if (timeMatch) {
      length = timeMatch[1];
      content = content.replace(timeMatch[0], "").trim();
    }

    // Clean up the treatments text
    content = content.replace(/[.]+$/, "").trim();

    results.push({ treatments: content, length });
  }

  return results;
}

function ordinal(n: number): string {
  const suffixes = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
}
