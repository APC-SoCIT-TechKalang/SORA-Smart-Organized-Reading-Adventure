import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { cleanQuestText as clean, difficultyBounds as bounds, templateQuestDraft as fallbackDraft, validateQuestDraft as parseDraft, type Difficulty } from "../../../../../shared/quest-engine";

type CatalogBook = { book_genre: string | null; book_copies: { copy_status: string }[] | null };

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const authorization = request.headers.get("authorization");
  if (!url || !key) return NextResponse.json({ error: "Quest assistance is not configured." }, { status: 503 });
  if (!authorization?.startsWith("Bearer ")) return NextResponse.json({ error: "Librarian sign-in is required." }, { status: 401 });
  const caller = createClient(url, key, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
  const librarian = await caller.schema("sora_v2").rpc("is_librarian");
  if (librarian.error || librarian.data !== true) return NextResponse.json({ error: "Librarian access is required." }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  const requested = body && typeof body === "object" ? clean((body as Record<string, unknown>).difficulty, 20) : "";
  const difficulty: Difficulty = requested === "Medium" || requested === "Hard" ? requested : "Easy";

  const [catalogResult, questResult, feedbackResult] = await Promise.all([
    caller.schema("sora_v2").from("books").select("book_genre,book_copies(copy_status)"),
    caller.schema("sora_v2").from("quests").select("target_genre").order("created_at", { ascending: false }).limit(20),
    caller.schema("sora_v2").from("quests").select("revised_parameters").not("revised_parameters", "is", null).order("updated_at", { ascending: false }).limit(10),
  ]);
  if (catalogResult.error) return NextResponse.json({ error: "The catalog could not be checked right now." }, { status: 503 });
  const inventory = new Map<string, number>();
  for (const book of catalogResult.data as CatalogBook[]) {
    const genre = book.book_genre?.trim();
    if (genre && book.book_copies?.some(copy => copy.copy_status === "In-Shelf")) inventory.set(genre, (inventory.get(genre) ?? 0) + 1);
  }
  const recentGenres = (questResult.data ?? []).map(item => clean(item.target_genre, 100)).filter(Boolean);
  const fallback = fallbackDraft(difficulty, inventory, recentGenres);
  if (!fallback) return NextResponse.json({ error: `There are not enough available catalog titles for a ${difficulty.toLowerCase()} quest.` }, { status: 422 });

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return NextResponse.json({ draft: fallback, source: "template" });
  const model = process.env.OPENROUTER_MODEL || "deepseek/deepseek-v4-flash-0731";
  const feedback = (feedbackResult.data ?? []).map(item => item.revised_parameters).filter(Boolean);
  const prompt = `Draft one varied ${difficulty} physical-library reading quest. A returned book only counts after a verified RFID session and matching physical-copy return. Use only a genre and available-title count from CATALOG INVENTORY. Do not invent chapter tracking. Do not exceed the difficulty bounds or available inventory. Avoid repeating RECENT GENRES. Apply ADMIN FEEDBACK as guidance, not model training. Return JSON only with title, description, targetGenre, bookCount, timeLimitDays, and points. DIFFICULTY BOUNDS: ${JSON.stringify(bounds[difficulty])}. CATALOG INVENTORY: ${JSON.stringify(Object.fromEntries(inventory))}. RECENT GENRES: ${JSON.stringify(recentGenres)}. ADMIN FEEDBACK: ${JSON.stringify(feedback)}.`;
  try {
    const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "https://sora-admin.vercel.app", "X-Title": "S.O.R.A. Quest Assistant" }, body: JSON.stringify({ model, temperature: 0.65, max_tokens: 220, ...(model.startsWith("deepseek/") ? { reasoning: { enabled: false } } : {}), response_format: { type: "json_object" }, messages: [{ role: "user", content: prompt }] }), signal: AbortSignal.timeout(8_000) });
    if (!upstream.ok) return NextResponse.json({ draft: fallback, source: "template" });
    const result = await upstream.json() as { choices?: { message?: { content?: unknown } }[] };
    const content = result.choices?.[0]?.message?.content;
    const parsed = typeof content === "string" ? parseDraft(JSON.parse(content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")), difficulty, inventory) : null;
    return NextResponse.json({ draft: parsed ?? fallback, source: parsed ? "ai" : "template" });
  } catch { return NextResponse.json({ draft: fallback, source: "template" }); }
}
