"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";

export default function TopBar({
  name,
  subtitle,
  home,
}: {
  name: string;
  subtitle?: string;
  home: string;
}) {
  const router = useRouter();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-surface px-4 py-3 print:hidden">
      <Link href={home} className="leading-tight">
        <p className="font-semibold text-foreground">Parakkan Petroleum</p>
        {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
      </Link>
      <div className="flex items-center gap-3">
        <span className="hidden text-sm text-muted sm:inline">{name}</span>
        <ThemeToggle />
        <button
          onClick={logout}
          className="rounded-md border border-border px-2.5 py-1 text-sm text-foreground transition hover:bg-surface-2"
        >
          Logout
        </button>
      </div>
    </header>
  );
}
