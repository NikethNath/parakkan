import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import TopBar from "@/components/TopBar";
import DailyEntryForm from "@/components/DailyEntryForm";

export default async function NewEntryPage() {
  const user = await requireUser();
  const employees = await prisma.user.findMany({
    where: { role: "EMPLOYEE", active: true, id: { not: user.uid } },
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
