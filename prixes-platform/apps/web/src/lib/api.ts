// Typed fetch client with automatic access-token refresh on 401.
import { tokenStore } from "./tokens";
import type {
  AlertList,
  AlternativesResult,
  AnalyticsSummary,
  Deal,
  FeedbackList,
  FeedPage,
  GeocodeResult,
  OptimizeResult,
  PriceAlert,
  PriceHistory,
  ProductDetail,
  Product,
  ShoppingItem,
  ShoppingList,
  StoresNearbyResult,
  TokenPair,
  User,
} from "./types";

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
const API = `${BASE}/api/v1`;

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

  // ── Deals ──
  listDeals: (sort: "hot" | "new" = "hot", cursor = 0) =>
    request<FeedPage>(`/deals?sort=${sort}&cursor=${cursor}`),
  getDeal: (id: string) => request<Deal>(`/deals/${id}`),
  createDeal: (body: Record<string, unknown>) =>
    request<Deal>("/deals", { method: "POST", body: JSON.stringify(body) }),
  voteDeal: (id: string, value: 1 | -1) =>
    request<Deal>(`/deals/${id}/vote`, { method: "POST", body: JSON.stringify({ value }) }),
  deleteDeal: (id: string) => request<void>(`/deals/${id}`, { method: "DELETE" }),
  recognizeDeal: (image: string, media_type: string) =>
    request<{ available: boolean; product_name: string | null; brand: string | null }>(
      "/deals/recognize",
      { method: "POST", body: JSON.stringify({ image, media_type }) },
    ),
  reportDeal: (deal_id: string, reason: string, note?: string) =>
    request("/moderation/reports", {
      method: "POST",
      body: JSON.stringify({ deal_id, reason, note }),
    }),

  // ── Meta ──
  meta: () =>
    request<{ uploads_enabled: boolean; tts_enabled: boolean; environment: string }>("/meta"),

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
    request<{ items: Product[]; total: number }>(`/products?limit=${limit}`),
  searchProducts: (q: string, page = 1) =>
    request<{ items: Product[]; total: number }>(
      `/products/search?q=${encodeURIComponent(q)}&page=${page}`,
    ),
  getProduct: (barcode: string) => request<ProductDetail>(`/products/${barcode}`),
  getPriceHistory: (barcode: string, days = 730) =>
    request<PriceHistory>(`/products/${barcode}/history?days=${days}`),
  getAlternatives: (barcode: string) =>
    request<AlternativesResult>(`/products/${barcode}/alternatives`),
  contributePrice: (barcode: string, body: { store: string; price: number; location?: string }) =>
    request(`/products/${barcode}/prices`, { method: "POST", body: JSON.stringify(body) }),

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

  // ── Uploads ──
  presign: (contentType: string) =>
    request<{ upload_url: string; public_url: string; key: string }>(
      `/uploads/presign?content_type=${encodeURIComponent(contentType)}`,
      { method: "POST" },
    ),
};
