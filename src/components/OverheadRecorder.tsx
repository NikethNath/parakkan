"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inr, dayLabel } from "@/lib/format";

export type OverheadRow = {
  id: number;
  date: string;
  category: string;
  note: string | null;
  amount: number;
  recordedBy: string | null;
};
export type CategoryOption = { id: number; name: string };

/**
 * Admin form for the outlet's own running costs — electricity, taxes, a licence
 * fee — plus the list for the period on show.
 *
 * These are recorded here rather than on a shift sheet precisely because they
 * never passed through the till: nothing about them moves a staff member's
 * short or excess. They can be entered whenever the bill arrives, and dated to
 * the day the cost belongs to (month-end for a monthly charge).
 */
export default function OverheadRecorder({
  categories,
  items,
  from,
  to,
  today,
}: {
  categories: CategoryOption[];
  items: OverheadRow[];
  from: string;
  to: string;
  today: string;
}) {
  const router = useRouter();
  const [categoryId, setCategoryId] = useState<string>(String(categories[0]?.id ?? ""));
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const total = items.reduce((s, i) => s + i.amount, 0);
  const value = Number(amount);
  const canAdd = Boolean(categoryId) && date !== "" && Number.isFinite(value) && value > 0;

  async function add() {
    if (!canAdd) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/outlet-expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: Number(categoryId),
          billDate: date,
          amount: value,
          note: note.trim() || undefined,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(d.error ?? "Could not record this cost");
        return;
      }
      setAmount("");
      setNote("");
      router.refresh();
    } catch {
      setErr("Network error");
    } finally {
      setBusy(false);
    }
  }

  async function remove(row: OverheadRow) {
    const label = `${row.category} ${inr(row.amount)} on ${dayLabel(row.date)}`;
    if (!confirm(`Remove ${label}?`)) return;
    const res = await fetch(`/api/outlet-expenses/${row.id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
    else setErr("Could not delete this cost");
  }

  return (
    <section className="rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
        Outlet overheads
      </h2>
      <p className="mb-3 mt-1 text-xs text-muted">
        The outlet&apos;s own running costs — electricity, taxes, licence fees, repairs.
        Add them whenever the bill arrives, dated to the day the cost belongs to. This
        money never passed through a shift&apos;s till, so it changes nobody&apos;s short
        or excess; it appears on your Summary tab and on the accountant&apos;s.
      </p>

      {categories.length === 0 ? (
        <p className="text-sm text-amber-700 dark:text-amber-300">
          Add a category below first — every cost is filed under one.
        </p>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-foreground">Category</span>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="rounded-lg border border-border px-3 py-1.5 text-sm"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-foreground">Date</span>
            <input
              type="date"
              value={date}
              max={today}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-lg border border-border px-3 py-1.5 text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-foreground">Amount ₹</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              className="w-28 rounded-lg border border-border px-3 py-1.5 text-sm tabular-nums"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-foreground">Note (optional)</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="KSEB bill for September…"
              className="w-56 rounded-lg border border-border px-3 py-1.5 text-sm"
            />
          </label>
          <button
            onClick={add}
            disabled={busy || !canAdd}
            className="rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-60"
          >
            {busy ? "Saving…" : "Add"}
          </button>
        </div>
      )}
      {err && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{err}</p>}

      <div className="mt-4">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-faint">
            {dayLabel(from)} – {dayLabel(to)}
          </h3>
          <p className="text-xs text-muted">
            {items.length} {items.length === 1 ? "cost" : "costs"} · {inr(total)} total
          </p>
        </div>
        {items.length === 0 ? (
          <p className="py-4 text-center text-sm text-faint">
            Nothing recorded for these dates.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted">
                <tr>
                  <th className="px-2 py-1.5 font-medium">Date</th>
                  <th className="px-2 py-1.5 font-medium">Category</th>
                  <th className="px-2 py-1.5 font-medium">Note</th>
                  <th className="px-2 py-1.5 text-right font-medium">Amount</th>
                  <th className="px-2 py-1.5"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id} className="border-t border-border">
                    <td className="whitespace-nowrap px-2 py-1.5 text-muted">{dayLabel(i.date)}</td>
                    <td className="px-2 py-1.5 font-medium text-foreground">{i.category}</td>
                    <td className="px-2 py-1.5 text-muted">
                      {i.note || "—"}
                      {i.recordedBy && (
                        <span className="ml-2 text-xs text-faint">· {i.recordedBy}</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{inr(i.amount)}</td>
                    <td className="px-2 py-1.5 text-right">
                      <button
                        onClick={() => remove(i)}
                        className="text-xs font-medium text-muted hover:text-red-600 hover:underline dark:hover:text-red-400"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border font-semibold">
                  <td className="px-2 py-2" colSpan={3}>
                    Total
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{inr(total)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
