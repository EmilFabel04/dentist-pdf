"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import type { Patient, Estimate, PatientReport, PracticeSettings } from "@/lib/types";
import styles from "./page.module.css";

export default function PatientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { getToken } = useAuth();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [reports, setReports] = useState<PatientReport[]>([]);
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

      const [patRes, estRes, repRes] = await Promise.all([
        fetch(`/api/patients/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/api/patients/${id}/estimates`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/api/patients/${id}/reports`, {
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

      if (estRes.ok) {
        const e: Estimate[] = await estRes.json();
        setEstimates(e);
      }

      if (repRes.ok) {
        const r: PatientReport[] = await repRes.json();
        setReports(r);
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

  async function downloadXlsx(estimate: Estimate) {
    const token = await getToken();
    if (!token) return;

    // Load settings for xlsx generation
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
    }

    const res = await fetch("/api/xlsx", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        patientName: name,
        date: estimate.date,
        quoteRef: `Q-${estimate.id?.slice(0, 6) || "000000"}`,
        selectedTreatments: estimate.selectedTreatments,
        settings,
        appointmentCount: estimate.appointmentCount,
      }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `estimate-${name.replace(/\s+/g, "-").toLowerCase()}-${estimate.date}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function downloadDocx(report: PatientReport) {
    const token = await getToken();
    if (!token) return;

    const settingsRes = await fetch("/api/admin/settings", {
      headers: { Authorization: `Bearer ${token}` },
    });
    let practice: { name: string; address: string; phone: string; email: string } | undefined;
    if (settingsRes.ok) {
      const s = await settingsRes.json();
      practice = { name: s.name, address: s.address, phone: s.phone, email: s.email };
    }

    const res = await fetch("/api/docx", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        patientName: name,
        date: report.date,
        report: report.report,
        practice,
      }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report-${name.replace(/\s+/g, "-").toLowerCase()}-${report.date}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function downloadPptx(report: PatientReport) {
    const token = await getToken();
    if (!token) return;

    const settingsRes = await fetch("/api/admin/settings", {
      headers: { Authorization: `Bearer ${token}` },
    });
    let practice = { name: "", phone: "", email: "", address: "" };
    if (settingsRes.ok) {
      const s = await settingsRes.json();
      practice = { name: s.name, phone: s.phone, email: s.email, address: s.address };
    }

    const res = await fetch("/api/pptx", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        patientName: name,
        date: report.date,
        mainComplaint: "",
        report: report.report,
        selectedTreatments: [],
        practice,
      }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `treatment-plan-${name.replace(/\s+/g, "-").toLowerCase()}-${report.date}.pptx`;
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

      {/* ── Estimates Section ───────────────────────────────────── */}
      <h2 className={styles.sectionTitle}>Estimates</h2>

      <button
        className={styles.newConsultBtn}
        onClick={() => router.push(`/estimates/new?patientId=${id}`)}
      >
        New Estimate
      </button>

      {estimates.length === 0 ? (
        <div className={styles.emptyConsult}>No estimates yet.</div>
      ) : (
        <table className={styles.consultTable}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Treatments</th>
              <th>Appointments</th>
              <th>Documents</th>
            </tr>
          </thead>
          <tbody>
            {estimates.map((e) => (
              <tr key={e.id}>
                <td>{e.date}</td>
                <td>{e.selectedTreatments?.length || 0} treatments</td>
                <td>{e.appointmentCount || 1}</td>
                <td>
                  <button
                    className={styles.downloadBtnGreen}
                    onClick={() => downloadXlsx(e)}
                  >
                    .xlsx
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ── Reports Section ─────────────────────────────────────── */}
      <h2 className={styles.sectionTitle} style={{ marginTop: 32 }}>
        Reports
      </h2>

      <button
        className={styles.newConsultBtn}
        onClick={() => router.push(`/reports/new?patientId=${id}`)}
      >
        New Report
      </button>

      {reports.length === 0 ? (
        <div className={styles.emptyConsult}>No reports yet.</div>
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
            {reports.map((r) => (
              <tr key={r.id}>
                <td>{r.date}</td>
                <td>
                  <span className={styles.summarySnippet}>
                    {r.report?.patientSummary
                      ? r.report.patientSummary.slice(0, 100)
                      : "—"}
                  </span>
                </td>
                <td>
                  <button
                    className={styles.downloadBtn}
                    onClick={() => downloadDocx(r)}
                  >
                    .docx
                  </button>
                  <button
                    className={styles.downloadBtn}
                    onClick={() => downloadPptx(r)}
                  >
                    .pptx
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
