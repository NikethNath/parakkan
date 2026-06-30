"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const STORE_KEY = "hpcl.adminNavQuery";

const links = [
  { href: "/admin", label: "Submissions", exact: true },
  { href: "/admin/summary", label: "Summary" },
  { href: "/admin/attendance", label: "Attendance", exact: true },
  { href: "/admin/attendance/edit", label: "Edit Att." },
  { href: "/admin/credit", label: "Credit" },
  { href: "/admin/expenses", label: "Expenses" },
  { href: "/admin/oil", label: "Oil" },
  { href: "/admin/meter", label: "Meter" },
  { href: "/admin/reconcile", label: "Reconcile" },
  { href: "/admin/dip", label: "Dip chart" },
  { href: "/admin/astm", label: "ASTM 3B" },
  { href: "/admin/staff", label: "Staff" },
  { href: "/admin/cris", label: "CRIS" },
];

export default function AdminNav() {
  const path = usePathname();
  const activeHref = links.find((l) =>
    l.exact ? path === l.href : path.startsWith(l.href),
  )?.href;

  // Remember each tab's last query (date range, month, day, …) so switching to
  // another tab and back keeps what you had set. Stored in localStorage because
  // the filter forms reload the page, which would otherwise wipe it.
  const [query, setQuery] = useState<Record<string, string>>({});
  useEffect(() => {
    let stored: Record<string, string> = {};
    try {
      stored = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
    } catch {}
    const current = window.location.search.replace(/^\?/, "");
    if (activeHref && current) stored[activeHref] = current;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(stored));
    } catch {}
    setQuery(stored);
  }, [path, activeHref]);

  return (
    <nav className="border-b border-border bg-surface print:hidden">
      <div className="no-scrollbar mx-auto flex max-w-4xl gap-1 overflow-x-auto px-4">
        {links.map((l) => {
          const active = l.exact ? path === l.href : path.startsWith(l.href);
          const href = query[l.href] ? `${l.href}?${query[l.href]}` : l.href;
          return (
            <Link
              key={l.href}
              href={href}
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
