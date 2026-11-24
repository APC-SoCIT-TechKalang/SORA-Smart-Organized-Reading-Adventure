import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { cleanQuestText as clean, difficultyBounds, inferQuestDifficulty, templateQuestDraft, validateQuestDraft, type Difficulty, type QuestDraft } from "../../../../../shared/quest-engine";

type CatalogBook = { book_genre: string | null; book_copies: { copy_status: string }[] | null };
const levels: Difficulty[] = ["Easy", "Medium", "Hard"];

function requestedCounts(prompt: string, requested: unknown, fallback: Difficulty) {
  const counts: Record<Difficulty, number> = { Easy: 0, Medium: 0, Hard: 0 };
  if (requested && typeof requested === "object") for (const level of levels) counts[level] = Math.max(0, Math.min(10, Math.floor(Number((requested as Record<string, unknown>)[level]) || 0)));
  for (const level of levels) { const match = prompt.match(new RegExp(`(?:generate|create|draft)?\\s*(\\d+)\\s+${level}`, "i")); if (match) counts[level] = Math.min(10, Number(match[1])); }
  if (!levels.some(level => counts[level])) for (const level of levels) if (new RegExp(`\\b${level}\\b`,"i").test(prompt)) counts[level]=1;
  if (!levels.some(level => counts[level])) counts[fallback] = 1;
  return counts;
}
function safeJson(value: unknown) { if (typeof value !== "string") return null; try { return JSON.parse(value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")) as unknown; } catch { return null; } }
function fallbackBatch(counts: Record<Difficulty, number>, inventory: Map<string, number>, recent: string[]) {
  const drafts: QuestDraft[] = []; const used = [...recent];
  for (const level of levels) for (let index = 0; index < counts[level]; index++) { const draft = templateQuestDraft(level, inventory, used); if (draft) { drafts.push(draft); if (draft.targetGenre) used.push(draft.targetGenre); } }
  return drafts;
}

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY; const authorization = request.headers.get("authorization");
  if (!url || !key) return NextResponse.json({ error: "Quest assistance is not configured." }, { status: 503 });
  if (!authorization?.startsWith("Bearer ")) return NextResponse.json({ error: "Librarian sign-in is required." }, { status: 401 });
  const caller = createClient(url, key, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
  const librarian = await caller.schema("sora_v2").rpc("is_librarian"); if (librarian.error || librarian.data !== true) return NextResponse.json({ error: "Librarian access is required." }, { status: 403 });
  let body: Record<string, unknown>; try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  const requested = clean(body.difficulty, 20); const requestedDifficulty: Difficulty = requested === "Medium" || requested === "Hard" ? requested : "Easy";
  const prompt = clean(body.prompt, 800) || `Generate one ${requestedDifficulty} quest.`; const difficulty = inferQuestDifficulty(prompt, requestedDifficulty); const counts = requestedCounts(prompt, body.counts, difficulty);
  const [catalogResult, questResult, feedbackResult] = await Promise.all([
    caller.schema("sora_v2").from("books").select("book_genre,book_copies(copy_status)"), caller.schema("sora_v2").from("quests").select("target_genre").order("created_at", { ascending: false }).limit(30),
    caller.schema("sora_v2").from("quests").select("revised_parameters").not("revised_parameters", "is", null).order("updated_at", { ascending: false }).limit(20),
  ]);
  if (catalogResult.error) return NextResponse.json({ error: "The catalog could not be checked right now." }, { status: 503 });
  const inventory = new Map<string, number>(); let total = 0;
  for (const book of catalogResult.data as CatalogBook[]) if (book.book_copies?.some(copy => ["in-shelf","in_shelf","available"].includes(copy.copy_status.trim().toLowerCase()))) { total++; for (const genre of (book.book_genre ?? "").split(",").map(value => value.trim()).filter(Boolean)) inventory.set(genre, (inventory.get(genre) ?? 0) + 1); }
  inventory.set("*", total);
  const existingDrafts = Array.isArray(body.existingDrafts) ? body.existingDrafts.slice(0, 30) : [];
  const priorDraftGenres = existingDrafts.map(item => item && typeof item === "object" ? clean((item as Record<string,unknown>).targetGenre,100) : "").filter(Boolean);
  const recentGenres = [...priorDraftGenres, ...(questResult.data ?? []).map(item => clean(item.target_genre, 100)).filter(Boolean)]; const fallback = fallbackBatch(counts, inventory, recentGenres);
  if (!fallback.length) return NextResponse.json({ error: "There are not enough available catalog titles for the requested quests." }, { status: 422 });
  const apiKey = process.env.OPENROUTER_API_KEY?.trim(); if (!apiKey) return NextResponse.json({ error: "AI quest generation is not configured. Add OPENROUTER_API_KEY to the Admin Vercel project, then redeploy." }, { status: 503 });
  const desired = levels.flatMap(level => Array.from({ length: counts[level] }, () => level)); const feedback = (feedbackResult.data ?? []).map(item => item.revised_parameters).filter(Boolean);
  const instruction = `You draft librarian-reviewed physical reading quests. Follow REQUEST and preserve conversational references to EXISTING DRAFTS. Return exactly ${desired.length} drafts in the requested difficulty order. Each draft needs title, description, difficulty, targetGenre (empty for a general quest), bookCount, timeLimitDays, points. Use only catalog genres and capacity. A book counts only after a verified physical return. Avoid duplicate concepts and unsupported activities. Apply past librarian feedback as preferences, not model training. REQUEST: ${prompt}. DIFFICULTIES: ${JSON.stringify(desired)}. RULES: ${JSON.stringify(difficultyBounds)}. INVENTORY: ${JSON.stringify(Object.fromEntries(inventory))}. RECENT GENRES: ${JSON.stringify(recentGenres)}. EXISTING DRAFTS: ${JSON.stringify(existingDrafts)}. PAST FEEDBACK: ${JSON.stringify(feedback)}. Return JSON {"message":"...","drafts":[...]}.`;
  const model=process.env.OPENROUTER_MODEL?.trim()||"deepseek/deepseek-v4-flash-0731";
  const attempts=[{structured:true},{structured:false}]; let lastStatus=503; let lastProviderMessage="";
  for(const attempt of attempts){
    try{
      const upstream=await fetch("https://openrouter.ai/api/v1/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json","HTTP-Referer":process.env.OPENROUTER_SITE_URL||"https://sora-admin.vercel.app","X-Title":"S.O.R.A. Quest Assistant"},body:JSON.stringify({model,temperature:.7,max_tokens:Math.min(4000,300+desired.length*140),...(attempt.structured&&model.startsWith("deepseek/")?{reasoning:{enabled:false}}:{}),...(attempt.structured?{response_format:{type:"json_object"}}:{}),messages:[{role:"user",content:instruction}]}),signal:AbortSignal.timeout(25_000)});
      lastStatus=upstream.status;
      if(!upstream.ok){const detail=(await upstream.text()).slice(0,500);try{lastProviderMessage=String((JSON.parse(detail) as {error?:{message?:unknown}}).error?.message||"")}catch{}console.error("Quest OpenRouter model failed",model,upstream.status,detail);if(upstream.status===401||upstream.status===403)return NextResponse.json({error:"AI authentication failed. Replace OPENROUTER_API_KEY in the Admin Vercel project and redeploy."},{status:503});if(upstream.status===402)return NextResponse.json({error:"OpenRouter rejected the paid request for insufficient credits or an API-key spending limit. Check the key limit and account balance, then try again."},{status:402});continue;}
      const result=await upstream.json() as {choices?:{message?:{content?:unknown}}[]};const parsed=safeJson(result.choices?.[0]?.message?.content);const object=parsed&&typeof parsed==="object"?parsed as Record<string,unknown>:{};const raw=Array.isArray(object.drafts)?object.drafts:[];
      const drafts=desired.flatMap((level,index)=>{const generated=validateQuestDraft(raw[index],level,inventory);return generated?[generated]:[];});
      if(drafts.length)return NextResponse.json({message:clean(object.message,500)||`${drafts.length} feasible AI quest draft${drafts.length===1?"":"s"} prepared for librarian review.`,drafts,source:"ai"});
      console.error("Quest OpenRouter returned no valid drafts",model,attempt.structured?"structured":"compatibility");
    }catch(error){console.error("Quest OpenRouter model request failed",model,error instanceof Error?error.message:"Unknown error");}
  }
  const error=lastStatus===429?"OpenRouter is rate-limiting AI generation. Wait briefly and try again.":lastProviderMessage?`OpenRouter could not generate the quest: ${lastProviderMessage}`:"The paid AI model could not generate a valid quest right now. Please try again.";
  return NextResponse.json({error},{status:lastStatus===429?429:503});
}
