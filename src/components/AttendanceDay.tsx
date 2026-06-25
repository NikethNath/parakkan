"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Status = "PRESENT" | "ABSENT" | "LEAVE" | null;
type Row = { employeeId: number; name: string; morning: Status; evening: Status };

const OPTIONS = [
  { value: "PRESENT", label: "Present" },
  { value: "ABSENT", label: "Absent" },
  { value: "LEAVE", label: "Leave" },
  { value: "CLEAR", label: "— not marked —" },
] as const;

export default function AttendanceDay({ date, rows }: { date: string; rows: Row[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function set(employeeId: number, shift: "MORNING" | "EVENING", value: string) {
    setBusy(`${employeeId}-${shift}`);
    try {
      await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, date, shift, status: value }),
      });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="overflow-x-auto">
    <table className="w-full min-w-[20rem] text-sm">
      <thead className="text-left text-muted">
        <tr>
          <th className="px-2 py-1.5 font-medium">Employee</th>
          <th className="px-2 py-1.5 font-medium">Morning</th>
          <th className="px-2 py-1.5 font-medium">Evening</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.employeeId} className="border-t border-border">
            <td className="px-2 py-1.5 font-medium text-foreground">{r.name}</td>
            <td className="px-2 py-1.5">
              <Cell
                value={r.morning}
                disabled={busy === `${r.employeeId}-MORNING`}
                onChange={(v) => set(r.employeeId, "MORNING", v)}
              />
            </td>
            <td className="px-2 py-1.5">
              <Cell
                value={r.evening}
                disabled={busy === `${r.employeeId}-EVENING`}
                onChange={(v) => set(r.employeeId, "EVENING", v)}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}

function Cell({
  value,
  disabled,
  onChange,
}: {
  value: Status;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  const tone =
    value === "PRESENT"
      ? "text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/10"
      : value === "ABSENT"
        ? "text-red-700 dark:text-red-300 border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-500/10"
        : value === "LEAVE"
          ? "text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10"
          : "text-muted border-border";
  return (
    <select
      value={value ?? "CLEAR"}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={"rounded-md border px-2 py-1 text-sm disabled:opacity-50 " + tone}
    >
      {OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
