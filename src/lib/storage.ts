import { mkdir, writeFile } from "fs/promises";
import path from "path";

const UPLOAD_ROOT =
  process.env.UPLOAD_DIR ?? path.join(process.cwd(), "data", "uploads");

export async function ensureUploadDir() {
  await mkdir(UPLOAD_ROOT, { recursive: true });
}

export function uploadPathForManifest(manifestId: string, originalName: string) {
  const safe = originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join(UPLOAD_ROOT, manifestId + "_" + safe);
}

export async function saveUploadedFile(
  manifestId: string,
  originalName: string,
  data: Buffer,
) {
  await ensureUploadDir();
  const full = uploadPathForManifest(manifestId, originalName);
  await writeFile(full, data);
  return full;
}

export function publicImageDir() {
  return path.join(process.cwd(), "public", "uploads", "images");
}

export async function savePublicImage(filename: string, data: Buffer) {
  const dir = publicImageDir();
  await mkdir(dir, { recursive: true });
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const full = path.join(dir, safe);
  await writeFile(full, data);
  return "/uploads/images/" + safe;
}
