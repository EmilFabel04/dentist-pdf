"use client";

import { useEffect, useRef, useState } from "react";
import type { Report } from "@/app/api/generate/route";
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
  | "rendering-pdf"
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
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfFilename, setPdfFilename] = useState<string>("consultation.pdf");

  useEffect(
    () => () => {
      xrays.forEach((x) => URL.revokeObjectURL(x.previewUrl));
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
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
          images: xrays.map((x) => ({
            base64: x.base64,
            mediaType: x.mediaType,
          })),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Analysis failed");
      const { report: r } = (await res.json()) as { report: Report };
      setReport(r);

      setPhase("rendering-pdf");
      const pdfRes = await fetch("/api/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientName,
          date: new Date().toISOString().slice(0, 10),
          report: r,
          imageDataUrls: xrays.map((x) => `data:${x.mediaType};base64,${x.base64}`),
        }),
      });
      if (!pdfRes.ok) throw new Error((await pdfRes.json()).error ?? "PDF render failed");

      const disposition = pdfRes.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      if (match) setPdfFilename(match[1]);
      const pdfBlob = await pdfRes.blob();
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      setPdfUrl(URL.createObjectURL(pdfBlob));
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
    phase === "rendering-pdf";

  const canGenerate =
    !isBusy && transcript !== null && patientName.trim() !== "";

  return (
    <main className={styles.main}>
      <div className={styles.card}>
        <h1 className={styles.title}>Consultation Report</h1>
        <p className={styles.subtitle}>
          Upload X-rays, record notes, and generate a patient PDF.
        </p>

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
            {phase === "generating"
              ? "Analyzing with Claude…"
              : phase === "rendering-pdf"
                ? "Rendering PDF…"
                : "Generate Report"}
          </button>

          {phase === "done" && pdfUrl && (
            <a
              href={pdfUrl}
              download={pdfFilename}
              className={styles.downloadBtn}
            >
              ⬇ Download PDF
            </a>
          )}

          {errorMsg && <p className={styles.error}>Error: {errorMsg}</p>}
        </section>

        {report && (
          <section className={styles.section}>
            <h2 className={styles.previewTitle}>Report preview</h2>
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
