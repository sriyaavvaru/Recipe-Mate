import { GoogleGenAI } from "@google/genai";

const DEFAULT_MODEL = "gemini-3.5-flash-lite";

const RETRYABLE_STATUSES = new Set([408, 429, 503]);

// 3 retries after the initial request = 4 total attempts.
const MAX_RETRIES = 3;
const BACKOFF_MS = [1000, 2000, 4000];

export const AI_TEMPORARILY_BUSY_MESSAGE =
  "Kitchen Buddy's recipe AI is temporarily busy. Please try again in a moment.";

export type AIProviderName = "gemini";

export interface RecipeAIProvider {
  readonly name: AIProviderName;
  readonly model: string;

  uploadFile(args: {
    file: Blob;
    displayName: string;
    mimeType: string;
  }): Promise<{
    uri: string;
    mimeType: string;
  }>;

  createStructuredInteraction(args: {
    input: any;
    tools?: any[];
    responseFormat: any;
  }): Promise<{
    outputText: string;
  }>;
}

export class AIProviderError extends Error {
  readonly status: number | null;
  readonly retryable: boolean;
  readonly model: string;

  constructor(
    message: string,
    options: {
      status: number | null;
      retryable: boolean;
      model: string;
    }
  ) {
    super(message);
    this.name = "AIProviderError";
    this.status = options.status;
    this.retryable = options.retryable;
    this.model = options.model;
  }
}

function getStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  const candidate = error as Record<string, unknown>;

  for (const key of [
    "status",
    "statusCode",
    "httpStatusCode",
    "code",
  ]) {
    const value = candidate[key];

    if (typeof value === "number") {
      return value;
    }

    if (typeof value === "string" && /^\d{3}$/.test(value)) {
      return Number(value);
    }
  }

  const message =
    error instanceof Error ? error.message : String(error);

  const match = message.match(/\b(408|429|503)\b/);

  return match ? Number(match[1]) : null;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRetryableStatus(status: number | null): boolean {
  return status !== null && RETRYABLE_STATUSES.has(status);
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function withRetry<T>(
  operation: () => Promise<T>,
  context: {
    model: string;
    operation: string;
  }
): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const status = getStatus(error);
      const retryable = isRetryableStatus(status);
      const message = getErrorMessage(error);

      console.error(
        "[Kitchen Buddy][Gemini] request failed",
        {
          operation: context.operation,
          model: context.model,
          status,
          attempt: attempt + 1,
          maxAttempts: MAX_RETRIES + 1,
          retryable,
          error: message,
        }
      );

      // Do NOT retry non-transient errors.
      if (!retryable || attempt >= MAX_RETRIES) {
        throw new AIProviderError(message, {
          status,
          retryable,
          model: context.model,
        });
      }

      const jitter = Math.floor(Math.random() * 250);
      const delay = BACKOFF_MS[attempt] + jitter;

      console.warn(
        "[Kitchen Buddy][Gemini] retrying transient error",
        {
          operation: context.operation,
          model: context.model,
          status,
          retryNumber: attempt + 1,
          delayMs: delay,
        }
      );

      await sleep(delay);
    }
  }

  throw new AIProviderError("Unexpected retry state", {
    status: null,
    retryable: false,
    model: context.model,
  });
}

class GeminiProvider implements RecipeAIProvider {
  readonly name = "gemini" as const;
  readonly model: string;

  private readonly client: GoogleGenAI;

  constructor(apiKey: string, model: string) {
    this.model = model;

    // API key remains server-side.
    this.client = new GoogleGenAI({
      apiKey,
    });
  }

  async uploadFile(args: {
    file: Blob;
    displayName: string;
    mimeType: string;
  }) {
    return withRetry(
      async () => {
        const uploaded = await this.client.files.upload({
          file: args.file,
          config: {
            displayName: args.displayName,
            mimeType: args.mimeType,
          },
        });

        if (!uploaded.uri) {
          throw new Error(
            "Gemini file upload returned no URI."
          );
        }

        return {
          uri: uploaded.uri,
          mimeType: uploaded.mimeType || args.mimeType,
        };
      },
      {
        model: this.model,
        operation: "files.upload",
      }
    );
  }

  async createStructuredInteraction(args: {
    input: any;
    tools?: any[];
    responseFormat: any;
  }) {
    return withRetry(
      async () => {
        const interaction =
          await this.client.interactions.create({
            model: this.model,
            input: args.input,
            ...(args.tools
              ? { tools: args.tools }
              : {}),
            response_format: args.responseFormat,
          });

        const outputText =
          interaction.output_text;

        if (!outputText) {
          throw new Error(
            "Gemini returned an empty response."
          );
        }

        return {
          outputText,
        };
      },
      {
        model: this.model,
        operation: "interactions.create",
      }
    );
  }
}

/**
 * Provider factory.
 *
 * Application code talks to this abstraction rather than directly
 * instantiating Gemini. A different provider can be added later
 * without changing the recipe-processing logic.
 */
export function getAIProvider(): RecipeAIProvider {
  const provider =
    (process.env.AI_PROVIDER || "gemini").toLowerCase() as AIProviderName;

  if (provider !== "gemini") {
    throw new Error(
      `Unsupported AI_PROVIDER "${provider}". ` +
      `Currently supported provider: gemini.`
    );
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "Missing GEMINI_API_KEY. Add it to .env.local and restart the app."
    );
  }

  const model =
    process.env.GEMINI_MODEL?.trim() ||
    DEFAULT_MODEL;

  return new GeminiProvider(apiKey, model);
}