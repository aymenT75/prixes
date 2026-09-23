"use client";

import Link from "next/link";

import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";

function Section({
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
          <a href="mailto:contact@prixes.app" className="text-primary underline underline-offset-2">
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
            <strong>immédiatement jetée</strong>. Prixes ne stocke aucune photo, jamais.
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

      <Section icon="database" title="D'où viennent les données affichées">
        <p>
          Prixes est une application <strong className="text-on-surface">indépendante</strong> :
          elle n&apos;est ni affiliée, ni approuvée, ni gérée par une entité
          gouvernementale ou une enseigne de distribution. Les prix des carburants
          proviennent des données ouvertes publiées par l&apos;État français, reprises
          sans modification.
        </p>
        <p>
          Le détail de chaque source, avec un lien vers le site d&apos;origine, est sur la
          page{" "}
          <Link href="/sources" className="text-primary underline underline-offset-2">
            Sources des données
          </Link>
          .
        </p>
      </Section>

      <Section icon="verified_user" title="Vos droits">
        <p>Conformément au RGPD, vous pouvez à tout moment :</p>
        <ul className="ml-4 list-disc space-y-1.5">
          <li>
            <strong className="text-on-surface">Exporter</strong> toutes vos données —
            depuis <Link href="/account" className="text-primary underline underline-offset-2">votre compte</Link>.
          </li>
          <li>
            <strong className="text-on-surface">Supprimer</strong> votre compte et vos
            données — également depuis votre compte, en un geste.
          </li>
          <li>
            <strong className="text-on-surface">Nous contacter</strong> pour toute
            question, rectification, ou opposition — {" "}
            <a href="mailto:contact@prixes.app" className="text-primary underline underline-offset-2">
              contact@prixes.app
            </a>.
          </li>
        </ul>
      </Section>

      {/* Hi Coach is a separate app that shares the Prixes account. Its Google Play
          listing links here for its privacy policy (#hi-coach) and for the
          account-deletion page Google requires (#hi-coach-suppression). */}
      <Section id="hi-coach" icon="fitness_center" title="Hi Coach, l'application coach">
        <p>
          Hi Coach est l&apos;application de coaching nutrition et entraînement éditée par Prixes.
          Elle utilise le même compte de connexion que Prixes, mais ses données sont stockées à
          part, dans une base qui lui est propre.
        </p>
        <ul className="ml-4 list-disc space-y-1.5">
          <li>
            <strong className="text-on-surface">Profil santé</strong> — sexe, date de naissance,
            taille, poids, niveau d&apos;activité, objectif, et si vous êtes diabétique ou sensible
            au sucre. Enregistré uniquement après votre consentement explicite, pour calculer vos
            repères du jour avec des formules publiées (Mifflin-St Jeor, seuils de l&apos;OMS).
          </li>
          <li>
            <strong className="text-on-surface">Ce que vous enregistrez</strong> — repas, contenu
            du frigo, ressenti du matin, eau et café, rappels, matériel de sport.
          </li>
          <li>
            <strong className="text-on-surface">Photos et descriptions de repas</strong> — quand
            vous photographiez un plat ou votre frigo, ou dictez un repas, la photo ou le texte
            est envoyé à OpenAI pour reconnaître les aliments. Les idées de recettes partent avec
            quatre nombres (ce qu&apos;il vous reste en calories, protéines, fibres et sucres).
            Votre profil santé n&apos;est jamais envoyé à OpenAI ni à aucun autre service
            d&apos;intelligence artificielle. Les photos ne sont pas conservées par Hi Coach.
          </li>
          <li>
            <strong className="text-on-surface">Voix</strong> — la dictée est reconnue sur votre
            téléphone. Les phrases du coach peuvent être lues par la synthèse vocale d&apos;OpenAI.
          </li>
          <li>
            <strong className="text-on-surface">Erreurs techniques</strong> — les pannes de
            l&apos;API sont signalées à Sentry, sans vos données ni votre identité.
          </li>
        </ul>
        <p>
          Aucune donnée Hi Coach n&apos;est vendue, partagée à des fins commerciales ou utilisée
          pour de la publicité. Elles sont hébergées en Allemagne (Francfort) et conservées tant
          que votre compte existe.
        </p>
      </Section>

      <Section id="hi-coach-suppression" icon="person_remove" title="Supprimer votre compte Hi Coach">
        <p>Depuis l&apos;application Hi Coach : <strong className="text-on-surface">Profil → Supprimer mon compte</strong>. Vous choisissez :</p>
        <ul className="ml-4 list-disc space-y-1.5">
          <li>
            <strong className="text-on-surface">Mes données Hi Coach</strong> — profil santé,
            consentements, repas, frigo, réveils, rappels et matériel sont effacés immédiatement
            et définitivement. Votre compte reste utilisable sur Prixes.
          </li>
          <li>
            <strong className="text-on-surface">Tout mon compte</strong> — les données Hi Coach
            et votre compte de connexion, donc aussi votre accès à Prixes.
          </li>
        </ul>
        <p>
          Sans accès à l&apos;application, écrivez à{" "}
          <a href="mailto:contact@prixes.app?subject=Suppression%20compte%20Hi%20Coach" className="text-primary underline underline-offset-2">
            contact@prixes.app
          </a>{" "}
          depuis l&apos;adresse de votre compte, objet « Suppression compte Hi Coach ». La
          suppression est faite sous 30 jours et vous est confirmée par e-mail. Rien n&apos;est
          conservé, à l&apos;exception des sauvegardes techniques de la base, effacées
          automatiquement au bout de 14 jours.
        </p>
      </Section>

      <Section icon="update" title="Mise à jour">
        <p>Cette page reflète le fonctionnement actuel de l&apos;app. Dernière mise à jour : septembre 2026.</p>
      </Section>
    </div>
  );
}
