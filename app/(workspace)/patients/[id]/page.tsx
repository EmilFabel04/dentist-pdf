"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import type { Patient, Consultation } from "@/lib/types";
import styles from "./page.module.css";

export default function PatientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { getToken } = useAuth();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");

  // Editable fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [dob, setDob] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    async function load() {
      const token = await getToken();
      if (!token) return;

      const [patRes, consRes] = await Promise.all([
        fetch(`/api/patients/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/api/patients/${id}/consultations`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (patRes.ok) {
        const p: Patient = await patRes.json();
        setPatient(p);
        setName(p.name || "");
        setEmail(p.email || "");
        setPhone(p.phone || "");
        setDob(p.dateOfBirth || "");
        setNotes(p.notes || "");
      }

      if (consRes.ok) {
        const c: Consultation[] = await consRes.json();
        setConsultations(c);
      }

      setLoading(false);
    }
    load();
  }, [id, getToken]);

  async function handleSave() {
    const token = await getToken();
    if (!token) return;
    const res = await fetch(`/api/patients/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name,
        email,
        phone,
        dateOfBirth: dob,
        notes,
      }),
    });
    if (res.ok) {
      setToast("Patient saved.");
      setTimeout(() => setToast(""), 3000);
    }
  }

  async function downloadDocx(consultation: Consultation) {
    const token = await getToken();
    if (!token) return;
    const res = await fetch("/api/docx", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        patientName: name,
        date: consultation.date,
        report: consultation.report,
      }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report-${name.replace(/\s+/g, "-").toLowerCase()}-${consultation.date}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function downloadXlsx(consultation: Consultation) {
    const token = await getToken();
    if (!token) return;
    const res = await fetch("/api/xlsx", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        patientName: name,
        date: consultation.date,
        quoteRef: `Q-${consultation.id?.slice(0, 6) || "000000"}`,
        selectedTreatments: consultation.selectedTreatments,
        settings: {
          name: "",
          address: "",
          phone: "",
          email: "",
          vatNumber: "",
          currency: "USD",
          vatRate: 0,
          quoteValidityDays: 30,
          defaultPaymentTerms: "",
        },
      }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `estimate-${name.replace(/\s+/g, "-").toLowerCase()}-${consultation.date}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  if (loading) return <p>Loading...</p>;
  if (!patient) return <p>Patient not found.</p>;

  return (
    <div>
      <Link href="/patients" className={styles.backLink}>
        &larr; Back to Patients
      </Link>

      <h1 className={styles.heading}>{patient.name}</h1>

      <div className={styles.infoCard}>
        <div className={styles.cardTitle}>Patient Information</div>
        <div className={styles.formGrid}>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Name</label>
            <input
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Email</label>
            <input
              className={styles.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Phone</label>
            <input
              className={styles.input}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Date of Birth</label>
            <input
              className={styles.input}
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
            />
          </div>
        </div>
        <div className={styles.field} style={{ marginTop: 12 }}>
          <label className={styles.fieldLabel}>Notes</label>
          <textarea
            className={styles.textarea}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        <button className={styles.saveBtn} onClick={handleSave}>
          Save
        </button>
        {toast && <div className={styles.toast}>{toast}</div>}
      </div>

      <h2 className={styles.sectionTitle}>Consultation History</h2>

      <button
        className={styles.newConsultBtn}
        onClick={() => router.push(`/consultation?patientId=${id}`)}
      >
        New Consultation
      </button>

      {consultations.length === 0 ? (
        <div className={styles.emptyConsult}>No consultations yet.</div>
      ) : (
        <table className={styles.consultTable}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Summary</th>
              <th>Documents</th>
            </tr>
          </thead>
          <tbody>
            {consultations.map((c) => (
              <tr key={c.id}>
                <td>{c.date}</td>
                <td>
                  <span className={styles.summarySnippet}>
                    {c.report?.patientSummary
                      ? c.report.patientSummary.slice(0, 100)
                      : "—"}
                  </span>
                </td>
                <td>
                  <button
                    className={styles.downloadBtn}
                    onClick={() => downloadDocx(c)}
                  >
                    .docx
                  </button>
                  <button
                    className={styles.downloadBtnGreen}
                    onClick={() => downloadXlsx(c)}
                  >
                    .xlsx
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
