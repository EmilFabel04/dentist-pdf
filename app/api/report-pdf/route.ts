import {
  PDFDocument,
  StandardFonts,
  rgb,
  PDFPage,
  PDFFont,
  RGB,
  PDFImage,
} from "pdf-lib";
import { verifyAuth } from "@/lib/firebase";
import type { Report } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  patientName: string;
  date: string;
  report: Report;
  extraOralPhotos?: string[]; // base64 data URLs
  intraOralPhotos?: string[];
  xrayImages?: string[];
  beforePhotos?: string[];
  afterPhotos?: string[];
  practice: {
    name: string;
    phone: string;
    email: string;
    address: string;
    vatNumber?: string;
  };
};

// ── Colors ──────────────────────────────────────────────────
const GREEN: RGB = rgb(0.34, 0.57, 0.34);
const DARK: RGB = rgb(0.1, 0.1, 0.1);
const GRAY: RGB = rgb(0.4, 0.4, 0.4);
const LIGHT_GRAY: RGB = rgb(0.85, 0.85, 0.85);
const LIGHT_GREEN: RGB = rgb(0.91, 0.96, 0.91);
const WHITE: RGB = rgb(1, 1, 1);
const RED: RGB = rgb(0.8, 0.15, 0.15);
const ORANGE: RGB = rgb(0.85, 0.55, 0.1);
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
      report,
      extraOralPhotos = [],
      intraOralPhotos = [],
      xrayImages = [],
      beforePhotos = [],
      afterPhotos = [],
      practice,
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
    // PAGE 1: Header + Patient Summary + Findings + Recommendations
    // ================================================================

    drawReportPage1(ctx, { patientName, date, report, practice });

    // ================================================================
    // PHOTO PAGES (if any photos provided)
    // ================================================================

    if (extraOralPhotos.length > 0) {
      await drawPhotoSection(ctx, doc, "Extra Oral Images", extraOralPhotos);
    }

    if (intraOralPhotos.length > 0) {
      await drawPhotoSection(ctx, doc, "Intra Oral Images", intraOralPhotos);
    }

    if (xrayImages.length > 0) {
      await drawPhotoSection(ctx, doc, "Radiographs", xrayImages);
    }

    if (beforePhotos.length > 0) {
      await drawPhotoSection(ctx, doc, "Before Treatment", beforePhotos);
    }

    if (afterPhotos.length > 0) {
      await drawPhotoSection(ctx, doc, "After Treatment", afterPhotos);
    }

    // ── Save and return ──
    const pdfBytes = await doc.save();
    const filename = `report-${slug(patientName)}-${date}.pdf`;

    return new Response(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("[report-pdf] error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// ================================================================
// PAGE 1: Practice Header + Patient Info + Report Content
// ================================================================

function drawReportPage1(
  ctx: DrawCtx,
  opts: {
    patientName: string;
    date: string;
    report: Report;
    practice: Body["practice"];
  }
) {
  const { patientName, date, report, practice } = opts;
  const { font, boldFont, italicFont } = ctx;

  ctx.y -= 10;

  // ── Practice header (centered, green branding) ──
  drawCenteredText(ctx, practice.name || "Dental Practice", {
    size: 14,
    font: boldFont,
    color: GREEN,
  });
  ctx.y -= 2;

  if (practice.phone) {
    drawCenteredText(ctx, `T: ${practice.phone}`, {
      size: 8,
      font,
      color: GRAY,
    });
  }

  if (practice.vatNumber) {
    drawCenteredText(ctx, `Practice Number: ${practice.vatNumber}`, {
      size: 8,
      font,
      color: GRAY,
    });
  }

  if (practice.email) {
    drawCenteredText(ctx, `E: ${practice.email}`, {
      size: 8,
      font,
      color: GRAY,
    });
  }

  ctx.y -= 6;

  // ── Divider line ──
  drawHLine(ctx.page, MARGIN_L, ctx.y + 4, CONTENT_W, GREEN);
  ctx.y -= 10;

  // ── "Consultation Report" title ──
  drawCenteredText(ctx, "Consultation Report", {
    size: 16,
    font: boldFont,
    color: DARK,
  });
  ctx.y -= 6;

  // ── Patient name + date row ──
  ctx.page.drawText(`Patient: ${patientName}`, {
    x: MARGIN_L,
    y: ctx.y,
    size: 10,
    font: boldFont,
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
  ctx.y -= 20;

  // ── Patient Summary section ──
  drawSectionHeading(ctx, "Patient Summary");
  ctx.y -= 4;
  drawWrappedText(ctx, report.patientSummary || "No summary provided.", {
    size: 9,
    font,
    color: DARK,
  });
  ctx.y -= 12;

  // ── Clinical Findings table ──
  drawSectionHeading(ctx, "Clinical Findings");
  ctx.y -= 4;

  const findingsColWidths = [80, 300, 135];
  const findingsHeaders = ["Tooth", "Observation", "Severity"];
  const tableX = MARGIN_L;
  const findingsRowH = 16;

  // Header row
  drawTableHeaderRow(ctx, tableX, CONTENT_W, findingsRowH, findingsHeaders.map((h, i) => ({
    text: h,
    width: findingsColWidths[i],
  })));

  // Data rows
  for (const finding of report.findings) {
    // Calculate needed height based on observation text length
    const obsMaxW = findingsColWidths[1] - 8;
    const obsLines = wrapTextToLines(finding.observation, obsMaxW, font, 8);
    const rowH = Math.max(findingsRowH, obsLines.length * 11 + 6);

    ensureSpace(ctx, rowH);
    const rowY = ctx.y;

    // Row border
    ctx.page.drawRectangle({
      x: tableX,
      y: rowY - rowH + 4,
      width: CONTENT_W,
      height: rowH,
      borderColor: TABLE_BORDER,
      borderWidth: 0.5,
      color: WHITE,
    });

    // Vertical dividers
    let divX = tableX;
    for (let i = 0; i < findingsColWidths.length - 1; i++) {
      divX += findingsColWidths[i];
      drawVLine(ctx.page, divX, rowY + 4, rowH);
    }

    // Tooth
    ctx.page.drawText(finding.tooth, {
      x: tableX + 4,
      y: rowY - 10,
      size: 8,
      font: boldFont,
      color: DARK,
    });

    // Observation (wrapped)
    const obsX = tableX + findingsColWidths[0] + 4;
    let obsY = rowY - 10;
    for (const line of obsLines) {
      ctx.page.drawText(line, {
        x: obsX,
        y: obsY,
        size: 8,
        font,
        color: DARK,
      });
      obsY -= 11;
    }

    // Severity (colored)
    const sevColor = finding.severity === "urgent" ? RED : finding.severity === "monitor" ? ORANGE : GREEN;
    const sevLabel = finding.severity.charAt(0).toUpperCase() + finding.severity.slice(1);
    ctx.page.drawText(sevLabel, {
      x: tableX + findingsColWidths[0] + findingsColWidths[1] + 4,
      y: rowY - 10,
      size: 8,
      font: boldFont,
      color: sevColor,
    });

    ctx.y -= rowH;
  }

  // Bottom line of findings table
  drawHLine(ctx.page, tableX, ctx.y + 4, CONTENT_W, TABLE_BORDER);
  ctx.y -= 14;

  // ── Recommendations (numbered list) ──
  if (report.recommendations.length > 0) {
    drawSectionHeading(ctx, "Recommendations");
    ctx.y -= 4;

    for (let i = 0; i < report.recommendations.length; i++) {
      ensureSpace(ctx, 14);
      drawWrappedText(ctx, `${i + 1}. ${report.recommendations[i]}`, {
        size: 9,
        font,
        color: DARK,
      });
      ctx.y -= 3;
    }
    ctx.y -= 8;
  }

  // ── Follow-up section ──
  if (report.followUp) {
    drawSectionHeading(ctx, "Follow-up");
    ctx.y -= 4;
    drawWrappedText(ctx, report.followUp, {
      size: 9,
      font,
      color: DARK,
    });
    ctx.y -= 12;
  }
}

// ================================================================
// Photo Section: draws a titled photo grid on new page(s)
// ================================================================

async function drawPhotoSection(
  ctx: DrawCtx,
  doc: PDFDocument,
  title: string,
  dataUrls: string[]
) {
  // Start a new page for each photo section
  newPage(ctx);

  // Section title
  drawSectionHeading(ctx, title);
  ctx.y -= 8;

  // Grid settings: 2 columns, ~250px each, gap between them
  const colW = 250;
  const gap = 15;
  const col1X = MARGIN_L;
  const col2X = MARGIN_L + colW + gap;

  let colIdx = 0;
  let rowMaxH = 0;
  let rowY = ctx.y;

  for (const dataUrl of dataUrls) {
    const img = await embedImage(doc, dataUrl);
    if (!img) continue;

    // Calculate scaled dimensions to fit in column width
    const scale = colW / img.width;
    const drawW = colW;
    const drawH = img.height * scale;

    // Check if we need a new page
    const neededH = drawH + 10;
    if (rowY - neededH < MARGIN_BOTTOM) {
      newPage(ctx);
      rowY = ctx.y;
      colIdx = 0;
      rowMaxH = 0;
    }

    const x = colIdx === 0 ? col1X : col2X;
    const imgY = rowY - drawH;

    ctx.page.drawImage(img, {
      x,
      y: imgY,
      width: drawW,
      height: drawH,
    });

    rowMaxH = Math.max(rowMaxH, drawH);

    colIdx++;
    if (colIdx >= 2) {
      // Move to next row
      colIdx = 0;
      rowY -= rowMaxH + 10;
      rowMaxH = 0;
    }
  }

  // Update ctx.y after the grid
  if (colIdx > 0) {
    // Incomplete row - account for it
    rowY -= rowMaxH + 10;
  }
  ctx.y = rowY;
}

// ================================================================
// Image Embedding
// ================================================================

async function embedImage(
  doc: PDFDocument,
  dataUrl: string
): Promise<PDFImage | null> {
  const match = dataUrl.match(/^data:image\/(jpeg|jpg|png);base64,(.+)$/);
  if (!match) return null;
  const [, format, base64] = match;
  const buffer = Buffer.from(base64, "base64");
  try {
    if (format === "png") return await doc.embedPng(buffer);
    return await doc.embedJpg(buffer);
  } catch (e) {
    console.error("[report-pdf] failed to embed image:", e);
    return null;
  }
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

function drawSectionHeading(ctx: DrawCtx, text: string) {
  ensureSpace(ctx, 20);

  // Green left accent bar
  ctx.page.drawRectangle({
    x: MARGIN_L,
    y: ctx.y - 2,
    width: 3,
    height: 14,
    color: GREEN,
  });

  ctx.page.drawText(text, {
    x: MARGIN_L + 8,
    y: ctx.y,
    size: 11,
    font: ctx.boldFont,
    color: GREEN,
  });
  ctx.y -= 16;
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

function wrapTextToLines(
  text: string,
  maxWidth: number,
  font: PDFFont,
  size: number
): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
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
    color: LIGHT_GREEN,
    borderColor: TABLE_BORDER,
    borderWidth: 0.5,
  });

  // Column dividers and text
  let colX = x;
  for (const col of columns) {
    if (colX > x) {
      drawVLine(ctx.page, colX, rowY + 4, height);
    }

    ctx.page.drawText(col.text, {
      x: colX + 4,
      y: rowY - 9,
      size: 8,
      font: ctx.boldFont,
      color: DARK,
    });

    colX += col.width;
  }

  ctx.y -= height;
}

function slug(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "patient"
  );
}
