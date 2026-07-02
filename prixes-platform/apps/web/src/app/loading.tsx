import { Icon } from "@/components/Icon";

export default function Loading() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-on-surface-variant">
      <Icon name="progress_activity" className="animate-spin text-[40px] text-primary" />
      <p className="text-body-md">Chargement…</p>
    </div>
  );
}
