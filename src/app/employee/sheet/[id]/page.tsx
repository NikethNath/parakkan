import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { inr, litres, toNum } from "@/lib/format";
import { shortExcessLabel } from "@/lib/calc";
import TopBar from "@/components/TopBar";

export default async function EmployeeSheetDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isInteger(id)) notFound();

  // An employee can only view their OWN sheet.
  const entry = await prisma.dailyEntry.findFirst({
    where: { id, employeeId: user.uid },
    include: {
      oilLines: true,
      expenseLines: true,
      creditLines: true,
      audits: {
        orderBy: { changedAt: "asc" },
        include: { changedBy: { select: { name: true } } },
      },
    },
  });
  if (!entry) notFound();

  const se = toNum(entry.shortExcess);
  const lbl = shortExcessLabel(se);

  return (
    <div className="min-h-screen bg-bg">
      <TopBar name={user.name} subtitle="My sheet" home="/employee" />
      <main className="mx-auto max-w-2xl space-y-4 p-4">
        <Link href="/employee" className="text-sm text-accent hover:underline">
          ← Back
        </Link>

        <header className="rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-foreground">
                {entry.businessDate.toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}{" "}
                · {entry.shift === "MORNING" ? "Morning" : "Evening"} · {entry.product}
              </p>
              <p className="text-xs text-muted">Rate {inr(toNum(entry.rate))}/L</p>
            </div>
            <span
              className={
                "rounded-full px-3 py-1 text-xs font-semibold " +
                (lbl === "SHORT"
                  ? "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300"
                  : lbl === "EXCESS"
                    ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : "bg-surface-2 text-muted")
              }
            >
              {lbl === "BALANCED" ? "Balanced" : `${lbl} ${inr(Math.abs(se))}`}
            </span>
          </div>
        </header>

        {entry.status === "VERIFIED" ? (
          <div className="rounded-xl bg-surface-2 p-3 text-center text-sm text-muted ring-1 ring-border">
            🔒 Verified by the admin — this sheet is locked. Ask the admin if something
            needs fixing.
          </div>
        ) : (
          <Link
            href={`/employee/sheet/${entry.id}/edit`}
            className="block rounded-xl bg-accent px-4 py-3 text-center font-semibold text-white shadow-soft transition hover:bg-accent-strong"
          >
            ✏️ Edit this sheet
          </Link>
        )}

        {/* Transparency: any admin edits to this sheet */}
        {entry.audits.length > 0 ? (
          <section className="rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-4">
            <h2 className="mb-1 text-sm font-semibold text-amber-800 dark:text-amber-300">
              This sheet was edited by the admin after you submitted it
            </h2>
            <p className="mb-2 text-xs text-amber-700 dark:text-amber-300">
              Every change is shown below (original → new value) for your records.
            </p>
            <ul className="space-y-1 text-sm text-amber-900 dark:text-amber-200">
              {entry.audits.map((a) => (
                <li key={a.id} className="flex flex-wrap justify-between gap-2">
                  <span>
                    <span className="font-medium">{fieldLabel(a.field)}</span>:{" "}
                    {a.oldValue} → {a.newValue}
                  </span>
                  <span className="text-xs text-amber-600 dark:text-amber-400">
                    {a.changedBy.name} ·{" "}
                    {a.changedAt.toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <section className="rounded-xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-300">
            No changes — exactly as you submitted.
          </section>
        )}

        <section className="rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
            Sheet summary
          </h2>
          <dl className="space-y-1.5 text-sm">
            <Row label="Nozzle 1 (open → close)">
              {toNum(entry.n1Open)} → {toNum(entry.n1Close)}
            </Row>
            <Row label="Nozzle 2 (open → close)">
              {toNum(entry.n2Open)} → {toNum(entry.n2Close)}
            </Row>
            <Row label="Test litres">{litres(toNum(entry.testLitres))}</Row>
            <Row label="Dispensed → salable">
              {litres(toNum(entry.grossLitres))} → {litres(toNum(entry.netSalableLitres))}
            </Row>
            <Row label="Fuel expected" strong>
              {inr(toNum(entry.fuelExpected))}
            </Row>
            <Divider />
            <Row label="Cash counted">{inr(toNum(entry.cashTotal))}</Row>
            <Row label="GPay">{inr(toNum(entry.gpay))}</Row>
            <Row label="POS">{inr(toNum(entry.pos))}</Row>
            {entry.oilLines.length > 0 && (
              <Row label="Oil total">{inr(toNum(entry.oilTotal))}</Row>
            )}
            {entry.expenseLines.length > 0 && (
              <Row label="Expenses total">{inr(toNum(entry.expensesTotal))}</Row>
            )}
            {entry.creditLines.length > 0 && (
              <Row label="Credit total">{inr(toNum(entry.creditTotal))}</Row>
            )}
            <Divider />
            <Row label="Short / Excess" strong>
              <span
                className={
                  lbl === "SHORT"
                    ? "text-red-600 dark:text-red-400"
                    : lbl === "EXCESS"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-foreground"
                }
              >
                {lbl === "BALANCED" ? "Balanced" : `${lbl} ${inr(Math.abs(se))}`}
              </span>
            </Row>
          </dl>
        </section>
      </main>
    </div>
  );
}

function Row({
  label,
  children,
  strong,
}: {
  label: string;
  children: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className={"tabular-nums " + (strong ? "font-semibold text-foreground" : "text-foreground")}>
        {children}
      </dd>
    </div>
  );
}

function Divider() {
  return <div className="my-1 border-t border-border" />;
}

const FIELD_LABELS: Record<string, string> = {
  cashTotal: "Cash counted",
  shortExcess: "Short / Excess",
  fuelExpected: "Fuel expected",
  oilTotal: "Oil total",
  expensesTotal: "Expenses total",
  creditTotal: "Credit total",
  gpay: "GPay",
  pos: "POS",
  rate: "Rate",
  testLitres: "Test litres",
};
function fieldLabel(f: string): string {
  return FIELD_LABELS[f] ?? f;
}
