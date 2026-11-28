import type { Volume } from '../types/library';

export interface CatalogSeries {
  id: string;
  title: string;
  volumes: Volume[];
  cover: Volume;
  author: string;
  genre: string;
  copies: number;
  rating: number;
}

const numberedTitle = /^(.+?)(?:,?\s+(?:vol(?:ume)?\.?\s*|#)\s*|\s+)(\d+)(?:\s*[:–—-].*)?$/i;
const normalize = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();

function candidate(volume: Volume) {
  const match = volume.title.match(numberedTitle);
  const name = volume.seriesName?.trim() || match?.[1].trim() || '';
  const number = volume.volume > 0 ? volume.volume : match ? Number(match[2]) : null;
  if (!name || (number === null && !volume.seriesName?.trim())) return null;
  return { name, number, key: `${normalize(name)}|${normalize(volume.author)}|${normalize(volume.bookType ?? '')}` };
}

export function catalogVolumeNumber(volume: Volume): number | null {
  return candidate(volume)?.number ?? (volume.volume > 0 ? volume.volume : null);
}

export function groupCatalog(volumes: Volume[]): CatalogSeries[] {
  const candidates = new Map<string, Volume[]>();
  for (const volume of volumes) {
    const identity = candidate(volume);
    if (identity) {
      const members = candidates.get(identity.key);
      if (members) members.push(volume);
      else candidates.set(identity.key, [volume]);
    }
  }
  const validSeries = new Set<string>();
  for (const [key, members] of candidates) {
    if (members.length > 1) validSeries.add(key);
  }
  const groups = new Map<string, CatalogSeries>();
  for (const volume of volumes) {
    const identity = candidate(volume);
    // An explicit series name or a shared numbered title groups editions and volumes.
    const grouped = !!identity && validSeries.has(identity.key);
    const id = grouped && identity ? `series:${identity.key}` : `book:${volume.id}`;
    if (groups.has(id)) continue;
    const sorted = (grouped && identity ? candidates.get(identity.key) ?? [volume] : [volume]).slice().sort((a, b) => (catalogVolumeNumber(a) ?? Infinity) - (catalogVolumeNumber(b) ?? Infinity) || a.title.localeCompare(b.title));
    const cover = sorted.find(item => catalogVolumeNumber(item) === 1 && item.coverImage)
      ?? sorted.find(item => item.coverImage) ?? sorted[0];
    groups.set(id, {
      id, title: grouped && identity ? identity.name : volume.title, volumes: sorted, cover,
      author: cover.author, genre: cover.genre,
      copies: sorted.some(item => item.copies < 0) ? -1 : sorted.reduce((sum, item) => sum + item.copies, 0),
      rating: sorted.some(item => item.rating > 0)
        ? Number((sorted.reduce((sum, item) => sum + item.rating, 0) / sorted.filter(item => item.rating > 0).length).toFixed(1)) : 0,
    });
  }
  return [...groups.values()];
}

export function matchesCatalogGroup(group: CatalogSeries, query: string): boolean {
  const needle = normalize(query);
  if (!needle) return true;
  const fields = [group.title, group.author, group.genre,
    ...group.volumes.flatMap(volume => [volume.title, volume.author, volume.genre, volume.isbn ?? '',
      volume.seriesName ?? '', volume.themes ?? '', volume.synopsis,
      `${group.title} volume ${catalogVolumeNumber(volume) ?? ''}`, `${group.title} vol ${catalogVolumeNumber(volume) ?? ''}`])];
  return fields.some(value => normalize(value).includes(needle));
}
