import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import TopBar from "@/components/TopBar";
import DailyEntryForm from "@/components/DailyEntryForm";

export default async function NewEntryPage() {
  const user = await requireUser();
  // A sheet always belongs to whoever is signed in — short employee sessions
  // (2h) are what keep that honest, so there's no "whose shift is this?" step.
  // This list is only for picking a partner, so it excludes the filer.
  const employees = await prisma.user.findMany({
    where: { role: "EMPLOYEE", active: true, archivedAt: null, id: { not: user.uid } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return (
    <div className="min-h-screen bg-bg">
      <TopBar name={user.name} subtitle="New daily sheet" home="/employee" />
      <DailyEntryForm employees={employees} />
    </div>
  );
}
