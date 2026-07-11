"use client";

import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useState } from "react";

import { Icon } from "@/components/Icon";
import { track } from "@/lib/analytics";
import { useDialog } from "@/lib/useDialog";
import { hasSeenTour, TOUR_STEPS, useTour } from "@/lib/useTour";

const PADDING = 8; // px of breathing room around the spotlighted element
const GAP = 16; // px between the spotlight and the tooltip card

/** Resolve the tour steps that actually apply to the current page — a step whose
 * target isn't in the DOM (e.g. a home-only shortcut, viewed from another route)
 * is silently skipped rather than breaking the tour. */
function resolveSteps() {
  return TOUR_STEPS.filter((s) => s.target === null || document.querySelector(s.target));
}

/** Renders a guided spotlight tour over the real UI. Mounted once, globally. */
export function ProductTour() {
  const pathname = usePathname();
  const { active, stepIndex, start, next, prev, end } = useTour();
  const [steps, setSteps] = useState(TOUR_STEPS);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const dialogRef = useDialog<HTMLDivElement>(active, () => {
    track("tour_skip", pathname);
    end();
  });

  // Auto-start once per browser, only from the home screen (where every
  // spotlighted element — nav, shortcuts, header — is guaranteed to exist).
  useEffect(() => {
    if (pathname !== "/" || hasSeenTour() || active) return;
    const t = setTimeout(() => {
      setSteps(resolveSteps());
      start();
      track("tour_start", "/");
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Recompute the applicable step list every time the tour (re)opens.
  useEffect(() => {
    if (active) setSteps(resolveSteps());
  }, [active]);

  const step = steps[stepIndex];
  const isLast = stepIndex >= steps.length - 1;

  // Defensive: if every remaining step's target vanished (see the skip-forward
  // logic below), stepIndex can run past the end — close cleanly instead of
  // leaving the store stuck "active" with nothing to render.
  useEffect(() => {
    if (active && !step) end();
  }, [active, step, end]);

  // Measure (and re-measure) the current target element.
  useLayoutEffect(() => {
    if (!active || !step) return;
    if (!step.target) {
      setRect(null);
      return;
    }
    const el = document.querySelector<HTMLElement>(step.target);
    if (!el) {
      // Target vanished (e.g. rotated device) — skip forward instead of stalling.
      next();
      return;
    }
    const measure = () => setRect(el.getBoundingClientRect());
    const initial = el.getBoundingClientRect();
    const alreadyVisible =
      initial.top >= 0 &&
      initial.left >= 0 &&
      initial.bottom <= window.innerHeight &&
      initial.right <= window.innerWidth;
    // Fixed/sticky targets (bottom nav, header buttons) are always on-screen by
    // construction — calling scrollIntoView on them anyway causes the browser to
    // loop forever trying to "center" an element whose viewport position never
    // changes no matter how far it scrolls. Only scroll when actually needed
    // (e.g. the home-page shortcut card, which is in normal document flow).
    if (!alreadyVisible) el.scrollIntoView({ block: "center", behavior: "smooth" });
    const t = setTimeout(measure, alreadyVisible ? 0 : 220); // let the smooth scroll settle
    window.addEventListener("resize", measure);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stepIndex, step]);

  if (!active || !step) return null;

  function finish() {
    track("tour_complete", pathname);
    end();
  }
  function handleNext() {
    if (isLast) finish();
    else next();
  }
  function handleSkip() {
    track("tour_skip", pathname);
    end();
  }

  const hole = rect
    ? {
        top: rect.top - PADDING,
        left: rect.left - PADDING,
        width: rect.width + PADDING * 2,
        height: rect.height + PADDING * 2,
      }
    : null;

  // Place the tooltip below the spotlight if there's room, else above it;
  // centered steps (welcome/done) render as a plain centered card.
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const vw = typeof window !== "undefined" ? window.innerWidth : 400;
  const placeBelow = hole ? hole.top + hole.height + 220 < vh : true;
  const cardWidth = Math.min(340, vw - 32);
  const cardStyle: React.CSSProperties = hole
    ? {
        position: "fixed",
        width: cardWidth,
        left: Math.min(Math.max(hole.left + hole.width / 2 - cardWidth / 2, 16), vw - cardWidth - 16),
        top: placeBelow ? hole.top + hole.height + GAP : undefined,
        bottom: placeBelow ? undefined : vh - hole.top + GAP,
      }
    : {
        position: "fixed",
        width: cardWidth,
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
      };

  return (
    <div
      className="fixed inset-0 z-[200]"
      onClick={handleNext}
      role="presentation"
      // When there's a spotlight target, the overlay itself stays transparent —
      // the hole element below paints the dark mask via its own box-shadow, so its
      // interior (the target) is the only part that isn't darkened. For centered
      // steps (no target), the overlay dims the whole screen like a normal modal.
      style={{ background: hole ? "transparent" : "rgba(0,0,0,0.65)" }}
    >
      {/* Spotlight hole: a transparent box whose huge box-shadow paints the dark
          mask everywhere except this rect. */}
      {hole && (
        <div
          className="pointer-events-none absolute rounded-2xl ring-2 ring-primary transition-all duration-300"
          style={{
            top: hole.top,
            left: hole.left,
            width: hole.width,
            height: hole.height,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.65)",
          }}
        />
      )}

      {/* Positioning wrapper — kept separate from the animated panel below so the
          CSS entrance animation (which also animates `transform`) never fights
          with the inline `translate(-50%, -50%)` centering transform. */}
      <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="false"
          aria-label={`Visite guidée — étape ${stepIndex + 1} sur ${steps.length}`}
          tabIndex={-1}
          className="animate-tour-in rounded-2xl bg-surface-container-lowest p-5 shadow-float outline-none"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-micro font-semibold uppercase tracking-wider text-primary">
              {stepIndex + 1} / {steps.length}
            </span>
            <button
              onClick={handleSkip}
              className="rounded-full p-1 text-on-surface-variant hover:bg-surface-container-high"
              aria-label="Passer la visite guidée"
            >
              <Icon name="close" />
            </button>
          </div>

          <h2 className="mb-1 text-headline-md text-on-surface">{step.title}</h2>
          <p className="mb-4 text-body-md text-on-surface-variant">{step.body}</p>

          <div className="flex items-center justify-between gap-2">
            <button
              onClick={handleSkip}
              className="text-label-md text-on-surface-variant underline-offset-2 hover:underline"
            >
              Passer
            </button>
            <div className="flex gap-2">
              {stepIndex > 0 && (
                <button onClick={prev} className="btn-outline px-4 py-2 text-label-md">
                  Retour
                </button>
              )}
              <button onClick={handleNext} className="btn-primary px-5 py-2 text-label-md">
                {isLast ? "Terminer" : "Suivant"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
