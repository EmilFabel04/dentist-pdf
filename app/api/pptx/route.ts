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
    // "SEE MAIN COMPLAINT ON PATIENT NOTES" -> actual complaint
    await replaceSlideText(zip, 2, {
      "SEE MAIN COMPLAINT ON PATIENT NOTES":
        mainComplaint || report.patientSummary || "\u2014",
    });

    // Replace the standalone "Patient Name" value (not the "Patient Name:" label)
    // We do this separately: find "Patient Name" that is NOT followed by ":"
    const slide2Path = "ppt/slides/slide2.xml";
    const slide2File = zip.file(slide2Path);
    if (slide2File) {
      let slide2Xml = await slide2File.async("string");
      slide2Xml = replaceStandalonePatientName(slide2Xml, patientName);
      zip.file(slide2Path, slide2Xml);
    }

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
    const slide11Replacements: Record<string, string> = {};

    if (options.length > 0) {
      const opt1 = options[0];
      slide11Replacements["Treatment option 1"] =
        `${opt1.treatment.name}: ${opt1.selectedCodes.map((c) => c.description).join(", ")}`;
    }
    if (options.length > 1) {
      const opt2 = options[1];
      slide11Replacements["Treatment Option 2"] =
        `${opt2.treatment.name}: ${opt2.selectedCodes.map((c) => c.description).join(", ")}`;
    }
    if (options.length > 2) {
      const opt3 = options[2];
      slide11Replacements["Treatment Option 3"] =
        `${opt3.treatment.name}: ${opt3.selectedCodes.map((c) => c.description).join(", ")}`;
    }

    // Replace "Time" placeholders on slide 11
    const followUpText = report.followUp || "To be confirmed";
    slide11Replacements["Time"] = followUpText;

    await replaceSlideText(zip, 11, slide11Replacements);

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

/**
 * Replace text in a slide's XML, handling text that may be split
 * across multiple <a:t> (run) elements by PowerPoint.
 */
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
    // Apply repeatedly until no more matches (handles multiple occurrences)
    let prev = "";
    while (prev !== xml) {
      prev = xml;
      xml = replaceTextInXml(xml, find, replace);
    }
  }
  zip.file(path, xml);
}

/**
 * Finds target text that may span multiple <a:t> elements and replaces it.
 * Puts the replacement text in the first affected run, empties the rest.
 */
function replaceTextInXml(
  xml: string,
  find: string,
  replace: string
): string {
  // Collect all <a:t>...</a:t> with their positions
  const textRegex = /<a:t>([^<]*)<\/a:t>/g;
  const segments: { start: number; end: number; text: string }[] = [];
  let m;
  while ((m = textRegex.exec(xml)) !== null) {
    segments.push({
      start: m.index,
      end: m.index + m[0].length,
      text: m[1],
    });
  }

  // Concatenate all text to find matches
  let fullText = "";
  const segMap: { segIdx: number; charStart: number; charEnd: number }[] = [];
  for (let i = 0; i < segments.length; i++) {
    const charStart = fullText.length;
    fullText += segments[i].text;
    segMap.push({ segIdx: i, charStart, charEnd: fullText.length });
  }

  const matchIdx = fullText.indexOf(find);
  if (matchIdx === -1) return xml;

  const matchEnd = matchIdx + find.length;

  // Find which segments overlap with the match
  const affectedSegs: number[] = [];
  for (const sm of segMap) {
    if (sm.charEnd > matchIdx && sm.charStart < matchEnd) {
      affectedSegs.push(sm.segIdx);
    }
  }

  if (affectedSegs.length === 0) return xml;

  // Replace: put the full replacement in the first affected segment,
  // empty the rest, preserving any text before/after the match in edge segments
  let result = xml;
  // Process in reverse order so positions don't shift
  for (let i = affectedSegs.length - 1; i >= 0; i--) {
    const segIdx = affectedSegs[i];
    const seg = segments[segIdx];
    const sm = segMap[segIdx];

    let newText: string;
    if (i === 0) {
      // First segment: include any text before the match + replacement + any text after
      const beforeMatch = seg.text.substring(
        0,
        Math.max(0, matchIdx - sm.charStart)
      );
      const afterMatch =
        i === affectedSegs.length - 1
          ? seg.text.substring(
              Math.min(seg.text.length, matchEnd - sm.charStart)
            )
          : "";
      newText = beforeMatch + escapeXml(replace) + afterMatch;
    } else if (i === affectedSegs.length - 1) {
      // Last segment: keep any text after the match
      const afterMatch = seg.text.substring(
        Math.min(seg.text.length, matchEnd - sm.charStart)
      );
      newText = afterMatch;
    } else {
      // Middle segments: empty them
      newText = "";
    }

    result =
      result.substring(0, seg.start) +
      `<a:t>${newText}</a:t>` +
      result.substring(seg.end);
  }

  return result;
}

/**
 * On slide 2, "Patient Name" appears twice: once as the label "Patient Name:"
 * and once as the standalone value "Patient Name". We only want to replace
 * the standalone value (the one NOT followed by ":").
 *
 * Strategy: extract all <a:t> content, find "Patient Name" occurrences,
 * and only replace the one where the next character is NOT ":".
 */
function replaceStandalonePatientName(xml: string, patientName: string): string {
  const find = "Patient Name";

  const textRegex = /<a:t>([^<]*)<\/a:t>/g;
  const segments: { start: number; end: number; text: string }[] = [];
  let m;
  while ((m = textRegex.exec(xml)) !== null) {
    segments.push({
      start: m.index,
      end: m.index + m[0].length,
      text: m[1],
    });
  }

  let fullText = "";
  const segMap: { segIdx: number; charStart: number; charEnd: number }[] = [];
  for (let i = 0; i < segments.length; i++) {
    const charStart = fullText.length;
    fullText += segments[i].text;
    segMap.push({ segIdx: i, charStart, charEnd: fullText.length });
  }

  // Find all occurrences of "Patient Name" and pick the standalone one
  let searchFrom = 0;
  let targetIdx = -1;
  while (searchFrom < fullText.length) {
    const idx = fullText.indexOf(find, searchFrom);
    if (idx === -1) break;
    const afterChar = fullText[idx + find.length];
    // Standalone = not followed by ":"
    if (afterChar !== ":") {
      targetIdx = idx;
      break;
    }
    searchFrom = idx + 1;
  }

  if (targetIdx === -1) return xml;

  const matchEnd = targetIdx + find.length;

  const affectedSegs: number[] = [];
  for (const sm of segMap) {
    if (sm.charEnd > targetIdx && sm.charStart < matchEnd) {
      affectedSegs.push(sm.segIdx);
    }
  }

  if (affectedSegs.length === 0) return xml;

  let result = xml;
  for (let i = affectedSegs.length - 1; i >= 0; i--) {
    const segIdx = affectedSegs[i];
    const seg = segments[segIdx];
    const sm = segMap[segIdx];

    let newText: string;
    if (i === 0) {
      const beforeMatch = seg.text.substring(
        0,
        Math.max(0, targetIdx - sm.charStart)
      );
      const afterMatch =
        i === affectedSegs.length - 1
          ? seg.text.substring(
              Math.min(seg.text.length, matchEnd - sm.charStart)
            )
          : "";
      newText = beforeMatch + escapeXml(patientName) + afterMatch;
    } else if (i === affectedSegs.length - 1) {
      const afterMatch = seg.text.substring(
        Math.min(seg.text.length, matchEnd - sm.charStart)
      );
      newText = afterMatch;
    } else {
      newText = "";
    }

    result =
      result.substring(0, seg.start) +
      `<a:t>${newText}</a:t>` +
      result.substring(seg.end);
  }

  return result;
}

function dataUrlToBuffer(dataUrl: string): Buffer | null {
  const match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
  if (!match) return null;
  return Buffer.from(match[1], "base64");
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
