import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { toNum, isoDate, inr } from "@/lib/format";
import DailyEntryForm, { type DailyEntryInitial } from "@/components/DailyEntryForm";

export default async function AdminEntryDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isInteger(id)) notFound();

  const entry = await prisma.dailyEntry.findUnique({
    where: { id },
    include: {
      employee: { select: { name: true, username: true } },
      oilLines: true,
      expenseLines: true,
      creditLines: true,
      verifiedBy: { select: { name: true } },
      audits: {
        orderBy: { changedAt: "desc" },
        include: { changedBy: { select: { name: true } } },
      },
    },
  });
  if (!entry) notFound();

  const s = (v: unknown) => String(toNum(v));

  const initial: DailyEntryInitial = {
    form: {
      businessDate: isoDate(entry.businessDate),
      shift: entry.shift,
      product: entry.product,
      rate: s(entry.rate),
      n1Open: s(entry.n1Open),
      n1Close: s(entry.n1Close),
      n2Open: s(entry.n2Open),
      n2Close: s(entry.n2Close),
      testLitres: s(entry.testLitres),
      q2000: String(entry.q2000),
      q500: String(entry.q500),
      q200: String(entry.q200),
      q100: String(entry.q100),
      q50: String(entry.q50),
      q20: String(entry.q20),
      q10: String(entry.q10),
      q5: String(entry.q5),
      coins: s(entry.coins),
      gpay: s(entry.gpay),
      pos: s(entry.pos),
    },
    oil: entry.oilLines.map((l) => ({
      name: l.name,
      qty: s(l.qty),
      unitPrice: s(l.unitPrice),
    })),
    expenses: entry.expenseLines.map((l) => ({
      description: l.description,
      amount: s(l.amount),
    })),
    credit: entry.creditLines.map((l) => ({
      customer: l.customer,
      amount: s(l.amount),
    })),
    verified: entry.status === "VERIFIED",
  };

  return (
    <div className="pb-4">
      <Link href="/admin" className="text-sm text-sky-600 hover:underline">
        ← Back to dashboard
      </Link>

      <div className="mt-2 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-bold text-slate-800">
              {entry.employee.name}
            </h1>
            <p className="text-sm text-slate-500">
              {entry.businessDate.toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}{" "}
              · {entry.shift === "MORNING" ? "Morning" : "Evening"} · {entry.product}
            </p>
          </div>
          <span
            className={
              "rounded-full px-3 py-1 text-xs font-semibold " +
              (entry.status === "VERIFIED"
                ? "bg-emerald-50 text-emerald-700"
                : "bg-amber-50 text-amber-700")
            }
          >
            {entry.status === "VERIFIED"
              ? `Verified${entry.verifiedBy ? ` by ${entry.verifiedBy.name}` : ""}`
              : "Submitted"}
          </span>
        </div>
      </div>

      {entry.audits.length > 0 && (
        <div className="mt-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Edit history ({entry.audits.length})
          </h2>
          <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
            {entry.audits.map((a) => (
              <li key={a.id} className="flex justify-between gap-2 text-slate-600">
                <span>
                  <span className="font-medium text-slate-700">{a.field}</span>:{" "}
                  {a.oldValue} → {a.newValue}
                </span>
                <span className="whitespace-nowrap text-xs text-slate-400">
                  {a.changedBy.name} ·{" "}
                  {a.changedAt.toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                  })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-3 px-1 text-xs text-slate-500">
        Editing recomputes all totals and records each change below. Current
        short/excess: {inr(toNum(entry.shortExcess))}
      </p>

      <DailyEntryForm
        mode="edit"
        entryId={entry.id}
        initial={initial}
        redirectTo="/admin"
        admin
      />
    </div>
  );
}
