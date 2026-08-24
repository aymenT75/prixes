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
            className="flex items-center gap-2 rounded-lg border border-outline-variant/40 bg-surface-container px-3 py-2 text-label-md text-primary transition-colors hover:bg-surface-container-high"
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
          administration publique ou une enseigne de distribution. Les prix des carburants
          affichés proviennent des données ouvertes publiées par l&apos;État français,
          reprises telles quelles et accessibles ci-dessous à leur source d&apos;origine.
        </p>
      </div>

      <p className="mb-5 text-body-md text-on-surface-variant">
        Prixes n&apos;invente aucun chiffre. Chaque information affichée vient d&apos;une
        source publique que vous pouvez consulter vous-même :
      </p>

      <Source
        icon="local_gas_station"
        title="Prix des carburants"
        links={[
          { label: "prix-carburants.gouv.fr — site officiel", href: "https://www.prix-carburants.gouv.fr/" },
          {
            label: "data.gouv.fr — jeu de données « Prix des carburants, flux instantané »",
            href: "https://www.data.gouv.fr/datasets/prix-des-carburants-en-france-flux-instantane-v2-amelioree",
          },
          { label: "donnees.roulez-eco.fr — flux brut utilisé par l'appli", href: "https://donnees.roulez-eco.fr/opendata/instantane" },
        ]}
      >
        <p>
          Données ouvertes officielles publiées par le Ministère de l&apos;Économie et des
          Finances (dispositif <em>prix-carburants.gouv.fr</em>), déclarées par les
          stations-service elles-mêmes. Prixes se contente de les rapatrier et de les
          trier par distance : aucun prix n&apos;est modifié.
        </p>
        <p>
          Prixes n&apos;est pas le producteur de ces données et ne représente pas
          l&apos;État français. En cas d&apos;écart, la source officielle fait foi.
        </p>
      </Source>

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
        <Link href="/feedback" className="text-primary underline-offset-2 hover:underline">
          Signalez-le nous
        </Link>
        .
      </p>
    </div>
  );
}
