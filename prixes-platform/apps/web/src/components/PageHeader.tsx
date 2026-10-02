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
  const setA11yOpen = useA11y((s) => s.setA11yOpen);
  // At the largest text size the title no longer fits between the buttons: it
  // gets a row of its own under them, instead of breaking "Assistant" in two.
  const ownRow = useA11y((s) => s.fontScale === "xl");

  // Persistent back navigation everywhere except the app root (home).
  const showBack = back ?? pathname !== "/";

  function goBack() {
    // Prefer real history so the user lands exactly where they came from; fall
    // back to home for deep links / PWA cold-starts that have no history.
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/");
  }

  // headline-lg, not the bigger headline-xl-mobile used on the logo lockup:
  // this title shares its row with 2 icon buttons plus a right-side action
  // and login button/avatar, so it needs to fit real page titles ("Produit",
  // "Carburant") without truncating on a typical phone width.
  // Wraps rather than truncates: at the largest text size "Ma semaine" was
  // cut to "Ma sem…" — the title is the one thing that says where you are.
  const heading = (
    <h1 className="min-w-0 break-words py-1 text-headline-lg leading-tight tracking-tight text-primary">
      {title}
    </h1>
  );

  return (
    <header className="glass sticky top-0 z-40 -mx-margin-mobile -mt-6 mb-6 flex min-h-16 flex-wrap items-center justify-between gap-x-2 border-b border-outline-variant/30 px-margin-mobile shadow-card">
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        {showBack && (
          <button
            onClick={goBack}
            aria-label="Retour"
            className="-ml-1 grid h-11 w-11 flex-shrink-0 place-items-center rounded-full text-primary transition-colors hover:bg-surface-container-high active:scale-95"
          >
            <Icon name="arrow_back" />
          </button>
        )}
        {pathname === "/" ? <LogoLockup heading /> : !ownRow && heading}
        {/* Accessibility, next to the title so it never covers content. Sized 44x44
            (WCAG 2.5.5, Android 48dp). The microphone is not here: there is one, in
            the centre of the tab bar, so a screen reader announces it once. */}
        <button
          onClick={() => setA11yOpen(true)}
          aria-label="Options d'accessibilité"
          data-tour="a11y-btn"
          className="ml-1 grid h-11 w-11 flex-shrink-0 place-items-center rounded-full text-on-surface-variant transition-transform hover:bg-surface-container-high active:scale-90"
        >
          <Icon name="accessibility_new" className="text-[20px]" />
        </button>
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        {action}
        {user ? (
          <Link
            href="/account"
            aria-label="Mon compte"
            className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border-2 border-primary-container/20 bg-primary text-label-md font-bold text-on-primary"
          >
            {user.initials}
          </Link>
        ) : (
          <button
            onClick={() => openLogin(true)}
            className="inline-flex min-h-[44px] items-center rounded-full bg-primary px-4 py-2 text-label-md text-on-primary active:scale-95"
          >
            Connexion
          </button>
        )}
      </div>
      {ownRow && pathname !== "/" && <div className="basis-full pb-2">{heading}</div>}
    </header>
  );
}
