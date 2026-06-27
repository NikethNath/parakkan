"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Admin dropdown to classify one staff line (credit → creditor, expense →
 * bucket). PATCHes `endpoint` with `{ [field]: id | null }`.
 */
export default function ClassifySelect({
  endpoint,
  field,
  current,
  options,
}: {
  endpoint: string;
  field: "creditorId" | "bucketId";
  current: number | null;
  options: { id: number; name: string }[];
}) {
  const router = useRouter();
  const [val, setVal] = useState(current ? String(current) : "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(false);

  async function onChange(next: string) {
    const prev = val;
    setVal(next);
    setSaving(true);
    setErr(false);
    try {
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: next ? Number(next) : null }),
      });
      if (!res.ok) {
        setVal(prev);
        setErr(true);
      } else {
        router.refresh();
      }
    } catch {
      setVal(prev);
      setErr(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <select
      value={val}
      onChange={(e) => onChange(e.target.value)}
      disabled={saving}
      className={
        "rounded-lg border bg-surface px-2 py-1 text-sm " +
        (err ? "border-red-500" : val ? "border-border" : "border-amber-400 dark:border-amber-500/50")
      }
    >
      <option value="">— unassigned —</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}
