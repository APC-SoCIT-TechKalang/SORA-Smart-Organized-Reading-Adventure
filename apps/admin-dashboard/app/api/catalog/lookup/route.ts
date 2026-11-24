import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  type BookMetadata,
  type FormMetadata,
  aniListAdapter,
  catalogFailure,
  cleanLabels,
  emptyBookMetadata,
  googleAdapter,
  isbn13,
  jikanAdapter,
  likelyManga,
  mangaSearchTitle,
  mergeMangaEnrichment,
  mergeMetadata,
  normalizeIsbn,
  openLibraryAdapter,
  sameIsbn,
  titleMatches,
  toFormMetadata,
  validIsbn,
  validateCoverUrl,
} from "./metadata";

export const runtime = "nodejs";

type SourceResult = { metadata: BookMetadata | null; source: string; status: number; rejectedReason?: string };
type TitleCandidate = {
  id: string;
  source: string;
  title: string;
  subtitle: string;
  coverUrl: string;
  metadata: FormMetadata;
  coverCandidates: string[];
};
type GeminiEnrichment = {
  age_rating: string;
  demographic: string;
  themes: string;
  genres: string;
  description: string;
  confidence: "low" | "medium" | "high";
};

const formFieldNames: Record<string, string> = {
  title: "title", author: "author", publisher: "publisher", imprint: "imprint",
  series_name: "series", volume_number: "volume", age_rating: "age rating",
  genres: "genres", themes: "themes", demographic: "demographic",
  description: "synopsis", cover_image_url: "cover",
};

async function validatedCoverUrls(urls: string[]) {
  const valid: string[] = [];
  for (const url of [...new Set(urls)].slice(0, 8)) {
    const checked = await validateCoverUrl(url);
    if (checked) valid.push(checked);
    else console.info("Catalog cover rejected", { url, reason: "unavailable or not an image" });
  }
  return valid;
}

function sourceFields(primary: BookMetadata, secondary: BookMetadata | undefined, primaryName: string, secondaryName: string) {
  const has = (metadata: BookMetadata | undefined, key: keyof BookMetadata) => Boolean(metadata?.[key] && (Array.isArray(metadata[key]) ? (metadata[key] as string[]).length : String(metadata[key]).trim()));
  const fieldMap: Partial<Record<keyof FormMetadata, string>> = {};
  const mappings: Array<[keyof FormMetadata, keyof BookMetadata]> = [
    ["title", "title"], ["author", "authors"], ["publisher", "publisher"], ["publication_date", "publicationDate"], ["imprint", "imprint"],
    ["series_name", "series"], ["volume_number", "volume"], ["description", "description"],
    ["cover_image_url", "coverUrls"], ["genres", "genres"],
  ];
  for (const [formKey, bookKey] of mappings) fieldMap[formKey] = has(primary, bookKey) ? primaryName : has(secondary, bookKey) ? secondaryName : "";
  return fieldMap;
}

const openLibraryHeaders = {
  "User-Agent":
    "SORA-Tanakobonbon/1.0 (library cataloging project; contact: library-admin@example.invalid)",
};

async function googleBooks(isbn: string): Promise<SourceResult> {
  const url = new URL("https://www.googleapis.com/books/v1/volumes");
  url.searchParams.set("q", `isbn:${isbn}`);
  url.searchParams.set("maxResults", "10");
  if (process.env.GOOGLE_BOOKS_API_KEY)
    url.searchParams.set("key", process.env.GOOGLE_BOOKS_API_KEY);
  const response = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    next: { revalidate: 86400 },
  });
  if (!response.ok) return { metadata: null, source: "Google Books", status: response.status, rejectedReason: `HTTP ${response.status}` };
  const result = (await response.json()) as {
    items?: Array<{ volumeInfo?: Record<string, unknown> }>;
  };
  const info = result.items
    ?.map((item) => item.volumeInfo)
    .find((candidate) => {
      const identifiers = Array.isArray(candidate?.industryIdentifiers)
        ? (candidate.industryIdentifiers as Array<{ identifier?: string }>)
        : [];
      return identifiers.some((identifier) =>
        sameIsbn(String(identifier.identifier ?? ""), isbn),
      );
    });
  return {
    metadata: info ? googleAdapter(info, isbn) : null,
    source: "Google Books", status: response.status,
    rejectedReason: info ? undefined : "No exact ISBN match",
  };
}

async function openLibrary(isbn: string): Promise<SourceResult> {
  const url = new URL("https://openlibrary.org/search.json");
  url.searchParams.set("isbn", isbn);
  url.searchParams.set(
    "fields",
    "key,title,subtitle,author_name,publisher,publish_date,first_publish_year,subject,cover_i,isbn",
  );
  url.searchParams.set("limit", "5");
  const response = await fetch(url, {
    headers: openLibraryHeaders,
    signal: AbortSignal.timeout(8000),
    next: { revalidate: 86400 },
  });
  if (!response.ok) return { metadata: null, source: "Open Library", status: response.status, rejectedReason: `HTTP ${response.status}` };
  const result = (await response.json()) as {
    docs?: Array<Record<string, unknown>>;
  };
  const info = result.docs?.find((candidate) => {
    const identifiers = Array.isArray(candidate.isbn)
      ? candidate.isbn.map(String)
      : [];
    return identifiers.some((identifier) => sameIsbn(identifier, isbn));
  });
  if (!info) return { metadata: null, source: "Open Library", status: response.status, rejectedReason: "No exact ISBN match" };
  let description = "";
  if (typeof info.key === "string" && info.key.startsWith("/works/")) {
    try {
      const workResponse = await fetch(
        `https://openlibrary.org${info.key}.json`,
        {
          headers: openLibraryHeaders,
          signal: AbortSignal.timeout(5000),
          next: { revalidate: 86400 },
        },
      );
      if (workResponse.ok) {
        const work = (await workResponse.json()) as {
          description?: string | { value?: string };
        };
        description =
          typeof work.description === "string"
            ? work.description
            : String(work.description?.value ?? "");
      }
    } catch {
      /* Edition-level metadata remains useful if the work request fails. */
    }
  }
  return {
    metadata: openLibraryAdapter(info, isbn, description),
    source: "Open Library", status: response.status,
  };
}

async function aniList(
  search: string,
  base: BookMetadata,
): Promise<SourceResult> {
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
  if (!response.ok) return { metadata: null, source: "AniList", status: response.status, rejectedReason: `HTTP ${response.status}` };
  const result = (await response.json()) as {
    data?: { Page?: { media?: Array<Record<string, unknown>> } };
  };
  const media = result.data?.Page?.media?.find((item) => {
    const title =
      item.title && typeof item.title === "object"
        ? (item.title as Record<string, unknown>)
        : {};
    const candidates = [
      title.english,
      title.romaji,
      title.native,
      ...(Array.isArray(item.synonyms) ? item.synonyms : []),
    ].map(String);
    return titleMatches(search, candidates);
  });
  return {
    metadata: media ? aniListAdapter(media, base) : null,
    source: "AniList", status: response.status,
    rejectedReason: media ? undefined : "Normalized title did not match",
  };
}

async function jikan(
  search: string,
  base: BookMetadata,
): Promise<SourceResult> {
  const url = new URL("https://api.jikan.moe/v4/manga");
  url.searchParams.set("q", search);
  url.searchParams.set("limit", "5");
  url.searchParams.set("sfw", "true");
  const response = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    next: { revalidate: 604800 },
  });
  if (!response.ok) return { metadata: null, source: "Jikan", status: response.status, rejectedReason: `HTTP ${response.status}` };
  const result = (await response.json()) as {
    data?: Array<Record<string, unknown>>;
  };
  const manga = result.data?.find((item) => {
    const titleObjects = Array.isArray(item.titles)
      ? (item.titles as Array<Record<string, unknown>>)
      : [];
    const candidates = [
      item.title,
      item.title_english,
      item.title_japanese,
      ...titleObjects.map((title) => title.title),
    ].map(String);
    return titleMatches(search, candidates);
  });
  return {
    metadata: manga ? jikanAdapter(manga, base) : null,
    source: "Jikan", status: response.status,
    rejectedReason: manga ? undefined : "Normalized title did not match",
  };
}

async function aniListCandidates(
  search: string,
  isbn: string,
): Promise<TitleCandidate[]> {
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
  const response = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables: { search } }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return [];
  const result = (await response.json()) as {
    data?: { Page?: { media?: Array<Record<string, unknown>> } };
  };
  return (result.data?.Page?.media ?? []).map((item) => {
    const titles =
      item.title && typeof item.title === "object"
        ? (item.title as Record<string, unknown>)
        : {};
    const base = emptyBookMetadata(isbn);
    base.title = search;
    const metadata = aniListAdapter(item, base);
    const subtitle = [titles.romaji, titles.native]
      .filter(
        (value) =>
          typeof value === "string" && value && value !== titles.english,
      )
      .join(" · ");
    return {
      id: `anilist-${String(item.id ?? titles.romaji ?? search)}`,
      source: "AniList",
      title: String(titles.english ?? titles.romaji ?? search),
      subtitle,
      coverUrl: metadata.coverUrls[0] ?? "",
      metadata: toFormMetadata(metadata),
      coverCandidates: metadata.coverUrls,
    };
  });
}

async function jikanCandidates(
  search: string,
  isbn: string,
): Promise<TitleCandidate[]> {
  const url = new URL("https://api.jikan.moe/v4/manga");
  url.searchParams.set("q", search);
  url.searchParams.set("limit", "6");
  url.searchParams.set("sfw", "true");
  const response = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    next: { revalidate: 604800 },
  });
  if (!response.ok) return [];
  const result = (await response.json()) as {
    data?: Array<Record<string, unknown>>;
  };
  return (result.data ?? []).map((item) => {
    const base = emptyBookMetadata(isbn);
    base.title = search;
    const metadata = jikanAdapter(item, base);
    const subtitle = [item.title, item.title_japanese]
      .filter(
        (value) =>
          typeof value === "string" && value && value !== item.title_english,
      )
      .join(" · ");
    return {
      id: `jikan-${String(item.mal_id ?? item.title ?? search)}`,
      source: "Jikan",
      title: String(item.title_english ?? item.title ?? search),
      subtitle,
      coverUrl: metadata.coverUrls[0] ?? "",
      metadata: toFormMetadata(metadata),
      coverCandidates: metadata.coverUrls,
    };
  });
}

function parseEnrichment(value: unknown): GeminiEnrichment | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const stringValue = (key: string) =>
    typeof item[key] === "string" ? String(item[key]) : "";
  const confidence = String(item.confidence ?? "low");
  return ["low", "medium", "high"].includes(confidence)
    ? {
        age_rating: stringValue("age_rating"),
        demographic: stringValue("demographic"),
        themes: stringValue("themes"),
        genres: stringValue("genres"),
        description: stringValue("description"),
        confidence: confidence as "low" | "medium" | "high",
      }
    : null;
}

async function gemini(
  metadata: FormMetadata,
): Promise<GeminiEnrichment | null> {
  if (!process.env.GEMINI_API_KEY) return null;
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
  const evidence = {
    isbn: metadata.isbn,
    title: metadata.title,
    original_title: metadata.original_title,
    romanized_title: metadata.romanized_title,
    author: metadata.author,
    contributors: metadata.contributors,
    publisher: metadata.publisher,
    imprint: metadata.imprint,
    description: metadata.description,
    source_categories: metadata.genres,
    series: metadata.series_name,
    volume: metadata.volume_number,
    book_type: metadata.book_type,
    demographic: metadata.demographic,
    age_rating: metadata.age_rating,
    themes: metadata.themes,
  };
  const prompt = `Suggest only missing library classification fields from this trusted ISBN evidence. Never create or change ISBN, title, author, publisher, imprint, publication data, series, volume, or cover. The synopsis must be concise, formal, factual, and contain no slang or unsupported plot claims. Leave unsupported fields empty. Return JSON only. demographic: Shonen, Shojo, Seinen, Josei, Children, Young Adult, Adult, General, or empty.\n${JSON.stringify(evidence)}`;
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 500,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              age_rating: { type: "STRING" },
              demographic: { type: "STRING" },
              themes: { type: "STRING" },
              genres: { type: "STRING" },
              description: { type: "STRING" },
              confidence: { type: "STRING", enum: ["low", "medium", "high"] },
            },
            required: [
              "age_rating",
              "demographic",
              "themes",
              "genres",
              "description",
              "confidence",
            ],
          },
        },
      }),
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!response.ok) return null;
  const result = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const output =
    result.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("") ?? "";
  try {
    const parsed: unknown = JSON.parse(output);
    return parseEnrichment(parsed);
  } catch {
    return null;
  }
}

async function openRouter(
  metadata: FormMetadata,
): Promise<GeminiEnrichment | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;
  const model =
    process.env.OPENROUTER_MODEL || "deepseek/deepseek-v4-flash-0731";
  const evidence = {
    isbn: metadata.isbn,
    title: metadata.title,
    original_title: metadata.original_title,
    romanized_title: metadata.romanized_title,
    author: metadata.author,
    contributors: metadata.contributors,
    publisher: metadata.publisher,
    imprint: metadata.imprint,
    description: metadata.description,
    source_categories: metadata.genres,
    series: metadata.series_name,
    volume: metadata.volume_number,
    book_type: metadata.book_type,
    demographic: metadata.demographic,
    age_rating: metadata.age_rating,
    themes: metadata.themes,
  };
  const prompt = `Suggest only missing library classification fields from this trusted ISBN evidence. Never create or change ISBN, title, author, publisher, imprint, publication data, series, volume, or cover. The synopsis must be concise, formal, factual, and contain no slang or unsupported plot claims. Leave unsupported fields empty. Genres and themes must be short labels. Return JSON only with exactly the schema fields. demographic: Shonen, Shojo, Seinen, Josei, Children, Young Adult, Adult, General, or empty. Evidence:\n${JSON.stringify(evidence)}`;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    "HTTP-Referer":
      process.env.OPENROUTER_SITE_URL || "https://sora-admin.vercel.app",
    "X-Title": "SORA Admin catalog matcher",
  };
  const metadataProperties = {
    age_rating: { type: "string" },
    demographic: { type: "string" },
    themes: { type: "string" },
    genres: { type: "string" },
    description: { type: "string" },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
  };
  const tool = {
    type: "function",
    function: {
      name: "return_catalog_metadata",
      description: "Return normalized book metadata",
      parameters: {
        type: "object",
        properties: metadataProperties,
        required: Object.keys(metadataProperties),
        additionalProperties: false,
      },
    },
  };
  const requestBody = {
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1,
    max_tokens: 400,
    ...(model.startsWith("deepseek/")
      ? { reasoning: { enabled: false } }
      : {}),
    tools: [tool],
    tool_choice: {
      type: "function",
      function: { name: "return_catalog_metadata" },
    },
  };
  let response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(15000),
  });
  // Retry with a JSON-only prompt when the selected provider lacks tool calls.
  if (!response.ok && [400, 404, 422].includes(response.status)) {
    response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 400,
        ...(model.startsWith("deepseek/")
          ? { reasoning: { enabled: false } }
          : {}),
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(15000),
    });
  }
  if (!response.ok) {
    const failure = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    console.error(
      "OpenRouter catalog enrichment failed",
      response.status,
      failure?.error?.message || "Unknown provider error",
    );
    return null;
  }
  const result = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string | Array<{ type?: string; text?: string }>;
        tool_calls?: Array<{ function?: { arguments?: string } }>;
      };
    }>;
  };
  const message = result.choices?.[0]?.message;
  const toolArguments = message?.tool_calls?.[0]?.function?.arguments ?? "";
  const content =
    typeof message?.content === "string"
      ? message.content
      : (message?.content?.map((item) => item.text ?? "").join("") ?? "");
  const output = toolArguments || content;
  const objectText = output.match(/\{[\s\S]*\}/)?.[0] ?? "";
  try {
    const enrichment = parseEnrichment(JSON.parse(objectText));
    if (!enrichment)
      console.error(
        "OpenRouter catalog enrichment returned an invalid confidence value",
      );
    return enrichment;
  } catch {
    console.error("OpenRouter catalog enrichment did not return valid JSON");
    return null;
  }
}

function applyAiSuggestions(metadata: FormMetadata, enrichment: GeminiEnrichment) {
  const applied: Array<keyof FormMetadata> = [];
  if (!metadata.age_rating && enrichment.age_rating.trim()) { metadata.age_rating = enrichment.age_rating.trim(); applied.push("age_rating"); }
  if (!metadata.demographic && enrichment.demographic.trim()) { metadata.demographic = enrichment.demographic.trim(); applied.push("demographic"); }
  const englishThemes = cleanLabels(enrichment.themes.split(",")).join(", ");
  const englishGenres = cleanLabels(enrichment.genres.split(",")).join(", ");
  if (!metadata.themes && englishThemes) { metadata.themes = englishThemes; applied.push("themes"); }
  if (!metadata.genres && englishGenres) { metadata.genres = englishGenres; applied.push("genres"); }
  if (!metadata.description && enrichment.description.trim()) { metadata.description = enrichment.description.trim(); applied.push("description"); }
  return applied;
}

export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization");
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!authorization || !supabaseUrl || !supabaseKey)
      return NextResponse.json(
        { error: "Staff authentication is required." },
        { status: 401 },
      );
    const client = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const replacementSchema = process.env.NEXT_PUBLIC_SORA_SCHEMA !== "public";
    const replacementClient = client.schema("sora_v2");
    const { error: userError } = await client.auth.getUser();
    if (userError)
      return NextResponse.json(
        { error: "Your staff session has expired." },
        { status: 401 },
      );
    const { data: isAdmin, error: roleError } = replacementSchema
      ? await replacementClient.rpc("is_librarian")
      : await client.rpc("has_role", { required_role: "admin" });
    if (roleError || !isAdmin)
      return NextResponse.json(
        { error: "Administrator access is required." },
        { status: 403 },
      );

    const body = (await request.json()) as {
      isbn?: string;
      action?: string;
      query?: string;
      useAi?: boolean;
    };
    const enteredIsbn = normalizeIsbn(body.isbn ?? "");
    if (!validIsbn(enteredIsbn))
      return NextResponse.json(
        { error: "Enter a valid ISBN-10 or ISBN-13." },
        { status: 400 },
      );
    const canonicalIsbn = isbn13(enteredIsbn);

    if (body.action === "title-search") {
      const query = String(body.query ?? "")
        .replace(/\s+/g, " ")
        .trim();
      if (query.length < 2)
        return NextResponse.json(
          { error: "Enter at least 2 characters to search by title." },
          { status: 400 },
        );
      if (!replacementSchema) {
        const { data: allowed, error: limitError } = await client.rpc(
          "consume_catalog_lookup",
        );
        if (limitError) throw limitError;
        if (!allowed)
          return NextResponse.json(
            {
              error:
                "Too many catalogue searches. Wait a few minutes and try again.",
            },
            { status: 429 },
          );
      }
      let results = await Promise.allSettled([
        aniListCandidates(query, canonicalIsbn),
        jikanCandidates(query, canonicalIsbn),
      ]);
      let candidates = results.flatMap((result) =>
        result.status === "fulfilled" ? result.value : [],
      );
      return NextResponse.json({
        candidates,
      });
    }

    const existingQuery = replacementSchema
      ? await replacementClient.from("books")
          .select("book_id,title,original_title,romanized_title,isbn,publisher,publication_date,imprint,book_type,age_rating,book_description,coverimage_url,book_genre,authors(author_firstname,author_lastname)")
          .eq("isbn", canonicalIsbn).maybeSingle()
      : await client
          .from("books")
          .select(
            "book_id,title,original_title,romanized_title,author,contributors,series_name,volume_number,isbn,publisher,imprint,format,book_type,demographic,age_rating,themes,description,cover_image_url,book_genres(genre)",
          )
          .eq("isbn", canonicalIsbn)
          .maybeSingle();
    const { data: rawExisting, error: existingError } = existingQuery;
    const existing = rawExisting as Record<string, any> | null;
    if (existingError) throw existingError;
    if (existing) {
      const genres = Array.isArray(existing.book_genres)
        ? existing.book_genres.map((item: { genre: string }) => item.genre).join(", ")
        : String((existing as { book_genre?: string }).book_genre ?? "");
      const authorRelation = existing.authors as { author_firstname?: string; author_lastname?: string } | Array<{ author_firstname?: string; author_lastname?: string }> | null;
      const replacementAuthor = Array.isArray(authorRelation) ? authorRelation[0] : authorRelation;
      const metadata = replacementSchema ? {
        ...toFormMetadata(emptyBookMetadata(canonicalIsbn)), ...existing,
        author: replacementAuthor ? `${replacementAuthor.author_firstname ?? ""} ${replacementAuthor.author_lastname ?? ""}`.trim() : "",
        description: (existing as { book_description?: string }).book_description ?? "",
        cover_image_url: (existing as { coverimage_url?: string }).coverimage_url ?? "",
        genres,
      } : { ...existing, genres, book_genres: undefined };
      return NextResponse.json({
        source: "catalog",
        existingBookId: existing.book_id,
        warnings: [
          "This ISBN already exists. Saving will add a physical copy to the existing title.",
        ],
        metadata,
        sources: ["Library catalog"], fieldSources: {}, aiFields: [], reviewFields: [], usable: true,
        coverCandidates: (existing.cover_image_url || existing.coverimage_url)
          ? [existing.cover_image_url || existing.coverimage_url]
          : [],
      });
    }

    if (!replacementSchema) {
      const { data: allowed, error: limitError } = await client.rpc(
        "consume_catalog_lookup",
      );
      if (limitError) throw limitError;
      if (!allowed)
        return NextResponse.json(
          { error: "Too many ISBN lookups. Wait a few minutes and try again." },
          { status: 429 },
        );
    }

    // Google Books is authoritative first; Open Library fills only blanks.
    const found: SourceResult[] = [];
    const attempts: Array<{ source: string; status: number; failed: boolean }> = [];
    for (const lookup of [googleBooks, openLibrary]) {
      try {
        const result = await lookup(canonicalIsbn);
        attempts.push({ source: result.source, status: result.status, failed: result.status >= 400 });
        console.info("Catalog source result", { isbn: canonicalIsbn, source: result.source, status: result.status, accepted: Boolean(result.metadata), reason: result.rejectedReason });
        if (result.metadata) found.push(result);
      } catch (error) {
        attempts.push({ source: lookup.name, status: 0, failed: true });
        console.error("Catalog source failure", { isbn: canonicalIsbn, source: lookup.name, reason: error instanceof Error ? error.message : "request failed" });
      }
    }
    const failure = catalogFailure(attempts, found.length);
    if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });
    const base = mergeMetadata(
      found[0].metadata!,
      ...found.slice(1).map((result) => result.metadata!),
    );
    const sources = found.map((result) => result.source);
    const fieldSources = sourceFields(found[0].metadata!, found[1]?.metadata ?? undefined, found[0].source, found[1]?.source ?? "");

    let normalized = base;
    if (likelyManga(base)) {
      const search = mangaSearchTitle(base);
      const enrichmentResults = await Promise.allSettled([
        aniList(search, base),
        jikan(search, base),
      ]);
      const enrichments = enrichmentResults.flatMap((result) =>
        result.status === "fulfilled" && result.value.metadata
          ? [result.value]
          : [],
      );
      normalized = mergeMangaEnrichment(
        base,
        ...enrichments.map((result) => result.metadata!),
      );
      sources.push(...enrichments.map((result) => result.source));
      for (const enrichment of enrichments) {
        for (const key of ["original_title", "romanized_title", "series_name", "volume_number", "demographic", "themes", "genres", "contributors"] as Array<keyof FormMetadata>) {
          if (!fieldSources[key]) fieldSources[key] = enrichment.source;
        }
      }
    }

    const metadata = toFormMetadata(normalized);
    let inheritedFrom = "";
    if (metadata.series_name && !replacementSchema) {
      let templateQuery = await client
        .from("books")
        .select(
          "title,author,contributors,series_name,format,publisher,imprint,book_type,demographic,themes,age_rating,book_genres(genre)",
        )
        .ilike("series_name", metadata.series_name)
        .order("book_id", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!templateQuery.data && !templateQuery.error)
        templateQuery = await client
          .from("books")
          .select(
            "title,author,contributors,series_name,format,publisher,imprint,book_type,demographic,themes,age_rating,book_genres(genre)",
          )
          .ilike("title", `${metadata.series_name}%`)
          .order("book_id", { ascending: false })
          .limit(1)
          .maybeSingle();
      if (templateQuery.error) throw templateQuery.error;
      const template = templateQuery.data;
      if (template) {
        inheritedFrom = template.title;
        metadata.author ||= template.author || "";
        metadata.contributors ||= template.contributors || "";
        metadata.publisher ||= template.publisher || "";
        metadata.imprint ||= template.imprint || "";
        metadata.book_type =
          metadata.book_type === "Other"
            ? template.book_type || metadata.book_type
            : metadata.book_type;
        metadata.demographic ||= template.demographic || "";
        metadata.themes ||= template.themes || "";
        metadata.age_rating ||= template.age_rating || "";
        const localGenres = Array.isArray(template.book_genres)
          ? template.book_genres.map((item) => item.genre)
          : [];
        metadata.genres = cleanLabels([
          ...metadata.genres.split(","),
          ...localGenres,
        ]).join(", ");
      }
    }

    let aiConfidence = "";
    let aiFields: Array<keyof FormMetadata> = [];
    const needsAiCleanup = !metadata.genres || !metadata.themes || !metadata.demographic || !metadata.age_rating || !metadata.description;
    if (needsAiCleanup && body.useAi === true) {
      try {
        const enrichment =
          (await openRouter(metadata)) ?? (await gemini(metadata));
        if (enrichment) {
          aiFields = applyAiSuggestions(metadata, enrichment);
          for (const key of aiFields) fieldSources[key] = "AI suggestion — review required";
          aiConfidence = enrichment.confidence;
        }
      } catch {
        /* The deterministic multi-source result remains usable. */
      }
    }

    const missing = [
      ["author", metadata.author],
      ["series", metadata.series_name],
      ["volume", metadata.volume_number],
      ["publisher", metadata.publisher],
      ["imprint", metadata.imprint],
      ["contributors", metadata.contributors],
      ["original title", metadata.original_title],
      ["romanized title", metadata.romanized_title],
      ["themes", metadata.themes],
      ["demographic", metadata.demographic],
      ["age rating", metadata.age_rating],
      ["synopsis", metadata.description],
      ["cover", metadata.cover_image_url],
    ]
      .filter(([, value]) => !value)
      .map(([name]) => name);
    const warnings = [
      `Metadata merged from ${[...new Set(sources)].join(", ")}. Review edition-specific details before saving.`,
      "All bibliographic fields were checked. English or official Latin-script values are used where reliable; Original title may remain in its native language.",
    ];
    if (normalized.collectedVolumeRange)
      warnings.push(
        `This omnibus collects original volumes ${normalized.collectedVolumeRange}; the Volume field uses omnibus number ${metadata.volume_number}.`,
      );
    if (inheritedFrom)
      warnings.push(
        `Stable catalogue fields were inherited from "${inheritedFrom}".`,
      );
    if (aiConfidence)
      warnings.push(
        `Free-tier AI cleaned supported classification fields (${aiConfidence} confidence).`,
      );
    if (missing.length)
      warnings.push(
        `Still unavailable from reliable sources: ${missing.join(", ")}.`,
      );
    const coverCandidates = await validatedCoverUrls(normalized.coverUrls);
    metadata.cover_image_url = coverCandidates[0] ?? "";
    fieldSources.cover_image_url = coverCandidates.length ? (fieldSources.cover_image_url || sources[0]) : "";
    if (!metadata.title || !metadata.author)
      return NextResponse.json({ error: "The sources returned incomplete metadata without a reliable title and author. Search by title explicitly or enter the record manually." }, { status: 422 });
    return NextResponse.json({
      source: "isbn",
      existingBookId: null,
      warnings,
      metadata,
      sources: [...new Set(sources)], fieldSources, aiFields,
      reviewFields: missing, usable: Boolean(metadata.title && metadata.author),
      coverCandidates,
    });
  } catch (error) {
    // Keep database/provider details in server logs. They can expose implementation
    // details and do not help an administrator recover from a failed lookup.
    console.error("Catalog ISBN lookup failed", error);
    return NextResponse.json(
      { error: "The ISBN lookup failed. Please try again." },
      { status: 500 },
    );
  }
}
