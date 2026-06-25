import { PrismaClient, type Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminUsername = process.env.ADMIN_USERNAME ?? "admin";
  const adminPassword = process.env.ADMIN_PASSWORD ?? "changeme123";

  await prisma.user.upsert({
    where: { username: adminUsername },
    update: {},
    create: {
      name: "Administrator",
      username: adminUsername,
      passwordHash: await bcrypt.hash(adminPassword, 10),
      role: "ADMIN",
    },
  });

  // Sample staff are only seeded outside production so a real deployment starts
  // with just the admin account.
  if (process.env.NODE_ENV === "production") {
    console.log(`✓ Seeded admin "${adminUsername}" (production — no sample staff)`);
    return;
  }

  const employees: Array<Omit<Prisma.UserCreateInput, "passwordHash">> = [
    {
      name: "Rajesh Kumar",
      username: "rajesh",
      role: "EMPLOYEE",
      payType: "MONTHLY",
      monthlySalary: 15000,
    },
    {
      name: "Suresh Babu",
      username: "suresh",
      role: "EMPLOYEE",
      payType: "PER_SHIFT",
      shiftRate: 450,
    },
  ];

  for (const e of employees) {
    await prisma.user.upsert({
      where: { username: e.username },
      update: {},
      create: { ...e, passwordHash: await bcrypt.hash("staff123", 10) },
    });
  }

  console.log(
    `✓ Seeded admin "${adminUsername}" + ${employees.length} sample employees (staff password: staff123)`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
