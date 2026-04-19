# Dashboard Workspace Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the app from a single-page tool into a sidebar-driven workspace with Firebase Auth, patient management, treatment file upload, and consultation history.

**Architecture:** Route group `(workspace)` shares a sidebar layout with auth gating. `/login` sits outside the group. Firebase client SDK handles auth on the client; `firebase-admin` verifies tokens server-side. Patients and consultations stored in Firestore. Treatment upload uses Claude for parsing. Old `/admin` and `/` pages removed.

**Tech Stack:** Next.js 14, firebase + firebase-admin, exceljs, docx, Anthropic Claude, OpenAI Whisper

**Spec:** `docs/superpowers/specs/2026-04-19-dashboard-workspace-design.md`

---

### Task 1: Firebase Client SDK + Auth Helpers

**Files:**
- Modify: `package.json`
- Create: `lib/firebase-client.ts`
- Create: `lib/auth.ts`
- Modify: `lib/firebase.ts` (add auth verification + storage helpers)
- Modify: `lib/types.ts` (add Patient, Consultation, UserProfile types)
- Modify: `.env.example`

- [ ] **Step 1: Install firebase client SDK**

```bash
npm install firebase
```

- [ ] **Step 2: Update .env.example**

Replace contents with:
```
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
NEXT_PUBLIC_FIREBASE_CONFIG=
```

Note: `BLOB_READ_WRITE_TOKEN` removed. `NEXT_PUBLIC_FIREBASE_CONFIG` is a JSON string like:
`{"apiKey":"...","authDomain":"...","projectId":"...","storageBucket":"..."}`

- [ ] **Step 3: Create Firebase client singleton**

Create `lib/firebase-client.ts`:

```typescript
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

let app: FirebaseApp | undefined;
let auth: Auth | undefined;

function getFirebaseConfig() {
  const raw = process.env.NEXT_PUBLIC_FIREBASE_CONFIG;
  if (!raw) throw new Error("NEXT_PUBLIC_FIREBASE_CONFIG not set");
  return JSON.parse(raw);
}

export function getClientApp(): FirebaseApp {
  if (!app) {
    app = getApps().length > 0 ? getApps()[0] : initializeApp(getFirebaseConfig());
  }
  return app;
}

export function getClientAuth(): Auth {
  if (!auth) {
    auth = getAuth(getClientApp());
  }
  return auth;
}
```

- [ ] **Step 4: Create useAuth hook**

Create `lib/auth.ts`:

```typescript
"use client";

import { useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { getClientAuth } from "./firebase-client";

type AuthState = {
  user: User | null;
  loading: boolean;
};

export function useAuth(): AuthState & {
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  getToken: () => Promise<string | null>;
} {
  const [state, setState] = useState<AuthState>({ user: null, loading: true });

  useEffect(() => {
    const auth = getClientAuth();
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setState({ user, loading: false });
    });
    return unsubscribe;
  }, []);

  async function signIn(email: string, password: string) {
    const auth = getClientAuth();
    await signInWithEmailAndPassword(auth, email, password);
  }

  async function signOut() {
    const auth = getClientAuth();
    await fbSignOut(auth);
  }

  async function getToken() {
    return state.user ? state.user.getIdToken() : null;
  }

  return { ...state, signIn, signOut, getToken };
}
```

- [ ] **Step 5: Add server-side auth verification to lib/firebase.ts**

Add to the existing `lib/firebase.ts` (keep all existing code, add these exports):

```typescript
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";

export async function verifyAuth(request: Request): Promise<{ uid: string; practiceId: string }> {
  const header = request.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) {
    throw new Error("Missing or invalid Authorization header");
  }
  const token = header.slice(7);
  const decoded = await getAuth(getApp()).verifyIdToken(token);
  
  const userDoc = await getDb().collection("users").doc(decoded.uid).get();
  if (!userDoc.exists) {
    throw new Error("User not registered");
  }
  const { practiceId } = userDoc.data() as { practiceId: string };
  return { uid: decoded.uid, practiceId };
}

export function getPracticeRef(practiceId: string) {
  return getDb().collection("practices").doc(practiceId);
}

export function getStorageBucket() {
  return getStorage(getApp()).bucket();
}
```

Note: `getApp` is the existing lazy-init function already in the file. The `getAuth` and `getStorage` imports are from `firebase-admin`.

- [ ] **Step 6: Add new types to lib/types.ts**

Append to the existing `lib/types.ts`:

```typescript
export type Patient = {
  id: string;
  name: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  notes: string;
  createdAt: string;
};

export type Consultation = {
  id: string;
  date: string;
  transcript: string;
  report: Report;
  selectedTreatments: SelectedTreatment[];
  docxUrl: string | null;
  xlsxUrl: string | null;
  createdAt: string;
};

export type UserProfile = {
  practiceId: string;
  role: "dentist";
};
```

- [ ] **Step 7: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json lib/ .env.example
git commit -m "feat: add Firebase client SDK, auth hook, server auth verification, new types"
```

---

### Task 2: Login Page

**Files:**
- Create: `app/login/page.tsx`
- Create: `app/login/page.module.css`
- Modify: `app/layout.tsx` (keep minimal, no sidebar)

- [ ] **Step 1: Create login page styles**

Create `app/login/page.module.css` with a centered card layout:
- Full viewport height, centered flexbox
- Card: white, rounded, shadow, max-width 400px, padding 32px
- Logo placeholder at top
- Title "Sign In", subtitle text
- `.field` with `.fieldLabel` (uppercase, small, gray) and `.input` (full-width, bordered, focus-blue)
- `.submitBtn` blue (#0f62fe) full-width, white text, bold
- `.error` red background with red-left-border (same pattern as existing error styles)
- Match IBM Design colors from existing app

- [ ] **Step 2: Create login page component**

Create `app/login/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import styles from "./page.module.css";

export default function LoginPage() {
  const router = useRouter();
  const { signIn, user, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Redirect if already logged in
  if (!loading && user) {
    router.replace("/dashboard");
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email, password);
      router.replace("/dashboard");
    } catch (err) {
      setError("Invalid email or password.");
      setSubmitting(false);
    }
  }

  if (loading) return null;

  return (
    <main className={styles.main}>
      <div className={styles.card}>
        <div className={styles.logoBox}>LOGO</div>
        <h1 className={styles.title}>Sign In</h1>
        <p className={styles.subtitle}>Dental Consultation Reports</p>
        <form onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Email</label>
            <input
              className={styles.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Password</label>
            <input
              className={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className={styles.error}>{error}</p>}
          <button className={styles.submitBtn} type="submit" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign In"}
          </button>
        </form>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add app/login/
git commit -m "feat: add login page with Firebase Auth"
```

---

### Task 3: Workspace Layout + Dashboard + Auth Gating

**Files:**
- Create: `app/(workspace)/layout.tsx`
- Create: `app/(workspace)/layout.module.css`
- Create: `app/(workspace)/dashboard/page.tsx`
- Create: `app/(workspace)/dashboard/page.module.css`
- Create: `app/api/dashboard-stats/route.ts`
- Modify: `app/page.tsx` (replace with redirect to /dashboard)
- Remove: `app/admin/` directory (functionality moving into workspace)

- [ ] **Step 1: Create workspace layout with sidebar and auth gate**

Create `app/(workspace)/layout.module.css` — reuse the same sidebar style as the old admin layout:
- `.container` flex, min-height 100vh
- `.sidebar` 240px, white bg, border-right
- `.logo` padded, blue, bold, border-bottom
- `.nav` list with `.navItem` and `.navItemActive` (active has blue left-border + blue text + blue bg tint)
- `.content` flex-1, gray bg, padded, overflow-y auto
- `.userBar` at bottom of sidebar: email display + sign out button

Create `app/(workspace)/layout.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import styles from "./layout.module.css";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/consultation", label: "New Consultation" },
  { href: "/patients", label: "Patients" },
  { href: "/treatments", label: "Treatments" },
  { href: "/settings", label: "Settings" },
];

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, signOut } = useAuth();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) return null;

  return (
    <div className={styles.container}>
      <aside className={styles.sidebar}>
        <div className={styles.logo}>
          <Link href="/dashboard" style={{ color: "inherit", textDecoration: "none" }}>
            DentistPDF
          </Link>
        </div>
        <nav>
          <ul className={styles.nav}>
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={pathname.startsWith(item.href) ? styles.navItemActive : styles.navItem}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className={styles.userBar}>
          <span className={styles.userEmail}>{user.email}</span>
          <button className={styles.signOutBtn} onClick={signOut}>Sign Out</button>
        </div>
      </aside>
      <main className={styles.content}>{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Create dashboard stats API**

Create `app/api/dashboard-stats/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { verifyAuth, getPracticeRef } from "@/lib/firebase";

export async function GET(request: Request) {
  try {
    const { practiceId } = await verifyAuth(request);
    const ref = getPracticeRef(practiceId);

    const [patientsSnap, treatmentsSnap] = await Promise.all([
      ref.collection("patients").count().get(),
      ref.collection("treatments").count().get(),
    ]);

    return NextResponse.json({
      totalPatients: patientsSnap.data().count,
      totalTreatments: treatmentsSnap.data().count,
    });
  } catch (error) {
    console.error("[dashboard-stats] error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 401 });
  }
}
```

- [ ] **Step 3: Create dashboard page**

Create `app/(workspace)/dashboard/page.module.css` with:
- `.heading` large, margin-bottom
- `.statsGrid` 3-column grid
- `.statCard` white card with shadow, big number, small label
- `.statValue` large blue number
- `.statLabel` small uppercase gray
- `.actionsRow` flex row of action buttons
- `.actionBtn` large card-style button with blue hover

Create `app/(workspace)/dashboard/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import styles from "./page.module.css";

export default function DashboardPage() {
  const router = useRouter();
  const { getToken } = useAuth();
  const [stats, setStats] = useState({ totalPatients: 0, totalTreatments: 0 });

  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (!token) return;
      const res = await fetch("/api/dashboard-stats", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setStats(await res.json());
    })();
  }, [getToken]);

  return (
    <div>
      <h1 className={styles.heading}>Dashboard</h1>
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{stats.totalPatients}</span>
          <span className={styles.statLabel}>Patients</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{stats.totalTreatments}</span>
          <span className={styles.statLabel}>Treatments</span>
        </div>
      </div>
      <div className={styles.actionsRow}>
        <button className={styles.actionBtn} onClick={() => router.push("/consultation")}>
          New Consultation
        </button>
        <button className={styles.actionBtn} onClick={() => router.push("/treatments")}>
          Upload Treatments
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Replace root page with redirect**

Replace `app/page.tsx` with a simple redirect:

```tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/dashboard");
}
```

- [ ] **Step 5: Remove old admin directory**

Delete the entire `app/admin/` directory — its functionality is now in the workspace pages.

```bash
rm -rf app/admin
```

- [ ] **Step 6: Verify build**

Run: `npm run build`

- [ ] **Step 7: Commit**

```bash
git add app/ -A
git commit -m "feat: add workspace layout with auth gating, dashboard, remove old admin"
```

---

### Task 4: Patient CRUD API Routes

**Files:**
- Create: `app/api/patients/route.ts`
- Create: `app/api/patients/[id]/route.ts`
- Create: `app/api/patients/[id]/consultations/route.ts`

- [ ] **Step 1: Create patients list + create route**

Create `app/api/patients/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { verifyAuth, getPracticeRef } from "@/lib/firebase";
import type { Patient } from "@/lib/types";

export async function GET(request: Request) {
  try {
    const { practiceId } = await verifyAuth(request);
    const snapshot = await getPracticeRef(practiceId)
      .collection("patients")
      .orderBy("name")
      .get();
    const patients: Patient[] = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Patient[];
    return NextResponse.json(patients);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const { practiceId } = await verifyAuth(request);
    const body = (await request.json()) as Omit<Patient, "id">;
    const ref = await getPracticeRef(practiceId).collection("patients").add({
      ...body,
      createdAt: new Date().toISOString(),
    });
    return NextResponse.json({ id: ref.id }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 401 });
  }
}
```

- [ ] **Step 2: Create single patient GET/PUT route**

Create `app/api/patients/[id]/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { verifyAuth, getPracticeRef } from "@/lib/firebase";
import type { Patient } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const { practiceId } = await verifyAuth(request);
    const { id } = await params;
    const doc = await getPracticeRef(practiceId).collection("patients").doc(id).get();
    if (!doc.exists) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }
    return NextResponse.json({ id: doc.id, ...doc.data() } as Patient);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 401 });
  }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const { practiceId } = await verifyAuth(request);
    const { id } = await params;
    const body = (await request.json()) as Partial<Patient>;
    await getPracticeRef(practiceId).collection("patients").doc(id).set(body, { merge: true });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 401 });
  }
}
```

- [ ] **Step 3: Create consultations list + save route**

Create `app/api/patients/[id]/consultations/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { verifyAuth, getPracticeRef } from "@/lib/firebase";
import type { Consultation } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const { practiceId } = await verifyAuth(request);
    const { id } = await params;
    const snapshot = await getPracticeRef(practiceId)
      .collection("patients")
      .doc(id)
      .collection("consultations")
      .orderBy("createdAt", "desc")
      .get();
    const consultations: Consultation[] = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Consultation[];
    return NextResponse.json(consultations);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 401 });
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { practiceId } = await verifyAuth(request);
    const { id } = await params;
    const body = (await request.json()) as Omit<Consultation, "id">;
    const ref = await getPracticeRef(practiceId)
      .collection("patients")
      .doc(id)
      .collection("consultations")
      .add({ ...body, createdAt: new Date().toISOString() });
    return NextResponse.json({ id: ref.id }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 401 });
  }
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`

- [ ] **Step 5: Commit**

```bash
git add app/api/patients/
git commit -m "feat: add patient and consultation CRUD API routes"
```

---

### Task 5: Patients List + Patient Detail Pages

**Files:**
- Create: `app/(workspace)/patients/page.tsx`
- Create: `app/(workspace)/patients/page.module.css`
- Create: `app/(workspace)/patients/[id]/page.tsx`
- Create: `app/(workspace)/patients/[id]/page.module.css`

- [ ] **Step 1: Create patients list page**

Create `app/(workspace)/patients/page.module.css` with styles for:
- `.heading` + toolbar row (search input + add button)
- `.table` with `.clickableRow` hover
- Empty state message
- Inline "Add Patient" form (name, email, phone, DOB fields + save/cancel)

Create `app/(workspace)/patients/page.tsx`:
- Fetches patients from `GET /api/patients` with auth token
- Search bar filters by name/email/phone
- Table: name, email, phone, last consultation date (leave blank for now)
- Click row navigates to `/patients/[id]`
- "Add Patient" button opens inline form at top
- Form POSTs to `/api/patients`, reloads list on success

All API calls must include `Authorization: Bearer <token>` header using `getToken()` from `useAuth()`.

- [ ] **Step 2: Create patient detail page**

Create `app/(workspace)/patients/[id]/page.module.css` with styles for:
- `.infoCard` white card with editable fields
- `.consultationTable` for history
- Download buttons (reuse `.downloadBtn` and `.downloadBtnGreen` styles)
- Expandable row for report preview

Create `app/(workspace)/patients/[id]/page.tsx`:
- Fetches patient from `GET /api/patients/[id]` with auth token
- Editable patient info card (name, email, phone, DOB, notes textarea) with Save button
- Below: "Consultation History" heading
- Fetches from `GET /api/patients/[id]/consultations`
- Table: date, summary snippet (first 100 chars of patientSummary), download .docx, download .xlsx
- Download buttons regenerate documents on-the-fly via `/api/docx` and `/api/xlsx` (consultations store the data needed to regenerate)
- "New Consultation" button links to `/consultation?patientId=[id]`

- [ ] **Step 3: Verify build**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add app/\(workspace\)/patients/
git commit -m "feat: add patients list and patient detail pages"
```

---

### Task 6: Consultation Page (moved + patient selection + save)

**Files:**
- Create: `app/(workspace)/consultation/page.tsx`
- Create: `app/(workspace)/consultation/page.module.css`

- [ ] **Step 1: Create consultation page**

This is largely the current `app/page.tsx` logic moved into the workspace, with these additions:

**Patient selection at top:**
- Search existing patients (fetch from `/api/patients`)
- Select from dropdown, or "Create New" inline form
- If URL has `?patientId=xxx`, auto-select that patient
- Patient must be selected before recording/generating

**Save step at the end:**
- After documents are generated (phase === "done"), add a "Save Consultation" button
- On click: POST to `/api/patients/[id]/consultations` with `{ date, transcript, report, selectedTreatments }`
- Show success message with link to patient detail

**Auth:** All API calls (generate, match-treatments, docx, xlsx, settings) must include the Bearer token header.

Create `app/(workspace)/consultation/page.module.css` — reuse styles from the current `app/page.module.css` (copy the relevant classes: section, label, input, fileInput, thumbGrid, thumbWrap, thumb, removeBtn, recordRow, recordBtn, stopBtn, timer, status, transcriptBox, primaryBtn, downloadBtn, downloadBtnGreen, error, previewTitle, previewPara, previewList, sev-*, treatmentCard, treatmentHeader, category, codesTable, qtyInput, lineTotal, addTreatmentRow, addTreatmentSelect, costTotal, downloadRow).

Add new styles for:
- `.patientSelector` section with search input and dropdown
- `.patientBadge` showing selected patient name
- `.saveBtn` green button for saving consultation
- `.successMsg` green success box

- [ ] **Step 2: Verify build**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add app/\(workspace\)/consultation/
git commit -m "feat: add consultation page with patient selection and save"
```

---

### Task 7: Settings Page (moved) + Treatments Page (with upload)

**Files:**
- Create: `app/(workspace)/settings/page.tsx`
- Create: `app/(workspace)/settings/page.module.css`
- Create: `app/(workspace)/treatments/page.tsx`
- Create: `app/(workspace)/treatments/page.module.css`
- Create: `app/api/parse-treatments/route.ts`
- Create: `app/api/admin/treatments/batch/route.ts`

- [ ] **Step 1: Create settings page**

Move the admin settings page into the workspace. Create `app/(workspace)/settings/page.tsx` — same as the old `app/admin/settings/page.tsx` but with auth token on API calls.

Create `app/(workspace)/settings/page.module.css` — same styles as `app/admin/settings/page.module.css`.

- [ ] **Step 2: Create parse-treatments API**

Create `app/api/parse-treatments/route.ts`:

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/firebase";

export const runtime = "nodejs";
export const maxDuration = 120;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PARSE_PROMPT = `You are a dental data extraction assistant. Given the content of a document (spreadsheet data, Word document, or PDF), extract all dental treatments and return them as a JSON array.

For each treatment return:
{
  "name": "treatment type name (e.g. Crown, Root Canal, Filling)",
  "category": "one of: preventive, restorative, endodontic, periodontal, prosthodontic, surgical, orthodontic, diagnostic, other",
  "codes": [{ "code": "procedure code", "description": "description", "price": number }],
  "termsAndConditions": "any T&Cs associated with this treatment, or empty string"
}

Return ONLY a valid JSON array. No prose, no markdown code fences.
If prices are in a non-USD currency, keep the original numbers — do not convert.
Group related procedure codes under the same treatment type.`;

export async function POST(request: Request) {
  try {
    await verifyAuth(request);
    const { content, filename } = (await request.json()) as {
      content: string;
      filename: string;
    };

    if (!content) {
      return NextResponse.json({ error: "No content provided" }, { status: 400 });
    }

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: PARSE_PROMPT,
      messages: [
        {
          role: "user",
          content: `File: ${filename}\n\nContent:\n${content}\n\nExtract all treatments as JSON array.`,
        },
      ],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json({ error: "No response from Claude" }, { status: 502 });
    }

    const raw = textBlock.text.trim();
    const jsonText = raw.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1]?.trim() ?? raw;

    let treatments;
    try {
      treatments = JSON.parse(jsonText);
    } catch {
      return NextResponse.json({ error: "Claude returned non-JSON", raw }, { status: 502 });
    }

    return NextResponse.json({ treatments });
  } catch (error) {
    console.error("[parse-treatments] error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Create batch treatments API**

Create `app/api/admin/treatments/batch/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { verifyAuth, getPracticeRef } from "@/lib/firebase";
import type { Treatment } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const { practiceId } = await verifyAuth(request);
    const { treatments } = (await request.json()) as {
      treatments: Omit<Treatment, "id">[];
    };

    const ref = getPracticeRef(practiceId);
    const batch = ref.firestore.batch();
    const ids: string[] = [];

    for (const t of treatments) {
      const docRef = ref.collection("treatments").doc();
      batch.set(docRef, t);
      ids.push(docRef.id);
    }

    await batch.commit();
    return NextResponse.json({ ids }, { status: 201 });
  } catch (error) {
    console.error("[treatments/batch] error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 4: Create treatments page with upload**

Create `app/(workspace)/treatments/page.module.css` with styles for:
- Upload zone: `.dropZone` dashed border, centered text, hover highlight, drag-over state
- `.fileList` showing uploaded files with status
- `.reviewSection` for the extracted treatments review table
- Reuse treatment table/editor styles from the old admin treatments page
- `.confirmBar` with "Save All" button

Create `app/(workspace)/treatments/page.tsx` with two sections:

**Upload section (top):**
- Drag-and-drop zone for .xlsx, .docx, .pdf files
- On file drop/select:
  - For .xlsx: read with `exceljs` on the client — create a new `ExcelJS.Workbook()`, load the file via `workbook.xlsx.load(arrayBuffer)`, iterate all sheets and cells, concatenate as text
  - For .docx/.pdf: read as base64, send as-is
- POST file content to `/api/parse-treatments` with auth token
- Show loading state while Claude parses
- Show review table of extracted treatments (editable: name, category, codes, T&Cs)
- "Save All" button POSTs to `/api/admin/treatments/batch`
- Success message, clear review

**Management section (bottom):**
- Same treatment table as old admin page: search, category filter, inline editing
- Fetches from `GET /api/admin/treatments` (keep existing routes, add auth token)
- CRUD via existing treatment API routes

All API calls include Bearer token.

- [ ] **Step 5: Verify build**

Run: `npm run build`

- [ ] **Step 6: Commit**

```bash
git add app/\(workspace\)/settings/ app/\(workspace\)/treatments/ app/api/parse-treatments/ app/api/admin/treatments/batch/
git commit -m "feat: add settings page, treatments page with file upload + Claude parsing"
```

---

### Task 8: Cleanup — Remove Old Files, Update Dependencies

**Files:**
- Remove: `app/page.module.css` (old styles, now in workspace pages)
- Remove: `app/api/blob-upload/route.ts`
- Remove: `app/api/transcribe/route.ts`
- Remove: `app/api/pdf/route.ts`
- Remove: `components/PDFDocument.tsx`
- Modify: `package.json` (remove @vercel/blob, @react-pdf/renderer)
- Modify: `app/api/admin/settings/route.ts` (add auth verification)
- Modify: `app/api/admin/treatments/route.ts` (add auth verification)
- Modify: `app/api/admin/treatments/[id]/route.ts` (add auth verification)
- Modify: `app/api/admin/templates/route.ts` (add auth verification)
- Modify: `app/api/admin/templates/[id]/route.ts` (add auth verification)
- Modify: `app/api/generate/route.ts` (add auth verification)
- Modify: `app/api/upload-audio/route.ts` (add auth verification)
- Modify: `app/api/match-treatments/route.ts` (add auth verification)
- Modify: `app/api/docx/route.ts` (add auth verification)
- Modify: `app/api/xlsx/route.ts` (add auth verification)

- [ ] **Step 1: Remove unused files**

```bash
rm -f app/api/blob-upload/route.ts
rm -f app/api/transcribe/route.ts
rm -f app/api/pdf/route.ts
rm -f components/PDFDocument.tsx
rm -f app/page.module.css
```

Remove empty directories if any remain.

- [ ] **Step 2: Remove unused dependencies**

```bash
npm uninstall @vercel/blob @react-pdf/renderer
```

- [ ] **Step 3: Add auth verification to all existing API routes**

For each API route file listed above, add at the start of each handler function:

```typescript
import { verifyAuth } from "@/lib/firebase";

// At start of handler:
await verifyAuth(request);
```

For admin routes that currently use `practiceRef` directly, update them to use `getPracticeRef(practiceId)` where `practiceId` comes from `verifyAuth()`. This means:
- Import `verifyAuth` and `getPracticeRef` from `@/lib/firebase`
- Replace `practiceRef.collection(...)` with `getPracticeRef(practiceId).collection(...)`

- [ ] **Step 4: Update root page.tsx to be minimal redirect**

Ensure `app/page.tsx` is just:
```tsx
import { redirect } from "next/navigation";
export default function Home() {
  redirect("/dashboard");
}
```

Remove any old imports, state, styles, or JSX.

- [ ] **Step 5: Full build verification**

Run: `npm run build`
Expected: Clean build with workspace routes and no old admin/pdf routes.

- [ ] **Step 6: Commit and push**

```bash
git add -A
git commit -m "chore: remove old files, add auth to all API routes, clean up deps"
git push
```

---

### Summary

| Task | What it builds |
|------|---------------|
| 1 | Firebase client SDK, auth hook, server auth verification, new types |
| 2 | Login page |
| 3 | Workspace layout + sidebar + auth gate + dashboard + stats API |
| 4 | Patient CRUD API routes + consultation save |
| 5 | Patients list page + patient detail page |
| 6 | Consultation page (relocated, with patient selection + save to Firestore) |
| 7 | Settings page (moved) + Treatments page (with .xlsx upload + Claude parsing) |
| 8 | Cleanup: remove old files, add auth to all routes, remove unused deps |

Tasks 1-2 are auth foundation. Task 3 is the workspace shell. Tasks 4-5 are patient management. Task 6 is the core consultation flow. Task 7 is treatment upload. Task 8 is cleanup.
