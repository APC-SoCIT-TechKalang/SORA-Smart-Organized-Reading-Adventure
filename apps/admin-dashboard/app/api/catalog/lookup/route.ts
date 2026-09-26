import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  type BookMetadata,
  type FormMetadata,
  aniListAdapter,
  cleanLabels,
  emptyBookMetadata,
  googleAdapter,
  isbn13,
  jikanAdapter,
  likelyManga,
  mangaSearchTitle,
  mergeMetadata,
  normalizeIsbn,
  openLibraryAdapter,
  sameIsbn,
  titleMatches,
  toFormMetadata,
  validIsbn,
} from "./metadata";

export const runtime = "nodejs";

type SourceResult = { metadata: BookMetadata | null; source: string };
type TitleCandidate = { id:string; source:string; title:string; subtitle:string; coverUrl:string; metadata:FormMetadata; coverCandidates:string[] };
type GeminiEnrichment = {
  series_name: string;
  volume_number: string;
  book_type: string;
  demographic: string;
  themes: string;
  genres: string;
  confidence: "low" | "medium" | "high";
};

const openLibraryHeaders = {
  "User-Agent": "SORA-Tanakobonbon/1.0 (library cataloging project; contact: library-admin@example.invalid)",
};

async function googleBooks(isbn: string): Promise<SourceResult> {
  const url = new URL("https://www.googleapis.com/books/v1/volumes");
  url.searchParams.set("q", `isbn:${isbn}`);
  url.searchParams.set("maxResults", "10");
  if (process.env.GOOGLE_BOOKS_API_KEY) url.searchParams.set("key", process.env.GOOGLE_BOOKS_API_KEY);
  const response = await fetch(url, { signal: AbortSignal.timeout(8000), next: { revalidate: 86400 } });
  if (!response.ok) return { metadata: null, source: "Google Books" };
  const result = await response.json() as { items?: Array<{volumeInfo?: Record<string, unknown>}> };
  const info = result.items?.map(item => item.volumeInfo).find(candidate => {
    const identifiers = Array.isArray(candidate?.industryIdentifiers)
      ? candidate.industryIdentifiers as Array<{identifier?: string}> : [];
    return identifiers.some(identifier => sameIsbn(String(identifier.identifier ?? ""), isbn));
  });
  return { metadata: info ? googleAdapter(info, isbn) : null, source: "Google Books" };
}

async function openLibrary(isbn: string): Promise<SourceResult> {
  const url = new URL("https://openlibrary.org/search.json");
  url.searchParams.set("isbn", isbn);
  url.searchParams.set("fields", "key,title,subtitle,author_name,publisher,subject,cover_i,isbn");
  url.searchParams.set("limit", "5");
  const response = await fetch(url, { headers: openLibraryHeaders, signal: AbortSignal.timeout(8000), next: { revalidate: 86400 } });
  if (!response.ok) return { metadata: null, source: "Open Library" };
  const result = await response.json() as { docs?: Array<Record<string, unknown>> };
  const info = result.docs?.find(candidate => {
    const identifiers = Array.isArray(candidate.isbn) ? candidate.isbn.map(String) : [];
    return identifiers.some(identifier => sameIsbn(identifier, isbn));
  });
  if (!info) return { metadata: null, source: "Open Library" };
  let description = "";
  if (typeof info.key === "string" && info.key.startsWith("/works/")) {
    try {
      const workResponse = await fetch(`https://openlibrary.org${info.key}.json`, {
        headers: openLibraryHeaders, signal: AbortSignal.timeout(5000), next: { revalidate: 86400 },
      });
      if (workResponse.ok) {
        const work = await workResponse.json() as {description?: string | {value?: string}};
        description = typeof work.description === "string" ? work.description : String(work.description?.value ?? "");
      }
    } catch { /* Edition-level metadata remains useful if the work request fails. */ }
  }
  return { metadata: openLibraryAdapter(info, isbn, description), source: "Open Library" };
}

async function aniList(search: string, base: BookMetadata): Promise<SourceResult> {
  const query = `query ($search: String!) {
    Page(page: 1, perPage: 5) {
      media(search: $search, type: MANGA, isAdult: false, sort: SEARCH_MATCH) {
        title { english romaji native }
        synonyms
        format
        description(asHtml: false)
        genres
        tags { name rank isMediaSpoiler }
        coverImage { extraLarge large }
        staff(perPage: 10, sort: RELEVANCE) {
          edges { role node { name { full native } } }
        }
      }
    }
  }`;
  const response = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables: { search } }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return { metadata: null, source: "AniList" };
  const result = await response.json() as {data?: {Page?: {media?: Array<Record<string, unknown>>}}};
  const media = result.data?.Page?.media?.find(item => {
    const title = item.title && typeof item.title === "object" ? item.title as Record<string, unknown> : {};
    const candidates = [title.english, title.romaji, title.native, ...(Array.isArray(item.synonyms) ? item.synonyms : [])].map(String);
    return titleMatches(search, candidates);
  });
  return { metadata: media ? aniListAdapter(media, base) : null, source: "AniList" };
}

async function jikan(search: string, base: BookMetadata): Promise<SourceResult> {
  const url = new URL("https://api.jikan.moe/v4/manga");
  url.searchParams.set("q", search);
  url.searchParams.set("limit", "5");
  url.searchParams.set("sfw", "true");
  const response = await fetch(url, { signal: AbortSignal.timeout(8000), next: { revalidate: 604800 } });
  if (!response.ok) return { metadata: null, source: "Jikan" };
  const result = await response.json() as {data?: Array<Record<string, unknown>>};
  const manga = result.data?.find(item => {
    const titleObjects = Array.isArray(item.titles) ? item.titles as Array<Record<string, unknown>> : [];
    const candidates = [item.title, item.title_english, item.title_japanese, ...titleObjects.map(title => title.title)].map(String);
    return titleMatches(search, candidates);
  });
  return { metadata: manga ? jikanAdapter(manga, base) : null, source: "Jikan" };
}

async function aniListCandidates(search: string, isbn: string): Promise<TitleCandidate[]> {
  const query = `query ($search: String!) {
    Page(page: 1, perPage: 6) {
      media(search: $search, type: MANGA, isAdult: false, sort: SEARCH_MATCH) {
        id title { english romaji native } format description(asHtml: false) genres
        tags { name rank isMediaSpoiler }
        coverImage { extraLarge large }
        staff(perPage: 10, sort: RELEVANCE) { edges { role node { name { full native } } } }
      }
    }
  }`;
  const response = await fetch("https://graphql.anilist.co", { method:"POST", headers:{"Content-Type":"application/json",Accept:"application/json"}, body:JSON.stringify({query,variables:{search}}), signal:AbortSignal.timeout(8000) });
  if (!response.ok) return [];
  const result = await response.json() as {data?:{Page?:{media?:Array<Record<string,unknown>>}}};
  return (result.data?.Page?.media ?? []).map(item => {
    const titles = item.title && typeof item.title === "object" ? item.title as Record<string,unknown> : {};
    const base = emptyBookMetadata(isbn); base.title = search;
    const metadata = aniListAdapter(item, base);
    const subtitle = [titles.romaji,titles.native].filter(value=>typeof value==="string"&&value&&value!==titles.english).join(" · ");
    return { id:`anilist-${String(item.id ?? titles.romaji ?? search)}`, source:"AniList", title:String(titles.english ?? titles.romaji ?? search), subtitle, coverUrl:metadata.coverUrls[0]??"", metadata:toFormMetadata(metadata), coverCandidates:metadata.coverUrls };
  });
}

async function jikanCandidates(search: string, isbn: string): Promise<TitleCandidate[]> {
  const url = new URL("https://api.jikan.moe/v4/manga");
  url.searchParams.set("q", search); url.searchParams.set("limit", "6"); url.searchParams.set("sfw", "true");
  const response = await fetch(url, {signal:AbortSignal.timeout(8000),next:{revalidate:604800}});
  if (!response.ok) return [];
  const result = await response.json() as {data?:Array<Record<string,unknown>>};
  return (result.data ?? []).map(item => {
    const base = emptyBookMetadata(isbn); base.title = search;
    const metadata = jikanAdapter(item, base);
    const subtitle = [item.title,item.title_japanese].filter(value=>typeof value==="string"&&value&&value!==item.title_english).join(" · ");
    return { id:`jikan-${String(item.mal_id ?? item.title ?? search)}`, source:"Jikan", title:String(item.title_english ?? item.title ?? search), subtitle, coverUrl:metadata.coverUrls[0]??"", metadata:toFormMetadata(metadata), coverCandidates:metadata.coverUrls };
  });
}

function validGeminiEnrichment(value: unknown): value is GeminiEnrichment {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  const strings = ["series_name", "volume_number", "book_type", "demographic", "themes", "genres"];
  return strings.every(key => typeof item[key] === "string") && ["low", "medium", "high"].includes(String(item.confidence));
}

async function gemini(metadata: FormMetadata): Promise<GeminiEnrichment | null> {
  if (!process.env.GEMINI_API_KEY) return null;
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
  const evidence = {
    title: metadata.title, author: metadata.author, publisher: metadata.publisher,
    description: metadata.description, source_categories: metadata.genres,
    series: metadata.series_name, volume: metadata.volume_number,
  };
  const prompt = `Clean and classify library metadata using ONLY this evidence JSON. Never add unstated factual claims. Keep existing series and volume. Return empty strings when evidence is insufficient. book_type: Manga, Light Novel, Novel, Comic, or Other. demographic: Shonen, Shojo, Seinen, Josei, Children, Young Adult, Adult, General, or empty. Genres and themes are short comma-separated labels; exclude awards, formats, demographics, and marketing phrases.\n${JSON.stringify(evidence)}`;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1, maxOutputTokens: 500, responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            series_name: { type: "STRING" }, volume_number: { type: "STRING" }, book_type: { type: "STRING" },
            demographic: { type: "STRING" }, themes: { type: "STRING" }, genres: { type: "STRING" },
            confidence: { type: "STRING", enum: ["low", "medium", "high"] },
          },
          required: ["series_name", "volume_number", "book_type", "demographic", "themes", "genres", "confidence"],
        },
      },
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) return null;
  const result = await response.json() as {candidates?: Array<{content?: {parts?: Array<{text?: string}>}}>};
  const output = result.candidates?.[0]?.content?.parts?.map(part => part.text ?? "").join("") ?? "";
  try {
    const parsed: unknown = JSON.parse(output);
    return validGeminiEnrichment(parsed) ? parsed : null;
  } catch { return null; }
}

function applyGemini(metadata: FormMetadata, enrichment: GeminiEnrichment) {
  metadata.series_name ||= enrichment.series_name.trim();
  metadata.volume_number ||= enrichment.volume_number.trim();
  metadata.book_type = metadata.book_type === "Other" ? enrichment.book_type.trim() || metadata.book_type : metadata.book_type;
  metadata.demographic ||= enrichment.demographic.trim();
  metadata.themes ||= cleanLabels(enrichment.themes.split(",")).join(", ");
  metadata.genres = cleanLabels([...metadata.genres.split(","), ...enrichment.genres.split(",")]).join(", ");
}

export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization");
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!authorization || !supabaseUrl || !supabaseKey) return NextResponse.json({ error: "Staff authentication is required." }, { status: 401 });
    const client = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authorization } }, auth: { persistSession: false },
    });
    const { error: userError } = await client.auth.getUser();
    if (userError) return NextResponse.json({ error: "Your staff session has expired." }, { status: 401 });
    const { data: isAdmin, error: roleError } = await client.rpc("has_role", { required_role: "admin" });
    if (roleError || !isAdmin) return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });

    const body = await request.json() as {isbn?: string; action?: string; query?: string};
    const enteredIsbn = normalizeIsbn(body.isbn ?? "");
    if (!validIsbn(enteredIsbn)) return NextResponse.json({ error: "Enter a valid ISBN-10 or ISBN-13." }, { status: 400 });
    const canonicalIsbn = isbn13(enteredIsbn);

    if (body.action === "title-search") {
      const query = String(body.query ?? "").replace(/\s+/g, " ").trim();
      if (query.length < 2) return NextResponse.json({ error:"Enter at least 2 characters to search by title." }, {status:400});
      const {data:allowed,error:limitError} = await client.rpc("consume_catalog_lookup");
      if (limitError) throw limitError;
      if (!allowed) return NextResponse.json({error:"Too many catalogue searches. Wait a few minutes and try again."},{status:429});
      const results = await Promise.allSettled([aniListCandidates(query,canonicalIsbn),jikanCandidates(query,canonicalIsbn)]);
      const candidates = results.flatMap(result=>result.status==="fulfilled"?result.value:[]);
      return NextResponse.json({candidates});
    }

    const { data: existing, error: existingError } = await client.from("books")
      .select("book_id,title,original_title,romanized_title,author,contributors,series_name,volume_number,isbn,publisher,imprint,format,book_type,demographic,age_rating,themes,description,cover_image_url,book_genres(genre)")
      .eq("isbn", canonicalIsbn).maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      const genres = Array.isArray(existing.book_genres) ? existing.book_genres.map(item => item.genre).join(", ") : "";
      const metadata = { ...existing, genres, book_genres: undefined };
      return NextResponse.json({
        source: "catalog", existingBookId: existing.book_id,
        warnings: ["This ISBN already exists. Saving will add a physical copy to the existing title."],
        metadata, coverCandidates: existing.cover_image_url ? [existing.cover_image_url] : [],
      });
    }

    const { data: allowed, error: limitError } = await client.rpc("consume_catalog_lookup");
    if (limitError) throw limitError;
    if (!allowed) return NextResponse.json({ error: "Too many ISBN lookups. Wait a few minutes and try again." }, { status: 429 });

    const bibliographicResults = await Promise.allSettled([googleBooks(canonicalIsbn), openLibrary(canonicalIsbn)]);
    const found = bibliographicResults.flatMap(result => result.status === "fulfilled" && result.value.metadata ? [result.value] : []);
    if (!found.length) return NextResponse.json({
      source:"isbn", existingBookId:null,
      warnings:["No edition metadata was found for this ISBN. Search by title below or enter the volume manually."],
      metadata:toFormMetadata(emptyBookMetadata(canonicalIsbn)), coverCandidates:[],
    });
    const base = mergeMetadata(found[0].metadata!, ...found.slice(1).map(result => result.metadata!));
    const sources = found.map(result => result.source);

    let normalized = base;
    if (likelyManga(base)) {
      const search = mangaSearchTitle(base);
      const enrichmentResults = await Promise.allSettled([aniList(search, base), jikan(search, base)]);
      const enrichments = enrichmentResults.flatMap(result => result.status === "fulfilled" && result.value.metadata ? [result.value] : []);
      normalized = mergeMetadata(base, ...enrichments.map(result => result.metadata!));
      sources.push(...enrichments.map(result => result.source));
    }

    const metadata = toFormMetadata(normalized);
    let inheritedFrom = "";
    if (metadata.series_name) {
      let templateQuery = await client.from("books").select("title,author,contributors,series_name,format,publisher,imprint,book_type,demographic,themes,age_rating,book_genres(genre)").ilike("series_name", metadata.series_name).order("book_id", { ascending: false }).limit(1).maybeSingle();
      if (!templateQuery.data && !templateQuery.error) templateQuery = await client.from("books").select("title,author,contributors,series_name,format,publisher,imprint,book_type,demographic,themes,age_rating,book_genres(genre)").ilike("title", `${metadata.series_name}%`).order("book_id", { ascending: false }).limit(1).maybeSingle();
      if (templateQuery.error) throw templateQuery.error;
      const template = templateQuery.data;
      if (template) {
        inheritedFrom = template.title;
        metadata.author ||= template.author || "";
        metadata.contributors ||= template.contributors || "";
        metadata.publisher ||= template.publisher || "";
        metadata.imprint ||= template.imprint || "";
        metadata.book_type = metadata.book_type === "Other" ? template.book_type || metadata.book_type : metadata.book_type;
        metadata.demographic ||= template.demographic || "";
        metadata.themes ||= template.themes || "";
        metadata.age_rating ||= template.age_rating || "";
        const localGenres = Array.isArray(template.book_genres) ? template.book_genres.map(item => item.genre) : [];
        metadata.genres = cleanLabels([...metadata.genres.split(","), ...localGenres]).join(", ");
      }
    }

    let aiConfidence = "";
    const needsAiCleanup = !metadata.series_name || !metadata.volume_number || !metadata.genres || !metadata.themes || !metadata.demographic || metadata.book_type === "Other";
    if (needsAiCleanup) {
      try {
        const enrichment = await gemini(metadata);
        if (enrichment) { applyGemini(metadata, enrichment); aiConfidence = enrichment.confidence; }
      } catch { /* The deterministic multi-source result remains usable. */ }
    }

    const missing = [
      ["author", metadata.author], ["series", metadata.series_name], ["volume", metadata.volume_number],
      ["publisher", metadata.publisher], ["imprint", metadata.imprint], ["contributors", metadata.contributors],
      ["original title", metadata.original_title], ["romanized title", metadata.romanized_title],
      ["themes", metadata.themes], ["demographic", metadata.demographic], ["age rating", metadata.age_rating],
      ["synopsis", metadata.description], ["cover", metadata.cover_image_url],
    ].filter(([, value]) => !value).map(([name]) => name);
    const warnings = [`Metadata merged from ${[...new Set(sources)].join(", ")}. Review edition-specific details before saving.`];
    if (normalized.collectedVolumeRange) warnings.push(`This omnibus collects original volumes ${normalized.collectedVolumeRange}; the Volume field uses omnibus number ${metadata.volume_number}.`);
    if (inheritedFrom) warnings.push(`Stable catalogue fields were inherited from "${inheritedFrom}".`);
    if (aiConfidence) warnings.push(`Free-tier AI cleaned supported classification fields (${aiConfidence} confidence).`);
    if (missing.length) warnings.push(`Still unavailable from reliable sources: ${missing.join(", ")}.`);
    return NextResponse.json({ source: "isbn", existingBookId: null, warnings, metadata, coverCandidates: normalized.coverUrls });
  } catch (error) {
    // Keep database/provider details in server logs. They can expose implementation
    // details and do not help an administrator recover from a failed lookup.
    console.error("Catalog ISBN lookup failed", error);
    return NextResponse.json({ error: "The ISBN lookup failed. Please try again." }, { status: 500 });
  }
}
