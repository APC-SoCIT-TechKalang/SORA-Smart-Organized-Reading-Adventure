import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Metadata = {
  title: string;
  original_title: string;
  romanized_title: string;
  author: string;
  contributors: string;
  series_name: string;
  volume_number: string;
  isbn: string;
  publisher: string;
  imprint: string;
  format: string;
  book_type: string;
  demographic: string;
  age_rating: string;
  themes: string;
  description: string;
  cover_image_url: string;
  genres: string;
};

const emptyMetadata = (isbn: string): Metadata => ({
  title: "", original_title: "", romanized_title: "", author: "", contributors: "",
  series_name: "", volume_number: "", isbn, publisher: "", imprint: "", format: "Physical",
  book_type: "", demographic: "", age_rating: "", themes: "", description: "",
  cover_image_url: "", genres: "",
});

function normalizeIsbn(value: string) {
  return value.toUpperCase().replace(/[^0-9X]/g, "");
}

function validIsbn(value: string) {
  if (/^97[89]\d{10}$/.test(value)) {
    const sum = value.slice(0, 12).split("").reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0);
    return (10 - (sum % 10)) % 10 === Number(value[12]);
  }
  if (/^\d{9}[\dX]$/.test(value)) {
    const sum = value.split("").reduce((total, digit, index) => total + (digit === "X" ? 10 : Number(digit)) * (10 - index), 0);
    return sum % 11 === 0;
  }
  return false;
}

function canonicalIsbn(value: string) {
  if (value.length === 13) return value;
  const base = `978${value.slice(0, 9)}`;
  const sum = base.split("").reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0);
  return `${base}${(10 - (sum % 10)) % 10}`;
}

function titleParts(title: string) {
  const match = title.match(/^(.*?)(?:[,.:\s-]+(?:vol(?:ume)?\.?|book)\s*#?)(\d+(?:\.\d+)?)\b/i)
    ?? title.match(/^(.*?)[,.\s-]+(\d+(?:\.\d+)?)$/);
  return { series: match?.[1]?.trim() ?? "", volume: match?.[2] ?? "" };
}

function mergeMetadata(primary: Metadata | null, fallback: Metadata | null, isbn: string): Metadata | null {
  if (!primary && !fallback) return null;
  const merged = emptyMetadata(isbn);
  for (const key of Object.keys(merged) as Array<keyof Metadata>) {
    merged[key] = primary?.[key] || fallback?.[key] || merged[key];
  }
  const parts = titleParts(merged.title);
  if (!merged.series_name) merged.series_name = parts.series;
  if (!merged.volume_number) merged.volume_number = parts.volume;
  return merged;
}

async function googleBooks(isbn: string): Promise<Metadata | null> {
  const key = process.env.GOOGLE_BOOKS_API_KEY;
  const url = new URL("https://www.googleapis.com/books/v1/volumes");
  url.searchParams.set("q", `isbn:${isbn}`);
  url.searchParams.set("maxResults", "5");
  if (key) url.searchParams.set("key", key);
  const response = await fetch(url, { signal: AbortSignal.timeout(8000), next: { revalidate: 86400 } });
  if (!response.ok) return null;
  const result = await response.json() as { items?: Array<{ volumeInfo?: Record<string, unknown> }> };
  const info = result.items?.[0]?.volumeInfo;
  if (!info) return null;
  const title = String(info.title ?? "");
  const subtitle = String(info.subtitle ?? "");
  const parts = titleParts(`${title} ${subtitle}`.trim());
  const identifiers = Array.isArray(info.industryIdentifiers) ? info.industryIdentifiers as Array<{type?: string;identifier?: string}> : [];
  const images = info.imageLinks as Record<string, string> | undefined;
  return {
    ...emptyMetadata(identifiers.find(item => item.type === "ISBN_13")?.identifier ?? isbn),
    title: subtitle ? `${title}: ${subtitle}` : title,
    author: Array.isArray(info.authors) ? info.authors.join(", ") : "",
    series_name: parts.series,
    volume_number: parts.volume,
    publisher: String(info.publisher ?? ""),
    description: String(info.description ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    cover_image_url: (images?.extraLarge || images?.large || images?.medium || images?.thumbnail || "").replace(/^http:/, "https:"),
    genres: Array.isArray(info.categories) ? info.categories.join(", ") : "",
  };
}

async function openLibrary(isbn: string): Promise<Metadata | null> {
  const url = new URL("https://openlibrary.org/search.json");
  url.searchParams.set("isbn", isbn);
  url.searchParams.set("fields", "key,title,subtitle,author_name,publisher,subject,cover_i,isbn");
  url.searchParams.set("limit", "1");
  const response = await fetch(url, {
    headers: { "User-Agent": "SORA-Tanakobonbon/1.0 (library cataloging project)" },
    signal: AbortSignal.timeout(8000), next: { revalidate: 86400 },
  });
  if (!response.ok) return null;
  const result = await response.json() as { docs?: Array<Record<string, unknown>> };
  const info = result.docs?.[0];
  if (!info) return null;
  const title = String(info.title ?? "");
  const subtitle = String(info.subtitle ?? "");
  const parts = titleParts(`${title} ${subtitle}`.trim());
  const publishers = Array.isArray(info.publisher) ? info.publisher.map(String) : [];
  const subjects = Array.isArray(info.subject) ? info.subject.map(String).filter(value => !value.startsWith("nyt:")).slice(0, 8) : [];
  const authors = Array.isArray(info.author_name) ? info.author_name.map(String) : [];
  const coverId = typeof info.cover_i === "number" ? info.cover_i : null;
  let description = "";
  if(typeof info.key === "string" && info.key.startsWith("/works/")) {
    try {
      const workResponse=await fetch(`https://openlibrary.org${info.key}.json`,{headers:{"User-Agent":"SORA-Tanakobonbon/1.0 (library cataloging project)"},signal:AbortSignal.timeout(6000),next:{revalidate:86400}});
      if(workResponse.ok){const work=await workResponse.json() as {description?:string|{value?:string}};description=typeof work.description==="string"?work.description:String(work.description?.value??"");}
    } catch { /* The search metadata remains useful when work details time out. */ }
  }
  return {
    ...emptyMetadata(isbn),
    title: subtitle ? `${title}: ${subtitle}` : title,
    author: authors.join(", "),
    series_name: parts.series,
    volume_number: parts.volume,
    publisher: publishers.join(", "),
    description,
    cover_image_url: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-L.jpg?default=false`,
    genres: subjects.join(", "),
  };
}

export async function POST(request: NextRequest) {
  try {
    const auth = request.headers.get("authorization");
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!auth || !url || !key) return NextResponse.json({ error: "Staff authentication is required." }, { status: 401 });
    const client = createClient(url, key, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { error: userError } = await client.auth.getUser();
    if (userError) return NextResponse.json({ error: "Your staff session has expired." }, { status: 401 });
    const { data: isAdmin, error: roleError } = await client.rpc("has_role", { required_role: "admin" });
    if (roleError || !isAdmin) return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });

    const body = await request.json() as { isbn?: string };
    const enteredIsbn = normalizeIsbn(body.isbn ?? "");
    if (!validIsbn(enteredIsbn)) return NextResponse.json({ error: "Enter a valid ISBN-10 or ISBN-13." }, { status: 400 });
    const isbn = canonicalIsbn(enteredIsbn);

    const { data: existing, error: existingError } = await client.from("books")
      .select("book_id,title,original_title,romanized_title,author,contributors,series_name,volume_number,isbn,publisher,imprint,format,book_type,demographic,age_rating,themes,description,cover_image_url,book_genres(genre)")
      .eq("isbn", isbn).maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      const genres = Array.isArray(existing.book_genres) ? existing.book_genres.map(item => item.genre).join(", ") : "";
      return NextResponse.json({ source: "catalog", existingBookId: existing.book_id, warnings: ["This ISBN already exists. Saving will add a physical copy to the existing title."], metadata: { ...emptyMetadata(isbn), ...existing, genres, book_genres: undefined } });
    }

    const { data: allowed, error: limitError } = await client.rpc("consume_catalog_lookup");
    if (limitError) throw limitError;
    if (!allowed) return NextResponse.json({ error: "Too many ISBN lookups. Wait a few minutes and try again." }, { status: 429 });

    const [googleResult,openResult] = await Promise.allSettled([googleBooks(isbn),openLibrary(isbn)]);
    const google = googleResult.status === "fulfilled" ? googleResult.value : null;
    const open = openResult.status === "fulfilled" ? openResult.value : null;
    const apiMetadata = mergeMetadata(google,open,isbn);
    if (!apiMetadata) return NextResponse.json({ error: "No metadata was found for this ISBN. You can still enter the volume manually." }, { status: 404 });
    const metadata = { ...apiMetadata, book_type: /light novel/i.test(`${apiMetadata.title} ${apiMetadata.genres}`) ? "Light Novel" : /manga|comic|graphic novel/i.test(`${apiMetadata.title} ${apiMetadata.genres}`) ? "Manga" : "Other" };
    let inheritedFrom="";
    if(metadata.series_name){
      let templateQuery=await client.from("books").select("title,author,contributors,series_name,format,publisher,imprint,book_type,demographic,themes,age_rating,book_genres(genre)").ilike("series_name",metadata.series_name).order("book_id",{ascending:false}).limit(1).maybeSingle();
      if(!templateQuery.data&&!templateQuery.error){templateQuery=await client.from("books").select("title,author,contributors,series_name,format,publisher,imprint,book_type,demographic,themes,age_rating,book_genres(genre)").ilike("title",`${metadata.series_name}%`).order("book_id",{ascending:false}).limit(1).maybeSingle();}
      if(templateQuery.error) throw templateQuery.error;
      const template=templateQuery.data;
      if(template){
        inheritedFrom=template.title;
        metadata.author=metadata.author||template.author||"";
        metadata.contributors=template.contributors||"";
        metadata.format=template.format||metadata.format;
        metadata.publisher=metadata.publisher||template.publisher||"";
        metadata.imprint=template.imprint||"";
        metadata.book_type=template.book_type||metadata.book_type;
        metadata.demographic=template.demographic||"";
        metadata.themes=template.themes||"";
        metadata.age_rating=template.age_rating||"";
        const localGenres=Array.isArray(template.book_genres)?template.book_genres.map(item=>item.genre):[];
        metadata.genres=[...new Set([...metadata.genres.split(",").map(value=>value.trim()),...localGenres].filter(Boolean))].join(", ");
      }
    }
    const missing = [["author",metadata.author],["series",metadata.series_name],["volume",metadata.volume_number],["publisher",metadata.publisher],["imprint",metadata.imprint],["contributors",metadata.contributors],["themes",metadata.themes],["demographic",metadata.demographic],["age rating",metadata.age_rating],["synopsis",metadata.description]]
      .filter(([,value])=>!value).map(([name])=>name);
    const warnings = ["Metadata was retrieved from public book databases. Review it before saving."];
    if(inheritedFrom)warnings.push(`Stable catalogue fields were inherited from “${inheritedFrom}”.`);
    if(missing.length) warnings.push(`Not provided by either source: ${missing.join(", ")}.`);
    return NextResponse.json({ source: "isbn", existingBookId: null, warnings, metadata });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The ISBN lookup failed." }, { status: 500 });
  }
}
