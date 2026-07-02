"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { Icon } from "@/components/Icon";
import { useApp } from "@/lib/store";

export function PageHeader({
  title,
  back = false,
  action,
}: {
  title: string;
  back?: boolean;
  action?: React.ReactNode;
}) {
  const router = useRouter();
  const { user, openLogin } = useApp();

  return (
    <header className="glass sticky top-0 z-40 -mx-margin-mobile -mt-6 mb-6 flex h-16 items-center justify-between border-b border-outline-variant/30 px-margin-mobile shadow-card">
      <div className="flex items-center gap-2">
        {back && (
          <button
            onClick={() => router.back()}
            className="rounded-full p-2 text-primary transition-colors hover:bg-surface-container-high active:scale-95"
          >
            <Icon name="arrow_back" />
          </button>
        )}
        <h1 className="text-headline-xl-mobile tracking-tight text-primary">{title}</h1>
      </div>
      <div className="flex items-center gap-2">
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
