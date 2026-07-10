"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { Icon } from "@/components/Icon";
import { LogoLockup } from "@/components/Logo";
import { useApp } from "@/lib/store";
import { useA11y } from "@/lib/useA11y";

export function PageHeader({
  title,
  back,
  action,
}: {
  title: string;
  /** Force the back button on/off. Defaults to on for every page except home. */
  back?: boolean;
  action?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, openLogin } = useApp();
  const setVoiceOpen = useA11y((s) => s.setVoiceOpen);
  const setA11yOpen = useA11y((s) => s.setA11yOpen);

  // Persistent back navigation everywhere except the app root (home).
  const showBack = back ?? pathname !== "/";

  function goBack() {
    // Prefer real history so the user lands exactly where they came from; fall
    // back to home for deep links / PWA cold-starts that have no history.
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/");
  }

  return (
    <header className="glass sticky top-0 z-40 -mx-margin-mobile -mt-6 mb-6 flex h-16 items-center justify-between border-b border-outline-variant/30 px-margin-mobile shadow-card">
      <div className="flex min-w-0 items-center gap-1.5">
        {showBack && (
          <button
            onClick={goBack}
            aria-label="Retour"
            className="-ml-1 grid h-10 w-10 flex-shrink-0 place-items-center rounded-full text-primary transition-colors hover:bg-surface-container-high active:scale-95"
          >
            <Icon name="arrow_back" />
          </button>
        )}
        {pathname === "/" ? (
          <LogoLockup />
        ) : (
          <h1 className="truncate text-headline-xl-mobile tracking-tight text-primary">{title}</h1>
        )}
        {/* Voice + accessibility — small, next to the title, so they never cover content. */}
        <button
          onClick={() => setVoiceOpen(true)}
          aria-label="Assistant vocal"
          className="ml-1 grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-primary/10 text-primary transition-transform active:scale-90"
        >
          <Icon name="mic" fill className="text-[20px]" />
        </button>
        <button
          onClick={() => setA11yOpen(true)}
          aria-label="Options d'accessibilité"
          className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full text-on-surface-variant transition-transform hover:bg-surface-container-high active:scale-90"
        >
          <Icon name="accessibility_new" className="text-[20px]" />
        </button>
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        {action}
        {user ? (
          <Link
            href="/account"
            className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border-2 border-primary-container/20 bg-primary text-label-md font-bold text-on-primary"
          >
            {user.initials}
          </Link>
        ) : (
          <button
            onClick={() => openLogin(true)}
            className="rounded-full bg-primary px-4 py-2 text-label-md text-on-primary active:scale-95"
          >
            Connexion
          </button>
        )}
      </div>
    </header>
  );
}
