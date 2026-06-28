"use client";

import { useState } from "react";
import { inr } from "@/lib/format";

type Row = { date: string; bank: number; entered: number };
const TOL = 6; // ₹ — only flag GPay/POS days off by more than this

export default function BankReconcile({ gpay, pos }: { gpay: Row[]; pos: Row[] }) {
  const [channel, setChannel] = useState<"GPAY" | "POS">("GPAY");
  const rows = channel === "GPAY" ? gpay : pos;
  const hasAny = rows.some((r) => r.bank !== 0 || r.entered !== 0);

  return (
    <div>
      <label className="mb-3 inline-flex items-center gap-2 text-sm">
        <span className="font-medium text-foreground">Channel</span>
        <select
          value={channel}
          onChange={(e) => setChannel(e.target.value as "GPAY" | "POS")}
          className="rounded-lg border border-border px-3 py-1.5"
        >
          <option value="GPAY">GPay / UPI</option>
          <option value="POS">POS / card</option>
        </select>
      </label>

      {!hasAny ? (
        <p className="py-6 text-center text-sm text-faint">Nothing to reconcile yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted">
              <tr>
                <th className="px-3 py-1.5 font-medium">Date</th>
                <th className="px-3 py-1.5 text-right font-medium">Bank</th>
                <th className="px-3 py-1.5 text-right font-medium">Entered by staff</th>
                <th className="px-3 py-1.5 text-right font-medium">Δ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const d = Math.round((r.entered - r.bank) * 100) / 100;
                const off = Math.abs(d) > TOL;
                return (
                  <tr key={r.date} className={"border-t border-border " + (off ? "bg-red-50 dark:bg-red-500/10" : "")}>
                    <td className="px-3 py-1.5">
                      {new Date(`${r.date}T00:00:00Z`).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        timeZone: "UTC",
                      })}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted">{inr(r.bank)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted">{inr(r.entered)}</td>
                    <td
                      className={
                        "px-3 py-1.5 text-right font-medium tabular-nums " +
                        (off ? "text-red-600 dark:text-red-400" : "text-faint")
                      }
                    >
                      {off ? `${d > 0 ? "+" : "−"}${inr(Math.abs(d))}` : "✓"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
