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
  votes_received: number;
  role: string;
  is_verified: boolean;
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

/** A search hit, carrying the price that decided its rank. */
export interface SearchHit extends Product {
  best_price: number | null;
  best_store: string | null;
  best_unit_price: number | null;
  unit_label: string | null;
  /** True when `best_store` is one of the shops near the user. */
  nearby: boolean;
}

export interface SearchResult {
  items: SearchHit[];
  total: number;
  /** True when the order actually reflects nearby shops, not just any price. */
  ranked_by_nearby: boolean;
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

export interface Bargain extends Product {
  store: string | null;
  price: number;
  reference_price: number;
  drop_pct: number;
}

export interface BargainsResult {
  items: Bargain[];
}

// ── Shopping list ──
export interface ShoppingItem {
  id: string;
  /** Null for a line the assistant produced that the catalog doesn't have. */
  barcode: string | null;
  quantity: number;
  checked: boolean;
  name: string | null;
  free_text: string | null;
  /** Recipe quantity for display ("1.5" + "kg") — never used in price maths. */
  amount: number | null;
  unit: string | null;
  source: "manual" | "ai" | "recipe" | "mealplan";
  image_url: string | null;
  best_price: number | null;
  nutriscore: string | null;
  /** What the price is the price *of* — "500 g", "2 L". Null for a free-text line. */
  pack: string | null;
}

// ── Smart Assistant ──
export interface SmartCartLine {
  product_name: string;
  amount: number;
  unit: string;
  category: string;
  optional: boolean;
  barcode: string | null;
  matched_name: string | null;
  image_url: string | null;
  best_price: number | null;
  unit_price: string | null;
  quantity: number;
  allergen_warning: string | null;
}

export interface SmartCartResult {
  draft_id: string;
  title: string;
  servings: number;
  lines: SmartCartLine[];
  estimated_total: number | null;
  matched_count: number;
  unpriced_count: number;
  cached: boolean;
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
  nutriscore: string | null;
}

export interface AlertList {
  items: PriceAlert[];
  total: number;
}

export interface Store {
  id: number;
  name: string;
  brand: string | null;
  address: string | null;
  lat: number;
  lon: number;
  distance_km: number;
}

export interface StoresNearbyResult {
  items: Store[];
}

export interface GeocodeHit {
  label: string;
  lat: number;
  lon: number;
}

export interface GeocodeResult {
  items: GeocodeHit[];
}

export interface FeedbackItem {
  id: string;
  rating: number | null;
  message: string;
  email: string | null;
  page: string | null;
  user_id: string | null;
  created_at: string;
}

export interface FeedbackList {
  items: FeedbackItem[];
  total: number;
  average_rating: number | null;
  rating_counts: Record<number, number>;
}

export interface AnalyticsSummary {
  days: number;
  total_events: number;
  unique_sessions: number;
  top_paths: { path: string; count: number }[];
  by_event: { event: string; count: number }[];
}


// ── Menu de la semaine ──
export type MealGoal = "budget" | "temps" | "sante" | "idees";
export type MealEquipment = "four" | "plaques" | "micro-ondes" | "airfryer" | "robot" | "autocuiseur";
export type MealStyle =
  | "rapide"
  | "healthy"
  | "classique"
  | "economique"
  | "reconfort"
  | "one-pot"
  | "monde";

/** The questionnaire's answers, kept on the account. */
export interface MealPreferences {
  servings: number;
  meals_per_day: 1 | 2;
  budget_eur: number | null;
  goal: MealGoal | null;
  equipment: MealEquipment[];
  styles: MealStyle[];
}

export interface MealPlanMeal {
  day: number;
  day_label: string;
  slot: string;
  title: string;
  ingredients: SmartCartLine[];
}

export interface MealPlan {
  id: string;
  week_start: string;
  servings: number;
  meals: MealPlanMeal[];
  /** The week's shopping, deduplicated across every meal. */
  basket: SmartCartLine[];
  estimated_total: number | null;
  unpriced_count: number;
  stores: OptimizeResult | null;
  /** The week as one trolley per store — same shape the shopping list produces. */
  split: SplitResult | null;
  over_budget: boolean;
  /** How many times the planner retried to land inside the budget. */
  budget_attempts: number;
}

// ── Recette importée ──
export interface ImportedRecipe {
  title: string;
  source_url: string;
  servings: number;
  ingredients: SmartCartLine[];
  estimated_total: number | null;
  unpriced_count: number;
}


// ── Répartition entre magasins ──
export interface BasketItem {
  barcode: string;
  label: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface StoreBasketDetail {
  store: string;
  items: BasketItem[];
  subtotal: number;
}

export interface SplitOption {
  stores: string[];
  baskets: StoreBasketDetail[];
  total: number;
  items_covered: number;
  items_total: number;
  /** Priced items none of the chosen stores sells. */
  missing: string[];
  /** Against the best single-store shop, only when both fill the same basket. */
  saving_vs_single: number | null;
  /** How many more items this plan finds than the best single store. */
  extra_items: number;
  /** The dearest store that sells everything this plan buys — null when none does. */
  priciest_store: string | null;
  /** What the same items would cost there, minus this plan's total. */
  saving_vs_priciest: number | null;
}

export interface SplitResult {
  options: SplitOption[];
  unpriced: string[];
}
