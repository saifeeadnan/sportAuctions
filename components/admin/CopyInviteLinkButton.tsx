"use client";

import { useState } from "react";
import { buttonSecondary } from "@/lib/ui";

export function CopyInviteLinkButton({
  path,
  label = "Copy invite link",
}: {
  path: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can fail (permissions, insecure context) — no harm
      // done, the button just stays in its normal state.
    }
  }

  return (
    <button type="button" onClick={handleCopy} className={`${buttonSecondary} px-2 py-1 text-xs`}>
      {copied ? "Copied!" : label}
    </button>
  );
}
