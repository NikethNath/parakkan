"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inr } from "@/lib/format";

interface DayTotals {
  date: string;
  gpay: number;
  pos: number;
  gpayCount: number;
  posCount: number;
}
interface Result {
  days: DayTotals[];
  fileCount: number;
  countedRows: number;
  skippedRows: number;
  duplicateRows: number;
  unknownModes: string[];
  unknownModeRows: number;
  partialDay: string | null;
  replacedDays: string[];
  from: string;
  to: string;
}

const dayLabel = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });

/** Imports the Paytm for Business transaction report and fills in the GPay/POS
 *  figures for every day it covers. */
export default function PaytmReportUpload() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload() {
    if (files.length === 0) return;
    setBusy(true);
    setRes(null);
    setErr(null);
    try {
      const fd = new FormData();
      for (const f of files) fd.append("file", f);
      const r = await fetch("/api/reconcile/paytm-report", { method: "POST", body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(d.error ?? "Upload failed");
        return;
      }
      setRes(d);
      setFiles([]);
      router.refresh();
    } catch {
      setErr("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border print:hidden">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
        Import Paytm report
      </h2>
      <p className="mb-3 text-xs text-muted">
        The transaction report (.csv) from Paytm for Business — daily, weekly or
        monthly. UPI and its variants count as GPay, card as POS, totalled per day. A
        long export arrives split into numbered parts (<code>…_001.csv</code>,
        <code>…_002.csv</code>): <strong>pick all the parts together</strong>, since a
        day straddling two of them is only right when they are added up in one go.
        Repeated payments are counted once. The files are read and discarded — nothing
        is kept but the two totals for each day. Those totals <strong>add to</strong>
        money that came through another provider on the same day (a PhonePe credit on
        the changeover day still counts), and replace whatever an earlier import of this
        same report recorded.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          multiple
          accept=".csv,text/csv"
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          className="text-sm"
        />
        <button
          onClick={upload}
          disabled={files.length === 0 || busy}
          className="rounded-lg bg-accent px-4 py-1.5 font-medium text-white hover:bg-accent-strong disabled:opacity-60"
        >
          {busy ? "Importing…" : files.length > 1 ? `Import ${files.length} parts` : "Import"}
        </button>
      </div>

      {err && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{err}</p>}

      {res && (
        <div className="mt-3">
          <p className="text-sm text-emerald-700 dark:text-emerald-300">
            Imported {res.countedRows.toLocaleString("en-IN")} payments from{" "}
            {res.fileCount === 1 ? "1 file" : `${res.fileCount} parts`} across{" "}
            {res.days.length} day{res.days.length === 1 ? "" : "s"} ({dayLabel(res.from)}
            {res.from === res.to ? "" : ` – ${dayLabel(res.to)}`})
            {res.skippedRows > 0 && `, ${res.skippedRows} failed or cancelled ignored`}
            {res.duplicateRows > 0 && `, ${res.duplicateRows} repeated across parts counted once`}.
          </p>
          {res.unknownModeRows > 0 && (
            <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
              {res.unknownModeRows} payment{res.unknownModeRows === 1 ? "" : "s"} left out —
              unrecognised mode{res.unknownModes.length === 1 ? "" : "s"}:{" "}
              {res.unknownModes.join(", ")}. Those days are short by that amount.
            </p>
          )}
          {res.replacedDays.length > 0 && (
            <p className="mt-1 text-xs text-muted">
              Replaced figures from an earlier report import for {res.replacedDays.length} day
              {res.replacedDays.length === 1 ? "" : "s"} (
              {res.replacedDays.slice(0, 4).map(dayLabel).join(", ")}
              {res.replacedDays.length > 4 ? ", …" : ""}). If a day spans two parts of a
              split export, import those parts together rather than one after the other.
            </p>
          )}
          {res.partialDay && (
            <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
              {dayLabel(res.partialDay)} is today, so the report only covers part of it —
              re-import tomorrow for the full day.
            </p>
          )}
          <div className="mt-2 max-h-72 overflow-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-muted">
                <tr>
                  <th className="px-2 py-1 font-medium">Day</th>
                  <th className="px-2 py-1 text-right font-medium">GPay</th>
                  <th className="px-2 py-1 text-right font-medium">POS</th>
                  <th className="px-2 py-1 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {res.days.map((d) => (
                  <tr key={d.date} className="border-t border-border">
                    <td className="px-2 py-1">{dayLabel(d.date)}</td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {inr(d.gpay)} <span className="text-faint">({d.gpayCount})</span>
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {inr(d.pos)} <span className="text-faint">({d.posCount})</span>
                    </td>
                    <td className="px-2 py-1 text-right font-medium tabular-nums">
                      {inr(d.gpay + d.pos)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
