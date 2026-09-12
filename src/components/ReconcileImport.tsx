"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inr } from "@/lib/format";

interface DayRow {
  date: string;
  gpay: number;
  gpayReport: number;
  gpayStatement: number;
  pos: number;
  posReport: number;
  posStatement: number;
}
interface StatementFileRow {
  fileName: string;
  account: string | null;
  found: number;
  inserted: number;
  duplicates: number;
  needsSplit: number;
}
interface Result {
  days: DayRow[];
  fileCount: number;
  report: {
    fileCount: number;
    dayCount: number;
    countedRows: number;
    skippedRows: number;
    duplicateRows: number;
    unknownModes: string[];
    unknownModeRows: number;
    from: string | null;
    to: string | null;
    partialDay: string | null;
    replacedDays: string[];
  } | null;
  statement: {
    fileCount: number;
    files: StatementFileRow[];
    inserted: number;
    duplicates: number;
    gpay: number;
    pos: number;
    needsSplit: number;
  } | null;
}

const dayLabel = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

/** A figure and, when it came from both providers, what each one contributed. */
function Split({ total, report, statement }: { total: number; report: number; statement: number }) {
  const both = report > 0 && statement > 0;
  return (
    <>
      <span className={both ? "font-medium" : ""}>{inr(total)}</span>
      {both && (
        <span className="block text-[10px] text-faint">
          Paytm {inr(report)} + bank {inr(statement)}
        </span>
      )}
    </>
  );
}

/**
 * The single import on the reconcile page. It takes the Paytm for Business
 * transaction report, an SBI bank statement export, or both together — the
 * server reads each file to decide which it is.
 *
 * Both still matter: Paytm's report is the only thing that can split a day into
 * GPay and POS, while the old PhonePe QR is still in use and that money only
 * ever appears on the bank statement. The two add up per day.
 */
export default function ReconcileImport() {
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
      const r = await fetch("/api/reconcile/import", { method: "POST", body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(d.error ?? "Import failed");
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

  const rep = res?.report;
  const stmt = res?.statement;

  return (
    <section className="rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border print:hidden">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
        Import money received
      </h2>
      <p className="mb-3 text-xs text-muted">
        Pick the <strong>Paytm for Business transaction report</strong> (.csv), an{" "}
        <strong>SBI statement export</strong> (.xls), or both together — each file is
        recognised by what&apos;s in it, so the order and the mix don&apos;t matter. The
        report splits a day into GPay (UPI and its variants) and POS (card); the statement
        supplies PhonePe money from the old QR, which Paytm never sees. A day&apos;s GPay is{" "}
        <strong>both added together</strong>.
      </p>
      <p className="mb-3 text-xs text-muted">
        A long Paytm export arrives split into numbered parts (<code>…_001.csv</code>,{" "}
        <code>…_002.csv</code>): <strong>pick all the parts together</strong>, since a day
        straddling two of them is only right when they are added in one go. Repeated
        payments are counted once, and re-importing is safe. The Paytm file is read and
        discarded — nothing is kept but the two totals for each day.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          multiple
          accept=".csv,.xls,.txt,text/csv,text/plain"
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          className="text-sm"
        />
        <button
          onClick={upload}
          disabled={files.length === 0 || busy}
          className="rounded-lg bg-accent px-4 py-1.5 font-medium text-white hover:bg-accent-strong disabled:opacity-60"
        >
          {busy ? "Importing…" : files.length > 1 ? `Import ${files.length} files` : "Import"}
        </button>
      </div>

      {err && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{err}</p>}

      {res && (
        <div className="mt-3 space-y-1">
          {rep && (
            <p className="text-sm text-emerald-700 dark:text-emerald-300">
              Paytm report: {rep.countedRows.toLocaleString("en-IN")} payments from{" "}
              {rep.fileCount === 1 ? "1 file" : `${rep.fileCount} parts`} across {rep.dayCount}{" "}
              {plural(rep.dayCount, "day")}
              {rep.from && ` (${dayLabel(rep.from)}${rep.from === rep.to ? "" : ` – ${dayLabel(rep.to!)}`})`}
              {rep.skippedRows > 0 && `, ${rep.skippedRows} failed or cancelled ignored`}
              {rep.duplicateRows > 0 &&
                `, ${rep.duplicateRows} repeated across parts counted once`}
              .
            </p>
          )}
          {stmt && (
            <p className="text-sm text-emerald-700 dark:text-emerald-300">
              Bank statement: {stmt.inserted} new{" "}
              {plural(stmt.inserted, "credit")} ({stmt.gpay} GPay, {stmt.pos} POS/card)
              {stmt.duplicates > 0 && `, ${stmt.duplicates} already imported`} from{" "}
              {stmt.fileCount === 1 ? "1 file" : `${stmt.fileCount} files`}.
            </p>
          )}
          {stmt && stmt.files.length > 1 && (
            <ul className="space-y-0.5 text-xs text-muted">
              {stmt.files.map((f) => (
                <li key={f.fileName}>
                  {f.account ? `A/c …${f.account.slice(-4)}` : f.fileName}: {f.inserted} new
                  {f.duplicates ? `, ${f.duplicates} already imported` : ""}
                  {f.needsSplit > 0 ? `, ${f.needsSplit} combined Paytm settlements skipped` : ""}
                  {f.found === 0 && f.needsSplit === 0 ? " — nothing recognised in this file" : ""}
                </li>
              ))}
            </ul>
          )}
          {stmt && stmt.needsSplit > 0 && (
            <p className="text-xs text-muted">
              {stmt.needsSplit} Paytm settlement {plural(stmt.needsSplit, "credit")} skipped —
              Paytm pays UPI and card in as one lump, so those days come from its report
              instead.
            </p>
          )}
          {rep && rep.unknownModeRows > 0 && (
            <p className="text-sm text-amber-700 dark:text-amber-300">
              {rep.unknownModeRows} {plural(rep.unknownModeRows, "payment")} left out —
              unrecognised {plural(rep.unknownModes.length, "mode")}: {rep.unknownModes.join(", ")}.
              Those days are short by that amount.
            </p>
          )}
          {rep && rep.replacedDays.length > 0 && (
            <p className="text-xs text-muted">
              Replaced figures from an earlier report import for {rep.replacedDays.length}{" "}
              {plural(rep.replacedDays.length, "day")} (
              {rep.replacedDays.slice(0, 4).map(dayLabel).join(", ")}
              {rep.replacedDays.length > 4 ? ", …" : ""}). If a day spans two parts of a split
              export, import those parts together rather than one after the other.
            </p>
          )}
          {rep?.partialDay && (
            <p className="text-sm text-amber-700 dark:text-amber-300">
              {dayLabel(rep.partialDay)} is today, so the report only covers part of it —
              re-import tomorrow for the full day.
            </p>
          )}

          <div className="max-h-72 overflow-auto pt-1">
            <table className="w-full text-xs">
              <caption className="pb-1 text-left text-[11px] text-faint">
                What now stands for each day these files touched, every provider added up.
              </caption>
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
                  <tr key={d.date} className="border-t border-border align-top">
                    <td className="px-2 py-1">{dayLabel(d.date)}</td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      <Split total={d.gpay} report={d.gpayReport} statement={d.gpayStatement} />
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      <Split total={d.pos} report={d.posReport} statement={d.posStatement} />
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
