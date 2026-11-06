// Thin wrapper around Google Material Symbols (Outlined).
export function Icon({
  name,
  fill = false,
  className = "",
  style,
}: {
  name: string;
  fill?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className={`material-symbols-outlined ${fill ? "fill" : ""} ${className}`}
      style={style}
      aria-hidden
    >
      {name}
    </span>
  );
}

/** Drawn, not from the font: the subset icon font has no arrow or tick. */
function Stroke({ d, size, width, className = "" }: { d: string; size: number; width: number; className?: string }) {
  return (
    <svg
      aria-hidden
      className={className}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

export function Arrow({ size = 34 }: { size?: number }) {
  return <Stroke d="M4 12h15M13 6l6 6-6 6" size={size} width={2.4} className="arr flex-none" />;
}

export function Tick({ size = 30 }: { size?: number }) {
  return <Stroke d="M5 12.5l4.5 4.5L19 7.5" size={size} width={2.8} />;
}
