import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type ChatMessage = { role: "user" | "assistant"; content: string };
type TopBook = { title: string; sessions: number };
type AnalyticsContext = {
  totalTitles: number; totalCopies: number; availableCopies: number;
  copiesWithReaders: number; copiesInReturnCart: number; readerProfiles: number;
  activeReaderAccounts: number; activeSessions: number; completedSessions: number;
  totalReadingMinutes: number; averageReadingMinutes: number; activeMemberships: number;
  activeQuests: number; questEnrollments: number; topBooks: TopBook[];
};

const buckets = new Map<string, { count: number; resetAt: number }>();
const cleanText = (value: unknown, max = 800) => typeof value === "string" ? value.trim().slice(0, max) : "";
const boundedNumber = (value: unknown, max = 1_000_000) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(Math.round(number), max)) : 0;
};

function parseContext(value: unknown): AnalyticsContext | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  return {
    totalTitles: boundedNumber(item.totalTitles), totalCopies: boundedNumber(item.totalCopies),
    availableCopies: boundedNumber(item.availableCopies), copiesWithReaders: boundedNumber(item.copiesWithReaders),
    copiesInReturnCart: boundedNumber(item.copiesInReturnCart), readerProfiles: boundedNumber(item.readerProfiles),
    activeReaderAccounts: boundedNumber(item.activeReaderAccounts), activeSessions: boundedNumber(item.activeSessions),
    completedSessions: boundedNumber(item.completedSessions), totalReadingMinutes: boundedNumber(item.totalReadingMinutes, 100_000_000),
    averageReadingMinutes: boundedNumber(item.averageReadingMinutes, 100_000), activeMemberships: boundedNumber(item.activeMemberships),
    activeQuests: boundedNumber(item.activeQuests), questEnrollments: boundedNumber(item.questEnrollments),
    topBooks: Array.isArray(item.topBooks) ? item.topBooks.slice(0, 5).flatMap((book): TopBook[] => {
      if (!book || typeof book !== "object") return [];
      const candidate = book as Record<string, unknown>;
      const title = cleanText(candidate.title, 160);
      return title ? [{ title, sessions: boundedNumber(candidate.sessions) }] : [];
    }) : [],
  };
}

function allowed(client: string) {
  const now = Date.now();
  const current = buckets.get(client);
  if (!current || current.resetAt <= now) { buckets.set(client, { count: 1, resetAt: now + 60_000 }); return true; }
  if (current.count >= 20) return false;
  current.count += 1;
  return true;
}

function directReply(message: string, context: AnalyticsContext) {
  const q = message.toLowerCase().replace(/[?!.,]/g, "").trim();
  if (/^(hi|hello|hey|good morning|good afternoon|good evening)( bon)?$/.test(q)) return "Hello! I can help you understand Tankobonbon operations, catalog activity, readers, sessions, memberships, and quests.";
  if (/^(who are you|what are you|what can you do|help|help me)( bon)?$/.test(q)) return "I am BON, the Tankobonbon admin analytics assistant. I summarize current library operations and explain the system using the dashboard data available to this librarian session.";
  if (/what is tankobonbon|about tankobonbon|explain tankobonbon/.test(q)) return "Tankobonbon is S.O.R.A.'s library experience for managing the catalog, physical copies, readers, memberships, in-library reading sessions, seats, quests, and rewards. This admin dashboard focuses on daily operations and analytics.";
  if (/(how many|total|count).*(book|title)|(book|title).*(how many|total|count)/.test(q)) return `Tankobonbon currently has ${context.totalTitles.toLocaleString()} catalog title${context.totalTitles === 1 ? "" : "s"} and ${context.totalCopies.toLocaleString()} physical cop${context.totalCopies === 1 ? "y" : "ies"}.`;
  if (/available.*(copy|book)|(copy|book).*available|on shelf/.test(q)) return `${context.availableCopies.toLocaleString()} of ${context.totalCopies.toLocaleString()} physical copies are currently marked available on the shelf.`;
  if (/active.*(session|visit|reader)|(session|visit|reader).*active/.test(q)) return `${context.activeSessions.toLocaleString()} reading session${context.activeSessions === 1 ? " is" : "s are"} active right now. ${context.activeReaderAccounts.toLocaleString()} of ${context.readerProfiles.toLocaleString()} reader accounts are active.`;
  if (/top|popular|most (read|borrowed)|borrowing trend/.test(q)) {
    const top = context.topBooks[0];
    return top ? `${top.title} currently leads with ${top.sessions.toLocaleString()} recorded reading session${top.sessions === 1 ? "" : "s"}.` : "There are no recorded reading sessions yet, so a most-read title cannot be identified.";
  }
  return null;
}

function guardMessage(message: string) {
  const normalized = message.toLowerCase();
  if (message.length < 2) return "Enter a complete question for BON.";
  if (/ignore (all |the )?(previous|system)|system prompt|developer message|jailbreak|api[_ -]?key|service[_ -]?role|password|drop table|delete from|alter table/.test(normalized)) return "That request cannot be processed by the admin assistant.";
  if (/explicit sexual|porn|how to kill|make a bomb|suicide instructions/.test(normalized)) return "That request is outside the Tankobonbon admin assistant's scope.";
  return null;
}

function parseGenerated(content: unknown) {
  if (typeof content !== "string") return null;
  try {
    const value = JSON.parse(content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")) as Record<string, unknown>;
    return cleanText(value.message, 1_000).replace(/[\u2013\u2014]/g, ",") || null;
  } catch { return null; }
}

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const authorization = request.headers.get("authorization");
  if (!url || !publishableKey) return NextResponse.json({ error: "Admin AI is not configured." }, { status: 503 });
  if (!authorization?.startsWith("Bearer ")) return NextResponse.json({ error: "Librarian sign-in is required." }, { status: 401 });
  const caller = createClient(url, publishableKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
  const librarian = await caller.schema("sora_v2").rpc("is_librarian");
  if (librarian.error || librarian.data !== true) return NextResponse.json({ error: "Librarian access is required." }, { status: 403 });
  const client = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "admin";
  if (!allowed(client)) return NextResponse.json({ error: "BON needs a short rest. Please try again shortly." }, { status: 429 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const message = cleanText(input.message);
  const context = parseContext(input.context);
  if (!message || !context) return NextResponse.json({ error: "Enter a question for BON." }, { status: 400 });
  const rejection = guardMessage(message);
  if (rejection) return NextResponse.json({ error: rejection }, { status: 400 });
  const direct = directReply(message, context);
  if (direct) return NextResponse.json({ message: direct });

  const history = Array.isArray(input.history) ? input.history.slice(-4).flatMap((entry): ChatMessage[] => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    const role = item.role === "user" ? "user" : item.role === "assistant" ? "assistant" : null;
    const content = cleanText(item.content, 500);
    return role && content ? [{ role, content }] : [];
  }) : [];
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "BON's AI service is not configured yet." }, { status: 503 });
  const model = process.env.OPENROUTER_MODEL || "deepseek/deepseek-v4-flash-0731";
  const system = `You are BON, the librarian-facing analytics assistant for Tankobonbon, the S.O.R.A. Smart Organized Reading Adventure library system. Focus on Tankobonbon operations, analytics, catalog health, physical-copy availability, readers, memberships, reading sessions, quests, and practical library management. Treat ADMIN ANALYTICS as the only source of current numeric facts. Never invent missing metrics or claim to perform actions. Protect personal data, credentials, secrets, and individual reader details. Politely redirect unrelated questions to Tankobonbon or library operations. Answer the question first in 1 to 4 concise sentences. Never use em dash or en dash characters. Return JSON only: {"message":"..."}.`;
  try {
    const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "https://sora-admin-puce.vercel.app", "X-Title": process.env.OPENROUTER_APP_NAME || "Tankobonbon Admin BON" },
      body: JSON.stringify({ model, temperature: 0.25, max_tokens: 220, ...(model.startsWith("deepseek/") ? { reasoning: { enabled: false } } : {}), response_format: { type: "json_object" }, messages: [{ role: "system", content: system }, ...history, { role: "user", content: `ADMIN ANALYTICS: ${JSON.stringify(context)}\nQUESTION: ${message}` }] }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!upstream.ok) {
      console.error("Admin BON OpenRouter request failed", upstream.status, (await upstream.text()).slice(0, 300));
      return NextResponse.json({ error: "BON's analytics connection is taking a moment. Please try again." }, { status: upstream.status === 429 ? 429 : 502 });
    }
    const result = await upstream.json() as { choices?: { message?: { content?: unknown } }[] };
    const answer = parseGenerated(result.choices?.[0]?.message?.content);
    return answer ? NextResponse.json({ message: answer }) : NextResponse.json({ error: "BON could not format the analytics response. Please try again." }, { status: 502 });
  } catch (error) {
    console.error("Admin BON request failed", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "BON's analytics connection is taking a moment. Please try again." }, { status: 504 });
  }
}
