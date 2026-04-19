# Firebase Admin + Treatment Management + Document Generation

**Date:** 2026-04-19
**Status:** Approved

## Overview

Extend the DentistPDF app with Firebase Firestore for storing treatment data (codes, pricing, T&Cs), an admin UI for managing that data, and updated document generation that produces clinical reports as .docx and cost estimates as .xlsx — all driven by the dentist's audio transcript.

## Data Model (Firestore)

All collections scoped under `practices/{practiceId}`. Single hardcoded practice for now; multi-practice is a future concern.

### `practices/{practiceId}`

Top-level practice document:

```
{
  name: string,
  logo: string (URL),
  address: string,
  phone: string,
  email: string,
  vatNumber: string
}
```

### `practices/{practiceId}/treatments/{treatmentId}`

Each treatment is a self-contained bundle:

```
{
  name: string,                    // e.g. "Crowns & Bridges"
  category: string,                // e.g. "restorative", "endodontic", "surgical"
  codes: [
    {
      code: string,                // e.g. "D2740"
      description: string,         // e.g. "Crown - porcelain/ceramic"
      price: number                // e.g. 1200
    }
  ],
  termsAndConditions: string       // plain text with line breaks
}
```

### `practices/{practiceId}/templates/{templateId}`

Report templates control layout, not content:

```
{
  name: string,                    // e.g. "Standard Clinical Report"
  type: "clinical" | "estimate",
  sections: string[],              // e.g. ["header", "summary", "findings", "recommendations", "followUp", "xrays"]
  sectionOrder: number[],          // index ordering for the sections array
  styling: {
    primaryColor: string,          // hex color
    logoPosition: "left" | "center" | "right",
    headerText: string             // e.g. practice tagline
  }
}
```

### `practices/{practiceId}/settings` (single document)

```
{
  currency: string,                // e.g. "USD", "ZAR"
  vatRate: number,                 // e.g. 0.15 for 15%
  quoteValidityDays: number,       // e.g. 30
  defaultPaymentTerms: string      // default payment terms text
}
```

## Admin UI

New `/admin` section accessible via navigation. No auth for now.

### Layout

Sidebar navigation on the left with three items: Treatments, Templates, Settings. Content area on the right. Same clean card-based styling as the main consultation page (IBM Design colors, system fonts).

### `/admin/treatments`

- Table view: treatment name, category, number of codes, price range (min-max)
- Search bar filters by name or code
- Filter dropdown by category
- Click row to expand inline editor:
  - Name input + category dropdown
  - Codes sub-table (code, description, price) with add/remove row buttons
  - T&Cs textarea
  - Save / Cancel buttons
- "Add Treatment" button at top opens blank inline form
- Delete button with confirmation dialog
- Inline editing, not separate pages

### `/admin/templates`

- List of templates showing name and type
- Edit view per template:
  - Toggle sections on/off (checkboxes)
  - Reorder sections with up/down buttons
  - Styling: color picker for primary color, logo position select, header text input
  - Preview button generates a sample document with dummy data
- Add / delete templates

### `/admin/settings`

- Form with all practice fields: name, logo upload, address, phone, email, VAT number
- Currency input, VAT rate, quote validity days, default payment terms textarea
- Single "Save" button

## Updated Consultation Flow

### Current Flow

Record audio → Transcribe (Whisper) → Claude analysis → Download PDF

### New Flow

Record audio → Transcribe (Whisper) → Claude analysis → **Review & edit treatments** → Download .docx + .xlsx

### Claude Analysis Changes

The system prompt adds one field to the output:

```
{
  patientSummary: string,
  findings: [{ tooth: string, observation: string, severity: "normal" | "monitor" | "urgent" }],
  recommendations: string[],
  followUp: string,
  suggestedTreatments: string[]   // NEW — treatment names extracted from transcript
}
```

Claude identifies treatments from the transcript. It does NOT look up codes or prices — that's the app's job.

### Treatment Review Step (new UI section)

After Claude returns results, before document generation:

1. System fuzzy-matches `suggestedTreatments` against Firestore treatment names
2. UI shows a checklist of matched treatments:
   - Each treatment: name, matched codes with prices, quantity inputs
   - Checkboxes to confirm or remove
   - Running cost total updates live
3. Searchable dropdown to add treatments not auto-detected
4. Dentist confirms the treatment selection
5. Two download buttons appear: "Download Clinical Report (.docx)" and "Download Cost Estimate (.xlsx)"

## Document Generation

### Clinical Report (.docx)

Built with the `docx` npm package. Content driven by Claude's structured output from the transcript.

Structure (controlled by template):
- **Header:** Practice logo + name + address
- **Meta:** Patient name, date
- **Summary:** `patientSummary` from Claude
- **Findings:** Table with columns: Tooth, Observation, Severity (colored text)
- **Recommendations:** Bulleted list from Claude
- **Follow-up:** Paragraph from Claude
- **X-ray Images:** Embedded images with captions
- **Footer:** Page numbers, generation date

Template determines which sections appear and their order. Content comes entirely from Claude's analysis of the transcript.

### Cost Estimate (.xlsx)

Built with `exceljs` npm package.

**Sheet 1: Estimate**
- Header rows: practice name, address, contact, logo
- Patient name, date, quote reference number (auto-generated)
- Treatments grouped by category:
  - Group header row (e.g. "Restorative")
  - Line items: code, description, quantity, unit price, line total
  - Subtotal row per group
- Optional discount row
- Grand total (excl. VAT)
- VAT line (if vatRate > 0)
- Final total
- Quote validity period
- Payment terms

**Sheet 2: Terms & Conditions**
- One section per treatment type included in the estimate
- Treatment name as header, T&C text below
- Only includes T&Cs for treatments that are in the estimate

### API Routes

| Route | Method | Input | Output |
|---|---|---|---|
| `POST /api/docx` | POST | `{ patientName, date, report, imageDataUrls, template }` | .docx binary |
| `POST /api/xlsx` | POST | `{ patientName, date, treatments, practiceSettings }` | .xlsx binary |
| `POST /api/generate` | POST | Same as before + fetches treatments from Firestore for matching | `{ report }` with `suggestedTreatments` |

Existing `/api/pdf` route remains but is unused by the main flow.

### Admin API Routes

| Route | Method | Purpose |
|---|---|---|
| `GET /api/admin/treatments` | GET | List all treatments |
| `POST /api/admin/treatments` | POST | Create treatment |
| `PUT /api/admin/treatments/[id]` | PUT | Update treatment |
| `DELETE /api/admin/treatments/[id]` | DELETE | Delete treatment |
| `GET /api/admin/templates` | GET | List all templates |
| `POST /api/admin/templates` | POST | Create template |
| `PUT /api/admin/templates/[id]` | PUT | Update template |
| `DELETE /api/admin/templates/[id]` | DELETE | Delete template |
| `GET /api/admin/settings` | GET | Get practice settings |
| `PUT /api/admin/settings` | PUT | Update practice settings |

## Dependencies

### Add

- `firebase-admin` — server-side Firestore access
- `docx` — .docx generation (programmatic, styled)
- `exceljs` — .xlsx generation (styled sheets, formulas, merged cells)

### Remove (eventually)

- `@react-pdf/renderer` — replaced by .docx
- `@vercel/blob` — no longer used

### New Env Vars

```
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
```

Standard Firebase Admin SDK service account credentials.

## Future Considerations (not in scope now)

- Multi-practice support (swap `practiceId`, add practice selector)
- Authentication (admin access control)
- Bulk import from Excel (parse uploaded pricing spreadsheet into Firestore)
- Template preview rendering
- Audit log of generated reports
