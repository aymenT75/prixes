"use client";

import Link from "next/link";

import { LegalSection } from "@/components/LegalSection";
import { PageHeader } from "@/components/PageHeader";
import { LEGAL, PENDING } from "@/lib/legal";

const link = "text-primary underline underline-offset-2";
const strong = "text-on-surface";

/**
 * Conditions générales d'utilisation. The app is free and nothing is sold in it.
 */
export default function ConditionsPage() {
  return (
    <div>
      <PageHeader title="Conditions" back />

      <p className="mb-5 text-body-md text-on-surface-variant">
        Conditions d&apos;utilisation de Prixes. L&apos;éditeur est indiqué dans les{" "}
        <Link href="/mentions-legales" className={link}>
          mentions légales
        </Link>
        .
      </p>

      <LegalSection icon="info" title="Le service">
        <p>
          Prixes aide les personnes malvoyantes ou handicapées à faire leurs courses : une
          liste à la voix, le magasin le moins cher ou le plus proche, et un guidage dans les
          rayons. L&apos;application est gratuite.
        </p>
        <p>
          Utiliser Prixes vaut acceptation de ces conditions. Un compte est nécessaire pour
          garder une liste ; vous êtes responsable de son accès.
        </p>
      </LegalSection>

      <LegalSection icon="warning" title="Des prix et des informations indicatifs">
        <p>
          Les prix viennent de sources publiques et collaboratives. Ils peuvent avoir changé
          en magasin, ou manquer pour certains produits. Le prix payé en caisse reste celui
          affiché par le magasin.
        </p>
        <p>
          <strong className={strong}>Allergies</strong> : les alertes s&apos;appuient
          sur les informations déclarées dans Open Food Facts, qui peuvent être incomplètes.
          Lisez toujours l&apos;étiquette du produit avant de le consommer.
        </p>
      </LegalSection>

      <LegalSection icon="shield" title="Responsabilité">
        <p>
          Prixes fait de son mieux pour que le service soit disponible et exact, sans pouvoir
          le garantir à tout moment. Prixes n&apos;est ni affiliée ni approuvée par une
          enseigne ou par l&apos;État.
        </p>
      </LegalSection>

      <LegalSection icon="forum" title="Une réclamation">
        <p>
          Écrivez d&apos;abord à <span className="select-all">{LEGAL.email}</span> : nous
          répondons sous 15 jours.
        </p>
        <p>
          Si le désaccord persiste, vous pouvez saisir gratuitement un médiateur de la
          consommation
          {LEGAL.mediator ? (
            <>
              {" "}:{" "}
              <a href={LEGAL.mediator.url} className={link}>
                {LEGAL.mediator.name}
              </a>
            </>
          ) : (
            ` (désigné dès l'immatriculation de la société)`
          )}
          . Ces conditions relèvent du droit français.
        </p>
      </LegalSection>

      <LegalSection icon="update" title="Mise à jour">
        <p>
          Ces conditions peuvent évoluer. En cas de changement important pour les abonnés, vous
          êtes prévenu par e-mail avant qu&apos;il s&apos;applique. Dernière mise à jour :{" "}
          {LEGAL.updated}.
        </p>
      </LegalSection>
    </div>
  );
}
