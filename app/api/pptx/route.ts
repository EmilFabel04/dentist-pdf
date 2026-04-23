import JSZip from "jszip";
import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/firebase";
import { getTemplateBuffer } from "@/lib/templates";
import type { Report } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  patientName: string;
  date: string;
  mainComplaint: string;
  report: Report;
  selectedTreatments: {
    treatment: { name: string; category: string };
    selectedCodes: {
      code: string;
      description: string;
      price: number;
      quantity: number;
    }[];
  }[];
  extraOralPhotos?: string[]; // base64 data URLs
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
    } = body;

    // Load template
    const templateBuffer = await getTemplateBuffer(
      "templates/report-template.pptx"
    );
    const zip = await JSZip.loadAsync(templateBuffer);

    // ── Slide 1: Replace "Patient Name" ──────────────────
    await replaceSlideText(zip, 1, {
      "Patient Name": patientName,
    });

    // ── Slide 2: Replace patient info ────────────────────
    // "Patient Name:" is the label (kept), "Patient Name" is the value (replaced)
    // "SEE MAIN COMPLAINT ON PATIENT NOTES" → actual complaint
    await replaceSlideText(zip, 2, {
      "SEE MAIN COMPLAINT ON PATIENT NOTES":
        mainComplaint || report.patientSummary || "\u2014",
    });
    // Replace the standalone "Patient Name" value (not the "Patient Name:" label)
    const slide2Xml = await zip.file("ppt/slides/slide2.xml")!.async("string");
    const updatedSlide2 = slide2Xml.replace(
      />Patient Name</,
      `>${escapeXml(patientName)}<`
    );
    zip.file("ppt/slides/slide2.xml", updatedSlide2);

    // ── Slide 3: Replace extra oral photos ───────────────
    // Template images: image6.jpeg through image11.jpeg
    const extraOralMap: Record<string, number> = {
      "image6.jpeg": 0,
      "image7.jpeg": 1,
      "image8.jpeg": 2,
      "image9.jpeg": 3,
      "image10.jpeg": 4,
      "image11.jpeg": 5,
    };
    for (const [filename, index] of Object.entries(extraOralMap)) {
      if (index < extraOralPhotos.length) {
        const imageData = dataUrlToBuffer(extraOralPhotos[index]);
        if (imageData) {
          zip.file(`ppt/media/${filename}`, imageData);
        }
      }
    }

    // ── Slide 4: Replace intra oral photos ───────────────
    const intraOralMap: Record<string, number> = {
      "image12.jpeg": 0,
      "image13.jpeg": 1,
      "image14.jpeg": 2,
      "image15.jpeg": 3,
      "image16.jpeg": 4,
      "image17.jpeg": 5,
    };
    for (const [filename, index] of Object.entries(intraOralMap)) {
      if (index < intraOralPhotos.length) {
        const imageData = dataUrlToBuffer(intraOralPhotos[index]);
        if (imageData) {
          zip.file(`ppt/media/${filename}`, imageData);
        }
      }
    }

    // ── Slides 5-6: Replace X-rays ───────────────────────
    const xrayMap: Record<string, number> = {
      "image18.jpg": 0,
      "image19.jpg": 1,
      "image20.jpg": 2,
      "image21.jpg": 3,
      "image22.jpg": 4,
    };
    for (const [filename, index] of Object.entries(xrayMap)) {
      if (index < xrayImages.length) {
        const imageData = dataUrlToBuffer(xrayImages[index]);
        if (imageData) {
          zip.file(`ppt/media/${filename}`, imageData);
        }
      }
    }

    // ── Slide 11: Replace treatment options ──────────────
    const options = selectedTreatments.slice(0, 3);
    const optionTexts: Record<string, string> = {};

    if (options.length > 0) {
      const opt1 = options[0];
      optionTexts["Treatment option 1"] = `${opt1.treatment.name}: ${opt1.selectedCodes.map((c) => c.description).join(", ")}`;
    }
    if (options.length > 1) {
      const opt2 = options[1];
      optionTexts["Treatment Option 2"] = `${opt2.treatment.name}: ${opt2.selectedCodes.map((c) => c.description).join(", ")}`;
    }
    if (options.length > 2) {
      const opt3 = options[2];
      optionTexts["Treatment Option 3"] = `${opt3.treatment.name}: ${opt3.selectedCodes.map((c) => c.description).join(", ")}`;
    }

    // Replace time frames and treatment option texts
    const slide11Xml = await zip
      .file("ppt/slides/slide11.xml")!
      .async("string");
    let updatedSlide11 = slide11Xml;

    // Replace the "Time" placeholders (there are three)
    let timeCount = 0;
    const followUpText = report.followUp || "To be confirmed";
    updatedSlide11 = updatedSlide11.replace(/>Time</g, () => {
      timeCount++;
      if (timeCount === 1) return `>${escapeXml(followUpText)}<`;
      return `>\u2014<`;
    });

    // Replace treatment option texts
    for (const [find, replace] of Object.entries(optionTexts)) {
      updatedSlide11 = updatedSlide11.replace(
        new RegExp(`>${escapeRegex(find)}<`, "g"),
        `>${escapeXml(replace)}<`
      );
    }

    zip.file("ppt/slides/slide11.xml", updatedSlide11);

    // ── Generate output ─────────────────────────────────
    const buffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    const filename = `treatment-plan-${slug(patientName)}-${date}.pptx`;

    return new Response(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("[pptx] error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

// ── Helpers ──────────────────────────────────────────────────

async function replaceSlideText(
  zip: JSZip,
  slideNumber: number,
  replacements: Record<string, string>
) {
  const path = `ppt/slides/slide${slideNumber}.xml`;
  const file = zip.file(path);
  if (!file) return;

  let xml = await file.async("string");
  for (const [find, replace] of Object.entries(replacements)) {
    // Replace text content within <a:t> tags
    xml = xml.replace(
      new RegExp(`>${escapeRegex(find)}<`, "g"),
      `>${escapeXml(replace)}<`
    );
  }
  zip.file(path, xml);
}

function dataUrlToBuffer(dataUrl: string): Buffer | null {
  const match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
  if (!match) return null;
  return Buffer.from(match[1], "base64");
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function slug(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "patient"
  );
}
