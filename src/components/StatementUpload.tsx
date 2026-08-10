"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface FileResult {
  fileName: string;
  account: string | null;
  found: number;
  inserted: number;
  duplicates: number;
}

export default function StatementUpload() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [detail, setDetail] = useState<FileResult[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload() {
    if (files.length === 0) return;
    setBusy(true);
    setMsg(null);
    setDetail([]);
    setErr(null);
    try {
      const fd = new FormData();
      for (const f of files) fd.append("file", f);
      const res = await fetch("/api/statements", { method: "POST", body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(d.error ?? "Upload failed");
        return;
      }
      setMsg(
        `Imported ${d.inserted} new transaction${d.inserted === 1 ? "" : "s"} ` +
          `(${d.gpay} GPay, ${d.pos} POS/card` +
          (d.duplicates ? `, ${d.duplicates} already imported` : "") +
          `).`,
      );
      setDetail(d.files ?? []);
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
        Upload bank statement
      </h2>
      <p className="mb-3 text-xs text-muted">
        SBI statement exports (.xls/.csv/.txt). Pick <strong>both</strong> accounts
        together — the main account (GPay) and the Paytm account (card) — since
        card money is settled into Paytm now. Re-uploading is safe.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          multiple
          accept=".xls,.csv,.txt,text/plain"
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          className="text-sm"
        />
        <button
          onClick={upload}
          disabled={files.length === 0 || busy}
          className="rounded-lg bg-accent px-4 py-1.5 font-medium text-white hover:bg-accent-strong disabled:opacity-60"
        >
          {busy ? "Uploading…" : files.length > 1 ? `Upload ${files.length} files` : "Upload"}
        </button>
      </div>
      {msg && <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-300">{msg}</p>}
      {detail.length > 1 && (
        <ul className="mt-1 space-y-0.5 text-xs text-muted">
          {detail.map((f) => (
            <li key={f.fileName}>
              {f.account ? `A/c …${f.account.slice(-4)}` : f.fileName}: {f.inserted} new
              {f.duplicates ? `, ${f.duplicates} already imported` : ""}
              {f.found === 0 ? " — nothing recognised in this file" : ""}
            </li>
          ))}
        </ul>
      )}
      {err && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{err}</p>}
    </section>
  );
}
