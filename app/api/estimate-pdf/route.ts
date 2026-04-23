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

// Colors
const GREEN = rgb(0.34, 0.57, 0.34);
const DARK = rgb(0.1, 0.1, 0.1);
const GRAY = rgb(0.4, 0.4, 0.4);
const LIGHT_GRAY = rgb(0.85, 0.85, 0.85);
const LIGHT_GREEN = rgb(0.91, 0.96, 0.91);
const WHITE = rgb(1, 1, 1);
const BLACK = rgb(0, 0, 0);

// Page dimensions (A4)
const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN_L = 50;
const MARGIN_R = 50;
const CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R;
const MARGIN_BOTTOM = 60;

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

    const ctx: DrawCtx = {
      doc,
      font,
      boldFont,
      italicFont,
      page: doc.addPage([PAGE_W, PAGE_H]),
      y: PAGE_H - 40,
    };

    // ================================================================
    // PAGE 1: Estimate Letter
    // ================================================================

    // -- Practice header (centered, green) --
    drawCenteredText(ctx, settings.name || "Dr Sheryl Smithies BChD (PRET)", {
      size: 16,
      font: boldFont,
      color: GREEN,
    });
    ctx.y -= 6;

    if (settings.phone) {
      drawCenteredText(ctx, `T: ${settings.phone}`, {
        size: 9,
        font,
        color: GRAY,
      });
    }

    const practiceInfoParts: string[] = [];
    if (settings.vatNumber) practiceInfoParts.push(`Practice Number: ${settings.vatNumber}`);
    if (practiceInfoParts.length > 0) {
      drawCenteredText(ctx, practiceInfoParts.join("  |  "), {
        size: 9,
        font,
        color: GRAY,
      });
    }

    if (settings.email) {
      drawCenteredText(ctx, `e: ${settings.email}`, {
        size: 9,
        font,
        color: GRAY,
      });
    }

    ctx.y -= 20;

    // -- Date on right, Dear patient on left --
    ctx.page.drawText(`Dear ${patientName}`, {
      x: MARGIN_L,
      y: ctx.y,
      size: 12,
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
    ctx.y -= 24;

    // -- Intro paragraph --
    const introText =
      "I hope this letter finds you well. Following your recent appointment and review of the available information, my advice for treatment is as per the following estimate. This estimate details the necessary appointments and sequence of treatment.";
    drawWrappedText(ctx, introText, { size: 9, font, color: DARK });
    ctx.y -= 10;

    // -- NB validity note (italic) --
    const nbText = `NB: This estimate is valid for ${settings.quoteValidityDays || 6} months. Fees increase at the beginning of each calendar year, therefore, fees will be adjusted accordingly should your treatment plan extend into a new year. 3rd party provider fees are subject to change depending on the provider.`;
    drawWrappedText(ctx, nbText, { size: 8, font: italicFont, color: GRAY });
    ctx.y -= 16;

    // -- "Proposed Treatment Plan:" heading --
    ctx.page.drawText("Proposed Treatment Plan:", {
      x: MARGIN_L,
      y: ctx.y,
      size: 11,
      font: boldFont,
      color: GREEN,
    });
    ctx.y -= 20;

    // -- Appointment breakdown --
    ctx.page.drawText("Appointment Breakdown:", {
      x: MARGIN_L,
      y: ctx.y,
      size: 10,
      font: boldFont,
      color: DARK,
    });
    ctx.y -= 16;

    for (let i = 0; i < Math.min(appointmentCount, 7); i++) {
      ensureSpace(ctx, 14);
      ctx.page.drawText(`Appointment ${i + 1}`, {
        x: MARGIN_L + 10,
        y: ctx.y,
        size: 9,
        font,
        color: DARK,
      });
      ctx.y -= 14;
    }
    ctx.y -= 10;

    // -- Cost intro --
    ensureSpace(ctx, 20);
    drawWrappedText(
      ctx,
      "The expected costs of the proposed dental treatment are as follows:",
      { size: 9, font, color: DARK }
    );
    ctx.y -= 10;

    // -- Treatment line items table --
    // Table columns: Code | Description | ICD-10 | Unit Price | Units | Total
    const colX = {
      code: MARGIN_L,
      desc: MARGIN_L + 60,
      icd10: MARGIN_L + 230,
      unitPrice: MARGIN_L + 300,
      units: MARGIN_L + 370,
      total: MARGIN_L + 410,
    };
    const tableRight = PAGE_W - MARGIN_R;

    // Table header
    ensureSpace(ctx, 20);
    ctx.page.drawRectangle({
      x: MARGIN_L,
      y: ctx.y - 4,
      width: CONTENT_W,
      height: 18,
      color: LIGHT_GREEN,
    });
    const headerY = ctx.y;
    const hSize = 7.5;
    ctx.page.drawText("Item Code", { x: colX.code + 4, y: headerY, size: hSize, font: boldFont, color: DARK });
    ctx.page.drawText("Description", { x: colX.desc + 4, y: headerY, size: hSize, font: boldFont, color: DARK });
    ctx.page.drawText("ICD-10", { x: colX.icd10 + 4, y: headerY, size: hSize, font: boldFont, color: DARK });
    ctx.page.drawText("Unit Price", { x: colX.unitPrice + 4, y: headerY, size: hSize, font: boldFont, color: DARK });
    ctx.page.drawText("Units", { x: colX.units + 4, y: headerY, size: hSize, font: boldFont, color: DARK });
    ctx.page.drawText("Total", { x: colX.total + 4, y: headerY, size: hSize, font: boldFont, color: DARK });
    ctx.y -= 22;

    // Draw a thin line under header
    drawHLine(ctx.page, MARGIN_L, ctx.y + 2, CONTENT_W);

    let grandTotal = 0;

    // Basic codes per appointment
    for (let apt = 0; apt < appointmentCount; apt++) {
      ensureSpace(ctx, 18);
      ctx.page.drawRectangle({
        x: MARGIN_L,
        y: ctx.y - 4,
        width: CONTENT_W,
        height: 16,
        color: LIGHT_GREEN,
      });
      ctx.page.drawText(`Appointment ${apt + 1}`, {
        x: MARGIN_L + 4,
        y: ctx.y,
        size: 9,
        font: boldFont,
        color: GREEN,
      });
      ctx.y -= 18;

      for (const bc of basicCodes) {
        ensureSpace(ctx, 14);
        const lineTotal = bc.price * bc.quantity;
        drawTableRow(ctx, colX, {
          code: bc.code,
          desc: bc.description,
          icd10: "",
          unitPrice: fmtR(bc.price),
          units: String(bc.quantity),
          total: fmtR(lineTotal),
        });
        grandTotal += lineTotal;
      }
    }

    // Selected treatments
    for (const st of selectedTreatments) {
      for (const sc of st.selectedCodes) {
        ensureSpace(ctx, 14);
        const lineTotal = sc.price * sc.quantity;
        const matchingCode = st.treatment.codes.find((c) => c.code === sc.code);
        drawTableRow(ctx, colX, {
          code: sc.code,
          desc: truncate(sc.description, 38),
          icd10: matchingCode?.icd10 || "",
          unitPrice: fmtR(sc.price),
          units: String(sc.quantity),
          total: fmtR(lineTotal),
        });
        grandTotal += lineTotal;
      }
    }

    // Subtotal line
    ctx.y -= 4;
    ensureSpace(ctx, 16);
    drawHLine(ctx.page, colX.total, ctx.y + 12, tableRight - colX.total);
    ctx.page.drawText("Subtotal:", {
      x: colX.unitPrice,
      y: ctx.y,
      size: 9,
      font: boldFont,
      color: DARK,
    });
    const subtotalStr = fmtR(grandTotal);
    const subtotalW = boldFont.widthOfTextAtSize(subtotalStr, 9);
    ctx.page.drawText(subtotalStr, {
      x: tableRight - subtotalW - 4,
      y: ctx.y,
      size: 9,
      font: boldFont,
      color: DARK,
    });
    ctx.y -= 18;

    // Discount rows
    const discountRows = [
      { label: "DISCOUNT 5% VALID 30 DAYS", pct: 0.05 },
      { label: "DISCOUNT 10% VALID FOR 30 DAYS", pct: 0.1 },
      { label: "DISCOUNT 15% VALID FOR 30 DAYS", pct: 0.15 },
    ];

    for (const dr of discountRows) {
      ensureSpace(ctx, 14);
      const discountAmt = grandTotal * dr.pct;
      const afterDiscount = grandTotal - discountAmt;
      ctx.page.drawText(dr.label, {
        x: MARGIN_L,
        y: ctx.y,
        size: 8,
        font: italicFont,
        color: GREEN,
      });
      const dStr = fmtR(afterDiscount);
      const dW = font.widthOfTextAtSize(dStr, 8);
      ctx.page.drawText(dStr, {
        x: tableRight - dW - 4,
        y: ctx.y,
        size: 8,
        font,
        color: DARK,
      });
      ctx.y -= 14;
    }

    ctx.y -= 4;
    ensureSpace(ctx, 14);
    ctx.page.drawText(
      "Discounts above are only valid for deposit/full payment within 30 days.",
      { x: MARGIN_L, y: ctx.y, size: 7, font: italicFont, color: GRAY }
    );
    ctx.y -= 16;

    // Grand total
    const totalAfterDiscount = discount ? grandTotal - discount : grandTotal;
    ensureSpace(ctx, 24);
    drawHLine(ctx.page, MARGIN_L, ctx.y + 8, CONTENT_W);
    ctx.page.drawText(
      "TOTAL (incl discount for our fees, excl 3rd party fees):",
      { x: MARGIN_L, y: ctx.y, size: 9, font: boldFont, color: DARK }
    );
    const totalStr = fmtR(totalAfterDiscount);
    const totalW = boldFont.widthOfTextAtSize(totalStr, 13);
    ctx.page.drawText(totalStr, {
      x: tableRight - totalW - 4,
      y: ctx.y - 2,
      size: 13,
      font: boldFont,
      color: GREEN,
    });
    ctx.y -= 20;

    // 3rd party fees note
    ensureSpace(ctx, 14);
    ctx.page.drawText(
      "Please note that any third party fees are approximate and subject to change from the provider.",
      { x: MARGIN_L, y: ctx.y, size: 7, font: italicFont, color: GRAY }
    );
    ctx.y -= 10;
    ctx.page.drawText(
      "For the discount we will request that you review our practice on Google.",
      { x: MARGIN_L, y: ctx.y, size: 7, font: italicFont, color: GRAY }
    );
    ctx.y -= 20;

    // ================================================================
    // PAGE 2: Consent + Payment + Banking
    // ================================================================
    newPage(ctx);

    // Practice header again
    drawCenteredText(ctx, settings.name || "Dr Sheryl Smithies BChD (PRET)", {
      size: 14,
      font: boldFont,
      color: GREEN,
    });
    ctx.y -= 20;

    // Consent
    ctx.page.drawText("Consent", {
      x: MARGIN_L,
      y: ctx.y,
      size: 11,
      font: boldFont,
      color: GREEN,
    });
    ctx.y -= 16;

    drawWrappedText(
      ctx,
      `I, _________________________________________________ ("the patient") hereby accept the proposed dental treatment recommended by ${settings.name || "the dentist"} in the amount of R________________. I accept this treatment on the conditions as set out below:`,
      { size: 9, font, color: DARK }
    );
    ctx.y -= 10;

    drawWrappedText(
      ctx,
      "I acknowledge that the dentist may be required to alter or add treatment during the course of the planned treatment and I hereby consent to these changes in advance. I understand that the quoted fees may differ depending on the changes made. I understand that prices are inclusive of 15% VAT.",
      { size: 9, font, color: DARK }
    );
    ctx.y -= 20;

    // Payment options
    ctx.page.drawText("Payment Options", {
      x: MARGIN_L,
      y: ctx.y,
      size: 11,
      font: boldFont,
      color: GREEN,
    });
    ctx.y -= 16;

    drawWrappedText(
      ctx,
      "Payment Option 1 = full payment on acceptance of estimate. 5% discount on our fees (not applicable to 3rd party fees).",
      { size: 9, font, color: DARK }
    );
    ctx.y -= 6;
    drawWrappedText(
      ctx,
      "Payment Option 2 = pay 50% deposit on acceptance of estimate and the balance before the last appointment.",
      { size: 9, font, color: DARK }
    );
    ctx.y -= 24;

    // Banking details
    ctx.page.drawText("Banking Details for EFT payments:", {
      x: MARGIN_L,
      y: ctx.y,
      size: 10,
      font: boldFont,
      color: DARK,
    });
    ctx.y -= 16;

    const bankDetails = [
      ["Bank", "FNB"],
      ["Branch code", "255655"],
      ["Acc Name", "The Smile Emporium INC"],
      ["Acc no", "62695604176"],
      ["Ref", "Your name and surname."],
      ["SWIFT", "FIRNZAJJ"],
    ];
    for (const [label, value] of bankDetails) {
      ctx.page.drawText(label, {
        x: MARGIN_L + 10,
        y: ctx.y,
        size: 9,
        font,
        color: DARK,
      });
      ctx.page.drawText(value, {
        x: MARGIN_L + 110,
        y: ctx.y,
        size: 9,
        font,
        color: DARK,
      });
      ctx.y -= 14;
    }
    ctx.y -= 24;

    // Signature line
    ctx.page.drawText("Signed: _________________________________", {
      x: MARGIN_L,
      y: ctx.y,
      size: 9,
      font,
      color: DARK,
    });
    ctx.page.drawText("Name: _________________________________", {
      x: MARGIN_L + 280,
      y: ctx.y,
      size: 9,
      font,
      color: DARK,
    });
    ctx.y -= 24;

    ctx.page.drawText("Date: _________________________________", {
      x: MARGIN_L,
      y: ctx.y,
      size: 9,
      font,
      color: DARK,
    });
    ctx.y -= 32;

    // Kind regards
    ctx.page.drawText("Kind Regards,", {
      x: MARGIN_L,
      y: ctx.y,
      size: 9,
      font,
      color: DARK,
    });
    ctx.y -= 16;
    ctx.page.drawText(settings.name || "Dr Sheryl Smithies", {
      x: MARGIN_L,
      y: ctx.y,
      size: 10,
      font: boldFont,
      color: DARK,
    });

    // ================================================================
    // PAGE 3+: Terms & Conditions
    // ================================================================
    newPage(ctx);

    drawCenteredText(ctx, settings.name || "Dr Sheryl Smithies BChD (PRET)", {
      size: 14,
      font: boldFont,
      color: GREEN,
    });
    ctx.y -= 20;

    // Treatment-specific T&Cs
    const treatmentTCs = new Map<string, string>();
    for (const st of selectedTreatments) {
      if (st.treatment.termsAndConditions) {
        treatmentTCs.set(st.treatment.name, st.treatment.termsAndConditions);
      }
    }

    if (treatmentTCs.size > 0) {
      ctx.page.drawText("Information about your treatment:", {
        x: MARGIN_L,
        y: ctx.y,
        size: 11,
        font: boldFont,
        color: GREEN,
      });
      ctx.y -= 20;

      for (const [name, tc] of treatmentTCs) {
        ensureSpace(ctx, 30);
        ctx.page.drawText(name, {
          x: MARGIN_L,
          y: ctx.y,
          size: 10,
          font: boldFont,
          color: DARK,
        });
        ctx.y -= 14;

        const lines = tc.split("\n").filter(Boolean);
        for (const line of lines) {
          ensureSpace(ctx, 14);
          drawWrappedText(ctx, line, {
            size: 8,
            font,
            color: DARK,
            indent: 10,
          });
          ctx.y -= 2;
        }
        ctx.y -= 10;
      }
    }

    // General T&Cs
    ensureSpace(ctx, 30);
    ctx.page.drawText("General", {
      x: MARGIN_L,
      y: ctx.y,
      size: 11,
      font: boldFont,
      color: GREEN,
    });
    ctx.y -= 16;

    const generalTCs = [
      "Prices include 15% VAT. No refunds will be entertained on treatment already delivered.",
      "This estimate does not include any fees that other specialists may charge for their services.",
      "Please note that any third party fees are just approximate costs and are subject to change from the third party provider.",
    ];
    for (const tc of generalTCs) {
      ensureSpace(ctx, 14);
      drawWrappedText(ctx, `\u2022 ${tc}`, { size: 8, font, color: DARK });
      ctx.y -= 6;
    }
    ctx.y -= 10;

    // Cancellations
    ensureSpace(ctx, 30);
    ctx.page.drawText("Cancellations", {
      x: MARGIN_L,
      y: ctx.y,
      size: 11,
      font: boldFont,
      color: GREEN,
    });
    ctx.y -= 16;

    drawWrappedText(
      ctx,
      "Appointments that are cancelled with less than 24 hours notice will be charged a cancellation fee at the discretion of the practice.",
      { size: 8, font, color: DARK }
    );

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

// ── Drawing Helpers ──────────────────────────────────────────

type DrawCtx = {
  doc: PDFDocument;
  font: PDFFont;
  boldFont: PDFFont;
  italicFont: PDFFont;
  page: PDFPage;
  y: number;
};

type TextOpts = {
  size: number;
  font: PDFFont;
  color: RGB;
  indent?: number;
};

function newPage(ctx: DrawCtx) {
  ctx.page = ctx.doc.addPage([PAGE_W, PAGE_H]);
  ctx.y = PAGE_H - 40;
}

function ensureSpace(ctx: DrawCtx, needed: number) {
  if (ctx.y - needed < MARGIN_BOTTOM) {
    newPage(ctx);
  }
}

function drawCenteredText(ctx: DrawCtx, text: string, opts: TextOpts) {
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

function drawWrappedText(ctx: DrawCtx, text: string, opts: TextOpts) {
  const indent = opts.indent || 0;
  const maxWidth = CONTENT_W - indent;
  const words = text.split(" ");
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

function drawHLine(page: PDFPage, x: number, y: number, width: number) {
  page.drawLine({
    start: { x, y },
    end: { x: x + width, y },
    thickness: 0.5,
    color: LIGHT_GRAY,
  });
}

type ColPositions = {
  code: number;
  desc: number;
  icd10: number;
  unitPrice: number;
  units: number;
  total: number;
};

type RowData = {
  code: string;
  desc: string;
  icd10: string;
  unitPrice: string;
  units: string;
  total: string;
};

function drawTableRow(ctx: DrawCtx, colX: ColPositions, data: RowData) {
  const sz = 8;
  const f = ctx.font;
  ctx.page.drawText(data.code, { x: colX.code + 4, y: ctx.y, size: sz, font: f, color: DARK });
  ctx.page.drawText(data.desc, { x: colX.desc + 4, y: ctx.y, size: sz, font: f, color: DARK });
  if (data.icd10) {
    ctx.page.drawText(data.icd10, { x: colX.icd10 + 4, y: ctx.y, size: 7, font: f, color: GRAY });
  }
  ctx.page.drawText(data.unitPrice, { x: colX.unitPrice + 4, y: ctx.y, size: sz, font: f, color: DARK });
  ctx.page.drawText(data.units, { x: colX.units + 4, y: ctx.y, size: sz, font: f, color: DARK });

  // Right-align total
  const tableRight = PAGE_W - MARGIN_R;
  const totalW = f.widthOfTextAtSize(data.total, sz);
  ctx.page.drawText(data.total, {
    x: tableRight - totalW - 4,
    y: ctx.y,
    size: sz,
    font: f,
    color: DARK,
  });

  ctx.y -= 14;
  drawHLine(ctx.page, colX.code, ctx.y + 4, CONTENT_W);
}

function fmtR(n: number): string {
  return `R ${n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function truncate(s: string, maxLen: number): string {
  return s.length > maxLen ? s.substring(0, maxLen - 1) + "\u2026" : s;
}

function slug(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "patient"
  );
}
