/**
 * The paper-document index: where each physical document lives, and a link to
 * its scan in Google Drive.
 *
 * Pure and dependency-free on purpose — the API uses it to clean what it
 * stores, and the browser uses the same `searchDocuments` to filter as you
 * type, so what gets saved and what gets found follow one set of rules.
 */

export interface DocFolderView {
  id: number;
  code: string;
  name: string;
  location: string | null;
}

export interface DocumentView {
  id: number;
  title: string;
  folderId: number;
  tags: string[];
  driveUrl: string | null;
  notes: string | null;
  /** Renews every N months from `lastRenewedOn`. */
  renewEveryMonths?: number | null;
  /** YYYY-MM-DD. */
  lastRenewedOn?: string | null;
  /** YYYY-MM-DD — a fixed renewal date, used when there is no frequency. */
  renewalDueOn?: string | null;
}

// ---------------------------------------------------------------------------
// Renewals
// ---------------------------------------------------------------------------

/**
 * Archive folders hold superseded paper — an expired licence kept after its
 * renewal. By the outlet's convention their codes start with Z ("Z-1", "z-2"),
 * and nothing in them needs renewing: their documents never show a due date,
 * never count as overdue, and can't be marked renewed.
 *
 * Read off the code rather than stored as a flag, so the rule is exactly the
 * one written on the spine and can't drift from it — renaming a folder to Z-3
 * archives everything in it at once.
 */
export const ARCHIVE_PREFIX = "z";
export const isArchiveFolder = (folder?: Pick<DocFolderView, "code"> | null): boolean =>
  !!folder && folder.code.trim().toLowerCase().startsWith(ARCHIVE_PREFIX);

/** A document due within this many days is flagged as coming up. */
export const DUE_SOON_DAYS = 30;

/** The choices offered for "renews every…", in months. */
export const RENEWAL_PERIODS: { months: number; label: string }[] = [
  { months: 1, label: "Every month" },
  { months: 3, label: "Every 3 months" },
  { months: 6, label: "Every 6 months" },
  { months: 12, label: "Every year" },
  { months: 24, label: "Every 2 years" },
  { months: 36, label: "Every 3 years" },
  { months: 60, label: "Every 5 years" },
  { months: 120, label: "Every 10 years" },
];

export const periodLabel = (months: number) =>
  RENEWAL_PERIODS.find((p) => p.months === months)?.label ??
  (months % 12 === 0 ? `Every ${months / 12} years` : `Every ${months} months`);

/**
 * `2026-01-31` + 1 month → `2026-02-28`: the day is clamped to the end of a
 * shorter month rather than spilling into the next one, so a licence renewed
 * on the 31st never shows as due a few days late.
 */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

/** When the document next needs renewing, or null if it doesn't renew. A
 *  frequency, when set, wins over a fixed date. */
export function nextDue(doc: Pick<DocumentView, "renewEveryMonths" | "lastRenewedOn" | "renewalDueOn">): string | null {
  if (doc.renewEveryMonths && doc.lastRenewedOn) return addMonths(doc.lastRenewedOn, doc.renewEveryMonths);
  return doc.renewalDueOn ?? null;
}

export type RenewalLevel = "overdue" | "soon" | "ok" | "none";

export interface RenewalStatus {
  due: string | null;
  /** Days from `today` to `due`; negative once overdue. */
  days: number | null;
  level: RenewalLevel;
}

const dayNumber = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000;

/** `today` is passed in (IST, YYYY-MM-DD) so the server and the browser agree
 *  on what "overdue" means regardless of the device's clock or time zone.
 *  A document filed in an archive folder has no renewal, whatever it carries. */
export function renewalStatus(
  doc: DocumentView,
  today: string,
  folder?: Pick<DocFolderView, "code"> | null,
): RenewalStatus {
  const due = isArchiveFolder(folder) ? null : nextDue(doc);
  if (!due) return { due: null, days: null, level: "none" };
  const days = dayNumber(due) - dayNumber(today);
  return { due, days, level: days < 0 ? "overdue" : days <= DUE_SOON_DAYS ? "soon" : "ok" };
}

/**
 * Tags as typed ("Licence, PESO ,peso,  fire noc") → `["licence", "peso",
 * "fire noc"]`. Lower-cased so a search never misses on capitalisation, and
 * de-duplicated so a repeated tag can't inflate a match.
 */
export function normaliseTags(input: string | string[]): string[] {
  const parts = Array.isArray(input) ? input : input.split(",");
  const out: string[] = [];
  for (const p of parts) {
    const t = p.trim().replace(/\s+/g, " ").toLowerCase();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

const DRIVE_HOSTS = new Set(["drive.google.com", "docs.google.com"]);

/**
 * Checks a pasted scan link and returns it in canonical form, or an error.
 *
 * Only Google Drive / Docs links are accepted. The link is rendered as a
 * clickable href, so anything that isn't plain https to Google is refused —
 * that rules out a `javascript:` URL as much as a typo'd host. A link pasted
 * without its `https://` (as phones often copy it) is accepted and completed.
 */
export function checkDriveUrl(
  raw: string,
): { ok: true; url: string | null } | { ok: false; error: string } {
  const t = raw.trim();
  if (!t) return { ok: true, url: null }; // not scanned yet

  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`;
  let u: URL;
  try {
    u = new URL(withScheme);
  } catch {
    return { ok: false, error: "That doesn't look like a link — paste the Google Drive share link." };
  }
  if (u.protocol !== "https:" || !DRIVE_HOSTS.has(u.hostname.toLowerCase())) {
    return {
      ok: false,
      error: "Only Google Drive links are accepted (drive.google.com or docs.google.com).",
    };
  }
  return { ok: true, url: u.toString() };
}

export interface DocumentHit {
  doc: DocumentView;
  folder: DocFolderView | undefined;
  score: number;
}

const words = (s: string) => s.toLowerCase().split(/\s+/).filter(Boolean);

/**
 * Finds documents by name, tag, folder or note, as you type.
 *
 * Every word typed must match somewhere ("fire noc 2024" narrows rather than
 * widens), and a word matches the *start* of a word in the field — so "lic"
 * finds "Licence" but "ice" does not drag in every "Invoice". Results are
 * ranked so a title hit beats a tag hit beats a folder or note hit. Ties —
 * and the whole list when nothing is typed — put the soonest renewal first,
 * then fall back to folder order so the rest reads like the shelf.
 *
 * Searching by a folder's code ("12", "A-3") lists what is in it.
 *
 * In memory rather than in SQL: an outlet has hundreds of documents, not
 * millions, and prefix-matching inside a tag array is awkward in Prisma.
 */
export function searchDocuments(
  docs: DocumentView[],
  folders: DocFolderView[],
  query: string,
  folderId?: number | null,
): DocumentHit[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const terms = words(query);
  const folderOrder = new Map(
    [...folders]
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
      .map((f, i) => [f.id, i]),
  );

  const hits: DocumentHit[] = [];
  for (const doc of docs) {
    if (folderId != null && doc.folderId !== folderId) continue;
    const folder = byId.get(doc.folderId);

    const titleWords = words(doc.title);
    const tagWords = doc.tags.flatMap(words);
    const folderWords = folder ? [...words(folder.name), ...words(folder.location ?? "")] : [];
    const noteWords = words(doc.notes ?? "");
    const code = folder?.code.toLowerCase();

    let score = 0;
    let all = true;
    for (const t of terms) {
      const starts = (ws: string[]) => ws.some((w) => w.startsWith(t));
      if (code === t) score += 8; // "12" means folder 12
      else if (titleWords.some((w) => w === t)) score += 6;
      else if (starts(titleWords)) score += 5;
      else if (doc.tags.includes(t) || tagWords.some((w) => w === t)) score += 4;
      else if (starts(tagWords)) score += 3;
      else if (starts(folderWords)) score += 2;
      else if (starts(noteWords)) score += 1;
      else {
        all = false;
        break;
      }
    }
    if (all) hits.push({ doc, folder, score });
  }

  // Soonest renewal first; documents that never renew go after all that do.
  // Archived copies don't renew, so they sort with the documents that never do.
  const due = new Map(hits.map((h) => [h.doc.id, isArchiveFolder(h.folder) ? null : nextDue(h.doc)]));
  const byDue = (a: DocumentHit, b: DocumentHit) => {
    const da = due.get(a.doc.id);
    const db = due.get(b.doc.id);
    if (da && db) return da.localeCompare(db);
    return da ? -1 : db ? 1 : 0;
  };

  return hits.sort(
    (a, b) =>
      // A typed search is looking for something in particular, so how well it
      // matches leads; with nothing typed every score is 0 and the list is
      // simply the renewal queue.
      b.score - a.score ||
      byDue(a, b) ||
      (folderOrder.get(a.doc.folderId) ?? 0) - (folderOrder.get(b.doc.folderId) ?? 0) ||
      a.doc.title.localeCompare(b.doc.title),
  );
}

/** Most-used tags first — offered as one-click suggestions when tagging. */
export function popularTags(docs: DocumentView[], limit = 12): string[] {
  const n = new Map<string, number>();
  for (const d of docs) for (const t of d.tags) n.set(t, (n.get(t) ?? 0) + 1);
  return [...n.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([t]) => t);
}
