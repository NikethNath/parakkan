// Client-side "tab memory": AdminNav records each admin tab's last query string
// (date range, month, day, …) in localStorage under this key, keyed by the tab's
// href. Anything that navigates back to a tab (nav links, "back to dashboard",
// post-save redirects) can re-attach the remembered filters via withStoredQuery.
export const ADMIN_NAV_QUERY_KEY = "hpcl.adminNavQuery";

/** "/admin" → "/admin?from=…&to=…" when a query is remembered for that tab. */
export function withStoredQuery(href: string): string {
  if (typeof window === "undefined") return href;
  try {
    const stored = JSON.parse(
      localStorage.getItem(ADMIN_NAV_QUERY_KEY) || "{}",
    ) as Record<string, string>;
    const q = stored[href];
    return q ? `${href}?${q}` : href;
  } catch {
    return href;
  }
}
