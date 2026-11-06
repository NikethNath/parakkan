import { prisma } from "@/lib/db";
import { isoDate, istToday } from "@/lib/format";
import DocumentIndex from "@/components/DocumentIndex";
import FolderManager from "@/components/FolderManager";

/**
 * The paper-document index: type a document's name or a tag and get the
 * physical folder it is filed in, plus a link to its scan in Google Drive.
 *
 * Admin-only — the /admin layout's `requireAdmin` guards the page, and every
 * API route behind it checks the role itself.
 */
export default async function DocumentsPage() {
  const [folders, docs] = await Promise.all([
    prisma.docFolder.findMany({
      orderBy: { code: "asc" },
      include: { _count: { select: { documents: true } } },
    }),
    prisma.document.findMany({
      orderBy: { title: "asc" },
      select: {
        id: true,
        title: true,
        folderId: true,
        tags: true,
        driveUrl: true,
        notes: true,
        renewEveryMonths: true,
        lastRenewedOn: true,
        renewalDueOn: true,
      },
    }),
  ]);
  const docViews = docs.map((d) => ({
    ...d,
    lastRenewedOn: d.lastRenewedOn ? isoDate(d.lastRenewedOn) : null,
    renewalDueOn: d.renewalDueOn ? isoDate(d.renewalDueOn) : null,
  }));

  const folderViews = folders
    .map((f) => ({ id: f.id, code: f.code, name: f.name, location: f.location }))
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));

  return (
    <div className="space-y-4 pb-6">
      {/* "Today" comes from the server in IST, so overdue means the same thing
          on every device whatever its clock says. */}
      <DocumentIndex folders={folderViews} docs={docViews} today={istToday()} />
      <FolderManager
        folders={folderViews.map((f) => ({
          ...f,
          count: folders.find((x) => x.id === f.id)?._count.documents ?? 0,
        }))}
      />
    </div>
  );
}
