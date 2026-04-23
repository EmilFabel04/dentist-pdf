"use client";

import { useState, useEffect, useRef, useCallback, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import type {
  Patient,
  Treatment,
  SelectedTreatment,
  PracticeSettings,
} from "@/lib/types";
import styles from "./page.module.css";

/* ── Types ──────────────────────────────────────────────────── */

type Phase =
  | "idle"
  | "recording"
  | "transcribing"
  | "reviewing"
  | "generating"
  | "done"
  | "saved";

/* ── Inner component (uses useSearchParams) ─────────────────── */

function NewEstimateInner() {
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

  // Treatments
  const [allTreatments, setAllTreatments] = useState<Treatment[]>([]);
  const [selectedTreatments, setSelectedTreatments] = useState<SelectedTreatment[]>([]);
  const [treatmentSearch, setTreatmentSearch] = useState("");

  // Recording
  const [phase, setPhase] = useState<Phase>("idle");
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [showTranscript, setShowTranscript] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Appointment count + settings
  const [appointmentCount, setAppointmentCount] = useState(1);
  const [practiceSettings, setPracticeSettings] = useState<PracticeSettings | null>(null);

  // Refinement
  const [refineMode, setRefineMode] = useState<"text" | "voice" | null>(null);
  const [refineText, setRefineText] = useState("");
  const [isRefining, setIsRefining] = useState(false);
  const [refineRecording, setRefineRecording] = useState(false);
  const [refineDuration, setRefineDuration] = useState(0);
  const refineRecorderRef = useRef<MediaRecorder | null>(null);
  const refineChunksRef = useRef<Blob[]>([]);
  const refineTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Documents
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [xlsxBlob, setXlsxBlob] = useState<Blob | null>(null);

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

  /* ── Load all treatments ─────────────────────────────────── */

  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (!token) return;
      const [treatRes, settingsRes] = await Promise.all([
        fetch("/api/admin/treatments", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch("/api/admin/settings", {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      if (treatRes.ok) {
        const data: Treatment[] = await treatRes.json();
        setAllTreatments(data);
      }
      if (settingsRes.ok) {
        const data: PracticeSettings = await settingsRes.json();
        setPracticeSettings(data);
      }
    })();
  }, [getToken]);

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

  /* ── Treatment search (filter as you type) ──────────────── */

  const treatmentResults = useMemo(() => {
    if (!treatmentSearch.trim()) return [];
    const lower = treatmentSearch.toLowerCase();
    return allTreatments.filter(
      (t) =>
        t.name.toLowerCase().includes(lower) ||
        t.category.toLowerCase().includes(lower) ||
        t.codes.some(
          (c) =>
            c.code.toLowerCase().includes(lower) ||
            c.description.toLowerCase().includes(lower)
        )
    );
  }, [treatmentSearch, allTreatments]);

  function addTreatment(treatment: Treatment) {
    if (selectedTreatments.some((st) => st.treatment.id === treatment.id)) return;
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
    setTreatmentSearch("");
  }

  function removeTreatment(treatmentId: string) {
    setSelectedTreatments((prev) =>
      prev.filter((st) => st.treatment.id !== treatmentId)
    );
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

  function computeTotal(): number {
    return selectedTreatments.reduce(
      (sum, st) =>
        sum + st.selectedCodes.reduce((s, sc) => s + sc.price * sc.quantity, 0),
      0
    );
  }

  function computeBasicCodesTotal(): number {
    if (!practiceSettings?.basicCodes) return 0;
    let total = 0;
    for (const code of practiceSettings.basicCodes) {
      const treatment = allTreatments.find((t) =>
        t.codes.some((c) => c.code === code)
      );
      if (treatment) {
        const tc = treatment.codes.find((c) => c.code === code);
        if (tc) total += tc.price;
      }
    }
    return total * appointmentCount;
  }

  /* ── Audio recording ──────────────────────────────────────── */

  async function startRecording() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
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
      setIsRecording(true);
      setRecordDuration(0);
      setPhase("recording");

      timerRef.current = setInterval(() => {
        setRecordDuration((d) => d + 1);
      }, 1000);
    } catch {
      setError("Could not access microphone. Please allow microphone permissions.");
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
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
      setPhase("reviewing");
    } catch (err) {
      setError((err as Error).message);
      setPhase("idle");
    }
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
      refineTimerRef.current = setInterval(
        () => setRefineDuration((d) => d + 1),
        1000
      );
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

    const newSelected: SelectedTreatment[] = updated
      .map(
        (u: {
          treatmentId: string;
          treatmentName: string;
          category: string;
          codes: {
            code: string;
            description: string;
            price: number;
            quantity: number;
          }[];
        }) => {
          const treatment = allTreatments.find((t) => t.id === u.treatmentId);
          if (!treatment) return null;
          return {
            treatment,
            selectedCodes: u.codes.map((c) => ({
              code: c.code,
              description: c.description,
              price: c.price,
              quantity: c.quantity,
            })),
          };
        }
      )
      .filter(Boolean) as SelectedTreatment[];

    setSelectedTreatments(newSelected);
    setIsRefining(false);
    setRefineMode(null);
  }

  /* ── Generate & Download ──────────────────────────────────── */

  async function generateEstimate() {
    if (!selectedPatient || selectedTreatments.length === 0) return;
    setPhase("generating");
    setError("");
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");

      // Load latest settings
      let settings = practiceSettings;
      if (!settings) {
        const settingsRes = await fetch("/api/admin/settings", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (settingsRes.ok) {
          settings = await settingsRes.json();
          setPracticeSettings(settings);
        }
      }

      const today = new Date().toISOString().split("T")[0];
      const quoteRef = `Q-${Date.now().toString(36).toUpperCase()}`;

      // Build basic codes list
      const basicCodes: {
        code: string;
        description: string;
        price: number;
        quantity: number;
      }[] = [];
      if (settings?.basicCodes) {
        for (const code of settings.basicCodes) {
          const treatment = allTreatments.find((t) =>
            t.codes.some((c) => c.code === code)
          );
          if (treatment) {
            const tc = treatment.codes.find((c) => c.code === code);
            if (tc) {
              basicCodes.push({
                code: tc.code,
                description: tc.description,
                price: tc.price,
                quantity: 1,
              });
            }
          }
        }
      }

      const requestBody = JSON.stringify({
        patientName: selectedPatient.name,
        date: today,
        quoteRef,
        selectedTreatments,
        settings: settings || {
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
        },
        appointmentCount,
        basicCodes,
      });

      const requestHeaders = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      };

      // Generate PDF (primary) and XLSX (secondary) in parallel
      const [pdfRes, xlsxRes] = await Promise.all([
        fetch("/api/estimate-pdf", {
          method: "POST",
          headers: requestHeaders,
          body: requestBody,
        }),
        fetch("/api/xlsx", {
          method: "POST",
          headers: requestHeaders,
          body: requestBody,
        }),
      ]);

      if (pdfRes.ok) {
        setPdfBlob(await pdfRes.blob());
      }
      if (xlsxRes.ok) {
        setXlsxBlob(await xlsxRes.blob());
      }

      setPhase("done");
    } catch (err) {
      setError((err as Error).message);
      setPhase("reviewing");
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

  /* ── Save Estimate ────────────────────────────────────────── */

  async function saveEstimate() {
    if (!selectedPatient) return;
    setError("");
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");

      const today = new Date().toISOString().split("T")[0];

      const res = await fetch(`/api/patients/${selectedPatient.id}/estimates`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          date: today,
          transcript,
          selectedTreatments,
          appointmentCount,
        }),
      });
      if (!res.ok) throw new Error("Failed to save estimate");
      const data = await res.json();
      setSavedId(data.id);
      setPhase("saved");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  /* ── Render ───────────────────────────────────────────────── */

  return (
    <div>
      <h1 className={styles.heading}>New Estimate</h1>

      {error && <div className={styles.error}>{error}</div>}

      {/* ── 1. Patient Selection ───────────────────────────────── */}
      <div className={styles.section}>
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

      {/* ── 2. Treatment Selection ──────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Treatment Selection</div>
        <input
          className={styles.treatmentSearch}
          type="text"
          placeholder="Search treatments by name, category, or code..."
          value={treatmentSearch}
          onChange={(e) => setTreatmentSearch(e.target.value)}
        />

        {treatmentResults.length > 0 && (
          <div className={styles.treatmentResults}>
            {treatmentResults.map((t) => {
              const alreadySelected = selectedTreatments.some(
                (st) => st.treatment.id === t.id
              );
              return (
                <div
                  key={t.id}
                  className={`${styles.treatmentResultItem} ${alreadySelected ? styles.treatmentResultItemDisabled : ""}`}
                  onClick={() => !alreadySelected && addTreatment(t)}
                >
                  <span className={styles.treatmentResultName}>{t.name}</span>
                  <span className={styles.category}>{t.category}</span>
                  {alreadySelected && (
                    <span className={styles.addedBadge}>Added</span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Selected treatments */}
        {selectedTreatments.length > 0 && (
          <div className={styles.selectedTreatments}>
            <div className={styles.selectedTitle}>
              Selected Treatments ({selectedTreatments.length})
            </div>
            {selectedTreatments.map((st) => (
              <div key={st.treatment.id} className={styles.treatmentCard}>
                <div className={styles.treatmentHeader}>
                  <span className={styles.treatmentName}>
                    {st.treatment.name}
                  </span>
                  <span className={styles.category}>
                    {st.treatment.category}
                  </span>
                  <button
                    className={styles.removeBtn}
                    onClick={() => removeTreatment(st.treatment.id)}
                    title="Remove treatment"
                  >
                    x
                  </button>
                </div>
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
                                st.treatment.id,
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
              </div>
            ))}
          </div>
        )}

        {/* Appointment count */}
        <div className={styles.appointmentCount}>
          <label className={styles.appointmentLabel}>
            Number of Appointments
          </label>
          <input
            type="number"
            min={1}
            max={20}
            className={styles.appointmentInput}
            value={appointmentCount}
            onChange={(e) =>
              setAppointmentCount(Math.max(1, parseInt(e.target.value) || 1))
            }
          />
        </div>

        {/* Cost summary */}
        {selectedTreatments.length > 0 && (
          <>
            <div className={styles.costTotal}>
              Treatment Total: {computeTotal().toFixed(2)}
            </div>
            {practiceSettings?.basicCodes &&
              practiceSettings.basicCodes.length > 0 && (
                <div className={styles.costBasic}>
                  Basic codes x{appointmentCount} appts:{" "}
                  {computeBasicCodesTotal().toFixed(2)}
                  <br />
                  <strong>
                    Grand Total:{" "}
                    {(computeTotal() + computeBasicCodesTotal()).toFixed(2)}
                  </strong>
                </div>
              )}
          </>
        )}
      </div>

      {/* ── 3. Voice Recording ──────────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Treatment Plan Narrative</div>
        <p className={styles.hint}>
          Record a voice description of the treatment plan in your own words.
        </p>
        <div className={styles.recordRow}>
          {!isRecording ? (
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
              <span className={styles.timer}>
                {formatDuration(recordDuration)}
              </span>
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

      {/* ── 4. Refine Estimate ──────────────────────────────────── */}
      {(phase === "reviewing" || phase === "done" || phase === "saved") &&
        selectedTreatments.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Refine Estimate</div>
            <p className={styles.hint}>
              Record or type instructions to adjust the estimate (e.g. &quot;remove
              the crown, add two more fillings&quot;)
            </p>
            <div className={styles.refineActions}>
              <button
                className={styles.refineBtn}
                onClick={() =>
                  setRefineMode(refineMode === "voice" ? null : "voice")
                }
                disabled={isRefining}
              >
                {refineMode === "voice" ? "Cancel Recording" : "Record Instructions"}
              </button>
              <button
                className={styles.refineBtn}
                onClick={() =>
                  setRefineMode(refineMode === "text" ? null : "text")
                }
                disabled={isRefining}
              >
                {refineMode === "text" ? "Cancel" : "Type Instructions"}
              </button>
            </div>

            {refineMode === "voice" && (
              <div className={styles.refineVoice}>
                {!refineRecording ? (
                  <button
                    className={styles.recordBtn}
                    onClick={startRefineRecording}
                    disabled={isRefining}
                  >
                    Start Recording
                  </button>
                ) : (
                  <button
                    className={styles.stopBtn}
                    onClick={stopRefineRecording}
                  >
                    Stop ({formatDuration(refineDuration)})
                  </button>
                )}
              </div>
            )}

            {refineMode === "text" && (
              <div className={styles.refineTextBox}>
                <textarea
                  className={styles.refineTextarea}
                  placeholder="e.g. Remove the root canal, add 2x composite fillings..."
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
              <div className={styles.status}>
                Claude is adjusting the estimate...
              </div>
            )}
          </div>
        )}

      {/* ── 5. Generate & Download ──────────────────────────────── */}
      {phase === "reviewing" && selectedTreatments.length > 0 && (
        <div className={styles.section}>
          <button
            className={styles.primaryBtn}
            onClick={generateEstimate}
            disabled={!selectedPatient}
          >
            Generate Estimate
          </button>
        </div>
      )}

      {phase === "generating" && (
        <div className={styles.section}>
          <div className={styles.status}>Generating estimate...</div>
        </div>
      )}

      {(phase === "done" || phase === "saved") && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Documents</div>
          <div className={styles.downloadRow}>
            {pdfBlob && (
              <button
                className={styles.downloadBtnGreen}
                onClick={() =>
                  downloadBlob(
                    pdfBlob,
                    `estimate-${selectedPatient?.name.replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().split("T")[0]}.pdf`
                  )
                }
              >
                Download PDF
              </button>
            )}
            {xlsxBlob && (
              <button
                className={styles.newPatientBtn}
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
          </div>

          {phase !== "saved" && (
            <div className={styles.downloadRow}>
              <button className={styles.saveBtn} onClick={saveEstimate}>
                Save Estimate
              </button>
            </div>
          )}

          {phase === "saved" && selectedPatient && (
            <div className={styles.successMsg}>
              Estimate saved!{" "}
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

export default function NewEstimatePage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <NewEstimateInner />
    </Suspense>
  );
}

/* ── Helper functions ───────────────────────────────────────── */

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
