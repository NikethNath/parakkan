"use client";

import { useState } from "react";
import { inr } from "@/lib/format";
import type { DuDay, DuGroup } from "@/lib/duCheck";

const dayLabel = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" });

const shiftLabel = { MORNING: "Morning", EVENING: "Evening" } as const;

const isProblem = (g: DuGroup) => g.status !== "ok" && g.status !== "no-report";

function Delta({ g }: { g: DuGroup }) {
  if (g.status === "no-report") return <span className="text-faint">—</span>;
  if (g.status === "ok") return <span className="text-emerald-600 dark:text-emerald-400">✓</span>;
  const sign = g.delta > 0 ? "+" : "−";
  return (
    <span className={g.status === "untied" ? "text-amber-700 dark:text-amber-300" : "text-red-600 dark:text-red-400"}>
      {sign}
      {inr(Math.abs(g.delta))}
    </span>
  );
}

/** Why a row is flagged, in one line — or what might explain it. */
function Note({ g, day }: { g: DuGroup; day: DuDay }) {
  const lines: string[] = [];
  if (g.status === "no-report") lines.push("No Paytm report for this day yet.");
  if (g.status === "short")
    lines.push(
      g.staff.length === 0
        ? "This QR took money but no sheet's readings were on this DU."
        : `Staff wrote ${inr(-g.delta)} less GPay than this QR took.`,
    );
  if (g.status === "over") lines.push(`Staff wrote ${inr(g.delta)} more GPay than this QR took.`);
  if (g.status === "untied") {
    const untied = day.phonepe + day.otherQr.reduce((n, q) => n + q.amount, 0);
    lines.push(
      `Staff wrote ${inr(g.delta)} more — ${inr(untied)} came in that day on ${
        day.phonepe > 0 ? "the old PhonePe QR" : "another QR"
      }, which may be it.`,
    );
  }
  if (g.mirror) lines.push(`${g.dus.join(" + ")} and ${g.mirror} are off by the same amount the opposite way — likely written on the wrong DU's sheet.`);
  for (const u of g.sameShift)
    lines.push(
      `${u.names.join(" and ")} both filed ${shiftLabel[u.shift].toLowerCase()} sheets on the same ${u.du} nozzle — if one was really the ${
        u.shift === "MORNING" ? "evening" : "morning"
      }, correct its shift.`,
    );
  if (g.unbound) lines.push("A nozzle on these sheets isn't bound to a DU, so some of this GPay may belong elsewhere.");
  if (lines.length === 0) return null;
  return (
    <div className="mt-0.5 space-y-0.5 text-[11px] leading-snug text-muted" data-testid="du-note">
      {lines.map((l) => (
        <div key={l}>{l}</div>
      ))}
    </div>
  );
}

/**
 * GPay per DU per day: the staff who worked a DU — placed there by their
 * nozzle readings — against that DU's Paytm QR. See src/lib/duCheck.ts.
 */
export default function DuCheck({ days }: { days: DuDay[] }) {
  const [onlyProblems, setOnlyProblems] = useState(false);
  const all = days.filter((d) => d.groups.length > 0 || d.unplaced.length > 0);
  const problems = all.reduce((n, d) => n + d.groups.filter(isProblem).length, 0);
  const shown = onlyProblems
    ? all
        .map((d) => ({ ...d, groups: d.groups.filter(isProblem) }))
        .filter((d) => d.groups.length > 0 || d.unplaced.length > 0)
    : all;

  if (all.length === 0) {
    return <p className="py-4 text-center text-sm text-faint">Nothing to check this month yet.</p>;
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
        <span
          className={problems ? "font-medium text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-300"}
          data-testid="du-summary"
        >
          {problems === 0
            ? "Every DU matches its QR."
            : `${problems} DU ${problems === 1 ? "day doesn't" : "days don't"} match.`}
        </span>
        <label className="inline-flex items-center gap-1.5 text-muted">
          <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} />
          Only mismatches
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" data-testid="du-check">
          <thead className="text-left text-muted">
            <tr>
              <th className="px-2 py-1.5 font-medium">Date</th>
              <th className="px-2 py-1.5 font-medium">DU</th>
              <th className="px-2 py-1.5 font-medium">Staff GPay</th>
              <th className="px-2 py-1.5 text-right font-medium">Staff total</th>
              <th className="px-2 py-1.5 text-right font-medium">Paytm QR</th>
              <th className="px-2 py-1.5 text-right font-medium">Δ</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((day) => (
              <DayRows key={day.date} day={day} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-faint">
        Δ = staff − Paytm QR, for the morning and evening together. Staff are placed on a DU by
        their sheet&apos;s nozzle readings; someone who worked two DUs joins them into one row.
        When a day&apos;s total GPay matches the Paytm report, its DUs aren&apos;t flagged even if
        they differ from each other. Card swipes aren&apos;t split by DU — they&apos;re checked for
        the whole day above.
      </p>
    </div>
  );
}

function DayRows({ day }: { day: DuDay }) {
  const rows = day.groups.length + (day.unplaced.length > 0 ? 1 : 0);
  return (
    <>
      {day.groups.map((g, i) => (
        <tr
          key={g.dus.join("+")}
          data-date={day.date}
          data-du={g.dus.join("+")}
          data-status={g.status}
          className={
            (i === 0 ? "border-t border-border " : "") +
            (isProblem(g) ? (g.status === "untied" ? "bg-amber-50 dark:bg-amber-500/10" : "bg-red-50 dark:bg-red-500/10") : "")
          }
        >
          {i === 0 && (
            <td className="px-2 py-1.5 align-top" rowSpan={rows}>
              {dayLabel(day.date)}
            </td>
          )}
          <td className="px-2 py-1.5 align-top font-semibold text-foreground">{g.dus.join(" + ")}</td>
          <td className="px-2 py-1.5 align-top">
            {g.staff.length === 0 ? (
              <span className="text-faint">No sheet on this DU</span>
            ) : (
              g.staff.map((s) => (
                <div key={`${s.staffId}|${s.shift}`} className="whitespace-nowrap">
                  <span className="text-muted">{shiftLabel[s.shift]} ·</span> {s.by}{" "}
                  <span className="tabular-nums text-muted">{inr(s.gpay)}</span>
                </div>
              ))
            )}
            <Note g={g} day={day} />
          </td>
          <td className="px-2 py-1.5 text-right align-top tabular-nums">{inr(g.staffGpay)}</td>
          <td className="px-2 py-1.5 text-right align-top tabular-nums text-muted">
            {day.hasReport ? inr(g.paytm) : "—"}
          </td>
          <td className="px-2 py-1.5 text-right align-top font-medium tabular-nums" data-testid="du-delta">
            <Delta g={g} />
          </td>
        </tr>
      ))}
      {day.unplaced.length > 0 && (
        <tr className={day.groups.length === 0 ? "border-t border-border" : ""} data-date={day.date}>
          {day.groups.length === 0 && (
            <td className="px-2 py-1.5 align-top">{dayLabel(day.date)}</td>
          )}
          <td colSpan={5} className="px-2 py-1.5 text-xs text-amber-700 dark:text-amber-300" data-testid="du-unplaced">
            Not on any DU:{" "}
            {day.unplaced.map((s) => `${s.by} (${shiftLabel[s.shift].toLowerCase()}, ${inr(s.gpay)} GPay)`).join(", ")} —
            their readings match no bound nozzle. Check the DU setup below.
          </td>
        </tr>
      )}
    </>
  );
}
