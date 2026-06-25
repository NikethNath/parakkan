"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/attendance", label: "Attendance" },
  { href: "/admin/reconcile", label: "Reconcile" },
  { href: "/admin/salary", label: "Salary" },
  { href: "/admin/staff", label: "Staff" },
  { href: "/admin/cris", label: "CRIS" },
];

export default function AdminNav() {
  const path = usePathname();
  return (
    <nav className="border-b border-slate-200 bg-white px-4 print:hidden">
      <div className="mx-auto flex max-w-4xl gap-1">
        {links.map((l) => {
          const active =
            l.href === "/admin" ? path === "/admin" : path.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={
                "border-b-2 px-3 py-2 text-sm font-medium transition " +
                (active
                  ? "border-sky-600 text-sky-700"
                  : "border-transparent text-slate-500 hover:text-slate-700")
              }
            >
              {l.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
