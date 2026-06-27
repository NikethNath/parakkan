"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Admin-only: permanently delete a submission (e.g. a staff test entry). */
export default function DeleteEntryButton({
  entryId,
  label,
}: {
  entryId: number;
  label: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function del() {
    const ok = window.confirm(
      `Delete this submission?\n\n${label}\n\n` +
        "This permanently removes the sheet, its oil/expense/credit lines, edit " +
        "history, and the auto-marked attendance for that shift. This cannot be undone.",
    );
    if (!ok) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/entries/${entryId}`, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(d.error ?? "Could not delete");
        setBusy(false);
        return;
      }
      router.replace("/admin");
      router.refresh();
    } catch {
      setErr("Network error");
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 p-4">
      <h2 className="text-sm font-semibold text-red-800 dark:text-red-300">
        Delete submission
      </h2>
      <p className="mt-1 text-xs text-red-700 dark:text-red-400">
        Use this to remove a bogus sheet (e.g. a staff test run). Permanent — it also
        clears the auto-marked attendance for that shift.
      </p>
      {err && <p className="mt-2 text-sm text-red-700 dark:text-red-300">{err}</p>}
      <button
        onClick={del}
        disabled={busy}
        className="mt-3 rounded-lg bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700 disabled:opacity-60"
      >
        {busy ? "Deleting…" : "Delete this submission"}
      </button>
    </div>
  );
}
