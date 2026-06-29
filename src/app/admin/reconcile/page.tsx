import { prisma } from "@/lib/db";
import { inr, toNum, isoDate } from "@/lib/format";
import StatementUpload from "@/components/StatementUpload";
import BankReconcile from "@/components/BankReconcile";
import AutoSubmitDate from "@/components/AutoSubmitDate";

function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)) };
}

const TOLERANCE = 6; // ₹ — matches TOL in BankReconcile

type Row = { date: string; bank: number; entered: number };

export default async function ReconcilePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const sp = await searchParams;
  const month = sp.month ?? isoDate(new Date()).slice(0, 7);
  const { start, end } = monthBounds(month);

  const [bankTxns, entries, lastUpload, bankCount] = await Promise.all([
    prisma.bankTxn.findMany({
      where: { businessDate: { gte: start, lt: end } },
      select: { businessDate: true, channel: true, amount: true },
    }),
    prisma.dailyEntry.findMany({
      where: { businessDate: { gte: start, lt: end } },
      select: { businessDate: true, gpay: true, pos: true },
    }),
    prisma.bankUpload.findFirst({ orderBy: { uploadedAt: "desc" } }),
    prisma.bankTxn.count(),
  ]);

  const build = (channel: "GPAY" | "POS", key: "gpay" | "pos"): Row[] => {
    const map = new Map<string, Row>();
    const get = (d: string) => {
      let r = map.get(d);
      if (!r) {
        r = { date: d, bank: 0, entered: 0 };
        map.set(d, r);
      }
      return r;
    };
    for (const t of bankTxns) if (t.channel === channel) get(isoDate(t.businessDate)).bank += toNum(t.amount);
    for (const e of entries) get(isoDate(e.businessDate)).entered += toNum(e[key]);
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  };

  const monthLabel = start.toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const lastUploadedLabel = lastUpload
    ? `${lastUpload.uploadedAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} (${lastUpload.fileName})`
    : null;

  return (
    <>
      <StatementUpload />

      <section className="rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-foreground">Reconciliation — {monthLabel}</h2>
            <p className="text-xs text-muted">
              Δ = entered by staff − received in bank. Off by &gt; {inr(TOLERANCE)} is flagged.
            </p>
            {lastUploadedLabel ? (
              <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
                ✓ {bankCount} transactions stored (cached) · last upload {lastUploadedLabel}.
                Re-uploading is de-duplicated.
              </p>
            ) : (
              <p className="mt-1 text-xs text-faint">No statement uploaded yet.</p>
            )}
          </div>
          <form className="flex items-end gap-2">
            <AutoSubmitDate
              type="month"
              name="month"
              defaultValue={month}
              className="rounded-lg border border-border px-3 py-1.5 text-sm"
            />
          </form>
        </div>

        <div className="mt-3">
          <BankReconcile gpay={build("GPAY", "gpay")} pos={build("POS", "pos")} />
        </div>
      </section>
    </>
  );
}

