"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

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
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 print:hidden">
      <Link href={home} className="leading-tight">
        <p className="font-semibold text-slate-800">Parakkan Petroleum</p>
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      </Link>
      <div className="flex items-center gap-3">
        <span className="hidden text-sm text-slate-600 sm:inline">{name}</span>
        <button
          onClick={logout}
          className="rounded-md border border-slate-300 px-2.5 py-1 text-sm text-slate-700 transition hover:bg-slate-50"
        >
          Logout
        </button>
      </div>
    </header>
  );
}
