import {
  Document,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  Header,
  Footer,
  PageNumber,
  Packer,
  BorderStyle,
  ImageRun,
} from "docx";
import type { Report } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  patientName: string;
  date: string;
  report: Report;
  imageDataUrls?: string[];
  practice?: { name: string; address: string; phone: string; email: string };
};

/* ── helpers ─────────────────────────────────────────────────── */

function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 360, after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: "3b82f6" } },
    children: [
      new TextRun({ text, bold: true, size: 28, color: "3b82f6" }),
    ],
  });
}

function headerCell(text: string, width: number): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.PERCENTAGE },
    shading: { fill: "f0f3f9" },
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: true, size: 20 })],
      }),
    ],
  });
}

function dataCell(text: string, width: number): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.PERCENTAGE },
    children: [
      new Paragraph({
        children: [new TextRun({ text, size: 20 })],
      }),
    ],
  });
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function severityColor(severity: string): string {
  switch (severity) {
    case "urgent":
      return "da1e28";
    case "monitor":
      return "d2a106";
    default:
      return "198038";
  }
}

/* ── route ───────────────────────────────────────────────────── */

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const { patientName, date, report, imageDataUrls, practice } = body;

    const children: (Paragraph | Table)[] = [];

    /* Practice header */
    if (practice) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: practice.name,
              bold: true,
              size: 32,
              color: "3b82f6",
            }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({ text: practice.address, size: 20, color: "666666" }),
          ],
        }),
        new Paragraph({
          spacing: { after: 200 },
          children: [
            new TextRun({
              text: `${practice.phone}  |  ${practice.email}`,
              size: 20,
              color: "666666",
            }),
          ],
        })
      );
    }

    /* Title */
    children.push(
      new Paragraph({
        spacing: { after: 200 },
        children: [
          new TextRun({
            text: "Consultation Report",
            bold: true,
            size: 36,
          }),
        ],
      })
    );

    /* Patient + date */
    children.push(
      new Paragraph({
        spacing: { after: 200 },
        children: [
          new TextRun({ text: "Patient: ", bold: true, size: 22 }),
          new TextRun({ text: patientName, size: 22 }),
          new TextRun({ text: "    Date: ", bold: true, size: 22 }),
          new TextRun({ text: date, size: 22 }),
        ],
      })
    );

    /* Patient Summary */
    children.push(sectionHeading("Patient Summary"));
    children.push(
      new Paragraph({
        spacing: { after: 200 },
        children: [new TextRun({ text: report.patientSummary, size: 22 })],
      })
    );

    /* Findings */
    children.push(sectionHeading("Findings"));

    const findingsRows: TableRow[] = [
      new TableRow({
        children: [
          headerCell("Tooth", 20),
          headerCell("Observation", 55),
          headerCell("Severity", 25),
        ],
      }),
    ];

    for (const f of report.findings) {
      findingsRows.push(
        new TableRow({
          children: [
            dataCell(f.tooth, 20),
            dataCell(f.observation, 55),
            new TableCell({
              width: { size: 25, type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: f.severity,
                      size: 20,
                      color: severityColor(f.severity),
                      bold: true,
                    }),
                  ],
                }),
              ],
            }),
          ],
        })
      );
    }

    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: findingsRows,
      })
    );

    /* Recommendations */
    children.push(sectionHeading("Recommendations"));
    for (const rec of report.recommendations) {
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          children: [new TextRun({ text: rec, size: 22 })],
        })
      );
    }

    /* Follow-up */
    children.push(sectionHeading("Follow-up"));
    children.push(
      new Paragraph({
        spacing: { after: 200 },
        children: [new TextRun({ text: report.followUp, size: 22 })],
      })
    );

    /* X-ray images */
    if (imageDataUrls && imageDataUrls.length > 0) {
      children.push(sectionHeading("X-ray Images"));

      for (let i = 0; i < imageDataUrls.length; i++) {
        const dataUrl = imageDataUrls[i];
        const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, "");
        const imageBuffer = Buffer.from(base64, "base64");

        children.push(
          new Paragraph({
            spacing: { before: 200, after: 80 },
            children: [
              new ImageRun({
                data: imageBuffer,
                transformation: { width: 500, height: 350 },
                type: "png",
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 200 },
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: `X-ray Image ${i + 1}`,
                italics: true,
                size: 18,
                color: "666666",
              }),
            ],
          })
        );
      }
    }

    /* Build document */
    const doc = new Document({
      sections: [
        {
          headers: {
            default: new Header({
              children: [
                new Paragraph({
                  alignment: AlignmentType.RIGHT,
                  children: [
                    new TextRun({
                      text: practice?.name ?? "",
                      size: 18,
                      color: "999999",
                    }),
                  ],
                }),
              ],
            }),
          },
          footers: {
            default: new Footer({
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun({ text: "Page ", size: 16, color: "999999" }),
                    new TextRun({
                      children: [PageNumber.CURRENT],
                      size: 16,
                      color: "999999",
                    }),
                    new TextRun({ text: " of ", size: 16, color: "999999" }),
                    new TextRun({
                      children: [PageNumber.TOTAL_PAGES],
                      size: 16,
                      color: "999999",
                    }),
                    new TextRun({
                      text: `    |    ${date}`,
                      size: 16,
                      color: "999999",
                    }),
                  ],
                }),
              ],
            }),
          },
          children,
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);

    const filename = `report-${slug(patientName)}-${slug(date)}.docx`;

    return new Response(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("[docx] error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
