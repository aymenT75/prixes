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
