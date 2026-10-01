"use client";

import { useEffect, useState } from "react";
import {
  Bookmark,
  Check,
  Clock3,
  Loader2,
  Trash2
} from "lucide-react";
import type { Recipe } from "@/lib/recipe";

type SavedRecipeRow = {
  id: string;
  title: string;
  source: string;
  original_servings: number | null;
  target_servings: number | null;
  target_unit: string;
  target_temperature_unit: "C" | "F";
  recipe_json: Recipe;
  created_at: string;
};

type Props = {
  currentRecipe: Recipe | null;
  currentTitle?: string;
  onLoad: (recipe: Recipe) => void;
};

export default function SavedRecipes({
  currentRecipe,
  currentTitle,
  onLoad
}: Props) {
  const [recipes, setRecipes] = useState<SavedRecipeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState("");

  async function loadSaved() {
    try {
      const response = await fetch("/api/saved-recipes", {
        cache: "no-store"
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not load recipes.");
      }

      setRecipes(data.recipes || []);
    } catch (error: any) {
      setMessage(error?.message || "Could not load saved recipes.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSaved();
  }, []);

  async function saveCurrent() {
    if (!currentRecipe || saving) return;

    setSaving(true);
    setSaved(false);
    setMessage("");

    const payload: Recipe = {
      ...currentRecipe,
      title: currentTitle?.trim() || currentRecipe.title
    };

    try {
      const response = await fetch("/api/saved-recipes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          recipe: payload
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not save recipe.");
      }

      setSaved(true);
      await loadSaved();
    } catch (error: any) {
      setMessage(error?.message || "Could not save recipe.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteRecipe(id: string) {
    setMessage("");

    try {
      const response = await fetch("/api/saved-recipes", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ id })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not delete recipe.");
      }

      setRecipes((current) =>
        current.filter((recipe) => recipe.id !== id)
      );
    } catch (error: any) {
      setMessage(error?.message || "Could not delete recipe.");
    }
  }

  function handleLoad(recipe: Recipe) {
    setSaved(false);
    setMessage("");
    onLoad(recipe);
    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  }

  return (
    <section className="glass mt-5 rounded-[28px] p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Bookmark size={18} className="text-[#ff6f96]" />
            <h3 className="text-lg font-black">Saved Recipes</h3>
          </div>

          <p className="mt-1 text-sm text-[#81766e]">
            Your converted recipes stay here so you can use them again.
          </p>
        </div>

        {currentRecipe && (
          <button
            onClick={saveCurrent}
            disabled={saving}
            className="flex items-center justify-center gap-2 rounded-2xl bg-[#ff6f96] px-5 py-3 text-sm font-black text-white disabled:opacity-60"
          >
            {saving ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Saving...
              </>
            ) : saved ? (
              <>
                <Check size={16} />
                Saved
              </>
            ) : (
              <>
                <Bookmark size={16} />
                Save Recipe
              </>
            )}
          </button>
        )}
      </div>

      {message && (
        <div className="mt-4 rounded-2xl bg-[#fff0f2] p-3 text-sm font-semibold text-[#9f3e58]">
          {message}
        </div>
      )}

      {loading ? (
        <div className="mt-6 flex items-center justify-center gap-2 py-8 text-sm text-[#8b8179]">
          <Loader2 size={18} className="animate-spin" />
          Loading your recipes...
        </div>
      ) : recipes.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-[#eadfd8] bg-white/65 p-6 text-center">
          <p className="text-sm font-extrabold">No saved recipes yet.</p>
          <p className="mt-1 text-xs text-[#8b8179]">
            Convert a recipe and tap “Save Recipe”.
          </p>
        </div>
      ) : (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {recipes.map((item) => (
            <div
              key={item.id}
              className="rounded-2xl border border-[#eee4dd] bg-white/75 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <button
                  onClick={() => handleLoad(item.recipe_json)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-sm font-black">
                    {item.title}
                  </p>

                  <p className="mt-1 text-xs text-[#8b8179]">
                    {item.target_servings
                      ? `${item.target_servings} servings`
                      : "Original servings"}{" "}
                    · {item.target_unit}
                  </p>

                  <p className="mt-2 flex items-center gap-1 text-[11px] text-[#a0968e]">
                    <Clock3 size={12} />
                    {new Date(item.created_at).toLocaleDateString()}
                  </p>
                </button>

                <button
                  onClick={() => deleteRecipe(item.id)}
                  title="Delete recipe"
                  className="rounded-xl p-2 text-[#9c8f87] hover:bg-[#fff0f2] hover:text-[#c6506d]"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
