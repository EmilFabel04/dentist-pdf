# Firebase Admin + Treatment Management + Document Generation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Firebase Firestore for treatment/pricing/T&C storage, a polished admin UI, a treatment review step in the consultation flow, and .docx/.xlsx document generation replacing the current PDF output.

**Architecture:** Firebase Admin SDK (server-side only) connects to Firestore. Admin pages under `/admin` with a shared sidebar layout. The consultation flow gains a treatment review step between Claude analysis and document generation. `docx` and `exceljs` libraries generate the final downloadable files server-side.

**Tech Stack:** Next.js 14 App Router, firebase-admin, docx, exceljs, TypeScript

**Spec:** `docs/superpowers/specs/2026-04-19-firebase-admin-treatments-design.md`

---

### Task 1: Install Dependencies and Create Firebase Singleton

**Files:**
- Modify: `package.json`
- Create: `lib/firebase.ts`
- Modify: `.env.example`

- [ ] **Step 1: Install new dependencies**

Run:
```bash
npm install firebase-admin docx exceljs
```

- [ ] **Step 2: Add Firebase env vars to .env.example**

Append to `.env.example`:
```
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
```

- [ ] **Step 3: Create Firebase Admin singleton**

Create `lib/firebase.ts`:

```typescript
import { initializeApp, getApps, cert, type ServiceAccount } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const PRACTICE_ID = "default";

function getApp() {
  if (getApps().length > 0) return getApps()[0];

  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    } as ServiceAccount),
  });
}

export const db = getFirestore(getApp());
export const practiceRef = db.collection("practices").doc(PRACTICE_ID);
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds with no type errors.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json lib/firebase.ts .env.example
git commit -m "feat: add firebase-admin, docx, exceljs deps + Firebase singleton"
```

---

### Task 2: Create Shared Types

**Files:**
- Create: `lib/types.ts`

- [ ] **Step 1: Create shared type definitions**

Create `lib/types.ts`:

```typescript
export type TreatmentCode = {
  code: string;
  description: string;
  price: number;
};

export type Treatment = {
  id: string;
  name: string;
  category: string;
  codes: TreatmentCode[];
  termsAndConditions: string;
};

export type TemplateStyling = {
  primaryColor: string;
  logoPosition: "left" | "center" | "right";
  headerText: string;
};

export type Template = {
  id: string;
  name: string;
  type: "clinical" | "estimate";
  sections: string[];
  sectionOrder: number[];
  styling: TemplateStyling;
};

export type PracticeSettings = {
  name: string;
  logo: string;
  address: string;
  phone: string;
  email: string;
  vatNumber: string;
  currency: string;
  vatRate: number;
  quoteValidityDays: number;
  defaultPaymentTerms: string;
};

export type Report = {
  patientSummary: string;
  findings: {
    tooth: string;
    observation: string;
    severity: "normal" | "monitor" | "urgent";
  }[];
  recommendations: string[];
  followUp: string;
  suggestedTreatments: string[];
};

export type SelectedTreatment = {
  treatment: Treatment;
  selectedCodes: {
    code: string;
    description: string;
    price: number;
    quantity: number;
  }[];
};
```

- [ ] **Step 2: Update the generate route to use shared Report type**

In `app/api/generate/route.ts`, replace the local `Report` type export with a re-export:

```typescript
// Remove the local Report type definition (lines 23-28)
// Add this import at the top:
import type { Report } from "@/lib/types";

// Re-export for consumers:
export type { Report };
```

Keep the rest of the file unchanged.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds — the page.tsx already imports `Report` from the generate route, and it re-exports from types.

- [ ] **Step 4: Commit**

```bash
git add lib/types.ts app/api/generate/route.ts
git commit -m "feat: add shared type definitions for treatments, templates, settings"
```

---

### Task 3: Admin API — Practice Settings

**Files:**
- Create: `app/api/admin/settings/route.ts`

- [ ] **Step 1: Create settings GET/PUT route**

Create `app/api/admin/settings/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { practiceRef } from "@/lib/firebase";
import type { PracticeSettings } from "@/lib/types";

const DEFAULT_SETTINGS: PracticeSettings = {
  name: "",
  logo: "",
  address: "",
  phone: "",
  email: "",
  vatNumber: "",
  currency: "USD",
  vatRate: 0,
  quoteValidityDays: 30,
  defaultPaymentTerms: "",
};

export async function GET() {
  try {
    const doc = await practiceRef.get();
    const data = doc.exists ? (doc.data() as PracticeSettings) : DEFAULT_SETTINGS;
    return NextResponse.json(data);
  } catch (error) {
    console.error("[admin/settings] GET error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as Partial<PracticeSettings>;
    await practiceRef.set(body, { merge: true });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[admin/settings] PUT error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/settings/route.ts
git commit -m "feat: add admin settings API (GET/PUT)"
```

---

### Task 4: Admin API — Treatments CRUD

**Files:**
- Create: `app/api/admin/treatments/route.ts`
- Create: `app/api/admin/treatments/[id]/route.ts`

- [ ] **Step 1: Create treatments list + create route**

Create `app/api/admin/treatments/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { practiceRef } from "@/lib/firebase";
import type { Treatment } from "@/lib/types";

export async function GET() {
  try {
    const snapshot = await practiceRef.collection("treatments").orderBy("name").get();
    const treatments: Treatment[] = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Treatment[];
    return NextResponse.json(treatments);
  } catch (error) {
    console.error("[admin/treatments] GET error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Omit<Treatment, "id">;
    const ref = await practiceRef.collection("treatments").add(body);
    return NextResponse.json({ id: ref.id }, { status: 201 });
  } catch (error) {
    console.error("[admin/treatments] POST error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create single treatment PUT/DELETE route**

Create `app/api/admin/treatments/[id]/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { practiceRef } from "@/lib/firebase";
import type { Treatment } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = (await request.json()) as Omit<Treatment, "id">;
    await practiceRef.collection("treatments").doc(id).set(body);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[admin/treatments/id] PUT error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    await practiceRef.collection("treatments").doc(id).delete();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[admin/treatments/id] DELETE error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/treatments/
git commit -m "feat: add admin treatments CRUD API"
```

---

### Task 5: Admin API — Templates CRUD

**Files:**
- Create: `app/api/admin/templates/route.ts`
- Create: `app/api/admin/templates/[id]/route.ts`

- [ ] **Step 1: Create templates list + create route**

Create `app/api/admin/templates/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { practiceRef } from "@/lib/firebase";
import type { Template } from "@/lib/types";

export async function GET() {
  try {
    const snapshot = await practiceRef.collection("templates").orderBy("name").get();
    const templates: Template[] = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Template[];
    return NextResponse.json(templates);
  } catch (error) {
    console.error("[admin/templates] GET error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Omit<Template, "id">;
    const ref = await practiceRef.collection("templates").add(body);
    return NextResponse.json({ id: ref.id }, { status: 201 });
  } catch (error) {
    console.error("[admin/templates] POST error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create single template PUT/DELETE route**

Create `app/api/admin/templates/[id]/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { practiceRef } from "@/lib/firebase";
import type { Template } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = (await request.json()) as Omit<Template, "id">;
    await practiceRef.collection("templates").doc(id).set(body);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[admin/templates/id] PUT error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    await practiceRef.collection("templates").doc(id).delete();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[admin/templates/id] DELETE error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/templates/
git commit -m "feat: add admin templates CRUD API"
```

---

### Task 6: Admin Layout with Sidebar Navigation

**Files:**
- Create: `app/admin/layout.tsx`
- Create: `app/admin/layout.module.css`
- Create: `app/admin/page.tsx` (redirect to treatments)

- [ ] **Step 1: Create admin layout with sidebar**

Create `app/admin/layout.module.css`:

```css
.container {
  display: flex;
  min-height: 100vh;
}

.sidebar {
  width: 240px;
  background: #fff;
  border-right: 1px solid #e0e0e0;
  padding: 24px 0;
  flex-shrink: 0;
}

.logo {
  padding: 0 20px 20px;
  font-size: 1.1rem;
  font-weight: 700;
  color: #0f62fe;
  border-bottom: 1px solid #eee;
  margin-bottom: 8px;
}

.nav {
  list-style: none;
  padding: 0;
}

.navItem {
  display: block;
  width: 100%;
  padding: 12px 20px;
  border: none;
  background: none;
  text-align: left;
  font-size: 0.95rem;
  color: #333;
  text-decoration: none;
  transition: background 0.15s;
}

.navItem:hover {
  background: #f0f3f9;
}

.navItemActive {
  composes: navItem;
  background: #e8edff;
  color: #0f62fe;
  font-weight: 600;
  border-left: 3px solid #0f62fe;
}

.content {
  flex: 1;
  padding: 32px 40px;
  background: #f6f7f9;
  overflow-y: auto;
}
```

Create `app/admin/layout.tsx`:

```tsx
"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import styles from "./layout.module.css";

const NAV_ITEMS = [
  { href: "/admin/treatments", label: "Treatments" },
  { href: "/admin/templates", label: "Templates" },
  { href: "/admin/settings", label: "Settings" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className={styles.container}>
      <aside className={styles.sidebar}>
        <div className={styles.logo}>
          <Link href="/" style={{ color: "inherit", textDecoration: "none" }}>
            DentistPDF
          </Link>
        </div>
        <nav>
          <ul className={styles.nav}>
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={
                    pathname === item.href ? styles.navItemActive : styles.navItem
                  }
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <main className={styles.content}>{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Create admin index redirect**

Create `app/admin/page.tsx`:

```tsx
import { redirect } from "next/navigation";

export default function AdminPage() {
  redirect("/admin/treatments");
}
```

- [ ] **Step 3: Add admin link to main page**

In `app/page.tsx`, add a link to `/admin` in the header area. Inside the card div, after the subtitle paragraph:

```tsx
<p className={styles.subtitle}>
  Upload X-rays, record notes, and generate a patient report.
</p>
<a href="/admin" className={styles.adminLink}>Admin Panel</a>
```

Add to `app/page.module.css`:

```css
.adminLink {
  display: inline-block;
  margin-bottom: 24px;
  font-size: 0.85rem;
  color: #0f62fe;
  text-decoration: none;
}
.adminLink:hover {
  text-decoration: underline;
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add app/admin/ app/page.tsx app/page.module.css
git commit -m "feat: add admin layout with sidebar navigation"
```

---

### Task 7: Admin Settings Page

**Files:**
- Create: `app/admin/settings/page.tsx`
- Create: `app/admin/settings/page.module.css`

- [ ] **Step 1: Create settings page styles**

Create `app/admin/settings/page.module.css`:

```css
.page {
  max-width: 640px;
}

.heading {
  font-size: 1.5rem;
  margin-bottom: 24px;
}

.card {
  background: #fff;
  border-radius: 10px;
  padding: 24px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  margin-bottom: 24px;
}

.cardTitle {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 16px;
  color: #0f62fe;
}

.field {
  margin-bottom: 16px;
}

.fieldLabel {
  display: block;
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #555;
  margin-bottom: 4px;
}

.input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #d0d5dd;
  border-radius: 6px;
  font-size: 0.95rem;
  outline: none;
  font-family: inherit;
}

.input:focus {
  border-color: #0f62fe;
}

.textarea {
  composes: input;
  min-height: 80px;
  resize: vertical;
}

.row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.saveBtn {
  padding: 10px 24px;
  background: #0f62fe;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-weight: 600;
  font-size: 0.95rem;
  cursor: pointer;
}

.saveBtn:hover:not(:disabled) {
  background: #0043ce;
}

.saveBtn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.toast {
  margin-top: 12px;
  padding: 8px 12px;
  background: #defbe6;
  color: #198038;
  border-radius: 6px;
  font-size: 0.9rem;
}
```

- [ ] **Step 2: Create settings page component**

Create `app/admin/settings/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import type { PracticeSettings } from "@/lib/types";
import styles from "./page.module.css";

const EMPTY: PracticeSettings = {
  name: "",
  logo: "",
  address: "",
  phone: "",
  email: "",
  vatNumber: "",
  currency: "USD",
  vatRate: 0,
  quoteValidityDays: 30,
  defaultPaymentTerms: "",
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<PracticeSettings>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((data) => setSettings({ ...EMPTY, ...data }))
      .finally(() => setLoading(false));
  }, []);

  function update(field: keyof PracticeSettings, value: string | number) {
    setSettings((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    setSaving(false);
    setSaved(true);
  }

  if (loading) return <p>Loading…</p>;

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Practice Settings</h1>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Practice Details</h2>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>Practice Name</label>
          <input className={styles.input} value={settings.name} onChange={(e) => update("name", e.target.value)} />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>Address</label>
          <textarea className={styles.textarea} value={settings.address} onChange={(e) => update("address", e.target.value)} />
        </div>
        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Phone</label>
            <input className={styles.input} value={settings.phone} onChange={(e) => update("phone", e.target.value)} />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Email</label>
            <input className={styles.input} value={settings.email} onChange={(e) => update("email", e.target.value)} />
          </div>
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>VAT Number</label>
          <input className={styles.input} value={settings.vatNumber} onChange={(e) => update("vatNumber", e.target.value)} />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>Logo URL</label>
          <input className={styles.input} value={settings.logo} onChange={(e) => update("logo", e.target.value)} placeholder="https://..." />
        </div>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Billing</h2>
        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Currency</label>
            <input className={styles.input} value={settings.currency} onChange={(e) => update("currency", e.target.value)} />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>VAT Rate (%)</label>
            <input className={styles.input} type="number" step="0.01" value={settings.vatRate} onChange={(e) => update("vatRate", parseFloat(e.target.value) || 0)} />
          </div>
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>Quote Validity (days)</label>
          <input className={styles.input} type="number" value={settings.quoteValidityDays} onChange={(e) => update("quoteValidityDays", parseInt(e.target.value) || 30)} />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>Default Payment Terms</label>
          <textarea className={styles.textarea} value={settings.defaultPaymentTerms} onChange={(e) => update("defaultPaymentTerms", e.target.value)} />
        </div>
      </div>

      <button className={styles.saveBtn} onClick={save} disabled={saving}>
        {saving ? "Saving…" : "Save Settings"}
      </button>
      {saved && <p className={styles.toast}>Settings saved.</p>}
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add app/admin/settings/
git commit -m "feat: add admin settings page"
```

---

### Task 8: Admin Treatments Page

**Files:**
- Create: `app/admin/treatments/page.tsx`
- Create: `app/admin/treatments/page.module.css`

- [ ] **Step 1: Create treatments page styles**

Create `app/admin/treatments/page.module.css`:

```css
.page {
  max-width: 900px;
}

.heading {
  font-size: 1.5rem;
  margin-bottom: 4px;
}

.toolbar {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.searchInput {
  flex: 1;
  min-width: 200px;
  padding: 8px 12px;
  border: 1px solid #d0d5dd;
  border-radius: 6px;
  font-size: 0.95rem;
  outline: none;
  font-family: inherit;
}

.searchInput:focus {
  border-color: #0f62fe;
}

.filterSelect {
  padding: 8px 12px;
  border: 1px solid #d0d5dd;
  border-radius: 6px;
  font-size: 0.95rem;
  background: #fff;
  font-family: inherit;
}

.addBtn {
  padding: 8px 16px;
  background: #0f62fe;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}

.addBtn:hover {
  background: #0043ce;
}

.table {
  width: 100%;
  border-collapse: collapse;
  background: #fff;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.table th {
  text-align: left;
  padding: 12px 16px;
  background: #f0f3f9;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #555;
  font-weight: 600;
}

.table td {
  padding: 12px 16px;
  border-top: 1px solid #eee;
  font-size: 0.95rem;
}

.clickableRow {
  cursor: pointer;
  transition: background 0.1s;
}

.clickableRow:hover {
  background: #f8f9fc;
}

.expandedRow td {
  padding: 0;
  border-top: none;
}

.editor {
  padding: 20px;
  background: #fafbfd;
  border-top: 2px solid #0f62fe;
}

.editorGrid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 16px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.fieldLabel {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #555;
}

.input {
  padding: 8px 10px;
  border: 1px solid #d0d5dd;
  border-radius: 6px;
  font-size: 0.95rem;
  outline: none;
  font-family: inherit;
}

.input:focus {
  border-color: #0f62fe;
}

.textarea {
  composes: input;
  min-height: 60px;
  resize: vertical;
}

.codesHeading {
  font-size: 0.85rem;
  font-weight: 600;
  margin-bottom: 8px;
  color: #333;
}

.codesTable {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 12px;
}

.codesTable th {
  text-align: left;
  padding: 6px 8px;
  font-size: 0.75rem;
  text-transform: uppercase;
  color: #777;
}

.codesTable td {
  padding: 4px 8px;
  border-top: 1px solid #eee;
}

.codesTable input {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid #d0d5dd;
  border-radius: 4px;
  font-size: 0.9rem;
  font-family: inherit;
}

.codesTable input:focus {
  border-color: #0f62fe;
  outline: none;
}

.smallBtn {
  padding: 4px 10px;
  border: 1px solid #d0d5dd;
  border-radius: 4px;
  background: #fff;
  font-size: 0.85rem;
  cursor: pointer;
}

.smallBtn:hover {
  background: #f0f3f9;
}

.editorActions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}

.saveBtn {
  padding: 8px 16px;
  background: #198038;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
}

.saveBtn:hover {
  background: #0e6027;
}

.cancelBtn {
  padding: 8px 16px;
  background: #fff;
  color: #333;
  border: 1px solid #d0d5dd;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
}

.cancelBtn:hover {
  background: #f0f3f9;
}

.deleteBtn {
  padding: 8px 16px;
  background: #fff;
  color: #da1e28;
  border: 1px solid #da1e28;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  margin-left: auto;
}

.deleteBtn:hover {
  background: #fff1f1;
}

.category {
  display: inline-block;
  padding: 2px 8px;
  background: #e8edff;
  color: #0f62fe;
  border-radius: 4px;
  font-size: 0.8rem;
  font-weight: 500;
}

.priceRange {
  color: #555;
  font-size: 0.9rem;
}

.empty {
  text-align: center;
  padding: 40px;
  color: #888;
}
```

- [ ] **Step 2: Create treatments page component**

Create `app/admin/treatments/page.tsx`:

```tsx
"use client";

import { useEffect, useState, useMemo } from "react";
import type { Treatment, TreatmentCode } from "@/lib/types";
import styles from "./page.module.css";

type EditState = Omit<Treatment, "id"> & { id?: string };

const EMPTY_TREATMENT: EditState = {
  name: "",
  category: "",
  codes: [{ code: "", description: "", price: 0 }],
  termsAndConditions: "",
};

const CATEGORIES = [
  "preventive",
  "restorative",
  "endodontic",
  "periodontal",
  "prosthodontic",
  "surgical",
  "orthodontic",
  "diagnostic",
  "other",
];

export default function TreatmentsPage() {
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [isNew, setIsNew] = useState(false);

  useEffect(() => {
    loadTreatments();
  }, []);

  async function loadTreatments() {
    setLoading(true);
    const res = await fetch("/api/admin/treatments");
    const data = (await res.json()) as Treatment[];
    setTreatments(data);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    let list = treatments;
    if (catFilter) list = list.filter((t) => t.category === catFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.codes.some((c) => c.code.toLowerCase().includes(q) || c.description.toLowerCase().includes(q))
      );
    }
    return list;
  }, [treatments, search, catFilter]);

  const usedCategories = useMemo(
    () => [...new Set(treatments.map((t) => t.category))].sort(),
    [treatments]
  );

  function startAdd() {
    setIsNew(true);
    setExpandedId("__new__");
    setEditState({ ...EMPTY_TREATMENT, codes: [{ code: "", description: "", price: 0 }] });
  }

  function startEdit(t: Treatment) {
    if (expandedId === t.id) {
      setExpandedId(null);
      setEditState(null);
      return;
    }
    setIsNew(false);
    setExpandedId(t.id);
    setEditState({ ...t, codes: t.codes.map((c) => ({ ...c })) });
  }

  function cancel() {
    setExpandedId(null);
    setEditState(null);
    setIsNew(false);
  }

  function updateField(field: keyof EditState, value: string) {
    if (!editState) return;
    setEditState({ ...editState, [field]: value });
  }

  function updateCode(idx: number, field: keyof TreatmentCode, value: string | number) {
    if (!editState) return;
    const codes = [...editState.codes];
    codes[idx] = { ...codes[idx], [field]: value };
    setEditState({ ...editState, codes });
  }

  function addCode() {
    if (!editState) return;
    setEditState({
      ...editState,
      codes: [...editState.codes, { code: "", description: "", price: 0 }],
    });
  }

  function removeCode(idx: number) {
    if (!editState) return;
    setEditState({
      ...editState,
      codes: editState.codes.filter((_, i) => i !== idx),
    });
  }

  async function save() {
    if (!editState) return;
    const body = {
      name: editState.name,
      category: editState.category,
      codes: editState.codes,
      termsAndConditions: editState.termsAndConditions,
    };

    if (isNew) {
      await fetch("/api/admin/treatments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } else if (editState.id) {
      await fetch(`/api/admin/treatments/${editState.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }

    cancel();
    await loadTreatments();
  }

  async function deleteTreatment() {
    if (!editState?.id || !confirm("Delete this treatment?")) return;
    await fetch(`/api/admin/treatments/${editState.id}`, { method: "DELETE" });
    cancel();
    await loadTreatments();
  }

  function priceRange(codes: TreatmentCode[]) {
    if (codes.length === 0) return "—";
    const prices = codes.map((c) => c.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return min === max ? `$${min}` : `$${min} – $${max}`;
  }

  if (loading) return <p>Loading…</p>;

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Treatments</h1>

      <div className={styles.toolbar}>
        <input
          className={styles.searchInput}
          placeholder="Search by name or code…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className={styles.filterSelect} value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
          <option value="">All categories</option>
          {usedCategories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <button className={styles.addBtn} onClick={startAdd}>+ Add Treatment</button>
      </div>

      <table className={styles.table}>
        <thead>
          <tr>
            <th>Treatment</th>
            <th>Category</th>
            <th>Codes</th>
            <th>Price Range</th>
          </tr>
        </thead>
        <tbody>
          {isNew && expandedId === "__new__" && editState && (
            <tr className={styles.expandedRow}>
              <td colSpan={4}>
                <EditorPanel
                  state={editState}
                  isNew={true}
                  categories={CATEGORIES}
                  onUpdateField={updateField}
                  onUpdateCode={updateCode}
                  onAddCode={addCode}
                  onRemoveCode={removeCode}
                  onSave={save}
                  onCancel={cancel}
                  onDelete={deleteTreatment}
                />
              </td>
            </tr>
          )}
          {filtered.length === 0 && (
            <tr><td colSpan={4} className={styles.empty}>No treatments found.</td></tr>
          )}
          {filtered.map((t) => (
            <>
              <tr key={t.id} className={styles.clickableRow} onClick={() => startEdit(t)}>
                <td><strong>{t.name}</strong></td>
                <td><span className={styles.category}>{t.category}</span></td>
                <td>{t.codes.length}</td>
                <td className={styles.priceRange}>{priceRange(t.codes)}</td>
              </tr>
              {expandedId === t.id && editState && (
                <tr key={`${t.id}-editor`} className={styles.expandedRow}>
                  <td colSpan={4}>
                    <EditorPanel
                      state={editState}
                      isNew={false}
                      categories={CATEGORIES}
                      onUpdateField={updateField}
                      onUpdateCode={updateCode}
                      onAddCode={addCode}
                      onRemoveCode={removeCode}
                      onSave={save}
                      onCancel={cancel}
                      onDelete={deleteTreatment}
                    />
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EditorPanel({
  state,
  isNew,
  categories,
  onUpdateField,
  onUpdateCode,
  onAddCode,
  onRemoveCode,
  onSave,
  onCancel,
  onDelete,
}: {
  state: EditState;
  isNew: boolean;
  categories: string[];
  onUpdateField: (field: keyof EditState, value: string) => void;
  onUpdateCode: (idx: number, field: keyof TreatmentCode, value: string | number) => void;
  onAddCode: () => void;
  onRemoveCode: (idx: number) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  return (
    <div className={styles.editor}>
      <div className={styles.editorGrid}>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>Name</label>
          <input className={styles.input} value={state.name} onChange={(e) => onUpdateField("name", e.target.value)} />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>Category</label>
          <select className={styles.input} value={state.category} onChange={(e) => onUpdateField("category", e.target.value)}>
            <option value="">Select…</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      <p className={styles.codesHeading}>Procedure Codes</p>
      <table className={styles.codesTable}>
        <thead>
          <tr>
            <th>Code</th>
            <th>Description</th>
            <th>Price</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {state.codes.map((c, i) => (
            <tr key={i}>
              <td><input value={c.code} onChange={(e) => onUpdateCode(i, "code", e.target.value)} /></td>
              <td><input value={c.description} onChange={(e) => onUpdateCode(i, "description", e.target.value)} /></td>
              <td><input type="number" value={c.price} onChange={(e) => onUpdateCode(i, "price", parseFloat(e.target.value) || 0)} /></td>
              <td><button className={styles.smallBtn} onClick={() => onRemoveCode(i)} type="button">×</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className={styles.smallBtn} onClick={onAddCode} type="button">+ Add Code</button>

      <div className={styles.field} style={{ marginTop: 16 }}>
        <label className={styles.fieldLabel}>Terms & Conditions</label>
        <textarea className={styles.textarea} value={state.termsAndConditions} onChange={(e) => onUpdateField("termsAndConditions", e.target.value)} />
      </div>

      <div className={styles.editorActions}>
        <button className={styles.saveBtn} onClick={onSave}>{isNew ? "Create" : "Save"}</button>
        <button className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
        {!isNew && <button className={styles.deleteBtn} onClick={onDelete}>Delete</button>}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add app/admin/treatments/
git commit -m "feat: add admin treatments page with inline editing"
```

---

### Task 9: Admin Templates Page

**Files:**
- Create: `app/admin/templates/page.tsx`
- Create: `app/admin/templates/page.module.css`

- [ ] **Step 1: Create templates page styles**

Create `app/admin/templates/page.module.css`:

```css
.page {
  max-width: 800px;
}

.heading {
  font-size: 1.5rem;
  margin-bottom: 20px;
}

.toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 16px;
}

.addBtn {
  padding: 8px 16px;
  background: #0f62fe;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
}

.addBtn:hover {
  background: #0043ce;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.card {
  background: #fff;
  border-radius: 10px;
  padding: 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  cursor: pointer;
  transition: box-shadow 0.15s;
}

.card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.cardHeader {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.cardName {
  font-weight: 600;
  font-size: 1rem;
}

.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.8rem;
  font-weight: 500;
}

.badgeClinical {
  composes: badge;
  background: #e8edff;
  color: #0f62fe;
}

.badgeEstimate {
  composes: badge;
  background: #defbe6;
  color: #198038;
}

.editor {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #eee;
}

.field {
  margin-bottom: 14px;
}

.fieldLabel {
  display: block;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #555;
  margin-bottom: 4px;
}

.input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #d0d5dd;
  border-radius: 6px;
  font-size: 0.95rem;
  outline: none;
  font-family: inherit;
}

.input:focus {
  border-color: #0f62fe;
}

.row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 12px;
}

.sectionsList {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 4px;
}

.sectionItem {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: #f6f7f9;
  border-radius: 4px;
}

.sectionItem label {
  flex: 1;
  font-size: 0.9rem;
}

.moveBtn {
  padding: 2px 6px;
  border: 1px solid #d0d5dd;
  border-radius: 3px;
  background: #fff;
  cursor: pointer;
  font-size: 0.8rem;
}

.moveBtn:hover {
  background: #e8edff;
}

.actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}

.saveBtn {
  padding: 8px 16px;
  background: #198038;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
}

.saveBtn:hover {
  background: #0e6027;
}

.cancelBtn {
  padding: 8px 16px;
  background: #fff;
  color: #333;
  border: 1px solid #d0d5dd;
  border-radius: 6px;
  cursor: pointer;
}

.deleteBtn {
  padding: 8px 16px;
  background: #fff;
  color: #da1e28;
  border: 1px solid #da1e28;
  border-radius: 6px;
  cursor: pointer;
  margin-left: auto;
}

.deleteBtn:hover {
  background: #fff1f1;
}

.empty {
  text-align: center;
  padding: 40px;
  color: #888;
}
```

- [ ] **Step 2: Create templates page component**

Create `app/admin/templates/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import type { Template, TemplateStyling } from "@/lib/types";
import styles from "./page.module.css";

const ALL_SECTIONS = ["header", "summary", "findings", "recommendations", "followUp", "xrays"];

const EMPTY_TEMPLATE: Omit<Template, "id"> = {
  name: "",
  type: "clinical",
  sections: [...ALL_SECTIONS],
  sectionOrder: ALL_SECTIONS.map((_, i) => i),
  styling: { primaryColor: "#0f62fe", logoPosition: "left", headerText: "" },
};

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [editState, setEditState] = useState<Omit<Template, "id"> | null>(null);
  const [isNew, setIsNew] = useState(false);

  useEffect(() => {
    loadTemplates();
  }, []);

  async function loadTemplates() {
    setLoading(true);
    const res = await fetch("/api/admin/templates");
    setTemplates(await res.json());
    setLoading(false);
  }

  function startAdd() {
    setIsNew(true);
    setEditId("__new__");
    setEditState({ ...EMPTY_TEMPLATE, sections: [...ALL_SECTIONS], sectionOrder: ALL_SECTIONS.map((_, i) => i), styling: { ...EMPTY_TEMPLATE.styling } });
  }

  function startEdit(t: Template) {
    if (editId === t.id) { cancel(); return; }
    setIsNew(false);
    setEditId(t.id);
    setEditState({ name: t.name, type: t.type, sections: [...t.sections], sectionOrder: [...t.sectionOrder], styling: { ...t.styling } });
  }

  function cancel() {
    setEditId(null);
    setEditState(null);
    setIsNew(false);
  }

  function toggleSection(section: string) {
    if (!editState) return;
    const has = editState.sections.includes(section);
    if (has) {
      const idx = editState.sections.indexOf(section);
      const sections = editState.sections.filter((s) => s !== section);
      const sectionOrder = editState.sectionOrder.filter((_, i) => i !== idx);
      setEditState({ ...editState, sections, sectionOrder });
    } else {
      setEditState({
        ...editState,
        sections: [...editState.sections, section],
        sectionOrder: [...editState.sectionOrder, editState.sections.length],
      });
    }
  }

  function moveSection(idx: number, dir: -1 | 1) {
    if (!editState) return;
    const target = idx + dir;
    if (target < 0 || target >= editState.sections.length) return;
    const sections = [...editState.sections];
    const sectionOrder = [...editState.sectionOrder];
    [sections[idx], sections[target]] = [sections[target], sections[idx]];
    [sectionOrder[idx], sectionOrder[target]] = [sectionOrder[target], sectionOrder[idx]];
    setEditState({ ...editState, sections, sectionOrder });
  }

  function updateStyling(field: keyof TemplateStyling, value: string) {
    if (!editState) return;
    setEditState({ ...editState, styling: { ...editState.styling, [field]: value } });
  }

  async function save() {
    if (!editState) return;
    const body = { name: editState.name, type: editState.type, sections: editState.sections, sectionOrder: editState.sectionOrder, styling: editState.styling };
    if (isNew) {
      await fetch("/api/admin/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } else if (editId) {
      await fetch(`/api/admin/templates/${editId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    }
    cancel();
    await loadTemplates();
  }

  async function deleteTemplate() {
    if (!editId || editId === "__new__" || !confirm("Delete this template?")) return;
    await fetch(`/api/admin/templates/${editId}`, { method: "DELETE" });
    cancel();
    await loadTemplates();
  }

  if (loading) return <p>Loading…</p>;

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Report Templates</h1>
      <div className={styles.toolbar}>
        <button className={styles.addBtn} onClick={startAdd}>+ Add Template</button>
      </div>

      <div className={styles.list}>
        {isNew && editId === "__new__" && editState && (
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardName}>New Template</span>
            </div>
            <TemplateEditor
              state={editState}
              isNew={true}
              onChangeName={(v) => setEditState({ ...editState, name: v })}
              onChangeType={(v) => setEditState({ ...editState, type: v as "clinical" | "estimate" })}
              onToggleSection={toggleSection}
              onMoveSection={moveSection}
              onUpdateStyling={updateStyling}
              onSave={save}
              onCancel={cancel}
              onDelete={deleteTemplate}
            />
          </div>
        )}

        {templates.length === 0 && !isNew && (
          <p className={styles.empty}>No templates yet.</p>
        )}

        {templates.map((t) => (
          <div key={t.id} className={styles.card} onClick={() => startEdit(t)}>
            <div className={styles.cardHeader}>
              <span className={styles.cardName}>{t.name}</span>
              <span className={t.type === "clinical" ? styles.badgeClinical : styles.badgeEstimate}>
                {t.type}
              </span>
            </div>
            {editId === t.id && editState && (
              <div onClick={(e) => e.stopPropagation()}>
                <TemplateEditor
                  state={editState}
                  isNew={false}
                  onChangeName={(v) => setEditState({ ...editState, name: v })}
                  onChangeType={(v) => setEditState({ ...editState, type: v as "clinical" | "estimate" })}
                  onToggleSection={toggleSection}
                  onMoveSection={moveSection}
                  onUpdateStyling={updateStyling}
                  onSave={save}
                  onCancel={cancel}
                  onDelete={deleteTemplate}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function TemplateEditor({
  state,
  isNew,
  onChangeName,
  onChangeType,
  onToggleSection,
  onMoveSection,
  onUpdateStyling,
  onSave,
  onCancel,
  onDelete,
}: {
  state: Omit<Template, "id">;
  isNew: boolean;
  onChangeName: (v: string) => void;
  onChangeType: (v: string) => void;
  onToggleSection: (s: string) => void;
  onMoveSection: (idx: number, dir: -1 | 1) => void;
  onUpdateStyling: (field: keyof TemplateStyling, value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  return (
    <div className={styles.editor}>
      <div className={styles.field}>
        <label className={styles.fieldLabel}>Template Name</label>
        <input className={styles.input} value={state.name} onChange={(e) => onChangeName(e.target.value)} />
      </div>
      <div className={styles.field}>
        <label className={styles.fieldLabel}>Type</label>
        <select className={styles.input} value={state.type} onChange={(e) => onChangeType(e.target.value)}>
          <option value="clinical">Clinical Report</option>
          <option value="estimate">Cost Estimate</option>
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel}>Sections (toggle & reorder)</label>
        <div className={styles.sectionsList}>
          {state.sections.map((section, idx) => (
            <div key={section} className={styles.sectionItem}>
              <input type="checkbox" checked={true} onChange={() => onToggleSection(section)} />
              <label>{section}</label>
              <button className={styles.moveBtn} onClick={() => onMoveSection(idx, -1)} disabled={idx === 0}>↑</button>
              <button className={styles.moveBtn} onClick={() => onMoveSection(idx, 1)} disabled={idx === state.sections.length - 1}>↓</button>
            </div>
          ))}
          {ALL_SECTIONS.filter((s) => !state.sections.includes(s)).map((section) => (
            <div key={section} className={styles.sectionItem} style={{ opacity: 0.5 }}>
              <input type="checkbox" checked={false} onChange={() => onToggleSection(section)} />
              <label>{section}</label>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>Primary Color</label>
          <input className={styles.input} type="color" value={state.styling.primaryColor} onChange={(e) => onUpdateStyling("primaryColor", e.target.value)} />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>Logo Position</label>
          <select className={styles.input} value={state.styling.logoPosition} onChange={(e) => onUpdateStyling("logoPosition", e.target.value)}>
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>Header Text</label>
          <input className={styles.input} value={state.styling.headerText} onChange={(e) => onUpdateStyling("headerText", e.target.value)} />
        </div>
      </div>

      <div className={styles.actions}>
        <button className={styles.saveBtn} onClick={onSave}>{isNew ? "Create" : "Save"}</button>
        <button className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
        {!isNew && <button className={styles.deleteBtn} onClick={onDelete}>Delete</button>}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add app/admin/templates/
git commit -m "feat: add admin templates page with section ordering"
```

---

### Task 10: Update Claude Generate Route with suggestedTreatments

**Files:**
- Modify: `app/api/generate/route.ts`

- [ ] **Step 1: Update system prompt and Report type**

In `app/api/generate/route.ts`, update the `SYSTEM_PROMPT` to request `suggestedTreatments`:

```typescript
const SYSTEM_PROMPT = `You are a dental consultation assistant. Given a transcript of a dentist's consultation notes and X-ray images, extract and structure the following as JSON:
{
  patientSummary: string,
  findings: [{ tooth: string, observation: string, severity: 'normal' | 'monitor' | 'urgent' }],
  recommendations: string[],
  followUp: string,
  suggestedTreatments: string[]
}
suggestedTreatments should list treatment type names mentioned or implied in the transcript (e.g. "Crown", "Root Canal", "Filling", "Implant", "Extraction", "Cleaning").
Be clinical and concise. Do not invent findings not mentioned in the transcript or visible in the images.`;
```

The `Report` type in `lib/types.ts` already includes `suggestedTreatments: string[]` from Task 2, so no type change needed.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add app/api/generate/route.ts
git commit -m "feat: update Claude prompt to extract suggestedTreatments"
```

---

### Task 11: Treatment Matching API

**Files:**
- Create: `app/api/match-treatments/route.ts`

- [ ] **Step 1: Create fuzzy-match endpoint**

Create `app/api/match-treatments/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { practiceRef } from "@/lib/firebase";
import type { Treatment } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const { suggestedTreatments } = (await request.json()) as {
      suggestedTreatments: string[];
    };

    const snapshot = await practiceRef.collection("treatments").get();
    const allTreatments: Treatment[] = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Treatment[];

    const matched: Treatment[] = [];
    const used = new Set<string>();

    for (const suggestion of suggestedTreatments) {
      const lower = suggestion.toLowerCase();
      const match = allTreatments.find(
        (t) =>
          !used.has(t.id) &&
          (t.name.toLowerCase().includes(lower) ||
            lower.includes(t.name.toLowerCase()) ||
            t.codes.some(
              (c) =>
                c.description.toLowerCase().includes(lower) ||
                lower.includes(c.description.toLowerCase())
            ))
      );
      if (match) {
        matched.push(match);
        used.add(match.id);
      }
    }

    return NextResponse.json({ matched, all: allTreatments });
  } catch (error) {
    console.error("[match-treatments] error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add app/api/match-treatments/route.ts
git commit -m "feat: add treatment matching API for auto-suggest"
```

---

### Task 12: DOCX Generation Route

**Files:**
- Create: `app/api/docx/route.ts`

- [ ] **Step 1: Create DOCX generation endpoint**

Create `app/api/docx/route.ts`:

```typescript
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
import { NextResponse } from "next/server";
import type { Report } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  patientName: string;
  date: string;
  report: Report;
  imageDataUrls?: string[];
  practice?: {
    name: string;
    address: string;
    phone: string;
    email: string;
  };
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const { patientName, date, report, imageDataUrls, practice } = body;

    const children: (Paragraph | Table)[] = [];

    // Practice header
    if (practice?.name) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: practice.name, bold: true, size: 32, color: "0f62fe" })],
          spacing: { after: 100 },
        })
      );
      if (practice.address) {
        children.push(new Paragraph({ children: [new TextRun({ text: practice.address, size: 20, color: "555555" })], spacing: { after: 40 } }));
      }
      if (practice.phone || practice.email) {
        children.push(new Paragraph({ children: [new TextRun({ text: [practice.phone, practice.email].filter(Boolean).join(" | "), size: 20, color: "555555" })], spacing: { after: 200 } }));
      }
    }

    // Patient info
    children.push(
      new Paragraph({
        children: [new TextRun({ text: "Consultation Report", bold: true, size: 36 })],
        spacing: { after: 200 },
      })
    );
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: "Patient: ", bold: true, size: 22 }),
          new TextRun({ text: patientName || "—", size: 22 }),
          new TextRun({ text: "    Date: ", bold: true, size: 22 }),
          new TextRun({ text: date, size: 22 }),
        ],
        spacing: { after: 300 },
      })
    );

    // Summary
    children.push(sectionHeading("Patient Summary"));
    children.push(new Paragraph({ children: [new TextRun({ text: report.patientSummary, size: 22 })], spacing: { after: 200 } }));

    // Findings table
    children.push(sectionHeading("Findings"));
    const severityColor = (s: string) => (s === "urgent" ? "da1e28" : s === "monitor" ? "d2a106" : "198038");
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            tableHeader: true,
            children: [
              headerCell("Tooth", 20),
              headerCell("Observation", 55),
              headerCell("Severity", 25),
            ],
          }),
          ...report.findings.map(
            (f) =>
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
                            text: f.severity.toUpperCase(),
                            bold: f.severity === "urgent",
                            color: severityColor(f.severity),
                            size: 20,
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              })
          ),
        ],
      })
    );
    children.push(new Paragraph({ spacing: { after: 200 }, children: [] }));

    // Recommendations
    children.push(sectionHeading("Recommendations"));
    for (const rec of report.recommendations) {
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          children: [new TextRun({ text: rec, size: 22 })],
          spacing: { after: 60 },
        })
      );
    }
    children.push(new Paragraph({ spacing: { after: 200 }, children: [] }));

    // Follow-up
    children.push(sectionHeading("Follow-up"));
    children.push(new Paragraph({ children: [new TextRun({ text: report.followUp, size: 22 })], spacing: { after: 200 } }));

    // X-ray images
    if (imageDataUrls && imageDataUrls.length > 0) {
      children.push(sectionHeading("X-ray Images"));
      for (let i = 0; i < imageDataUrls.length; i++) {
        const dataUrl = imageDataUrls[i];
        const commaIdx = dataUrl.indexOf(",");
        if (commaIdx === -1) continue;
        const base64 = dataUrl.slice(commaIdx + 1);
        const buffer = Buffer.from(base64, "base64");
        children.push(
          new Paragraph({
            children: [
              new ImageRun({
                type: "png",
                data: buffer,
                transformation: { width: 400, height: 300 },
              }),
            ],
            spacing: { after: 60 },
          })
        );
        children.push(
          new Paragraph({
            children: [new TextRun({ text: `X-ray ${i + 1}`, italics: true, size: 18, color: "777777" })],
            spacing: { after: 200 },
          })
        );
      }
    }

    const doc = new Document({
      sections: [
        {
          headers: {
            default: new Header({
              children: [
                new Paragraph({
                  children: [new TextRun({ text: practice?.name || "Dental Practice", color: "999999", size: 16 })],
                  alignment: AlignmentType.RIGHT,
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
                    new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "999999" }),
                    new TextRun({ text: ` of `, size: 16, color: "999999" }),
                    new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: "999999" }),
                    new TextRun({ text: `  |  Generated ${date}`, size: 16, color: "999999" }),
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
    const filename = `consultation-${slug(patientName)}-${date}.docx`;

    return new Response(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("[docx] error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

function sectionHeading(text: string) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 26, color: "0f62fe" })],
    spacing: { before: 200, after: 100 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: "0f62fe" } },
  });
}

function headerCell(text: string, width: number) {
  return new TableCell({
    width: { size: width, type: WidthType.PERCENTAGE },
    shading: { fill: "f0f3f9" },
    children: [
      new Paragraph({ children: [new TextRun({ text, bold: true, size: 20 })] }),
    ],
  });
}

function dataCell(text: string, width: number) {
  return new TableCell({
    width: { size: width, type: WidthType.PERCENTAGE },
    children: [new Paragraph({ children: [new TextRun({ text, size: 20 })] })],
  });
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "patient";
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add app/api/docx/route.ts
git commit -m "feat: add DOCX clinical report generation"
```

---

### Task 13: XLSX Generation Route

**Files:**
- Create: `app/api/xlsx/route.ts`

- [ ] **Step 1: Create XLSX generation endpoint**

Create `app/api/xlsx/route.ts`:

```typescript
import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import type { SelectedTreatment, PracticeSettings } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  patientName: string;
  date: string;
  quoteRef: string;
  selectedTreatments: SelectedTreatment[];
  settings: PracticeSettings;
  discount?: number;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const { patientName, date, quoteRef, selectedTreatments, settings, discount } = body;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = settings.name || "Dental Practice";
    workbook.created = new Date();

    // ── Sheet 1: Estimate ──
    const ws = workbook.addWorksheet("Estimate");
    ws.columns = [
      { key: "code", width: 14 },
      { key: "description", width: 40 },
      { key: "qty", width: 8 },
      { key: "price", width: 14 },
      { key: "total", width: 14 },
    ];

    const currency = settings.currency || "USD";
    const fmt = `"${currency}" #,##0.00`;

    // Practice header
    ws.mergeCells("A1:E1");
    const h1 = ws.getCell("A1");
    h1.value = settings.name || "Dental Practice";
    h1.font = { bold: true, size: 16, color: { argb: "FF0f62fe" } };

    ws.mergeCells("A2:E2");
    ws.getCell("A2").value = settings.address || "";
    ws.getCell("A2").font = { size: 10, color: { argb: "FF555555" } };

    ws.mergeCells("A3:E3");
    ws.getCell("A3").value = [settings.phone, settings.email].filter(Boolean).join(" | ");
    ws.getCell("A3").font = { size: 10, color: { argb: "FF555555" } };

    // Patient + quote info
    const r5 = ws.getRow(5);
    r5.getCell(1).value = "Patient:";
    r5.getCell(1).font = { bold: true };
    r5.getCell(2).value = patientName;
    r5.getCell(4).value = "Date:";
    r5.getCell(4).font = { bold: true };
    r5.getCell(5).value = date;

    const r6 = ws.getRow(6);
    r6.getCell(1).value = "Quote Ref:";
    r6.getCell(1).font = { bold: true };
    r6.getCell(2).value = quoteRef;

    // Column headers
    let row = 8;
    const headerRow = ws.getRow(row);
    ["Code", "Description", "Qty", "Unit Price", "Line Total"].forEach((text, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = text;
      cell.font = { bold: true, size: 10, color: { argb: "FF333333" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFf0f3f9" } };
      cell.border = { bottom: { style: "thin", color: { argb: "FFdddddd" } } };
    });
    row++;

    let grandTotal = 0;

    // Group by treatment
    for (const st of selectedTreatments) {
      // Group header
      ws.mergeCells(row, 1, row, 5);
      const groupCell = ws.getCell(row, 1);
      groupCell.value = st.treatment.name;
      groupCell.font = { bold: true, size: 11, color: { argb: "FF0f62fe" } };
      groupCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFe8edff" } };
      row++;

      let groupTotal = 0;
      for (const code of st.selectedCodes) {
        const lineTotal = code.price * code.quantity;
        groupTotal += lineTotal;
        const dataRow = ws.getRow(row);
        dataRow.getCell(1).value = code.code;
        dataRow.getCell(2).value = code.description;
        dataRow.getCell(3).value = code.quantity;
        dataRow.getCell(3).alignment = { horizontal: "center" };
        dataRow.getCell(4).value = code.price;
        dataRow.getCell(4).numFmt = fmt;
        dataRow.getCell(5).value = lineTotal;
        dataRow.getCell(5).numFmt = fmt;
        row++;
      }

      // Subtotal
      const subRow = ws.getRow(row);
      ws.mergeCells(row, 1, row, 4);
      subRow.getCell(1).value = `Subtotal — ${st.treatment.name}`;
      subRow.getCell(1).font = { italic: true, size: 10 };
      subRow.getCell(1).alignment = { horizontal: "right" };
      subRow.getCell(5).value = groupTotal;
      subRow.getCell(5).numFmt = fmt;
      subRow.getCell(5).font = { bold: true };
      subRow.getCell(5).border = { top: { style: "thin", color: { argb: "FFdddddd" } } };
      grandTotal += groupTotal;
      row++;
      row++; // blank row between groups
    }

    // Discount
    if (discount && discount > 0) {
      const discRow = ws.getRow(row);
      ws.mergeCells(row, 1, row, 4);
      discRow.getCell(1).value = "Discount";
      discRow.getCell(1).alignment = { horizontal: "right" };
      discRow.getCell(1).font = { bold: true };
      discRow.getCell(5).value = -discount;
      discRow.getCell(5).numFmt = fmt;
      discRow.getCell(5).font = { bold: true, color: { argb: "FF198038" } };
      grandTotal -= discount;
      row++;
    }

    // Grand total
    const gtRow = ws.getRow(row);
    ws.mergeCells(row, 1, row, 4);
    gtRow.getCell(1).value = "Grand Total (excl. VAT)";
    gtRow.getCell(1).alignment = { horizontal: "right" };
    gtRow.getCell(1).font = { bold: true, size: 12 };
    gtRow.getCell(5).value = grandTotal;
    gtRow.getCell(5).numFmt = fmt;
    gtRow.getCell(5).font = { bold: true, size: 12 };
    gtRow.getCell(5).border = { top: { style: "double", color: { argb: "FF000000" } } };
    row++;

    // VAT
    if (settings.vatRate > 0) {
      const vatAmt = grandTotal * settings.vatRate;
      const vatRow = ws.getRow(row);
      ws.mergeCells(row, 1, row, 4);
      vatRow.getCell(1).value = `VAT (${(settings.vatRate * 100).toFixed(0)}%)`;
      vatRow.getCell(1).alignment = { horizontal: "right" };
      vatRow.getCell(5).value = vatAmt;
      vatRow.getCell(5).numFmt = fmt;
      row++;

      const finalRow = ws.getRow(row);
      ws.mergeCells(row, 1, row, 4);
      finalRow.getCell(1).value = "Total (incl. VAT)";
      finalRow.getCell(1).alignment = { horizontal: "right" };
      finalRow.getCell(1).font = { bold: true, size: 14 };
      finalRow.getCell(5).value = grandTotal + vatAmt;
      finalRow.getCell(5).numFmt = fmt;
      finalRow.getCell(5).font = { bold: true, size: 14 };
      row++;
    }

    // Quote validity + payment terms
    row++;
    if (settings.quoteValidityDays) {
      ws.mergeCells(row, 1, row, 5);
      ws.getCell(row, 1).value = `This quote is valid for ${settings.quoteValidityDays} days from ${date}.`;
      ws.getCell(row, 1).font = { italic: true, size: 10, color: { argb: "FF555555" } };
      row++;
    }
    if (settings.defaultPaymentTerms) {
      ws.mergeCells(row, 1, row, 5);
      ws.getCell(row, 1).value = `Payment terms: ${settings.defaultPaymentTerms}`;
      ws.getCell(row, 1).font = { italic: true, size: 10, color: { argb: "FF555555" } };
    }

    // ── Sheet 2: Terms & Conditions ──
    const tcSheet = workbook.addWorksheet("Terms & Conditions");
    tcSheet.columns = [{ key: "text", width: 80 }];
    let tcRow = 1;

    tcSheet.getCell(tcRow, 1).value = "Terms & Conditions";
    tcSheet.getCell(tcRow, 1).font = { bold: true, size: 16, color: { argb: "FF0f62fe" } };
    tcRow += 2;

    for (const st of selectedTreatments) {
      if (!st.treatment.termsAndConditions) continue;
      tcSheet.getCell(tcRow, 1).value = st.treatment.name;
      tcSheet.getCell(tcRow, 1).font = { bold: true, size: 12 };
      tcRow++;
      for (const line of st.treatment.termsAndConditions.split("\n")) {
        tcSheet.getCell(tcRow, 1).value = line;
        tcSheet.getCell(tcRow, 1).font = { size: 10 };
        tcSheet.getCell(tcRow, 1).alignment = { wrapText: true };
        tcRow++;
      }
      tcRow++; // blank row between treatments
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `estimate-${slug(patientName)}-${date}.xlsx`;

    return new Response(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("[xlsx] error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "patient";
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add app/api/xlsx/route.ts
git commit -m "feat: add XLSX cost estimate generation with T&Cs sheet"
```

---

### Task 14: Update Main Page — Treatment Review + Document Downloads

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/page.module.css`

This is the largest task. The main page gets a treatment review step between Claude analysis and document download.

- [ ] **Step 1: Update the Phase type and add new state**

In `app/page.tsx`, update the `Phase` type to include `"review-treatments"` and add treatment-related state. Replace the existing type and state declarations:

```typescript
type Phase =
  | "idle"
  | "uploading"
  | "transcribing"
  | "ready-to-generate"
  | "generating"
  | "review-treatments"
  | "rendering-docs"
  | "done"
  | "error";
```

Add these new state variables inside `Home()` alongside the existing ones (replace `pdfUrl` and `pdfFilename` state):

```typescript
const [allTreatments, setAllTreatments] = useState<Treatment[]>([]);
const [selectedTreatments, setSelectedTreatments] = useState<SelectedTreatment[]>([]);
const [docxUrl, setDocxUrl] = useState<string | null>(null);
const [xlsxUrl, setXlsxUrl] = useState<string | null>(null);
```

Add the import at the top:

```typescript
import type { Report, Treatment, SelectedTreatment } from "@/lib/types";
```

Remove the old import of `Report` from `@/app/api/generate/route`.

- [ ] **Step 2: Update generateReport to include treatment matching**

Replace the `generateReport` function:

```typescript
async function generateReport() {
  if (!transcript) return;
  setErrorMsg(null);
  setPhase("generating");
  try {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript,
        images: xrays.map((x) => ({
          base64: x.base64,
          mediaType: x.mediaType,
        })),
      }),
    });
    if (!res.ok) throw new Error((await res.json()).error ?? "Analysis failed");
    const { report: r } = (await res.json()) as { report: Report };
    setReport(r);

    // Match suggested treatments
    const matchRes = await fetch("/api/match-treatments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        suggestedTreatments: r.suggestedTreatments ?? [],
      }),
    });
    if (matchRes.ok) {
      const { matched, all } = (await matchRes.json()) as {
        matched: Treatment[];
        all: Treatment[];
      };
      setAllTreatments(all);
      setSelectedTreatments(
        matched.map((t) => ({
          treatment: t,
          selectedCodes: t.codes.map((c) => ({ ...c, quantity: 1 })),
        }))
      );
    }

    setPhase("review-treatments");
  } catch (err) {
    setErrorMsg((err as Error).message);
    setPhase("error");
  }
}
```

- [ ] **Step 3: Add treatment review helper functions**

Add these functions after `generateReport`:

```typescript
function toggleTreatment(treatment: Treatment) {
  setSelectedTreatments((prev) => {
    const exists = prev.find((s) => s.treatment.id === treatment.id);
    if (exists) return prev.filter((s) => s.treatment.id !== treatment.id);
    return [
      ...prev,
      {
        treatment,
        selectedCodes: treatment.codes.map((c) => ({ ...c, quantity: 1 })),
      },
    ];
  });
}

function updateQuantity(treatmentId: string, codeIdx: number, quantity: number) {
  setSelectedTreatments((prev) =>
    prev.map((s) =>
      s.treatment.id === treatmentId
        ? {
            ...s,
            selectedCodes: s.selectedCodes.map((c, i) =>
              i === codeIdx ? { ...c, quantity: Math.max(0, quantity) } : c
            ),
          }
        : s
    )
  );
}

function totalCost() {
  return selectedTreatments.reduce(
    (sum, s) =>
      sum + s.selectedCodes.reduce((s2, c) => s2 + c.price * c.quantity, 0),
    0
  );
}

async function downloadDocuments() {
  if (!report) return;
  setPhase("rendering-docs");
  setErrorMsg(null);
  try {
    // Fetch practice settings
    const settingsRes = await fetch("/api/admin/settings");
    const settings = await settingsRes.json();

    // Generate DOCX
    const docxRes = await fetch("/api/docx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patientName,
        date: new Date().toISOString().slice(0, 10),
        report,
        imageDataUrls: xrays.map(
          (x) => `data:${x.mediaType};base64,${x.base64}`
        ),
        practice: settings,
      }),
    });
    if (!docxRes.ok) throw new Error("DOCX generation failed");
    const docxBlob = await docxRes.blob();
    if (docxUrl) URL.revokeObjectURL(docxUrl);
    setDocxUrl(URL.createObjectURL(docxBlob));

    // Generate XLSX
    const xlsxRes = await fetch("/api/xlsx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patientName,
        date: new Date().toISOString().slice(0, 10),
        quoteRef: `Q-${Date.now().toString(36).toUpperCase()}`,
        selectedTreatments,
        settings,
      }),
    });
    if (!xlsxRes.ok) throw new Error("XLSX generation failed");
    const xlsxBlob = await xlsxRes.blob();
    if (xlsxUrl) URL.revokeObjectURL(xlsxUrl);
    setXlsxUrl(URL.createObjectURL(xlsxBlob));

    setPhase("done");
  } catch (err) {
    setErrorMsg((err as Error).message);
    setPhase("error");
  }
}
```

- [ ] **Step 4: Update the isBusy check and canGenerate**

Replace the existing `isBusy` and `canGenerate`:

```typescript
const isBusy =
  phase === "uploading" ||
  phase === "transcribing" ||
  phase === "generating" ||
  phase === "rendering-docs";

const canGenerate =
  !isBusy && transcript !== null && patientName.trim() !== "";
```

- [ ] **Step 5: Update the JSX — replace the download/preview sections**

Replace everything from the Generate Report button section through the end of the card div with:

```tsx
<section className={styles.section}>
  <button
    type="button"
    className={styles.primaryBtn}
    onClick={generateReport}
    disabled={!canGenerate}
  >
    {phase === "generating"
      ? "Analyzing with Claude…"
      : "Generate Report"}
  </button>
  {errorMsg && <p className={styles.error}>Error: {errorMsg}</p>}
</section>

{report && phase !== "idle" && (
  <section className={styles.section}>
    <h2 className={styles.previewTitle}>Report Preview</h2>
    <p className={styles.previewPara}>{report.patientSummary}</p>
    <ul className={styles.previewList}>
      {report.findings.map((f, i) => (
        <li key={i}>
          <strong>{f.tooth}</strong> — {f.observation}{" "}
          <span className={styles[`sev-${f.severity}`]}>
            ({f.severity})
          </span>
        </li>
      ))}
    </ul>
  </section>
)}

{(phase === "review-treatments" || phase === "rendering-docs" || phase === "done") && (
  <section className={styles.section}>
    <h2 className={styles.previewTitle}>Treatment Selection</h2>
    <p className={styles.treatmentHint}>
      Auto-matched from transcript. Adjust quantities or add more treatments.
    </p>

    {selectedTreatments.map((st) => (
      <div key={st.treatment.id} className={styles.treatmentCard}>
        <div className={styles.treatmentHeader}>
          <label>
            <input
              type="checkbox"
              checked={true}
              onChange={() => toggleTreatment(st.treatment)}
            />
            <strong>{st.treatment.name}</strong>
          </label>
          <span className={styles.category}>{st.treatment.category}</span>
        </div>
        <table className={styles.codesTable}>
          <thead>
            <tr>
              <th>Code</th>
              <th>Description</th>
              <th>Price</th>
              <th>Qty</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {st.selectedCodes.map((c, ci) => (
              <tr key={ci}>
                <td>{c.code}</td>
                <td>{c.description}</td>
                <td>${c.price.toFixed(2)}</td>
                <td>
                  <input
                    type="number"
                    min={0}
                    className={styles.qtyInput}
                    value={c.quantity}
                    onChange={(e) =>
                      updateQuantity(
                        st.treatment.id,
                        ci,
                        parseInt(e.target.value) || 0
                      )
                    }
                  />
                </td>
                <td className={styles.lineTotal}>
                  ${(c.price * c.quantity).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ))}

    <div className={styles.addTreatmentRow}>
      <select
        className={styles.addTreatmentSelect}
        value=""
        onChange={(e) => {
          const t = allTreatments.find((t) => t.id === e.target.value);
          if (t) toggleTreatment(t);
        }}
      >
        <option value="">+ Add treatment…</option>
        {allTreatments
          .filter((t) => !selectedTreatments.some((s) => s.treatment.id === t.id))
          .map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
      </select>
    </div>

    <div className={styles.costTotal}>
      Total: <strong>${totalCost().toFixed(2)}</strong>
    </div>

    <div className={styles.downloadRow}>
      <button
        className={styles.primaryBtn}
        onClick={downloadDocuments}
        disabled={phase === "rendering-docs"}
      >
        {phase === "rendering-docs" ? "Generating documents…" : "Generate Documents"}
      </button>

      {phase === "done" && docxUrl && (
        <a href={docxUrl} download={`consultation-${patientName || "patient"}.docx`} className={styles.downloadBtn}>
          Clinical Report (.docx)
        </a>
      )}
      {phase === "done" && xlsxUrl && (
        <a href={xlsxUrl} download={`estimate-${patientName || "patient"}.xlsx`} className={styles.downloadBtnGreen}>
          Cost Estimate (.xlsx)
        </a>
      )}
    </div>
  </section>
)}
```

- [ ] **Step 6: Update the cleanup effect**

Replace the cleanup useEffect:

```typescript
useEffect(
  () => () => {
    xrays.forEach((x) => URL.revokeObjectURL(x.previewUrl));
    if (docxUrl) URL.revokeObjectURL(docxUrl);
    if (xlsxUrl) URL.revokeObjectURL(xlsxUrl);
  },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  []
);
```

- [ ] **Step 7: Add treatment review CSS**

Append to `app/page.module.css`:

```css
.treatmentHint {
  font-size: 0.85rem;
  color: #666;
  margin-bottom: 16px;
}

.treatmentCard {
  background: #f6f7f9;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
}

.treatmentHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.treatmentHeader label {
  display: flex;
  align-items: center;
  gap: 8px;
}

.category {
  display: inline-block;
  padding: 2px 8px;
  background: #e8edff;
  color: #0f62fe;
  border-radius: 4px;
  font-size: 0.8rem;
}

.codesTable {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.codesTable th {
  text-align: left;
  padding: 4px 8px;
  font-size: 0.75rem;
  text-transform: uppercase;
  color: #777;
}

.codesTable td {
  padding: 4px 8px;
  border-top: 1px solid #e0e0e0;
}

.qtyInput {
  width: 50px;
  padding: 4px 6px;
  border: 1px solid #d0d5dd;
  border-radius: 4px;
  font-size: 0.9rem;
  text-align: center;
  font-family: inherit;
}

.lineTotal {
  font-weight: 600;
}

.addTreatmentRow {
  margin: 12px 0;
}

.addTreatmentSelect {
  padding: 8px 10px;
  border: 1px solid #d0d5dd;
  border-radius: 6px;
  font-size: 0.9rem;
  background: #fff;
  font-family: inherit;
  width: 100%;
}

.costTotal {
  text-align: right;
  font-size: 1.1rem;
  margin: 16px 0;
  padding: 8px 12px;
  background: #f0f3f9;
  border-radius: 6px;
}

.downloadRow {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
}

.downloadBtnGreen {
  display: inline-block;
  padding: 12px 24px;
  border-radius: 6px;
  background: #198038;
  color: #fff;
  text-decoration: none;
  font-weight: 600;
}

.downloadBtnGreen:hover {
  background: #0e6027;
}
```

Also update the existing `.subtitle` in `page.module.css` to say "report" instead of "PDF":

No code change needed since we updated the subtitle text in the JSX already via the earlier task.

- [ ] **Step 8: Update subtitle text in JSX**

In the JSX, update the subtitle:

```tsx
<p className={styles.subtitle}>
  Upload X-rays, record notes, and generate a patient report.
</p>
```

- [ ] **Step 9: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 10: Commit**

```bash
git add app/page.tsx app/page.module.css
git commit -m "feat: add treatment review step + DOCX/XLSX download to main page"
```

---

### Task 15: Final Cleanup and Push

**Files:**
- Modify: `app/page.tsx` (remove old PDF references)
- Modify: `.env.example` (verify all vars present)

- [ ] **Step 1: Remove unused PDF state from page.tsx**

Ensure the old `pdfUrl`, `pdfFilename`, and `rendering-pdf` phase references are fully removed from `page.tsx`. Verify there are no remaining references to the old PDF download flow.

- [ ] **Step 2: Update .env.example to have all vars**

Verify `.env.example` contains:

```
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
BLOB_READ_WRITE_TOKEN=
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
```

- [ ] **Step 3: Full build verification**

Run: `npm run build`
Expected: Clean build with all routes present:

```
Route (app)
├ ○ /
├ ○ /admin
├ ○ /admin/settings
├ ○ /admin/templates
├ ○ /admin/treatments
├ ƒ /api/admin/settings
├ ƒ /api/admin/templates
├ ƒ /api/admin/templates/[id]
├ ƒ /api/admin/treatments
├ ƒ /api/admin/treatments/[id]
├ ƒ /api/docx
├ ƒ /api/generate
├ ƒ /api/match-treatments
├ ƒ /api/pdf
├ ƒ /api/upload-audio
├ ƒ /api/xlsx
```

- [ ] **Step 4: Commit and push**

```bash
git add -A
git commit -m "chore: final cleanup — remove unused PDF state, verify env vars"
git push
```

---

### Summary

| Task | What it builds |
|------|---------------|
| 1 | Firebase singleton + deps |
| 2 | Shared types |
| 3 | Settings API |
| 4 | Treatments CRUD API |
| 5 | Templates CRUD API |
| 6 | Admin layout + sidebar |
| 7 | Admin settings page |
| 8 | Admin treatments page |
| 9 | Admin templates page |
| 10 | Claude prompt update |
| 11 | Treatment matching API |
| 12 | DOCX generation |
| 13 | XLSX generation |
| 14 | Main page treatment review + downloads |
| 15 | Cleanup + push |

Tasks 1-5 are backend foundation. Tasks 6-9 are admin UI. Tasks 10-14 are the updated consultation flow. Task 15 is cleanup.
