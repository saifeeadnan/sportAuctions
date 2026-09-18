"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputClass, buttonPrimary, buttonSecondary, tabsTrack, tabItem } from "@/lib/ui";

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    return data.error ?? fallback;
  } catch {
    return `${fallback} (HTTP ${res.status})`;
  }
}

export function ProfilePhotoForm({ userId, hasPhoto }: { userId: string; hasPhoto: boolean }) {
  const router = useRouter();
  const [source, setSource] = useState<"file" | "url">("file");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // React nulls out e.currentTarget once the synchronous part of the
    // handler finishes, so it must be captured before the first `await`.
    const form = e.currentTarget;
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData(form);
      const res = await fetch(`/api/users/${userId}/photo`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, "Failed to update photo"));
      form.reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update photo");
    } finally {
      setLoading(false);
    }
  }

  async function handleRemove() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/users/${userId}/photo`, { method: "DELETE" });
      if (!res.ok) throw new Error(await readErrorMessage(res, "Failed to remove photo"));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove photo");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className={tabsTrack}>
        <button type="button" onClick={() => setSource("file")} className={tabItem(source === "file")}>
          Upload file
        </button>
        <button type="button" onClick={() => setSource("url")} className={tabItem(source === "url")}>
          Use image URL
        </button>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {source === "file" ? (
          <label className="flex flex-col gap-1 text-sm">
            Photo (JPG or PNG, 300KB max)
            <input
              name="file"
              type="file"
              required
              accept="image/jpeg,image/png"
              className={`text-sm ${inputClass}`}
            />
          </label>
        ) : (
          <label className="flex flex-col gap-1 text-sm">
            Photo URL
            <input
              name="photoUrl"
              type="text"
              required
              placeholder="https://example.com/photo.jpg"
              className={inputClass}
            />
          </label>
        )}
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex items-center gap-2">
          <button type="submit" disabled={loading} className={buttonPrimary}>
            {loading ? "Saving…" : "Save photo"}
          </button>
          {hasPhoto && (
            <button type="button" disabled={loading} onClick={handleRemove} className={buttonSecondary}>
              Remove photo
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
