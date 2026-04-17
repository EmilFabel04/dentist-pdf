# Dental Consultation PDF

Next.js 14 app that turns a dentist's audio notes + X-ray images into a structured consultation PDF.

## Flow

1. Dentist enters patient name and uploads X-rays.
2. Browser records audio via `MediaRecorder` (webm/opus).
3. Audio uploads directly to **Vercel Blob** (client-side `upload()`), bypassing the 4.5 MB serverless body limit.
4. `/api/transcribe` fetches the blob and sends it to **OpenAI Whisper** (`whisper-1`).
5. `/api/generate` sends transcript + images to **Claude** (`claude-sonnet-4-20250514`) and parses structured JSON.
6. `/api/pdf` renders the final report with `@react-pdf/renderer` and streams the PDF back.

## Setup

```bash
npm install
cp .env.example .env.local
# fill in OPENAI_API_KEY, ANTHROPIC_API_KEY, BLOB_READ_WRITE_TOKEN
npm run dev
```

Open http://localhost:3000.

### Vercel Blob token

When developing locally, get a `BLOB_READ_WRITE_TOKEN` from a Vercel project (Storage → Blob → `.env.local`). On Vercel, the token is injected automatically.

## Routes

| Route                | Purpose                                              |
| -------------------- | ---------------------------------------------------- |
| `POST /api/blob-upload` | Issues client-upload tokens (audio only, ≤ 50 MB). |
| `POST /api/transcribe`  | `{ blobUrl }` → `{ transcript }`                   |
| `POST /api/generate`    | `{ transcript, images }` → `{ report }` (JSON)     |
| `POST /api/pdf`         | `{ patientName, date, report, imageDataUrls }` → PDF binary |

## Notes

- Stateless. No DB, no auth.
- Max audio upload size is 50 MB (adjust in [api/blob-upload/route.ts](app/api/blob-upload/route.ts)).
- Claude is instructed to return raw JSON; fenced code blocks are stripped defensively.
- API routes use `runtime = "nodejs"` and `maxDuration = 60` for the long-running Whisper / Claude calls.
