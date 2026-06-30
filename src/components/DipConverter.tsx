"use client";

import { useState } from "react";
import { DIP_CHARTS, stockToDip, type Tank, type DipResult } from "@/lib/dipChart";

const f1 = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const f2 = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function DipConverter() {
  const [tank, setTank] = useState<Tank>("MS");
  const [stock, setStock] = useState("");
  const [result, setResult] = useState<(DipResult & { tank: Tank }) | null>(null);
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const v = Number(stock);
    if (stock.trim() === "" || !Number.isFinite(v) || v < 0) {
      setResult(null);
      setError("Enter the stock in litres.");
      return;
    }
    setResult({ ...stockToDip(tank, v), tank });
  }

  const chart = DIP_CHARTS[tank];
  const maxL = chart.rows[chart.rows.length - 1][1];

  return (
    <section className="rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border">
      <h2 className="mb-1 text-base font-bold text-foreground">Stock → dip height</h2>
      <p className="mb-4 text-xs text-muted">
        Pick the tank, enter the book/physical stock in litres, and get the expected dip
        height. Interpolated between the calibration-chart rows.
      </p>

      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[160px_1fr_auto] sm:items-end">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-foreground">Tank</span>
          <select
            value={tank}
            onChange={(e) => {
              setTank(e.target.value as Tank);
              setResult(null);
              setError(null);
            }}
            className={inp}
          >
            <option value="MS">MS — Petrol (16 kL)</option>
            <option value="HSD">HSD — Diesel (22 kL)</option>
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-foreground">Stock (litres)</span>
          <input
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            placeholder={`0 – ${f2(maxL)}`}
            className={inp}
          />
        </label>

        <button
          type="submit"
          className="rounded-lg bg-accent px-5 py-2 font-semibold text-white hover:bg-accent-strong"
        >
          Get height
        </button>
      </form>

      {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {result && (
        <div className="mt-4 rounded-xl bg-surface-2 p-4 ring-1 ring-border">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="text-xs text-muted">Dip height</p>
              <p className="text-3xl font-bold tabular-nums text-foreground">
                {f1(result.dip / 10)} <span className="text-lg font-semibold text-muted">cm</span>
              </p>
            </div>
            <p className="text-sm text-muted">
              {DIP_CHARTS[result.tank].label} · {f2(result.litres)} L
            </p>
          </div>

          {result.oob && (
            <p className="mt-2 text-sm text-amber-600 dark:text-amber-400">
              ⚠ Stock is {result.oob} the chart range (0 – {f2(maxL)} L) — showing the{" "}
              {result.oob === "above" ? "full" : "minimum"} dip.
            </p>
          )}

          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <Row k="Fill rate here" v={`${f2(result.slope)} L/mm`} />
            <Row k="% of chart full" v={`${f1((result.litres / maxL) * 100)} %`} />
            <Row k="Ullage (space left)" v={`${f2(maxL - result.litres)} L`} />
            <Row k="Chart full" v={`${f2(maxL)} L`} />
          </dl>

          <p className="mt-3 text-xs text-faint">
            Between chart rows {result.lo[0]} mm = {f2(result.lo[1])} L and {result.hi[0]} mm ={" "}
            {f2(result.hi[1])} L.
          </p>
        </div>
      )}
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-dotted border-border pb-1">
      <dt className="text-muted">{k}</dt>
      <dd className="font-semibold tabular-nums text-foreground">{v}</dd>
    </div>
  );
}

const inp =
  "w-full rounded-lg border border-border px-3 py-2 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";
