import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const app = getApps().length > 0
  ? getApps()[0]
  : initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
      storageBucket: `${process.env.FIREBASE_PROJECT_ID}.firebasestorage.app`,
    });

async function main() {
  const bucket = getStorage(app).bucket();

  const templates = [
    { local: "data/estimate-template.xlsx", remote: "templates/estimate-template.xlsx" },
    { local: "data/report-template.pptx", remote: "templates/report-template.pptx" },
  ];

  for (const t of templates) {
    const filePath = path.resolve(process.cwd(), t.local);
    if (!fs.existsSync(filePath)) {
      console.log(`Skipping ${t.local} — not found`);
      continue;
    }
    console.log(`Uploading ${t.local} → ${t.remote}...`);
    await bucket.upload(filePath, {
      destination: t.remote,
      metadata: {
        contentType: t.local.endsWith(".xlsx")
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      },
    });
    console.log(`  Done.`);
  }

  console.log("\nAll templates uploaded to Firebase Storage.");
}

main().catch((err) => {
  console.error("Upload failed:", err);
  process.exit(1);
});
