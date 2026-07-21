// Fun-unit easter egg: remaining kcal expressed as Australian junk-food units.
// Figures researched Jul 2026 from AU sources (official product pages where
// available, CalorieKing AU otherwise) — update here if products reformulate.
export type Equivalent = {
  /** kcal for one unit */
  kcal: number;
  /** builds the display line for a given unit count */
  phrase: (count: string) => string;
  /** decimal places for the count (default 1) */
  decimals?: number;
};

// Krispy Kreme AU Original Glazed: 764 kJ / 183 Cal (krispykreme.com.au)
// KFC AU large Zinger Burger Box: 5478 kJ / 1309 Cal (Nick's own check)
// Mountain Dew 375 mL can: ~740 kJ / 177 Cal (CalorieKing AU)
// Woolworths choc mud cake: 1145 kJ / 273 Cal per 80 g slice; whole 600 g
//   cake ~6869 kJ / 1637 Cal (Woolworths label data)
// Peters Maxibon Original Vanilla: ~1250 kJ / 299 Cal per bar
// Oak chocolate milk: ~377 kJ / 90 Cal per 100 mL → 0.9 Cal/mL
// Pepsi Max: 6 kJ / 100 mL → a whole 2 L bottle is ~29 Cal (pepsimax.com.au)
export const EQUIVALENTS: Equivalent[] = [
  { kcal: 183, phrase: (n) => `${n} Krispy Kreme Original Glazed` },
  { kcal: 1309, phrase: (n) => `${n} large KFC Zinger Boxes` },
  { kcal: 177, phrase: (n) => `${n} cans of Mountain Dew` },
  { kcal: 273, phrase: (n) => `${n} slices of Woolies mud cake` },
  { kcal: 1637, phrase: (n) => `${n} whole Woolies mud cakes` },
  { kcal: 299, phrase: (n) => `${n} Maxibons` },
  { kcal: 0.9, phrase: (n) => `${n} mL of Oak chocolate milk`, decimals: 0 },
  { kcal: 28.7, phrase: (n) => `${n} × 2L Pepsi Max bottles (basically free)` },
];

export function funEquivalent(remainingKcal: number, index: number): string {
  const eq = EQUIVALENTS[index % EQUIVALENTS.length]!;
  const count = Math.abs(remainingKcal) / eq.kcal;
  const decimals = eq.decimals ?? 1;
  const shown =
    decimals === 0
      ? Math.round(count).toLocaleString()
      : count.toFixed(decimals);
  return `≈ ${eq.phrase(shown)}`;
}

/** shuffled index order so taps cycle through every unit before repeating */
export function shuffledOrder(): number[] {
  const order = EQUIVALENTS.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
}
