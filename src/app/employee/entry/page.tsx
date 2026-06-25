import { requireUser } from "@/lib/auth";
import TopBar from "@/components/TopBar";
import DailyEntryForm from "@/components/DailyEntryForm";

export default async function NewEntryPage() {
  const user = await requireUser();
  return (
    <div className="min-h-screen bg-bg">
      <TopBar name={user.name} subtitle="New daily sheet" home="/employee" />
      <DailyEntryForm />
    </div>
  );
}
