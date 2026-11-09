"use client";

import { useState } from "react";
import { compareCris, type CrisCompareRow } from "@/lib/crisCompare";
import MaintenanceTestButton from "@/components/MaintenanceTestButton";

const fmtL = (n: number) => `${n.toFixed(2)} L`;

export default function CrisCompare({ ms, hsd }: { ms: CrisCompareRow[]; hsd: CrisCompareRow[] }) {
  const [product, setProduct] = useState<"MS" | "HSD">("MS");
  const rows = product === "MS" ? ms : hsd;

  return (
    <div>
      <label className="mb-3 inline-flex items-center gap-2 text-sm">
        <span className="font-medium text-foreground">Product</span>
        <select
          value={product}
          onChange={(e) => setProduct(e.target.value as "MS" | "HSD")}
          className="rounded-lg border border-border px-3 py-1.5"
        >
          <option value="MS">MS (Petrol)</option>
          <option value="HSD">HSD (Diesel)</option>
        </select>
      </label>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-faint">No data for this product.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="cris-compare">
              <thead className="text-left text-muted">
                <tr>
                  <th className="px-3 py-1.5 font-medium">Date</th>
                  <th className="px-3 py-1.5 text-right font-medium">CRIS net totalizer</th>
                  <th className="px-3 py-1.5 text-right font-medium">Maintenance test</th>
                  <th className="px-3 py-1.5 text-right font-medium">Staff net salable</th>
                  <th className="px-3 py-1.5 text-right font-medium">Δ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const v = compareCris(r);
                  return (
                    <tr
                      key={r.date}
                      data-date={r.date}
                      className={"border-t border-border " + (v.off ? "bg-red-50 dark:bg-red-500/10" : "")}
                    >
                      <td className="px-3 py-1.5">
                        {new Date(`${r.date}T00:00:00Z`).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          timeZone: "UTC",
                        })}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-muted">
                        {r.cris !== null ? fmtL(r.cris) : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums" data-testid="maintenance-cell">
                        {r.maintenance > 0 && (
                          <div className="text-foreground" title={r.maintenanceNote ?? undefined}>
                            −{fmtL(r.maintenance)}
                          </div>
                        )}
                        {r.maintenanceNote && (
                          <div className="max-w-[12rem] truncate text-[10px] leading-tight text-faint">
                            {r.maintenanceNote}
                          </div>
                        )}
                        {/* It corrects a CRIS figure, so it needs one to correct. */}
                        {r.cris !== null && (
                          <MaintenanceTestButton
                            date={r.date}
                            product={product}
                            current={r.maintenance}
                            note={r.maintenanceNote}
                            suggestion={v.suggestion}
                          />
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-muted">{fmtL(r.staff)}</td>
                      <td
                        data-testid="delta"
                        className={
                          "px-3 py-1.5 text-right font-medium tabular-nums " +
                          (v.delta === null
                            ? "text-faint"
                            : v.off
                              ? "text-red-600 dark:text-red-400"
                              : "text-emerald-600 dark:text-emerald-400")
                        }
                        title={v.explained ? "Matches once the maintenance test is taken off" : undefined}
                      >
                        {v.delta === null
                          ? "—"
                          : v.off
                            ? `${v.delta > 0 ? "+" : "−"}${fmtL(Math.abs(v.delta))}`
                            : v.explained
                              ? "✓ after test"
                              : "✓"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-faint">
            A <strong>maintenance test</strong> is fuel a repairman pumped through a dispenser
            without authorising the test on the computer — CRIS counts it as sold. When CRIS is
            ahead of the staff, the gap is offered as a starting figure. If the staff sheet
            didn&apos;t record those litres as a test either, fix its test litres on the Summary
            tab so the attendant isn&apos;t charged for them.
          </p>
        </>
      )}
    </div>
  );
}
