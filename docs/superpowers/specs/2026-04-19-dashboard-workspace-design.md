# Dashboard Workspace Redesign

**Date:** 2026-04-19
**Status:** Approved

## Overview

Rebuild the DentistPDF app from a single-page tool into a full workspace product. Add Firebase Auth, patient management, treatment upload via file parsing (Claude-powered), report template storage via Firebase Storage, and a sidebar-driven workspace with Dashboard, Consultation, Patients, Treatments, and Settings pages.

## Authentication

Firebase Auth with email/password.

- `/login` page — email + password form, sign in button
- On success, redirect to `/dashboard`
- All pages except `/login` require auth — redirect if not authenticated
- `useAuth()` client hook wraps Firebase Auth state (user, loading, signOut)
- API routes validate Firebase ID token from `Authorization: Bearer <token>` header
- No signup page — accounts created manually in Firebase Console (B2B tool)
- New env var: `NEXT_PUBLIC_FIREBASE_CONFIG` (JSON string of Firebase client config: apiKey, authDomain, projectId)

### Auth implementation

- `firebase` client SDK (new dependency) for client-side auth
- `firebase-admin` (existing) for server-side token verification
- Auth middleware: a `verifyAuth(request)` helper that extracts and verifies the Bearer token, returns `{ uid, practiceId }` or throws
- `users/{uid}` Firestore document maps Firebase Auth user to `{ practiceId: string, role: "dentist" }`

## Data Model Changes

### New: `users/{uid}`

```
{
  practiceId: string,
  role: "dentist"
}
```

### New: `practices/{practiceId}/patients/{patientId}`

```
{
  name: string,
  email: string,
  phone: string,
  dateOfBirth: string,
  notes: string,
  createdAt: timestamp
}
```

### New: `practices/{practiceId}/patients/{patientId}/consultations/{consultationId}`

```
{
  date: string,
  transcript: string,
  report: Report,
  selectedTreatments: SelectedTreatment[],
  docxUrl: string | null,
  xlsxUrl: string | null,
  createdAt: timestamp
}
```

### Existing: `practices/{practiceId}/treatments/{treatmentId}`

Unchanged. Treatments are practice-level. Consultations snapshot treatments at creation time via `selectedTreatments`.

### Updated: `practices/{practiceId}/templates/{templateId}`

Add `fileUrl` field for the source .docx stored in Firebase Storage:

```
{
  name: string,
  type: "clinical" | "estimate",
  fileUrl: string | null,           // Firebase Storage download URL for source .docx
  sections: string[],
  sectionOrder: number[],
  styling: {
    primaryColor: string,
    logoPosition: "left" | "center" | "right",
    headerText: string
  }
}
```

### Existing: `practices/{practiceId}/settings`

Unchanged.

## Pages & Routing

### Sidebar Navigation

The sidebar replaces both the old `/` page and `/admin` layout. All pages use the same sidebar layout.

| Nav Item | Route | Description |
|---|---|---|
| Dashboard | `/dashboard` | Quick stats + action buttons |
| New Consultation | `/consultation` | Full consultation flow for a patient |
| Patients | `/patients` | Patient list |
| Patient Detail | `/patients/[id]` | Patient info + consultation history |
| Treatments | `/treatments` | Upload files + manage treatments |
| Settings | `/settings` | Practice details + billing |
| Login | `/login` | No sidebar, standalone page |

The old `/` page redirects to `/dashboard`. The old `/admin/*` routes are removed — their functionality moves into the new workspace pages.

### `/login`

Standalone page (no sidebar). Practice logo placeholder, email input, password input, "Sign In" button. Error message display. Redirects to `/dashboard` on success.

### `/dashboard`

- Welcome message: "Welcome, {practice name}"
- Quick stats cards (3): total patients, treatments loaded, consultations this month
- Action buttons: "New Consultation" (links to `/consultation`), "Upload Treatments" (links to `/treatments`)

Stats fetched via a single `/api/dashboard-stats` endpoint.

### `/consultation`

Full consultation workflow on one page:

1. **Patient selection** — search-and-select existing patient, or "Create New" inline form (name, email, phone, DOB)
2. **X-ray upload** — multi-file image upload with thumbnails (existing functionality)
3. **Audio recording** — record/stop with timer (existing functionality)
4. **Transcription** — Whisper transcription (existing functionality)
5. **Claude analysis** — generates report + suggested treatments (existing functionality)
6. **Treatment review** — checklist of matched treatments with quantity editing (existing functionality)
7. **Generate documents** — produces .docx + .xlsx (existing functionality)
8. **Save & download** — saves consultation to Firestore under the patient, download buttons for both documents

Mostly the existing `page.tsx` logic with patient selection added at the top and a save-to-Firestore step at the end.

### `/patients`

- Search bar (filters by name, email, phone)
- Table: name, email, phone, last consultation date
- Click row → `/patients/[id]`
- "Add Patient" button opens inline form

### `/patients/[id]`

- Patient info card at top (editable: name, email, phone, DOB, notes). Save button.
- Consultation history below: table with date, summary snippet (first 100 chars of patientSummary), download .docx button, download .xlsx button
- Each consultation row is expandable to show full report preview (findings, recommendations)

### `/treatments`

Two sections:

**Upload section (top):**
- Drag-and-drop zone accepting .xlsx, .docx, .pdf files
- Can upload multiple files at once
- Upload flow (see "Treatment File Upload Flow" below)

**Management section (bottom):**
- Existing treatments table with search, category filter, inline editing
- Same functionality as current `/admin/treatments` page

### `/settings`

Same as current `/admin/settings` page — practice details + billing config. Moved into the new sidebar layout.

## Treatment File Upload Flow

1. Dentist drags/drops files onto the upload zone (.xlsx, .docx, .pdf)
2. For .xlsx: parse client-side with `exceljs` to extract raw cell data as text
3. For .docx/.pdf: read as base64
4. POST to `/api/parse-treatments` with file contents (text for Excel, base64 for docs)
5. Server sends content to Claude with prompt: "Extract all dental treatments from this document. For each treatment return: name, category, codes (code + description + price), and termsAndConditions. Return as JSON array."
6. Claude returns structured JSON array of treatments
7. Response sent to client → **review screen** shows a table of extracted treatments
8. Dentist can edit, remove, or add treatments before confirming
9. On confirm, POST to `/api/admin/treatments/batch` → batch-write to Firestore

**Multiple files:** Parse each file separately, send all to Claude in one prompt for cross-referencing (e.g., pricing Excel + T&C doc). Merge results before review.

**Pricing/treatment .xlsx files** are parsed and discarded — data lives structured in Firestore.

## Report Template Storage

Report template .docx files are stored in Firebase Storage.

Upload flow:
1. Dentist uploads a sample .docx report on the Templates section (within Settings or Treatments page)
2. File uploaded to Firebase Storage via `/api/upload-template`
3. Claude analyzes the document structure: sections present, their order, styling cues (colors, header/footer content)
4. Template metadata saved to Firestore `templates` collection with the Firebase Storage download URL
5. DOCX generation uses this metadata to match the dentist's preferred layout

Firebase Storage setup:
- Use `getStorage().bucket()` from `firebase-admin/storage`
- Files stored under `templates/{practiceId}/{filename}`
- Download URLs generated with `getSignedUrl()` or made public

## Dependency Changes

### Add
- `firebase` — client-side SDK for Auth

### Remove
- `@vercel/blob` — replaced by Firebase Storage
- `@react-pdf/renderer` — no longer used (DOCX replaced PDF)

### Remove env var
- `BLOB_READ_WRITE_TOKEN`

### Add env var
- `NEXT_PUBLIC_FIREBASE_CONFIG` — JSON string of Firebase client config

## New API Routes

| Route | Method | Purpose |
|---|---|---|
| `POST /api/auth/verify` | POST | Verify Firebase ID token, return user info |
| `GET /api/dashboard-stats` | GET | Return patient count, treatment count, recent consultations count |
| `GET /api/patients` | GET | List patients for practice |
| `POST /api/patients` | POST | Create patient |
| `GET /api/patients/[id]` | GET | Get patient detail |
| `PUT /api/patients/[id]` | PUT | Update patient |
| `GET /api/patients/[id]/consultations` | GET | List consultations for patient |
| `POST /api/patients/[id]/consultations` | POST | Save consultation |
| `POST /api/parse-treatments` | POST | Send file content to Claude, return extracted treatments JSON |
| `POST /api/admin/treatments/batch` | POST | Batch-create treatments from parsed upload |
| `POST /api/upload-template` | POST | Upload template .docx to Firebase Storage |

### Existing routes kept
- `POST /api/generate` — Claude analysis
- `POST /api/upload-audio` — Whisper transcription
- `POST /api/docx` — DOCX generation
- `POST /api/xlsx` — XLSX generation
- `POST /api/match-treatments` — treatment matching
- `GET/PUT /api/admin/settings` — practice settings
- CRUD `/api/admin/treatments` — treatment management
- CRUD `/api/admin/templates` — template management

### Routes removed
- `/api/blob-upload` — no longer needed
- `/api/transcribe` — unused (replaced by upload-audio)
- `/api/pdf` — unused (replaced by docx)

## Pages Removed

- `/` (old single-page consultation form) — replaced by `/dashboard` + `/consultation`
- `/admin/*` (old admin layout + pages) — functionality merged into workspace

## Future Considerations (not in scope)

- Multi-practice support (practice selector)
- Role-based access (admin vs. dentist vs. receptionist)
- Consultation editing after save
- Patient document uploads (insurance, referrals)
- Email delivery of reports to patients
