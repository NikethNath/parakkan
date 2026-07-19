"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type NozzleField = "n1Open" | "n1Close" | "n2Open" | "n2Close";

const fmt = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fieldLabel: Record<NozzleField, string> = {
  n1Open: "Nozzle 1 opening",
  n1Close: "Nozzle 1 closing",
  n2Open: "Nozzle 2 opening",
  n2Close: "Nozzle 2 closing",
};

/**
 * Button under a meter cell, driving the audited quick-fix endpoint.
 * With `from` set it's a FIX: the staff reading disagrees with CRIS and gets
 * replaced. Without it it's a FILL: the staff reading is missing and the
 * official value(s) are written into the sheet.
 */
export default function MeterQuickFix({
  entryId,
  writes,
  from,
  by,
}: {
  entryId: number;
  writes: { field: NozzleField; value: number }[];
  from?: number;
  by?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isFix = from !== undefined;

  const run = async () => {
    const lines = writes.map((w) => `${fieldLabel[w.field]} = ${fmt(w.value)}`).join("\n");
    const msg = isFix
      ? `Replace the staff reading ${fmt(from)} with the official CRIS reading ${fmt(writes[0].value)}?` +
        "\n\nThe sheet's litres and short/excess are recalculated and the change is logged."
      : `No staff reading here — write the official CRIS reading${writes.length > 1 ? "s" : ""} into ${by ?? "the staff member"}'s sheet?\n\n${lines}\n\n` +
        "The sheet's litres and short/excess are recalculated and the change is logged.";
    if (!confirm(msg)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/entries/${entryId}/fix-reading`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: writes }),
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

  const cls = isFix
    ? "border-red-300 dark:border-red-500/40 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
    : "border-amber-300 dark:border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10";

  return (
    <div className="print:hidden">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className={`mt-0.5 rounded border px-1.5 py-px text-[10px] font-medium leading-tight disabled:opacity-50 ${cls}`}
      >
        {busy ? "Saving…" : isFix ? "Fix → CRIS" : "Fill ← CRIS"}
      </button>
      {error && (
        <div className="max-w-[9rem] text-[10px] leading-tight text-red-600 dark:text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}
