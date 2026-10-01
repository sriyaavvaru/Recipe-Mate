const VOLUME_TO_ML: Record<string, number> = {
  cup: 240,
  tbsp: 15,
  tsp: 5,
  ml: 1,
  l: 1000
};

const WEIGHT_TO_G: Record<string, number> = {
  g: 1,
  kg: 1000,
  oz: 28.3495,
  lb: 453.592
};

const DENSITY_G_PER_CUP: Record<string, number> = {
  "all purpose flour": 120,
  "plain flour": 120,
  "maida": 120,
  "flour": 120,
  "cake flour": 115,
  "bread flour": 127,
  "whole wheat flour": 128,
  "granulated sugar": 200,
  "caster sugar": 200,
  "sugar": 200,
  "powdered sugar": 120,
  "icing sugar": 120,
  "brown sugar": 220,
  "cocoa powder": 85,
  "butter": 227,
  "milk": 240,
  "water": 240,
  "cream": 240,
  "heavy cream": 240,
  "fresh cream": 240,
  "yogurt": 245,
  "curd": 245,
  "honey": 340,
  "oil": 218,
  "vegetable oil": 218,
  "sunflower oil": 218,
  "olive oil": 216,
  "cornstarch": 128,
  "corn flour": 128,
  "oats": 90,
  "rolled oats": 90,
  "almond flour": 96,
  "almond meal": 96,
  "salt": 288,
  "baking soda": 230,
  "baking powder": 192,
  "chocolate chips": 170,
  "chocolate": 170,
  "cream cheese": 226,
  "mascarpone": 240,
  "peanut butter": 258
};

export function findDensity(ingredient: string): number | null {
  const key = ingredient.toLowerCase().trim();
  const match = Object.entries(DENSITY_G_PER_CUP)
    .sort((a, b) => b[0].length - a[0].length)
    .find(([name]) => key.includes(name));
  return match ? match[1] : null;
}

export function convertQuantity(
  quantity: number,
  fromUnit: string,
  toUnit: string,
  ingredient: string
): { value: number; warning?: string } {
  const from = fromUnit.toLowerCase();
  const to = toUnit.toLowerCase();

  if (from === to) return { value: quantity };

  if (WEIGHT_TO_G[from] && WEIGHT_TO_G[to]) {
    const grams = quantity * WEIGHT_TO_G[from];
    return { value: grams / WEIGHT_TO_G[to] };
  }

  if (VOLUME_TO_ML[from] && VOLUME_TO_ML[to]) {
    const ml = quantity * VOLUME_TO_ML[from];
    return { value: ml / VOLUME_TO_ML[to] };
  }

  const density = findDensity(ingredient);
  if (!density) {
    return {
      value: quantity,
      warning: `Could not safely convert “${ingredient}” from ${fromUnit} to ${toUnit} because no ingredient density is available.`
    };
  }

  if (VOLUME_TO_ML[from] && WEIGHT_TO_G[to]) {
    const ml = quantity * VOLUME_TO_ML[from];
    const grams = (ml / 240) * density;
    return { value: grams / WEIGHT_TO_G[to] };
  }

  if (WEIGHT_TO_G[from] && VOLUME_TO_ML[to]) {
    const grams = quantity * WEIGHT_TO_G[from];
    const ml = (grams / density) * 240;
    return { value: ml / VOLUME_TO_ML[to] };
  }

  return {
    value: quantity,
    warning: `Unsupported conversion: ${fromUnit} → ${toUnit} for ${ingredient}.`
  };
}

export function scaleQuantity(quantity: number, originalServings: number | null, targetServings: number | null) {
  if (!originalServings || !targetServings || originalServings <= 0) return quantity;
  return quantity * (targetServings / originalServings);
}

export function cToF(celsius: number) {
  return celsius * 9 / 5 + 32;
}

export function roundSmart(n: number) {
  if (Math.abs(n - Math.round(n)) < 1e-9) return Math.round(n);
  return Number(n.toFixed(2));
}
