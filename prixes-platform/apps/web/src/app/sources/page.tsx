"use client";

import Link from "next/link";

import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";

/** A single upstream data source, with a working link to its original publisher. */
function Source({
  icon,
  title,
  children,
  links,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
  links: { label: string; href: string }[];
}) {
  return (
    <section className="card mb-4 p-5">
      <h2 className="mb-2 flex items-center gap-2 text-headline-md text-on-surface">
        <Icon name={icon} className="text-primary" /> {title}
      </h2>
      <div className="space-y-2 text-body-md text-on-surface-variant">{children}</div>
      <div className="mt-3 flex flex-col gap-2">
        {links.map((l) => (
          <a
            key={l.href}
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-11 items-center gap-2 break-all rounded-lg border border-outline-variant/40 bg-surface-container px-3 py-2 text-label-md text-primary transition-colors hover:bg-surface-container-high"
          >
            <Icon name="open_in_new" className="flex-shrink-0 text-[18px]" />
            <span className="min-w-0">{l.label}</span>
          </a>
        ))}
      </div>
    </section>
  );
}

export default function SourcesPage() {
  return (
    <div>
      <PageHeader title="Sources des données" back />

      {/* Play Store "Déclarations trompeuses": the non-affiliation notice must be
          impossible to miss, so it sits above every source, not in a footnote. */}
      <div className="mb-5 rounded-2xl border-2 border-primary/25 bg-surface-container p-4">
        <h2 className="mb-1.5 flex items-center gap-2 text-headline-md text-on-surface">
          <Icon name="info" fill className="flex-shrink-0 text-[20px] text-primary" /> Application
          indépendante
        </h2>
        <p className="text-body-md text-on-surface-variant">
          Prixes est une application <strong>indépendante</strong>. Elle n&apos;est ni
          affiliée, ni approuvée, ni gérée par une entité gouvernementale, une
          administration publique ou une enseigne de distribution.
        </p>
      </div>

      <p className="mb-5 text-body-md text-on-surface-variant">
        Prixes n&apos;invente aucun chiffre. Chaque information affichée vient d&apos;une
        source publique que vous pouvez consulter vous-même :
      </p>

      <Source
        icon="nutrition"
        title="Produits, Nutri-Score et allergènes"
        links={[{ label: "world.openfoodfacts.org", href: "https://world.openfoodfacts.org/" }]}
      >
        <p>
          Base collaborative Open Food Facts (licence ODbL). Le Nutri-Score et l&apos;Eco-Score affichés sont calculés à partir des informations déclarées sur
          l&apos;emballage. Les allergènes indiqués ne remplacent pas la lecture de
          l&apos;étiquette du produit.
        </p>
      </Source>

      <Source
        icon="sell"
        title="Prix des produits en magasin"
        links={[{ label: "prices.openfoodfacts.org", href: "https://prices.openfoodfacts.org/" }]}
      >
        <p>
          Relevés de prix Open Prices, remontés par la communauté en magasin. Chaque prix
          est daté ; un prix peut avoir changé depuis le dernier relevé.
        </p>
      </Source>

      <Source
        icon="storefront"
        title="Magasins et cartographie"
        links={[{ label: "openstreetmap.org", href: "https://www.openstreetmap.org/copyright" }]}
      >
        <p>
          Emplacements des magasins et fonds de carte © les contributeurs OpenStreetMap
          (licence ODbL). Les itinéraires sont calculés via OSRM.
        </p>
      </Source>

      <p className="mb-8 mt-6 text-center text-body-md text-on-surface-variant">
        Une source vous semble erronée ?{" "}
        <Link href="/feedback" className="text-primary underline underline-offset-2">
          Signalez-le nous
        </Link>
        .
      </p>
    </div>
  );
}
