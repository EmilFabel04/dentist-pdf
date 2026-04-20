"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import styles from "./page.module.css";

export default function DashboardPage() {
  const router = useRouter();
  const { getToken } = useAuth();
  const [stats, setStats] = useState({ totalPatients: 0, totalTreatments: 0 });

  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (!token) return;
      const res = await fetch("/api/dashboard-stats", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setStats(await res.json());
    })();
  }, [getToken]);

  return (
    <div>
      <h1 className={styles.heading}>Dashboard</h1>
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{stats.totalPatients}</span>
          <span className={styles.statLabel}>Patients</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{stats.totalTreatments}</span>
          <span className={styles.statLabel}>Treatments</span>
        </div>
      </div>
      <div className={styles.actionsRow}>
        <button className={styles.actionBtn} onClick={() => router.push("/consultation")}>
          New Consultation
        </button>
        <button className={styles.actionBtn} onClick={() => router.push("/treatments")}>
          Upload Treatments
        </button>
      </div>
    </div>
  );
}
