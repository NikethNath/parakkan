"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * "Cash verified" toggle shown on a submission's own page (works in view-only
 * mode). Optimistic; PATCHes /api/entries/[id]/verify and reverts on failure.
 */
export default function CashVerifiedToggle({
  id,
  verified,
}: {
  id: number;
  verified: boolean;
}) {
  const router = useRouter();
  const [on, setOn] = useState(verified);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (busy) return;
    const next = !on;
    setOn(next);
    setBusy(true);
    try {
      const res = await fetch(`/api/entries/${id}/verify`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verified: next }),
      });
      if (!res.ok) {
        setOn(!next);
        return;
      }
      router.refresh();
    } catch {
      setOn(!next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={on}
      title={on ? "Cash verified — click to unmark" : "Mark this submission's cash as verified"}
      className={
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 " +
        (on
          ? "bg-emerald-500 text-white hover:bg-emerald-600"
          : "border border-border text-muted hover:border-accent hover:text-accent")
      }
    >
      <span aria-hidden>{on ? "✓" : "○"}</span>
      {on ? "Cash verified" : "Mark cash verified"}
    </button>
  );
}
