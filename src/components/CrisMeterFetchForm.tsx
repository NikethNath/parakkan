"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** Fetches the CRIS Transaction Report for one day → per-pump opening/closing
 *  totalizers (pumps 1–2 HSD, 3–6 MS), to cross-check staff meter readings. */
export default function CrisMeterFetchForm({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [date, setDate] = useState(iso(new Date()));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function fetchNow() {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await fetch("/api/cris/fetch-meters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr((d.error ?? "Could not start fetch") + (d.step ? ` (at: ${d.step})` : ""));
        setBusy(false);
        return;
      }
      setMsg(
        d.running
          ? "A fetch is already running — waiting for it to finish…"
          : "Logging into CRIS and downloading the day's transactions. This takes a minute or two…",
      );

      const deadline = Date.now() + 5 * 60 * 1000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 6000));
        let s: {
          running?: boolean;
          result?: { ok: boolean; imported?: number; error?: string; step?: string } | null;
        };
        try {
          s = await (await fetch("/api/cris/fetch-meters")).json();
        } catch {
          continue; // transient network blip — keep polling
        }
        if (!s.running && s.result) {
          if (s.result.ok) {
            setMsg(`Fetched ${s.result.imported} pump reading${s.result.imported === 1 ? "" : "s"} for ${date}.`);
            router.refresh();
          } else {
            setMsg(null);
            setErr((s.result.error ?? "Fetch failed") + (s.result.step ? ` (at: ${s.result.step})` : ""));
          }
          setBusy(false);
          return;
        }
      }
      setMsg("Still running — taking longer than usual. Refresh this page shortly.");
      setBusy(false);
    } catch {
      setErr("Could not start the fetch (network).");
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
        Fetch meter readings (CRIS)
      </h2>
      <p className="mb-3 text-xs text-muted">
        Downloads the day&apos;s CRIS Transaction Report and caches each pump&apos;s official
        opening totalizer (pumps 1–2 HSD, 3–6 MS) — it appears in small print under the staff
        readings below. Run when you&apos;re not logged into CRIS yourself.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-foreground">Day</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-border px-3 py-1.5"
          />
        </label>
        <button
          onClick={fetchNow}
          disabled={busy || !configured}
          className="rounded-lg bg-emerald-600 px-4 py-1.5 font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {busy ? "Fetching…" : "Fetch meter readings"}
        </button>
      </div>
      {!configured && (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
          CRIS login isn&apos;t configured — set <code>CRIS_LOGIN_URL</code> in the server env.
        </p>
      )}
      {msg && <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-300">{msg}</p>}
      {err && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{err}</p>}
    </section>
  );
}
