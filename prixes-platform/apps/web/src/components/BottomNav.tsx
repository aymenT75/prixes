"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon } from "@/components/Icon";

const TABS = [
  { href: "/", label: "Accueil", icon: "home", tour: undefined },
  // The assistant is what makes Prixes different, so it gets the tab. It sits
  // at the top of the list — the page it fills — rather than on its own screen.
  { href: "/list", label: "Assistant", icon: "auto_awesome", tour: "nav-assistant" },
  { href: "/fuel", label: "Carburant", icon: "local_gas_station", tour: "nav-fuel" },
  { href: "/scanner", label: "Scanner", icon: "qr_code_scanner", tour: "nav-scanner" },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    // Four fixed-padding tabs stop fitting once the text setting grows: on a
    // 360 px screen the last label ("Scanner") was pushed off the edge. Let the
    // tabs share the width and the labels shrink instead of overflowing.
    <nav aria-label="Navigation principale" className="glass fixed inset-x-0 bottom-0 z-50 flex h-[80px] items-stretch justify-around border-t border-outline-variant/50 pb-[env(safe-area-inset-bottom)] shadow-nav">
      {TABS.map((t) => {
        const active = t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            data-tour={t.tour}
            className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 transition-all duration-200 active:scale-90 ${
              active ? "bg-primary-container/20 text-primary" : "text-on-surface-variant"
            }`}
          >
            <Icon name={t.icon} fill={active} />
            <span className="max-w-full truncate text-label-md">{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
