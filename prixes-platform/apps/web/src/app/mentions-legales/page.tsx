"use client";

import Link from "next/link";

import { LegalSection } from "@/components/LegalSection";
import { PageHeader } from "@/components/PageHeader";
import { LEGAL, PENDING } from "@/lib/legal";

const link = "text-primary underline underline-offset-2";

/** Mentions légales (LCEN, art. 6 III). Company details come from src/lib/legal.ts. */
export default function MentionsLegalesPage() {
  const { host } = LEGAL;
  return (
    <div>
      <PageHeader title="Mentions légales" back />

      <LegalSection icon="badge" title="Éditeur">
        <ul className="space-y-1.5">
          <li>
            <strong className="text-on-surface">Société</strong> : {LEGAL.company ?? `${LEGAL.brand}, société ${PENDING}`}
          </li>
          <li>
            <strong className="text-on-surface">Forme et capital</strong> : {LEGAL.form ?? PENDING}
          </li>
          <li>
            <strong className="text-on-surface">SIREN</strong> : {LEGAL.siren ?? PENDING}
            {LEGAL.rcs && ` · ${LEGAL.rcs}`}
          </li>
          {LEGAL.vat && (
            <li>
              <strong className="text-on-surface">TVA intracommunautaire</strong> : {LEGAL.vat}
            </li>
          )}
          <li>
            <strong className="text-on-surface">Siège</strong> : {LEGAL.address ?? PENDING}
          </li>
          <li>
            <strong className="text-on-surface">Directeur de la publication</strong> : {LEGAL.publisher}
          </li>
          <li>
            <strong className="text-on-surface">Contact</strong> :{" "}
            <span className="select-all text-on-surface">{LEGAL.email}</span>
          </li>
        </ul>
      </LegalSection>

      <LegalSection icon="database" title="Hébergement">
        <p>
          {host.name}, {host.address} ({host.where}).{" "}
          <a href={host.url} className={link}>
            {host.url.replace("https://", "")}
          </a>
        </p>
      </LegalSection>

      <LegalSection icon="info" title="Données affichées">
        <p>
          Les prix des carburants viennent des données publiques de l&apos;État, les prix des
          produits de la base collaborative Open Prices, et les fiches produits
          d&apos;Open Food Facts. Le détail est sur la page{" "}
          <Link href="/sources" className={link}>
            Sources des données
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection icon="verified" title="Propriété intellectuelle">
        <p>
          Le nom Prixes, son logo, ses textes et son code appartiennent à leur éditeur. Les
          données ouvertes réutilisées restent soumises à leur licence : Open Database
          License (ODbL) pour Open Food Facts et Open Prices, Licence Ouverte d&apos;Etalab
          pour les prix des carburants.
        </p>
      </LegalSection>

      <LegalSection icon="shield" title="Vos données">
        <p>
          Voir la page{" "}
          <Link href="/privacy" className={link}>
            Confidentialité
          </Link>{" "}
          et les{" "}
          <Link href="/conditions" className={link}>
            Conditions d&apos;utilisation et de vente
          </Link>
          .
        </p>
      </LegalSection>

      <p className="text-micro text-on-surface-variant">Dernière mise à jour : {LEGAL.updated}.</p>
    </div>
  );
}
