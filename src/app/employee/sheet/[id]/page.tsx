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
    <div className="min-h-screen bg-slate-100">
      <TopBar name={user.name} subtitle="My sheet" home="/employee" />
      <main className="mx-auto max-w-2xl space-y-4 p-4">
        <Link href="/employee" className="text-sm text-sky-600 hover:underline">
          ← Back
        </Link>

        <header className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-slate-800">
                {entry.businessDate.toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}{" "}
                · {entry.shift === "MORNING" ? "Morning" : "Evening"} · {entry.product}
              </p>
              <p className="text-xs text-slate-500">Rate {inr(toNum(entry.rate))}/L</p>
            </div>
            <span
              className={
                "rounded-full px-3 py-1 text-xs font-semibold " +
                (lbl === "SHORT"
                  ? "bg-red-50 text-red-700"
                  : lbl === "EXCESS"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-slate-100 text-slate-600")
              }
            >
              {lbl === "BALANCED" ? "Balanced" : `${lbl} ${inr(Math.abs(se))}`}
            </span>
          </div>
        </header>

        {/* Transparency: any admin edits to this sheet */}
        {entry.audits.length > 0 ? (
          <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <h2 className="mb-1 text-sm font-semibold text-amber-800">
              This sheet was edited by the admin after you submitted it
            </h2>
            <p className="mb-2 text-xs text-amber-700">
              Every change is shown below (original → new value) for your records.
            </p>
            <ul className="space-y-1 text-sm text-amber-900">
              {entry.audits.map((a) => (
                <li key={a.id} className="flex flex-wrap justify-between gap-2">
                  <span>
                    <span className="font-medium">{fieldLabel(a.field)}</span>:{" "}
                    {a.oldValue} → {a.newValue}
                  </span>
                  <span className="text-xs text-amber-600">
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
          <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            No changes — exactly as you submitted.
          </section>
        )}

        <section className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
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
                    ? "text-red-600"
                    : lbl === "EXCESS"
                      ? "text-emerald-600"
                      : "text-slate-700"
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
      <dt className="text-slate-500">{label}</dt>
      <dd className={"tabular-nums " + (strong ? "font-semibold text-slate-800" : "text-slate-700")}>
        {children}
      </dd>
    </div>
  );
}

function Divider() {
  return <div className="my-1 border-t border-slate-100" />;
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
