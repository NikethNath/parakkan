"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inr } from "@/lib/format";

export type Payment = { id: number; amount: number; note: string | null };

/**
 * Per-employee, per-month salary payments: shows what's been recorded (with a
 * remove ×) and a "+ Record" form to add a payment or an advance handed over
 * directly (i.e. not drawn from a daily sheet's expense column).
 */
export default function SalaryPaymentCell({
  employeeId,
  month,
  payments,
  suggested,
}: {
  employeeId: number;
  month: string;
  payments: Payment[];
  suggested: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(suggested > 0 ? String(suggested) : "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function record() {
    const amt = Number(amount);
    if (!(amt > 0)) {
      setErr("Enter an amount");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/salary-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, month, amount: amt, note }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(d.error ?? "Could not record");
        return;
      }
      setOpen(false);
      setNote("");
      router.refresh();
    } catch {
      setErr("Network error");
    } finally {
      setBusy(false);
    }
  }

  async function del(id: number) {
    const res = await fetch(`/api/salary-payments/${id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
  }

  return (
    <div className="space-y-1">
      {payments.map((p) => (
        <div key={p.id} className="flex items-center justify-end gap-1 text-xs text-muted">
          <span className="tabular-nums">{inr(p.amount)}</span>
          {p.note && <span className="text-faint">· {p.note}</span>}
          <button
            onClick={() => del(p.id)}
            title="Remove"
            className="text-red-500 hover:underline print:hidden"
          >
            ×
          </button>
        </div>
      ))}

      {open ? (
        <div className="flex flex-col items-end gap-1 print:hidden">
          <input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="₹ amount"
            className="w-28 rounded border border-border px-2 py-1 text-right text-sm"
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="note (optional)"
            className="w-36 rounded border border-border px-2 py-1 text-xs"
          />
          {err && <span className="text-xs text-red-500">{err}</span>}
          <div className="flex gap-1">
            <button
              onClick={record}
              disabled={busy}
              className="rounded bg-accent px-2 py-1 text-xs font-medium text-white disabled:opacity-60"
            >
              {busy ? "…" : "Save"}
            </button>
            <button
              onClick={() => {
                setOpen(false);
                setErr(null);
              }}
              className="rounded border border-border px-2 py-1 text-xs text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => {
            setOpen(true);
            setAmount(suggested > 0 ? String(suggested) : "");
          }}
          className="text-xs font-medium text-accent hover:underline print:hidden"
        >
          + Record
        </button>
      )}
    </div>
  );
}
