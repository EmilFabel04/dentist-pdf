"use client";

import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/lib/auth";
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

type ParsedTreatment = {
  name: string;
  category: string;
  codes: TreatmentCode[];
  termsAndConditions: string;
};

export default function TreatmentsPage() {
  const { getToken } = useAuth();

  /* ── Upload state ────────────────────────────────────────────── */
  const [dragActive, setDragActive] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedTreatment[]>([]);
  const [uploadMsg, setUploadMsg] = useState("");

  /* ── Management state ────────────────────────────────────────── */
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Omit<Treatment, "id"> | null>(null);
  const [addMode, setAddMode] = useState(false);

  /* ── Load treatments ─────────────────────────────────────────── */
  async function loadTreatments() {
    const token = await getToken();
    if (!token) return;
    const res = await fetch("/api/admin/treatments", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      setTreatments(await res.json());
    }
    setLoading(false);
  }

  useEffect(() => {
    loadTreatments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── File parsing ────────────────────────────────────────────── */
  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    const ext = file.name.split(".").pop()?.toLowerCase();

    let content = "";

    if (ext === "xlsx") {
      const ExcelJS = (await import("exceljs")).default;
      const workbook = new ExcelJS.Workbook();
      const arrayBuffer = await file.arrayBuffer();
      await workbook.xlsx.load(arrayBuffer);
      let text = "";
      workbook.eachSheet((sheet) => {
        sheet.eachRow((row) => {
          const values = row.values as (string | number | null)[];
          text += values.slice(1).join("\t") + "\n";
        });
      });
      content = text;
    } else {
      content = await file.text();
    }

    if (!content.trim()) {
      setUploadMsg("Could not read file content.");
      return;
    }

    setParsing(true);
    setUploadMsg("");
    setParsed([]);

    const token = await getToken();
    const res = await fetch("/api/parse-treatments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ content, filename: file.name }),
    });

    setParsing(false);

    if (res.ok) {
      const data = await res.json();
      setParsed(data.treatments ?? []);
    } else {
      const err = await res.json().catch(() => ({ error: "Parse failed" }));
      setUploadMsg(err.error || "Parse failed");
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(true);
  }

  function handleDragLeave() {
    setDragActive(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    handleFiles(e.dataTransfer.files);
  }

  /* ── Save parsed treatments ──────────────────────────────────── */
  async function saveParsed() {
    const token = await getToken();
    const res = await fetch("/api/admin/treatments/batch", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ treatments: parsed }),
    });
    if (res.ok) {
      setUploadMsg(`${parsed.length} treatments saved!`);
      setParsed([]);
      loadTreatments();
    }
  }

  function removeParsed(index: number) {
    setParsed((prev) => prev.filter((_, i) => i !== index));
  }

  function updateParsed(index: number, field: string, value: string) {
    setParsed((prev) =>
      prev.map((t, i) => (i === index ? { ...t, [field]: value } : t))
    );
  }

  function updateParsedCode(
    tIndex: number,
    cIndex: number,
    field: keyof TreatmentCode,
    value: string | number
  ) {
    setParsed((prev) =>
      prev.map((t, i) => {
        if (i !== tIndex) return t;
        const codes = [...t.codes];
        codes[cIndex] = { ...codes[cIndex], [field]: value };
        return { ...t, codes };
      })
    );
  }

  /* ── Management actions ──────────────────────────────────────── */
  const filtered = useMemo(() => {
    let list = treatments;
    if (filterCat) list = list.filter((t) => t.category === filterCat);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.codes.some(
            (c) =>
              c.code.toLowerCase().includes(q) ||
              c.description.toLowerCase().includes(q)
          )
      );
    }
    return list;
  }, [treatments, search, filterCat]);

  function startEdit(t: Treatment) {
    setExpandedId(t.id);
    setEditData({
      name: t.name,
      category: t.category,
      codes: t.codes.map((c) => ({ ...c })),
      termsAndConditions: t.termsAndConditions,
    });
    setAddMode(false);
  }

  function startAdd() {
    setExpandedId(null);
    setAddMode(true);
    setEditData({
      name: "",
      category: "other",
      codes: [{ code: "", description: "", price: 0 }],
      termsAndConditions: "",
    });
  }

  function cancelEdit() {
    setExpandedId(null);
    setAddMode(false);
    setEditData(null);
  }

  function updateEdit(field: string, value: string) {
    if (!editData) return;
    setEditData({ ...editData, [field]: value });
  }

  function updateCode(index: number, field: keyof TreatmentCode, value: string | number) {
    if (!editData) return;
    const codes = [...editData.codes];
    codes[index] = { ...codes[index], [field]: value };
    setEditData({ ...editData, codes });
  }

  function addCode() {
    if (!editData) return;
    setEditData({
      ...editData,
      codes: [...editData.codes, { code: "", description: "", price: 0 }],
    });
  }

  function removeCode(index: number) {
    if (!editData) return;
    setEditData({
      ...editData,
      codes: editData.codes.filter((_, i) => i !== index),
    });
  }

  async function saveEdit() {
    if (!editData) return;
    const token = await getToken();

    if (addMode) {
      const res = await fetch("/api/admin/treatments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(editData),
      });
      if (res.ok) {
        cancelEdit();
        loadTreatments();
      }
    } else if (expandedId) {
      const res = await fetch(`/api/admin/treatments/${expandedId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(editData),
      });
      if (res.ok) {
        cancelEdit();
        loadTreatments();
      }
    }
  }

  async function deleteTreatment() {
    if (!expandedId) return;
    if (!confirm("Delete this treatment?")) return;
    const token = await getToken();
    const res = await fetch(`/api/admin/treatments/${expandedId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      cancelEdit();
      loadTreatments();
    }
  }

  function priceRange(codes: TreatmentCode[]): string {
    if (codes.length === 0) return "-";
    const prices = codes.map((c) => c.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    if (min === max) return min.toFixed(2);
    return `${min.toFixed(2)} - ${max.toFixed(2)}`;
  }

  /* ── Render ──────────────────────────────────────────────────── */
  return (
    <div>
      <h1 className={styles.heading}>Treatments</h1>

      {/* ═══ UPLOAD SECTION ═══ */}
      <h2 className={styles.sectionHeading}>Upload Treatments</h2>

      <div
        className={`${styles.dropZone} ${dragActive ? styles.dropZoneActive : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <p className={styles.dropZoneText}>
          Drop .xlsx, .docx, or .pdf files here
        </p>
        <input
          type="file"
          accept=".xlsx,.docx,.pdf"
          onChange={(e) => handleFiles(e.target.files)}
          style={{ marginTop: 8 }}
        />
      </div>

      {parsing && <p className={styles.uploadStatus}>Parsing with Claude...</p>}
      {uploadMsg && <p className={styles.successMsg}>{uploadMsg}</p>}

      {parsed.length > 0 && (
        <div className={styles.reviewSection}>
          <h3>Review Extracted Treatments ({parsed.length})</h3>
          <table className={styles.reviewTable}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Codes</th>
                <th>T&amp;Cs</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {parsed.map((t, ti) => (
                <tr key={ti}>
                  <td>
                    <input
                      className={styles.input}
                      value={t.name}
                      onChange={(e) => updateParsed(ti, "name", e.target.value)}
                    />
                  </td>
                  <td>
                    <select
                      className={styles.filterSelect}
                      value={t.category}
                      onChange={(e) => updateParsed(ti, "category", e.target.value)}
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {t.codes.map((code, ci) => (
                      <div key={ci} style={{ fontSize: "0.8rem", marginBottom: 2 }}>
                        <input
                          style={{ width: 60 }}
                          value={code.code}
                          onChange={(e) => updateParsedCode(ti, ci, "code", e.target.value)}
                        />
                        <input
                          style={{ width: 120, marginLeft: 4 }}
                          value={code.description}
                          onChange={(e) => updateParsedCode(ti, ci, "description", e.target.value)}
                        />
                        <input
                          style={{ width: 60, marginLeft: 4 }}
                          type="number"
                          value={code.price}
                          onChange={(e) => updateParsedCode(ti, ci, "price", parseFloat(e.target.value) || 0)}
                        />
                      </div>
                    ))}
                  </td>
                  <td>
                    <input
                      className={styles.input}
                      value={t.termsAndConditions}
                      onChange={(e) => updateParsed(ti, "termsAndConditions", e.target.value)}
                      style={{ width: 120 }}
                    />
                  </td>
                  <td>
                    <button className={styles.smallBtn} onClick={() => removeParsed(ti)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className={styles.confirmBar}>
            <button className={styles.saveBtn} onClick={saveParsed}>
              Save All
            </button>
          </div>
        </div>
      )}

      {/* ═══ MANAGEMENT SECTION ═══ */}
      <h2 className={styles.sectionHeading}>Manage Treatments</h2>

      <div className={styles.toolbar}>
        <input
          className={styles.searchInput}
          placeholder="Search treatments..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className={styles.filterSelect}
          value={filterCat}
          onChange={(e) => setFilterCat(e.target.value)}
        >
          <option value="">All Categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <button className={styles.addBtn} onClick={startAdd}>
          Add Treatment
        </button>
      </div>

      {/* Add form */}
      {addMode && editData && (
        <div className={styles.editor}>
          <div className={styles.editorGrid}>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Name</label>
              <input
                className={styles.input}
                value={editData.name}
                onChange={(e) => updateEdit("name", e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Category</label>
              <select
                className={styles.input}
                value={editData.category}
                onChange={(e) => updateEdit("category", e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel}>Codes</label>
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
                {editData.codes.map((c, i) => (
                  <tr key={i}>
                    <td>
                      <input
                        className={styles.input}
                        value={c.code}
                        onChange={(e) => updateCode(i, "code", e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        className={styles.input}
                        value={c.description}
                        onChange={(e) => updateCode(i, "description", e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        className={styles.input}
                        type="number"
                        value={c.price}
                        onChange={(e) => updateCode(i, "price", parseFloat(e.target.value) || 0)}
                      />
                    </td>
                    <td>
                      <button className={styles.smallBtn} onClick={() => removeCode(i)}>X</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className={styles.smallBtn} onClick={addCode} style={{ marginTop: 4 }}>
              + Add Code
            </button>
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel}>Terms &amp; Conditions</label>
            <textarea
              className={styles.textarea}
              value={editData.termsAndConditions}
              onChange={(e) => updateEdit("termsAndConditions", e.target.value)}
              rows={3}
            />
          </div>

          <div className={styles.editorActions}>
            <button className={styles.saveBtn} onClick={saveEdit}>Save</button>
            <button className={styles.cancelBtn} onClick={cancelEdit}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <p>Loading...</p>
      ) : filtered.length === 0 ? (
        <p className={styles.empty}>No treatments found.</p>
      ) : (
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
            {filtered.map((t) => (
              <>
                <tr
                  key={t.id}
                  className={styles.clickableRow}
                  onClick={() => (expandedId === t.id ? cancelEdit() : startEdit(t))}
                >
                  <td>{t.name}</td>
                  <td><span className={styles.category}>{t.category}</span></td>
                  <td>{t.codes.length}</td>
                  <td className={styles.priceRange}>{priceRange(t.codes)}</td>
                </tr>
                {expandedId === t.id && editData && (
                  <tr key={`${t.id}-edit`} className={styles.expandedRow}>
                    <td colSpan={4}>
                      <div className={styles.editor}>
                        <div className={styles.editorGrid}>
                          <div className={styles.field}>
                            <label className={styles.fieldLabel}>Name</label>
                            <input
                              className={styles.input}
                              value={editData.name}
                              onChange={(e) => updateEdit("name", e.target.value)}
                            />
                          </div>
                          <div className={styles.field}>
                            <label className={styles.fieldLabel}>Category</label>
                            <select
                              className={styles.input}
                              value={editData.category}
                              onChange={(e) => updateEdit("category", e.target.value)}
                            >
                              {CATEGORIES.map((c) => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className={styles.field}>
                          <label className={styles.fieldLabel}>Codes</label>
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
                              {editData.codes.map((c, i) => (
                                <tr key={i}>
                                  <td>
                                    <input
                                      className={styles.input}
                                      value={c.code}
                                      onChange={(e) => updateCode(i, "code", e.target.value)}
                                    />
                                  </td>
                                  <td>
                                    <input
                                      className={styles.input}
                                      value={c.description}
                                      onChange={(e) => updateCode(i, "description", e.target.value)}
                                    />
                                  </td>
                                  <td>
                                    <input
                                      className={styles.input}
                                      type="number"
                                      value={c.price}
                                      onChange={(e) => updateCode(i, "price", parseFloat(e.target.value) || 0)}
                                    />
                                  </td>
                                  <td>
                                    <button className={styles.smallBtn} onClick={() => removeCode(i)}>X</button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <button className={styles.smallBtn} onClick={addCode} style={{ marginTop: 4 }}>
                            + Add Code
                          </button>
                        </div>

                        <div className={styles.field}>
                          <label className={styles.fieldLabel}>Terms &amp; Conditions</label>
                          <textarea
                            className={styles.textarea}
                            value={editData.termsAndConditions}
                            onChange={(e) => updateEdit("termsAndConditions", e.target.value)}
                            rows={3}
                          />
                        </div>

                        <div className={styles.editorActions}>
                          <button className={styles.saveBtn} onClick={saveEdit}>Save</button>
                          <button className={styles.cancelBtn} onClick={cancelEdit}>Cancel</button>
                          <button className={styles.deleteBtn} onClick={deleteTreatment}>Delete</button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
