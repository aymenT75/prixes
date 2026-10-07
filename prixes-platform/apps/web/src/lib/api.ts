// Typed fetch client with automatic access-token refresh on 401.
import {
  isNetworkError,
  isTempId,
  readCopy,
  readOutbox,
  saveCopy,
  tempId,
  writeOutbox,
  type OfflineLine,
} from "./offline";
import { tokenStore } from "./tokens";
import type {
  FuelNearbyResult,
  AlertList,
  AlternativesResult,
  AnalyticsSummary,
  BargainsResult,
  FeedbackList,
  GeocodeResult,
  OptimizeResult,
  PriceAlert,
  PriceHistory,
  ProductDetail,
  Product,
  SearchResult,
  ShoppingItem,
  ShoppingList,
  SmartCartResult,
  SplitResult,
  ImportedRecipe,
  BillingStatus,
  MealEquipment,
  MealGoal,
  MealPlan,
  NewsDrop,
  MealPreferences,
  MealStyle,
  StoresNearbyResult,
  TokenPair,
  User,
  ShareState,
} from "./types";

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
const API = BASE ? `${BASE}/api/v1` : "/api/v1";

/** Fired when the API answers 402 — the Premium offer opens on it. */
export const PREMIUM_REQUIRED_EVENT = "prixes:premium-required";

/** A path the API returns ("/api/v1/…"), made loadable from the app's origin. */
export const apiAsset = (path: string) => `${BASE}${path}`;

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function refreshTokens(): Promise<boolean> {
  const refresh = tokenStore.refresh;
  if (!refresh) return false;
  const res = await fetch(`${API}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refresh }),
  });
  if (!res.ok) {
    // Only a refused refresh token ends the session. A 502 while the server
    // restarts for an update used to log everyone out who opened the app in
    // that minute.
    if (res.status === 401 || res.status === 403) tokenStore.clear();
    return false;
  }
  const data = (await res.json()) as TokenPair;
  tokenStore.set(data.access_token, data.refresh_token);
  return true;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const access = tokenStore.access;
  if (access) headers.set("Authorization", `Bearer ${access}`);

  const res = await fetch(`${API}${path}`, { ...init, headers });

  if (res.status === 401 && retry && (await refreshTokens())) {
    return request<T>(path, init, false);
  }
  if (res.status === 402 && typeof window !== "undefined") {
    // A paid feature (billing domain). The Premium offer listens for this, so no
    // caller has to remember to open it.
    window.dispatchEvent(new Event(PREMIUM_REQUIRED_EVENT));
  }
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new ApiError(res.status, (detail as { detail?: string }).detail ?? res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ── Offline ────────────────────────────────────────────────────────────────
// The list, the menu and the account are copied on the phone each time the API
// returns them, and read back when the network is gone. List changes made
// offline go to an outbox (lib/offline) and are applied to the copy at once, so
// the screen and the voice already show them; flushOutbox sends them later.

function offlineItem(id: string, line: OfflineLine): ShoppingItem {
  return {
    id,
    barcode: line.barcode,
    quantity: line.quantity,
    checked: false,
    name: line.name,
    free_text: line.free_text,
    amount: null,
    unit: null,
    source: "manual",
    image_url: null,
    best_price: null,
    nutriscore: null,
    pack: null,
  };
}

function patchListCopy(change: (items: ShoppingItem[]) => ShoppingItem[]): void {
  const copy = readCopy<ShoppingList>("shopping") ?? { items: [], total: 0 };
  saveCopy("shopping", { ...copy, items: change(copy.items) });
}

/** Adds a line while offline: to the outbox, and to the phone's copy of the list. */
function addOffline(line: OfflineLine): ShoppingItem {
  const id = tempId();
  writeOutbox([...readOutbox(), { op: "add", tempId: id, item: line }]);
  const item = offlineItem(id, line);
  patchListCopy((items) => [item, ...items]);
  return item;
}

/**
 * Sends the changes made offline, in order. Stops at the first network failure
 * (the rest waits for the next try); a change the server refuses is dropped
 * rather than retried forever. Returns how many were sent.
 */
export async function flushOutbox(): Promise<number> {
  const ops = readOutbox();
  let sent = 0;
  while (ops.length) {
    const op = ops[0];
    try {
      if (op.op === "add") {
        await request("/shopping/bulk", {
          method: "POST",
          body: JSON.stringify({ items: [{ ...op.item, source: "manual" }] }),
        });
      } else if (op.op === "update") {
        await request(`/shopping/${op.id}`, { method: "PATCH", body: JSON.stringify(op.body) });
      } else {
        await request(`/shopping/${op.id}`, { method: "DELETE" });
      }
      sent += 1;
    } catch (e) {
      if (isNetworkError(e)) break;
      /* refused (e.g. the line was deleted elsewhere): drop it */
    }
    ops.shift();
    writeOutbox(ops);
  }
  return sent;
}

export const api = {
  // ── Auth ──
  register: (body: { email: string; username: string; password: string }) =>
    request<TokenPair>("/auth/register", { method: "POST", body: JSON.stringify(body) }),
  login: (body: { email: string; password: string }) =>
    request<TokenPair>("/auth/login", { method: "POST", body: JSON.stringify(body) }),
  loginFirebase: (id_token: string) =>
    request<TokenPair>("/auth/firebase", { method: "POST", body: JSON.stringify({ id_token }) }),
  me: () =>
    request<User>("/users/me").then((user) => {
      saveCopy("me", user);
      return user;
    }),
  updateMe: (body: { username: string }) =>
    request<User>("/users/me", { method: "PATCH", body: JSON.stringify(body) }),
  exportMyData: () => request<Record<string, unknown>>("/users/me/export"),
  deleteAccount: () => request<void>("/users/me", { method: "DELETE" }),

  // ── Fuel ──
  fuelNearby: (lat: number, lon: number, fuelType?: string, radiusKm = 10) =>
    request<FuelNearbyResult>(
      `/fuel/nearby?lat=${lat}&lon=${lon}&radius_km=${radiusKm}` +
        (fuelType ? `&fuel_type=${fuelType}` : ""),
    ),

  // ── Meta ──
  meta: () =>
    request<{
      tts_enabled: boolean;
      smart_assistant_enabled: boolean;
      meal_plan_enabled: boolean;
      /** False when there is no document store: plans are not remembered. */
      meal_plan_saved: boolean;
      environment: string;
    }>("/meta"),

  // ── Text-to-speech (natural voice) ──
  // Returns an object URL for the MP3, or null when TTS is unavailable (caller then
  // falls back to on-device speech synthesis). Bypasses `request()` since the body is
  // audio, not JSON.
  ttsAudioUrl: async (text: string, voice?: string): Promise<string | null> => {
    try {
      // The natural voice is Premium: the token says who is asking. Without it
      // (or without Premium) the API answers 402 and the device's voice speaks.
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (tokenStore.access) headers.Authorization = `Bearer ${tokenStore.access}`;
      const res = await fetch(`${API}/tts`, {
        method: "POST",
        headers,
        body: JSON.stringify({ text, voice }),
      });
      if (!res.ok) return null;
      return URL.createObjectURL(await res.blob());
    } catch {
      return null;
    }
  },

  // ── Products ──
  browseProducts: (limit = 40) =>
    request<SearchResult>(`/products?limit=${limit}`),
  // Real price drops from our own price history (home screen "Bonnes affaires").
  bargains: (limit = 12) => request<BargainsResult>(`/products/bargains?limit=${limit}`),
  // `stores` are the chains near the user: passing them ranks a price they can
  // actually reach above a cheaper one they cannot.
  searchProducts: (q: string, page = 1, stores: string[] = []) =>
    request<SearchResult>(
      `/products/search?q=${encodeURIComponent(q)}&page=${page}` +
        (stores.length ? `&stores=${encodeURIComponent(stores.join(","))}` : ""),
    ),
  getProduct: (barcode: string) => request<ProductDetail>(`/products/${barcode}`),
  createProduct: (body: { barcode: string; name: string; brand?: string }) =>
    request<Product>(`/products`, { method: "POST", body: JSON.stringify(body) }),
  getPriceHistory: (barcode: string, days = 730) =>
    request<PriceHistory>(`/products/${barcode}/history?days=${days}`),
  getAlternatives: (barcode: string) =>
    request<AlternativesResult>(`/products/${barcode}/alternatives`),
  // AI vision fallback when a scanned barcode isn't in the catalog.
  recognizeProduct: (image: string, media_type: string) =>
    request<{ available: boolean; product_name?: string; brand?: string }>(
      "/products/recognize",
      { method: "POST", body: JSON.stringify({ image, media_type }) },
    ),

  // ── Stores ──
  storesNearby: (lat: number, lon: number, radiusKm = 10, limit = 20) =>
    request<StoresNearbyResult>(
      `/stores/nearby?lat=${lat}&lon=${lon}&radius_km=${radiusKm}&limit=${limit}`,
    ),
  geocodeAddress: (q: string) =>
    request<GeocodeResult>(`/stores/geocode?q=${encodeURIComponent(q)}`),

  // ── Shopping list ──
  // Offline, the phone's copy — with `offline: true`, so the voice can say so.
  getShoppingList: async (): Promise<ShoppingList> => {
    try {
      const list = await request<ShoppingList>("/shopping");
      saveCopy("shopping", list);
      return list;
    } catch (e) {
      if (!isNetworkError(e)) throw e;
      return { ...(readCopy<ShoppingList>("shopping") ?? { items: [], total: 0 }), offline: true };
    }
  },
  addToList: async (body: { barcode: string; quantity?: number; name?: string }): Promise<ShoppingItem> => {
    try {
      return await request<ShoppingItem>("/shopping", { method: "POST", body: JSON.stringify(body) });
    } catch (e) {
      if (!isNetworkError(e)) throw e;
      return addOffline({ barcode: body.barcode, free_text: null, name: body.name ?? null, quantity: body.quantity ?? 1 });
    }
  },
  /** A line by name only ("du lait" said with no network to look it up). */
  addFreeTextToList: async (text: string): Promise<ShoppingItem> => {
    const line = { barcode: null, free_text: text, name: text, quantity: 1 };
    try {
      await request("/shopping/bulk", { method: "POST", body: JSON.stringify({ items: [{ ...line, source: "manual" }] }) });
      return offlineItem(text, line);
    } catch (e) {
      if (!isNetworkError(e)) throw e;
      return addOffline(line);
    }
  },
  updateListItem: async (id: string, body: { quantity?: number; checked?: boolean }): Promise<ShoppingItem> => {
    try {
      return await request<ShoppingItem>(`/shopping/${id}`, { method: "PATCH", body: JSON.stringify(body) });
    } catch (e) {
      if (!isNetworkError(e)) throw e;
      if (!isTempId(id)) writeOutbox([...readOutbox(), { op: "update", id, body }]);
      else if (body.quantity != null) {
        // Not on the server yet: change the queued line itself.
        writeOutbox(
          readOutbox().map((op) =>
            op.op === "add" && op.tempId === id ? { ...op, item: { ...op.item, quantity: body.quantity! } } : op,
          ),
        );
      }
      let updated: ShoppingItem | undefined;
      patchListCopy((items) =>
        items.map((i) => (i.id === id ? (updated = { ...i, ...body }) : i)),
      );
      return updated ?? offlineItem(id, { barcode: null, free_text: null, name: null, quantity: 1 });
    }
  },
  removeListItem: async (id: string): Promise<void> => {
    try {
      await request<void>(`/shopping/${id}`, { method: "DELETE" });
    } catch (e) {
      if (!isNetworkError(e)) throw e;
      writeOutbox(
        isTempId(id)
          ? readOutbox().filter((op) => !(op.op === "add" && op.tempId === id))
          : [...readOutbox(), { op: "remove", id }],
      );
      patchListCopy((items) => items.filter((i) => i.id !== id));
    }
  },
  clearChecked: () => request<{ removed: number }>("/shopping/clear-checked", { method: "POST" }),

  // ── Liste partagée ──
  getShare: () => request<ShareState>("/shopping/share"),
  createShareCode: () => request<ShareState>("/shopping/share/code", { method: "POST" }),
  previewShare: (code: string) =>
    request<{ owner_name: string }>(`/shopping/share/preview?code=${encodeURIComponent(code)}`),
  joinShare: (code: string) =>
    request<ShareState>("/shopping/share/join", { method: "POST", body: JSON.stringify({ code }) }),
  leaveShare: () => request<ShareState>("/shopping/share", { method: "DELETE" }),
  removeShareMember: (id: string) =>
    request<ShareState>(`/shopping/share/members/${id}`, { method: "DELETE" }),
  /** What happened while the app was closed: list price drops, a Sunday menu. */
  getNews: () => request<{ drops: NewsDrop[]; menu_ready: string | null }>("/shopping/news"),
  menuSeen: () => request<void>("/shopping/news/menu-seen", { method: "POST" }),
  // One trolley per store: what to buy where, and what a second stop saves.
  splitBasket: (maxStores = 2) =>
    request<SplitResult>(`/shopping/split?max_stores=${maxStores}`),
  // Cost a basket that isn't saved yet — a generated menu, an imported recipe.

  // ── Smart Assistant ──
  smartCartStatus: () =>
    request<{ available: boolean; rate_per_hour: number }>("/smart-cart/status"),
  // `signal` lets the caller abort on its own deadline: the server gives up at 25s,
  // the UI should not sit past that.
  smartCart: (
    body: {
      prompt: string;
      servings?: number | null;
      avoid_allergens?: string[];
      diets?: string[];
    },
    signal?: AbortSignal,
  ) => request<SmartCartResult>("/smart-cart", { method: "POST", body: JSON.stringify(body), signal }),
  commitSmartCart: (
    draftId: string,
    lines: {
      barcode?: string | null;
      free_text?: string | null;
      name?: string | null;
      quantity: number;
      amount?: number | null;
      unit?: string | null;
    }[],
  ) =>
    request<{ added: number; merged: number }>(`/smart-cart/${draftId}/commit`, {
      method: "POST",
      body: JSON.stringify({ lines }),
    }),

  // ── Menu de la semaine ──
  getMealPlan: async (weekStart?: string): Promise<MealPlan | null> => {
    const key = `menu:${weekStart ?? "current"}`;
    try {
      const plan = await request<MealPlan | null>("/meal-plan" + (weekStart ? `?week_start=${weekStart}` : ""));
      if (plan) saveCopy(key, plan);
      return plan;
    } catch (e) {
      if (!isNetworkError(e)) throw e;
      return readCopy<MealPlan>(key);
    }
  },
  generateMealPlan: (
    body: {
      servings: number;
      meals_per_day: 1 | 2;
      budget_eur?: number | null;
      avoid_allergens?: string[];
      diets?: string[];
      dislikes?: string[];
      goal?: MealGoal | null;
      equipment?: MealEquipment[];
      styles?: MealStyle[];
    },
    signal?: AbortSignal,
  ) => request<MealPlan>("/meal-plan", { method: "POST", body: JSON.stringify(body), signal }),
  // The API sends budget_eur as a decimal string; the form works in numbers.
  /** A dish's photo — drawn on first request. `url` null means: show the icon. */
  mealPhoto: (title: string) =>
    request<{ url: string | null }>("/meal-plan/photo", {
      method: "POST",
      body: JSON.stringify({ title }),
    }),
  // ── Premium ──
  billingStatus: () => request<BillingStatus>("/billing/status"),
  billingCheckout: (plan: "monthly" | "yearly") =>
    request<{ url: string }>("/billing/checkout", {
      method: "POST",
      body: JSON.stringify({ plan }),
    }),
  billingPortal: () => request<{ url: string }>("/billing/portal", { method: "POST" }),
  getMealPreferences: () =>
    request<MealPreferences | null>("/meal-plan/preferences").then((p) =>
      p ? { ...p, budget_eur: p.budget_eur != null ? Number(p.budget_eur) : null } : null,
    ),
  saveMealPreferences: (prefs: MealPreferences) =>
    request<MealPreferences>("/meal-plan/preferences", {
      method: "PUT",
      body: JSON.stringify(prefs),
    }),
  regenerateMeal: (weekStart: string, day: number, slot: string, note?: string) =>
    request<MealPlan>(
      `/meal-plan/${weekStart}/meals/${day}/regenerate?slot=${encodeURIComponent(slot)}`,
      { method: "POST", body: JSON.stringify({ note: note ?? null }) },
    ),
  // Sends the basket the client already has rather than one the server stored —
  // so a week can reach the list even when nothing is persisted.
  addBasketToList: (
    items: {
      barcode?: string | null;
      free_text?: string | null;
      name?: string | null;
      quantity: number;
      amount?: number | null;
      unit?: string | null;
      source?: string;
    }[],
  ) =>
    request<{ added: number; merged: number }>("/shopping/bulk", {
      method: "POST",
      body: JSON.stringify({ items }),
    }),

  // ── Import de recette (JSON-LD schema.org) ──
  importRecipe: (url: string, avoid_allergens: string[] = [], signal?: AbortSignal) =>
    request<ImportedRecipe>("/recipes/import", {
      method: "POST",
      body: JSON.stringify({ url, avoid_allergens }),
      signal,
    }),
  recipeToList: (
    lines: {
      barcode?: string | null;
      free_text?: string | null;
      name?: string | null;
      quantity: number;
      amount?: number | null;
      unit?: string | null;
    }[],
  ) =>
    request<{ added: number; merged: number }>("/recipes/to-list", {
      method: "POST",
      body: JSON.stringify({ lines }),
    }),

  // ── Price alerts ──
  listAlerts: () => request<AlertList>("/alerts"),
  createAlert: (body: { barcode: string; target_price?: number | null }) =>
    request<PriceAlert>("/alerts", { method: "POST", body: JSON.stringify(body) }),
  ackAlert: (id: string) => request<PriceAlert>(`/alerts/${id}/ack`, { method: "POST" }),
  removeAlert: (id: string) => request<void>(`/alerts/${id}`, { method: "DELETE" }),

  // ── Push devices (native) ──
  registerDevice: (body: { token: string; platform: "ios" | "android" | "web" }) =>
    request<{ ok: boolean }>("/devices", { method: "POST", body: JSON.stringify(body) }),
  unregisterDevice: (token: string) =>
    request<void>(`/devices/${encodeURIComponent(token)}`, { method: "DELETE" }),

  // ── Feedback ──
  submitFeedback: (body: { message: string; rating?: number | null; email?: string; page?: string }) =>
    request<{ id: string; ok: boolean }>("/feedback", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  listFeedback: (limit = 100) => request<FeedbackList>(`/feedback?limit=${limit}`),

  // ── Analytics (admin read) ──
  analyticsSummary: (days = 14) => request<AnalyticsSummary>(`/analytics/summary?days=${days}`),
};
