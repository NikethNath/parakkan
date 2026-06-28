"use client";

import { useState } from "react";
import { densityAt15, type Astm3bResult } from "@/lib/astm";

const f1 = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const f2 = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Astm3bConverter() {
  const [density, setDensity] = useState("");
  const [temp, setTemp] = useState("");
  const [result, setResult] = useState<Astm3bResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const d = Number(density);
    const t = Number(temp);
    if (density.trim() === "" || !Number.isFinite(d) || d <= 0) {
      setResult(null);
      setError("Enter the observed density.");
      return;
    }
    if (temp.trim() === "" || !Number.isFinite(t)) {
      setResult(null);
      setError("Enter the observed temperature in °C.");
      return;
    }
    setResult(densityAt15(d, t));
  }

  return (
    <section className="rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border">
      <h2 className="mb-1 text-base font-bold text-foreground">
        Standard density at 15&deg;C &mdash; ASTM&nbsp;53B
      </h2>
      <p className="mb-4 text-xs text-muted">
        Enter the hydrometer density and the observed temperature; get the density at
        15&nbsp;&deg;C (ASTM&nbsp;D1250 / API&nbsp;11.1, generalized products &mdash; applies to
        both MS and HSD). Density may be kg/m&sup3; (e.g. 835) or kg/L (e.g. 0.835).
      </p>

      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-foreground">Observed density</span>
          <input
            type="number"
            inputMode="decimal"
            step="any"
            value={density}
            onChange={(e) => setDensity(e.target.value)}
            placeholder="e.g. 835 or 0.835"
            className={inp}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-foreground">Temperature (&deg;C)</span>
          <input
            type="number"
            inputMode="decimal"
            step="any"
            value={temp}
            onChange={(e) => setTemp(e.target.value)}
            placeholder="e.g. 31.5"
            className={inp}
          />
        </label>

        <button
          type="submit"
          className="rounded-lg bg-accent px-5 py-2 font-semibold text-white hover:bg-accent-strong"
        >
          Convert
        </button>
      </form>

      {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {result && (
        <div className="mt-4 rounded-xl bg-surface-2 p-4 ring-1 ring-border">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="text-xs text-muted">Density at 15&deg;C</p>
              <p className="text-3xl font-bold tabular-nums text-foreground">
                {f1(result.density15)}{" "}
                <span className="text-lg font-semibold text-muted">kg/m&sup3;</span>
              </p>
              <p className="text-sm text-muted">{f2(result.density15 / 1000)} kg/L</p>
            </div>
            <p className="text-right text-sm text-muted">
              from {f1(result.observed)} kg/m&sup3;
              <br />@ {f1(result.tempC)}&deg;C
            </p>
          </div>

          {!result.inRange && (
            <p className="mt-2 text-sm text-amber-600 dark:text-amber-400">
              ⚠ Outside the table&apos;s validity range (density 653&ndash;1075 kg/m&sup3;) &mdash;
              check the inputs.
            </p>
          )}

          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <Row k="Correction" v={`${result.density15 >= result.observed ? "+" : ""}${f1(result.density15 - result.observed)} kg/m³`} />
            <Row k="Per °C" v={`${f2(result.alpha15 * result.density15)} kg/m³`} />
            <Row k="VCF to 15°C" v={result.vcf.toFixed(5)} />
            <Row k="Exp. coeff α₁₅" v={`${result.alpha15.toFixed(6)} /°C`} />
          </dl>

          <p className="mt-3 text-xs text-faint">
            VCF converts volume too: litres at the observed temperature &times; {result.vcf.toFixed(5)}
            {" "}= litres at 15&deg;C (e.g. for a dipped stock).
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
