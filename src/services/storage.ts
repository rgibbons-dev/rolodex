/**
 * File storage service — stubs Cloudflare R2 / S3 with local filesystem.
 *
 * In production, swap this for the R2 or S3 SDK.
 */

import { writeFile, unlink, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname } from "path";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";

async function ensureDir(dir: string) {
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

export const storage = {
  /**
   * Upload a file and return a public URL path.
   * In production this would upload to R2 and return a CDN URL.
   */
  async upload(key: string, data: Buffer, _contentType?: string): Promise<string> {
    const filePath = join(UPLOAD_DIR, key);
    await ensureDir(dirname(filePath));
    await writeFile(filePath, data);
    // Return a URL path that the API can serve
    return `/uploads/${key}`;
  },

  /**
   * Delete a file by key.
   */
  async remove(key: string): Promise<void> {
    const filePath = join(UPLOAD_DIR, key);
    try {
      await unlink(filePath);
    } catch {
      // File may not exist — ignore
    }
  },

  /**
   * Get the local file path for serving. In production, this would be a CDN URL.
   */
  getLocalPath(key: string): string {
    return join(UPLOAD_DIR, key);
  },
};
