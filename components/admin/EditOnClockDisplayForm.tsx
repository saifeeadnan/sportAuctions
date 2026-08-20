"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateOnClockDisplaySettingsAction } from "@/lib/actions/auction.actions";
import { buttonPrimary } from "@/lib/ui";
import type { OnClockTemplate, OnClockFieldKey } from "@/lib/onClockDisplay";
import { OnClockDisplayPicker } from "@/components/admin/OnClockDisplayPicker";

export function EditOnClockDisplayForm({
  auctionId,
  initialTemplate,
  initialVisibleFields,
}: {
  auctionId: string;
  initialTemplate: OnClockTemplate;
  initialVisibleFields: OnClockFieldKey[];
}) {
  const router = useRouter();
  const [template, setTemplate] = useState(initialTemplate);
  const [visibleFields, setVisibleFields] = useState(initialVisibleFields);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    setLoading(true);
    setError(null);
    const result = await updateOnClockDisplaySettingsAction(auctionId, {
      onClockTemplate: template,
      onClockVisibleFields: visibleFields,
    });
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <OnClockDisplayPicker
        template={template}
        onTemplateChange={setTemplate}
        visibleFields={visibleFields}
        onVisibleFieldsChange={setVisibleFields}
      />
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <button type="button" onClick={handleSave} disabled={loading} className={`${buttonPrimary} self-start`}>
        {loading ? "Saving…" : "Save display settings"}
      </button>
    </div>
  );
}
