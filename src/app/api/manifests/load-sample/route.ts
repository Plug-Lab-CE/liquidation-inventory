import { randomUUID } from "crypto";
import { readFile } from "fs/promises";
import { join } from "path";
import { requireSession } from "@/lib/api-auth";
import { isDatabaseConfigured } from "@/db";
import {
  memoryAddItems,
  memoryAddManifest,
  memoryListManifests,
  memoryUpdateManifest,
} from "@/lib/memory-store";
import { buildMemoryItemsFromCsv } from "@/lib/process-manifest";

const SAMPLE_FILENAME = "bstock-wall-decor-manifest.csv";

export async function POST() {
  const authResult = await requireSession();
  if ("response" in authResult) return authResult.response;

  if (isDatabaseConfigured()) {
    return Response.json(
      { error: "Sample load is only for in-memory mode (unset DATABASE_URL)." },
      { status: 400 },
    );
  }

  const path = join(process.cwd(), "fixtures", SAMPLE_FILENAME);
  let csv: string;
  try {
    csv = await readFile(path, "utf-8");
  } catch {
    return Response.json({ error: "Bundled sample manifest not found on server." }, { status: 404 });
  }

  const id = randomUUID();
  const originalFilename = `Sample: ${SAMPLE_FILENAME}`;

  memoryAddManifest({
    id,
    originalFilename,
    status: "processing",
    errorMessage: null,
    createdAt: new Date(),
  });

  let lineCount = 0;
  try {
    const inserts = await buildMemoryItemsFromCsv(id, csv);
    lineCount = inserts.length;
    memoryAddItems(inserts);
    memoryUpdateManifest(id, { status: "ready", errorMessage: null });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Processing failed";
    memoryUpdateManifest(id, { status: "failed", errorMessage: message });
    return Response.json({ error: message }, { status: 500 });
  }

  const totalManifests = memoryListManifests().length;
  return Response.json({
    id,
    status: "ready",
    message: `Loaded sample manifest with ${lineCount} deduped line(s).`,
    totalManifests,
  });
}
