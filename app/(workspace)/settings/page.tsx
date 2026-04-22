"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
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
  basicCodes: [],
};

export default function SettingsPage() {
  const { getToken } = useAuth();
  const [settings, setSettings] = useState<PracticeSettings>(EMPTY_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (!token) return;
      const res = await fetch("/api/admin/settings", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSettings({ ...EMPTY_SETTINGS, ...data });
      }
      setLoading(false);
    })();
  }, [getToken]);

  function update(field: keyof PracticeSettings, value: string | number | string[]) {
    setSettings((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    setSaving(true);
    const token = await getToken();
    const res = await fetch("/api/admin/settings", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(settings),
    });
    setSaving(false);
    if (res.ok) {
      setToast("Settings saved successfully!");
      setTimeout(() => setToast(""), 3000);
    }
  }

  if (loading) return <p>Loading...</p>;

  return (
    <div className={styles.container}>
      <h1 className={styles.heading}>Settings</h1>

      {toast && <div className={styles.toast}>{toast}</div>}

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
            onChange={(e) => update("quoteValidityDays", parseInt(e.target.value) || 30)}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>Default Payment Terms</label>
          <textarea
            className={styles.textarea}
            value={settings.defaultPaymentTerms}
            onChange={(e) => update("defaultPaymentTerms", e.target.value)}
            rows={3}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>Basic Codes (auto-added per appointment)</label>
          <input
            className={styles.input}
            placeholder="e.g. 8109, 8109, 8110, 8145, 8304, 8158"
            value={(settings.basicCodes ?? []).join(", ")}
            onChange={(e) =>
              update(
                "basicCodes",
                e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
              )
            }
          />
          <span style={{ fontSize: "0.75rem", color: "#666", marginTop: 2 }}>
            Comma-separated procedure codes added to every new appointment
          </span>
        </div>
      </div>

      <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
        {saving ? "Saving..." : "Save Settings"}
      </button>
    </div>
  );
}
