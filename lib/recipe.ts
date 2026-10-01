export type Ingredient = {
  name: string;
  originalQuantity: number;
  originalUnit: string;
  finalQuantity: number;
  finalUnit: string;
  notes?: string | null;
};

export type RecipeStep = {
  id: number;
  text: string;
  timerSeconds: number | null;
  temperatureC: number | null;
};

export type Recipe = {
  title: string;
  source: string;
  originalServings: number | null;
  targetServings: number | null;
  targetUnit: string;
  targetTemperatureUnit: "C" | "F";
  ingredients: Ingredient[];
  steps: RecipeStep[];
  warnings: string[];
};
