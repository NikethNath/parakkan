"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CrisCredentialsForm({
  configured,
  updatedLabel,
}: {
  configured: boolean;
  updatedLabel: string | null;
}) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await fetch("/api/cris/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(d.error ?? "Could not save");
        return;
      }
      setMsg("Saved securely (encrypted).");
      setUsername("");
      setPassword("");
      router.refresh();
    } catch {
      setErr("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">
        CRIS login
      </h2>
      <p className="mb-3 text-xs text-muted">
        {configured
          ? `Saved (encrypted)${updatedLabel ? ` · updated ${updatedLabel}` : ""}. Re-enter to update.`
          : "Not set yet. Stored AES-256 encrypted — never in plain text."}
      </p>
      <div className="grid max-w-md grid-cols-1 gap-3">
        <input
          placeholder="CRIS user ID"
          value={username}
          autoCapitalize="none"
          onChange={(e) => setUsername(e.target.value)}
          className="rounded-lg border border-border px-3 py-2"
        />
        <input
          placeholder="CRIS password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-lg border border-border px-3 py-2"
        />
        <div>
          <button
            onClick={save}
            disabled={busy || !username || !password}
            className="rounded-lg bg-accent px-4 py-2 font-semibold text-white hover:bg-accent-strong disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save credentials"}
          </button>
        </div>
        {msg && <p className="text-sm text-emerald-700 dark:text-emerald-300">{msg}</p>}
        {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}
      </div>
    </section>
  );
}
