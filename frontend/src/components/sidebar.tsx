"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, ClipboardList, Gauge, LayoutDashboard, Mic, Users } from "lucide-react";

const LINKS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/report", label: "Report Incident", icon: Mic },
  { href: "/incidents", label: "Incidents", icon: ClipboardList },
  { href: "/handover", label: "Shift Handover", icon: Users },
  { href: "/performance", label: "AI Performance", icon: Gauge },
];

export function Sidebar() {
  const pathname = usePathname();

  // "/" must match exactly; other links also match their sub-pages (e.g. /incidents/INC-1001).
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <aside className="flex w-60 shrink-0 flex-col bg-[#1d1b2f] px-3 py-5 text-slate-300">
      <Link href="/" className="mb-8 flex items-center gap-2 px-3 text-lg font-semibold text-white">
        <Activity className="size-5 text-[#9b7bff]" />
        PlantPulse AI
      </Link>
      <nav className="flex flex-col gap-1">
        {LINKS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
              isActive(href) ? "bg-[#6d4ae8]/40 text-white" : "hover:bg-white/5 hover:text-white"
            }`}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        ))}
      </nav>
      <p className="mt-auto px-3 text-xs text-slate-500">All data is synthetic.</p>
    </aside>
  );
}
