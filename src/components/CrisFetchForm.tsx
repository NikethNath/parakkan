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
      // Kick off the background job — returns immediately (the headless run
      // takes 1-2 min, too long to hold the request open).
      const res = await fetch("/api/cris/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromDate: from, toDate: to }),
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
          : "Logging into CRIS and downloading the report. This takes about a minute or two…",
      );

      // Poll for the result.
      const deadline = Date.now() + 5 * 60 * 1000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 6000));
        let s: {
          running?: boolean;
          result?: {
            ok: boolean;
            imported?: number;
            days?: number;
            error?: string;
            step?: string;
          } | null;
        };
        try {
          s = await (await fetch("/api/cris/fetch")).json();
        } catch {
          continue; // transient network blip — keep polling
        }
        if (!s.running && s.result) {
          if (s.result.ok) {
            setMsg(
              `Fetched ${s.result.days} day${s.result.days === 1 ? "" : "s"} from CRIS ` +
                `(${s.result.imported} records — MS & HSD).`,
            );
            router.refresh();
          } else {
            setMsg(null);
            setErr((s.result.error ?? "Fetch failed") + (s.result.step ? ` (at: ${s.result.step})` : ""));
          }
          setBusy(false);
          return;
        }
      }
      setMsg("Still running — taking longer than usual. Refresh this page shortly to see the imported data.");
      setBusy(false);
    } catch {
      setErr("Could not start the fetch (network).");
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
        Fetch from CRIS (auto)
      </h2>
      <p className="mb-3 text-xs text-muted">
        Logs into CRIS, downloads the Daily Sales Report for the range, and imports it.
        Run this when you&apos;re <strong>not</strong> logged into CRIS yourself
        (single-session). It logs out automatically when done.
      </p>
      {hint && <p className="mb-3 text-xs text-accent">{hint}</p>}
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-foreground">From</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-border px-3 py-1.5"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-foreground">To</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-border px-3 py-1.5"
          />
        </label>
        <button
          onClick={fetchNow}
          disabled={busy || !configured}
          className="rounded-lg bg-emerald-600 px-4 py-1.5 font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {busy ? "Fetching…" : "Fetch from CRIS"}
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
