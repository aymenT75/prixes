"use client";

import Link from "next/link";

import { LegalSection } from "@/components/LegalSection";
import { PageHeader } from "@/components/PageHeader";
import { LEGAL } from "@/lib/legal";

const link = "text-primary underline underline-offset-2";

/**
 * Déclaration d'accessibilité (RGAA 4.1). Without an audit by an independent body
 * the rules say the service must be declared « non conforme », so it is, and the
 * page says plainly what has been done and what has not been checked yet.
 */
export default function AccessibilitePage() {
  return (
    <div>
      <PageHeader title="Accessibilité" back />

      <LegalSection icon="info" title="État de conformité">
        <p>
          <strong className="text-on-surface">Prixes est non conforme</strong> au référentiel général
          d&apos;amélioration de l&apos;accessibilité (RGAA 4.1), parce qu&apos;aucun audit complet n&apos;a encore
          été fait par un organisme indépendant. C&apos;est la règle tant qu&apos;il n&apos;y a pas eu d&apos;audit.
        </p>
        <p>Déclaration établie le 6 novembre 2026, pour l&apos;application iPhone et le site prixes.app.</p>
      </LegalSection>

      <LegalSection icon="checklist" title="Ce qui est déjà en place">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Tout peut se faire à la voix : la liste, le magasin le moins cher, le guidage dans les rayons.</li>
          <li>Des boutons d&apos;au moins 64 pixels de haut, avec une icône et un mot.</li>
          <li>Des contrastes mesurés : au moins 4,5 pour 1 pour le texte, de jour comme de nuit.</li>
          <li>Un thème Nuit, trois tailles de texte, et le zoom permis jusqu&apos;à 500 %.</li>
          <li>Sur ordinateur, tout se fait au clavier, avec un contour épais sur l&apos;élément choisi.</li>
          <li>Chaque bouton et chaque champ porte un nom lu par VoiceOver et les lecteurs d&apos;écran.</li>
          <li>Les allergies sont signalées par un texte et une icône, jamais par la seule couleur.</li>
          <li>Les animations s&apos;arrêtent quand « Réduire les animations » est activé.</li>
          <li>Un test automatique (axe-core) ne relève aucune erreur sur les 11 écrans de l&apos;app.</li>
        </ul>
      </LegalSection>

      <LegalSection icon="warning" title="Ce qui n'a pas encore été vérifié">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>L&apos;usage complet avec VoiceOver sur un vrai iPhone.</li>
          <li>Des essais avec des personnes malvoyantes ou en situation de handicap moteur.</li>
          <li>Les pages de textes légaux, longues et denses, restent difficiles à lire.</li>
        </ul>
      </LegalSection>

      <LegalSection icon="chat" title="Vous n'arrivez pas à utiliser une partie de Prixes ?">
        <p>
          Dites-le-nous, nous vous répondrons et vous donnerons l&apos;information autrement : par le formulaire{" "}
          <Link href="/feedback" className={link}>
            Donner mon avis
          </Link>
          , ou par e-mail à <span className="select-all text-on-surface">{LEGAL.email}</span>.
        </p>
      </LegalSection>

      <LegalSection icon="badge" title="Voies de recours">
        <p>
          Si vous nous avez signalé un problème et que la réponse ne vous convient pas, vous pouvez saisir le
          Défenseur des droits :
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            par le formulaire en ligne sur{" "}
            <a href="https://www.defenseurdesdroits.fr" className={link}>
              defenseurdesdroits.fr
            </a>
            &nbsp;;
          </li>
          <li>par téléphone au 09 69 39 00 00&nbsp;;</li>
          <li>
            par courrier, sans timbre : Défenseur des droits, Libre réponse 71120, 75342 Paris CEDEX 07.
          </li>
        </ul>
      </LegalSection>

      <LegalSection icon="database" title="Comment ce site est fait">
        <p>
          HTML, CSS et JavaScript (Next.js) ; l&apos;app iPhone est le même code dans Capacitor. Tests faits avec
          Chromium et axe-core, sur un écran de téléphone (390 pixels) et d&apos;ordinateur (1280 pixels).
        </p>
      </LegalSection>
    </div>
  );
}
