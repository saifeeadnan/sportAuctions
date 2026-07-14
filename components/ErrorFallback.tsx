"use client";

export function ErrorFallback({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <h1 className="text-lg font-semibold mb-2">Something went wrong</h1>
      <p className="text-sm text-red-600 mb-6">{error.message}</p>
      <button
        onClick={reset}
        className="rounded border border-black/20 dark:border-white/20 px-3 py-2 text-sm font-medium"
      >
        Try again
      </button>
    </div>
  );
}
