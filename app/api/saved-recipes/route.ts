import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { Recipe } from "@/lib/recipe";
import type { Json } from "@/lib/database.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VISITOR_COOKIE = "kb_visitor";
const VISITOR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function getCookieSecret(): string {
  const secret = process.env.KITCHEN_BUDDY_COOKIE_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      "KITCHEN_BUDDY_COOKIE_SECRET must be set and contain at least 32 characters."
    );
  }

  return secret;
}

function signVisitorId(visitorId: string): string {
  return createHmac("sha256", getCookieSecret())
    .update(visitorId, "utf8")
    .digest("hex");
}

function encodeVisitorCookie(visitorId: string): string {
  return `${visitorId}.${signVisitorId(visitorId)}`;
}

function verifyVisitorCookie(value: string | undefined): string | null {
  if (!value) return null;

  const separator = value.lastIndexOf(".");
  if (separator <= 0) return null;

  const visitorId = value.slice(0, separator);
  const signature = value.slice(separator + 1);

  if (!/^[0-9a-f-]{36}$/i.test(visitorId)) return null;
  if (!/^[0-9a-f]{64}$/i.test(signature)) return null;

  const expected = signVisitorId(visitorId);

  const signatureBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");

  if (signatureBuffer.length !== expectedBuffer.length) {
    return null;
  }

  return timingSafeEqual(signatureBuffer, expectedBuffer)
    ? visitorId
    : null;
}

async function getOrCreateVisitorId(): Promise<{
  visitorId: string;
  isNew: boolean;
}> {
  const cookieStore = await cookies();
  const existing = cookieStore.get(VISITOR_COOKIE)?.value;
  const verified = verifyVisitorCookie(existing);

  if (verified) {
    return {
      visitorId: verified,
      isNew: false,
    };
  }

  return {
    visitorId: randomUUID(),
    isNew: true,
  };
}

function attachVisitorCookie(
  response: NextResponse,
  visitorId: string,
  isNew: boolean
): NextResponse {
  if (isNew) {
    response.cookies.set(VISITOR_COOKIE, encodeVisitorCookie(visitorId), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: VISITOR_COOKIE_MAX_AGE,
      path: "/",
    });
  }

  return response;
}

function isRecipe(value: unknown): value is Recipe {
  if (!value || typeof value !== "object") return false;

  const recipe = value as Partial<Recipe>;

  return (
    typeof recipe.title === "string" &&
    Array.isArray(recipe.ingredients) &&
    Array.isArray(recipe.steps)
  );
}

function toJson(value: Recipe): Json {
  return value as unknown as Json;
}

export async function GET() {
  try {
    const { visitorId, isNew } = await getOrCreateVisitorId();
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("saved_recipes")
      .select(
        "id,title,source,original_servings,target_servings,target_unit,target_temperature_unit,recipe_json,created_at"
      )
      .eq("visitor_id", visitorId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("[Kitchen Buddy][Supabase] list failed", {
        code: error.code,
        message: error.message,
      });

      return attachVisitorCookie(
        NextResponse.json(
          { error: "Could not load saved recipes." },
          { status: 500 }
        ),
        visitorId,
        isNew
      );
    }

    return attachVisitorCookie(
      NextResponse.json({ recipes: data ?? [] }),
      visitorId,
      isNew
    );
  } catch (error: unknown) {
    console.error("[Kitchen Buddy] saved recipes GET failed", {
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      { error: "Could not load saved recipes." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { visitorId, isNew } = await getOrCreateVisitorId();
    const body: unknown = await request.json();

    const recipe =
      body && typeof body === "object"
        ? (body as { recipe?: unknown }).recipe
        : undefined;

    if (!isRecipe(recipe)) {
      return attachVisitorCookie(
        NextResponse.json(
          { error: "Invalid recipe format." },
          { status: 400 }
        ),
        visitorId,
        isNew
      );
    }

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("saved_recipes")
      .insert({
        visitor_id: visitorId,
        title: recipe.title.trim().slice(0, 200),
        source: String(recipe.source || "unknown").slice(0, 100),
        original_servings: recipe.originalServings ?? null,
        target_servings: recipe.targetServings ?? null,
        target_unit: recipe.targetUnit || "g",
        target_temperature_unit:
          recipe.targetTemperatureUnit === "F" ? "F" : "C",
        recipe_json: toJson(recipe),
      })
      .select(
        "id,title,source,original_servings,target_servings,target_unit,target_temperature_unit,recipe_json,created_at"
      )
      .single();

    if (error) {
      console.error("[Kitchen Buddy][Supabase] save failed", {
        code: error.code,
        message: error.message,
      });

      return attachVisitorCookie(
        NextResponse.json(
          { error: "Could not save recipe." },
          { status: 500 }
        ),
        visitorId,
        isNew
      );
    }

    return attachVisitorCookie(
      NextResponse.json({ recipe: data }, { status: 201 }),
      visitorId,
      isNew
    );
  } catch (error: unknown) {
    console.error("[Kitchen Buddy] saved recipes POST failed", {
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      { error: "Could not save recipe." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { visitorId, isNew } = await getOrCreateVisitorId();
    const body: unknown = await request.json();

    const id =
      body && typeof body === "object"
        ? String((body as { id?: unknown }).id || "")
        : "";

    if (!id) {
      return attachVisitorCookie(
        NextResponse.json(
          { error: "Recipe ID is required." },
          { status: 400 }
        ),
        visitorId,
        isNew
      );
    }

    const supabase = getSupabaseAdmin();

    const { error } = await supabase
      .from("saved_recipes")
      .delete()
      .eq("id", id)
      .eq("visitor_id", visitorId);

    if (error) {
      console.error("[Kitchen Buddy][Supabase] delete failed", {
        code: error.code,
        message: error.message,
      });

      return attachVisitorCookie(
        NextResponse.json(
          { error: "Could not delete recipe." },
          { status: 500 }
        ),
        visitorId,
        isNew
      );
    }

    return attachVisitorCookie(
      NextResponse.json({ ok: true }),
      visitorId,
      isNew
    );
  } catch (error: unknown) {
    console.error("[Kitchen Buddy] saved recipes DELETE failed", {
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      { error: "Could not delete recipe." },
      { status: 500 }
    );
  }
}
