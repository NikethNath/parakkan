"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DaySheet } from "@/lib/summary";

const L = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const shiftLabel = { MORNING: "Morning", EVENING: "Evening" } as const;

/**
 * Corrects a day's pump-test litres from the Summary tab.
 *
 * Test litres are recorded per sheet, not per day, so the dialog lists the
 * day's sheets rather than offering one figure to split: a wrong test figure
 * belongs to one shift's till and only that sheet should move. Each changed
 * sheet is sent on its own, recomputed and logged — the fuel poured into the
 * measure and back is dispensed but not sold, so the figure drives that
 * sheet's saleable litres, fuel value and short/excess.
 */
export default function TestLitresEditButton({
  date,
  label,
  sheets,
}: {
  date: string;
  label: string; // e.g. "05 Jul 2026"
  sheets: DaySheet[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function show() {
    setForm(Object.fromEntries(sheets.map((s) => [s.id, String(s.testLitres)])));
    setErr(null);
    setOpen(true);
  }

  async function save() {
    setBusy(true);
    setErr(null);

    const changed: { sheet: DaySheet; value: number }[] = [];
    for (const s of sheets) {
      const raw = (form[s.id] ?? "").trim();
      if (raw === "") {
        setErr(`${shiftLabel[s.shift]} ${s.product}: enter 0 rather than leaving it blank.`);
        setBusy(false);
        return;
      }
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        setErr(`${shiftLabel[s.shift]} ${s.product}: enter a number of litres, zero or more.`);
        setBusy(false);
        return;
      }
      // The server enforces this too; saying it here avoids a pointless round
      // trip and names the sheet that is over its limit.
      if (n > s.grossLitres) {
        setErr(
          `${shiftLabel[s.shift]} ${s.product}: that sheet only dispensed ${L(s.grossLitres)} L, so the test can't be ${L(n)} L.`,
        );
        setBusy(false);
        return;
      }
      if (n !== s.testLitres) changed.push({ sheet: s, value: n });
    }

    if (changed.length === 0) {
      setOpen(false);
      setBusy(false);
      return;
    }

    try {
      for (const { sheet, value } of changed) {
        const res = await fetch(`/api/entries/${sheet.id}/test-litres`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ testLitres: value }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) {
          // Stop at the first failure; earlier sheets are already saved, so say
          // so rather than implying nothing happened.
          setErr(
            `${shiftLabel[sheet.shift]} ${sheet.product}: ${d.error ?? "could not save"}.` +
              (changed[0].sheet.id === sheet.id ? "" : " Earlier sheets were saved."),
          );
          setBusy(false);
          router.refresh();
          return;
        }
      }
      setOpen(false);
      setBusy(false);
      router.refresh();
    } catch {
      setErr("Network error");
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={show}
        disabled={sheets.length === 0}
        className="font-medium text-accent hover:underline disabled:text-faint disabled:no-underline"
      >
        Edit
      </button>
      {open && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-full w-full max-w-md overflow-auto rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border">
            <h2 className="text-sm font-semibold text-foreground">Pump test litres · {label}</h2>
            <p className="mt-1 text-xs text-muted">
              Fuel pumped into the measure and poured back — dispensed, but not sold. Each
              sheet&apos;s saleable litres, fuel value and short/excess are recalculated and
              the change is logged.
            </p>
            <div className="mt-3 space-y-2">
              {sheets.map((s) => (
                <label key={s.id} className="flex items-center justify-between gap-3 text-sm">
                  <span>
                    <span className="font-medium text-foreground">
                      {shiftLabel[s.shift]} · {s.product}
                    </span>
                    <span className="block text-xs text-muted">
                      {s.by} · dispensed {L(s.grossLitres)} L
                    </span>
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min={0}
                    max={s.grossLitres}
                    value={form[s.id] ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, [s.id]: e.target.value }))}
                    className="w-28 rounded-lg border border-border px-3 py-1.5 text-right tabular-nums"
                  />
                </label>
              ))}
            </div>
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
            <p className="mt-2 text-[10px] leading-tight text-faint">
              Sheet {date} · {sheets.length} {sheets.length === 1 ? "sheet" : "sheets"}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
