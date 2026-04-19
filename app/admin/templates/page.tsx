"use client";

import { useEffect, useState } from "react";
import type { Template, TemplateStyling } from "@/lib/types";
import styles from "./page.module.css";

const AVAILABLE_SECTIONS = [
  "header",
  "summary",
  "findings",
  "recommendations",
  "followUp",
  "xrays",
];

const SECTION_LABELS: Record<string, string> = {
  header: "Header",
  summary: "Summary",
  findings: "Findings",
  recommendations: "Recommendations",
  followUp: "Follow-Up",
  xrays: "X-Rays",
};

const DEFAULT_STYLING: TemplateStyling = {
  primaryColor: "#0f62fe",
  logoPosition: "left",
  headerText: "",
};

function blankTemplate(): Omit<Template, "id"> {
  return {
    name: "",
    type: "clinical",
    sections: [...AVAILABLE_SECTIONS],
    sectionOrder: AVAILABLE_SECTIONS.map((_, i) => i),
    styling: { ...DEFAULT_STYLING },
  };
}

/* ---------- Template editor component ---------- */

function TemplateEditor({
  initial,
  isNew,
  onSave,
  onCancel,
  onDelete,
}: {
  initial: Omit<Template, "id">;
  isNew: boolean;
  onSave: (data: Omit<Template, "id">) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [type, setType] = useState<"clinical" | "estimate">(initial.type);
  const [sections, setSections] = useState<string[]>([...initial.sections]);
  const [styling, setStyling] = useState<TemplateStyling>({
    ...DEFAULT_STYLING,
    ...initial.styling,
  });
  const [saving, setSaving] = useState(false);

  // Ordered list: sections that are enabled, in their current order
  // Plus available ones that aren't enabled yet (appended at the end)
  const orderedAll = [
    ...sections,
    ...AVAILABLE_SECTIONS.filter((s) => !sections.includes(s)),
  ];

  function toggleSection(section: string) {
    setSections((prev) =>
      prev.includes(section)
        ? prev.filter((s) => s !== section)
        : [...prev, section]
    );
  }

  function moveSection(section: string, direction: -1 | 1) {
    setSections((prev) => {
      const idx = prev.indexOf(section);
      if (idx < 0) return prev;
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return next;
    });
  }

  function updateStyling<K extends keyof TemplateStyling>(
    key: K,
    value: TemplateStyling[K]
  ) {
    setStyling((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({
        name,
        type,
        sections,
        sectionOrder: sections.map((_, i) => i),
        styling,
      });
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
          <label className={styles.fieldLabel}>Type</label>
          <select
            className={styles.select}
            value={type}
            onChange={(e) => setType(e.target.value as "clinical" | "estimate")}
          >
            <option value="clinical">Clinical</option>
            <option value="estimate">Estimate</option>
          </select>
        </div>
      </div>

      <div className={styles.field}>
        <span className={styles.sectionsHeading}>Sections</span>
        <ul className={styles.sectionList}>
          {orderedAll.map((section) => {
            const isEnabled = sections.includes(section);
            const idx = sections.indexOf(section);
            return (
              <li key={section} className={styles.sectionItem}>
                <input
                  type="checkbox"
                  className={styles.sectionCheckbox}
                  checked={isEnabled}
                  onChange={() => toggleSection(section)}
                />
                <span className={styles.sectionName}>
                  {SECTION_LABELS[section] || section}
                </span>
                {isEnabled && (
                  <>
                    <button
                      type="button"
                      className={styles.reorderBtn}
                      disabled={idx === 0}
                      onClick={() => moveSection(section, -1)}
                    >
                      &#9650;
                    </button>
                    <button
                      type="button"
                      className={styles.reorderBtn}
                      disabled={idx === sections.length - 1}
                      onClick={() => moveSection(section, 1)}
                    >
                      &#9660;
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className={styles.field}>
        <span className={styles.stylingHeading}>Styling</span>
        <div className={styles.stylingGrid}>
          <div>
            <label className={styles.fieldLabel}>Primary Color</label>
            <input
              type="color"
              className={styles.colorInput}
              value={styling.primaryColor}
              onChange={(e) => updateStyling("primaryColor", e.target.value)}
            />
          </div>
          <div>
            <label className={styles.fieldLabel}>Logo Position</label>
            <select
              className={styles.select}
              value={styling.logoPosition}
              onChange={(e) =>
                updateStyling(
                  "logoPosition",
                  e.target.value as "left" | "center" | "right"
                )
              }
            >
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </div>
          <div>
            <label className={styles.fieldLabel}>Header Text</label>
            <input
              className={styles.input}
              value={styling.headerText}
              onChange={(e) => updateStyling("headerText", e.target.value)}
            />
          </div>
        </div>
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

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);

  useEffect(() => {
    loadTemplates();
  }, []);

  async function loadTemplates() {
    try {
      const res = await fetch("/api/admin/templates");
      if (res.ok) {
        const data = await res.json();
        setTemplates(data);
      }
    } catch {
      /* ignore */
    }
  }

  async function handleCreate(data: Omit<Template, "id">) {
    const res = await fetch("/api/admin/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Create failed");
    setAddingNew(false);
    await loadTemplates();
  }

  async function handleUpdate(id: string, data: Omit<Template, "id">) {
    const res = await fetch(`/api/admin/templates/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Update failed");
    setExpandedId(null);
    await loadTemplates();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this template?")) return;
    const res = await fetch(`/api/admin/templates/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Delete failed");
    setExpandedId(null);
    await loadTemplates();
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Templates</h1>

      <div className={styles.toolbar}>
        <button
          type="button"
          className={styles.addBtn}
          onClick={() => {
            setExpandedId(null);
            setAddingNew(true);
          }}
        >
          + Add Template
        </button>
      </div>

      <div className={styles.cardList}>
        {addingNew && (
          <div className={styles.card}>
            <TemplateEditor
              initial={blankTemplate()}
              isNew
              onSave={handleCreate}
              onCancel={() => setAddingNew(false)}
            />
          </div>
        )}

        {templates.length === 0 && !addingNew ? (
          <p className={styles.empty}>No templates found.</p>
        ) : (
          templates.map((t) => (
            <div key={t.id} className={styles.card}>
              <div
                className={styles.cardHeader}
                onClick={() => {
                  setAddingNew(false);
                  setExpandedId(expandedId === t.id ? null : t.id);
                }}
              >
                <span className={styles.cardName}>{t.name}</span>
                <span
                  className={
                    t.type === "clinical"
                      ? styles.typeBadgeClinical
                      : styles.typeBadgeEstimate
                  }
                >
                  {t.type.charAt(0).toUpperCase() + t.type.slice(1)}
                </span>
              </div>
              {expandedId === t.id && (
                <TemplateEditor
                  initial={t}
                  isNew={false}
                  onSave={(data) => handleUpdate(t.id, data)}
                  onCancel={() => setExpandedId(null)}
                  onDelete={() => handleDelete(t.id)}
                />
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
