// Faceted blue crystal for the home hero — a stylised brilliant-cut gem lit from
// the top-left. Pure SVG (no asset), so it stays crisp at any size and adds no
// network weight. Decorative: aria-hidden.
export function DiamondGem({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 210"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id="gem-table" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#eff9ff" />
          <stop offset="1" stopColor="#7dd3fc" />
        </linearGradient>
        <linearGradient id="gem-pav" x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor="#38bdf8" />
          <stop offset="1" stopColor="#0369a1" />
        </linearGradient>
        <filter id="gem-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="10" />
        </filter>
      </defs>

      {/* soft halo */}
      <ellipse cx="100" cy="110" rx="78" ry="86" fill="#7dd3fc" opacity="0.28" filter="url(#gem-glow)" />

      {/* crown */}
      <polygon points="65,40 135,40 130,85 70,85" fill="url(#gem-table)" />
      <polygon points="65,40 70,85 25,85" fill="#8fd6fb" />
      <polygon points="135,40 175,85 130,85" fill="#38bdf8" />

      {/* pavilion */}
      <polygon points="25,85 70,85 100,198" fill="#38bdf8" />
      <polygon points="70,85 130,85 100,198" fill="url(#gem-pav)" />
      <polygon points="130,85 175,85 100,198" fill="#0369a1" />

      {/* facet edges */}
      <g stroke="#ffffff" strokeOpacity="0.55" strokeWidth="1.5" strokeLinejoin="round">
        <polygon points="65,40 135,40 175,85 100,198 25,85" fill="none" />
        <path d="M65,40 70,85 25,85 M135,40 130,85 175,85 M70,85 100,198 M130,85 100,198 M65,40 135,40 130,85 70,85" />
      </g>

      {/* sparkles */}
      <g fill="#ffffff">
        <path d="M150 34 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3 z" opacity="0.9" />
        <path d="M44 60 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 z" opacity="0.75" />
        <circle cx="120" cy="150" r="2.5" opacity="0.7" />
      </g>
    </svg>
  );
}
