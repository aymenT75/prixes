// Typed fetch client with automatic access-token refresh on 401.
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
  MealEquipment,
  MealGoal,
  MealPlan,
  MealPreferences,
  MealStyle,
  StoresNearbyResult,
  TokenPair,
  User,
} from "./types";

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
const API = BASE ? `${BASE}/api/v1` : "/api/v1";

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
    tokenStore.clear();
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
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new ApiError(res.status, (detail as { detail?: string }).detail ?? res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  // ── Auth ──
  register: (body: { email: string; username: string; password: string }) =>
    request<TokenPair>("/auth/register", { method: "POST", body: JSON.stringify(body) }),
  login: (body: { email: string; password: string }) =>
    request<TokenPair>("/auth/login", { method: "POST", body: JSON.stringify(body) }),
  loginGoogle: (id_token: string) =>
    request<TokenPair>("/auth/google", { method: "POST", body: JSON.stringify({ id_token }) }),
  loginFirebase: (id_token: string) =>
    request<TokenPair>("/auth/firebase", { method: "POST", body: JSON.stringify({ id_token }) }),
  me: () => request<User>("/users/me"),
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
      const res = await fetch(`${API}/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
  getShoppingList: () => request<ShoppingList>("/shopping"),
  addToList: (body: { barcode: string; quantity?: number; name?: string }) =>
    request<ShoppingItem>("/shopping", { method: "POST", body: JSON.stringify(body) }),
  updateListItem: (id: string, body: { quantity?: number; checked?: boolean }) =>
    request<ShoppingItem>(`/shopping/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  removeListItem: (id: string) => request<void>(`/shopping/${id}`, { method: "DELETE" }),
  clearChecked: () => request<{ removed: number }>("/shopping/clear-checked", { method: "POST" }),
  optimizeBasket: () => request<OptimizeResult>("/shopping/optimize"),
  // One trolley per store: what to buy where, and what a second stop saves.
  splitBasket: (maxStores = 2) =>
    request<SplitResult>(`/shopping/split?max_stores=${maxStores}`),
  // Cost a basket that isn't saved yet — a generated menu, an imported recipe.
  optimizeLines: (lines: { barcode: string; quantity?: number; label?: string }[]) =>
    request<OptimizeResult>("/shopping/optimize-basket", {
      method: "POST",
      body: JSON.stringify({ lines }),
    }),

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
  getMealPlan: (weekStart?: string) =>
    request<MealPlan | null>("/meal-plan" + (weekStart ? `?week_start=${weekStart}` : "")),
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
