import { renderToBuffer } from "@react-pdf/renderer";
import { NextResponse } from "next/server";
import { ConsultationPDF } from "@/components/PDFDocument";
import type { Report } from "@/app/api/generate/route";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  patientName: string;
  date?: string;
  report: Report;
  imageDataUrls?: string[];
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const date = body.date ?? new Date().toISOString().slice(0, 10);

    const buffer = await renderToBuffer(
      ConsultationPDF({
        patientName: body.patientName,
        date,
        report: body.report,
        imageDataUrls: body.imageDataUrls ?? [],
      })
    );

    const filename = `consultation-${slug(body.patientName || "patient")}-${date}.pdf`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch (error) {
    console.error("[pdf] error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

function slug(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "patient";
}
