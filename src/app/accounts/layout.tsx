import { requireAccountant } from "@/lib/auth";
import TopBar from "@/components/TopBar";

// Read-only area for the ACCOUNTANT role: just the daily summary and its
// totals — no nav into the rest of the admin app.
export default async function AccountsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAccountant();
  return (
    <div className="min-h-screen bg-bg">
      <TopBar name={user.name} subtitle="Accounts" home="/accounts" />
      <main className="mx-auto max-w-4xl space-y-4 p-4">{children}</main>
    </div>
  );
}
