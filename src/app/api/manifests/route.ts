import { randomUUID } from "crypto";
import { after } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { manifestUploads } from "@/db/schema";
import { requireSession } from "@/lib/api-auth";
import { isAuthDevBypassEnabled } from "@/lib/dev-bypass";
import { MAX_CSV_BYTES } from "@/lib/limits";
import { processManifestFile } from "@/lib/process-manifest";
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

  try {
    const storagePath = await saveUploadedFile(id, file.name, buf);
    await db.insert(manifestUploads).values({
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

  const list = await db
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
