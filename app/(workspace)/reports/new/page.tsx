"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import type {
  Patient,
  Report,
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
  | "recording"
  | "transcribing"
  | "generating"
  | "rendering"
  | "done"
  | "saved";

/* ── Inner component (uses useSearchParams) ─────────────────── */

function NewReportInner() {
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

  // Photos
  const [extraOralPhotos, setExtraOralPhotos] = useState<XRay[]>([]);
  const [intraOralPhotos, setIntraOralPhotos] = useState<XRay[]>([]);
  const [xrays, setXrays] = useState<XRay[]>([]);

  // Recording
  const [phase, setPhase] = useState<Phase>("idle");
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [showTranscript, setShowTranscript] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Report
  const [report, setReport] = useState<Report | null>(null);
  const [practiceSettings, setPracticeSettings] = useState<PracticeSettings | null>(null);

  // Documents
  const [docxBlob, setDocxBlob] = useState<Blob | null>(null);
  const [pptxBlob, setPptxBlob] = useState<Blob | null>(null);

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

  /* ── Load settings ────────────────────────────────────────── */

  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (!token) return;
      const res = await fetch("/api/admin/settings", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data: PracticeSettings = await res.json();
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

  /* ── Photo upload helpers ─────────────────────────────────── */

  async function handlePhotoUpload(
    e: React.ChangeEvent<HTMLInputElement>,
    setter: React.Dispatch<React.SetStateAction<XRay[]>>
  ) {
    const files = e.target.files;
    if (!files) return;
    const newPhotos: XRay[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const base64 = await fileToBase64(file);
      const previewUrl = URL.createObjectURL(file);
      const mediaType = toSupportedMedia(file.type);
      newPhotos.push({ file, previewUrl, base64, mediaType });
    }
    setter((prev) => [...prev, ...newPhotos]);
    e.target.value = "";
  }

  function removePhoto(
    index: number,
    setter: React.Dispatch<React.SetStateAction<XRay[]>>
  ) {
    setter((prev) => {
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
      setPhase("idle");
    } catch (err) {
      setError((err as Error).message);
      setPhase("idle");
    }
  }

  /* ── Generate Report with Claude ──────────────────────────── */

  async function generateReport() {
    if (!transcript || !selectedPatient) return;
    setPhase("generating");
    setError("");
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");

      // Combine all images for Claude analysis
      const allImages = [
        ...extraOralPhotos.map((x) => ({
          base64: x.base64,
          mediaType: x.mediaType,
        })),
        ...intraOralPhotos.map((x) => ({
          base64: x.base64,
          mediaType: x.mediaType,
        })),
        ...xrays.map((x) => ({
          base64: x.base64,
          mediaType: x.mediaType,
        })),
      ];

      const genRes = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ transcript, images: allImages }),
      });
      if (!genRes.ok) throw new Error("Report generation failed");
      const { report: r } = (await genRes.json()) as { report: Report };
      setReport(r);
      setPhase("idle");
    } catch (err) {
      setError((err as Error).message);
      setPhase("idle");
    }
  }

  /* ── Generate Documents ───────────────────────────────────── */

  async function generateDocuments() {
    if (!report || !selectedPatient) return;
    setPhase("rendering");
    setError("");
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");

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

      // All images as data URLs for docx
      const allImageDataUrls = [
        ...extraOralPhotos,
        ...intraOralPhotos,
        ...xrays,
      ].map((x) => `data:${x.mediaType};base64,${x.base64}`);

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
          imageDataUrls: allImageDataUrls,
          practice: settings
            ? {
                name: settings.name,
                address: settings.address,
                phone: settings.phone,
                email: settings.email,
              }
            : undefined,
        }),
      });
      if (docxRes.ok) {
        setDocxBlob(await docxRes.blob());
      }

      // Generate PPTX - send separate photo groups
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
          selectedTreatments: [] as SelectedTreatment[],
          extraOralPhotos: extraOralPhotos.map(
            (x) => `data:${x.mediaType};base64,${x.base64}`
          ),
          intraOralPhotos: intraOralPhotos.map(
            (x) => `data:${x.mediaType};base64,${x.base64}`
          ),
          xrayImages: xrays.map(
            (x) => `data:${x.mediaType};base64,${x.base64}`
          ),
          practice: settings
            ? {
                name: settings.name,
                phone: settings.phone,
                email: settings.email,
                address: settings.address,
              }
            : { name: "", phone: "", email: "", address: "" },
        }),
      });
      if (pptxRes.ok) {
        setPptxBlob(await pptxRes.blob());
      }

      setPhase("done");
    } catch (err) {
      setError((err as Error).message);
      setPhase("idle");
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

  /* ── Save Report ──────────────────────────────────────────── */

  async function saveReport() {
    if (!selectedPatient || !report) return;
    setError("");
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");

      const today = new Date().toISOString().split("T")[0];

      const res = await fetch(`/api/patients/${selectedPatient.id}/reports`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          date: today,
          transcript,
          report,
          photoCount: extraOralPhotos.length + intraOralPhotos.length,
          xrayCount: xrays.length,
        }),
      });
      if (!res.ok) throw new Error("Failed to save report");
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

  /* ── Render ───────────────────────────────────────────────── */

  return (
    <div>
      <h1 className={styles.heading}>New Report</h1>

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

      {/* ── 2. Extra Oral Photos ────────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Extra Oral Photos</div>
        <p className={styles.hint}>Upload face/smile photos</p>
        <input
          className={styles.fileInput}
          type="file"
          accept="image/jpeg,image/png"
          multiple
          onChange={(e) => handlePhotoUpload(e, setExtraOralPhotos)}
        />
        {extraOralPhotos.length > 0 && (
          <div className={styles.thumbGrid}>
            {extraOralPhotos.map((x, i) => (
              <div key={i} className={styles.thumbWrap}>
                <img
                  src={x.previewUrl}
                  alt={`Extra oral ${i + 1}`}
                  className={styles.thumb}
                />
                <button
                  className={styles.removeBtn}
                  onClick={() => removePhoto(i, setExtraOralPhotos)}
                  title="Remove"
                >
                  x
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 3. Intra Oral Photos ────────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Intra Oral Photos</div>
        <p className={styles.hint}>Upload inside-the-mouth photos</p>
        <input
          className={styles.fileInput}
          type="file"
          accept="image/jpeg,image/png"
          multiple
          onChange={(e) => handlePhotoUpload(e, setIntraOralPhotos)}
        />
        {intraOralPhotos.length > 0 && (
          <div className={styles.thumbGrid}>
            {intraOralPhotos.map((x, i) => (
              <div key={i} className={styles.thumbWrap}>
                <img
                  src={x.previewUrl}
                  alt={`Intra oral ${i + 1}`}
                  className={styles.thumb}
                />
                <button
                  className={styles.removeBtn}
                  onClick={() => removePhoto(i, setIntraOralPhotos)}
                  title="Remove"
                >
                  x
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 4. X-rays ───────────────────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>X-ray Images</div>
        <input
          className={styles.fileInput}
          type="file"
          accept="image/jpeg,image/png"
          multiple
          onChange={(e) => handlePhotoUpload(e, setXrays)}
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
                  onClick={() => removePhoto(i, setXrays)}
                  title="Remove"
                >
                  x
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 5. Voice Recording ──────────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Consultation Notes</div>
        <p className={styles.hint}>
          Record your consultation notes for this patient.
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

      {/* ── 6. Generate Report ──────────────────────────────────── */}
      {transcript && !report && (
        <div className={styles.section}>
          <button
            className={styles.primaryBtn}
            onClick={generateReport}
            disabled={
              !selectedPatient || !transcript || phase === "generating"
            }
          >
            {phase === "generating"
              ? "Analyzing with Claude..."
              : "Generate Report"}
          </button>
          {phase === "generating" && (
            <div className={styles.status}>
              Analyzing with Claude... This may take a moment.
            </div>
          )}
        </div>
      )}

      {/* ── 7. Report Preview ───────────────────────────────────── */}
      {report && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Report Preview</div>

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
        </div>
      )}

      {/* ── 8. Generate Documents ───────────────────────────────── */}
      {report && phase !== "done" && phase !== "saved" && phase !== "rendering" && (
        <div className={styles.section}>
          <button className={styles.primaryBtn} onClick={generateDocuments}>
            Generate Documents
          </button>
        </div>
      )}

      {phase === "rendering" && (
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
              <button className={styles.saveBtn} onClick={saveReport}>
                Save Report
              </button>
            </div>
          )}

          {phase === "saved" && selectedPatient && (
            <div className={styles.successMsg}>
              Report saved!{" "}
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

export default function NewReportPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <NewReportInner />
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
  return "image/jpeg";
}
