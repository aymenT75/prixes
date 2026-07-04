"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Icon } from "@/components/Icon";
import { useA11y } from "@/lib/useA11y";
import {
  createRecognizer,
  parseIntent,
  readPageAloud,
  speak,
  speechSupported,
  stopSpeaking,
  vibrate,
} from "@/lib/voice";

type Phase = "idle" | "listening" | "responding" | "error";

export function VoiceAssistant() {
  const router = useRouter();
  const a11y = useA11y();
  const open = useA11y((s) => s.voiceOpen);
  const setOpen = useA11y((s) => s.setVoiceOpen);
  const [phase, setPhase] = useState<Phase>("idle");
  const [transcript, setTranscript] = useState("");
  const [response, setResponse] = useState("");
  const [supported, setSupported] = useState(true);
  const [handsFree, setHandsFree] = useState(false);
  const recRef = useRef<ReturnType<typeof createRecognizer>>(null);
  const handledRef = useRef(false);
  const handsFreeRef = useRef(false);
  const openRef = useRef(false);
  const startRef = useRef<() => void>(() => {});

  useEffect(() => {
    setSupported(speechSupported());
  }, []);
  useEffect(() => {
    handsFreeRef.current = handsFree;
  }, [handsFree]);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const act = useCallback(
    (text: string) => {
      const intent = parseIntent(text);
      let say = intent.say;
      switch (intent.type) {
        case "navigate":
          router.push(intent.path);
          break;
        case "search":
          router.push(`/courses?q=${encodeURIComponent(intent.query)}`);
          break;
        case "setting":
          if (intent.action === "dark") a11y.setDark(true);
          else if (intent.action === "light") a11y.setDark(false);
          else if (intent.action === "bigger") a11y.biggerText();
          else if (intent.action === "smaller") a11y.smallerText();
          else if (intent.action === "contrast") a11y.toggleContrast();
          break;
        case "read": {
          const content = readPageAloud();
          say = content || "Il n'y a rien à lire sur cette page.";
          break;
        }
        case "help":
        case "unknown":
          break;
      }
      setResponse(say);
      setPhase("responding");
      vibrate(30);
      speak(say, () => {
        setPhase("idle");
        // Hands-free: keep the conversation going.
        if (handsFreeRef.current && openRef.current) setTimeout(() => startRef.current(), 500);
      });
    },
    [router, a11y],
  );

  const startListening = useCallback(() => {
    if (!speechSupported()) {
      setSupported(false);
      return;
    }
    stopSpeaking();
    handledRef.current = false;
    setTranscript("");
    setResponse("");
    const rec = createRecognizer();
    if (!rec) {
      setSupported(false);
      return;
    }
    recRef.current = rec;
    rec.onresult = (e: any) => {
      let txt = "";
      for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript;
      setTranscript(txt);
      if (e.results[e.results.length - 1].isFinal && !handledRef.current) {
        handledRef.current = true;
        act(txt);
      }
    };
    rec.onerror = (e: any) => {
      setPhase("error");
      setResponse(
        e?.error === "not-allowed"
          ? "Je n'ai pas accès au micro. Autorisez le microphone dans le navigateur."
          : "Je n'ai pas pu écouter. Réessayez.",
      );
    };
    rec.onend = () => {
      setPhase((p) => (p === "listening" ? "idle" : p));
    };
    try {
      rec.start();
      setPhase("listening");
      vibrate(30);
    } catch {
      /* already started */
    }
  }, [act]);

  useEffect(() => {
    startRef.current = startListening;
  }, [startListening]);

  // When the assistant is opened (from the accessibility sheet), greet + listen.
  const greetedRef = useRef(false);
  useEffect(() => {
    if (open && !greetedRef.current) {
      greetedRef.current = true;
      speak("Je vous écoute.");
      setTimeout(startListening, 350);
    } else if (!open) {
      greetedRef.current = false;
    }
  }, [open, startListening]);

  const close = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      /* ignore */
    }
    stopSpeaking();
    setOpen(false);
    setPhase("idle");
  }, [setOpen]);

  // Launcher lives in the top header (PageHeader); this only renders the overlay.
  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Assistant vocal Prixes"
          className="fixed inset-0 z-[70] flex flex-col items-center justify-end bg-black/50 backdrop-blur-sm"
          onClick={close}
        >
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-3xl bg-surface-container-lowest p-6 pb-10 shadow-float"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 -mx-6 -mt-6 mb-4 flex items-center justify-between bg-surface-container-lowest px-6 pb-3 pt-6">
              <h2 className="text-headline-md text-on-surface">Assistant vocal</h2>
              <button
                onClick={close}
                aria-label="Fermer l'assistant"
                className="rounded-full p-2 text-on-surface-variant hover:bg-surface-container-high"
              >
                <Icon name="close" />
              </button>
            </div>

            {!supported ? (
              <p className="rounded-xl bg-warning-soft p-4 text-body-md text-on-surface">
                {"La reconnaissance vocale n'est pas disponible sur ce navigateur. Essayez Chrome ou Safari. Vous pouvez aussi tout faire au toucher."}
              </p>
            ) : (
              <>
                {/* Animated mic */}
                <div className="flex flex-col items-center gap-3 py-2">
                  <button
                    onClick={startListening}
                    aria-label="Parler"
                    className={`relative flex h-24 w-24 items-center justify-center rounded-full text-on-primary transition-all ${
                      phase === "listening" ? "bg-deal-accent" : "bg-primary"
                    }`}
                  >
                    {phase === "listening" && (
                      <span className="absolute inset-0 animate-ping rounded-full bg-deal-accent/40" />
                    )}
                    <Icon name={phase === "listening" ? "graphic_eq" : "mic"} fill className="text-[44px]" />
                  </button>
                  <p className="text-label-lg text-on-surface-variant" aria-live="polite">
                    {phase === "listening"
                      ? "Je vous écoute…"
                      : phase === "responding"
                        ? "…"
                        : "Appuyez et parlez"}
                  </p>
                </div>

                {/* Live transcript + response (also visible for deaf/HoH users) */}
                <div className="mt-3 min-h-[44px] space-y-2" aria-live="polite">
                  {transcript && (
                    <p className="rounded-xl bg-surface-container px-4 py-3 text-body-lg text-on-surface">
                      « {transcript} »
                    </p>
                  )}
                  {response && (
                    <p className="rounded-xl bg-primary/10 px-4 py-3 text-body-lg text-primary">
                      {response}
                    </p>
                  )}
                </div>

                {/* Hands-free toggle */}
                <button
                  onClick={() => setHandsFree((v) => !v)}
                  role="switch"
                  aria-checked={handsFree}
                  className="mt-4 flex w-full items-center justify-between rounded-xl border border-outline-variant/30 p-3 text-left"
                >
                  <span className="flex items-center gap-2 text-label-lg text-on-surface">
                    <Icon name="hearing" className="text-primary" /> Écoute mains-libres
                  </span>
                  <span
                    className={`relative h-7 w-12 rounded-full transition-colors ${handsFree ? "bg-primary" : "bg-surface-variant"}`}
                  >
                    <span
                      className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${handsFree ? "left-6" : "left-1"}`}
                    />
                  </span>
                </button>

                {/* Example commands */}
                <div className="mt-4 flex flex-wrap gap-2">
                  {["Cherche du lait", "Carburant le moins cher", "Les bons plans", "Agrandis le texte"].map(
                    (ex) => (
                      <button
                        key={ex}
                        onClick={() => act(ex)}
                        className="chip chip-idle text-label-md"
                      >
                        {ex}
                      </button>
                    ),
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
