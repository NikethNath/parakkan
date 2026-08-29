"use client";

import { useState } from "react";
import { inr } from "@/lib/format";
import ReconcileDayEditButton from "@/components/ReconcileDayEditButton";

export type Side = {
  /** Null when nothing has been parsed or typed for this day yet. */
  bank: number | null;
  /** True when the figure was typed in from the Paytm app. */
  typed: boolean;
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
                <th className="px-3 py-1.5 text-right font-medium print:hidden"></th>
              </tr>
            </thead>
            <tbody>
              {days.map((day) => {
                const side = day[channel];
                // Nothing recorded yet is not a shortfall — every day since the
                // Paytm switch is blank until the split is typed in.
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
                          {side.typed && (
                            <span
                              className="ml-1 text-xs text-faint"
                              title="Typed in from the Paytm app"
                            >
                              ✎
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
                    <td className="px-3 py-1.5 text-right print:hidden">
                      <ReconcileDayEditButton
                        date={day.date}
                        label={label(day.date)}
                        gpay={day.gpay.typed ? day.gpay.bank : null}
                        pos={day.pos.typed ? day.pos.bank : null}
                        entered={{ gpay: day.gpay.entered, pos: day.pos.entered }}
                      />
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
