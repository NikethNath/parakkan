"use client";

import { useState } from "react";

type Row = { date: string; cris: number | null; staff: number };
const TOL = 1;
const fmtL = (n: number) => `${n.toFixed(2)} L`;

export default function CrisCompare({ ms, hsd }: { ms: Row[]; hsd: Row[] }) {
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
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted">
              <tr>
                <th className="px-3 py-1.5 font-medium">Date</th>
                <th className="px-3 py-1.5 text-right font-medium">CRIS net totalizer</th>
                <th className="px-3 py-1.5 text-right font-medium">Staff net salable</th>
                <th className="px-3 py-1.5 text-right font-medium">Δ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const has = r.cris !== null;
                const d = has ? Math.round((r.staff - (r.cris ?? 0)) * 100) / 100 : null;
                const off = d !== null && Math.abs(d) > TOL;
                return (
                  <tr key={r.date} className={"border-t border-border " + (off ? "bg-red-50 dark:bg-red-500/10" : "")}>
                    <td className="px-3 py-1.5">
                      {new Date(`${r.date}T00:00:00Z`).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        timeZone: "UTC",
                      })}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted">
                      {has ? fmtL(r.cris as number) : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted">{fmtL(r.staff)}</td>
                    <td
                      className={
                        "px-3 py-1.5 text-right font-medium tabular-nums " +
                        (d === null ? "text-faint" : off ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400")
                      }
                    >
                      {d === null ? "—" : off ? `${d > 0 ? "+" : "−"}${fmtL(Math.abs(d))}` : "✓"}
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
