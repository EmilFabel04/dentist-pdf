"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import type { Patient } from "@/lib/types";
import styles from "./page.module.css";

export default function PatientsPage() {
  const { getToken } = useAuth();
  const router = useRouter();

  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newDob, setNewDob] = useState("");

  async function loadPatients() {
    const token = await getToken();
    if (!token) return;
    const res = await fetch("/api/patients", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setPatients(data);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadPatients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return patients;
    const q = search.toLowerCase();
    return patients.filter(
      (p) =>
        p.name?.toLowerCase().includes(q) ||
        p.email?.toLowerCase().includes(q) ||
        p.phone?.toLowerCase().includes(q)
    );
  }, [patients, search]);

  async function handleSave() {
    const token = await getToken();
    if (!token) return;
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
      setNewName("");
      setNewEmail("");
      setNewPhone("");
      setNewDob("");
      setShowAddForm(false);
      setLoading(true);
      await loadPatients();
    }
  }

  return (
    <div>
      <h1 className={styles.heading}>Patients</h1>

      <div className={styles.toolbar}>
        <input
          className={styles.searchInput}
          type="text"
          placeholder="Search by name, email, or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          className={styles.addBtn}
          onClick={() => setShowAddForm(!showAddForm)}
        >
          {showAddForm ? "Cancel" : "Add Patient"}
        </button>
      </div>

      {showAddForm && (
        <div className={styles.inlineForm}>
          <div className={styles.formGrid}>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Name</label>
              <input
                className={styles.input}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Email</label>
              <input
                className={styles.input}
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Phone</label>
              <input
                className={styles.input}
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Date of Birth</label>
              <input
                className={styles.input}
                type="date"
                value={newDob}
                onChange={(e) => setNewDob(e.target.value)}
              />
            </div>
          </div>
          <div className={styles.formActions}>
            <button className={styles.saveBtn} onClick={handleSave}>
              Save
            </button>
            <button
              className={styles.cancelBtn}
              onClick={() => setShowAddForm(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p>Loading...</p>
      ) : filtered.length === 0 ? (
        <p className={styles.empty}>No patients found.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr
                key={p.id}
                className={styles.clickableRow}
                onClick={() => router.push(`/patients/${p.id}`)}
              >
                <td>{p.name}</td>
                <td>{p.email}</td>
                <td>{p.phone}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
