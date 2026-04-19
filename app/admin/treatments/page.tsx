"use client";

import { useEffect, useState } from "react";
import type { Treatment, TreatmentCode } from "@/lib/types";
import styles from "./page.module.css";

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

const EMPTY_CODE: TreatmentCode = { code: "", description: "", price: 0 };

function blankTreatment(): Omit<Treatment, "id"> {
  return {
    name: "",
    category: "other",
    codes: [{ ...EMPTY_CODE }],
    termsAndConditions: "",
  };
}

/* ---------- Editor panel component ---------- */

function EditorPanel({
  initial,
  isNew,
  onSave,
  onCancel,
  onDelete,
}: {
  initial: Omit<Treatment, "id">;
  isNew: boolean;
  onSave: (data: Omit<Treatment, "id">) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [category, setCategory] = useState(initial.category);
  const [codes, setCodes] = useState<TreatmentCode[]>(
    initial.codes.length > 0 ? initial.codes.map((c) => ({ ...c })) : [{ ...EMPTY_CODE }]
  );
  const [termsAndConditions, setTermsAndConditions] = useState(initial.termsAndConditions);
  const [saving, setSaving] = useState(false);

  function updateCode(idx: number, field: keyof TreatmentCode, value: string | number) {
    setCodes((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, [field]: value } : c))
    );
  }

  function addCode() {
    setCodes((prev) => [...prev, { ...EMPTY_CODE }]);
  }

  function removeCode(idx: number) {
    setCodes((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({ name, category, codes, termsAndConditions });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.editor}>
      <div className={styles.editorGrid}>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>Name</label>
          <input
            className={styles.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>Category</label>
          <select
            className={styles.select}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c.charAt(0).toUpperCase() + c.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={styles.field}>
        <span className={styles.codesHeading}>Procedure Codes</span>
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
            {codes.map((c, idx) => (
              <tr key={idx}>
                <td>
                  <input
                    value={c.code}
                    onChange={(e) => updateCode(idx, "code", e.target.value)}
                  />
                </td>
                <td>
                  <input
                    value={c.description}
                    onChange={(e) => updateCode(idx, "description", e.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    value={c.price}
                    onChange={(e) =>
                      updateCode(idx, "price", parseFloat(e.target.value) || 0)
                    }
                  />
                </td>
                <td>
                  {codes.length > 1 && (
                    <button
                      type="button"
                      className={styles.removeCodeBtn}
                      onClick={() => removeCode(idx)}
                    >
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className={styles.addCodeBtn} onClick={addCode}>
          + Add Code
        </button>
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel}>Terms &amp; Conditions</label>
        <textarea
          className={styles.textarea}
          value={termsAndConditions}
          onChange={(e) => setTermsAndConditions(e.target.value)}
        />
      </div>

      <div className={styles.editorActions}>
        <button
          type="button"
          className={styles.saveBtn}
          onClick={handleSave}
          disabled={saving || !name.trim()}
        >
          {saving ? "Saving..." : "Save"}
        </button>
        <button type="button" className={styles.cancelBtn} onClick={onCancel}>
          Cancel
        </button>
        {!isNew && onDelete && (
          <button type="button" className={styles.deleteBtn} onClick={onDelete}>
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------- Main page component ---------- */

export default function TreatmentsPage() {
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);

  useEffect(() => {
    loadTreatments();
  }, []);

  async function loadTreatments() {
    try {
      const res = await fetch("/api/admin/treatments");
      if (res.ok) {
        const data = await res.json();
        setTreatments(data);
      }
    } catch {
      /* ignore */
    }
  }

  function priceRange(t: Treatment) {
    if (t.codes.length === 0) return "-";
    const prices = t.codes.map((c) => c.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return min === max ? `${min}` : `${min} - ${max}`;
  }

  const filtered = treatments.filter((t) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      t.name.toLowerCase().includes(q) ||
      t.codes.some((c) => c.code.toLowerCase().includes(q));
    const matchesCategory = !categoryFilter || t.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  async function handleCreate(data: Omit<Treatment, "id">) {
    const res = await fetch("/api/admin/treatments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Create failed");
    setAddingNew(false);
    await loadTreatments();
  }

  async function handleUpdate(id: string, data: Omit<Treatment, "id">) {
    const res = await fetch(`/api/admin/treatments/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Update failed");
    setExpandedId(null);
    await loadTreatments();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this treatment?")) return;
    const res = await fetch(`/api/admin/treatments/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Delete failed");
    setExpandedId(null);
    await loadTreatments();
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Treatments</h1>

      <div className={styles.toolbar}>
        <input
          className={styles.searchInput}
          placeholder="Search by name or code..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className={styles.filterSelect}
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="">All Categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c.charAt(0).toUpperCase() + c.slice(1)}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={styles.addBtn}
          onClick={() => {
            setExpandedId(null);
            setAddingNew(true);
          }}
        >
          + Add Treatment
        </button>
      </div>

      <table className={styles.table}>
        <thead>
          <tr>
            <th>Name</th>
            <th>Category</th>
            <th>Codes</th>
            <th>Price Range</th>
          </tr>
        </thead>
        <tbody>
          {addingNew && (
            <tr className={styles.expandedRow}>
              <td colSpan={4}>
                <EditorPanel
                  initial={blankTreatment()}
                  isNew
                  onSave={handleCreate}
                  onCancel={() => setAddingNew(false)}
                />
              </td>
            </tr>
          )}
          {filtered.length === 0 && !addingNew ? (
            <tr>
              <td colSpan={4} className={styles.empty}>
                No treatments found.
              </td>
            </tr>
          ) : (
            filtered.map((t) => (
              <>
                <tr
                  key={t.id}
                  className={styles.clickableRow}
                  onClick={() => {
                    setAddingNew(false);
                    setExpandedId(expandedId === t.id ? null : t.id);
                  }}
                >
                  <td>{t.name}</td>
                  <td>
                    <span className={styles.category}>
                      {t.category.charAt(0).toUpperCase() + t.category.slice(1)}
                    </span>
                  </td>
                  <td>{t.codes.length}</td>
                  <td>{priceRange(t)}</td>
                </tr>
                {expandedId === t.id && (
                  <tr key={`${t.id}-editor`} className={styles.expandedRow}>
                    <td colSpan={4}>
                      <EditorPanel
                        initial={t}
                        isNew={false}
                        onSave={(data) => handleUpdate(t.id, data)}
                        onCancel={() => setExpandedId(null)}
                        onDelete={() => handleDelete(t.id)}
                      />
                    </td>
                  </tr>
                )}
              </>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
