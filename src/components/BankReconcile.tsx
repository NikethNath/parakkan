"use client";

import { useState } from "react";
import { inr } from "@/lib/format";

export type Side = {
  /** Null when nothing has been recorded for this day yet. */
  bank: number | null;
  /** True when some of it came from the Paytm report rather than a statement. */
  fromReport: boolean;
  entered: number;
};
export type Day = { date: string; gpay: Side; pos: Side };

const TOL = 6; // ₹ — only flag GPay/POS days off by more than this

export default function BankReconcile({ days }: { days: Day[] }) {
  const [channel, setChannel] = useState<"gpay" | "pos">("gpay");
  const hasAny = days.some((d) => d[channel].bank !== null || d[channel].entered !== 0);

  const label = (date: string) =>
    new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      timeZone: "UTC",
    });

  return (
    <div>
      <label className="mb-3 inline-flex items-center gap-2 text-sm">
        <span className="font-medium text-foreground">Channel</span>
        <select
          value={channel}
          onChange={(e) => setChannel(e.target.value as "gpay" | "pos")}
          className="rounded-lg border border-border px-3 py-1.5"
        >
          <option value="gpay">GPay / UPI</option>
          <option value="pos">POS / card</option>
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
                <th className="px-3 py-1.5 text-right font-medium">Received</th>
                <th className="px-3 py-1.5 text-right font-medium">Entered by staff</th>
                <th className="px-3 py-1.5 text-right font-medium">Δ</th>
              </tr>
            </thead>
            <tbody>
              {days.map((day) => {
                const side = day[channel];
// Nothing recorded yet is not a shortfall — the Paytm report
                // covering that day simply hasn't been imported.
                // Nothing recorded is not a shortfall — it just means the Paytm
                // report covering that day hasn't been imported.
                const pending = side.bank === null;
                const d = pending ? 0 : Math.round((side.entered - side.bank!) * 100) / 100;
                const off = !pending && Math.abs(d) > TOL;
                return (
                  <tr
                    key={day.date}
                    className={"border-t border-border " + (off ? "bg-red-50 dark:bg-red-500/10" : "")}
                  >
                    <td className="px-3 py-1.5">{label(day.date)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted">
                      {pending ? (
                        <span className="text-faint">—</span>
                      ) : (
                        <>
                          {inr(side.bank!)}
                          {side.fromReport && (
                            <span
                              className="ml-1 text-xs text-faint"
                              title="Includes figures from the Paytm report"
                            >
                              ✽
                            </span>
                          )}
                        </>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted">
                      {inr(side.entered)}
                    </td>
                    <td
                      className={
                        "px-3 py-1.5 text-right font-medium tabular-nums " +
                        (off ? "text-red-600 dark:text-red-400" : "text-faint")
                      }
                    >
                      {pending ? "—" : off ? `${d > 0 ? "+" : "−"}${inr(Math.abs(d))}` : "✓"}
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
