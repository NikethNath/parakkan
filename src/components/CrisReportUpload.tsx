"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CrisReportUpload() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload() {
    if (!file) return;
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/cris/upload", { method: "POST", body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(d.error ?? "Upload failed");
        return;
      }
      setMsg(`Imported ${d.imported} day-rows (${d.from ?? "?"} → ${d.to ?? "?"}).`);
      router.refresh();
    } catch {
      setErr("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
        Upload CRIS Daily Sales Report
      </h2>
      <p className="mb-3 text-xs text-muted">
        Download the Daily Sales Report (.xlsx) from CRIS for a date range and upload
        it here. The <strong>Net Totalizer Sales</strong> per product/date is matched
        against what staff entered.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept=".xlsx"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-sm"
        />
        <button
          onClick={upload}
          disabled={!file || busy}
          className="rounded-lg bg-accent px-4 py-1.5 font-medium text-white hover:bg-accent-strong disabled:opacity-60"
        >
          {busy ? "Importing…" : "Upload"}
        </button>
      </div>
      {msg && <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-300">{msg}</p>}
      {err && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{err}</p>}
    </section>
  );
}
