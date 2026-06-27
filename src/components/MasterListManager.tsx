"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type MasterItem = {
  id: number;
  name: string;
  phone?: string | null;
  notes?: string | null;
  active: boolean;
  count: number; // how many staff lines are classified under it
  flag?: boolean; // optional per-row boolean (e.g. "is salary advance")
};

/**
 * Admin manager for a master list (creditors or expense buckets): add new
 * entries and deactivate/reactivate existing ones. `withContact` adds optional
 * phone + notes fields (used for creditors).
 */
export default function MasterListManager({
  title,
  endpoint,
  items,
  withContact = false,
  noun = "entry",
  flagField,
  flagLabel,
}: {
  title: string;
  endpoint: string;
  items: MasterItem[];
  withContact?: boolean;
  noun?: string;
  flagField?: string;
  flagLabel?: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          withContact ? { name, phone, notes } : { name },
        ),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(d.error ?? "Could not add");
        return;
      }
      setName("");
      setPhone("");
      setNotes("");
      router.refresh();
    } catch {
      setErr("Network error");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(item: MasterItem) {
    const res = await fetch(`${endpoint}/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !item.active }),
    });
    if (res.ok) router.refresh();
  }

  async function toggleFlag(item: MasterItem) {
    if (!flagField) return;
    const res = await fetch(`${endpoint}/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [flagField]: !item.flag }),
    });
    if (res.ok) router.refresh();
  }

  return (
    <section className="rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-foreground">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder={`New ${noun}…`}
            className="rounded-lg border border-border px-3 py-1.5 text-sm"
          />
        </label>
        {withContact && (
          <>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-foreground">Phone (optional)</span>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="rounded-lg border border-border px-3 py-1.5 text-sm"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-foreground">Notes (optional)</span>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="rounded-lg border border-border px-3 py-1.5 text-sm"
              />
            </label>
          </>
        )}
        <button
          onClick={add}
          disabled={busy || !name.trim()}
          className="rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-60"
        >
          {busy ? "Adding…" : "Add"}
        </button>
      </div>
      {err && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{err}</p>}

      {items.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted">
              <tr>
                <th className="px-2 py-1.5 font-medium">Name</th>
                {withContact && <th className="px-2 py-1.5 font-medium">Phone</th>}
                <th className="px-2 py-1.5 text-right font-medium">Entries</th>
                {flagLabel && <th className="px-2 py-1.5 text-center font-medium">{flagLabel}</th>}
                <th className="px-2 py-1.5 font-medium">Status</th>
                <th className="px-2 py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className={"border-t border-border " + (it.active ? "" : "opacity-50")}>
                  <td className="px-2 py-1.5 font-medium text-foreground">
                    {it.name}
                    {it.notes ? <span className="ml-2 text-xs text-faint">{it.notes}</span> : null}
                  </td>
                  {withContact && <td className="px-2 py-1.5 text-muted">{it.phone || "—"}</td>}
                  <td className="px-2 py-1.5 text-right tabular-nums text-muted">{it.count}</td>
                  {flagField && (
                    <td className="px-2 py-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => toggleFlag(it)}
                        className={
                          "rounded-full px-2.5 py-0.5 text-xs font-medium " +
                          (it.flag
                            ? "bg-accent/15 text-accent"
                            : "bg-surface-2 text-muted hover:text-foreground")
                        }
                      >
                        {it.flag ? "✓ Yes" : "Mark"}
                      </button>
                    </td>
                  )}
                  <td className="px-2 py-1.5">
                    {it.active ? (
                      <span className="text-emerald-600 dark:text-emerald-400">Active</span>
                    ) : (
                      <span className="text-faint">Hidden</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <button
                      onClick={() => toggle(it)}
                      className="font-medium text-muted hover:underline"
                    >
                      {it.active ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
