"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { istToday } from "@/lib/format";

export interface DispenserView {
  id: number;
  name: string;
  posId: string;
  nozzles: { product: "MS" | "HSD"; reading: number; readOn: string }[];
}

/** A closing reading off a recent sheet, offered when binding a nozzle. */
export interface RecentReading {
  product: "MS" | "HSD";
  reading: number;
  readOn: string;
  shift: "MORNING" | "EVENING";
  by: string;
}

type NozzleForm = { product: "MS" | "HSD"; reading: string; readOn: string };

const fmtReading = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" });

/**
 * Tell the app which DU is which: the Paytm QR at each one, and a meter reading
 * for each of its two nozzles. From that reading each nozzle is followed
 * through the sheets day by day, which is how a sheet is known to be DU2's.
 */
export default function DispenserSetup({
  dispensers,
  recent,
  qrSeen,
}: {
  dispensers: DispenserView[];
  recent: RecentReading[];
  qrSeen: string[];
}) {
  const router = useRouter();
  const blankNozzle = (): NozzleForm => ({ product: "MS", reading: "", readOn: istToday() });
  const [editId, setEditId] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [posId, setPosId] = useState("");
  const [nozzles, setNozzles] = useState<NozzleForm[]>([blankNozzle(), blankNozzle()]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const setUp = new Set(dispensers.map((d) => d.posId));
  const missing = qrSeen.filter((q) => !setUp.has(q));

  function start(d?: DispenserView, suggestedName?: string) {
    setEditId(d?.id ?? null);
    setName(d?.name ?? suggestedName ?? "");
    setPosId(d && d.posId !== d.name ? d.posId : "");
    const ns = (d?.nozzles ?? []).map((n) => ({ product: n.product, reading: String(n.reading), readOn: n.readOn }));
    while (ns.length < 2) ns.push(blankNozzle());
    setNozzles(ns);
    setErr(null);
    setOpen(true);
  }

  const setNozzle = (i: number, patch: Partial<NozzleForm>) =>
    setNozzles((ns) => ns.map((n, j) => (j === i ? { ...n, ...patch } : n)));

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(editId ? `/api/dispensers/${editId}` : "/api/dispensers", {
        method: editId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          posId: posId.trim() || undefined,
          // A nozzle left without a reading isn't bound.
          nozzles: nozzles
            .filter((n) => n.reading.trim() !== "")
            .map((n) => ({ product: n.product, reading: Number(n.reading), readOn: n.readOn })),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(d.error ?? "Could not save");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setErr("Network error");
    } finally {
      setBusy(false);
    }
  }

  async function remove(d: DispenserView) {
    if (!confirm(`Remove ${d.name}? Its GPay won't be checked any more.`)) return;
    const res = await fetch(`/api/dispensers/${d.id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
    else setErr("Could not remove that DU.");
  }

  const input = "w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm";

  return (
    <section className="rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">DU setup</h2>
        <button
          type="button"
          onClick={() => start()}
          className="rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-white hover:bg-accent-strong"
        >
          Add DU
        </button>
      </div>
      <p className="mt-1 text-xs text-muted">
        Give each DU its Paytm QR and a meter reading for each of its two nozzles — any day&apos;s
        reading will do. The app follows each nozzle through the sheets from there. If a DU stops
        finding its staff (after a meter is replaced, say), edit it with a fresh reading.
      </p>

      {missing.length > 0 && (
        <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
          Paytm QR codes not set up yet:{" "}
          {missing.map((q, i) => (
            <span key={q}>
              {i > 0 && ", "}
              <button type="button" onClick={() => start(undefined, q)} className="font-semibold underline">
                {q}
              </button>
            </span>
          ))}
        </p>
      )}
      {err && !open && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{err}</p>}

      {dispensers.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm" data-testid="du-setup">
            <thead className="text-left text-muted">
              <tr>
                <th className="px-2 py-1.5 font-medium">DU</th>
                <th className="px-2 py-1.5 font-medium">Paytm QR</th>
                <th className="px-2 py-1.5 font-medium">Nozzles bound by</th>
                <th className="px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {dispensers.map((d) => (
                <tr key={d.id} className="border-t border-border">
                  <td className="px-2 py-1.5 font-semibold text-foreground">{d.name}</td>
                  <td className="px-2 py-1.5 text-muted">{d.posId}</td>
                  <td className="px-2 py-1.5">
                    {d.nozzles.map((n, i) => (
                      <div key={i} className="whitespace-nowrap">
                        {n.product} <span className="tabular-nums">{fmtReading(n.reading)}</span>{" "}
                        <span className="text-xs text-muted">on {day(n.readOn)}</span>
                      </div>
                    ))}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right text-xs">
                    <button type="button" onClick={() => start(d)} className="mr-3 font-medium text-muted hover:underline">
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(d)}
                      className="font-medium text-muted hover:text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-full w-full max-w-md overflow-auto rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border">
            <h3 className="text-sm font-semibold text-foreground">{editId ? `Edit ${name}` : "Add a DU"}</h3>
            <div className="mt-3 space-y-3">
              <div className="flex gap-2">
                <label className="block flex-1 text-sm">
                  <span className="mb-1 block font-medium text-foreground">Name</span>
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="DU1" className={input} />
                </label>
                <label className="block flex-1 text-sm">
                  <span className="mb-1 block font-medium text-foreground">
                    Paytm QR <span className="font-normal text-muted">(if different)</span>
                  </span>
                  <input
                    value={posId}
                    onChange={(e) => setPosId(e.target.value)}
                    placeholder={name || "DU1"}
                    className={input}
                  />
                </label>
              </div>
              {nozzles.map((n, i) => (
                <fieldset key={i} className="rounded-lg border border-border p-3">
                  <legend className="px-1 text-sm font-medium text-foreground">Nozzle {i + 1}</legend>
                  {recent.length > 0 && (
                    <select
                      value=""
                      onChange={(e) => {
                        const r = recent[Number(e.target.value)];
                        if (r) setNozzle(i, { product: r.product, reading: String(r.reading), readOn: r.readOn });
                      }}
                      aria-label={`Nozzle ${i + 1} from a recent sheet`}
                      className={`${input} mb-2 text-muted`}
                    >
                      <option value="">Pick a reading from a recent sheet…</option>
                      {recent.map((r, j) => (
                        <option key={j} value={j}>
                          {r.product} {fmtReading(r.reading)} — {r.by}, {day(r.readOn)} {r.shift.toLowerCase()}
                        </option>
                      ))}
                    </select>
                  )}
                  <div className="flex gap-2">
                    <select
                      value={n.product}
                      onChange={(e) => setNozzle(i, { product: e.target.value as "MS" | "HSD" })}
                      aria-label={`Nozzle ${i + 1} product`}
                      className={`${input} w-24`}
                    >
                      <option value="MS">MS</option>
                      <option value="HSD">HSD</option>
                    </select>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      value={n.reading}
                      onChange={(e) => setNozzle(i, { reading: e.target.value })}
                      placeholder="Meter reading"
                      aria-label={`Nozzle ${i + 1} reading`}
                      className={`${input} tabular-nums`}
                    />
                    <input
                      type="date"
                      value={n.readOn}
                      max={istToday()}
                      onChange={(e) => setNozzle(i, { readOn: e.target.value })}
                      aria-label={`Nozzle ${i + 1} reading date`}
                      className={`${input} w-40`}
                    />
                  </div>
                </fieldset>
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
                disabled={busy || !name.trim()}
                className="flex-1 rounded-lg bg-accent px-4 py-2 font-semibold text-white hover:bg-accent-strong disabled:opacity-60"
              >
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
