"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const fmt = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Tiny button under a flagged meter reading: replaces the staff value with the
 *  official CRIS totalizer via the audited quick-fix endpoint. */
export default function MeterQuickFix({
  entryId,
  field,
  from,
  to,
}: {
  entryId: number;
  field: "n1Open" | "n1Close" | "n2Open" | "n2Close";
  from: number;
  to: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fix = async () => {
    if (
      !confirm(
        `Replace the staff reading ${fmt(from)} with the official CRIS reading ${fmt(to)}?\n\nThe sheet's litres and short/excess are recalculated and the change is logged.`,
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/entries/${entryId}/fix-reading`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field, value: to }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Could not fix");
        setBusy(false);
        return;
      }
      router.refresh();
    } catch {
      setError("Network error");
      setBusy(false);
    }
  };

  return (
    <div className="print:hidden">
      <button
        type="button"
        onClick={fix}
        disabled={busy}
        className="mt-0.5 rounded border border-red-300 dark:border-red-500/40 px-1.5 py-px text-[10px] font-medium leading-tight text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-50"
      >
        {busy ? "Fixing…" : "Fix → CRIS"}
      </button>
      {error && (
        <div className="text-[10px] leading-tight text-red-600 dark:text-red-400">{error}</div>
      )}
    </div>
  );
}
