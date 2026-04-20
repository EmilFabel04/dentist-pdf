"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import styles from "./page.module.css";

export default function LoginPage() {
  const router = useRouter();
  const { signIn, user, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) {
    router.replace("/dashboard");
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email, password);
      router.replace("/dashboard");
    } catch {
      setError("Invalid email or password.");
      setSubmitting(false);
    }
  }

  if (loading) return null;

  return (
    <main className={styles.main}>
      <div className={styles.card}>
        <div className={styles.logoBox}>LOGO</div>
        <h1 className={styles.title}>Sign In</h1>
        <p className={styles.subtitle}>Dental Consultation Reports</p>
        <form onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Email</label>
            <input className={styles.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Password</label>
            <input className={styles.input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <p className={styles.error}>{error}</p>}
          <button className={styles.submitBtn} type="submit" disabled={submitting}>
            {submitting ? "Signing in\u2026" : "Sign In"}
          </button>
        </form>
      </div>
    </main>
  );
}
