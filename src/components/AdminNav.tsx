"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/admin", label: "Submissions", exact: true },
  { href: "/admin/attendance", label: "Attendance", exact: true },
  { href: "/admin/attendance/edit", label: "Edit Att." },
  { href: "/admin/credit", label: "Credit" },
  { href: "/admin/expenses", label: "Expenses" },
  { href: "/admin/oil", label: "Oil" },
  { href: "/admin/reconcile", label: "Reconcile" },
  { href: "/admin/salary", label: "Salary" },
  { href: "/admin/staff", label: "Staff" },
  { href: "/admin/cris", label: "CRIS" },
];

export default function AdminNav() {
  const path = usePathname();
  return (
    <nav className="border-b border-border bg-surface print:hidden">
      <div className="no-scrollbar mx-auto flex max-w-4xl gap-1 overflow-x-auto px-4">
        {links.map((l) => {
          const active = l.exact ? path === l.href : path.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={
                "shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition " +
                (active
                  ? "border-accent text-accent"
                  : "border-transparent text-muted hover:text-foreground")
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
