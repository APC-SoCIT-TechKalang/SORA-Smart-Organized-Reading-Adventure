import type { Book } from "./dashboard-data";

const normalize = (value: string) =>
  value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();

export function volumeIdentity(book: Book) {
  const marked = book.title.match(/^(.+?)[\s,]+(?:vol(?:ume)?\.?\s*|#)(\d+)(?:\s*[:–—].*)?$/iu);
  const numbered = book.title.match(/^(.+?)\s+(\d+)(?:\s*[:–—].*)?$/u);
  const suffix = marked ?? numbered;
  return {
    base: suffix?.[1].trim() ?? book.title.trim(),
    number: book.volume_number ?? (suffix ? Number(suffix[2]) : null),
  };
}

export type CatalogueGroup = {
  id: string;
  title: string;
  volumes: Book[];
};

export function groupCatalogue(books: Book[]): CatalogueGroup[] {
  const groups = new Map<string, CatalogueGroup>();
  const candidates = books.map(book => {
    const { base, number } = volumeIdentity(book);
    const series = book.series_name?.trim() || book.book_genres
      .flatMap(item => item.genre.split(","))
      .map(tag => tag.match(/^\s*series:\s*(.+?)\s*$/i)?.[1])
      .find(Boolean);
    const author = normalize(book.author ?? "");
    const title = series || base;
    const key = JSON.stringify([normalize(title), author, normalize(book.book_type)]);
    return { book, title, number, series, author, key };
  });
  const explicit = new Map<string, string>();
  const numbered = new Map<string, Set<number>>();

  for (const entry of candidates) {
    if (entry.series && !explicit.has(entry.key)) explicit.set(entry.key, entry.series);
    if (!entry.author || entry.number === null) continue;
    const numbers = numbered.get(entry.key) ?? new Set<number>();
    numbers.add(entry.number);
    numbered.set(entry.key, numbers);
  }

  for (const entry of candidates) {
    const knownSeries = explicit.get(entry.key);
    const canGroup = Boolean(entry.series) || (entry.number !== null && Boolean(entry.author)
      && (Boolean(knownSeries) || (numbered.get(entry.key)?.size ?? 0) > 1));
    const id = canGroup ? entry.key : String(entry.book.book_id);
    const group = groups.get(id) ?? { id, title: canGroup ? (knownSeries ?? entry.title) : entry.book.title, volumes: [] };
    group.volumes.push(entry.book);
    groups.set(id, group);
  }

  const volumeNumbers = new Map(candidates.map(entry => [entry.book.book_id, entry.number ?? Infinity]));
  for (const { volumes } of groups.values()) {
    volumes.sort((a, b) => volumeNumbers.get(a.book_id)! - volumeNumbers.get(b.book_id)!
      || a.title.localeCompare(b.title, undefined, { numeric: true }) || a.book_id - b.book_id);
  }
  return [...groups.values()];
}

export function searchCatalogue(groups: CatalogueGroup[], query: string) {
  const needle = normalize(query);
  return groups.flatMap(group => {
    const matchingVolumes = !needle || normalize(group.title).includes(needle)
      ? group.volumes
      : group.volumes.filter(book => {
        const fields = [book.title, book.author, book.original_title, book.romanized_title, book.isbn,
          ...book.book_genres.map(item => item.genre)];
        if (normalize(fields.join(" ")).includes(needle)) return true;

        const { number } = volumeIdentity(book);
        if (number === null) return false;
        const volumeQuery = needle.match(/^(?:(.*?)\s+)?(?:vol(?:ume)?\.?\s*|#)(\d+)$/i);
        return normalize(group.title + " " + number) === needle
          || Boolean(volumeQuery && Number(volumeQuery[2]) === number
            && (!volumeQuery[1] || normalize(group.title).includes(volumeQuery[1])));
      });
    return matchingVolumes.length ? [{ ...group, matchingVolumes }] : [];
  });
}
