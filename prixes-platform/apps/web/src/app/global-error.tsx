"use client";

// Catches errors in the root layout itself. Must render its own <html>/<body>.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="fr">
      <body
        style={{
          display: "flex",
          minHeight: "100vh",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: "2rem",
          background: "#faf9f5",
          color: "#1b1c1a",
        }}
      >
        <h1 style={{ fontSize: "1.4rem", fontWeight: 800 }}>Une erreur critique est survenue</h1>
        <p style={{ color: "#3e4942" }}>Rechargez l&apos;application.</p>
        <button
          onClick={reset}
          style={{
            background: "#006b47",
            color: "#fff",
            border: "none",
            borderRadius: "9999px",
            padding: "0.6rem 1.5rem",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Recharger
        </button>
        {error?.digest && <small style={{ color: "#6e7a71" }}>Réf : {error.digest}</small>}
      </body>
    </html>
  );
}
