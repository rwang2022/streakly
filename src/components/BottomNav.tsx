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

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/80 backdrop-blur-lg pb-[calc(env(safe-area-inset-bottom)+14px)]">
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
  );
}
