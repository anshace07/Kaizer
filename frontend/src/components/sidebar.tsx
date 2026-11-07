"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, ClipboardList, Gauge, LayoutDashboard, Mic, Settings, Users } from "lucide-react";

const LINKS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/report", label: "Report Incident", icon: Mic },
  { href: "/incidents", label: "Incidents", icon: ClipboardList },
  { href: "/handover", label: "Shift Handover", icon: Users },
  { href: "/machine-insights", label: "Machine Insights", icon: Gauge },
];

function NavLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: typeof Mic; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors ${
        active
          ? "bg-[#6d4ae8] text-white shadow-[0_6px_18px_-6px_rgb(109_74_232/0.8)]"
          : "text-slate-400 hover:bg-white/5 hover:text-white"
      }`}
    >
      <Icon className="size-[18px]" strokeWidth={2} />
      {label}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  // "/" must match exactly; other links also match their sub-pages (e.g. /incidents/INC-1001).
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <aside className="flex w-64 shrink-0 flex-col bg-[#1c1a2e] px-4 py-6">
      <Link href="/" className="mb-9 flex items-center gap-2.5 px-2">
        <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#8b6cf6] to-[#5b3bd4] shadow-lg shadow-violet-900/40">
          <Activity className="size-5 text-white" strokeWidth={2.5} />
        </span>
        <span className="text-lg font-semibold tracking-tight text-white">PlantPulse AI</span>
      </Link>

      <nav className="flex flex-col gap-1">
        {LINKS.map((link) => (
          <NavLink key={link.href} {...link} active={isActive(link.href)} />
        ))}
      </nav>

      <div className="mt-auto space-y-3">
        <NavLink href="/settings" label="Settings" icon={Settings} active={isActive("/settings")} />
        <p className="px-3.5 text-xs text-slate-500"></p>
      </div>
    </aside>
  );
}
