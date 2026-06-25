import { requireAdmin } from "@/lib/auth";
import TopBar from "@/components/TopBar";
import AdminNav from "@/components/AdminNav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAdmin();
  return (
    <div className="min-h-screen bg-bg">
      <TopBar name={user.name} subtitle="Admin" home="/admin" />
      <AdminNav />
      <main className="mx-auto max-w-4xl space-y-4 p-4">{children}</main>
    </div>
  );
}
