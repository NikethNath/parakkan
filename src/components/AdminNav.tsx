"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const STORE_KEY = "hpcl.adminNavQuery";

type Leaf = { href: string; label: string; exact?: boolean };
type Group = { label: string; children: Leaf[] };
type Item = Leaf | Group;
const isGroup = (i: Item): i is Group => "children" in i;

const items: Item[] = [
  { href: "/admin", label: "Submissions", exact: true },
  { href: "/admin/reconcile", label: "GPay/POS" },
  { href: "/admin/cris", label: "CRIS" },
  { href: "/admin/credit", label: "Credit" },
  { href: "/admin/expenses", label: "Expenses" },
  { href: "/admin/salary", label: "Salary" },
  { href: "/admin/oil", label: "Oil" },
  { href: "/admin/summary", label: "Summary" },
  { href: "/admin/shortexcess", label: "Short/Excess" },
  {
    label: "DSR",
    children: [
      { href: "/admin/meter", label: "Meter" },
      { href: "/admin/dip", label: "Dip chart" },
      { href: "/admin/astm", label: "ASTM 3B" },
    ],
  },
  {
    label: "Attendance",
    children: [
      { href: "/admin/attendance", label: "View", exact: true },
      { href: "/admin/attendance/edit", label: "Edit" },
    ],
  },
  { href: "/admin/staff", label: "Staff" },
];

const allLeaves: Leaf[] = items.flatMap((i) => (isGroup(i) ? i.children : [i]));
const matches = (l: Leaf, path: string) =>
  l.exact ? path === l.href : path.startsWith(l.href);

export default function AdminNav() {
  const path = usePathname();
  const activeHref = allLeaves.find((l) => matches(l, path))?.href;

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

  // Open dropdown (by group label) + where to anchor its fixed-position menu
  // (fixed so the bar's horizontal scroll can't clip it).
  const [menu, setMenu] = useState<{ label: string; x: number; y: number } | null>(null);
  useEffect(() => setMenu(null), [path]); // close on navigation

  const linkHref = (href: string) => (query[href] ? `${href}?${query[href]}` : href);
  const tabCls = (active: boolean) =>
    "shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition " +
    (active
      ? "border-accent text-accent"
      : "border-transparent text-muted hover:text-foreground");

  const openGroup =
    menu && (items.find((i) => isGroup(i) && i.label === menu.label) as Group | undefined);

  return (
    <nav className="border-b border-border bg-surface print:hidden">
      <div className="no-scrollbar mx-auto flex max-w-4xl gap-1 overflow-x-auto px-4">
        {items.map((item) => {
          if (!isGroup(item)) {
            return (
              <Link key={item.href} href={linkHref(item.href)} className={tabCls(matches(item, path))}>
                {item.label}
              </Link>
            );
          }
          const active = item.children.some((c) => matches(c, path));
          const isOpen = menu?.label === item.label;
          return (
            <button
              key={item.label}
              type="button"
              onClick={(e) => {
                if (isOpen) return setMenu(null);
                const r = e.currentTarget.getBoundingClientRect();
                const x = Math.max(8, Math.min(r.left, window.innerWidth - 176));
                setMenu({ label: item.label, x, y: r.bottom });
              }}
              className={tabCls(active) + " inline-flex items-center gap-1"}
            >
              {item.label}
              <span className={"text-[0.6rem] leading-none transition " + (isOpen ? "rotate-180" : "")}>
                ▾
              </span>
            </button>
          );
        })}
      </div>

      {menu && openGroup && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setMenu(null)} />
          <div
            className="fixed z-30 min-w-[10rem] rounded-lg border border-border bg-surface p-1 shadow-soft"
            style={{ left: menu.x, top: menu.y }}
          >
            {openGroup.children.map((c) => (
              <Link
                key={c.href}
                href={linkHref(c.href)}
                onClick={() => setMenu(null)}
                className={
                  "block rounded-md px-3 py-2 text-sm font-medium transition " +
                  (matches(c, path)
                    ? "bg-surface-2 text-accent"
                    : "text-foreground hover:bg-surface-2")
                }
              >
                {c.label}
              </Link>
            ))}
          </div>
        </>
      )}
    </nav>
  );
}
