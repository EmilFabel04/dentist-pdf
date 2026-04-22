"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import type {
  Patient,
  Report,
  Treatment,
  SelectedTreatment,
  PracticeSettings,
} from "@/lib/types";
import styles from "./page.module.css";

/* ── Types ──────────────────────────────────────────────────── */

type XRay = {
  file: File;
  previewUrl: string;
  base64: string;
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
};

type Phase =
  | "idle"
  | "uploading"
  | "transcribing"
  | "ready-to-generate"
  | "generating"
  | "review-treatments"
  | "rendering-docs"
  | "done"
  | "saved";

/* ── Inner component (uses useSearchParams) ─────────────────── */

function ConsultationInner() {
  const { getToken } = useAuth();

  // Patient selection
  const searchParams = useSearchParams();
  const initialPatientId = searchParams.get("patientId");
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [patientSearch, setPatientSearch] = useState("");
  const [patientResults, setPatientResults] = useState<Patient[]>([]);
  const [showPatientDropdown, setShowPatientDropdown] = useState(false);
  const [showNewPatientForm, setShowNewPatientForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newDob, setNewDob] = useState("");

  // X-rays
  const [xrays, setXrays] = useState<XRay[]>([]);

  // Recording
  const [phase, setPhase] = useState<Phase>("idle");
  const [recording, setRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [showTranscript, setShowTranscript] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Report
  const [report, setReport] = useState<Report | null>(null);

  // Treatments
  const [matchedTreatments, setMatchedTreatments] = useState<Treatment[]>([]);
  const [allTreatments, setAllTreatments] = useState<Treatment[]>([]);
  const [selectedTreatments, setSelectedTreatments] = useState<
    SelectedTreatment[]
  >([]);

  // Documents
  const [docxBlob, setDocxBlob] = useState<Blob | null>(null);
  const [xlsxBlob, setXlsxBlob] = useState<Blob | null>(null);
  const [pptxBlob, setPptxBlob] = useState<Blob | null>(null);
  const [practiceSettings, setPracticeSettings] =
    useState<PracticeSettings | null>(null);

  // Refinement
  const [refineMode, setRefineMode] = useState<"text" | "voice" | null>(null);
  const [refineText, setRefineText] = useState("");
  const [isRefining, setIsRefining] = useState(false);
  const [refineRecording, setRefineRecording] = useState(false);
  const [refineDuration, setRefineDuration] = useState(0);
  const refineRecorderRef = useRef<MediaRecorder | null>(null);
  const refineChunksRef = useRef<Blob[]>([]);
  const refineTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Appointment count
  const [appointmentCount, setAppointmentCount] = useState(1);

  // General
  const [error, setError] = useState("");
  const [savedId, setSavedId] = useState<string | null>(null);

  /* ── Load patient by ID from URL ──────────────────────────── */

  useEffect(() => {
    if (!initialPatientId) return;
    (async () => {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/patients/${initialPatientId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const p: Patient = await res.json();
        setSelectedPatient(p);
      }
    })();
  }, [initialPatientId, getToken]);

  /* ── Patient search ───────────────────────────────────────── */

  const searchPatients = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setPatientResults([]);
        setShowPatientDropdown(false);
        return;
      }
      const token = await getToken();
      if (!token) return;
      const res = await fetch("/api/patients", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const all: Patient[] = await res.json();
      const lower = q.toLowerCase();
      const filtered = all.filter(
        (p) =>
          p.name?.toLowerCase().includes(lower) ||
          p.email?.toLowerCase().includes(lower) ||
          p.phone?.toLowerCase().includes(lower)
      );
      setPatientResults(filtered);
      setShowPatientDropdown(filtered.length > 0);
    },
    [getToken]
  );

  useEffect(() => {
    const timeout = setTimeout(() => {
      searchPatients(patientSearch);
    }, 300);
    return () => clearTimeout(timeout);
  }, [patientSearch, searchPatients]);

  function selectPatient(p: Patient) {
    setSelectedPatient(p);
    setPatientSearch("");
    setPatientResults([]);
    setShowPatientDropdown(false);
  }

  async function createNewPatient() {
    const token = await getToken();
    if (!token || !newName.trim()) return;
    setError("");
    const res = await fetch("/api/patients", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: newName,
        email: newEmail,
        phone: newPhone,
        dateOfBirth: newDob,
        notes: "",
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const created: Patient = {
        id: data.id,
        name: newName,
        email: newEmail,
        phone: newPhone,
        dateOfBirth: newDob,
        notes: "",
        createdAt: new Date().toISOString(),
      };
      setSelectedPatient(created);
      setShowNewPatientForm(false);
      setNewName("");
      setNewEmail("");
      setNewPhone("");
      setNewDob("");
    } else {
      setError("Failed to create patient.");
    }
  }

  /* ── X-ray upload ─────────────────────────────────────────── */

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    const newXrays: XRay[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const base64 = await fileToBase64(file);
      const previewUrl = URL.createObjectURL(file);
      const mediaType = toSupportedMedia(file.type);
      newXrays.push({ file, previewUrl, base64, mediaType });
    }
    setXrays((prev) => [...prev, ...newXrays]);
    e.target.value = "";
  }

  function removeXray(index: number) {
    setXrays((prev) => {
      const copy = [...prev];
      URL.revokeObjectURL(copy[index].previewUrl);
      copy.splice(index, 1);
      return copy;
    });
  }

  /* ── Audio recording ──────────────────────────────────────── */

  async function startRecording() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm",
      });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        await transcribeAudio(blob);
      };

      mediaRecorder.start();
      setRecording(true);
      setDuration(0);
      setPhase("uploading");

      timerRef.current = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);
    } catch {
      setError(
        "Could not access microphone. Please allow microphone permissions."
      );
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }

  async function transcribeAudio(blob: Blob) {
    setPhase("transcribing");
    setError("");
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      const formData = new FormData();
      formData.append("audio", blob, "recording.webm");
      const res = await fetch("/api/upload-audio", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) throw new Error("Transcription failed");
      const data = await res.json();
      setTranscript(data.transcript);
      setPhase("ready-to-generate");
    } catch (err) {
      setError((err as Error).message);
      setPhase("idle");
    }
  }

  /* ── Generate report ──────────────────────────────────────── */

  async function generateReport() {
    if (!transcript || !selectedPatient) return;
    setPhase("generating");
    setError("");
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");

      const images = xrays.map((x) => ({
        base64: x.base64,
        mediaType: x.mediaType,
      }));

      const genRes = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ transcript, images }),
      });
      if (!genRes.ok) throw new Error("Report generation failed");
      const { report: r } = (await genRes.json()) as { report: Report };
      setReport(r);

      // Match treatments
      const matchRes = await fetch("/api/match-treatments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          suggestedTreatments: r.suggestedTreatments,
        }),
      });
      if (!matchRes.ok) throw new Error("Treatment matching failed");
      const { matched, all } = (await matchRes.json()) as {
        matched: Treatment[];
        all: Treatment[];
      };
      setMatchedTreatments(matched);
      setAllTreatments(all);

      // Load practice settings (for basic codes display)
      const settingsRes = await fetch("/api/admin/settings", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (settingsRes.ok) {
        const settings = await settingsRes.json();
        setPracticeSettings(settings);
      }

      // Pre-select matched treatments with all codes, quantity 1
      const preselected: SelectedTreatment[] = matched.map((t) => ({
        treatment: t,
        selectedCodes: t.codes.map((c) => ({
          code: c.code,
          description: c.description,
          price: c.price,
          quantity: 1,
        })),
      }));
      setSelectedTreatments(preselected);

      setPhase("review-treatments");
    } catch (err) {
      setError((err as Error).message);
      setPhase("ready-to-generate");
    }
  }

  /* ── Treatment review helpers ─────────────────────────────── */

  function isTreatmentSelected(treatmentId: string): boolean {
    return selectedTreatments.some((st) => st.treatment.id === treatmentId);
  }

  function toggleTreatment(treatment: Treatment) {
    if (isTreatmentSelected(treatment.id)) {
      setSelectedTreatments((prev) =>
        prev.filter((st) => st.treatment.id !== treatment.id)
      );
    } else {
      setSelectedTreatments((prev) => [
        ...prev,
        {
          treatment,
          selectedCodes: treatment.codes.map((c) => ({
            code: c.code,
            description: c.description,
            price: c.price,
            quantity: 1,
          })),
        },
      ]);
    }
  }

  function updateQuantity(treatmentId: string, code: string, qty: number) {
    setSelectedTreatments((prev) =>
      prev.map((st) => {
        if (st.treatment.id !== treatmentId) return st;
        return {
          ...st,
          selectedCodes: st.selectedCodes.map((sc) =>
            sc.code === code ? { ...sc, quantity: Math.max(1, qty) } : sc
          ),
        };
      })
    );
  }

  function addTreatmentById(id: string) {
    if (!id) return;
    const treatment = allTreatments.find((t) => t.id === id);
    if (!treatment || isTreatmentSelected(id)) return;
    toggleTreatment(treatment);
  }

  function computeTotal(): number {
    return selectedTreatments.reduce((sum, st) => {
      return (
        sum +
        st.selectedCodes.reduce((s, sc) => s + sc.price * sc.quantity, 0)
      );
    }, 0);
  }

  /* ── Generate documents ───────────────────────────────────── */

  async function generateDocuments() {
    if (!report || !selectedPatient) return;
    setPhase("rendering-docs");
    setError("");
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");

      // Load practice settings
      const settingsRes = await fetch("/api/admin/settings", {
        headers: { Authorization: `Bearer ${token}` },
      });
      let settings: PracticeSettings = {
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
      if (settingsRes.ok) {
        settings = await settingsRes.json();
        setPracticeSettings(settings);
      }

      const today = new Date().toISOString().split("T")[0];
      const quoteRef = `Q-${Date.now().toString(36).toUpperCase()}`;

      // Generate DOCX
      const docxRes = await fetch("/api/docx", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          patientName: selectedPatient.name,
          date: today,
          report,
          imageDataUrls: xrays.map(
            (x) => `data:${x.mediaType};base64,${x.base64}`
          ),
          practice: {
            name: settings.name,
            address: settings.address,
            phone: settings.phone,
            email: settings.email,
          },
        }),
      });
      if (docxRes.ok) {
        setDocxBlob(await docxRes.blob());
      }

      // Generate XLSX
      const xlsxRes = await fetch("/api/xlsx", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          patientName: selectedPatient.name,
          date: today,
          quoteRef,
          selectedTreatments,
          settings,
        }),
      });
      if (xlsxRes.ok) {
        setXlsxBlob(await xlsxRes.blob());
      }

      // Generate PPTX
      const pptxRes = await fetch("/api/pptx", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          patientName: selectedPatient.name,
          date: today,
          mainComplaint: "",
          report,
          selectedTreatments,
          xrayImages: xrays.map(
            (x) => `data:${x.mediaType};base64,${x.base64}`
          ),
          practice: settings,
        }),
      });
      if (pptxRes.ok) {
        setPptxBlob(await pptxRes.blob());
      }

      setPhase("done");
    } catch (err) {
      setError((err as Error).message);
      setPhase("review-treatments");
    }
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /* ── Refine estimate with Claude ──────────────────────────── */

  async function startRefineRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      refineChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) refineChunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(refineChunksRef.current, { type: "audio/webm" });
        await transcribeAndRefine(blob);
      };
      recorder.start();
      refineRecorderRef.current = recorder;
      setRefineRecording(true);
      setRefineDuration(0);
      refineTimerRef.current = setInterval(() => setRefineDuration((d) => d + 1), 1000);
    } catch {
      setError("Microphone access denied");
    }
  }

  function stopRefineRecording() {
    refineRecorderRef.current?.stop();
    setRefineRecording(false);
    if (refineTimerRef.current) {
      clearInterval(refineTimerRef.current);
      refineTimerRef.current = null;
    }
  }

  async function transcribeAndRefine(audioBlob: Blob) {
    setIsRefining(true);
    setError("");
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");

      // Transcribe the audio
      const formData = new FormData();
      formData.append("audio", audioBlob, "refine.webm");
      const transcribeRes = await fetch("/api/upload-audio", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!transcribeRes.ok) throw new Error("Transcription failed");
      const { transcript: instructions } = await transcribeRes.json();

      await refineWithClaude(instructions, token);
    } catch (err) {
      setError((err as Error).message);
      setIsRefining(false);
    }
  }

  async function refineWithText() {
    if (!refineText.trim()) return;
    setIsRefining(true);
    setError("");
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      await refineWithClaude(refineText, token);
      setRefineText("");
    } catch (err) {
      setError((err as Error).message);
      setIsRefining(false);
    }
  }

  async function refineWithClaude(instructions: string, token: string) {
    const res = await fetch("/api/refine-estimate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        instructions,
        currentTreatments: selectedTreatments,
        allTreatments: allTreatments.map((t) => ({
          id: t.id,
          name: t.name,
          category: t.category,
          codes: t.codes,
        })),
      }),
    });

    if (!res.ok) throw new Error("Refinement failed");
    const { updated } = await res.json();

    // Map Claude's response back to SelectedTreatment[]
    const newSelected: SelectedTreatment[] = updated
      .map((u: { treatmentId: string; treatmentName: string; category: string; codes: { code: string; description: string; price: number; quantity: number }[] }) => {
        const treatment = allTreatments.find((t) => t.id === u.treatmentId);
        if (!treatment) return null;
        return {
          treatment,
          selectedCodes: u.codes.map((c: { code: string; description: string; price: number; quantity: number }) => ({
            code: c.code,
            description: c.description,
            price: c.price,
            quantity: c.quantity,
          })),
        };
      })
      .filter(Boolean) as SelectedTreatment[];

    setSelectedTreatments(newSelected);
    setIsRefining(false);
    setRefineMode(null);
  }

  /* ── Basic codes total ──────────────────────────────────────── */

  function computeBasicCodesTotal(): number {
    if (!practiceSettings?.basicCodes) return 0;
    let total = 0;
    for (const code of practiceSettings.basicCodes) {
      const treatment = allTreatments.find((t) => t.codes.some((c) => c.code === code));
      if (treatment) {
        const tc = treatment.codes.find((c) => c.code === code);
        if (tc) total += tc.price;
      }
    }
    return total * appointmentCount;
  }

  /* ── Save consultation ────────────────────────────────────── */

  async function saveConsultation() {
    if (!selectedPatient || !report) return;
    setError("");
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");

      const today = new Date().toISOString().split("T")[0];

      const res = await fetch(
        `/api/patients/${selectedPatient.id}/consultations`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            date: today,
            transcript,
            report,
            selectedTreatments,
            docxUrl: null,
            xlsxUrl: null,
          }),
        }
      );
      if (!res.ok) throw new Error("Failed to save consultation");
      const data = await res.json();
      setSavedId(data.id);
      setPhase("saved");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  /* ── Render helpers ───────────────────────────────────────── */

  function severityClass(sev: string) {
    switch (sev) {
      case "urgent":
        return styles.sevUrgent;
      case "monitor":
        return styles.sevMonitor;
      default:
        return styles.sevNormal;
    }
  }

  // Build the list of treatments to show: matched first, then rest from allTreatments
  const treatmentsToShow = [
    ...matchedTreatments,
    ...allTreatments.filter(
      (t) => !matchedTreatments.some((m) => m.id === t.id)
    ),
  ];

  // Unselected treatments for the "add" dropdown
  const unselectedTreatments = allTreatments.filter(
    (t) => !isTreatmentSelected(t.id)
  );

  /* ── Render ───────────────────────────────────────────────── */

  return (
    <div>
      <h1 className={styles.heading}>New Consultation</h1>

      {error && <div className={styles.error}>{error}</div>}

      {/* ── 1. Patient Selection ───────────────────────────────── */}
      <div className={styles.patientSection}>
        <div className={styles.sectionTitle}>Patient</div>

        {selectedPatient ? (
          <div className={styles.patientBadge}>
            {selectedPatient.name}
            <button
              className={styles.patientBadgeRemove}
              onClick={() => setSelectedPatient(null)}
              title="Change patient"
            >
              x
            </button>
          </div>
        ) : (
          <>
            <div className={styles.patientSearch}>
              <input
                className={styles.patientSearchInput}
                type="text"
                placeholder="Search patients by name, email, or phone..."
                value={patientSearch}
                onChange={(e) => setPatientSearch(e.target.value)}
                onFocus={() => {
                  if (patientResults.length > 0) setShowPatientDropdown(true);
                }}
              />
              <button
                className={styles.newPatientBtn}
                onClick={() => setShowNewPatientForm(!showNewPatientForm)}
              >
                {showNewPatientForm ? "Cancel" : "Create New Patient"}
              </button>

              {showPatientDropdown && (
                <div className={styles.patientDropdown}>
                  {patientResults.map((p) => (
                    <div
                      key={p.id}
                      className={styles.patientDropdownItem}
                      onClick={() => selectPatient(p)}
                    >
                      <strong>{p.name}</strong>
                      {p.email ? ` — ${p.email}` : ""}
                      {p.phone ? ` — ${p.phone}` : ""}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {showNewPatientForm && (
              <div className={styles.newPatientForm}>
                <div className={styles.newPatientFormGrid}>
                  <div className={styles.field}>
                    <label className={styles.label}>Name</label>
                    <input
                      className={styles.input}
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>Email</label>
                    <input
                      className={styles.input}
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>Phone</label>
                    <input
                      className={styles.input}
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>Date of Birth</label>
                    <input
                      className={styles.input}
                      type="date"
                      value={newDob}
                      onChange={(e) => setNewDob(e.target.value)}
                    />
                  </div>
                </div>
                <div className={styles.newPatientFormActions}>
                  <button className={styles.saveBtn} onClick={createNewPatient}>
                    Save Patient
                  </button>
                  <button
                    className={styles.newPatientBtn}
                    onClick={() => setShowNewPatientForm(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── 2. X-ray Upload ────────────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>X-ray Images</div>
        <input
          className={styles.fileInput}
          type="file"
          accept="image/jpeg,image/png"
          multiple
          onChange={handleFileChange}
        />
        {xrays.length > 0 && (
          <div className={styles.thumbGrid}>
            {xrays.map((x, i) => (
              <div key={i} className={styles.thumbWrap}>
                <img
                  src={x.previewUrl}
                  alt={`X-ray ${i + 1}`}
                  className={styles.thumb}
                />
                <button
                  className={styles.removeBtn}
                  onClick={() => removeXray(i)}
                  title="Remove"
                >
                  x
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 3. Audio Recording ─────────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Audio Recording</div>
        <div className={styles.recordRow}>
          {!recording ? (
            <button
              className={styles.recordBtn}
              onClick={startRecording}
              disabled={phase === "transcribing"}
            >
              Start Recording
            </button>
          ) : (
            <>
              <button className={styles.stopBtn} onClick={stopRecording}>
                Stop Recording
              </button>
              <span className={styles.timer}>{formatDuration(duration)}</span>
            </>
          )}
        </div>

        {phase === "transcribing" && (
          <div className={styles.status}>Transcribing with Whisper...</div>
        )}

        {transcript && (
          <div className={styles.transcriptBox}>
            <button
              className={styles.transcriptToggle}
              onClick={() => setShowTranscript(!showTranscript)}
            >
              {showTranscript ? "Hide Transcript" : "Show Transcript"}
            </button>
            {showTranscript && (
              <div className={styles.transcriptText}>{transcript}</div>
            )}
          </div>
        )}
      </div>

      {/* ── 4. Generate Report ─────────────────────────────────── */}
      {(phase === "ready-to-generate" ||
        phase === "generating" ||
        phase === "review-treatments" ||
        phase === "rendering-docs" ||
        phase === "done" ||
        phase === "saved") && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Report</div>
          {phase === "ready-to-generate" && (
            <button
              className={styles.primaryBtn}
              onClick={generateReport}
              disabled={!selectedPatient || !transcript}
            >
              Generate Report
            </button>
          )}

          {phase === "generating" && (
            <div className={styles.status}>
              Analyzing with Claude... This may take a moment.
            </div>
          )}

          {report && (
            <>
              <div className={styles.previewTitle}>Patient Summary</div>
              <p className={styles.previewPara}>{report.patientSummary}</p>

              <div className={styles.previewTitle}>Findings</div>
              <ul className={styles.previewList}>
                {report.findings.map((f, i) => (
                  <li key={i}>
                    <span className={severityClass(f.severity)}>
                      {f.severity}
                    </span>
                    <span>
                      <strong>{f.tooth}:</strong> {f.observation}
                    </span>
                  </li>
                ))}
              </ul>

              {report.recommendations.length > 0 && (
                <>
                  <div className={styles.previewTitle}>Recommendations</div>
                  <ul className={styles.previewList}>
                    {report.recommendations.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </>
              )}

              {report.followUp && (
                <>
                  <div className={styles.previewTitle}>Follow-up</div>
                  <p className={styles.previewPara}>{report.followUp}</p>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* ── 5. Treatment Review ────────────────────────────────── */}
      {(phase === "review-treatments" ||
        phase === "rendering-docs" ||
        phase === "done" ||
        phase === "saved") &&
        report && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Treatment Review</div>
            <div className={styles.appointmentCount}>
              <label className={styles.appointmentLabel}>Number of Appointments</label>
              <input
                type="number"
                min={1}
                max={20}
                className={styles.appointmentInput}
                value={appointmentCount}
                onChange={(e) => setAppointmentCount(Math.max(1, parseInt(e.target.value) || 1))}
              />
            </div>
            <p className={styles.treatmentHint}>
              Toggle treatments on/off and adjust quantities as needed.
            </p>

            {treatmentsToShow.map((treatment) => {
              const isSelected = isTreatmentSelected(treatment.id);
              const st = selectedTreatments.find(
                (s) => s.treatment.id === treatment.id
              );

              // Only show matched treatments by default; unmatched are added via dropdown
              if (
                !matchedTreatments.some((m) => m.id === treatment.id) &&
                !isSelected
              ) {
                return null;
              }

              return (
                <div key={treatment.id} className={styles.treatmentCard}>
                  <div className={styles.treatmentHeader}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleTreatment(treatment)}
                    />
                    <span className={styles.treatmentName}>
                      {treatment.name}
                    </span>
                    {treatment.category && (
                      <span className={styles.category}>
                        {treatment.category}
                      </span>
                    )}
                  </div>

                  {isSelected && st && (
                    <table className={styles.codesTable}>
                      <thead>
                        <tr>
                          <th>Code</th>
                          <th>Description</th>
                          <th>Price</th>
                          <th>Qty</th>
                          <th style={{ textAlign: "right" }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {st.selectedCodes.map((sc) => (
                          <tr key={sc.code}>
                            <td>{sc.code}</td>
                            <td>{sc.description}</td>
                            <td>{sc.price.toFixed(2)}</td>
                            <td>
                              <input
                                className={styles.qtyInput}
                                type="number"
                                min={1}
                                value={sc.quantity}
                                onChange={(e) =>
                                  updateQuantity(
                                    treatment.id,
                                    sc.code,
                                    parseInt(e.target.value) || 1
                                  )
                                }
                              />
                            </td>
                            <td className={styles.lineTotal}>
                              {(sc.price * sc.quantity).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}

            {/* Add treatment dropdown */}
            {unselectedTreatments.length > 0 && (
              <div className={styles.addTreatmentRow}>
                <select
                  className={styles.addTreatmentSelect}
                  defaultValue=""
                  onChange={(e) => {
                    addTreatmentById(e.target.value);
                    e.target.value = "";
                  }}
                >
                  <option value="" disabled>
                    Add a treatment...
                  </option>
                  {unselectedTreatments.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.category})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className={styles.costTotal}>
              Total: {computeTotal().toFixed(2)}
            </div>

            {practiceSettings?.basicCodes && practiceSettings.basicCodes.length > 0 && (
              <div className={styles.costTotal} style={{ fontSize: "0.9rem", background: "#e8edff" }}>
                Basic codes x{appointmentCount} appts: {computeBasicCodesTotal().toFixed(2)}
                <br />
                <strong>Grand Total: {(computeTotal() + computeBasicCodesTotal()).toFixed(2)}</strong>
              </div>
            )}
          </div>
        )}

      {/* ── 5b. Refine Estimate ────────────────────────────────── */}
      {phase === "review-treatments" && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Refine Estimate</div>
          <p className={styles.refineHint}>
            Record or type instructions to adjust the estimate (e.g. &quot;remove the crown, add two more fillings&quot;)
          </p>
          <div className={styles.refineActions}>
            <button
              className={styles.refineBtn}
              onClick={() => setRefineMode(refineMode === "voice" ? null : "voice")}
              disabled={isRefining}
            >
              {refineMode === "voice" ? "Cancel Recording" : "Record Instructions"}
            </button>
            <button
              className={styles.refineBtn}
              onClick={() => setRefineMode(refineMode === "text" ? null : "text")}
              disabled={isRefining}
            >
              {refineMode === "text" ? "Cancel" : "Type Instructions"}
            </button>
          </div>

          {refineMode === "voice" && (
            <div className={styles.refineVoice}>
              {!refineRecording ? (
                <button className={styles.recordBtn} onClick={startRefineRecording} disabled={isRefining}>
                  Start Recording
                </button>
              ) : (
                <button className={styles.stopBtn} onClick={stopRefineRecording}>
                  Stop ({formatDuration(refineDuration)})
                </button>
              )}
            </div>
          )}

          {refineMode === "text" && (
            <div className={styles.refineTextBox}>
              <textarea
                className={styles.refineTextarea}
                placeholder="e.g. Remove the root canal, add 2x composite fillings, change the crown to porcelain..."
                value={refineText}
                onChange={(e) => setRefineText(e.target.value)}
                rows={3}
              />
              <button
                className={styles.primaryBtn}
                onClick={refineWithText}
                disabled={!refineText.trim() || isRefining}
              >
                {isRefining ? "Refining..." : "Apply Changes"}
              </button>
            </div>
          )}

          {isRefining && (
            <div className={styles.status}>Claude is adjusting the estimate...</div>
          )}
        </div>
      )}

      {/* ── 6. Generate Documents + Save ───────────────────────── */}
      {phase === "review-treatments" && (
        <div className={styles.section}>
          <button
            className={styles.primaryBtn}
            onClick={generateDocuments}
            disabled={selectedTreatments.length === 0}
          >
            Generate Documents
          </button>
        </div>
      )}

      {phase === "rendering-docs" && (
        <div className={styles.section}>
          <div className={styles.status}>Generating documents...</div>
        </div>
      )}

      {(phase === "done" || phase === "saved") && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Documents</div>
          <div className={styles.downloadRow}>
            {docxBlob && (
              <button
                className={styles.downloadBtn}
                onClick={() =>
                  downloadBlob(
                    docxBlob,
                    `report-${selectedPatient?.name.replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().split("T")[0]}.docx`
                  )
                }
              >
                Download .docx
              </button>
            )}
            {xlsxBlob && (
              <button
                className={styles.downloadBtnGreen}
                onClick={() =>
                  downloadBlob(
                    xlsxBlob,
                    `estimate-${selectedPatient?.name.replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().split("T")[0]}.xlsx`
                  )
                }
              >
                Download .xlsx
              </button>
            )}
            {pptxBlob && (
              <button
                className={styles.downloadBtn}
                onClick={() =>
                  downloadBlob(
                    pptxBlob,
                    `treatment-plan-${selectedPatient?.name.replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().split("T")[0]}.pptx`
                  )
                }
              >
                Download .pptx
              </button>
            )}
          </div>

          {phase !== "saved" && (
            <div className={styles.downloadRow}>
              <button className={styles.saveBtn} onClick={saveConsultation}>
                Save Consultation
              </button>
            </div>
          )}

          {phase === "saved" && selectedPatient && (
            <div className={styles.successMsg}>
              Consultation saved!{" "}
              <Link href={`/patients/${selectedPatient.id}`}>
                View patient record
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Page wrapper with Suspense (for useSearchParams) ────── */

export default function ConsultationPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ConsultationInner />
    </Suspense>
  );
}

/* ── Helper functions ───────────────────────────────────────── */

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data URL prefix (data:image/...;base64,)
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function toSupportedMedia(
  mimeType: string
): "image/jpeg" | "image/png" | "image/gif" | "image/webp" {
  const supported = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
  ] as const;
  for (const s of supported) {
    if (mimeType === s) return s;
  }
  return "image/jpeg"; // default fallback
}
