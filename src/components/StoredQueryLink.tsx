"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { withStoredQuery } from "@/lib/adminNavQuery";

/**
 * A Link that re-attaches the tab's remembered query string (see AdminNav's tab
 * memory) — so "← Back to dashboard" returns to the date range the admin had
 * set, not a blank dashboard. The href is upgraded after mount to keep the
 * server-rendered HTML hydration-safe.
 */
export default function StoredQueryLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const [target, setTarget] = useState(href);
  useEffect(() => setTarget(withStoredQuery(href)), [href]);
  return (
    <Link href={target} className={className}>
      {children}
    </Link>
  );
}
