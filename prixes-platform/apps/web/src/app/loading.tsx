import { LogoMark } from "@/components/Logo";

export default function Loading() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-on-surface-variant">
      <LogoMark className="h-14 w-14 animate-pulse" decorative />
      <p className="text-body-md">Chargement…</p>
    </div>
  );
}
