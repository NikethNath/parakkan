"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { istToday } from "@/lib/format";

/**
 * One-click "fetch this month from CRIS" for the Daily sales register — starts
 * the same background Daily-Sales-Report job as the CRIS tab (single browser
 * session, auto-logout) for the shown month, capped at today, then refreshes.
 */
export default function CrisMonthFetchButton({
  month, // YYYY-MM (the month shown on the page)
  configured,
}: {
  month: string;
  configured: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const today = istToday();
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const from = `${month}-01`;
  const to = `${month}-${String(lastDay).padStart(2, "0")}` < today
    ? `${month}-${String(lastDay).padStart(2, "0")}`
    : today;
  const futureMonth = from > today;

  async function run() {
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
        setErr(d.error ?? "Could not start fetch");
        setBusy(false);
        return;
      }
      setMsg(
        d.running
          ? "A fetch is already running — waiting for it…"
          : "Logging into CRIS and downloading the month. Takes a minute or two…",
      );
      const deadline = Date.now() + 5 * 60 * 1000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 6000));
        let s: { running?: boolean; result?: { ok: boolean; days?: number; error?: string; step?: string } | null };
        try {
          s = await (await fetch("/api/cris/fetch")).json();
        } catch {
          continue;
        }
        if (!s.running && s.result) {
          if (s.result.ok) {
            setMsg(`Fetched ${s.result.days} day${s.result.days === 1 ? "" : "s"} from CRIS.`);
            router.refresh();
          } else {
            setMsg(null);
            setErr((s.result.error ?? "Fetch failed") + (s.result.step ? ` (at: ${s.result.step})` : ""));
          }
          setBusy(false);
          return;
        }
      }
      setMsg("Still running — refresh the page shortly to see the data.");
      setBusy(false);
    } catch {
      setErr("Could not start the fetch (network).");
      setBusy(false);
    }
  }

  return (
    <div className="print:hidden">
      <button
        onClick={run}
        disabled={busy || !configured || futureMonth}
        title={configured ? `Fetches ${from} – ${to} from CRIS` : "CRIS login isn't configured"}
        className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
      >
        {busy ? "Fetching…" : "Fetch month from CRIS"}
      </button>
      {msg && <p className="mt-1 max-w-56 text-xs text-emerald-700 dark:text-emerald-300">{msg}</p>}
      {err && <p className="mt-1 max-w-56 text-xs text-red-600 dark:text-red-400">{err}</p>}
    </div>
  );
}
