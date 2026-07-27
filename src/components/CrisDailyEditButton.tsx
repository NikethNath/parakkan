"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Values = {
  openingStock: number | null;
  receiptQty: number | null;
  closingStock: number | null;
  officialSaleLitres: number;
  testLitres: number;
};

const FIELDS: { key: keyof Values; label: string }[] = [
  { key: "openingStock", label: "Opening stock (L)" },
  { key: "receiptQty", label: "Receipt (L)" },
  { key: "closingStock", label: "Closing stock (L)" },
  { key: "officialSaleLitres", label: "Net sales by meter (L)" },
  { key: "testLitres", label: "Pump test (L)" },
];

/** Per-row editor for the DSR Daily sales register: patches one cached CRIS
 *  day (admin-only endpoint). A later CRIS re-fetch of the same day overwrites
 *  manual values, so this is for correcting history, not routine entry. */
export default function CrisDailyEditButton({
  id,
  label,
  values,
}: {
  id: number;
  label: string; // e.g. "05 Jul · HSD"
  values: Values;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function show() {
    setForm(
      Object.fromEntries(
        FIELDS.map((f) => [f.key, values[f.key] === null ? "" : String(values[f.key])]),
      ),
    );
    setErr(null);
    setOpen(true);
  }

  async function save() {
    setBusy(true);
    setErr(null);
    const body: Record<string, number | null> = {};
    for (const f of FIELDS) {
      const raw = form[f.key].trim();
      if (raw === "") {
        // Blank clears a stock figure; the meter figures can't be blank.
        if (f.key === "officialSaleLitres" || f.key === "testLitres") {
          setErr(`${f.label} can't be empty.`);
          setBusy(false);
          return;
        }
        body[f.key] = null;
        continue;
      }
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        setErr(`${f.label}: enter a number ≥ 0.`);
        setBusy(false);
        return;
      }
      body[f.key] = n;
    }
    try {
      const res = await fetch(`/api/cris/daily/${id}`, {
        method: "PATCH",
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

  return (
    <>
      <button
        type="button"
        onClick={show}
        className="font-medium text-accent hover:underline"
      >
        Edit
      </button>
      {open && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border">
            <h2 className="text-sm font-semibold text-foreground">Edit CRIS day · {label}</h2>
            <p className="mt-1 text-xs text-muted">
              Corrects the cached CRIS figures for this day. A later CRIS re-fetch of the
              same day overwrites manual values.
            </p>
            <div className="mt-3 space-y-2">
              {FIELDS.map((f) => (
                <label key={f.key} className="block text-sm">
                  <span className="mb-0.5 block font-medium text-foreground">{f.label}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min={0}
                    value={form[f.key] ?? ""}
                    onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                    className="w-full rounded-lg border border-border px-3 py-1.5"
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
          </div>
        </div>
      )}
    </>
  );
}
