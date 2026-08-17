"use client";

export function CloseWindowButton() {
  return (
    <button
      type="button"
      onClick={() => window.close()}
      className="text-sm underline underline-offset-2 text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white"
    >
      Close window
    </button>
  );
}
