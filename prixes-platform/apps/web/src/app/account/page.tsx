"use client";

import { useState, useEffect } from "react";

import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/PageHeader";
import { api } from "@/lib/api";
import { useApp } from "@/lib/store";
import { useA11y } from "@/lib/useA11y";

export default function AccountPage() {
  const { user, openLogin, logout, setUser } = useApp();
  const { dark: isDark, toggleDark: toggle } = useA11y();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!user) {
    return (
      <div>
        <PageHeader title="Profil" />
        <div className="card flex flex-col items-center gap-3 p-10 text-center">
          <Icon name="account_circle" className="text-[48px] text-outline-variant" />
          <p className="text-on-surface-variant">Connectez-vous pour gérer votre compte.</p>
          <button onClick={() => openLogin(true)} className="btn-primary">
            Se connecter
          </button>
        </div>
      </div>
    );
  }

  async function saveUsername() {
    if (!draftName.trim()) return;
    setBusy(true);
    setSaveError(null);
    try {
      const updated = await api.updateMe({ username: draftName.trim() });
      setUser(updated);
      setEditing(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

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

  const stats = [
    { icon: "sell", label: "Deals partagés", value: user.deals_count, box: "bg-primary/10 text-primary" },
    { icon: "favorite", label: "Votes reçus", value: user.votes_received, box: "bg-secondary/10 text-secondary" },
    { icon: "analytics", label: "Contributions", value: user.reputation, box: "bg-tertiary/10 text-tertiary" },
  ];

  return (
    <div>
      <PageHeader title="Profil" />

      {/* Profile header */}
      <section className="card mb-6 flex flex-col items-center p-6 text-center">
        <div className="relative">
          <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-primary/10 bg-primary text-headline-xl text-on-primary shadow-lg">
            {user.initials}
          </div>
          {user.is_verified && (
            <span className="absolute bottom-0 right-0 grid place-items-center rounded-full border-2 border-white bg-primary p-1 text-on-primary">
              <Icon name="verified" fill className="text-[16px]" />
            </span>
          )}
        </div>
        {editing ? (
          <div className="mt-3 flex flex-col items-center gap-2">
            <input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              maxLength={64}
              aria-label="Nouveau pseudo"
              className="rounded-lg border border-outline bg-surface px-3 py-1 text-center text-body-lg text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {saveError && (
              <p role="alert" className="text-label-sm text-error">
                {saveError}
              </p>
            )}
            <div className="flex gap-2">
              <button onClick={saveUsername} disabled={busy} className="btn-primary px-4 py-1 text-label-md">
                Enregistrer
              </button>
              <button
                onClick={() => { setEditing(false); setSaveError(null); }}
                className="btn-outline px-4 py-1 text-label-md"
              >
                Annuler
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-2">
            <h2 className="text-headline-lg text-on-surface">{user.username}</h2>
            <button
              onClick={() => { setDraftName(user.username); setEditing(true); }}
              aria-label="Modifier le pseudo"
            >
              <Icon name="edit" className="text-[18px] text-outline-variant hover:text-primary" />
            </button>
          </div>
        )}
        <div className="mt-1 flex items-center gap-2 rounded-full bg-primary/5 px-3 py-1 text-primary">
          <Icon name="workspace_premium" fill className="text-[18px]" />
          <span className="text-label-lg">{user.reputation} points de réputation</span>
        </div>
      </section>

      {/* Stats */}
      <section className="mb-6 grid grid-cols-3 gap-gutter">
        {stats.map((s) => (
          <div key={s.label} className="card flex flex-col items-center gap-2 p-4 text-center">
            <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${s.box}`}>
              <Icon name={s.icon} fill className="text-[20px]" />
            </span>
            <p className="text-headline-md text-on-surface">{s.value}</p>
            <p className="text-micro uppercase tracking-wider text-on-surface-variant">{s.label}</p>
          </div>
        ))}
      </section>

      {/* Settings */}
      <section className="card p-2">
        <Row icon="dark_mode" title="Mode sombre" subtitle="Changer le thème">
          {mounted && (
            <label className="relative inline-flex cursor-pointer items-center">
              <input type="checkbox" className="peer sr-only" aria-label="Mode sombre" checked={isDark} onChange={toggle} />
              <div className="h-6 w-11 rounded-full bg-surface-variant after:absolute after:start-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-on-surface after:transition-all after:content-[''] peer-checked:bg-primary peer-checked:after:translate-x-full" />
            </label>
          )}
        </Row>
        <Hr />
        <button onClick={exportData} disabled={busy} className="w-full">
          <Row icon="download" title="Exporter mes données" subtitle="RGPD — portabilité">
            <Icon name="chevron_right" className="text-outline-variant" />
          </Row>
        </button>
        <Hr />
        <button onClick={logout} className="w-full">
          <Row icon="logout" title="Se déconnecter" subtitle="">
            <Icon name="chevron_right" className="text-outline-variant" />
          </Row>
        </button>
        <Hr />
        <button onClick={deleteAccount} disabled={busy} className="w-full">
          <Row icon="delete" title="Supprimer mon compte" subtitle="Action irréversible" danger>
            <Icon name="chevron_right" className="text-error/60" />
          </Row>
        </button>
      </section>

      <p className="mt-6 text-center text-micro uppercase tracking-[0.2em] text-outline">
        Prixes · v2.0
      </p>
    </div>
  );
}

function Row({
  icon,
  title,
  subtitle,
  danger = false,
  children,
}: {
  icon: string;
  title: string;
  subtitle: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between p-3">
      <div className="flex items-center gap-3">
        <span
          className={`flex h-10 w-10 items-center justify-center rounded-full border border-outline-variant/30 ${
            danger ? "text-error" : "bg-surface text-primary"
          }`}
        >
          <Icon name={icon} className="text-[20px]" />
        </span>
        <div className="text-left">
          <p className={`text-label-lg ${danger ? "text-error" : "text-on-surface"}`}>{title}</p>
          {subtitle && <p className="text-micro text-on-surface-variant">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

function Hr() {
  return <hr className="border-outline-variant/20" />;
}
