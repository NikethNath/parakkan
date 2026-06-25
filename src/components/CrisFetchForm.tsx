"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export default function CrisFetchForm({
  configured,
  defaultFrom,
  defaultTo,
  hint,
}: {
  configured: boolean;
  defaultFrom?: string;
  defaultTo?: string;
  hint?: string;
}) {
  const router = useRouter();
  const today = new Date();
  const [from, setFrom] = useState(
    defaultFrom ?? iso(new Date(today.getFullYear(), today.getMonth(), 1)),
  );
  const [to, setTo] = useState(defaultTo ?? iso(today));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function fetchNow() {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await fetch("/api/cris/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromDate: from, toDate: to }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr((d.error ?? "Fetch failed") + (d.step ? ` (at: ${d.step})` : ""));
        return;
      }
      setMsg(`Fetched & imported ${d.imported} day-rows from CRIS.`);
      router.refresh();
    } catch {
      setErr("Network error / the fetch timed out.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Fetch from CRIS (auto)
      </h2>
      <p className="mb-3 text-xs text-slate-500">
        Logs into CRIS, downloads the Daily Sales Report for the range, and imports it.
        Run this when you&apos;re <strong>not</strong> logged into CRIS yourself
        (single-session). It logs out automatically when done.
      </p>
      {hint && <p className="mb-3 text-xs text-sky-600">{hint}</p>}
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">From</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-1.5"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">To</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-1.5"
          />
        </label>
        <button
          onClick={fetchNow}
          disabled={busy || !configured}
          className="rounded-lg bg-emerald-600 px-4 py-1.5 font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {busy ? "Fetching… (up to ~1 min)" : "Fetch from CRIS"}
        </button>
      </div>
      {!configured && (
        <p className="mt-2 text-xs text-amber-600">Save your CRIS login above first.</p>
      )}
      {msg && <p className="mt-2 text-sm text-emerald-700">{msg}</p>}
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
    </section>
  );
}
