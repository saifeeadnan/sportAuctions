type BadgeVariant = "neutral" | "info" | "warning" | "success" | "danger";

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  neutral: "bg-black/5 dark:bg-white/10 text-black/70 dark:text-white/70",
  info: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
  warning: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  danger: "bg-red-500/10 text-red-700 dark:text-red-400",
};

export function Badge({
  children,
  variant = "neutral",
}: {
  children: React.ReactNode;
  variant?: BadgeVariant;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${VARIANT_CLASSES[variant]}`}
    >
      {children}
    </span>
  );
}
