"use client";

import { useState } from "react";
import { resetUserPasswordAction } from "@/lib/actions/auth.actions";
import { inputClass, buttonSecondary } from "@/lib/ui";

export function ResetPasswordButton({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline underline-offset-2"
      >
        Reset password
      </button>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const formData = new FormData();
    formData.set("newPassword", newPassword);
    const result = await resetUserPasswordAction(userId, formData);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSuccess(true);
    setNewPassword("");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <input
          name="newPassword"
          type="password"
          required
          minLength={8}
          value={newPassword}
          onChange={(e) => {
            setNewPassword(e.target.value);
            setSuccess(false);
          }}
          placeholder="New password"
          className={`${inputClass} py-1 text-xs w-32`}
        />
        <button type="submit" disabled={loading} className={`${buttonSecondary} px-2 py-1 text-xs`}>
          {loading ? "Setting…" : "Set"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white"
        >
          Cancel
        </button>
      </div>
      {error && <span className="text-xs text-red-600 max-w-[16rem] text-right">{error}</span>}
      {success && <span className="text-xs text-emerald-600">Password updated.</span>}
    </form>
  );
}
