export function WizardProgress({ steps, currentStep }: { steps: string[]; currentStep: number }) {
  return (
    <ol className="flex items-center gap-2 flex-wrap">
      {steps.map((label, i) => {
        const isCurrent = i === currentStep;
        const isDone = i < currentStep;
        return (
          <li key={label} className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                  isCurrent
                    ? "bg-indigo-600 dark:bg-indigo-500 text-white"
                    : isDone
                      ? "bg-indigo-600/15 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300"
                      : "bg-black/[0.06] dark:bg-white/[0.08] text-black/50 dark:text-white/50"
                }`}
              >
                {i + 1}
              </span>
              <span
                className={`text-sm ${
                  isCurrent
                    ? "font-medium text-black dark:text-white"
                    : "text-black/50 dark:text-white/50"
                }`}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <span className="h-px w-6 bg-black/10 dark:bg-white/10" aria-hidden />
            )}
          </li>
        );
      })}
    </ol>
  );
}
