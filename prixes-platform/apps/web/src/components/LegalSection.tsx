import { Icon } from "@/components/Icon";

/** A titled card for the legal pages (confidentialité, mentions légales, conditions). */
export function LegalSection({
  icon,
  title,
  id,
  children,
}: {
  icon: string;
  title: string;
  /** Anchor for sections linked from outside, e.g. the Google Play listing. */
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="card mb-4 scroll-mt-4 p-5">
      <h2 className="mb-2 flex items-center gap-2 text-headline-md text-on-surface">
        <Icon name={icon} className="text-primary" /> {title}
      </h2>
      <div className="space-y-2 text-body-md text-on-surface-variant">{children}</div>
    </section>
  );
}
