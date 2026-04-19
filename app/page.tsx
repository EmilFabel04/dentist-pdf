"use client";

import { useEffect, useRef, useState } from "react";
import type { Report, Treatment, SelectedTreatment } from "@/lib/types";
import styles from "./page.module.css";

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
  | "error";

export default function Home() {
  const [patientName, setPatientName] = useState("");
  const [xrays, setXrays] = useState<XRay[]>([]);

  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Upload progress not supported by this @vercel/blob version — using indeterminate state
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [transcript, setTranscript] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [allTreatments, setAllTreatments] = useState<Treatment[]>([]);
  const [selectedTreatments, setSelectedTreatments] = useState<SelectedTreatment[]>([]);
  const [docxUrl, setDocxUrl] = useState<string | null>(null);
  const [xlsxUrl, setXlsxUrl] = useState<string | null>(null);

  useEffect(
    () => () => {
      xrays.forEach((x) => URL.revokeObjectURL(x.previewUrl));
      if (docxUrl) URL.revokeObjectURL(docxUrl);
      if (xlsxUrl) URL.revokeObjectURL(xlsxUrl);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  async function handleXrayChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const next: XRay[] = [];
    for (const file of files) {
      if (!file.type.startsWith("image/")) continue;
      const base64 = await fileToBase64(file);
      next.push({
        file,
        previewUrl: URL.createObjectURL(file),
        base64,
        mediaType: toSupportedMedia(file.type),
      });
    }
    setXrays((prev) => [...prev, ...next]);
    e.target.value = "";
  }

  function removeXray(idx: number) {
    setXrays((prev) => {
      const x = prev[idx];
      if (x) URL.revokeObjectURL(x.previewUrl);
      return prev.filter((_, i) => i !== idx);
    });
  }

  async function startRecording() {
    setErrorMsg(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        await handleRecordedAudio(blob);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordDuration(0);
      timerRef.current = setInterval(() => {
        setRecordDuration((d) => d + 1);
      }, 1000);
    } catch (err) {
      setErrorMsg("Microphone permission denied or unavailable.");
      setPhase("error");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  async function handleRecordedAudio(audioBlob: Blob) {
    setErrorMsg(null);
    setPhase("uploading");
    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, `recording-${Date.now()}.webm`);

      setPhase("transcribing");
      const res = await fetch("/api/upload-audio", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Upload/transcription failed");
      }
      const { transcript: t } = (await res.json()) as { transcript: string };
      setTranscript(t);
      setPhase("ready-to-generate");
    } catch (err) {
      setErrorMsg((err as Error).message);
      setPhase("error");
    }
  }

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
          images: xrays.map((x) => ({ base64: x.base64, mediaType: x.mediaType })),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Analysis failed");
      const { report: r } = (await res.json()) as { report: Report };
      setReport(r);

      const matchRes = await fetch("/api/match-treatments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestedTreatments: r.suggestedTreatments ?? [] }),
      });
      if (matchRes.ok) {
        const { matched, all } = (await matchRes.json()) as { matched: Treatment[]; all: Treatment[] };
        setAllTreatments(all);
        setSelectedTreatments(matched.map((t) => ({
          treatment: t,
          selectedCodes: t.codes.map((c) => ({ ...c, quantity: 1 })),
        })));
      }

      setPhase("review-treatments");
    } catch (err) {
      setErrorMsg((err as Error).message);
      setPhase("error");
    }
  }

  function toggleTreatment(treatment: Treatment) {
    setSelectedTreatments((prev) => {
      const exists = prev.find((s) => s.treatment.id === treatment.id);
      if (exists) return prev.filter((s) => s.treatment.id !== treatment.id);
      return [...prev, { treatment, selectedCodes: treatment.codes.map((c) => ({ ...c, quantity: 1 })) }];
    });
  }

  function updateQuantity(treatmentId: string, codeIdx: number, quantity: number) {
    setSelectedTreatments((prev) =>
      prev.map((s) =>
        s.treatment.id === treatmentId
          ? { ...s, selectedCodes: s.selectedCodes.map((c, i) => i === codeIdx ? { ...c, quantity: Math.max(0, quantity) } : c) }
          : s
      )
    );
  }

  function totalCost() {
    return selectedTreatments.reduce((sum, s) => sum + s.selectedCodes.reduce((s2, c) => s2 + c.price * c.quantity, 0), 0);
  }

  async function downloadDocuments() {
    if (!report) return;
    setPhase("rendering-docs");
    setErrorMsg(null);
    try {
      const settingsRes = await fetch("/api/admin/settings");
      const settings = await settingsRes.json();

      const docxRes = await fetch("/api/docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientName,
          date: new Date().toISOString().slice(0, 10),
          report,
          imageDataUrls: xrays.map((x) => `data:${x.mediaType};base64,${x.base64}`),
          practice: settings,
        }),
      });
      if (!docxRes.ok) throw new Error("DOCX generation failed");
      const docxBlob = await docxRes.blob();
      if (docxUrl) URL.revokeObjectURL(docxUrl);
      setDocxUrl(URL.createObjectURL(docxBlob));

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

  const isBusy =
    phase === "uploading" ||
    phase === "transcribing" ||
    phase === "generating" ||
    phase === "rendering-docs";

  const canGenerate =
    !isBusy && transcript !== null && patientName.trim() !== "";

  const unselectedTreatments = allTreatments.filter(
    (t) => !selectedTreatments.find((s) => s.treatment.id === t.id)
  );

  return (
    <main className={styles.main}>
      <div className={styles.card}>
        <h1 className={styles.title}>Consultation Report</h1>
        <p className={styles.subtitle}>
          Upload X-rays, record notes, and generate a patient report.
        </p>
        <a href="/admin" className={styles.adminLink}>Admin Panel</a>

        <section className={styles.section}>
          <label className={styles.label}>Patient name</label>
          <input
            type="text"
            className={styles.input}
            value={patientName}
            onChange={(e) => setPatientName(e.target.value)}
            placeholder="e.g. Jane Doe"
          />
        </section>

        <section className={styles.section}>
          <label className={styles.label}>X-ray images</label>
          <input
            type="file"
            accept="image/jpeg,image/png"
            multiple
            onChange={handleXrayChange}
            className={styles.fileInput}
          />
          {xrays.length > 0 && (
            <div className={styles.thumbGrid}>
              {xrays.map((x, i) => (
                <div key={i} className={styles.thumbWrap}>
                  <img src={x.previewUrl} alt={`X-ray ${i + 1}`} className={styles.thumb} />
                  <button
                    type="button"
                    className={styles.removeBtn}
                    onClick={() => removeXray(i)}
                    aria-label="Remove"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className={styles.section}>
          <label className={styles.label}>Audio notes</label>
          <div className={styles.recordRow}>
            {!isRecording ? (
              <button
                type="button"
                className={styles.recordBtn}
                onClick={startRecording}
                disabled={phase === "uploading" || phase === "transcribing"}
              >
                ● Record
              </button>
            ) : (
              <button
                type="button"
                className={styles.stopBtn}
                onClick={stopRecording}
              >
                ■ Stop
              </button>
            )}
            <span className={styles.timer}>
              {isRecording ? formatDuration(recordDuration) : transcript ? "✓ transcribed" : "00:00"}
            </span>
          </div>

          {phase === "uploading" && (
            <p className={styles.status}>Uploading audio to storage…</p>
          )}
          {phase === "transcribing" && (
            <p className={styles.status}>Transcribing with Whisper…</p>
          )}
          {transcript && (
            <details className={styles.transcriptBox}>
              <summary>View transcript</summary>
              <p>{transcript}</p>
            </details>
          )}
        </section>

        <section className={styles.section}>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={generateReport}
            disabled={!canGenerate}
          >
            {phase === "generating" ? "Analyzing with Claude…" : "Generate Report"}
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

            {selectedTreatments.map((sel) => (
              <div key={sel.treatment.id} className={styles.treatmentCard}>
                <div className={styles.treatmentHeader}>
                  <label>
                    <input
                      type="checkbox"
                      checked
                      onChange={() => toggleTreatment(sel.treatment)}
                    />
                    <strong>{sel.treatment.name}</strong>
                  </label>
                  <span className={styles.category}>{sel.treatment.category}</span>
                </div>
                <table className={styles.codesTable}>
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Description</th>
                      <th>Price</th>
                      <th>Qty</th>
                      <th>Line Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sel.selectedCodes.map((c, ci) => (
                      <tr key={ci}>
                        <td>{c.code}</td>
                        <td>{c.description}</td>
                        <td>{c.price.toFixed(2)}</td>
                        <td>
                          <input
                            type="number"
                            className={styles.qtyInput}
                            value={c.quantity}
                            min={0}
                            onChange={(e) =>
                              updateQuantity(sel.treatment.id, ci, parseInt(e.target.value) || 0)
                            }
                          />
                        </td>
                        <td className={styles.lineTotal}>
                          {(c.price * c.quantity).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}

            {unselectedTreatments.length > 0 && (
              <div className={styles.addTreatmentRow}>
                <select
                  className={styles.addTreatmentSelect}
                  value=""
                  onChange={(e) => {
                    const t = allTreatments.find((tr) => tr.id === e.target.value);
                    if (t) toggleTreatment(t);
                  }}
                >
                  <option value="" disabled>
                    + Add treatment…
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
              <strong>Total: {totalCost().toFixed(2)}</strong>
            </div>

            <button
              type="button"
              className={styles.primaryBtn}
              onClick={downloadDocuments}
              disabled={phase === "rendering-docs"}
            >
              {phase === "rendering-docs" ? "Generating Documents…" : "Generate Documents"}
            </button>

            {phase === "done" && (
              <div className={styles.downloadRow} style={{ marginTop: 12 }}>
                {docxUrl && (
                  <a
                    href={docxUrl}
                    download={`${patientName || "consultation"}-report.docx`}
                    className={styles.downloadBtn}
                  >
                    Download .docx
                  </a>
                )}
                {xlsxUrl && (
                  <a
                    href={xlsxUrl}
                    download={`${patientName || "consultation"}-estimate.xlsx`}
                    className={styles.downloadBtnGreen}
                  >
                    Download .xlsx
                  </a>
                )}
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function toSupportedMedia(
  type: string
): "image/jpeg" | "image/png" | "image/gif" | "image/webp" {
  if (type === "image/png") return "image/png";
  if (type === "image/gif") return "image/gif";
  if (type === "image/webp") return "image/webp";
  return "image/jpeg";
}
