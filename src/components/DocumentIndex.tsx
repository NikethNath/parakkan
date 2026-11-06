"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DUE_SOON_DAYS,
  periodLabel,
  popularTags,
  renewalStatus,
  searchDocuments,
  type DocFolderView,
  type DocumentView,
  type RenewalStatus,
} from "@/lib/documents";
import { dayLabel } from "@/lib/format";
import DocumentDialog from "@/components/DocumentDialog";
import RenewDialog from "@/components/RenewDialog";

/** "Overdue by 5 days" / "Due in 12 days" / "Renew by 12 Mar 2027". */
function RenewalBadge({ s }: { s: RenewalStatus }) {
  if (s.level === "none" || !s.due || s.days === null) return null;
  const n = Math.abs(s.days);
  const text =
    s.level === "overdue"
      ? `Overdue by ${n} day${n === 1 ? "" : "s"}`
      : s.days === 0
        ? "Due today"
        : s.level === "soon"
          ? `Due in ${n} day${n === 1 ? "" : "s"}`
          : `Renew by ${dayLabel(s.due)}`;
  const cls = {
    overdue: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
    soon: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
    ok: "bg-surface-2 text-muted",
  }[s.level];
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}
      title={s.level === "ok" ? undefined : `Renew by ${dayLabel(s.due)}`}
      data-testid="renewal-badge"
    >
      {text}
    </span>
  );
}

type DueFilter = "" | "overdue" | "soon";

/**
 * Find a paper document: type its name or a tag, and the answer is which
 * folder to pull off the shelf — plus the scan, if there is one.
 *
 * Every document is already on the page (an outlet has hundreds, not
 * millions), so the search runs as you type with no round trip.
 */
export default function DocumentIndex({
  folders,
  docs,
  today,
}: {
  folders: DocFolderView[];
  docs: DocumentView[];
  today: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [folderId, setFolderId] = useState<string>("");
  const [editing, setEditing] = useState<DocumentView | "new" | null>(null);
  const [renewing, setRenewing] = useState<DocumentView | null>(null);
  const [dueFilter, setDueFilter] = useState<DueFilter>("");
  const [err, setErr] = useState<string | null>(null);

  const status = useMemo(() => new Map(docs.map((d) => [d.id, renewalStatus(d, today)])), [docs, today]);
  const overdue = docs.filter((d) => status.get(d.id)?.level === "overdue").length;
  const soon = docs.filter((d) => status.get(d.id)?.level === "soon").length;

  // Browsing (nothing typed) lists the soonest renewal first — see
  // searchDocuments. The chips narrow to what needs doing now.
  const hits = useMemo(
    () =>
      searchDocuments(docs, folders, q, folderId ? Number(folderId) : null).filter((h) => {
        const level = status.get(h.doc.id)?.level;
        if (dueFilter === "overdue") return level === "overdue";
        if (dueFilter === "soon") return level === "overdue" || level === "soon";
        return true;
      }),
    [docs, folders, q, folderId, dueFilter, status],
  );
  const suggestions = useMemo(() => popularTags(docs), [docs]);
  const sortedFolders = useMemo(
    () => [...folders].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })),
    [folders],
  );

  async function remove(d: DocumentView) {
    if (!confirm(`Remove "${d.title}" from the index?\n\nThe paper and its scan are not touched.`)) return;
    setErr(null);
    const res = await fetch(`/api/documents/${d.id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
    else setErr("Could not remove that document.");
  }

  return (
    <section className="rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[14rem] flex-1 text-sm">
          <span className="mb-1 block font-medium text-foreground">Find a document</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name or tag — e.g. peso licence, fire noc, kseb"
            autoFocus
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-base"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-foreground">Folder</span>
          <select
            value={folderId}
            onChange={(e) => setFolderId(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-2"
          >
            <option value="">All folders</option>
            {sortedFolders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.code} — {f.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => setEditing("new")}
          disabled={folders.length === 0}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-60"
        >
          Add document
        </button>
      </div>
      {folders.length === 0 && (
        <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
          Add your folders below first — every document is filed in one.
        </p>
      )}
      {err && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{err}</p>}

      {(overdue > 0 || soon > 0) && (
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          {overdue > 0 && (
            <button
              type="button"
              onClick={() => setDueFilter(dueFilter === "overdue" ? "" : "overdue")}
              className={
                "rounded-full px-3 py-1 font-medium " +
                (dueFilter === "overdue"
                  ? "bg-red-600 text-white"
                  : "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300")
              }
            >
              {overdue} overdue
            </button>
          )}
          {overdue + soon > 0 && (
            <button
              type="button"
              onClick={() => setDueFilter(dueFilter === "soon" ? "" : "soon")}
              className={
                "rounded-full px-3 py-1 font-medium " +
                (dueFilter === "soon"
                  ? "bg-amber-600 text-white"
                  : "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300")
              }
            >
              {overdue + soon} to renew within {DUE_SOON_DAYS} days
            </button>
          )}
        </div>
      )}

      <p className="mt-3 text-xs text-muted" data-testid="doc-count">
        {q || folderId || dueFilter
          ? `${hits.length} ${hits.length === 1 ? "match" : "matches"}`
          : `${docs.length} ${docs.length === 1 ? "document" : "documents"} indexed · soonest renewal first`}
      </p>

      {hits.length === 0 ? (
        <p className="py-6 text-center text-sm text-faint">
          {docs.length === 0 ? "Nothing indexed yet." : "No document matches that."}
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-border" data-testid="doc-results">
          {hits.map(({ doc, folder }) => (
            <li key={doc.id} className="flex flex-wrap items-start gap-3 py-3">
              {/* The answer to "where is it?" — big enough to read across the office. */}
              <div className="w-20 shrink-0 rounded-lg bg-accent/10 px-2 py-1.5 text-center">
                <div className="text-[10px] font-medium uppercase tracking-wide text-accent">Folder</div>
                <div className="text-xl font-bold leading-tight text-accent" data-testid="doc-folder-code">
                  {folder?.code ?? "?"}
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground" data-testid="doc-title">
                    {doc.title}
                  </span>
                  <RenewalBadge s={status.get(doc.id)!} />
                </div>
                <div className="text-xs text-muted">
                  {folder?.name}
                  {folder?.location && <> · {folder.location}</>}
                </div>
                {doc.tags.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {doc.tags.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setQ(t)}
                        className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted hover:text-foreground"
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                )}
                {doc.notes && <div className="mt-1 text-xs text-faint">{doc.notes}</div>}
                {(doc.renewEveryMonths || doc.renewalDueOn) && (
                  <div className="mt-1 text-xs text-faint">
                    {doc.renewEveryMonths ? periodLabel(doc.renewEveryMonths) : "Set renewal date"}
                    {doc.lastRenewedOn && <> · last renewed {dayLabel(doc.lastRenewedOn)}</>}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1 text-sm">
                {doc.driveUrl ? (
                  <a
                    href={doc.driveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-border px-3 py-1 font-medium text-accent hover:bg-surface-2"
                  >
                    Open scan ↗
                  </a>
                ) : (
                  <span className="text-xs text-faint">Not scanned yet</span>
                )}
                <div className="flex gap-3 text-xs">
                  {(doc.renewEveryMonths || doc.renewalDueOn) && (
                    <button
                      type="button"
                      onClick={() => setRenewing(doc)}
                      className="font-medium text-accent hover:underline"
                    >
                      Renewed
                    </button>
                  )}
                  <button type="button" onClick={() => setEditing(doc)} className="font-medium text-muted hover:underline">
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(doc)}
                    className="font-medium text-muted hover:text-red-600 hover:underline dark:hover:text-red-400"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <DocumentDialog
          folders={sortedFolders}
          suggestions={suggestions}
          existing={editing === "new" ? undefined : editing}
          today={today}
          onClose={() => setEditing(null)}
        />
      )}
      {renewing && <RenewDialog doc={renewing} today={today} onClose={() => setRenewing(null)} />}
    </section>
  );
}
