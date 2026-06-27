"use client";

import { useRouter, usePathname } from "next/navigation";

/** Shift a YYYY-MM-DD string by whole days (UTC-safe). */
function shiftDay(date: string, days: number): string {
  const d = new Date(date + "T00:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Day picker for the classify pages (credit / expenses / oil). Navigates to
 * `?date=YYYY-MM-DD` on change; ‹ › step one day, "Today" jumps back to today.
 */
export default function DayFilter({ date, today }: { date: string; today: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const go = (d: string) => router.push(`${pathname}?date=${d}`);

  return (
    <section className="flex flex-wrap items-center gap-2 rounded-xl bg-surface p-3 shadow-soft ring-1 ring-border">
      <span className="text-sm font-medium text-foreground">Day</span>
      <button
        type="button"
        onClick={() => go(shiftDay(date, -1))}
        aria-label="Previous day"
        className="rounded-lg border border-border px-2.5 py-1 text-sm hover:bg-surface-2"
      >
        ‹
      </button>
      <input
        type="date"
        value={date}
        max={today}
        onChange={(e) => e.target.value && go(e.target.value)}
        className="rounded-lg border border-border px-3 py-1.5 text-sm"
      />
      <button
        type="button"
        onClick={() => go(shiftDay(date, 1))}
        aria-label="Next day"
        disabled={date >= today}
        className="rounded-lg border border-border px-2.5 py-1 text-sm hover:bg-surface-2 disabled:opacity-40"
      >
        ›
      </button>
      {date !== today && (
        <button
          type="button"
          onClick={() => go(today)}
          className="rounded-lg bg-accent px-3 py-1 text-sm font-medium text-white hover:bg-accent-strong"
        >
          Today
        </button>
      )}
    </section>
  );
}
