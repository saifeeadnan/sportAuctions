"use client";

import { useState } from "react";
import { adminUpdateProfileAction } from "@/lib/actions/auth.actions";
import { inputClass, buttonSecondary } from "@/lib/ui";

/** Renders a person's Login ID as a click-to-edit trigger for their
 * email/phone — replaces the plain Login ID table cell so there's no
 * separate "Edit profile" action taking up space in the actions column. */
export function EditProfileButton({
  userId,
  loginId,
  email,
  phone,
}: {
  userId: string;
  loginId: string;
  email: string | null;
  phone: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [emailValue, setEmailValue] = useState(email ?? "");
  const [phoneValue, setPhoneValue] = useState(phone ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Edit email/phone"
        className="text-left hover:underline underline-offset-2 decoration-dotted"
      >
        {loginId}
      </button>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const formData = new FormData();
    formData.set("email", emailValue);
    formData.set("phone", phoneValue);
    const result = await adminUpdateProfileAction(userId, formData);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSuccess(true);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col items-start gap-1">
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="email"
          value={emailValue}
          onChange={(e) => {
            setEmailValue(e.target.value);
            setSuccess(false);
          }}
          placeholder="Email"
          className={`${inputClass} py-1 text-xs w-32`}
        />
        <input
          type="tel"
          value={phoneValue}
          onChange={(e) => {
            setPhoneValue(e.target.value);
            setSuccess(false);
          }}
          placeholder="Phone"
          className={`${inputClass} py-1 text-xs w-28`}
        />
        <button type="submit" disabled={loading} className={`${buttonSecondary} px-2 py-1 text-xs`}>
          {loading ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white"
        >
          Cancel
        </button>
      </div>
      {error && <span className="text-xs text-red-600">{error}</span>}
      {success && <span className="text-xs text-emerald-600">Profile updated.</span>}
    </form>
  );
}
