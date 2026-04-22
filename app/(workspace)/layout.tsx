"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import styles from "./layout.module.css";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/estimates/new", label: "New Estimate" },
  { href: "/reports/new", label: "New Report" },
  { href: "/patients", label: "Patients" },
  { href: "/treatments", label: "Treatments" },
  { href: "/settings", label: "Settings" },
];

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, signOut } = useAuth();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) return null;

  return (
    <div className={styles.container}>
      <aside className={styles.sidebar}>
        <div className={styles.logo}>
          <Link href="/dashboard" style={{ color: "inherit", textDecoration: "none" }}>
            DentistPDF
          </Link>
        </div>
        <nav>
          <ul className={styles.nav}>
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={pathname.startsWith(item.href) ? styles.navItemActive : styles.navItem}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className={styles.userBar}>
          <span className={styles.userEmail}>{user.email}</span>
          <button className={styles.signOutBtn} onClick={signOut}>Sign Out</button>
        </div>
      </aside>
      <main className={styles.content}>{children}</main>
    </div>
  );
}
