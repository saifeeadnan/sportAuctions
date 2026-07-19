"use client";

import { useState } from "react";
import { inputClass } from "@/lib/ui";

function deriveLoginId(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ".");
}

export function NameLoginIdFields() {
  const [loginId, setLoginId] = useState("");
  const [loginIdTouched, setLoginIdTouched] = useState(false);

  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="flex flex-col gap-1 text-sm">
        Name
        <input
          name="name"
          required
          className={inputClass}
          onChange={(e) => {
            if (!loginIdTouched) setLoginId(deriveLoginId(e.target.value));
          }}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Login ID
        <input
          name="loginId"
          type="text"
          required
          value={loginId}
          onChange={(e) => {
            setLoginIdTouched(true);
            setLoginId(e.target.value);
          }}
          className={inputClass}
        />
      </label>
    </div>
  );
}
