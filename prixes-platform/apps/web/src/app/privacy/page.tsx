"use client";

import Link from "next/link";

import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";

function Section({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card mb-4 p-5">
      <h2 className="mb-2 flex items-center gap-2 text-headline-md text-on-surface">
        <Icon name={icon} className="text-primary" /> {title}
      </h2>
      <div className="space-y-2 text-body-md text-on-surface-variant">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div>
      <PageHeader title="Confidentialité" back />

      <p className="mb-5 text-body-md text-on-surface-variant">
        Prixes compare les prix des courses. Voici, sans jargon, ce qu&apos;on fait de vos
        données — et ce qu&apos;on ne fait pas.
      </p>

      <Section icon="badge" title="Qui gère vos données">
        <p>
          Prixes, joignable à{" "}
          <a href="mailto:contact@prixes.app" className="text-primary underline-offset-2 hover:underline">
            contact@prixes.app
          </a>{" "}
          pour toute question sur vos données ou pour exercer vos droits.
        </p>
      </Section>

      <Section icon="database" title="Ce qu'on collecte, et pourquoi">
        <ul className="ml-4 list-disc space-y-1.5">
          <li>
            <strong className="text-on-surface">Compte</strong> — email, nom d&apos;utilisateur,
            mot de passe (chiffré, jamais en clair). Pour créer votre compte et vous
            reconnecter.
          </li>
          <li>
            <strong className="text-on-surface">Position</strong> — uniquement quand vous
            demandez explicitement les magasins proches ou l&apos;itinéraire vers un
            produit. Utilisée pour ce seul calcul, <strong>jamais enregistrée</strong>. Vous
            pouvez aussi taper une adresse au lieu d&apos;activer la géolocalisation.
          </li>
          <li>
            <strong className="text-on-surface">Liste de courses et alertes de prix</strong> —
            les produits que vous ajoutez, pour vous les représenter et vous notifier des
            baisses de prix.
          </li>
          <li>
            <strong className="text-on-surface">Avis</strong> — le message que vous
            envoyez via le formulaire, et votre email si vous le renseignez (facultatif,
            uniquement pour vous répondre).
          </li>
          <li>
            <strong className="text-on-surface">Photo scannée</strong> — quand vous
            identifiez un produit par photo, l&apos;image est envoyée à un service
            d&apos;intelligence artificielle pour reconnaissance puis{" "}
            <strong>immédiatement jetée</strong> — Prixes ne la stocke pas. Les photos que
            vous choisissez d&apos;ajouter à un bon plan, elles, sont conservées (pour
            l&apos;afficher).
          </li>
          <li>
            <strong className="text-on-surface">Usage de l&apos;app</strong> — des
            statistiques anonymes (écrans consultés) pour comprendre ce qui marche ou pas.
            Aucune donnée personnelle, aucun identifiant lié à vous, respecte le réglage
            « Ne pas suivre » de votre navigateur, et automatiquement supprimé au bout de
            90 jours.
          </li>
        </ul>
      </Section>

      <Section icon="cookie" title="Cookies">
        <p>
          <strong className="text-on-surface">Prixes n&apos;utilise aucun cookie.</strong> La
          connexion et vos préférences (thème, taille du texte…) sont gardées uniquement
          sur votre appareil (stockage local du navigateur), jamais transmises à un tiers à
          des fins de suivi publicitaire.
        </p>
      </Section>

      <Section icon="share" title="Services tiers utilisés">
        <p>Pour fonctionner, Prixes s&apos;appuie sur :</p>
        <ul className="ml-4 list-disc space-y-1.5">
          <li>Firebase (Google) — pour la connexion à votre compte</li>
          <li>OpenFoodFacts, Open Prices, OpenStreetMap — données produits, prix et magasins</li>
          <li>Un service d&apos;IA (reconnaissance photo, voix naturelle en option)</li>
          <li>Sentry — pour détecter les bugs techniques (pas de données personnelles dans les rapports)</li>
        </ul>
        <p>
          Chacun a sa propre politique de confidentialité pour les données qui lui sont
          transmises dans le cadre de son service.
        </p>
      </Section>

      <Section icon="verified_user" title="Vos droits">
        <p>Conformément au RGPD, vous pouvez à tout moment :</p>
        <ul className="ml-4 list-disc space-y-1.5">
          <li>
            <strong className="text-on-surface">Exporter</strong> toutes vos données —
            depuis <Link href="/account" className="text-primary underline-offset-2 hover:underline">votre compte</Link>.
          </li>
          <li>
            <strong className="text-on-surface">Supprimer</strong> votre compte et vos
            données — également depuis votre compte, en un geste.
          </li>
          <li>
            <strong className="text-on-surface">Nous contacter</strong> pour toute
            question, rectification, ou opposition — {" "}
            <a href="mailto:contact@prixes.app" className="text-primary underline-offset-2 hover:underline">
              contact@prixes.app
            </a>.
          </li>
        </ul>
      </Section>

      <Section icon="update" title="Mise à jour">
        <p>Cette page reflète le fonctionnement actuel de l&apos;app. Dernière mise à jour : juillet 2026.</p>
      </Section>
    </div>
  );
}
