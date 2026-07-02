"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon } from "@/components/Icon";

const TABS = [
  { href: "/", label: "Accueil", icon: "home" },
  { href: "/courses", label: "Courses", icon: "shopping_basket" },
  { href: "/fuel", label: "Carburant", icon: "local_gas_station" },
  { href: "/deals", label: "Deals", icon: "sell" },
  { href: "/scanner", label: "Scanner", icon: "qr_code_scanner" },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="glass fixed inset-x-0 bottom-0 z-50 flex h-[80px] items-center justify-around border-t border-outline-variant/50 pb-[env(safe-area-inset-bottom)] shadow-nav">
      {TABS.map((t) => {
        const active = t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`flex flex-col items-center justify-center gap-0.5 rounded-xl px-3 py-1 transition-all duration-200 active:scale-90 ${
              active ? "bg-primary-container/20 text-primary" : "text-on-surface-variant"
            }`}
          >
            <Icon name={t.icon} fill={active} />
            <span className="text-label-md">{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
