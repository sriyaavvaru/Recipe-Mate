import { NextRequest, NextResponse } from "next/server";
import {
  AIProviderError,
  AI_TEMPORARILY_BUSY_MESSAGE,
  getAIProvider,
} from "@/lib/ai-provider";
import { convertQuantity, roundSmart, scaleQuantity } from "@/lib/conversion";
import type { Recipe } from "@/lib/recipe";

export const runtime = "nodejs";
export const maxDuration = 60;

const ALLOWED_UNITS = new Set([
  "g",
  "kg",
  "ml",
  "l",
  "cup",
  "tbsp",
  "tsp",
  "oz",
  "lb",
]);

const ALLOWED_TEMPERATURE_UNITS = new Set(["C", "F"]);
const MAX_SOURCE_LENGTH = 50_000;
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

const ingredientSchema = {
  type: "object",
  properties: {
    name: {
      type: "string",
      description: "Ingredient name only, no quantity.",
    },
    quantity: {
      type: "number",
      description: "Original numeric quantity. Use decimals for fractions.",
    },
    unit: {
      type: "string",
      description:
        "Original unit such as cup, tbsp, tsp, g, kg, ml, l, oz, lb, or piece.",
    },
    notes: {
      type: ["string", "null"],
      description:
        "Optional preparation note such as melted, sifted, chopped.",
    },
  },
  required: ["name", "quantity", "unit", "notes"],
};

const stepSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    text: { type: "string" },
    timerSeconds: { type: ["integer", "null"] },
    temperatureC: { type: ["number", "null"] },
  },
  required: ["id", "text", "timerSeconds", "temperatureC"],
};

const aiSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    originalServings: { type: ["number", "null"] },
    ingredients: { type: "array", items: ingredientSchema },
    steps: { type: "array", items: stepSchema },
    warnings: { type: "array", items: { type: "string" } },
  },
  required: ["title", "originalServings", "ingredients", "steps", "warnings"],
};

type AIIngredient = {
  name: string;
  quantity: number;
  unit: string;
  notes: string | null;
};

type AIStep = {
  id: number;
  text: string;
  timerSeconds: number | null;
  temperatureC: number | null;
};

type AIExtractedRecipe = {
  title: string;
  originalServings: number | null;
  ingredients: AIIngredient[];
  steps: AIStep[];
  warnings: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseExtractedRecipe(value: unknown): AIExtractedRecipe {
  if (!isRecord(value)) {
    throw new Error("Kitchen Buddy received an invalid recipe response.");
  }

  const title = typeof value.title === "string" ? value.title.trim() : "";
  if (!title) {
    throw new Error("Kitchen Buddy received a recipe without a title.");
  }

  const originalServings =
    value.originalServings === null
      ? null
      : asFiniteNumber(value.originalServings);

  if (value.originalServings !== null && originalServings === null) {
    throw new Error("Kitchen Buddy received an invalid serving count.");
  }

  if (!Array.isArray(value.ingredients) || !Array.isArray(value.steps)) {
    throw new Error("Kitchen Buddy received an incomplete recipe response.");
  }

  const ingredients: AIIngredient[] = value.ingredients.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`Invalid ingredient at position ${index + 1}.`);
    }

    const name = typeof item.name === "string" ? item.name.trim() : "";
    const quantity = asFiniteNumber(item.quantity);
    const unit = typeof item.unit === "string" ? item.unit.trim().toLowerCase() : "";
    const notes =
      item.notes === null || item.notes === undefined
        ? null
        : typeof item.notes === "string"
          ? item.notes.trim() || null
          : null;

    if (!name || quantity === null || quantity < 0 || !unit) {
      throw new Error(`Invalid ingredient at position ${index + 1}.`);
    }

    return { name, quantity, unit, notes };
  });

  const steps: AIStep[] = value.steps.map((step, index) => {
    if (!isRecord(step)) {
      throw new Error(`Invalid recipe step at position ${index + 1}.`);
    }

    const text = typeof step.text === "string" ? step.text.trim() : "";
    const timerSeconds =
      step.timerSeconds === null || step.timerSeconds === undefined
        ? null
        : asFiniteNumber(step.timerSeconds);
    const temperatureC =
      step.temperatureC === null || step.temperatureC === undefined
        ? null
        : asFiniteNumber(step.temperatureC);

    if (!text || (timerSeconds !== null && timerSeconds < 0)) {
      throw new Error(`Invalid recipe step at position ${index + 1}.`);
    }

    return {
      id: index + 1,
      text,
      timerSeconds,
      temperatureC,
    };
  });

  const warnings = Array.isArray(value.warnings)
    ? value.warnings.filter((warning): warning is string => typeof warning === "string")
    : [];

  return {
    title,
    originalServings,
    ingredients,
    steps,
    warnings,
  };
}

function cleanYoutubeUrl(value: string): string {
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return trimmed;
  }
}

function classifyMime(mime: string): "image" | "document" | "video" {
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "document";
  if (mime.startsWith("video/")) return "video";
  return "document";
}

function parseTargetServings(value: FormDataEntryValue | null): number | null {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 10_000) {
    throw new Error("Target servings must be a positive number.");
  }

  return parsed;
}

function extractionPrompt(
  targetUnit: string,
  targetServings: number | null,
  temperatureUnit: "C" | "F",
  source: string
): string {
  return `
You are Kitchen Buddy's recipe intelligence engine.

Extract a recipe from the supplied content and return only JSON matching the provided schema.

SOURCE:
${source}

USER PREFERENCES:
- Desired ingredient output unit: ${targetUnit}
- Target servings: ${targetServings ?? "keep original"}
- Desired temperature unit: ${temperatureUnit}

RULES:
1. Preserve the recipe faithfully. Do not invent missing ingredients, quantities, temperatures, or timings.
2. Understand messy human speech, OCR text, captions, screenshots, PDFs, and video frames.
3. Identify the recipe title, original serving count when stated, every ingredient quantity/unit, and ordered cooking steps.
4. Convert mixed numbers and spoken fractions into numeric decimals in the ORIGINAL ingredient quantity fields. Example: "one and a half cups" => 1.5 and cup.
5. Keep count-based items such as eggs, bananas, cloves, etc. as unit "piece" unless the source gives a different explicit unit.
6. Detect explicit cooking/baking timers and put their duration in seconds.
7. Detect explicit cooking/baking temperatures and store Celsius in temperatureC. Convert Fahrenheit to Celsius when the source gives Fahrenheit.
8. Do NOT perform ingredient density math yourself. The application will deterministically scale and convert numeric units after extraction.
9. When the content is ambiguous, add a concise warning rather than guessing.
10. Steps must be useful, concise, and ordered for a cooking-mode display.
`;
}

async function getAiInput(
  form: FormData,
  provider: ReturnType<typeof getAIProvider>
) {
  const sourceType = String(form.get("sourceType") || "text").trim().toLowerCase();
  const source = String(form.get("source") || "").trim();
  const file = form.get("file");
  const targetUnit = String(form.get("targetUnit") || "g").trim().toLowerCase();
  const targetServings = parseTargetServings(form.get("targetServings"));
  const temperatureUnit = String(form.get("temperatureUnit") || "C").trim().toUpperCase();

  if (!ALLOWED_UNITS.has(targetUnit)) {
    throw new Error("Unsupported target ingredient unit.");
  }

  if (!ALLOWED_TEMPERATURE_UNITS.has(temperatureUnit)) {
    throw new Error("Temperature unit must be C or F.");
  }

  const basePrompt = extractionPrompt(
    targetUnit,
    targetServings,
    temperatureUnit as "C" | "F",
    source
  );

  if (sourceType === "youtube") {
    const youtubeUrl = cleanYoutubeUrl(source);
    if (!youtubeUrl) throw new Error("A YouTube URL is required.");

    return {
      input: [
        {
          type: "text",
          text:
            basePrompt +
            `\nAnalyze this public YouTube video as the recipe source: ${youtubeUrl}`,
        },
        { type: "video", uri: youtubeUrl },
      ],
    };
  }

  if (sourceType === "url" || sourceType === "instagram") {
    if (!source) throw new Error("A recipe URL is required.");

    return {
      input: [
        {
          type: "text",
          text:
            basePrompt +
            `\nUse the public webpage at this URL as the recipe source: ${source}`,
        },
      ],
      tools: [{ type: "url_context" }],
    };
  }

  if (sourceType === "text") {
    if (!source) throw new Error("Recipe text is required.");

    return {
      input: [
        {
          type: "text",
          text: basePrompt,
        },
      ],
    };
  }

  if (!(file instanceof File)) {
    throw new Error("A file is required for this input type.");
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error("The uploaded file is too large. Please use a file under 50 MB.");
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "application/octet-stream";

  const uploaded = await provider.uploadFile({
    file: new Blob([bytes], { type: mimeType }),
    displayName: file.name,
    mimeType,
  });

  return {
    input: [
      {
        type: "text",
        text:
          basePrompt +
          `\nThe recipe is provided as the uploaded ${mimeType} file named ${file.name}.`,
      },
      {
        type: classifyMime(mimeType),
        uri: uploaded.uri,
        mime_type: uploaded.mimeType,
      },
    ],
  };
}

export async function POST(request: NextRequest) {
  let provider: ReturnType<typeof getAIProvider> | null = null;

  try {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Recipe input must be submitted as multipart/form-data." },
        { status: 415 }
      );
    }

    const form = await request.formData();
    const source = String(form.get("source") || "").trim();
    if (source.length > MAX_SOURCE_LENGTH) {
      return NextResponse.json(
        { error: "That recipe input is too long. Please shorten it and try again." },
        { status: 413 }
      );
    }

    provider = getAIProvider();

    const built = await getAiInput(form, provider);
    const interaction = await provider.createStructuredInteraction({
      input: built.input,
      tools: built.tools,
      responseFormat: {
        type: "text",
        mime_type: "application/json",
        schema: aiSchema,
      },
    });

    let extracted: AIExtractedRecipe;
    try {
      extracted = parseExtractedRecipe(JSON.parse(interaction.outputText) as unknown);
    } catch (error) {
      console.error("[Kitchen Buddy] invalid structured AI output", {
        error: error instanceof Error ? error.message : String(error),
      });
      return NextResponse.json(
        { error: "Kitchen Buddy received an invalid recipe response. Please try again." },
        { status: 502 }
      );
    }

    const targetUnit = String(form.get("targetUnit") || "g").trim().toLowerCase();
    const targetServings = parseTargetServings(form.get("targetServings"));
    const temperatureUnit = String(form.get("temperatureUnit") || "C").trim().toUpperCase();
    const sourceType = String(form.get("sourceType") || "text").trim().toLowerCase();

    const warnings = [...extracted.warnings];
    const ingredients = extracted.ingredients.map((item) => {
      const scaled = scaleQuantity(
        item.quantity,
        extracted.originalServings,
        targetServings
      );

      const converted =
        item.unit === "piece"
          ? { value: scaled }
          : convertQuantity(
              scaled,
              item.unit,
              targetUnit,
              item.name
            );

      if (converted.warning) warnings.push(converted.warning);

      return {
        name: item.name,
        originalQuantity: item.quantity,
        originalUnit: item.unit,
        finalQuantity: roundSmart(converted.value),
        finalUnit: item.unit === "piece" ? "piece" : targetUnit,
        notes: item.notes,
      };
    });

    const output: Recipe = {
      title: extracted.title,
      source: sourceType,
      originalServings: extracted.originalServings,
      targetServings,
      targetUnit,
      targetTemperatureUnit: temperatureUnit as "C" | "F",
      ingredients,
      steps: extracted.steps,
      warnings: [...new Set(warnings)],
    };

    return NextResponse.json(output, { status: 200 });
  } catch (error: unknown) {
    const status =
      error instanceof AIProviderError && error.status !== null
        ? error.status
        : null;
    const model =
      provider?.model || process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
    const message = error instanceof Error ? error.message : String(error);

    console.error("[Kitchen Buddy] recipe processing failed", {
      model,
      status,
      error: message,
    });

    if (error instanceof AIProviderError && error.retryable) {
      return NextResponse.json(
        { error: AI_TEMPORARILY_BUSY_MESSAGE },
        { status: 503 }
      );
    }

    if (status === 400) {
      return NextResponse.json(
        {
          error:
            "Kitchen Buddy couldn't process that recipe input. Please check the source and try again.",
        },
        { status: 400 }
      );
    }

    if (status === 401 || status === 403) {
      return NextResponse.json(
        {
          error:
            "Kitchen Buddy's AI connection needs attention. Please check the server API configuration.",
        },
        { status }
      );
    }

    if (message.startsWith("Missing GEMINI_API_KEY")) {
      return NextResponse.json(
        {
          error:
            "Kitchen Buddy is missing its server AI configuration. Add GEMINI_API_KEY to .env.local and restart the app.",
        },
        { status: 500 }
      );
    }

    if (
      message === "Recipe text is required." ||
      message === "A recipe URL is required." ||
      message === "A file is required for this input type." ||
      message === "Unsupported target ingredient unit." ||
      message === "Temperature unit must be C or F." ||
      message === "Target servings must be a positive number."
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json(
      { error: "Kitchen Buddy could not understand this recipe." },
      { status: 500 }
    );
  }
}
