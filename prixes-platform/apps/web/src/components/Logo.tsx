// Prixes brand logo — the 4-way "expand" arrows (X) with a green price tag.
// The arrows use `currentColor` so the mark adapts to light/dark; the tag keeps its
// fixed brand green + yellow. Set the colour via the wrapper (see LogoLockup).
const ARROW_POINTS = "152,0 78,-50 78,-29 -78,-29 -78,-50 -152,0 -78,50 -78,29 78,29 78,50";

export function LogoMark({ className, decorative }: { className?: string; decorative?: boolean }) {
  return (
    <svg
      viewBox="0 0 512 512"
      className={className}
      {...(decorative
        ? { "aria-hidden": true, focusable: false }
        : { role: "img", "aria-label": "Prixes" })}
    >
      <polygon points={ARROW_POINTS} transform="translate(256 256) rotate(45)" fill="currentColor" />
      <polygon points={ARROW_POINTS} transform="translate(256 256) rotate(-45)" fill="currentColor" />
      <g transform="translate(150 150) rotate(-28) scale(1.12)">
        <path
          d="M-3 2 C -14 -20, 16 -20, 6 2"
          stroke="currentColor"
          strokeWidth="9"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M0 0 L30 20 Q40 27 40 40 L40 98 Q40 112 26 112 L-26 112 Q-40 112 -40 98 L-40 40 Q-40 27 -30 20 Z"
          fill="#2bd44f"
        />
        <circle cx="0" cy="34" r="11" fill="#f5e11a" />
      </g>
    </svg>
  );
}

/** The mark + "Prixes" wordmark, brand-navy in light and light-blue in dark.
 * On the home screen pass `heading` so the wordmark is the page's <h1> (the mark is
 * decorative there, so it isn't announced twice by screen readers). */
export function LogoLockup({
  className = "",
  heading = false,
}: {
  className?: string;
  heading?: boolean;
}) {
  const Word = heading ? "h1" : "span";
  return (
    <span className={`flex items-center gap-2 text-[#15245c] dark:text-[#89ceff] ${className}`}>
      <LogoMark className="h-8 w-8" decorative={heading} />
      <Word className="text-headline-xl-mobile font-bold tracking-tight">Prixes</Word>
    </span>
  );
}
