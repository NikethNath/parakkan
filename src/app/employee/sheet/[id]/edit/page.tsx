import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { toNum, isoDate } from "@/lib/format";
import TopBar from "@/components/TopBar";
import DailyEntryForm, { type DailyEntryInitial } from "@/components/DailyEntryForm";

export default async function EmployeeEditSheet({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isInteger(id)) notFound();

  // An employee can only open their OWN sheet.
  const entry = await prisma.dailyEntry.findFirst({
    where: { id, employeeId: user.uid },
    include: { oilLines: true, expenseLines: true, salaryLines: true, creditLines: true },
  });
  if (!entry) notFound();
  // Once the admin verifies a sheet the employee can no longer change it.
  if (entry.status === "VERIFIED") redirect(`/employee/sheet/${id}`);

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
    oil: entry.oilLines.map((l) => ({ name: l.name, amount: s(l.amount) })),
    expenses: entry.expenseLines.map((l) => ({ description: l.description, amount: s(l.amount) })),
    salary: entry.salaryLines.map((l) => ({ description: l.description, amount: s(l.amount) })),
    credit: entry.creditLines.map((l) => ({ customer: l.customer, amount: s(l.amount) })),
  };

  return (
    <div className="min-h-screen bg-bg">
      <TopBar name={user.name} subtitle="Edit sheet" home="/employee" />
      <DailyEntryForm
        mode="edit"
        entryId={entry.id}
        initial={initial}
        admin={false}
        redirectTo={`/employee/sheet/${id}`}
      />
    </div>
  );
}
