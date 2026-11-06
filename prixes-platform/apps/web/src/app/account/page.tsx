"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Arrow, Icon, Tick } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { api } from "@/lib/api";
import { announce } from "@/lib/say";
import { useApp } from "@/lib/store";
import { ALL_ALLERGENS, useA11y, type FontScale } from "@/lib/useA11y";

const SIZES: { key: FontScale; label: string; a: number }[] = [
  { key: "normal", label: "Grand", a: 28 },
  { key: "large", label: "Très grand", a: 38 },
  { key: "xl", label: "Maximum", a: 50 },
];

/** Réglages: the theme, the voice and the allergies. The account comes after. */
export default function SettingsPage() {
  const { user, openLogin, logout } = useApp();
  const a11y = useA11y();
  const { data: meta } = useQuery({ queryKey: ["meta"], queryFn: () => api.meta() });
  const [busy, setBusy] = useState(false);
  // The static export knows no stored setting while it renders.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  async function exportData() {
    setBusy(true);
    try {
      const data = await api.exportMyData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "mes-donnees-prixes.json";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccount() {
    if (!confirm("Supprimer définitivement votre compte ? Cette action est irréversible.")) return;
    setBusy(true);
    try {
      await api.deleteAccount();
      logout();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="-mx-4 flex flex-col pb-6">
      <div className="px-4">
        <PageHeader title="Réglages" />
      </div>

      {mounted && (
        <>
          <Toggle
            icon="dark_mode"
            title="Thème Nuit"
            on={a11y.dark}
            onChange={() => {
              a11y.toggleDark();
              announce(a11y.dark ? "Thème Jour." : "Thème Nuit.");
            }}
          />

          <h2 className="section-title">Taille du texte</h2>
          <div role="radiogroup" aria-label="Taille du texte" className="grid grid-cols-3 gap-2 px-5">
            {SIZES.map((s) => (
              <button
                key={s.key}
                role="radio"
                aria-checked={a11y.fontScale === s.key}
                aria-label={s.label}
                onClick={() => {
                  a11y.setFontScale(s.key);
                  announce(`Taille ${s.label}.`);
                }}
                className="size-tile"
              >
                <b aria-hidden className="leading-none" style={{ fontSize: s.a }}>
                  A
                </b>
                {s.label}
              </button>
            ))}
          </div>

          <h2 className="section-title">La voix</h2>
          <Toggle
            icon="record_voice_over"
            title="Lire les écrans à voix haute"
            hint="Se tait quand VoiceOver est actif"
            on={a11y.speakScreens}
            onChange={() => a11y.setSpeakScreens(!a11y.speakScreens)}
          />
          <Toggle
            icon="forum"
            title="Le micro se rouvre tout seul"
            hint="Dites « merci » pour finir"
            on={a11y.conversation}
            onChange={() => a11y.setConversation(!a11y.conversation)}
          />
          <Toggle
            icon="mic"
            title="Écouter dès l'ouverture"
            on={a11y.listenOnOpen}
            onChange={() => a11y.setListenOnOpen(!a11y.listenOnOpen)}
          />
          {meta?.tts_enabled && (
            <Toggle
              icon="graphic_eq"
              title="Voix naturelle"
              hint="Nécessite une connexion"
              on={a11y.naturalVoice}
              onChange={() => a11y.setNaturalVoice(!a11y.naturalVoice)}
            />
          )}

          <h2 className="section-title">Mes allergies</h2>
          <p className="px-5 pb-3 text-[20px] leading-snug text-on-surface">
            Je vous préviens, à l&apos;écran et à voix haute, quand un produit en contient.
          </p>
          <div className="flex flex-wrap gap-2 px-5">
            {ALL_ALLERGENS.map((a) => {
              const on = a11y.allergens.includes(a);
              return (
                <button
                  key={a}
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => a11y.toggleAllergen(a)}
                  className="pill-check"
                >
                  {on && <Tick size={26} />}
                  {a}
                </button>
              );
            })}
          </div>
        </>
      )}

      <h2 className="section-title mt-2">Mon compte</h2>
      {user ? (
        <>
          <p className="break-words px-5 pb-2 text-[22px] text-on-surface">{user.username}</p>
          {(user.role === "admin" || user.role === "moderator") && (
            <>
              <Row href="/admin/feedback" icon="reviews" title="Avis reçus" />
              <Row href="/admin/analytics" icon="bar_chart" title="Statistiques d'usage" />
            </>
          )}
          <Row onClick={logout} icon="logout" title="Se déconnecter" />
          <Row onClick={exportData} disabled={busy} icon="download" title="Exporter mes données" />
          <Row onClick={deleteAccount} disabled={busy} icon="delete" title="Supprimer mon compte" />
        </>
      ) : (
        <div className="px-4">
          <button onClick={() => openLogin(true)} className="big-btn big-btn-main">
            <Icon name="login" className="text-[44px]" /> Se connecter
          </button>
        </div>
      )}

      <h2 className="section-title mt-2">Informations</h2>
      <Row href="/feedback" icon="chat" title="Donner mon avis" />
      <Row href="/sources" icon="database" title="D'où viennent les prix" />
      <Row href="/privacy" icon="privacy_tip" title="Confidentialité" />
      <Row href="/conditions" icon="list_alt" title="Conditions" />
      <Row href="/mentions-legales" icon="badge" title="Mentions légales" />
    </div>
  );
}

const ROW = "hair-row text-[24px]";

function Row({
  icon,
  title,
  href,
  onClick,
  disabled,
}: {
  icon: string;
  title: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const inner = (
    <>
      <Icon name={icon} className="text-[32px]" />
      <span className="min-w-0 flex-1 break-words">{title}</span>
      {href && <Arrow size={28} />}
    </>
  );
  return href ? (
    <Link href={href} className={ROW}>
      {inner}
    </Link>
  ) : (
    <button onClick={onClick} disabled={disabled} className={ROW}>
      {inner}
    </button>
  );
}

function Toggle({
  icon,
  title,
  hint,
  on,
  onChange,
}: {
  icon: string;
  title: string;
  hint?: string;
  on: boolean;
  onChange: () => void;
}) {
  return (
    <button role="switch" aria-checked={on} onClick={onChange} className={ROW}>
      <Icon name={icon} className="text-[32px]" />
      <span className="min-w-0 flex-1 break-words">
        {title}
        {hint && <span className="mt-0.5 block text-[20px] font-normal text-on-surface-variant">{hint}</span>}
      </span>
      {/* In words, not only in colour. */}
      <span className="w-10 flex-shrink-0 text-right text-[21px] font-normal">{on ? "Oui" : "Non"}</span>
      <span aria-hidden className="switch" data-on={on} />
    </button>
  );
}
