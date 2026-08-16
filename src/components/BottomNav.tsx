"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Plus, History, Trophy, Users, type LucideIcon } from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const LEFT_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/history", label: "History", icon: History },
];

const RIGHT_ITEMS: NavItem[] = [
  { href: "/leaderboard", label: "Board", icon: Trophy },
  { href: "/friends", label: "Friends", icon: Users },
];

const ALL_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/history", label: "History", icon: History },
  { href: "/leaderboard", label: "Board", icon: Trophy },
  { href: "/friends", label: "Friends", icon: Users },
];

export function BottomNav() {
  const pathname = usePathname();

  function renderItem({ href, label, icon: Icon }: NavItem) {
    const active = pathname === href;
    return (
      <Link
        key={href}
        href={href}
        className="flex flex-1 flex-col items-center gap-1 py-1.5"
      >
        <Icon
          size={22}
          strokeWidth={active ? 2.4 : 1.8}
          className={active ? "text-accent" : "text-muted"}
        />
        <span
          className={`text-[11px] ${
            active ? "font-medium text-accent" : "text-muted"
          }`}
        >
          {label}
        </span>
      </Link>
    );
  }

  function renderSidebarItem({ href, label, icon: Icon }: NavItem) {
    const active = pathname === href;
    return (
      <Link
        key={href}
        href={href}
        className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm transition ${
          active
            ? "bg-accent/10 font-medium text-accent"
            : "text-muted hover:bg-surface-2"
        }`}
      >
        <Icon size={19} strokeWidth={active ? 2.4 : 1.8} />
        {label}
      </Link>
    );
  }

  return (
    <>
      {/* Mobile: fixed bottom bar with a floating center FAB. */}
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/80 backdrop-blur-lg pb-[calc(env(safe-area-inset-bottom)+14px)] md:hidden">
        <div className="relative mx-auto flex max-w-md items-center px-4 pt-2.5">
          {LEFT_ITEMS.map(renderItem)}
          <div className="w-16 shrink-0" />
          {RIGHT_ITEMS.map(renderItem)}

          <Link
            href="/log"
            aria-label="Log activity"
            className={`absolute left-1/2 -top-6 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full bg-gradient-to-br from-accent-2 to-accent text-white shadow-lg shadow-accent/30 transition active:scale-95 ${
              pathname === "/log" ? "ring-4 ring-accent/25" : ""
            }`}
          >
            <Plus size={26} strokeWidth={2.4} />
          </Link>
        </div>
      </nav>

      {/* Desktop: fixed left sidebar. Same destinations as the mobile bar,
          plus Log promoted to a full button since there's room for it. */}
      <nav className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-border bg-surface px-4 py-8 md:flex">
        <p className="px-3.5 text-lg font-semibold tracking-tight">Streakly</p>

        <Link
          href="/log"
          className={`mt-6 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-accent-2 to-accent px-4 py-2.5 text-sm font-medium text-white shadow-sm shadow-accent/30 transition active:scale-[0.98] ${
            pathname === "/log" ? "ring-2 ring-accent/30 ring-offset-2 ring-offset-surface" : ""
          }`}
        >
          <Plus size={18} strokeWidth={2.4} />
          Log activity
        </Link>

        <div className="mt-6 flex flex-col gap-1">
          {ALL_ITEMS.map(renderSidebarItem)}
        </div>
      </nav>
    </>
  );
}
