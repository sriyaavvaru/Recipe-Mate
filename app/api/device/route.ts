import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const { ip, recipe } = await request.json();

    if (!ip || !recipe) {
      return NextResponse.json({ error: "ESP32 IP and recipe are required." }, { status: 400 });
    }

    const cleanIp = String(ip).replace(/^https?:\/\//, "").replace(/\/+$/, "");
    const response = await fetch(`http://${cleanIp}/recipe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(recipe),
      cache: "no-store"
    });

    const text = await response.text();
    if (!response.ok) {
      return NextResponse.json(
        { error: `Kitchen Buddy returned HTTP ${response.status}: ${text}` },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, message: text || "Recipe sent to Kitchen Buddy." });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Could not reach Kitchen Buddy. The ESP32 may be offline." },
      { status: 502 }
    );
  }
}
