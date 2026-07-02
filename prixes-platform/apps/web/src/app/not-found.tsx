import Link from "next/link";

import { Icon } from "@/components/Icon";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <Icon name="explore_off" className="text-[56px] text-outline-variant" />
      <h1 className="text-headline-lg text-on-surface">Page introuvable</h1>
      <p className="max-w-xs text-body-md text-on-surface-variant">
        Cette page n&apos;existe pas ou a été déplacée.
      </p>
      <Link href="/" className="btn-primary">
        <Icon name="home" className="text-[18px]" /> Retour à l&apos;accueil
      </Link>
    </div>
  );
}
