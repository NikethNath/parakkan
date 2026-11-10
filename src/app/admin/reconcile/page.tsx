import { prisma } from "@/lib/db";
import { inr, toNum, isoDate } from "@/lib/format";
import { PAYTM_REPORT, bankFigureAt, bankFigureSelect, sumBankFigures } from "@/lib/bankFigures";
import { checkDuDays, placeSheets, type DuNozzle, type DuSheet } from "@/lib/duCheck";
import DuCheck from "@/components/DuCheck";
import DispenserSetup, { type DispenserView, type RecentReading } from "@/components/DispenserSetup";
import BankReconcile, { type Day, type Side } from "@/components/BankReconcile";
import ReconcileImport from "@/components/ReconcileImport";
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

  const [bankTxns, entries, bankCount, dispensers, qrRows] = await Promise.all([
    prisma.bankTxn.findMany({
      where: { businessDate: { gte: start, lt: end } },
      select: bankFigureSelect,
    }),
    prisma.dailyEntry.findMany({
      where: { businessDate: { gte: start, lt: end } },
      select: { businessDate: true, gpay: true, pos: true },
    }),
    prisma.bankTxn.count(),
    prisma.dispenser.findMany({ include: { nozzles: { orderBy: { id: "asc" } } } }),
    prisma.paytmQrDay.findMany({ where: { businessDate: { gte: start, lt: end } } }),
  ]);

  // Providers add up for a day; only the bank's own Paytm credit steps aside
  // once the Paytm report covers that day — see src/lib/bankFigures.ts.
  const figures = sumBankFigures(bankTxns);

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
    return { bank: f ? f.amount : null, fromReport: f?.fromReport ?? false, entered };
  };

  const days: Day[] = dates.map((date) => {
    const staff = enteredByDay.get(date) ?? { gpay: 0, pos: 0 };
    return {
      date,
      gpay: side(date, "GPAY", staff.gpay),
      pos: side(date, "POS", staff.pos),
    };
  });

  // ---- GPay by DU -------------------------------------------------------
  // Nozzles are followed from the day they were bound, so the sheets loaded
  // stretch from there to this month, whichever side of it that day is.
  const byName = (a: { name: string }, b: { name: string }) =>
    a.name.localeCompare(b.name, undefined, { numeric: true });
  dispensers.sort(byName);
  const nozzles: DuNozzle[] = dispensers.flatMap((d) =>
    d.nozzles.map((n) => ({
      id: n.id,
      du: d.name,
      product: n.product,
      reading: toNum(n.reading),
      readOn: isoDate(n.readOn),
    })),
  );
  const boundDays = dispensers.flatMap((d) => d.nozzles.map((n) => n.readOn.getTime()));
  const trackFrom = new Date(Math.min(start.getTime(), ...boundDays));
  const trackTo = new Date(Math.max(end.getTime(), ...boundDays.map((t) => t + 86_400_000)));
  const sheetRows = nozzles.length
    ? await prisma.dailyEntry.findMany({
        where: { businessDate: { gte: trackFrom, lt: trackTo } },
        select: {
          id: true,
          businessDate: true,
          shift: true,
          product: true,
          employeeId: true,
          gpay: true,
          n1Open: true,
          n1Close: true,
          n2Open: true,
          n2Close: true,
          employee: { select: { name: true } },
          partner: { select: { name: true } },
        },
      })
    : [];
  const sheets: DuSheet[] = sheetRows.map((e) => ({
    id: e.id,
    date: isoDate(e.businessDate),
    shift: e.shift,
    product: e.product,
    staffId: e.employeeId,
    by: e.partner ? `${e.employee.name} + ${e.partner.name}` : e.employee.name,
    gpay: toNum(e.gpay),
    nozzles: [
      { open: toNum(e.n1Open), close: toNum(e.n1Close) },
      { open: toNum(e.n2Open), close: toNum(e.n2Close) },
    ],
  }));
  const reportDays = new Set(
    bankTxns.filter((t) => t.source === PAYTM_REPORT).map((t) => isoDate(t.businessDate)),
  );
  const phonepe = new Map(
    [...reportDays, ...dates].map((d) => [d, bankFigureAt(figures, d, "GPAY")?.statement ?? 0]),
  );
  const duDays = dispensers.length
    ? checkDuDays({
        dus: dispensers,
        sheets,
        placement: placeSheets(nozzles, sheets),
        qr: qrRows.map((q) => ({ date: isoDate(q.businessDate), posId: q.posId, amount: toNum(q.amount) })),
        phonepe,
        reportDays,
        from: isoDate(start),
        to: isoDate(new Date(end.getTime() - 86_400_000)),
      })
    : [];

  // The newest readings on file, offered when binding a nozzle so nobody has
  // to walk out to the pump to set this up.
  const latest = await prisma.dailyEntry.findMany({
    orderBy: [{ businessDate: "desc" }, { shift: "desc" }],
    take: 12,
    select: {
      businessDate: true,
      shift: true,
      product: true,
      n1Close: true,
      n2Close: true,
      employee: { select: { name: true } },
    },
  });
  const recent: RecentReading[] = latest.flatMap((e) =>
    [e.n1Close, e.n2Close]
      .map(toNum)
      .filter((v) => v > 0)
      .map((reading) => ({
        product: e.product,
        reading,
        readOn: isoDate(e.businessDate),
        shift: e.shift,
        by: e.employee.name,
      })),
  );
  const dispenserViews: DispenserView[] = dispensers.map((d) => ({
    id: d.id,
    name: d.name,
    posId: d.posId,
    nozzles: d.nozzles.map((n) => ({
      product: n.product,
      reading: toNum(n.reading),
      readOn: isoDate(n.readOn),
    })),
  }));
  const qrSeen = [...new Set(qrRows.map((q) => q.posId))].sort();

  // Days with nothing recorded yet — the Paytm report hasn't been imported for
  // them, so there is nothing to reconcile against.
  const pending = days.filter((d) => d.gpay.bank === null || d.pos.bank === null).length;

  const monthLabel = start.toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <>
      <ReconcileImport />

      <section className="rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-foreground">Reconciliation — {monthLabel}</h2>
            <p className="text-xs text-muted">
              Δ = entered by staff − received. Off by &gt; {inr(TOLERANCE)} is flagged.
            </p>
            {pending > 0 && (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                {pending} day{pending === 1 ? "" : "s"} have no figures yet — import the
                Paytm report, and the bank statement for PhonePe money, covering them.
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

      <section className="rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border">
        <h2 className="text-base font-bold text-foreground">GPay by DU — {monthLabel}</h2>
        <p className="text-xs text-muted">
          Each DU&apos;s Paytm QR against the GPay its morning and evening staff wrote, for
          the whole day. A gap means that pair has a mistake.
        </p>
        <div className="mt-3">
          {dispensers.length === 0 ? (
            <p className="py-4 text-center text-sm text-faint">
              Set up your DUs below to check GPay per dispenser.
            </p>
          ) : (
            <DuCheck days={duDays} />
          )}
        </div>
      </section>

      <DispenserSetup dispensers={dispenserViews} recent={recent} qrSeen={qrSeen} />
    </>
  );
}

