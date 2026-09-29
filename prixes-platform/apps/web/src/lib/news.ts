/**
 * What happened while the app was closed — the list's price drops and a Sunday
 * menu waiting (GET /shopping/news). The assistant says it the first time it
 * opens; the home page shows it until then.
 *
 * "Since your last visit" is kept on the phone: the time of the newest drop
 * already told. The Sunday menu is marked seen on the server once offered.
 */
import { create } from "zustand";

import { api } from "./api";
import { useApp } from "./store";
import { useA11y } from "./useA11y";
import type { NewsDrop } from "./types";

const SEEN_KEY = "prixes.news.seen";

interface NewsState {
  drops: NewsDrop[];
  menuWeek: string | null;
}

export const useNews = create<NewsState>(() => ({ drops: [], menuWeek: null }));

function seenUntil(): string {
  try {
    return localStorage.getItem(SEEN_KEY) ?? "";
  } catch {
    return "";
  }
}

/** Waits until we know whether someone is signed in (at most a few seconds). */
function signedIn(): Promise<boolean> {
  return new Promise((resolve) => {
    const done = () => resolve(!!useApp.getState().user);
    if (!useApp.getState().loading) return done();
    const stop = useApp.subscribe((s) => {
      if (!s.loading) {
        stop();
        done();
      }
    });
    setTimeout(() => {
      stop();
      done();
    }, 4000);
  });
}

let loading: Promise<void> | null = null;

/** Once per launch (or again with `fresh`, when a notification is tapped). */
export function loadNews(fresh = false): Promise<void> {
  if (fresh) loading = null;
  loading ??= (async () => {
    if (!(await signedIn())) return;
    const news = await api.getNews();
    const since = seenUntil();
    useNews.setState({
      drops: news.drops.filter((d) => d.at > since),
      menuWeek: news.menu_ready,
    });
    void keepMenuSafe();
  })().catch(() => {
    /* offline or signed out: no news is fine */
  });
  return loading;
}

/**
 * The Sunday menu is composed on the server, which only knows the allergies the
 * app copies to it. Re-copy them at each launch when they changed on the phone.
 */
async function keepMenuSafe(): Promise<void> {
  const prefs = await api.getMealPreferences();
  if (!prefs?.auto_week) return;
  const { allergens, diets } = useA11y.getState();
  const same = (a: string[] = [], b: string[] = []) => [...a].sort().join() === [...b].sort().join();
  if (same(prefs.avoid_allergens, allergens) && same(prefs.diets, diets)) return;
  await api.saveMealPreferences({ ...prefs, avoid_allergens: allergens, diets });
}

/** "40 centimes", "1,20 €" — a price cut the way it is said. */
export function spokenCut(euros: number): string {
  if (euros < 1) return `${Math.round(euros * 100)} centimes`;
  return `${euros.toFixed(2).replace(".", ",")} €`;
}

/** One sentence for the drops, or null. */
export function dropsSentence(drops: NewsDrop[]): string | null {
  if (!drops.length) return null;
  const line = (d: NewsDrop) => {
    const now = Number(d.new);
    return `${d.name}, moins ${spokenCut(Number(d.old) - now)}, maintenant ${now.toFixed(2).replace(".", ",")} €`;
  };
  if (drops.length === 1) return `Bonne nouvelle sur votre liste : ${line(drops[0])}.`;
  const shown = drops.slice(0, 3).map(line).join(" ; ");
  const rest = drops.length - 3;
  const more = rest > 0 ? ` Et ${rest} autre${rest > 1 ? "s" : ""}.` : "";
  return `${drops.length} produits de votre liste ont baissé : ${shown}.${more}`;
}

/** The news was said: don't say it again, and hide the home card. */
export function markNewsTold(): void {
  const { drops } = useNews.getState();
  const newest = drops.reduce((m, d) => (d.at > m ? d.at : m), seenUntil());
  try {
    if (newest) localStorage.setItem(SEEN_KEY, newest);
  } catch {
    /* ignore */
  }
  useNews.setState({ drops: [] });
}

/** The Sunday menu was offered once: not again at every opening. */
export function markMenuOffered(): void {
  useNews.setState({ menuWeek: null });
  void api.menuSeen().catch(() => {});
}
