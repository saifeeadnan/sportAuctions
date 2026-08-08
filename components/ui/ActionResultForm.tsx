"use client";

import { useActionState } from "react";
import type { ActionResult } from "@/lib/actions/result";

/**
 * Wraps a plain <form action={...}> that previously relied on a thrown
 * error reaching the nearest error boundary. Now that actions return
 * { error } instead of throwing (Next.js redacts thrown-error messages in
 * production), this is what actually surfaces that message to the user
 * instead of the mutation silently no-oping.
 */
export function ActionResultForm({
  action,
  children,
  className,
}: {
  action: (prevState: unknown, formData: FormData) => Promise<ActionResult>;
  children: React.ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(action, null);
  return (
    <form action={formAction} className={className}>
      {children}
      {state?.error && <p className="text-sm text-red-600 dark:text-red-400 mt-2">{state.error}</p>}
    </form>
  );
}
