import { novaColor, readableOn, scoreColor } from "@/lib/format";

export function ScoreBadge({ kind, grade }: { kind: "Nutri" | "Eco"; grade: string | null }) {
  if (!grade) return null;
  const g = grade.toLowerCase();
  const bg = scoreColor[g] ?? "#6c786f";
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-micro"
      style={{ backgroundColor: bg, color: readableOn(bg) }}
    >
      {kind}-{g.toUpperCase()}
    </span>
  );
}

export function NovaBadge({ group }: { group: number | null }) {
  if (!group) return null;
  const bg = novaColor[group] ?? "#6c786f";
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-micro"
      style={{ backgroundColor: bg, color: readableOn(bg) }}
    >
      NOVA {group}
    </span>
  );
}
