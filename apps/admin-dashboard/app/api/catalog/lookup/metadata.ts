export type BookMetadata = {
  isbn10: string;
  isbn13: string;
  title: string;
  originalTitle: string;
  romanizedTitle: string;
  series: string;
  volume: string;
  collectedVolumeRange: string;
  authors: string[];
  publisher: string;
  publicationDate: string;
  imprint: string;
  contributors: string[];
  genres: string[];
  themes: string[];
  demographic: string;
  ageRating: string;
  bookType: string;
  format: string;
  description: string;
  coverUrls: string[];
};

export type FormMetadata = {
  title: string;
  original_title: string;
  romanized_title: string;
  author: string;
  contributors: string;
  series_name: string;
  volume_number: string;
  isbn: string;
  publisher: string;
  publication_date: string;
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

type RecordValue = Record<string, unknown>;

const nonGenrePatterns = [
  /best[ -]?seller/i, /new york times/i, /nyt:/i, /protected daisy/i,
  /accessible book/i, /juvenile literature/i, /translations into/i,
  /comic books, strips/i, /fiction$/i,
];

const mangaPublisherPattern = /kodansha|viz media|shonen jump|seven seas|yen press|vertical|dark horse manga|tokyopop|square enix manga/i;

export function normalizeIsbn(value: string) {
  return value.toUpperCase().replace(/[^0-9X]/g, "");
}

export function validIsbn(value: string) {
  const normalized = normalizeIsbn(value);
  if (/^97[89]\d{10}$/.test(normalized)) {
    const sum = normalized.slice(0, 12).split("").reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0);
    return (10 - (sum % 10)) % 10 === Number(normalized[12]);
  }
  if (/^\d{9}[\dX]$/.test(normalized)) {
    const sum = normalized.split("").reduce((total, digit, index) => total + (digit === "X" ? 10 : Number(digit)) * (10 - index), 0);
    return sum % 11 === 0;
  }
  return false;
}

export function catalogFailure(
  attempts: Array<{ status: number; failed: boolean }>,
  foundCount: number,
) {
  if (foundCount) return null;
  if (attempts.some((attempt) => attempt.status === 429)) return { status: 429, error: "A catalog provider is rate-limiting requests. Wait briefly, then retry the ISBN lookup." };
  if (attempts.length > 0 && attempts.every((attempt) => attempt.failed)) return { status: 503, error: "Catalog services are temporarily unavailable. Retry the lookup in a moment." };
  return { status: 404, error: "No catalog metadata was found for this ISBN. You may search by title explicitly or enter the volume manually." };
}

export function isbn13(value: string) {
  const normalized = normalizeIsbn(value);
  if (normalized.length === 13) return normalized;
  const base = `978${normalized.slice(0, 9)}`;
  const sum = base.split("").reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0);
  return `${base}${(10 - (sum % 10)) % 10}`;
}

export function sameIsbn(value: string, expected: string) {
  return validIsbn(value) && isbn13(value) === isbn13(expected);
}

function isbn10FromIdentifiers(identifiers: Array<{type?: string; identifier?: string}>) {
  return identifiers.find(item => item.type === "ISBN_10")?.identifier ?? "";
}

export function emptyBookMetadata(isbn: string): BookMetadata {
  const normalized = normalizeIsbn(isbn);
  return {
    isbn10: normalized.length === 10 ? normalized : "",
    isbn13: normalized.length === 13 ? normalized : isbn13(normalized),
    title: "", originalTitle: "", romanizedTitle: "", series: "", volume: "",
    collectedVolumeRange: "", authors: [], publisher: "", imprint: "", contributors: [],
    genres: [], themes: [], demographic: "", ageRating: "", bookType: "", format: "Physical", publicationDate: "",
    description: "", coverUrls: [],
  };
}

export function parseEditionTitle(title: string) {
  const normalized = title.replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
  const range = normalized.match(/\(\s*vol(?:ume)?s?\.?\s*(\d+(?:\.\d+)?\s*-\s*\d+(?:\.\d+)?)\s*\)/i)?.[1]?.replace(/\s/g, "") ?? "";
  const omnibus = normalized.match(/^(.*?)[\s,:-]+omnibus(?:\s+(?:vol(?:ume)?\.?\s*)?)?\s*(\d+(?:\.\d+)?)\b/i);
  if (omnibus) return { series: omnibus[1].trim(), volume: omnibus[2], collectedVolumeRange: range };
  const explicit = normalized.match(/^(.*?)(?:[,.\s:-]+(?:vol(?:ume)?\.?|book)\s*#?)(\d+(?:\.\d+)?)\b/i);
  if (explicit) return { series: explicit[1].replace(/[(:\s-]+$/, "").trim(), volume: explicit[2], collectedVolumeRange: range };
  const ending = normalized.match(/^(.*?)[,.\s-]+(\d+(?:\.\d+)?)$/);
  return { series: ending?.[1]?.trim() ?? "", volume: ending?.[2] ?? "", collectedVolumeRange: range };
}

function strings(value: unknown) {
  return Array.isArray(value) ? value.map(String).map(item => item.trim()).filter(Boolean) : [];
}

function cleanHtml(value: unknown) {
  return String(value ?? "").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

export function cleanLabels(values: string[], limit = 10) {
  const seen = new Set<string>();
  return values.map(item => item.trim()).filter(item => {
    const key = item.toLocaleLowerCase();
    if (!item || item.length > 60 || seen.has(key) || nonGenrePatterns.some(pattern => pattern.test(item))) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);
}

function cleanUrls(values: string[]) {
  return [...new Set(values.map(value => value.replace(/^http:/, "https:")).filter(value => /^https:\/\//i.test(value)))];
}

export async function validateCoverUrl(
  url: string,
  request: typeof fetch = fetch,
) {
  if (!/^https:\/\//i.test(url)) return "";
  try {
    const response = await request(url, {
      method: "GET", headers: { Range: "bytes=0-1024" }, redirect: "follow",
      signal: AbortSignal.timeout(5000), cache: "no-store",
    });
    const type = response.headers.get("content-type") || "";
    const valid = response.ok && type.toLowerCase().startsWith("image/");
    await response.body?.cancel();
    return valid ? response.url || url : "";
  } catch { return ""; }
}

export function googleAdapter(info: RecordValue, requestedIsbn: string): BookMetadata {
  const result = emptyBookMetadata(requestedIsbn);
  const title = String(info.title ?? "");
  const subtitle = String(info.subtitle ?? "");
  const fullTitle = subtitle && !title.toLocaleLowerCase().includes(subtitle.toLocaleLowerCase()) ? `${title}: ${subtitle}` : title;
  const parts = parseEditionTitle(fullTitle);
  const identifiers = Array.isArray(info.industryIdentifiers) ? info.industryIdentifiers as Array<{type?: string; identifier?: string}> : [];
  const images = info.imageLinks && typeof info.imageLinks === "object" ? info.imageLinks as Record<string, string> : {};
  result.isbn10 = isbn10FromIdentifiers(identifiers);
  result.title = fullTitle;
  result.series = parts.series;
  result.volume = parts.volume;
  result.collectedVolumeRange = parts.collectedVolumeRange;
  result.authors = strings(info.authors);
  result.publisher = String(info.publisher ?? "");
  result.publicationDate = String(info.publishedDate ?? "");
  result.genres = cleanLabels(strings(info.categories));
  result.description = cleanHtml(info.description);
  result.coverUrls = cleanUrls([images.extraLarge, images.large, images.medium, images.thumbnail, images.smallThumbnail].filter(Boolean));
  result.bookType = inferBookType(result);
  return result;
}

export function openLibraryAdapter(info: RecordValue, requestedIsbn: string, description = ""): BookMetadata {
  const result = emptyBookMetadata(requestedIsbn);
  const title = String(info.title ?? "");
  const subtitle = String(info.subtitle ?? "");
  const fullTitle = subtitle && !title.toLocaleLowerCase().includes(subtitle.toLocaleLowerCase()) ? `${title}: ${subtitle}` : title;
  const parts = parseEditionTitle(fullTitle);
  const coverId = typeof info.cover_i === "number" ? info.cover_i : null;
  const identifiers = strings(info.isbn);
  result.isbn10 = identifiers.find(value => normalizeIsbn(value).length === 10) ?? "";
  result.title = fullTitle;
  result.series = parts.series;
  result.volume = parts.volume;
  result.collectedVolumeRange = parts.collectedVolumeRange;
  result.authors = strings(info.author_name);
  result.publisher = strings(info.publisher)[0] ?? "";
  result.publicationDate = strings(info.publish_date)[0] ?? String(info.first_publish_year ?? "");
  result.genres = cleanLabels(strings(info.subject));
  result.description = cleanHtml(description);
  result.coverUrls = cleanUrls([
    coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg?default=false` : "",
    `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(result.isbn13)}-L.jpg?default=false`,
  ]);
  result.bookType = inferBookType(result);
  return result;
}

export function aniListAdapter(info: RecordValue, base: BookMetadata): BookMetadata {
  const result = emptyBookMetadata(base.isbn13);
  const title = info.title && typeof info.title === "object" ? info.title as RecordValue : {};
  const cover = info.coverImage && typeof info.coverImage === "object" ? info.coverImage as RecordValue : {};
  const tags = Array.isArray(info.tags) ? info.tags as RecordValue[] : [];
  const demographicTag = tags.find(tag => !tag.isMediaSpoiler && /^(shounen|shoujo|seinen|josei)$/i.test(String(tag.name ?? "")));
  const staff = info.staff && typeof info.staff === "object" ? info.staff as RecordValue : {};
  const edges = Array.isArray(staff.edges) ? staff.edges as RecordValue[] : [];
  result.originalTitle = String(title.native ?? "");
  result.romanizedTitle = String(title.romaji ?? "");
  result.series = base.series || String(title.english ?? title.romaji ?? "");
  result.genres = cleanLabels(strings(info.genres));
  result.themes = cleanLabels(tags.filter(tag => Number(tag.rank ?? 0) >= 60 && !tag.isMediaSpoiler && tag !== demographicTag)
    .map(tag => String(tag.name ?? "")), 8);
  result.demographic = normalizeDemographic(String(demographicTag?.name ?? ""));
  result.contributors = edges.slice(0, 8).map(edge => {
    const node = edge.node && typeof edge.node === "object" ? edge.node as RecordValue : {};
    const name = node.name && typeof node.name === "object" ? node.name as RecordValue : {};
    const displayName = String(name.full ?? name.native ?? "");
    const role = String(edge.role ?? "Contributor");
    return displayName ? `${displayName} (${role})` : "";
  }).filter(Boolean);
  result.description = cleanHtml(info.description);
  result.coverUrls = cleanUrls([String(cover.extraLarge ?? ""), String(cover.large ?? "")]);
  result.bookType = info.format === "NOVEL" ? "Light Novel" : "Manga";
  return result;
}

export function jikanAdapter(info: RecordValue, base: BookMetadata): BookMetadata {
  const result = emptyBookMetadata(base.isbn13);
  const images = info.images && typeof info.images === "object" ? info.images as RecordValue : {};
  const jpg = images.jpg && typeof images.jpg === "object" ? images.jpg as RecordValue : {};
  const authors = Array.isArray(info.authors) ? info.authors as RecordValue[] : [];
  result.originalTitle = String(info.title_japanese ?? "");
  result.romanizedTitle = String(info.title ?? "");
  result.series = base.series || String(info.title_english ?? info.title ?? "");
  result.authors = authors.map(author => String(author.name ?? "")).filter(Boolean);
  result.contributors = authors.map(author => {
    const name = String(author.name ?? "");
    const role = String(author.type ?? "Creator");
    return name ? `${name} (${role})` : "";
  }).filter(Boolean);
  result.genres = cleanLabels((Array.isArray(info.genres) ? info.genres as RecordValue[] : []).map(item => String(item.name ?? "")));
  result.themes = cleanLabels((Array.isArray(info.themes) ? info.themes as RecordValue[] : []).map(item => String(item.name ?? "")));
  result.demographic = normalizeDemographic((Array.isArray(info.demographics) ? info.demographics as RecordValue[] : []).map(item => String(item.name ?? ""))[0] ?? "");
  result.description = cleanHtml(info.synopsis);
  result.coverUrls = cleanUrls([String(jpg.large_image_url ?? ""), String(jpg.image_url ?? "")]);
  result.bookType = /light novel|novel/i.test(String(info.type ?? "")) ? "Light Novel" : "Manga";
  return result;
}

function normalizeDemographic(value: string) {
  const normalized = value.toLocaleLowerCase();
  if (normalized === "shounen" || normalized === "shonen") return "Shonen";
  if (normalized === "shoujo" || normalized === "shojo") return "Shojo";
  if (normalized === "seinen") return "Seinen";
  if (normalized === "josei") return "Josei";
  return value;
}

export function mergeMetadata(primary: BookMetadata, ...fallbacks: BookMetadata[]) {
  const result: BookMetadata = { ...primary, authors: [...primary.authors], contributors: [...primary.contributors], genres: [...primary.genres], themes: [...primary.themes], coverUrls: [...primary.coverUrls] };
  const scalarKeys: Array<keyof BookMetadata> = ["isbn10", "isbn13", "title", "originalTitle", "romanizedTitle", "series", "volume", "collectedVolumeRange", "publisher", "publicationDate", "imprint", "demographic", "ageRating", "bookType", "format", "description"];
  for (const fallback of fallbacks) {
    for (const key of scalarKeys) if (!result[key] && fallback[key]) (result[key] as string) = fallback[key] as string;
    result.authors = cleanLabels([...result.authors, ...fallback.authors]);
    result.contributors = cleanLabels([...result.contributors, ...fallback.contributors]);
    result.genres = cleanLabels([...result.genres, ...fallback.genres]);
    result.themes = cleanLabels([...result.themes, ...fallback.themes]);
    result.coverUrls = cleanUrls([...result.coverUrls, ...fallback.coverUrls]);
  }
  result.bookType ||= inferBookType(result) || "Other";
  return result;
}

// Manga services do not identify a physical ISBN edition. Only copy
// classification fields after an exact normalized-title match; bibliographic
// facts and covers remain owned by Google Books/Open Library.
export function mergeMangaEnrichment(primary: BookMetadata, ...matches: BookMetadata[]) {
  const result: BookMetadata = {
    ...primary,
    authors: [...primary.authors], contributors: [...primary.contributors],
    genres: [...primary.genres], themes: [...primary.themes], coverUrls: [...primary.coverUrls],
  };
  for (const match of matches) {
    result.originalTitle ||= match.originalTitle;
    result.romanizedTitle ||= match.romanizedTitle;
    result.series ||= match.series;
    result.volume ||= match.volume;
    result.demographic ||= match.demographic;
    result.bookType ||= match.bookType;
    result.genres = cleanLabels([...result.genres, ...match.genres]);
    result.themes = cleanLabels([...result.themes, ...match.themes]);
    result.contributors = cleanLabels([...result.contributors, ...match.contributors]);
  }
  return result;
}

export function inferBookType(metadata: BookMetadata) {
  const evidence = `${metadata.title} ${metadata.publisher} ${metadata.genres.join(" ")}`;
  if (/light novel/i.test(evidence)) return "Light Novel";
  if (/manga|shonen|shojo|seinen|josei/i.test(evidence) || mangaPublisherPattern.test(metadata.publisher)) return "Manga";
  if (/comic|graphic novel/i.test(evidence)) return "Comic";
  return "";
}

export function likelyManga(metadata: BookMetadata) {
  return inferBookType(metadata) === "Manga";
}

function comparableTitle(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase()
    .replace(/\([^)]*vol(?:ume)?[^)]*\)/g, " ")
    .replace(/\bomnibus(?:\s+(?:vol(?:ume)?\.?\s*)?\d+)?\b/g, " ")
    .replace(/\b(?:vol(?:ume)?\.?|book)\s*\d+(?:\.\d+)?\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

export function titleMatches(query: string, candidates: string[]) {
  const expected = comparableTitle(query);
  return expected.length >= 3 && candidates.some(candidate => comparableTitle(candidate) === expected);
}

export function mangaSearchTitle(metadata: BookMetadata) {
  return metadata.series || parseEditionTitle(metadata.title).series || metadata.title;
}

export function toFormMetadata(metadata: BookMetadata): FormMetadata {
  return {
    title: metadata.title,
    original_title: metadata.originalTitle,
    romanized_title: metadata.romanizedTitle,
    author: metadata.authors.join(", "),
    contributors: metadata.contributors.join(", "),
    series_name: metadata.series,
    volume_number: metadata.volume,
    isbn: metadata.isbn13,
    publisher: metadata.publisher,
    publication_date: metadata.publicationDate,
    imprint: metadata.imprint,
    format: metadata.format || "Physical",
    book_type: metadata.bookType || "Other",
    demographic: metadata.demographic,
    age_rating: metadata.ageRating,
    themes: metadata.themes.join(", "),
    description: metadata.description,
    cover_image_url: metadata.coverUrls[0] ?? "",
    genres: metadata.genres.join(", "),
  };
}
