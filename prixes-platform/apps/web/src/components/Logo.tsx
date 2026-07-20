// Prixes brand mark — the cart + price-tag artwork supplied directly by the
// user (public/logo-mark.png, cropped from public/logo-new.png), not a
// redrawn approximation. The wordmark is already baked into the artwork, so
// LogoLockup doesn't render a second "Prixes" text label next to it — only a
// visually-hidden one when it stands in for the page's <h1>.
import Image from "next/image";

export function LogoMark({ className, decorative }: { className?: string; decorative?: boolean }) {
  return (
    <span className={`relative inline-block overflow-hidden rounded-xl ${className ?? ""}`}>
      <Image
        src="/logo-mark.png"
        alt={decorative ? "" : "Prixes"}
        fill
        sizes="(max-width: 640px) 224px, 224px"
        className="object-cover"
        priority
        quality={95}
      />
    </span>
  );
}

/** The mark alone. Pass `heading` on the home screen so it's wrapped in the
 * page's <h1> (a visually-hidden "Prixes" label provides the accessible name,
 * since the mark itself is decorative there — never announced twice). */
export function LogoLockup({
  className = "",
  heading = false,
}: {
  className?: string;
  heading?: boolean;
}) {
  const mark = <LogoMark className="h-11 w-11" decorative={heading} />;
  if (heading) {
    return (
      <h1 className={`flex items-center ${className}`}>
        {mark}
        <span className="sr-only">Prixes</span>
      </h1>
    );
  }
  return <span className={`flex items-center ${className}`}>{mark}</span>;
}
