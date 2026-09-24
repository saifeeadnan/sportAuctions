"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputClass, buttonPrimary } from "@/lib/ui";

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    return data.error ?? fallback;
  } catch {
    return `${fallback} (HTTP ${res.status})`;
  }
}

export function UploadTeamSponsorImageForm({
  teamId,
  compact = false,
}: {
  teamId: string;
  /** One tight row (picker + Upload) for tucking into a small panel. */
  compact?: boolean;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const res = await fetch(`/api/teams/${teamId}/sponsor-image`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, "Upload failed"));
      setFile(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  }

  if (compact) {
    return (
      <form onSubmit={handleSubmit} className="flex flex-col gap-1">
        <div className="flex items-center flex-wrap gap-2">
          <input
            required
            type="file"
            accept="image/jpeg,image/png"
            aria-label="Sponsor picture (JPG or PNG)"
            title="JPG or PNG"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="min-w-0 max-w-full text-xs"
          />
          <button type="submit" disabled={loading || !file} className={`${buttonPrimary} px-3 py-1 text-xs`}>
            {loading ? "Uploading…" : "Upload"}
          </button>
        </div>
        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 max-w-xl">
      <label className="flex flex-col gap-1 text-sm">
        Sponsor picture (JPG or PNG)
        <input
          required
          type="file"
          accept="image/jpeg,image/png"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className={`text-sm ${inputClass}`}
        />
      </label>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <button type="submit" disabled={loading || !file} className={`${buttonPrimary} self-start`}>
        {loading ? "Uploading…" : "Upload"}
      </button>
    </form>
  );
}
