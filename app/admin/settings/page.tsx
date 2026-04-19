"use client";

import { useEffect, useState } from "react";
import type { PracticeSettings } from "@/lib/types";
import styles from "./page.module.css";

const EMPTY_SETTINGS: PracticeSettings = {
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

export default function SettingsPage() {
  const [settings, setSettings] = useState<PracticeSettings>(EMPTY_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((data) => setSettings({ ...EMPTY_SETTINGS, ...data }))
      .catch(() => {});
  }, []);

  function update(field: keyof PracticeSettings, value: string | number) {
    setSettings((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setToast(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error("Save failed");
      setToast("Settings saved.");
      setTimeout(() => setToast(null), 3000);
    } catch {
      setToast(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Settings</h1>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Practice Details</h2>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>Practice Name</label>
          <input
            className={styles.input}
            value={settings.name}
            onChange={(e) => update("name", e.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>Address</label>
          <input
            className={styles.input}
            value={settings.address}
            onChange={(e) => update("address", e.target.value)}
          />
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Phone</label>
            <input
              className={styles.input}
              value={settings.phone}
              onChange={(e) => update("phone", e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Email</label>
            <input
              className={styles.input}
              type="email"
              value={settings.email}
              onChange={(e) => update("email", e.target.value)}
            />
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>VAT Number</label>
          <input
            className={styles.input}
            value={settings.vatNumber}
            onChange={(e) => update("vatNumber", e.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>Logo URL</label>
          <input
            className={styles.input}
            value={settings.logo}
            onChange={(e) => update("logo", e.target.value)}
            placeholder="https://..."
          />
        </div>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Billing</h2>

        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Currency</label>
            <input
              className={styles.input}
              value={settings.currency}
              onChange={(e) => update("currency", e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>VAT Rate (%)</label>
            <input
              className={styles.input}
              type="number"
              value={settings.vatRate}
              onChange={(e) => update("vatRate", parseFloat(e.target.value) || 0)}
            />
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>Quote Validity (days)</label>
          <input
            className={styles.input}
            type="number"
            value={settings.quoteValidityDays}
            onChange={(e) => update("quoteValidityDays", parseInt(e.target.value) || 0)}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>Default Payment Terms</label>
          <textarea
            className={styles.textarea}
            value={settings.defaultPaymentTerms}
            onChange={(e) => update("defaultPaymentTerms", e.target.value)}
          />
        </div>
      </div>

      <button
        className={styles.saveBtn}
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? "Saving..." : "Save Settings"}
      </button>

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}
