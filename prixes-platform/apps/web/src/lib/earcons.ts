/**
 * Earcons — the short sounds that go with each voice task.
 *
 * A blind user does not see the cart fill up; they hear it. Each task has its
 * own little sound, synthesised with the Web Audio API (nothing to download,
 * nothing licensed): an item dropping, a success chime, fuel bubbling, a radar
 * ping, a scanner beep. They are quiet and short so they never cover the voice.
 *
 * Silent when the user turned sounds off in the accessibility settings, and a
 * no-op wherever Web Audio is missing.
 */

let ctx: AudioContext | null = null;
let muted = false;

export function setEarconsMuted(value: boolean): void {
  muted = value;
}

function audio(): AudioContext | null {
  if (muted || typeof window === "undefined") return null;
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx ??= new Ctor();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** One enveloped tone: a quick attack, then an exponential fade. */
function tone(
  freq: number,
  at: number,
  duration: number,
  { type = "sine", gain = 0.12, slideTo }: { type?: OscillatorType; gain?: number; slideTo?: number } = {},
): void {
  const ac = audio();
  if (!ac) return;
  const start = ac.currentTime + at;
  const osc = ac.createOscillator();
  const amp = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(gain, start + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(amp).connect(ac.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

export type Earcon = "listen" | "drop" | "success" | "fuel" | "radar" | "plate" | "scan" | "error";

/** Play the sound of a task. `count` repeats the per-item sound (items in a cart). */
export function earcon(kind: Earcon, count = 1): void {
  switch (kind) {
    case "listen": // two rising notes: "I'm listening"
      tone(660, 0, 0.12);
      tone(990, 0.1, 0.16);
      break;
    case "drop": // a soft "tchic" per item falling into the cart
      for (let i = 0; i < Math.min(count, 6); i++) {
        tone(1200 + i * 80, i * 0.16, 0.07, { type: "triangle", gain: 0.1, slideTo: 500 });
      }
      break;
    case "success": // a bright three-note chime
      tone(784, 0, 0.18, { type: "triangle" });
      tone(988, 0.12, 0.18, { type: "triangle" });
      tone(1319, 0.24, 0.32, { type: "triangle", gain: 0.14 });
      break;
    case "fuel": // bubbling: quick random-ish rising blips
      [0, 0.09, 0.17, 0.27, 0.34, 0.45].forEach((t, i) =>
        tone(260 + ((i * 97) % 180), t, 0.08, { gain: 0.08, slideTo: 520 + i * 40 }),
      );
      break;
    case "radar": // a ping that fades like sonar, twice
      tone(1480, 0, 0.5, { gain: 0.07 });
      tone(1480, 0.55, 0.5, { gain: 0.05 });
      break;
    case "plate": // a little "pop" per day of the week
      for (let i = 0; i < Math.min(count, 7); i++) tone(520 + i * 60, i * 0.14, 0.06, { gain: 0.08 });
      break;
    case "scan": // the classic scanner beep
      tone(2090, 0, 0.12, { type: "square", gain: 0.05 });
      break;
    case "error": // a gentle falling two-note
      tone(440, 0, 0.16, { type: "triangle" });
      tone(330, 0.14, 0.24, { type: "triangle" });
      break;
  }
}
