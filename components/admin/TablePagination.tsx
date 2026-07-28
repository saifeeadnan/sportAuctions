import Link from "next/link";
import { buttonSecondary } from "@/lib/ui";

export function TablePagination({
  page,
  pageSize,
  total,
  paramName,
  otherParams,
}: {
  page: number;
  pageSize: number;
  total: number;
  /** Query param this table's page number is stored under (each table on the
   * page gets its own, so paging one table doesn't reset the others). */
  paramName: string;
  /** The other tables' current page params, preserved as-is in generated links. */
  otherParams: Record<string, string | undefined>;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  function hrefFor(targetPage: number) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(otherParams)) {
      if (value) params.set(key, value);
    }
    params.set(paramName, String(targetPage));
    return `?${params.toString()}`;
  }

  return (
    <div className="flex items-center justify-between mt-2 text-sm">
      <span className="text-black/60 dark:text-white/60">
        Page {page} of {totalPages}
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} className={`${buttonSecondary} px-3 py-1 text-xs`}>
            Previous
          </Link>
        ) : (
          <span className={`${buttonSecondary} px-3 py-1 text-xs opacity-50 pointer-events-none`}>
            Previous
          </span>
        )}
        {page < totalPages ? (
          <Link href={hrefFor(page + 1)} className={`${buttonSecondary} px-3 py-1 text-xs`}>
            Next
          </Link>
        ) : (
          <span className={`${buttonSecondary} px-3 py-1 text-xs opacity-50 pointer-events-none`}>
            Next
          </span>
        )}
      </div>
    </div>
  );
}
