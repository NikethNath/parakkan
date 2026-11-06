"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  isArchiveFolder,
  nextDue,
  normaliseTags,
  RENEWAL_PERIODS,
  type DocFolderView,
  type DocumentView,
} from "@/lib/documents";
import { dayLabel } from "@/lib/format";

type Mode = "none" | "fixed" | "every";

/**
 * Add or edit one document in the paper index. Editing is also how a document
 * is moved: change its folder here after moving the paper.
 */
export default function DocumentDialog({
  folders,
  suggestions,
  existing,
  today,
  onClose,
}: {
  folders: DocFolderView[];
  suggestions: string[];
  existing?: DocumentView;
  today: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(existing?.title ?? "");
  const [folderId, setFolderId] = useState(String(existing?.folderId ?? folders[0]?.id ?? ""));
  const [tags, setTags] = useState(existing?.tags.join(", ") ?? "");
  const [driveUrl, setDriveUrl] = useState(existing?.driveUrl ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  // Renewal rule. Licences and certificates differ: some carry an expiry date
  // printed on them, others simply renew every year from the last time.
  const [mode, setMode] = useState<Mode>(
    existing?.renewEveryMonths ? "every" : existing?.renewalDueOn ? "fixed" : "none",
  );
  const known = RENEWAL_PERIODS.some((p) => p.months === existing?.renewEveryMonths);
  const [period, setPeriod] = useState<string>(
    existing?.renewEveryMonths ? (known ? String(existing.renewEveryMonths) : "other") : "12",
  );
  const [otherMonths, setOtherMonths] = useState(
    existing?.renewEveryMonths && !known ? String(existing.renewEveryMonths) : "",
  );
  const [lastRenewedOn, setLastRenewedOn] = useState(existing?.lastRenewedOn ?? "");
  const [renewalDueOn, setRenewalDueOn] = useState(existing?.renewalDueOn ?? "");

  const months = period === "other" ? Number(otherMonths) : Number(period);
  const preview =
    mode === "every" && months > 0 && lastRenewedOn
      ? nextDue({ renewEveryMonths: months, lastRenewedOn })
      : mode === "fixed" && renewalDueOn
        ? renewalDueOn
        : null;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const current = normaliseTags(tags);
  const addTag = (t: string) => setTags([...current, t].join(", "));

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(existing ? `/api/documents/${existing.id}` : "/api/documents", {
        method: existing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          folderId: Number(folderId),
          tags,
          driveUrl,
          notes: notes.trim() || undefined,
          renewalMode: mode,
          renewEveryMonths: mode === "every" && months > 0 ? months : undefined,
          lastRenewedOn: mode !== "none" && lastRenewedOn ? lastRenewedOn : undefined,
          renewalDueOn: mode === "fixed" && renewalDueOn ? renewalDueOn : undefined,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(d.error ?? "Could not save");
        setBusy(false);
        return;
      }
      router.refresh();
      onClose();
    } catch {
      setErr("Network error");
      setBusy(false);
    }
  }

  const input = "w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm";

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-full w-full max-w-md overflow-auto rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border">
        <h2 className="text-sm font-semibold text-foreground">
          {existing ? "Edit document" : "Add a document"}
        </h2>
        <div className="mt-3 space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-foreground">Name</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="PESO licence 2026"
              autoFocus
              className={input}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-foreground">Kept in folder</span>
            <select value={folderId} onChange={(e) => setFolderId(e.target.value)} className={input}>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.code} — {f.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-foreground">Tags</span>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="licence, peso, renewal"
              className={input}
            />
            <span className="mt-1 block text-xs text-muted">Separate with commas.</span>
          </label>
          {suggestions.some((t) => !current.includes(t)) && (
            <div className="flex flex-wrap gap-1">
              {suggestions
                .filter((t) => !current.includes(t))
                .map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => addTag(t)}
                    className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted hover:text-foreground"
                  >
                    + {t}
                  </button>
                ))}
            </div>
          )}
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-foreground">
              Google Drive link to the scan <span className="font-normal text-muted">(optional)</span>
            </span>
            <input
              value={driveUrl}
              onChange={(e) => setDriveUrl(e.target.value)}
              placeholder="https://drive.google.com/file/d/…"
              inputMode="url"
              className={input}
            />
          </label>
          {isArchiveFolder(folders.find((f) => String(f.id) === folderId)) ? (
            <p className="rounded-lg border border-border p-3 text-xs text-muted" data-testid="archive-note">
              This is an archive folder, so the document won&apos;t need renewing — any renewal
              date it had is dropped when you save.
            </p>
          ) : (
            <fieldset className="rounded-lg border border-border p-3">
              <legend className="px-1 text-sm font-medium text-foreground">Renewal</legend>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as Mode)}
                aria-label="Renewal"
                className={input}
              >
                <option value="none">Doesn&apos;t need renewing</option>
                <option value="fixed">Renews on a set date</option>
                <option value="every">Renews every…</option>
              </select>

              {mode === "every" && (
                <div className="mt-2 space-y-2">
                  <div className="flex gap-2">
                    <select
                      value={period}
                      onChange={(e) => setPeriod(e.target.value)}
                      aria-label="How often"
                      className={input}
                    >
                      {RENEWAL_PERIODS.map((p) => (
                        <option key={p.months} value={p.months}>
                          {p.label}
                        </option>
                      ))}
                      <option value="other">Other…</option>
                    </select>
                    {period === "other" && (
                      <input
                        type="number"
                        min={1}
                        max={120}
                        value={otherMonths}
                        onChange={(e) => setOtherMonths(e.target.value)}
                        placeholder="months"
                        aria-label="Months"
                        className={`${input} w-28`}
                      />
                    )}
                  </div>
                  <label className="block text-sm">
                    <span className="mb-1 block text-muted">Last renewed on</span>
                    <input
                      type="date"
                      value={lastRenewedOn}
                      max={today}
                      onChange={(e) => setLastRenewedOn(e.target.value)}
                      aria-label="Last renewed on"
                      className={input}
                    />
                  </label>
                </div>
              )}

              {mode === "fixed" && (
                <div className="mt-2 space-y-2">
                  <label className="block text-sm">
                    <span className="mb-1 block text-muted">Renew by (the date on the document)</span>
                    <input
                      type="date"
                      value={renewalDueOn}
                      onChange={(e) => setRenewalDueOn(e.target.value)}
                      aria-label="Renew by"
                      className={input}
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block text-muted">
                      Last renewed on <span className="text-faint">(optional)</span>
                    </span>
                    <input
                      type="date"
                      value={lastRenewedOn}
                      max={today}
                      onChange={(e) => setLastRenewedOn(e.target.value)}
                      aria-label="Last renewed on"
                      className={input}
                    />
                  </label>
                </div>
              )}

              {preview && (
                <p className="mt-2 text-xs text-muted" data-testid="renewal-preview">
                  Next due <strong className="text-foreground">{dayLabel(preview)}</strong>
                </p>
              )}
            </fieldset>
          )}

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-foreground">
              Note <span className="font-normal text-muted">(optional)</span>
            </span>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Renew every March"
              className={input}
            />
          </label>
        </div>
        {err && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{err}</p>}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex-1 rounded-lg border border-border px-4 py-2 font-medium text-foreground hover:bg-surface-2 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy || !title.trim() || !folderId}
            className="flex-1 rounded-lg bg-accent px-4 py-2 font-semibold text-white hover:bg-accent-strong disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
