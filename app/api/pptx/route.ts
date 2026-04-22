import PptxGenJS from "pptxgenjs";
import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/firebase";
import type { Report, SelectedTreatment } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  patientName: string;
  date: string;
  mainComplaint: string;
  report: Report;
  selectedTreatments: SelectedTreatment[];
  // Images as base64 data URLs
  extraOralPhotos?: string[];   // face/smile photos
  intraOralPhotos?: string[];   // inside mouth photos
  xrayImages?: string[];        // x-rays
  practice: {
    name: string;
    phone: string;
    email: string;
    address: string;
  };
};

export async function POST(request: Request) {
  try {
    await verifyAuth(request);
    const body = (await request.json()) as Body;
    const {
      patientName,
      date,
      mainComplaint,
      report,
      selectedTreatments,
      extraOralPhotos = [],
      intraOralPhotos = [],
      xrayImages = [],
      practice,
    } = body;

    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 inches (16:9)
    pptx.author = practice.name || "Dental Practice";
    pptx.subject = `Treatment Plan - ${patientName}`;

    // Brand colors
    const BLUE = "0f62fe";
    const DARK = "1a1a1a";
    const GRAY = "666666";
    const WHITE = "FFFFFF";

    // ── Slide 1: Cover ──────────────────────────────────
    const slide1 = pptx.addSlide();
    slide1.background = { color: BLUE };
    slide1.addText("Treatment Plan\nDiscussion", {
      x: 0.8, y: 1.5, w: 11, h: 2,
      fontSize: 40, fontFace: "Helvetica", color: WHITE, bold: true,
      lineSpacingMultiple: 1.2,
    });
    slide1.addText(patientName, {
      x: 0.8, y: 4.0, w: 8, h: 0.8,
      fontSize: 24, fontFace: "Helvetica", color: WHITE, bold: false,
    });
    slide1.addText(date, {
      x: 0.8, y: 4.8, w: 8, h: 0.5,
      fontSize: 16, fontFace: "Helvetica", color: "ffffffaa",
    });
    slide1.addText(practice.name || "Dental Practice", {
      x: 0.8, y: 6.2, w: 8, h: 0.5,
      fontSize: 14, fontFace: "Helvetica", color: "ffffffcc",
    });

    // ── Slide 2: Patient Information ─────────────────────
    const slide2 = pptx.addSlide();
    addHeader(slide2, "Patient Information", practice.name);
    slide2.addText([
      { text: "Patient Name\n", options: { fontSize: 11, color: GRAY, bold: true } },
      { text: patientName + "\n\n", options: { fontSize: 18, color: DARK, bold: true } },
      { text: "Main Complaint\n", options: { fontSize: 11, color: GRAY, bold: true } },
      { text: mainComplaint || report.patientSummary || "—", options: { fontSize: 14, color: DARK } },
    ], { x: 0.8, y: 1.8, w: 5.5, h: 4.5, valign: "top" });

    // ── Slide 3: Extra Oral Photos ──────────────────────
    if (extraOralPhotos.length > 0) {
      const slide3 = pptx.addSlide();
      addHeader(slide3, "Extra Oral Images", practice.name);
      addPhotoGrid(slide3, extraOralPhotos, 7);
    }

    // ── Slide 4: Intra Oral Photos ──────────────────────
    if (intraOralPhotos.length > 0) {
      const slide4 = pptx.addSlide();
      addHeader(slide4, "Intra Oral Images", practice.name);
      addPhotoGrid(slide4, intraOralPhotos, 7);
    }

    // ── Slide 5: X-rays ─────────────────────────────────
    if (xrayImages.length > 0) {
      const slide5 = pptx.addSlide();
      addHeader(slide5, "Radiographs", practice.name);
      addPhotoGrid(slide5, xrayImages, 4);
    }

    // ── Slide 6: Clinical Findings ──────────────────────
    const slide6 = pptx.addSlide();
    addHeader(slide6, "Clinical Findings", practice.name);

    // Findings table
    const findingsRows: PptxGenJS.TableRow[] = [
      [
        { text: "Tooth", options: { bold: true, color: WHITE, fill: { color: BLUE }, fontSize: 11 } },
        { text: "Observation", options: { bold: true, color: WHITE, fill: { color: BLUE }, fontSize: 11 } },
        { text: "Severity", options: { bold: true, color: WHITE, fill: { color: BLUE }, fontSize: 11 } },
      ],
    ];
    for (const f of report.findings) {
      const sevColor = f.severity === "urgent" ? "da1e28" : f.severity === "monitor" ? "d2a106" : "198038";
      findingsRows.push([
        { text: f.tooth, options: { fontSize: 10 } },
        { text: f.observation, options: { fontSize: 10 } },
        { text: f.severity.toUpperCase(), options: { fontSize: 10, bold: f.severity === "urgent", color: sevColor } },
      ]);
    }
    slide6.addTable(findingsRows, {
      x: 0.8, y: 1.8, w: 11.7,
      colW: [1.5, 8, 2.2],
      border: { type: "solid", pt: 0.5, color: "dddddd" },
      rowH: 0.35,
      autoPage: true,
    });

    // ── Slide 7: Recommendations ────────────────────────
    const slide7 = pptx.addSlide();
    addHeader(slide7, "Recommendations", practice.name);
    const recText = report.recommendations
      .map((r, i) => `${i + 1}. ${r}`)
      .join("\n\n");
    slide7.addText(recText || "No specific recommendations.", {
      x: 0.8, y: 1.8, w: 11.7, h: 4.5,
      fontSize: 14, fontFace: "Helvetica", color: DARK,
      valign: "top", lineSpacingMultiple: 1.3,
    });

    // ── Slide 8: Treatment Options ──────────────────────
    const slide8 = pptx.addSlide();
    addHeader(slide8, "Proposed Treatment Plan", practice.name);

    // Group treatments by category
    const grouped = new Map<string, SelectedTreatment[]>();
    for (const st of selectedTreatments) {
      const cat = st.treatment.category;
      if (!grouped.has(cat)) grouped.set(cat, []);
      grouped.get(cat)!.push(st);
    }

    let yPos = 1.8;
    for (const [category, treatments] of grouped) {
      slide8.addText(category.charAt(0).toUpperCase() + category.slice(1), {
        x: 0.8, y: yPos, w: 11.7, h: 0.4,
        fontSize: 13, fontFace: "Helvetica", color: BLUE, bold: true,
      });
      yPos += 0.4;

      for (const st of treatments) {
        const codesText = st.selectedCodes
          .map((c) => `${c.code} — ${c.description} (x${c.quantity})`)
          .join("\n");
        slide8.addText(codesText, {
          x: 1.0, y: yPos, w: 11.5, h: 0.3 * st.selectedCodes.length,
          fontSize: 10, fontFace: "Helvetica", color: DARK,
          valign: "top",
        });
        yPos += 0.3 * st.selectedCodes.length + 0.1;
      }
      yPos += 0.15;
    }

    // ── Slide 9: Follow-up ──────────────────────────────
    const slide9 = pptx.addSlide();
    addHeader(slide9, "Follow-up Plan", practice.name);
    slide9.addText(report.followUp || "To be discussed.", {
      x: 0.8, y: 1.8, w: 11.7, h: 2,
      fontSize: 16, fontFace: "Helvetica", color: DARK,
      valign: "top", lineSpacingMultiple: 1.4,
    });
    slide9.addText("Following the next visit, a final treatment plan and quote will be generated.", {
      x: 0.8, y: 4.5, w: 11.7, h: 0.5,
      fontSize: 12, fontFace: "Helvetica", color: GRAY, italic: true,
    });

    // ── Slide 10: Thank You / Contact ───────────────────
    const slide10 = pptx.addSlide();
    slide10.background = { color: BLUE };
    slide10.addText("Thank You", {
      x: 0.8, y: 1.5, w: 11, h: 1.5,
      fontSize: 40, fontFace: "Helvetica", color: WHITE, bold: true,
    });
    const contactLines = [
      practice.phone ? `T: ${practice.phone}` : "",
      practice.email ? `E: ${practice.email}` : "",
      practice.address || "",
    ].filter(Boolean).join("\n");
    slide10.addText(contactLines, {
      x: 0.8, y: 3.5, w: 8, h: 2,
      fontSize: 14, fontFace: "Helvetica", color: "ffffffcc",
      lineSpacingMultiple: 1.5,
    });
    slide10.addText(practice.name || "Dental Practice", {
      x: 0.8, y: 6.0, w: 8, h: 0.5,
      fontSize: 16, fontFace: "Helvetica", color: WHITE, bold: true,
    });

    // Generate buffer
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

// ── Helpers ──────────────────────────────────────────────────

function addHeader(slide: PptxGenJS.Slide, title: string, practiceName: string) {
  // Blue header bar
  slide.addShape("rect" as unknown as PptxGenJS.ShapeType, {
    x: 0, y: 0, w: 13.33, h: 1.3,
    fill: { color: "0f62fe" },
  });
  slide.addText(title, {
    x: 0.8, y: 0.3, w: 10, h: 0.7,
    fontSize: 24, fontFace: "Helvetica", color: "FFFFFF", bold: true,
  });
  slide.addText(practiceName, {
    x: 9, y: 0.35, w: 4, h: 0.6,
    fontSize: 10, fontFace: "Helvetica", color: "ffffffaa",
    align: "right",
  });
}

function addPhotoGrid(slide: PptxGenJS.Slide, images: string[], maxImages: number) {
  const photos = images.slice(0, maxImages);
  const cols = photos.length <= 2 ? 2 : photos.length <= 4 ? 2 : 4;
  const rows = Math.ceil(photos.length / cols);
  const imgW = 11 / cols;
  const imgH = 5 / rows;

  photos.forEach((dataUrl, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = 0.8 + col * (imgW + 0.15);
    const y = 1.8 + row * (imgH + 0.15);

    slide.addImage({
      data: dataUrl,
      x, y,
      w: imgW - 0.15,
      h: imgH - 0.15,
      sizing: { type: "contain", w: imgW - 0.15, h: imgH - 0.15 },
    });
  });
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "patient";
}
