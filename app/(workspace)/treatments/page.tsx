"use client";

import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import type { Treatment, TreatmentCode, ParsedTreatment } from "@/lib/types";
import styles from "./page.module.css";

const CATEGORIES = [
  "aesthetic",
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

export default function TreatmentsPage() {
  const { getToken } = useAuth();

  /* -- Upload state ------------------------------------------------ */
  const [dragActive, setDragActive] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parsedTreatments, setParsedTreatments] = useState<ParsedTreatment[]>([]);
  const [uploadMsg, setUploadMsg] = useState("");

  /* -- Management state -------------------------------------------- */
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Omit<Treatment, "id"> | null>(null);
  const [addMode, setAddMode] = useState(false);

  /* -- Load treatments --------------------------------------------- */
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
  }, [getToken]);

  /* -- File parsing ------------------------------------------------ */
  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    const ext = file.name.split(".").pop()?.toLowerCase();
    const token = await getToken();

    setParsing(true);
    setUploadMsg("");
    setParsedTreatments([]);

    try {
      if (ext === "xlsx") {
        // Send raw file as FormData — server parses with ExcelJS
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/parse-treatments", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });

        setParsing(false);

        if (res.ok) {
          const data = await res.json();
          setParsedTreatments(data.treatments ?? []);
          if (data.count === 0) {
            setUploadMsg("No treatments found in the spreadsheet.");
          }
        } else {
          const err = await res.json().catch(() => ({ error: "Parse failed" }));
          setUploadMsg(err.error || "Parse failed");
        }
      } else {
        // Legacy: read file as text, send JSON to Claude-based parser
        let content = "";
        content = await file.text();

        if (!content.trim()) {
          setParsing(false);
          setUploadMsg("Could not read file content.");
          return;
        }

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
          // Claude returns the old format — adapt to ParsedTreatment[]
          const claudeResults = data.treatments ?? [];
          const adapted: ParsedTreatment[] = [];
          for (const t of claudeResults) {
            if (t.codes && Array.isArray(t.codes)) {
              for (const c of t.codes) {
                adapted.push({
                  code: c.code || "",
                  description: c.description || t.name || "",
                  icd10: "",
                  unitCost: c.price || 0,
                  labFee: 0,
                  implantFee: 0,
                  source: "Claude",
                  category: t.category || "other",
                  termsAndConditions: t.termsAndConditions || "",
                  warranty: "",
                  isLabFee: false,
                });
              }
            }
          }
          setParsedTreatments(adapted);
        } else {
          const err = await res.json().catch(() => ({ error: "Parse failed" }));
          setUploadMsg(err.error || "Parse failed");
        }
      }
    } catch {
      setParsing(false);
      setUploadMsg("An error occurred while parsing the file.");
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

  /* -- Save parsed treatments -------------------------------------- */
  async function saveParsed() {
    const token = await getToken();
    const res = await fetch("/api/admin/treatments/batch", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ parsed: parsedTreatments }),
    });
    if (res.ok) {
      const data = await res.json();
      setUploadMsg(`${data.count} treatments saved!`);
      setParsedTreatments([]);
      loadTreatments();
    }
  }

  function removeParsed(index: number) {
    setParsedTreatments((prev) => prev.filter((_, i) => i !== index));
  }

  function updateParsed(index: number, field: keyof ParsedTreatment, value: string | number) {
    setParsedTreatments((prev) =>
      prev.map((t, i) => (i === index ? { ...t, [field]: value } : t))
    );
  }

  /* -- Management actions ------------------------------------------ */
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
      codes: [{ code: "", description: "", price: 0, icd10: "", labFee: 0, implantFee: 0 }],
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

  /* -- Render ------------------------------------------------------ */
  return (
    <div>
      <h1 className={styles.heading}>Treatments</h1>

      {/* === UPLOAD SECTION === */}
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

      {parsing && <p className={styles.uploadStatus}>Parsing spreadsheet...</p>}
      {uploadMsg && <p className={styles.successMsg}>{uploadMsg}</p>}

      {parsedTreatments.length > 0 && (
        <div className={styles.reviewSection}>
          <h3>Review Extracted Treatments</h3>
          <div className={styles.parseStats}>
            {parsedTreatments.filter(t => !t.isLabFee).length} procedures,{" "}
            {parsedTreatments.filter(t => t.isLabFee).length} lab fees,{" "}
            {parsedTreatments.filter(t => t.category === "aesthetic").length} aesthetic,{" "}
            {parsedTreatments.filter(t => t.termsAndConditions).length} with T&Cs
          </div>
          <table className={styles.reviewTable}>
            <thead>
              <tr>
                <th>Code</th>
                <th>Description</th>
                <th>Category</th>
                <th>ICD-10</th>
                <th>Price</th>
                <th>T&Cs</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {parsedTreatments.map((t, ti) => (
                <tr key={ti} style={t.isLabFee ? { opacity: 0.6 } : undefined}>
                  <td>
                    <input
                      className={styles.input}
                      value={t.code}
                      onChange={(e) => updateParsed(ti, "code", e.target.value)}
                      style={{ width: 80 }}
                    />
                  </td>
                  <td>
                    <input
                      className={styles.input}
                      value={t.description}
                      onChange={(e) => updateParsed(ti, "description", e.target.value)}
                      style={{ width: 200 }}
                    />
                  </td>
                  <td>
                    <span className={styles.category}>{t.category}</span>
                  </td>
                  <td style={{ fontSize: "0.8rem", color: "#666" }}>{t.icd10 || "—"}</td>
                  <td>
                    <input
                      className={styles.input}
                      type="number"
                      value={t.unitCost}
                      onChange={(e) =>
                        updateParsed(ti, "unitCost", parseFloat(e.target.value) || 0)
                      }
                      style={{ width: 90 }}
                    />
                  </td>
                  <td style={{ fontSize: "0.75rem", color: t.termsAndConditions ? "#198038" : "#ccc" }}>
                    {t.termsAndConditions ? "Yes" : "—"}
                  </td>
                  <td>
                    <button className={styles.smallBtn} onClick={() => removeParsed(ti)}>
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className={styles.confirmBar}>
            <button className={styles.saveBtn} onClick={saveParsed}>
              Save All ({parsedTreatments.length} treatments)
            </button>
            <button
              className={styles.cancelBtn}
              onClick={() => setParsedTreatments([])}
              style={{ marginLeft: 8 }}
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {/* === MANAGEMENT SECTION === */}
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
            <option key={c} value={c}>
              {c}
            </option>
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
                  <option key={c} value={c}>
                    {c}
                  </option>
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
                      <button className={styles.smallBtn} onClick={() => removeCode(i)}>
                        X
                      </button>
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
            <button className={styles.saveBtn} onClick={saveEdit}>
              Save
            </button>
            <button className={styles.cancelBtn} onClick={cancelEdit}>
              Cancel
            </button>
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
              <th>ICD-10</th>
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
                  <td>
                    <span className={styles.category}>{t.category}</span>
                  </td>
                  <td>{t.codes.length}</td>
                  <td className={styles.priceRange}>{priceRange(t.codes)}</td>
                  <td style={{ fontSize: "0.8rem", color: "#666" }}>
                    {t.codes[0]?.icd10 || "—"}
                  </td>
                </tr>
                {expandedId === t.id && editData && (
                  <tr key={`${t.id}-edit`} className={styles.expandedRow}>
                    <td colSpan={5}>
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
                                <option key={c} value={c}>
                                  {c}
                                </option>
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
                                <th>ICD-10</th>
                                <th>Unit Cost</th>
                                <th>Lab Fee</th>
                                <th>Implant Fee</th>
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
                                      style={{ width: 70 }}
                                    />
                                  </td>
                                  <td>
                                    <input
                                      className={styles.input}
                                      value={c.description}
                                      onChange={(e) =>
                                        updateCode(i, "description", e.target.value)
                                      }
                                    />
                                  </td>
                                  <td>
                                    <input
                                      className={styles.input}
                                      value={c.icd10 || ""}
                                      onChange={(e) => updateCode(i, "icd10", e.target.value)}
                                      style={{ width: 70 }}
                                    />
                                  </td>
                                  <td>
                                    <input
                                      className={styles.input}
                                      type="number"
                                      value={c.price}
                                      onChange={(e) =>
                                        updateCode(i, "price", parseFloat(e.target.value) || 0)
                                      }
                                      style={{ width: 80 }}
                                    />
                                  </td>
                                  <td>
                                    <input
                                      className={styles.input}
                                      type="number"
                                      value={c.labFee || 0}
                                      onChange={(e) =>
                                        updateCode(i, "labFee", parseFloat(e.target.value) || 0)
                                      }
                                      style={{ width: 80 }}
                                    />
                                  </td>
                                  <td>
                                    <input
                                      className={styles.input}
                                      type="number"
                                      value={c.implantFee || 0}
                                      onChange={(e) =>
                                        updateCode(i, "implantFee", parseFloat(e.target.value) || 0)
                                      }
                                      style={{ width: 80 }}
                                    />
                                  </td>
                                  <td>
                                    <button
                                      className={styles.smallBtn}
                                      onClick={() => removeCode(i)}
                                    >
                                      X
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <button
                            className={styles.smallBtn}
                            onClick={addCode}
                            style={{ marginTop: 4 }}
                          >
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
                          <button className={styles.saveBtn} onClick={saveEdit}>
                            Save
                          </button>
                          <button className={styles.cancelBtn} onClick={cancelEdit}>
                            Cancel
                          </button>
                          <button className={styles.deleteBtn} onClick={deleteTreatment}>
                            Delete
                          </button>
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
