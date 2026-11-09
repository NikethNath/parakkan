"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { dayLabel } from "@/lib/format";

const L = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Records fuel a repairman pumped through a dispenser while testing it, without
 * authorising the test on the automation computer — so CRIS counted it as sold.
 *
 * When CRIS is ahead of the staff and nothing is recorded yet, the gap is
 * offered as the starting figure: that is exactly the shape this mismatch
 * takes. It's still only a suggestion — the job sheet or the repairman's word
 * is the real number, and what's left over stays flagged.
 */
export default function MaintenanceTestButton({
  date,
  product,
  current,
  note,
  suggestion,
}: {
  date: string;
  product: "MS" | "HSD";
  current: number;
  note: string | null;
  suggestion: number | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [litres, setLitres] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function show() {
    setLitres(current > 0 ? String(current) : suggestion !== null ? String(suggestion) : "");
    setText(note ?? "");
    setErr(null);
    setOpen(true);
  }

  async function send(value: number) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/cris/maintenance-test", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, product, litres: value, note: text.trim() || undefined }),
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

  function save() {
    const n = Number(litres);
    if (litres.trim() === "" || !Number.isFinite(n) || n <= 0) {
      setErr("Enter the litres the repairman pumped.");
      return;
    }
    send(n);
  }

  const input = "w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm";

  return (
    <>
      <button
        type="button"
        onClick={show}
        className={
          "text-xs font-medium hover:underline " + (suggestion !== null ? "text-accent" : "text-muted")
        }
      >
        {current > 0 ? "Edit" : suggestion !== null ? "Maintenance test?" : "Add"}
      </button>
      {open && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border">
            <h2 className="text-sm font-semibold text-foreground">
              Maintenance test · {product} · {dayLabel(date)}
            </h2>
            <p className="mt-1 text-xs text-muted">
              Fuel a repairman pumped through a dispenser while testing it, without authorising
              the test on the computer. CRIS counted it as sold; it&apos;s taken off CRIS&apos;s
              figure before comparing with the staff. CRIS&apos;s own numbers aren&apos;t
              changed.
            </p>
            {suggestion !== null && current === 0 && (
              <p className="mt-2 text-xs text-accent">
                CRIS is {L(suggestion)} L ahead of the staff that day — filled in below. Check
                it against the job sheet.
              </p>
            )}
            <div className="mt-3 space-y-2">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-foreground">Litres pumped</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min={0}
                  value={litres}
                  onChange={(e) => setLitres(e.target.value)}
                  aria-label="Litres pumped"
                  className={`${input} tabular-nums`}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-foreground">
                  What happened <span className="font-normal text-muted">(optional)</span>
                </span>
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="DU 3 nozzle replaced, tested 20 L"
                  aria-label="What happened"
                  className={input}
                />
              </label>
            </div>
            {err && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{err}</p>}
            <div className="mt-4 flex gap-2">
              {current > 0 && (
                <button
                  type="button"
                  onClick={() => send(0)}
                  disabled={busy}
                  className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted hover:text-red-600 disabled:opacity-60"
                >
                  Remove
                </button>
              )}
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
