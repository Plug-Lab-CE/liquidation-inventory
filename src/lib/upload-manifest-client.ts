export type ManifestPostResult =
  | { ok: true; data: { id: string; status: string; error?: string } }
  | { ok: false; status: number; data: { error?: string } };

/**
 * POST /api/manifests with XMLHttpRequest so we get upload byte progress.
 */
export function postManifestWithUploadProgress(
  formData: FormData,
  onUploadProgress: (percent: number, loaded: number, total: number) => void,
  /** Fires when the request body has been fully sent (before the server responds). */
  onUploadBodyComplete?: () => void,
): Promise<ManifestPostResult> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/manifests");
    xhr.responseType = "text";

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) {
        const pct = Math.min(100, Math.round((e.loaded / e.total) * 100));
        onUploadProgress(pct, e.loaded, e.total);
      }
    };

    xhr.upload.onload = () => {
      onUploadBodyComplete?.();
    };

    xhr.onload = () => {
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(xhr.responseText || "{}") as Record<string, unknown>;
      } catch {
        /* ignore */
      }
      const ok = xhr.status >= 200 && xhr.status < 300;
      if (ok) {
        resolve({
          ok: true,
          data: data as { id: string; status: string; error?: string },
        });
      } else {
        resolve({
          ok: false,
          status: xhr.status,
          data: data as { error?: string },
        });
      }
    };

    xhr.onerror = () => {
      resolve({ ok: false, status: 0, data: { error: "Network error" } });
    };

    xhr.send(formData);
  });
}

export async function pollManifestUntilDone(
  manifestId: string,
  options: {
    intervalMs?: number;
    maxAttempts?: number;
    onStatus?: (
      status: string,
      itemCount: number | undefined,
      pollAttempt: number,
    ) => void;
  } = {},
): Promise<{ status: string; errorMessage: string | null; itemCount?: number }> {
  const intervalMs = options.intervalMs ?? 750;
  const maxAttempts = options.maxAttempts ?? 150;

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const res = await fetch(`/api/manifests/${manifestId}`);
    const data = (await res.json().catch(() => ({}))) as {
      manifest?: { status: string; errorMessage?: string | null };
      itemCount?: number;
    };
    const st = data.manifest?.status;
    if (st) {
      options.onStatus?.(st, data.itemCount, i);
    }
    if (st === "ready" || st === "failed") {
      return {
        status: st,
        errorMessage: data.manifest?.errorMessage ?? null,
        itemCount: data.itemCount,
      };
    }
  }

  throw new Error("Timed out waiting for manifest processing");
}
