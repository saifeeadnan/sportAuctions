"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * `window.close()` only works on a window the script itself opened — true
 * for the normal desktop popup flow (openAnalyticsV2DashboardWindow), but
 * the tablet/touch fallback (isTouchPrimaryDevice in lib/auction/
 * popupWindow.ts) navigates same-tab instead, where window.close() silently
 * does nothing and would leave the manager stuck. window.opener is non-null
 * only in the former case, so it's a reliable way to pick the right action.
 * Read in an effect (not during render) so the server-rendered label always
 * matches the client's first paint — `window` doesn't exist during SSR.
 */
export function CloseWindowButton() {
  const router = useRouter();
  const [isPopup, setIsPopup] = useState(false);

  useEffect(() => {
    setIsPopup(window.opener != null);
  }, []);

  return (
    <button
      type="button"
      onClick={() => {
        if (window.opener) {
          window.close();
        } else {
          router.back();
        }
      }}
      className="text-sm underline underline-offset-2 text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white"
    >
      {isPopup ? "Close window" : "Back"}
    </button>
  );
}
