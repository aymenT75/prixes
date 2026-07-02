import { scoreColor } from "@/lib/format";

export function ScoreBadge({ kind, grade }: { kind: "Nutri" | "Eco"; grade: string | null }) {
  if (!grade) return null;
  const g = grade.toLowerCase();
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-micro text-white"
      style={{ backgroundColor: scoreColor[g] ?? "#6e7a71" }}
    >
      {kind}-{g.toUpperCase()}
    </span>
  );
}

export function NovaBadge({ group }: { group: number | null }) {
  if (!group) return null;
  const colors = ["#00b894", "#fdcb6e", "#e17055", "#d63031"];
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-micro text-white"
      style={{ backgroundColor: colors[group - 1] ?? "#6e7a71" }}
    >
      NOVA {group}
    </span>
  );
}
