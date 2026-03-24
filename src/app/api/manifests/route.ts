import { randomUUID } from "crypto";
import { after } from "next/server";
import { desc } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db";
import { manifestUploads } from "@/db/schema";
import { requireSession } from "@/lib/api-auth";
import { isAuthDevBypassEnabled } from "@/lib/dev-bypass";
import { MAX_CSV_BYTES } from "@/lib/limits";
import {
  memoryAddItems,
  memoryAddManifest,
  memoryListManifests,
  memoryUpdateManifest,
} from "@/lib/memory-store";
import { buildMemoryItemsFromCsv, processManifestFile } from "@/lib/process-manifest";
import { saveUploadedFile } from "@/lib/storage";

export async function POST(req: Request) {
  const authResult = await requireSession();
  if ("response" in authResult) return authResult.response;

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Missing file" }, { status: 400 });
  }

  if (file.size > MAX_CSV_BYTES) {
    return Response.json({ error: "File too large" }, { status: 413 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const id = randomUUID();

  if (!isDatabaseConfigured()) {
    memoryAddManifest({
      id,
      originalFilename: file.name,
      status: "processing",
      errorMessage: null,
      createdAt: new Date(),
    });
    try {
      const csv = buf.toString("utf-8");
      const inserts = await buildMemoryItemsFromCsv(id, csv);
      memoryAddItems(inserts);
      memoryUpdateManifest(id, { status: "ready", errorMessage: null });
      return Response.json({ id, status: "ready" });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Processing failed";
      memoryUpdateManifest(id, { status: "failed", errorMessage: message });
      return Response.json({ error: message }, { status: 500 });
    }
  }

  try {
    const storagePath = await saveUploadedFile(id, file.name, buf);
    await getDb().insert(manifestUploads).values({
      id,
      uploadedById: isAuthDevBypassEnabled() ? undefined : authResult.session.user.id,
      originalFilename: file.name,
      storagePath,
      status: "processing",
    });

    after(() => {
      processManifestFile(id).catch((err) => {
        console.error("Manifest processing failed", id, err);
      });
    });

    return Response.json({ id, status: "processing" });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Upload failed";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  const authResult = await requireSession();
  if ("response" in authResult) return authResult.response;

  if (!isDatabaseConfigured()) {
    const list = memoryListManifests();
    return Response.json({
      manifests: list.map((m) => ({
        id: m.id,
        originalFilename: m.originalFilename,
        status: m.status,
        errorMessage: m.errorMessage,
        createdAt: m.createdAt,
      })),
    });
  }

  const list = await getDb()
    .select({
      id: manifestUploads.id,
      originalFilename: manifestUploads.originalFilename,
      status: manifestUploads.status,
      errorMessage: manifestUploads.errorMessage,
      createdAt: manifestUploads.createdAt,
    })
    .from(manifestUploads)
    .orderBy(desc(manifestUploads.createdAt));

  return Response.json({ manifests: list });
}
