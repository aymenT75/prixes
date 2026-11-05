/** A profile allergen named in the product's list ("Blé (gluten)" matches "gluten"). */
export function allergensIn(productAllergens: string | null | undefined, profile: string[]): string[] {
  const list = (productAllergens ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  return list.filter((a) =>
    profile.some((p) => a.toLowerCase().includes(p.toLowerCase()) || p.toLowerCase().includes(a.toLowerCase())),
  );
}
