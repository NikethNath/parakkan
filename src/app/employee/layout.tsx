import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

// Accountants are read-only — keep them out of the data-entry area (each page
// renders its own TopBar, so this layout only guards).
export default async function EmployeeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  if (user.role === "ACCOUNTANT") redirect("/accounts");
  return <>{children}</>;
}
