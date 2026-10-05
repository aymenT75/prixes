// Who publishes Prixes, in one place. The legal pages (mentions légales,
// conditions, confidentialité) all read from here, so the day the company is
// registered only this file changes.
//
// A field left null is shown as "en cours d'immatriculation" rather than as a
// placeholder: the pages stay truthful while the company does not exist yet.

export const LEGAL = {
  /** Trading name of the service. */
  brand: "Prixes",
  /** Registered company name, e.g. "Prixes SAS". */
  company: null as string | null,
  /** Legal form and share capital, e.g. "SASU au capital de 1 000 €". */
  form: null as string | null,
  /** 9-digit SIREN, e.g. "123 456 789". */
  siren: null as string | null,
  /** RCS registration, e.g. "RCS Paris 123 456 789". */
  rcs: null as string | null,
  /** Intra-EU VAT number, once there is one. */
  vat: null as string | null,
  /** Registered office address. */
  address: null as string | null,
  /** Directeur de la publication (LCEN art. 6). */
  publisher: "Aymen Tounsi",
  email: "contact@prixes.app",
  /** Consumer mediator the company joins (Code de la consommation, art. L612-1). */
  mediator: null as { name: string; url: string } | null,
  host: {
    name: "DigitalOcean, LLC",
    address: "101 6th Avenue, New York, NY 10013, États-Unis",
    where: "serveurs situés à Francfort, Allemagne",
    url: "https://www.digitalocean.com",
  },
  premium: {
    monthly: "2,99 €",
    yearly: "24,99 €",
  },
  updated: "octobre 2026",
};

export const PENDING = "en cours d'immatriculation";
