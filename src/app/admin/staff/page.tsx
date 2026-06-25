import { prisma } from "@/lib/db";
import { toNum } from "@/lib/format";
import StaffManager, { type Staff } from "@/components/StaffManager";

export default async function StaffPage() {
  const users = await prisma.user.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
  const staff: Staff[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    username: u.username,
    role: u.role,
    payType: u.payType,
    shiftRate: toNum(u.shiftRate),
    monthlySalary: toNum(u.monthlySalary),
    extraPay: toNum(u.extraPay),
    phone: u.phone,
    active: u.active,
  }));
  return <StaffManager initialStaff={staff} />;
}
