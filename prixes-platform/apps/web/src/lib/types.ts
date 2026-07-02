// Domain types mirroring the FastAPI response schemas.
// Run `pnpm gen:api` to generate the authoritative typed schema from OpenAPI.

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface User {
  id: string;
  email: string;
  username: string;
  initials: string;
  reputation: number;
  deals_count: number;
  votes_received: number;
  role: string;
  is_verified: boolean;
}

export interface Deal {
  id: string;
  title: string;
  description: string | null;
  store: string | null;
  category: string | null;
  price_now: number;
  price_before: number;
  discount_pct: number;
  photo_url: string | null;
  link: string | null;
  votes_up: number;
  votes_down: number;
  expires_at: string | null;
  created_at: string;
}

export interface FeedPage {
  items: Deal[];
  next_cursor: number | null;
  sort: string;
}

export interface Product {
  barcode: string;
  name: string | null;
  brand: string | null;
  image_url: string | null;
  quantity: string | null;
  nutriscore: string | null;
  ecoscore: string | null;
  nova_group: number | null;
  categories: string | null;
  allergens: string | null;
  diets: string | null;
}

export interface PricePoint {
  store: string | null;
  price: number;
  currency: string;
  source: string;
  location: string | null;
  created_at: string;
  unit_price: number | null;
  unit_label: string | null;
}

export interface ProductDetail extends Product {
  prices: PricePoint[];
  best_price: number | null;
  best_unit_price: number | null;
  unit_label: string | null;
}

export interface PriceHistoryPoint {
  day: string; // ISO date
  price: number;
}

export interface PriceHistory {
  barcode: string;
  points: PriceHistoryPoint[];
  lowest: number | null;
  highest: number | null;
}

export interface Alternative extends Product {
  best_price: number | null;
}

export interface AlternativesResult {
  items: Alternative[];
}

// ── Shopping list ──
export interface ShoppingItem {
  id: string;
  barcode: string;
  quantity: number;
  checked: boolean;
  name: string | null;
  image_url: string | null;
  best_price: number | null;
}

export interface ShoppingList {
  items: ShoppingItem[];
  total: number;
}

export interface StoreBasket {
  store: string;
  total: number;
  items_covered: number;
  items_total: number;
  missing: string[];
}

export interface OptimizeResult {
  best_single_store: StoreBasket | null;
  by_store: StoreBasket[];
  cheapest_split_total: number | null;
  priced_items: number;
  unpriced_items: number;
}

// ── Price alerts ──
export interface PriceAlert {
  id: string;
  barcode: string;
  target_price: number | null;
  active: boolean;
  baseline_price: number | null;
  triggered_at: string | null;
  triggered_price: number | null;
  acknowledged: boolean;
  name: string | null;
  image_url: string | null;
  current_best: number | null;
}

export interface AlertList {
  items: PriceAlert[];
  total: number;
}

export interface FuelStation {
  id: number;
  brand: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  lat: number;
  lon: number;
  distance_km: number | null;
  prices: Record<string, number>;
}

export interface FuelNearbyResult {
  fuel_type: string | null;
  items: FuelStation[];
}
