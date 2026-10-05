"use client";

import Link from "next/link";

import { LegalSection } from "@/components/LegalSection";
import { PageHeader } from "@/components/PageHeader";
import { LEGAL, PENDING } from "@/lib/legal";

const link = "text-primary underline underline-offset-2";
const strong = "text-on-surface";

/**
 * Conditions générales d'utilisation (everyone) and de vente (Premium), on one
 * page: the app is free, and the only thing sold is the Premium subscription.
 */
export default function ConditionsPage() {
  const seller = LEGAL.company ?? `${LEGAL.brand} (société ${PENDING})`;
  return (
    <div>
      <PageHeader title="Conditions" back />

      <p className="mb-5 text-body-md text-on-surface-variant">
        Conditions d&apos;utilisation de Prixes et conditions de vente de l&apos;abonnement
        Premium. L&apos;éditeur est indiqué dans les{" "}
        <Link href="/mentions-legales" className={link}>
          mentions légales
        </Link>
        .
      </p>

      <LegalSection icon="info" title="Le service">
        <p>
          Prixes compare les prix des courses et des carburants, prépare des listes de
          courses et des menus, et se pilote à la voix. L&apos;application est gratuite. Un
          abonnement Premium, facultatif, ajoute des fonctions d&apos;intelligence
          artificielle.
        </p>
        <p>
          Utiliser Prixes vaut acceptation de ces conditions. Un compte est nécessaire pour
          garder une liste, des alertes ou des menus ; vous êtes responsable de son accès.
        </p>
      </LegalSection>

      <LegalSection icon="warning" title="Des prix et des informations indicatifs">
        <p>
          Les prix viennent de sources publiques et collaboratives. Ils peuvent avoir changé
          en magasin, ou manquer pour certains produits. Le prix payé en caisse reste celui
          affiché par le magasin.
        </p>
        <p>
          <strong className={strong}>Allergies et régimes</strong> : les alertes s&apos;appuient
          sur les informations déclarées dans Open Food Facts, qui peuvent être incomplètes.
          Lisez toujours l&apos;étiquette du produit avant de le consommer.
        </p>
      </LegalSection>

      <LegalSection icon="workspace_premium" title="L'abonnement Premium">
        <ul className="ml-4 list-disc space-y-1.5">
          <li>
            <strong className={strong}>Prix</strong> : {LEGAL.premium.monthly} par mois ou{" "}
            {LEGAL.premium.yearly} par an, toutes taxes comprises.
          </li>
          <li>
            <strong className={strong}>Vendeur</strong> : {seller}. Le paiement est traité par
            Stripe ; Prixes ne voit ni ne conserve votre numéro de carte.
          </li>
          <li>
            <strong className={strong}>Renouvellement</strong> : l&apos;abonnement se renouvelle
            automatiquement à la fin de chaque mois ou de chaque année.
          </li>
          <li>
            <strong className={strong}>Résiliation</strong> : à tout moment, depuis votre compte
            ou en écrivant à <span className="select-all">{LEGAL.email}</span>. Le Premium reste
            actif jusqu&apos;à la fin de la période déjà payée.
          </li>
          <li>
            <strong className={strong}>Remboursement</strong> : dans les 14 jours qui suivent
            votre premier paiement, écrivez-nous et nous vous remboursons entièrement, sans
            justification.
          </li>
          <li>
            <strong className={strong}>Toujours gratuit</strong> : la voix, le comparateur, le
            carburant, la liste, les alertes de prix, les menus de nos recettes et toutes les
            options d&apos;accessibilité. Elles ne passeront jamais en Premium.
          </li>
        </ul>
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
