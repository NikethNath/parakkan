import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { toNum, isoDate, inr, istDateTime } from "@/lib/format";
import DailyEntryForm, { type DailyEntryInitial } from "@/components/DailyEntryForm";
import DeleteEntryButton from "@/components/DeleteEntryButton";

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
      <Link href="/admin" className="text-sm text-accent hover:underline">
        ← Back to dashboard
      </Link>

      <div className="mt-2 rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-bold text-foreground">
              {entry.employee.name}
            </h1>
            <p className="text-sm text-muted">
              {entry.businessDate.toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}{" "}
              · {entry.shift === "MORNING" ? "Morning" : "Evening"} · {entry.product}
            </p>
            <p className="mt-0.5 text-xs text-faint">
              Submitted {istDateTime(entry.submittedAt)} IST
              {entry.verifiedAt ? ` · verified ${istDateTime(entry.verifiedAt)} IST` : ""}
            </p>
          </div>
          <span
            className={
              "rounded-full px-3 py-1 text-xs font-semibold " +
              (entry.status === "VERIFIED"
                ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300")
            }
          >
            {entry.status === "VERIFIED"
              ? `Verified${entry.verifiedBy ? ` by ${entry.verifiedBy.name}` : ""}`
              : "Submitted"}
          </span>
        </div>
      </div>

      {entry.audits.length > 0 && (
        <div className="mt-3 rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
            Edit history ({entry.audits.length})
          </h2>
          <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
            {entry.audits.map((a) => (
              <li key={a.id} className="flex justify-between gap-2 text-muted">
                <span>
                  <span className="font-medium text-foreground">{a.field}</span>:{" "}
                  {a.oldValue} → {a.newValue}
                </span>
                <span className="whitespace-nowrap text-xs text-faint">
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

      <p className="mt-3 px-1 text-xs text-muted">
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

      <DeleteEntryButton
        entryId={entry.id}
        label={`${entry.employee.name} · ${entry.businessDate.toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })} · ${entry.shift === "MORNING" ? "Morning" : "Evening"} · ${entry.product}`}
      />
    </div>
  );
}
