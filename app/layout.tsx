import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dental Consultation Reports",
  description: "Generate patient consultation PDF reports",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
