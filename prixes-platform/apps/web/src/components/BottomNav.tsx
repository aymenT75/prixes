"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon } from "@/components/Icon";
import { useA11y } from "@/lib/useA11y";

const TABS = [
  { href: "/", label: "Accueil", icon: "home", tour: undefined },
  // The whole shopping trip in three steps: prepare the list, compare the shops,
  // go there. The voice assistant stays in the centre button.
  { href: "/list", label: "Courses", icon: "shopping_cart", tour: "nav-assistant" },
  { href: "/fuel", label: "Carburant", icon: "local_gas_station", tour: "nav-fuel" },
  { href: "/scanner", label: "Scanner", icon: "qr_code_scanner", tour: "nav-scanner" },
];

function Tab({ t, active }: { t: (typeof TABS)[number]; active: boolean }) {
  return (
    <Link
      href={t.href}
      data-tour={t.tour}
      aria-current={active ? "page" : undefined}
      className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 transition-all duration-200 active:scale-90 ${
        active ? "bg-primary-container/20 text-primary" : "text-on-surface-variant"
      }`}
    >
      <Icon name={t.icon} fill={active} />
      <span className="max-w-full truncate text-label-md">{t.label}</span>
    </Link>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const openVoice = useA11y((s) => s.setVoiceOpen);
  const fontScale = useA11y((s) => s.fontScale);
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  return (
    // Four fixed-padding tabs stop fitting once the text setting grows: on a
    // 360 px screen the last label ("Scanner") was pushed off the edge. Let the
    // tabs share the width and the labels shrink instead of overflowing.
    //
    // At the largest size four words no longer fit even shrunk ("Carbur…",
    // "Assista…"), so the bar stops growing one step earlier than the page: its
    // labels stay whole, and they are still bigger than at the normal size.
    <nav
      aria-label="Navigation principale"
      style={fontScale === "xl" ? ({ zoom: 1.18 / 1.38 } as React.CSSProperties) : undefined}
      className="glass fixed inset-x-0 bottom-0 z-50 flex h-[80px] items-stretch justify-around border-t border-outline-variant/50 pb-[env(safe-area-inset-bottom)] shadow-nav">
      <Tab t={TABS[0]} active={isActive(TABS[0].href)} />
      <Tab t={TABS[1]} active={isActive(TABS[1].href)} />
      {/* The microphone is the brain of the app, and the only one: every page, dead
          centre, the biggest target on screen — one place to find it, by eye, by
          thumb or by screen reader. */}
      <div className="relative flex flex-1 flex-col items-center">
        <button
          onClick={() => openVoice(true)}
          aria-label="Parler à Prixes, assistant vocal"
          data-tour="voice-btn"
          className="absolute -top-7 grid h-[76px] w-[76px] place-items-center rounded-full bg-primary text-on-primary shadow-float ring-4 ring-surface transition-transform active:scale-90"
        >
          <Icon name="mic" fill style={{ fontSize: 40 }} />
        </button>
        <span aria-hidden className="mt-auto pb-2 text-label-md font-semibold text-primary">
          Parler
        </span>
      </div>
      <Tab t={TABS[2]} active={isActive(TABS[2].href)} />
      <Tab t={TABS[3]} active={isActive(TABS[3].href)} />
    </nav>
  );
}
