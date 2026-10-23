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
 * Button driving the audited quick-fix endpoint, used wherever a meter reading
 * needs replacing in one click.
 *
 * On the nozzle ledger it speaks about CRIS: with `from` set it's a FIX (the
 * staff reading disagrees with the official totalizer and gets replaced),
 * without it a FILL (the reading is missing and the official value is written
 * in). The midday handover has no official arbiter — there, `label` and
 * `message` supply the wording and CRIS is never mentioned.
 */
export default function MeterQuickFix({
  entryId,
  writes,
  from,
  by,
  label,
  message,
  tone = "fix",
  disabledReason,
}: {
  entryId: number;
  writes: { field: NozzleField; value: number }[];
  from?: number;
  by?: string;
  /** Overrides the CRIS wording on the button. */
  label?: string;
  /** Overrides the confirmation text. */
  message?: string;
  tone?: "fix" | "fill" | "recommended";
  /** When set, the button is shown disabled with this as its explanation. */
  disabledReason?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isFix = from !== undefined;

  const run = async () => {
    const lines = writes.map((w) => `${fieldLabel[w.field]} = ${fmt(w.value)}`).join("\n");
    const msg = message
      ? `${message}\n\n${lines}\n\nThe sheet's litres and short/excess are recalculated and the change is logged.`
      : isFix
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

  const toneCls = {
    fix: "border-red-300 dark:border-red-500/40 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10",
    fill: "border-amber-300 dark:border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10",
    recommended:
      "border-accent bg-accent/10 text-accent hover:bg-accent/20 font-semibold",
  } as const;
  const cls = label ? toneCls[tone] : isFix ? toneCls.fix : toneCls.fill;

  if (disabledReason) {
    return (
      <div className="print:hidden">
        <button
          type="button"
          disabled
          title={disabledReason}
          className="mt-0.5 cursor-not-allowed rounded border border-border px-1.5 py-px text-[10px] font-medium leading-tight text-faint"
        >
          {label ?? "Fix"}
        </button>
        <div className="max-w-[14rem] text-[10px] leading-tight text-faint">{disabledReason}</div>
      </div>
    );
  }

  return (
    <div className="print:hidden">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className={`mt-0.5 rounded border px-1.5 py-px text-[10px] font-medium leading-tight disabled:opacity-50 ${cls}`}
      >
        {busy ? "Saving…" : (label ?? (isFix ? "Fix → CRIS" : "Fill ← CRIS"))}
      </button>
      {error && (
        <div className="max-w-[9rem] text-[10px] leading-tight text-red-600 dark:text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}
