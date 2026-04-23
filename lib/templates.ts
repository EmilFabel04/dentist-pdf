import { getStorage } from "firebase-admin/storage";
import { getApps } from "firebase-admin/app";
import * as fs from "fs";
import * as path from "path";

// Cache templates in memory (they rarely change)
const cache = new Map<string, Buffer>();

/**
 * Downloads a template from Firebase Storage with an in-memory cache.
 * Falls back to a local file in `data/` during development if the
 * Storage bucket is not yet configured.
 */
export async function getTemplateBuffer(remotePath: string): Promise<Buffer> {
  if (cache.has(remotePath)) return cache.get(remotePath)!;

  let buffer: Buffer;

  try {
    const bucket = getStorage(getApps()[0]).bucket();
    const file = bucket.file(remotePath);
    const [downloaded] = await file.download();
    buffer = downloaded;
  } catch (err) {
    // Fallback: try loading from local data/ directory
    const fileName = path.basename(remotePath);
    const localPath = path.resolve(process.cwd(), "data", fileName);
    if (fs.existsSync(localPath)) {
      console.warn(
        `[templates] Firebase Storage download failed, using local fallback: ${localPath}`
      );
      buffer = fs.readFileSync(localPath);
    } else {
      throw new Error(
        `Template not found in Storage (${remotePath}) or locally (${localPath}): ${(err as Error).message}`
      );
    }
  }

  cache.set(remotePath, buffer);
  return buffer;
}
