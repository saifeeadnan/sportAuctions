import { AuthError } from "@/lib/auth/guards";
import { DomainError } from "@/lib/errors";

// `never` (not `undefined`) on the absent side is what makes TypeScript
// narrow this reliably after an `if (result.error) return` guard — typing
// it `undefined` instead compiles but leaves `result.data` "possibly
// undefined" on the other side of the guard.
export type ActionResult<T = void> = { data: T; error?: never } | { data?: never; error: string };

/**
 * Runs a Server Action's body and converts known/expected errors (auth and
 * domain-rule violations) into a returned { error } value instead of a
 * thrown exception. Next.js strips a thrown error down to a generic
 * "message omitted in production builds" string once deployed — only the
 * digest and a log line survive on the server — so anything the UI needs to
 * show the user must cross the server/client boundary as data, not a throw.
 * Genuinely unexpected errors (bugs, not user-facing validation) still
 * throw, hitting the nearest error boundary as intended.
 */
export async function toActionResult<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { data: await fn() };
  } catch (error) {
    if (error instanceof AuthError || error instanceof DomainError) {
      return { error: error.message };
    }
    throw error;
  }
}
