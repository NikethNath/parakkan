"use client";

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-lg border border-border px-4 py-1.5 text-sm font-medium text-foreground hover:bg-surface-2 print:hidden"
    >
      Print
    </button>
  );
}
