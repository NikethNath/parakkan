import { prisma } from "@/lib/db";
import { inr, toNum, isoDate } from "@/lib/format";
import { bankFigureAt, bankFigureSelect, preferTyped } from "@/lib/bankFigures";
import BankReconcile, { type Day, type Side } from "@/components/BankReconcile";
import AutoSubmitDate from "@/components/AutoSubmitDate";

function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)) };
}

const TOLERANCE = 6; // ₹ — matches TOL in BankReconcile

export default async function ReconcilePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const sp = await searchParams;
  const month = sp.month ?? isoDate(new Date()).slice(0, 7);
  const { start, end } = monthBounds(month);

  const [bankTxns, entries, bankCount] = await Promise.all([
    prisma.bankTxn.findMany({
      where: { businessDate: { gte: start, lt: end } },
      select: bankFigureSelect,
    }),
    prisma.dailyEntry.findMany({
      where: { businessDate: { gte: start, lt: end } },
      select: { businessDate: true, gpay: true, pos: true },
    }),
    prisma.bankTxn.count(),
  ]);

  // A typed figure supersedes the parsed rows for the same day and channel
  // rather than adding to them — see src/lib/bankFigures.ts.
  const figures = preferTyped(bankTxns);

  const enteredByDay = new Map<string, { gpay: number; pos: number }>();
  for (const e of entries) {
    const d = isoDate(e.businessDate);
    const r = enteredByDay.get(d) ?? { gpay: 0, pos: 0 };
    r.gpay += toNum(e.gpay);
    r.pos += toNum(e.pos);
    enteredByDay.set(d, r);
  }

  const dates = [
    ...new Set([...enteredByDay.keys(), ...bankTxns.map((t) => isoDate(t.businessDate))]),
  ].sort();

  const side = (date: string, channel: "GPAY" | "POS", entered: number): Side => {
    const f = bankFigureAt(figures, date, channel);
    return { bank: f ? f.amount : null, typed: f?.typed ?? false, entered };
  };

  const days: Day[] = dates.map((date) => {
    const staff = enteredByDay.get(date) ?? { gpay: 0, pos: 0 };
    return {
      date,
      gpay: side(date, "GPAY", staff.gpay),
      pos: side(date, "POS", staff.pos),
    };
  });

  // Days that still need the Paytm split typed in.
  const pending = days.filter((d) => d.gpay.bank === null || d.pos.bank === null).length;

  const monthLabel = start.toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <>
      {/* The statement upload is hidden: PhonePe stopped crediting the main
          account and Paytm now settles UPI and card as one credit, so a
          statement can no longer supply either figure — they're typed in per
          day instead. <StatementUpload /> and /api/statements still work; drop
          the component back in here if statement parsing is ever useful again
          (e.g. importing an older month). */}
      <section className="rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-foreground">Reconciliation — {monthLabel}</h2>
            <p className="text-xs text-muted">
              Δ = entered by staff − received. Off by &gt; {inr(TOLERANCE)} is flagged.
            </p>
            {pending > 0 && (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                {pending} day{pending === 1 ? "" : "s"} still need the GPay/POS split typed
                in — Paytm pays both into the bank as one credit, so use{" "}
                <span className="font-medium">Enter</span> on those rows.
              </p>
            )}
            <p className="mt-1 text-xs text-muted">
              {bankCount} figure{bankCount === 1 ? "" : "s"} stored for this outlet.
            </p>
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
          <BankReconcile days={days} />
        </div>
      </section>
    </>
  );
}

