import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import TopBar from "@/components/TopBar";
import DailyEntryForm from "@/components/DailyEntryForm";
import ShiftOwnerPicker from "@/components/ShiftOwnerPicker";

/**
 * A new sheet is two steps: first "Whose shift is this?" (no ?for=), then the
 * sheet itself for the chosen person (?for=<employeeId>).
 */
export default async function NewEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ for?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;

  // Everyone active, including the person filing: they may be filing on a
  // colleague's behalf, in which case they themselves can be the partner.
  const employees = await prisma.user.findMany({
    where: { role: "EMPLOYEE", active: true, archivedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const me = employees.find((e) => e.id === user.uid);

  const forId = Number(sp.for);
  const owner = Number.isInteger(forId) ? employees.find((e) => e.id === forId) : undefined;

  if (!owner) {
    return (
      <div className="min-h-screen bg-bg">
        <TopBar name={user.name} subtitle="New daily sheet" home="/employee" />
        <ShiftOwnerPicker me={me} employees={employees} />
      </div>
    );
  }

  const onBehalf = owner.id !== user.uid;
  return (
    <div className="min-h-screen bg-bg">
      <TopBar name={user.name} subtitle="New daily sheet" home="/employee" />
      <div className="mx-auto max-w-2xl px-4 pt-4">
        <div
          className={
            "flex flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm ring-1 " +
            (onBehalf
              ? "bg-amber-50 text-amber-800 ring-amber-300 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/30"
              : "bg-surface text-foreground ring-border")
          }
        >
          <span>
            {onBehalf ? "✍ Filling in for " : "Sheet for "}
            <strong>{owner.name}</strong>
            {onBehalf && " — the short/excess and attendance go to them"}
          </span>
          <Link href="/employee/entry" className="font-medium text-accent hover:underline">
            Change
          </Link>
        </div>
      </div>
      <DailyEntryForm employees={employees} ownerId={owner.id} />
    </div>
  );
}
