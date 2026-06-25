"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function StatementUpload() {
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
      const res = await fetch("/api/statements", { method: "POST", body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(d.error ?? "Upload failed");
        return;
      }
      setMsg(
        `Imported ${d.inserted} new transaction${d.inserted === 1 ? "" : "s"} ` +
          `(${d.gpay} GPay, ${d.pos} POS` +
          (d.duplicates ? `, ${d.duplicates} already imported` : "") +
          `).`,
      );
      router.refresh();
    } catch {
      setErr("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Upload bank statement
      </h2>
      <p className="mb-3 text-xs text-slate-500">
        SBI statement export (.xls/.csv/.txt). GPay (PhonePe, T+1) and POS (DDMM)
        credits are detected automatically; re-uploading is safe.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept=".xls,.csv,.txt,text/plain"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-sm"
        />
        <button
          onClick={upload}
          disabled={!file || busy}
          className="rounded-lg bg-sky-600 px-4 py-1.5 font-medium text-white hover:bg-sky-700 disabled:opacity-60"
        >
          {busy ? "Uploading…" : "Upload"}
        </button>
      </div>
      {msg && <p className="mt-2 text-sm text-emerald-700">{msg}</p>}
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
    </section>
  );
}
