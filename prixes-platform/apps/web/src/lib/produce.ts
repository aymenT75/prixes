/**
 * Une vignette pour les fruits et légumes vendus au poids.
 *
 * Loose produce has no barcode, so it has no OpenFoodFacts photo either — every
 * potato, carrot and onion would land on the same grey "grocery" placeholder,
 * and a shopping list of eleven identical grey squares reads as broken data
 * rather than as a week of meals.
 *
 * An emoji is not a photo, but it is instantly legible, weighs nothing, needs no
 * network, and survives dark mode. The lookup falls back along the slug so the
 * hundred-odd categories need far fewer entries than that: `yellow-onions` and
 * `red-onions` both end in `onions`.
 */

const FRESH_PREFIX = "fl:";

// Keys are the tail of an Open Food Facts category slug (see the API's
// FRESH_CATEGORIES). Order does not matter; the longest match wins.
const EMOJI: Record<string, string> = {
  // Légumes
  potatoes: "🥔",
  "sweet-potatoes": "🍠",
  carrots: "🥕",
  onions: "🧅",
  shallots: "🧅",
  garlic: "🧄",
  leeks: "🥬",
  zucchini: "🥒",
  cucumbers: "🥒",
  aubergines: "🍆",
  tomatoes: "🍅",
  "bell-peppers": "🫑",
  "sweet-peppers": "🫑",
  peppers: "🫑",
  mushrooms: "🍄",
  broccoli: "🥦",
  cauliflower: "🥦",
  cabbages: "🥬",
  cabbage: "🥬",
  kale: "🥬",
  "brussels-sprouts": "🥬",
  turnip: "🥔",
  beet: "🥕",
  beetroots: "🥕",
  celery: "🥬",
  "celery-stalk": "🥬",
  celeriac: "🥔",
  "fennel-bulbs": "🥬",
  endives: "🥬",
  spinachs: "🥬",
  lettuces: "🥬",
  "corn-salad": "🥬",
  rocket: "🥬",
  beans: "🫘",
  peas: "🫛",
  pumpkins: "🎃",
  squash: "🎃",
  squashes: "🎃",
  artichokes: "🌿",
  asparagus: "🌿",
  "jerusalem-artichoke": "🥔",
  radishes: "🥕",
  avocados: "🥑",
  ginger: "🫚",
  turmeric: "🫚",
  "chili-peppers": "🌶️",
  // Fruits
  apples: "🍎",
  "pink-lady": "🍎",
  pears: "🍐",
  bananas: "🍌",
  oranges: "🍊",
  clementines: "🍊",
  mandarins: "🍊",
  grapefruits: "🍊",
  lemons: "🍋",
  limes: "🍋",
  grapes: "🍇",
  peaches: "🍑",
  nectarines: "🍑",
  apricots: "🍑",
  plums: "🍑",
  cherries: "🍒",
  strawberries: "🍓",
  raspberries: "🍓",
  blueberries: "🫐",
  kiwis: "🥝",
  melons: "🍈",
  muskmelons: "🍈",
  watermelons: "🍉",
  pineapple: "🍍",
  mangoes: "🥭",
  pomegranates: "🍎",
  figs: "🍈",
  // Fruits secs, légumes secs
  chestnuts: "🌰",
  walnuts: "🌰",
  hazelnuts: "🌰",
  almonds: "🌰",
  "cashew-nuts": "🌰",
  dates: "🌴",
  chickpeas: "🫘",
  lentils: "🫘",
};

/** True for a weighed-produce entry rather than a barcoded pack. */
export function isLooseProduce(barcode?: string | null): boolean {
  return !!barcode && barcode.startsWith(FRESH_PREFIX);
}

/**
 * The emoji standing in for a produce photo, or null for a barcoded product.
 *
 * Falls back along the slug (`yellow-onions` → `onions`) and then to a generic
 * leaf, so a category added on the server never renders as an empty square.
 */
export function produceEmoji(barcode?: string | null): string | null {
  if (!isLooseProduce(barcode)) return null;
  const slug = barcode!.slice(FRESH_PREFIX.length);
  if (EMOJI[slug]) return EMOJI[slug];
  const suffix = Object.keys(EMOJI)
    .filter((key) => slug.endsWith(key))
    .sort((a, b) => b.length - a.length)[0];
  return suffix ? EMOJI[suffix] : "🥬";
}
