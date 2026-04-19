"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import styles from "./layout.module.css";

const NAV_ITEMS = [
  { href: "/admin/treatments", label: "Treatments" },
  { href: "/admin/templates", label: "Templates" },
  { href: "/admin/settings", label: "Settings" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className={styles.container}>
      <aside className={styles.sidebar}>
        <div className={styles.logo}>
          <Link href="/" style={{ color: "inherit", textDecoration: "none" }}>
            DentistPDF
          </Link>
        </div>
        <nav>
          <ul className={styles.nav}>
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={
                    pathname === item.href ? styles.navItemActive : styles.navItem
                  }
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <main className={styles.content}>{children}</main>
    </div>
  );
}
