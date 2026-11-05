"use client";

import { usePathname, useRouter } from "next/navigation";

import { Icon } from "@/components/Icon";

/** A very large way back, and the name of the screen. Nothing else competes. */
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
  const showBack = back ?? pathname !== "/";

  function goBack() {
    // Real history when there is some; home for a deep link or a cold start.
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/");
  }

  return (
    <header className="mb-5 flex min-h-16 items-center gap-3">
      {showBack && (
        <button
          onClick={goBack}
          aria-label="Retour"
          className="grid h-16 w-16 flex-shrink-0 place-items-center rounded-full border-[3px] border-[rgb(var(--color-btn-line))] text-on-surface active:scale-95"
        >
          <Icon name="arrow_back" className="text-[36px]" />
        </button>
      )}
      <h1 className="min-w-0 flex-1 break-words text-[32px] font-bold leading-tight text-on-surface">{title}</h1>
      {action}
    </header>
  );
}
