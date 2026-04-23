import PptxGenJS from "pptxgenjs";
import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/firebase";
import type { Report } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  patientName: string;
  date: string;
  mainComplaint: string;
  report: Report;
  selectedTreatments: { treatment: { name: string; category: string }; selectedCodes: { code: string; description: string; price: number; quantity: number }[] }[];
  extraOralPhotos?: string[];
  intraOralPhotos?: string[];
  xrayImages?: string[];
  practice: {
    name: string;
    phone: string;
    email: string;
    address: string;
    vatNumber?: string;
  };
};

// Colors matching the dentist's branding
const BRAND_GREEN = "579158";
const ACCENT_GREEN = "b0d9a9";
const DARK = "1a1a1a";
const GRAY = "666666";
const LIGHT_GRAY = "999999";
const WHITE = "FFFFFF";
const BG_LIGHT = "F5F5F0";

export async function POST(request: Request) {
  try {
    await verifyAuth(request);
    const body = (await request.json()) as Body;
    const {
      patientName,
      date,
      mainComplaint,
      report,
      selectedTreatments = [],
      extraOralPhotos = [],
      intraOralPhotos = [],
      xrayImages = [],
      practice,
    } = body;

    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    pptx.author = practice.name || "Dental Practice";
    pptx.subject = `Treatment Plan Discussion - ${patientName}`;

    // ══════════════════════════════════════════════════════
    // SLIDE 1: Cover / Title Page
    // ══════════════════════════════════════════════════════
    const slide1 = pptx.addSlide();
    slide1.background = { color: BRAND_GREEN };

    // Practice name + credentials
    slide1.addText(practice.name || "Dental Practice", {
      x: 0.8, y: 1.0, w: 11.5, h: 0.8,
      fontSize: 28, fontFace: "Helvetica", color: WHITE, bold: true,
    });

    // Title
    slide1.addText("Treatment Plan\nDiscussion", {
      x: 0.8, y: 2.2, w: 11.5, h: 2.0,
      fontSize: 44, fontFace: "Helvetica", color: ACCENT_GREEN, bold: true,
      lineSpacingMultiple: 1.1,
    });

    // Patient name
    slide1.addText(patientName, {
      x: 0.8, y: 4.8, w: 8, h: 0.7,
      fontSize: 22, fontFace: "Helvetica", color: WHITE,
    });

    // Date
    slide1.addText(date, {
      x: 0.8, y: 5.5, w: 8, h: 0.5,
      fontSize: 14, fontFace: "Helvetica", color: LIGHT_GRAY,
    });

    // Contact line at bottom
    slide1.addText(
      [practice.phone, practice.email].filter(Boolean).join("  |  "),
      {
        x: 0.8, y: 6.5, w: 11.5, h: 0.4,
        fontSize: 10, fontFace: "Helvetica", color: LIGHT_GRAY,
      }
    );

    // ══════════════════════════════════════════════════════
    // SLIDE 2: Patient Information
    // ══════════════════════════════════════════════════════
    const slide2 = pptx.addSlide();
    addSlideHeader(slide2, "Patient Information", practice.name);

    // Left column: patient details
    slide2.addText([
      { text: "Patient\n", options: { fontSize: 10, color: LIGHT_GRAY, bold: true } },
      { text: patientName + "\n\n", options: { fontSize: 20, color: DARK, bold: true } },
      { text: "Date\n", options: { fontSize: 10, color: LIGHT_GRAY, bold: true } },
      { text: date + "\n\n", options: { fontSize: 14, color: DARK } },
      { text: "Main Complaint\n", options: { fontSize: 10, color: LIGHT_GRAY, bold: true } },
      { text: mainComplaint || report.patientSummary || "—", options: { fontSize: 13, color: DARK } },
    ], { x: 5.5, y: 1.8, w: 6.5, h: 5, valign: "top" });

    // ══════════════════════════════════════════════════════
    // SLIDE 3: Extra Oral Images
    // ══════════════════════════════════════════════════════
    if (extraOralPhotos.length > 0) {
      const slide3 = pptx.addSlide();
      addSlideHeader(slide3, "Extra Oral Images", practice.name);
      addPhotoGrid(slide3, extraOralPhotos, 7);
    }

    // ══════════════════════════════════════════════════════
    // SLIDE 4: Intra Oral Images
    // ══════════════════════════════════════════════════════
    if (intraOralPhotos.length > 0) {
      const slide4 = pptx.addSlide();
      addSlideHeader(slide4, "Intra Oral Images", practice.name);
      addPhotoGrid(slide4, intraOralPhotos, 7);
    }

    // ══════════════════════════════════════════════════════
    // SLIDE 5-6: Radiographs (split across 2 slides if >3)
    // ══════════════════════════════════════════════════════
    if (xrayImages.length > 0) {
      const firstBatch = xrayImages.slice(0, 3);
      const secondBatch = xrayImages.slice(3);

      const slide5 = pptx.addSlide();
      addSlideHeader(slide5, "Radiographs", practice.name);
      addPhotoGrid(slide5, firstBatch, 3);

      if (secondBatch.length > 0) {
        const slide6 = pptx.addSlide();
        addSlideHeader(slide6, "Radiographs (continued)", practice.name);
        addPhotoGrid(slide6, secondBatch, 4);
      }
    }

    // ══════════════════════════════════════════════════════
    // SLIDE 7: Clinical Findings
    // ══════════════════════════════════════════════════════
    if (report.findings.length > 0) {
      const slideFindings = pptx.addSlide();
      addSlideHeader(slideFindings, "Clinical Findings", practice.name);

      const rows: PptxGenJS.TableRow[] = [
        [
          { text: "Tooth", options: { bold: true, color: WHITE, fill: { color: BRAND_GREEN }, fontSize: 10, align: "center" } },
          { text: "Observation", options: { bold: true, color: WHITE, fill: { color: BRAND_GREEN }, fontSize: 10 } },
          { text: "Severity", options: { bold: true, color: WHITE, fill: { color: BRAND_GREEN }, fontSize: 10, align: "center" } },
        ],
      ];

      for (const f of report.findings) {
        const sevColor = f.severity === "urgent" ? "da1e28" : f.severity === "monitor" ? "d2a106" : "198038";
        rows.push([
          { text: f.tooth, options: { fontSize: 10, align: "center" } },
          { text: f.observation, options: { fontSize: 10 } },
          { text: f.severity.toUpperCase(), options: { fontSize: 9, bold: f.severity === "urgent", color: sevColor, align: "center" } },
        ]);
      }

      slideFindings.addTable(rows, {
        x: 0.8, y: 1.8, w: 11.7,
        colW: [1.2, 8.5, 2],
        border: { type: "solid", pt: 0.5, color: "dddddd" },
        rowH: 0.35,
      });
    }

    // ══════════════════════════════════════════════════════
    // SLIDE 8: Recommendations
    // ══════════════════════════════════════════════════════
    if (report.recommendations.length > 0) {
      const slideRec = pptx.addSlide();
      addSlideHeader(slideRec, "Recommendations", practice.name);

      const recText = report.recommendations
        .map((r, i) => `${i + 1}.  ${r}`)
        .join("\n\n");

      slideRec.addText(recText, {
        x: 0.8, y: 1.8, w: 11.7, h: 5,
        fontSize: 13, fontFace: "Helvetica", color: DARK,
        valign: "top", lineSpacingMultiple: 1.4,
      });
    }

    // ══════════════════════════════════════════════════════
    // SLIDE 9: Treatment Options (matches template slide 11)
    // ══════════════════════════════════════════════════════
    const slideTx = pptx.addSlide();
    addSlideHeader(slideTx, "What are the next steps?", practice.name);

    // Left side: Treatment Options
    slideTx.addText("Treatment Options", {
      x: 0.8, y: 1.8, w: 5.5, h: 0.4,
      fontSize: 14, fontFace: "Helvetica", color: BRAND_GREEN, bold: true,
    });

    if (selectedTreatments.length > 0) {
      const txLines = selectedTreatments.map((st, i) => {
        const codes = st.selectedCodes
          .map((c) => `${c.description} (x${c.quantity})`)
          .join(", ");
        return `Option ${i + 1}: ${st.treatment.name}\n${codes}`;
      });
      slideTx.addText(txLines.join("\n\n"), {
        x: 0.8, y: 2.4, w: 5.5, h: 4,
        fontSize: 11, fontFace: "Helvetica", color: DARK,
        valign: "top", lineSpacingMultiple: 1.3,
      });
    } else {
      slideTx.addText("To be discussed at next visit.", {
        x: 0.8, y: 2.4, w: 5.5, h: 1,
        fontSize: 12, fontFace: "Helvetica", color: GRAY, italic: true,
      });
    }

    // Right side: Estimated Time Frames
    slideTx.addText("Estimated Time Frames", {
      x: 7.0, y: 1.8, w: 5.5, h: 0.4,
      fontSize: 14, fontFace: "Helvetica", color: BRAND_GREEN, bold: true,
    });

    slideTx.addText(report.followUp || "To be confirmed.", {
      x: 7.0, y: 2.4, w: 5.5, h: 3,
      fontSize: 12, fontFace: "Helvetica", color: DARK,
      valign: "top", lineSpacingMultiple: 1.3,
    });

    // Footer note
    slideTx.addText(
      "Following the next visit a final treatment plan and quote will be generated.",
      {
        x: 0.8, y: 6.3, w: 11.7, h: 0.4,
        fontSize: 10, fontFace: "Helvetica", color: LIGHT_GRAY, italic: true,
      }
    );

    // ══════════════════════════════════════════════════════
    // SLIDE 10: Thank You / Contact Details
    // ══════════════════════════════════════════════════════
    const slideThanks = pptx.addSlide();
    slideThanks.background = { color: BRAND_GREEN };

    slideThanks.addText("Thank You", {
      x: 0.8, y: 1.2, w: 11.5, h: 1.2,
      fontSize: 44, fontFace: "Helvetica", color: ACCENT_GREEN, bold: true,
    });

    // Contact details
    slideThanks.addText("Contact Details", {
      x: 0.8, y: 3.0, w: 5, h: 0.4,
      fontSize: 14, fontFace: "Helvetica", color: WHITE, bold: true,
    });

    const contactText = [
      practice.phone ? `T: ${practice.phone}` : "",
      practice.email ? `E: ${practice.email}` : "",
      practice.address || "",
    ].filter(Boolean).join("\n");

    slideThanks.addText(contactText, {
      x: 0.8, y: 3.5, w: 5, h: 2,
      fontSize: 12, fontFace: "Helvetica", color: "ffffffcc",
      lineSpacingMultiple: 1.6,
    });

    // Practice name
    slideThanks.addText(practice.name || "Dental Practice", {
      x: 0.8, y: 6.2, w: 11.5, h: 0.5,
      fontSize: 14, fontFace: "Helvetica", color: WHITE, bold: true,
    });

    // ── Generate ────────────────────────────────────────────
    const buffer = await pptx.write({ outputType: "nodebuffer" });
    const filename = `treatment-plan-${slug(patientName)}-${date}.pptx`;

    return new Response(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("[pptx] error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

// ── Helper: Slide header bar ───────────────────────────────

function addSlideHeader(slide: PptxGenJS.Slide, title: string, practiceName: string) {
  // Dark green header bar
  slide.addShape("rect" as unknown as PptxGenJS.ShapeType, {
    x: 0, y: 0, w: 13.33, h: 1.3,
    fill: { color: BRAND_GREEN },
  });
  // Gold accent line under header
  slide.addShape("rect" as unknown as PptxGenJS.ShapeType, {
    x: 0, y: 1.3, w: 13.33, h: 0.04,
    fill: { color: ACCENT_GREEN },
  });
  slide.addText(title, {
    x: 0.8, y: 0.3, w: 9, h: 0.7,
    fontSize: 22, fontFace: "Helvetica", color: WHITE, bold: true,
  });
  slide.addText(practiceName, {
    x: 9, y: 0.35, w: 3.8, h: 0.6,
    fontSize: 9, fontFace: "Helvetica", color: LIGHT_GRAY,
    align: "right",
  });
}

// ── Helper: Photo grid ─────────────────────────────────────

function addPhotoGrid(slide: PptxGenJS.Slide, images: string[], maxImages: number) {
  const photos = images.slice(0, maxImages);

  // Layout: for 1-2 photos side by side, 3 = 1 top + 2 bottom, 4 = 2x2, 5-7 = top row + bottom row
  let cols: number;
  let rowsCount: number;

  if (photos.length <= 2) {
    cols = photos.length;
    rowsCount = 1;
  } else if (photos.length <= 4) {
    cols = 2;
    rowsCount = Math.ceil(photos.length / 2);
  } else {
    // 5-7 photos: 4 top, rest bottom (or 3+3+1 etc)
    cols = 4;
    rowsCount = Math.ceil(photos.length / 4);
  }

  const totalW = 11.5;
  const totalH = 5.2;
  const gap = 0.12;
  const imgW = (totalW - gap * (cols - 1)) / cols;
  const imgH = (totalH - gap * (rowsCount - 1)) / rowsCount;

  photos.forEach((dataUrl, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = 0.8 + col * (imgW + gap);
    const y = 1.6 + row * (imgH + gap);

    slide.addImage({
      data: dataUrl,
      x, y,
      w: imgW,
      h: imgH,
      sizing: { type: "contain", w: imgW, h: imgH },
    });
  });
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "patient";
}
