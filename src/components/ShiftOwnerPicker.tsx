"use client";

import { useState } from "react";

/**
 * Step 1 of a new sheet: whose shift is being written up. Staff who aren't
 * comfortable with a phone have a colleague fill it in for them, so the owner
 * is chosen deliberately here instead of being assumed from the login — that
 * assumption is what put sheets in the wrong person's name.
 *
 * Plain GET form: submitting lands on /employee/entry?for=<id>, which renders
 * the sheet itself. Continue stays disabled until a name is picked.
 */
export default function ShiftOwnerPicker({
  me,
  employees,
}: {
  me?: { id: number; name: string };
  employees: { id: number; name: string }[];
}) {
  const [value, setValue] = useState("");
  const others = employees.filter((e) => e.id !== me?.id);

  return (
    <form
      method="get"
      action="/employee/entry"
      className="mx-auto max-w-2xl space-y-4 p-4"
    >
      <section className="rounded-xl bg-surface p-5 shadow-soft ring-1 ring-border">
        <h1 className="text-lg font-bold text-foreground">Whose shift is this?</h1>
        <p className="mt-1 text-sm text-muted">
          Pick the person who actually worked the shift. Filling it in for a colleague?
          Choose <strong>their</strong> name — the sheet, its short/excess and attendance
          go to them, and your name is saved as the person who typed it.
        </p>

        <label className="mt-4 block">
          <span className="mb-1 block text-sm font-medium text-foreground">Staff member</span>
          <select
            name="for"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            required
            autoFocus
            className="w-full rounded-lg border border-border px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
          >
            <option value="">—</option>
            {me && <option value={me.id}>Me ({me.name})</option>}
            {others.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          disabled={!value}
          className="mt-4 w-full rounded-lg bg-accent px-4 py-3 text-base font-semibold text-white transition hover:bg-accent-strong disabled:opacity-50"
        >
          Continue
        </button>
        {!value && (
          <p className="mt-2 text-center text-xs text-faint">
            Select a name to continue.
          </p>
        )}
      </section>
    </form>
  );
}
