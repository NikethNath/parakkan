"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inr } from "@/lib/format";

/** Types in one day's GPay and POS totals from the Paytm Business app. Paytm
 *  settles both as a single bank credit with no split in it, so for those days
 *  this is the only place the figures can come from. */
export default function ReconcileDayEditButton({
  date,
  label,
  gpay,
  pos,
  entered,
}: {
  date: string; // YYYY-MM-DD
  label: string; // e.g. "25 Aug"
  gpay: number | null;
  pos: number | null;
  /** What staff put on their sheets that day — shown as a sanity check. */
  entered: { gpay: number; pos: number };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ gpay: "", pos: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function show() {
    setForm({
      gpay: gpay === null ? "" : String(gpay),
      pos: pos === null ? "" : String(pos),
    });
    setErr(null);
    setOpen(true);
  }

  async function save() {
    setBusy(true);
    setErr(null);
    const body: Record<string, string | number> = { businessDate: date };
    for (const k of ["gpay", "pos"] as const) {
      const n = Number(form[k].trim());
      if (form[k].trim() === "" || !Number.isFinite(n) || n < 0) {
        setErr(`${k === "gpay" ? "GPay" : "POS"}: enter an amount ≥ 0.`);
        setBusy(false);
        return;
      }
      body[k] = n;
    }
    try {
      const res = await fetch("/api/reconcile/daily", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(d.error ?? "Could not save");
        setBusy(false);
        return;
      }
      setOpen(false);
      setBusy(false);
      router.refresh();
    } catch {
      setErr("Network error");
      setBusy(false);
    }
  }

  const total = ["gpay", "pos"].reduce((s, k) => {
    const n = Number(form[k as "gpay" | "pos"]);
    return s + (Number.isFinite(n) ? n : 0);
  }, 0);

  return (
    <>
      <button type="button" onClick={show} className="font-medium text-accent hover:underline">
        {gpay === null && pos === null ? "Enter" : "Edit"}
      </button>
      {open && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border">
            <h2 className="text-sm font-semibold text-foreground">Collections received · {label}</h2>
            <p className="mt-1 text-xs text-muted">
              From the Paytm Business app. Paytm pays UPI and card into the bank as one
              credit, so the split can only come from there. Saving replaces the figures
              already typed for this day.
            </p>
            <div className="mt-3 space-y-2">
              {(
                [
                  ["gpay", "GPay / UPI (₹)", entered.gpay],
                  ["pos", "POS / card (₹)", entered.pos],
                ] as const
              ).map(([k, lbl, staff]) => (
                <label key={k} className="block text-sm">
                  <span className="mb-0.5 block font-medium text-foreground">{lbl}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min={0}
                    value={form[k]}
                    onChange={(e) => setForm((s) => ({ ...s, [k]: e.target.value }))}
                    className="w-full rounded-lg border border-border px-3 py-1.5"
                  />
                  <span className="mt-0.5 block text-xs text-faint">
                    Staff entered {inr(staff)}
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">
              Total {inr(total)} — should match the settlement Paytm sent to the bank.
            </p>
            {err && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{err}</p>}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={busy}
                className="flex-1 rounded-lg border border-border px-4 py-2 font-medium text-foreground hover:bg-surface-2 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={busy}
                className="flex-1 rounded-lg bg-accent px-4 py-2 font-semibold text-white hover:bg-accent-strong disabled:opacity-60"
              >
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
