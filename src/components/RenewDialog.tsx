"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { nextDue, periodLabel, type DocumentView } from "@/lib/documents";
import { dayLabel } from "@/lib/format";

/**
 * Records a renewal. For a document that renews every N months only the day it
 * was done is needed — the next due date follows. For one with a set date, the
 * new date comes off the new certificate.
 */
export default function RenewDialog({
  doc,
  today,
  onClose,
}: {
  doc: DocumentView;
  today: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const byFrequency = Boolean(doc.renewEveryMonths);
  const [renewedOn, setRenewedOn] = useState(today);
  const [nextDueOn, setNextDueOn] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const preview = byFrequency
    ? nextDue({ renewEveryMonths: doc.renewEveryMonths, lastRenewedOn: renewedOn || null })
    : nextDueOn || null;

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/documents/${doc.id}/renew`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ renewedOn, ...(byFrequency ? {} : { nextDueOn }) }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(d.error ?? "Could not save");
        setBusy(false);
        return;
      }
      router.refresh();
      onClose();
    } catch {
      setErr("Network error");
      setBusy(false);
    }
  }

  const input = "w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm";

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border">
        <h2 className="text-sm font-semibold text-foreground">Renewed · {doc.title}</h2>
        <p className="mt-1 text-xs text-muted">
          {byFrequency
            ? `${periodLabel(doc.renewEveryMonths!)} — the next due date follows from the day it was renewed.`
            : "Enter the new renewal date from the new document."}
        </p>
        <div className="mt-3 space-y-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-foreground">Renewed on</span>
            <input
              type="date"
              value={renewedOn}
              max={today}
              onChange={(e) => setRenewedOn(e.target.value)}
              aria-label="Renewed on"
              className={input}
            />
          </label>
          {!byFrequency && (
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-foreground">New renewal date</span>
              <input
                type="date"
                value={nextDueOn}
                min={doc.renewalDueOn ?? undefined}
                onChange={(e) => setNextDueOn(e.target.value)}
                aria-label="New renewal date"
                className={input}
              />
            </label>
          )}
          {preview && (
            <p className="text-xs text-muted">
              Next due <strong className="text-foreground">{dayLabel(preview)}</strong>
            </p>
          )}
        </div>
        {err && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{err}</p>}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex-1 rounded-lg border border-border px-4 py-2 font-medium text-foreground hover:bg-surface-2 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy || !renewedOn || (!byFrequency && !nextDueOn)}
            className="flex-1 rounded-lg bg-accent px-4 py-2 font-semibold text-white hover:bg-accent-strong disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
