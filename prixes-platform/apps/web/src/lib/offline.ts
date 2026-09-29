/**
 * Offline: what the phone keeps so the app still works without a network.
 *
 * - Copies: the last shopping list, menu and account the API returned. Read
 *   back when the network is gone, so "lis ma liste" still answers in a shop
 *   with no signal.
 * - Outbox: list changes made offline (add, tick, remove), sent in order once
 *   the network is back (see flushOutbox in lib/api).
 *
 * localStorage, wrapped: it can be full or blocked, and the app must still run.
 * No imports from lib/api here — it depends on this module.
 */

const PREFIX = "prixes.offline.";
const OUTBOX_KEY = `${PREFIX}outbox`;

/** Fired when the outbox changes, so the offline banner can update its count. */
export const OUTBOX_EVENT = "prixes:outbox";

export function saveCopy(key: string, data: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(data));
  } catch {
    /* full or blocked: the app works online anyway */
  }
}

export function readCopy<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Forget everything kept for offline use — on logout, it is someone's list. */
export function clearOffline(): void {
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith(PREFIX)) localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
  notify();
}

/** fetch() rejects with a TypeError when there is no network (an HTTP error is an ApiError). */
export function isNetworkError(e: unknown): boolean {
  return e instanceof TypeError;
}

export function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export interface OfflineLine {
  barcode: string | null;
  free_text: string | null;
  name: string | null;
  quantity: number;
}

export type OutboxOp =
  | { op: "add"; tempId: string; item: OfflineLine }
  | { op: "update"; id: string; body: { quantity?: number; checked?: boolean } }
  | { op: "remove"; id: string };

export function readOutbox(): OutboxOp[] {
  return readCopy<OutboxOp[]>("outbox") ?? [];
}

export function writeOutbox(ops: OutboxOp[]): void {
  try {
    if (ops.length) localStorage.setItem(OUTBOX_KEY, JSON.stringify(ops));
    else localStorage.removeItem(OUTBOX_KEY);
  } catch {
    /* ignore */
  }
  notify();
}

function notify(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(OUTBOX_EVENT));
}

/** An id for a line that exists only on the phone until the outbox is sent. */
export function tempId(): string {
  return `offline-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function isTempId(id: string): boolean {
  return id.startsWith("offline-");
}
