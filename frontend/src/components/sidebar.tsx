"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Orbitron } from "next/font/google";
import {
  Activity,
  ChartLine,
  ClipboardList,
  Gauge,
  LayoutDashboard,
  Mic,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

const orbitron = Orbitron({
  subsets: ["latin"],
  weight: ["700"],
});

const LINKS: {
  href: string;
  label: string;
  icon: LucideIcon;
}[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/report", label: "Report Incident", icon: Mic },
  { href: "/incidents", label: "Incidents", icon: ClipboardList },
  { href: "/handover", label: "Shift Handover", icon: Users },
  { href: "/machine-insights", label: "Machine Insights", icon: Gauge },
  { href: "/performance", label: "AI Performance", icon: ChartLine },
  { href: "/settings", label: "Settings", icon: Settings },
];

function NavLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors ${
        active
          ? "bg-[#6d4ae8] text-white shadow-[0_6px_18px_-6px_rgb(109_74_232/0.8)]"
          : "text-slate-400 hover:bg-white/5 hover:text-white"
      }`}
    >
      <Icon className="size-[18px] shrink-0" strokeWidth={2} />
      <span>{label}</span>
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <aside className="flex w-full shrink-0 flex-col bg-[#1c1a2e] px-4 py-4 lg:min-h-screen lg:w-64 lg:px-4 lg:py-6">
      {/* Logo */}
      <Link
        href="/"
        className="mb-4 flex items-center gap-2.5 px-2 lg:mb-9"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#8b6cf6] to-[#5b3bd4] shadow-lg shadow-violet-900/40">
          <Activity
            className="size-5 text-white"
            strokeWidth={2.5}
          />
        </span>

        <span
          className={`${orbitron.className} text-lg font-bold tracking-[3px] text-white`}
        >
          KAIZER
        </span>
      </Link>

      {/* Navigation */}
      <nav className="flex w-full gap-1 overflow-x-auto pb-1 lg:flex-1 lg:flex-col lg:gap-1 lg:overflow-x-visible lg:overflow-y-auto lg:pb-0">
        {LINKS.map((link) => (
          <NavLink
            key={link.href}
            {...link}
            active={isActive(link.href)}
          />
        ))}
      </nav>
    </aside>
  );
}