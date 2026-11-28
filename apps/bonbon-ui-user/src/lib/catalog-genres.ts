import type { Volume } from '../types/library';

const GENRES = [
  'Action', 'Comedy', 'Fantasy', 'Horror', 'Supernatural', 'Adventure',
  'Romance', 'Mystery', 'Drama', 'Slice of Life', 'Science Fiction',
  'Sports', 'Historical', 'Thriller', 'Psychological', 'School', 'Isekai',
] as const;

const ALIASES: Record<string, readonly string[]> = {
  'sci-fi': ['Science Fiction'],
  'sci fi': ['Science Fiction'],
  'action & adventure': ['Action', 'Adventure'],
  'action and adventure': ['Action', 'Adventure'],
  'crime & mystery': ['Mystery'],
  'crime and mystery': ['Mystery'],
};

export function splitCatalogGenres(value: string): string[] {
  return value.split(/[,;\n]+/).map(part => part.trim()).filter(Boolean);
}

function canonicalGenres(value: string): string[] {
  return splitCatalogGenres(value).flatMap(part => {
    const normalized = part.toLocaleLowerCase().replace(/\s+/g, ' ');
    return ALIASES[normalized] ?? GENRES.filter(genre => genre.toLocaleLowerCase() === normalized);
  });
}

export function catalogGenreOptions(volumes: Pick<Volume, 'genre'>[]): string[] {
  const available = new Set(volumes.flatMap(volume => canonicalGenres(volume.genre)));
  return GENRES.filter(genre => available.has(genre));
}

export function matchesCatalogGenre(value: string, genre: string): boolean {
  return canonicalGenres(value).includes(genre);
}
