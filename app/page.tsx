"use client";



import { useEffect, useState } from "react";

import {

  ArrowLeft,

  ArrowRight,

  Camera,

  ChefHat,

  Check,

  CircleAlert,

  FileText,

  Flame,

  Link2,

  Loader2,

  Play,

  RotateCcw,

  Sparkles,

  Timer,

  Upload,

  Cpu,

  Cable

} from "lucide-react";

import type { Recipe } from "@/lib/recipe";
import SavedRecipes from "@/components/SavedRecipes";



type SourceType = "text" | "url" | "youtube" | "file";



const sources = [

  { id: "text" as const, label: "Paste text", icon: FileText, hint: "Recipe text or caption" },

  { id: "file" as const, label: "Photo / PDF / Video", icon: Camera, hint: "Upload your recipe" },

  { id: "url" as const, label: "Recipe link", icon: Link2, hint: "Website or public page" },

  { id: "youtube" as const, label: "YouTube", icon: Play, hint: "Public recipe video" }

];



const units = [

  { value: "g", label: "Grams (g)" },

  { value: "kg", label: "Kilograms (kg)" },

  { value: "ml", label: "Millilitres (ml)" },

  { value: "l", label: "Litres (L)" },

  { value: "cup", label: "Cups" },

  { value: "tbsp", label: "Tablespoons" },

  { value: "tsp", label: "Teaspoons" },

  { value: "oz", label: "Ounces (oz)" },

  { value: "lb", label: "Pounds (lb)" }

];



function pretty(value: number) {

  return Number.isInteger(value) ? String(value) : String(value.toFixed(2)).replace(/\.?0+$/, "");

}



function secondsToClock(total: number) {

  const m = Math.floor(total / 60);

  const s = total % 60;

  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;

}



export default function Home() {

  const [sourceType, setSourceType] = useState<SourceType>("text");

  const [sourceText, setSourceText] = useState("");

  const [file, setFile] = useState<File | null>(null);

  const [targetUnit, setTargetUnit] = useState("g");

  const [targetServings, setTargetServings] = useState("");

  const [temperatureUnit, setTemperatureUnit] = useState<"C" | "F">("C");

  const [loading, setLoading] = useState(false);

  const [recipe, setRecipe] = useState<Recipe | null>(null);

  const [error, setError] = useState("");

  const [cooking, setCooking] = useState(false);

  const [step, setStep] = useState(0);

  const [remaining, setRemaining] = useState<number | null>(null);

  const [timerRunning, setTimerRunning] = useState(false);

  const [deviceIp, setDeviceIp] = useState("");

  const [deviceStatus, setDeviceStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const [showConnect, setShowConnect] = useState(false);

  const [editedTitle, setEditedTitle] = useState("");



  const currentStep = recipe?.steps[step];

  const progress = recipe ? ((step + 1) / recipe.steps.length) * 100 : 0;



  useEffect(() => {

    if (!currentStep) {

      setRemaining(null);

      setTimerRunning(false);

      return;

    }

    setRemaining(currentStep.timerSeconds ?? null);

    setTimerRunning(false);

  }, [step, currentStep?.timerSeconds]);



  function chooseSource(id: SourceType) {

    setSourceType(id);

    setError("");

    setSourceText("");

    setFile(null);

  }



  async function processRecipe() {

    setError("");

    setRecipe(null);



    if (sourceType === "text" && !sourceText.trim()) {

      setError("Paste some recipe text first.");

      return;

    }

    if (sourceType !== "file" && !sourceText.trim()) {

      setError("Add a source first.");

      return;

    }

    if (sourceType === "file" && !file) {

      setError("Choose a photo, PDF, or video first.");

      return;

    }



    const form = new FormData();

    form.set("sourceType", sourceType);

    form.set("source", sourceText);

    form.set("targetUnit", targetUnit);

    form.set("targetServings", targetServings);

    form.set("temperatureUnit", temperatureUnit);

    if (file) form.set("file", file);



    setLoading(true);

    try {

      const response = await fetch("/api/recipe", { method: "POST", body: form });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "Recipe processing failed.");

      setRecipe(data);

      setEditedTitle(data.title);

      window.scrollTo({ top: 0, behavior: "smooth" });

    } catch (e: any) {

      setError(e.message || "Kitchen Buddy could not understand this recipe.");

    } finally {

      setLoading(false);

    }

  }



  function startCooking() {

    if (!recipe) return;

    setStep(0);

    setCooking(true);

  }



  async function connectDevice() {

    if (!recipe || !deviceIp.trim()) return;

    setDeviceStatus("sending");

    try {

      const payload = {

        recipe: editedTitle || recipe.title,

        ingredients: recipe.ingredients.map((i) => ({

          name: i.name,

          quantity: i.finalQuantity,

          unit: i.finalUnit,

          notes: i.notes

        })),

        steps: recipe.steps.map((s) => ({

          number: s.id,

          text: s.text,

          timer_seconds: s.timerSeconds ?? 0

        }))

      };



      const response = await fetch("/api/device", {

        method: "POST",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({ ip: deviceIp.trim(), recipe: payload })

      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "Device connection failed.");

      setDeviceStatus("sent");

    } catch (e) {

      setDeviceStatus("error");

    }

  }



  function next() {

    if (!recipe) return;

    setStep((s) => Math.min(s + 1, recipe.steps.length - 1));

  }



  function back() {

    setStep((s) => Math.max(s - 1, 0));

  }



  const displayedTemperature = currentStep?.temperatureC == null

    ? null

    : temperatureUnit === "C"

      ? Math.round(currentStep.temperatureC)

      : Math.round((currentStep.temperatureC * 9) / 5 + 32);



  return (

    <main className="shell">

      <header className="mb-8 flex items-center justify-between gap-4">

        <div className="flex items-center gap-3">

          <div className="glass flex h-11 w-11 items-center justify-center rounded-2xl bg-white">

            <ChefHat size={23} className="text-[#ff7096]" />

          </div>

          <div>

            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#b06f82]">Kitchen Buddy</p>

            <h1 className="text-xl font-black tracking-tight">Your recipe. Your way.</h1>

          </div>

        </div>

        <div className="hidden rounded-full border border-[#e9d7cf] bg-white/65 px-4 py-2 text-xs font-semibold text-[#756b63] sm:block">

          AI recipe intelligence · hardware-ready

        </div>

      </header>



      
      <SavedRecipes
        currentRecipe={
          recipe
            ? {
                ...recipe,
                title: editedTitle || recipe.title
              }
            : null
        }
        currentTitle={editedTitle}
        onLoad={(loadedRecipe) => {
          setRecipe(loadedRecipe);
          setEditedTitle(loadedRecipe.title);
          setCooking(false);
          setStep(0);
          setRemaining(null);
          setTimerRunning(false);
          setError("");
          setDeviceStatus("idle");
          setShowConnect(false);
        }}
      />

      {!recipe && (

        <>

          <section className="glass soft-grid overflow-hidden rounded-[32px] p-6 sm:p-10">

            <div className="mx-auto max-w-3xl text-center">

              <div className="floaty mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-[#ffe7ee] text-3xl">

                🧁

              </div>

              <h2 className="text-4xl font-black tracking-tight sm:text-6xl">

                Give me <span className="text-[#ff6f96]">any recipe.</span>

              </h2>

              <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-[#746a60] sm:text-lg">

                Paste it, upload it, or drop a public recipe link. Kitchen Buddy understands the recipe,

                personalizes the measurements, and turns it into a step-by-step cooking mode.

              </p>

            </div>



            <div className="mx-auto mt-10 grid max-w-4xl grid-cols-2 gap-3 md:grid-cols-4">

              {sources.map((source) => {

                const Icon = source.icon;

                const active = sourceType === source.id;

                return (

                  <button

                    key={source.id}

                    onClick={() => chooseSource(source.id)}

                    className={`rounded-2xl border p-4 text-left transition ${

                      active

                        ? "border-[#ff98b1] bg-[#fff0f4] shadow-sm"

                        : "border-[#eadfd8] bg-white/70 hover:-translate-y-0.5 hover:bg-white"

                    }`}

                  >

                    <Icon size={19} className={active ? "text-[#ff6f96]" : "text-[#82756b]"} />

                    <p className="mt-3 text-sm font-extrabold">{source.label}</p>

                    <p className="mt-1 text-xs leading-5 text-[#8b8179]">{source.hint}</p>

                  </button>

                );

              })}

            </div>



            <div className="mx-auto mt-5 max-w-4xl">

              {sourceType === "text" && (

                <textarea

                  value={sourceText}

                  onChange={(e) => setSourceText(e.target.value)}

                  className="min-h-[270px] w-full rounded-3xl border border-[#eadfd8] bg-white/90 p-5 text-sm leading-7 shadow-sm"

                  placeholder={`Paste your recipe here…



Example:

Chocolate Cake

1 1/2 cups flour

3/4 cup sugar

1/2 cup cocoa powder

2 eggs

1/2 cup milk

1 tsp baking powder



Preheat oven to 180°C.

Mix the dry ingredients.

Add eggs and milk.

Bake for 30 minutes.`}

                />

              )}



              {sourceType === "url" && (

                <div className="rounded-3xl border border-[#eadfd8] bg-white/90 p-5">

                  <label className="text-sm font-extrabold">Public recipe URL</label>

                  <input

                    value={sourceText}

                    onChange={(e) => setSourceText(e.target.value)}

                    className="mt-3 w-full rounded-2xl border border-[#eadfd8] bg-white px-4 py-3 text-sm"

                    placeholder="https://example.com/your-recipe"

                  />

                  <p className="mt-3 text-xs leading-5 text-[#8b8179]">

                    Works best with a public webpage. Private/logged-in pages may need a screenshot or file upload instead.

                  </p>

                </div>

              )}



              {sourceType === "youtube" && (

                <div className="rounded-3xl border border-[#eadfd8] bg-white/90 p-5">

                  <label className="text-sm font-extrabold">Public YouTube recipe URL</label>

                  <input

                    value={sourceText}

                    onChange={(e) => setSourceText(e.target.value)}

                    className="mt-3 w-full rounded-2xl border border-[#eadfd8] bg-white px-4 py-3 text-sm"

                    placeholder="https://www.youtube.com/watch?v=..."

                  />

                  <p className="mt-3 text-xs leading-5 text-[#8b8179]">

                    Kitchen Buddy sends public YouTube video URLs directly to the multimodal recipe engine.

                  </p>

                </div>

              )}



              {sourceType === "file" && (

                <label className="dashed block cursor-pointer rounded-3xl bg-white/80 p-9 text-center transition hover:bg-white">

                  <input

                    type="file"

                    accept="image/*,application/pdf,video/*,.txt,.md"

                    className="hidden"

                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}

                  />

                  <Upload className="mx-auto text-[#ff7096]" size={28} />

                  <p className="mt-3 font-extrabold">{file ? file.name : "Drop or choose a recipe file"}</p>

                  <p className="mt-2 text-xs text-[#8b8179]">Images · PDF · video · text</p>

                </label>

              )}

            </div>

          </section>



          <section className="glass mt-5 rounded-[28px] p-5 sm:p-6">

            <div className="flex flex-col gap-5 md:flex-row md:items-end">

              <div className="flex-1">

                <label className="text-xs font-black uppercase tracking-[0.14em] text-[#90786e]">Ingredient units</label>

                <select

                  value={targetUnit}

                  onChange={(e) => setTargetUnit(e.target.value)}

                  className="mt-2 w-full rounded-2xl border border-[#eadfd8] bg-white px-4 py-3.5 text-sm font-bold"

                >

                  {units.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}

                </select>

              </div>

              <div className="flex-1">

                <label className="text-xs font-black uppercase tracking-[0.14em] text-[#90786e]">Target servings</label>

                <input

                  value={targetServings}

                  onChange={(e) => setTargetServings(e.target.value)}

                  inputMode="numeric"

                  placeholder="Keep original"

                  className="mt-2 w-full rounded-2xl border border-[#eadfd8] bg-white px-4 py-3.5 text-sm font-bold"

                />

              </div>

              <div className="flex-1">

                <label className="text-xs font-black uppercase tracking-[0.14em] text-[#90786e]">Temperature</label>

                <div className="mt-2 flex rounded-2xl border border-[#eadfd8] bg-white p-1">

                  {(["C", "F"] as const).map((unit) => (

                    <button

                      key={unit}

                      onClick={() => setTemperatureUnit(unit)}

                      className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-black ${temperatureUnit === unit ? "bg-[#2f2722] text-white" : "text-[#7f746c]"}`}

                    >

                      °{unit}

                    </button>

                  ))}

                </div>

              </div>

            </div>



            {error && (

              <div className="mt-5 flex items-start gap-3 rounded-2xl bg-[#fff0f2] p-4 text-sm text-[#9f3e58]">

                <CircleAlert size={18} className="mt-0.5 shrink-0" />

                <span>{error}</span>

              </div>

            )}



            <button

              onClick={processRecipe}

              disabled={loading}

              className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#ff6f96] px-5 py-4 text-sm font-black text-white shadow-lg shadow-[#ff6f96]/20 transition hover:-translate-y-0.5 hover:bg-[#f55f88] disabled:cursor-not-allowed disabled:opacity-70"

            >

              {loading ? <><Loader2 className="spin" size={18} /> Understanding your recipe…</> : <><Sparkles size={18} /> Understand & Personalize Recipe</>}

            </button>

          </section>

        </>

      )}



      {recipe && !cooking && (

        <>

          <section className="glass rounded-[30px] p-6 sm:p-8">

            <div className="flex flex-col gap-5 border-b border-[#eee3dc] pb-6 md:flex-row md:items-end md:justify-between">

              <div>

                <span className="rounded-full bg-[#ffe9ef] px-3 py-1.5 text-xs font-extrabold text-[#b44e6d]">✨ Personalized recipe</span>

                <input

                  value={editedTitle}

                  onChange={(e) => setEditedTitle(e.target.value)}

                  className="mt-3 block w-full border-0 bg-transparent p-0 text-3xl font-black tracking-tight outline-none sm:text-5xl"

                />

                <p className="mt-2 text-sm text-[#81766e]">

                  {recipe.originalServings ? `${recipe.originalServings} original servings` : "Original serving size not stated"}

                  {recipe.targetServings ? ` → ${recipe.targetServings} servings` : ""}

                  {" · "}Output: {units.find(u => u.value === recipe.targetUnit)?.label ?? recipe.targetUnit}

                </p>

              </div>

              <button

                onClick={() => { setRecipe(null); setError(""); }}

                className="flex items-center justify-center gap-2 rounded-2xl border border-[#eadfd8] bg-white px-4 py-3 text-sm font-bold text-[#625850]"

              >

                <RotateCcw size={16} /> New recipe

              </button>

            </div>



            {recipe.warnings.length > 0 && (

              <div className="mt-5 rounded-2xl bg-[#fff8df] p-4 text-sm text-[#7a6220]">

                <div className="flex gap-2 font-extrabold"><CircleAlert size={17} /> Review notes</div>

                <div className="mt-2 space-y-1">{recipe.warnings.map((w, i) => <p key={i}>• {w}</p>)}</div>

              </div>

            )}



            <div className="mt-7 grid gap-7 lg:grid-cols-[0.9fr_1.1fr]">

              <div>

                <h3 className="text-xl font-black">Ingredients</h3>

                <div className="mt-4 space-y-2">

                  {recipe.ingredients.map((ingredient, i) => (

                    <div key={i} className="rounded-2xl border border-[#eee4dd] bg-white/75 p-4">

                      <div className="flex items-start justify-between gap-4">

                        <div>

                          <p className="text-sm font-extrabold">{ingredient.name}</p>

                          {ingredient.notes && <p className="mt-1 text-xs text-[#8b8179]">{ingredient.notes}</p>}

                        </div>

                        <p className="whitespace-nowrap text-sm font-black text-[#d44f73]">

                          {pretty(ingredient.finalQuantity)} {ingredient.finalUnit}

                        </p>

                      </div>

                      <p className="mt-1 text-[11px] text-[#a0968e]">

                        From {pretty(ingredient.originalQuantity)} {ingredient.originalUnit}

                      </p>

                    </div>

                  ))}

                </div>

              </div>



              <div>

                <h3 className="text-xl font-black">Cooking steps</h3>

                <div className="mt-5 space-y-5 border-l border-[#f0ded7] pl-5">

                  {recipe.steps.map((s) => (

                    <div key={s.id} className="recipe-step">

                      <div className="flex gap-2 text-[11px] font-black uppercase tracking-[0.13em] text-[#c07a8d]">

                        Step {s.id}

                        {s.timerSeconds ? <span className="rounded-full bg-[#eef7ff] px-2 py-0.5 text-[#5d7fa0]">⏱ {Math.round(s.timerSeconds / 60)} min</span> : null}

                      </div>

                      <p className="mt-1.5 text-sm leading-6 text-[#4e453f]">{s.text}</p>

                      {s.temperatureC != null && (

                        <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-[#fff0e5] px-2.5 py-1 text-xs font-bold text-[#a86241]">

                          <Flame size={13} /> {temperatureUnit === "C" ? Math.round(s.temperatureC) : Math.round(s.temperatureC * 9 / 5 + 32)}°{temperatureUnit}

                        </p>

                      )}

                    </div>

                  ))}

                </div>

              </div>

            </div>

          </section>



          <section className="glass mt-5 rounded-[30px] p-5 sm:p-6">

            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">

              <div>

                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#90786e]">Ready to cook?</p>

                <h3 className="mt-1 text-2xl font-black">Put the recipe into cooking mode.</h3>

                <p className="mt-1 text-sm text-[#81766e]">The exact same step payload is what we will send to your ESP32 tomorrow.</p>

              </div>

              <button

                onClick={startCooking}

                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#2f2722] px-6 py-4 text-sm font-black text-white sm:w-auto"

              >

                <Play size={17} fill="currentColor" /> Start Cooking

              </button>

            </div>

          </section>



          <section className="glass mt-5 rounded-[30px] p-5 sm:p-6">

            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">

              <div>

                <div className="flex items-center gap-2">

                  <Cpu size={18} className="text-[#ff6f96]" />

                  <h3 className="text-lg font-black">Kitchen Buddy hardware</h3>

                </div>

                <p className="mt-1 text-sm text-[#81766e]">The app is already wired for the ESP32 recipe endpoint. Connect the physical device tomorrow.</p>

              </div>

              <button

                onClick={() => setShowConnect((v) => !v)}

                className="flex items-center justify-center gap-2 rounded-2xl border border-[#eadfd8] bg-white px-5 py-3 text-sm font-black"

              >

                <Cable size={16} /> Connect Now

              </button>

            </div>



            {showConnect && (

              <div className="mt-5 rounded-2xl bg-[#fff9f3] p-4">

                <label className="text-xs font-black uppercase tracking-[0.12em] text-[#90786e]">ESP32 local IP</label>

                <div className="mt-2 flex flex-col gap-2 sm:flex-row">

                  <input

                    value={deviceIp}

                    onChange={(e) => setDeviceIp(e.target.value)}

                    placeholder="192.168.1.42"

                    className="flex-1 rounded-2xl border border-[#eadfd8] bg-white px-4 py-3 text-sm"

                  />

                  <button

                    onClick={connectDevice}

                    disabled={deviceStatus === "sending" || !deviceIp.trim()}

                    className="rounded-2xl bg-[#ff6f96] px-5 py-3 text-sm font-black text-white disabled:opacity-60"

                  >

                    {deviceStatus === "sending" ? "Sending…" : "Send Recipe"}

                  </button>

                </div>

                {deviceStatus === "sent" && <p className="mt-3 text-sm font-bold text-[#3e8a5f]">✓ Recipe sent to Kitchen Buddy.</p>}

                {deviceStatus === "error" && <p className="mt-3 text-sm font-bold text-[#a74461]">Could not reach the ESP32. That’s expected until the device is connected tomorrow.</p>}

              </div>

            )}

          </section>

        </>

      )}



      {recipe && cooking && currentStep && (

        <section className="glass overflow-hidden rounded-[32px]">

          <div className="border-b border-[#eee3dc] p-5 sm:p-7">

            <div className="flex items-center justify-between gap-4">

              <button onClick={() => setCooking(false)} className="rounded-xl p-2 hover:bg-white">

                <ArrowLeft size={19} />

              </button>

              <div className="text-center">

                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b37887]">Cooking mode</p>

                <h2 className="mt-1 text-xl font-black">{editedTitle || recipe.title}</h2>

              </div>

              <span className="rounded-full bg-[#fff0e5] px-3 py-1.5 text-xs font-black text-[#aa6745]">

                {step + 1} / {recipe.steps.length}

              </span>

            </div>

            <div className="mt-5 h-2 overflow-hidden rounded-full bg-[#f1e3dc]">

              <div className="h-full rounded-full bg-[#ff799b] transition-all" style={{ width: `${progress}%` }} />

            </div>

          </div>



          <div className="p-8 text-center sm:p-16">

            <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-[30px] bg-[#fff0f4] text-5xl">

              {step === recipe.steps.length - 1 ? "🎉" : "👩‍🍳"}

            </div>

            <p className="mt-8 text-xs font-black uppercase tracking-[0.2em] text-[#bb7185]">Step {currentStep.id}</p>

            <h3 className="mx-auto mt-4 max-w-3xl text-3xl font-black leading-tight sm:text-5xl">{currentStep.text}</h3>



            {displayedTemperature != null && (

              <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#fff0e5] px-4 py-2 text-sm font-black text-[#a86241]">

                <Flame size={16} /> {displayedTemperature}°{temperatureUnit}

              </div>

            )}



            {currentStep.timerSeconds != null && (

              <div className="mx-auto mt-8 max-w-sm rounded-[28px] bg-[#2f2722] p-6 text-white">

                <div className="flex items-center justify-center gap-2 text-xs font-black uppercase tracking-[0.15em] text-[#ffd8e2]">

                  <Timer size={15} /> Step timer

                </div>

                <p className="mt-3 text-5xl font-black tabular-nums">{secondsToClock(remaining ?? currentStep.timerSeconds)}</p>

                <button

                  onClick={() => {

                    if (remaining == null) return;

                    if (timerRunning) {

                      setTimerRunning(false);

                    } else {

                      setTimerRunning(true);

                    }

                  }}

                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-black text-[#2f2722]"

                >

                  {timerRunning ? "Pause" : "Start timer"}

                </button>

              </div>

            )}



            <div className="mx-auto mt-10 flex max-w-xl items-center justify-center gap-3">

              <button onClick={back} disabled={step === 0} className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-[#eadfd8] bg-white px-4 py-4 text-sm font-black disabled:opacity-35">

                <ArrowLeft size={17} /> Back

              </button>

              <button onClick={next} disabled={step === recipe.steps.length - 1} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#ff6f96] px-4 py-4 text-sm font-black text-white disabled:opacity-35">

                {step === recipe.steps.length - 1 ? <><Check size={17} /> Done</> : <>Next <ArrowRight size={17} /></>}

              </button>

            </div>

          </div>

        </section>

      )}



      <footer className="mt-8 text-center text-xs text-[#958981]">

        Kitchen Buddy MVP · AI understands the source, code validates the recipe math, and the final JSON is hardware-ready.

      </footer>

    </main>

  );

}


