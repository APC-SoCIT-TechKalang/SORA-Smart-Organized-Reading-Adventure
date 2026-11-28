import type { Volume } from '../types/library';
import { splitCatalogGenres } from './catalog-genres';

const subjects: Record<string, RegExp> = {
  'Cooking & Food': /\b(cook(?:ing|ery)?|food|chef|recipe|baking|bakery|cuisine|restaurant|gourmet)\b/i,
  Sports: /\b(sport|football|soccer|basketball|volleyball|baseball|tennis|boxing|cycling|swimming)\b/i,
  Romance: /\b(romance|romantic|love story|relationship)\b/i,
  School: /\b(school|academy|campus|student)\b/i,
  Music: /\b(music|musician|band|singing|singer|idol)\b/i,
  'Family & Friendship': /\b(family|friendship|friends|parenting)\b/i,
};

const storyGenres = new Set(['action','adventure','comedy','drama','fantasy','horror','isekai','mystery','romance','science fiction','sci-fi','slice of life','supernatural','thriller','psychological','historical']);
const key = (value: string) => value.trim().toLocaleLowerCase();
export const formatOf = (volume: Volume) => volume.bookType?.trim() || 'Other / unspecified';
export const tagsOf = (volume: Volume) => [...splitCatalogGenres(volume.genre), ...splitCatalogGenres(volume.themes ?? '')];
export function genreOptions(volumes: Volume[]) {
  return [...new Set(volumes.flatMap(volume => tagsOf(volume).filter(tag => storyGenres.has(key(tag)))))].sort();
}
export function subjectOptions(volumes: Volume[]) {
  return Object.keys(subjects).filter(subject => volumes.some(volume => subjectMatches(volume, subject)));
}
export function subjectMatches(volume: Volume, subject: string) {
  // Search topic metadata and descriptions only; a title mention alone is not treated as a subject.
  return subjects[subject]?.test(`${volume.genre} ${volume.themes ?? ''} ${volume.synopsis}`) ?? false;
}
export function genreMatches(volume: Volume, genre: string) {
  return tagsOf(volume).some(tag => key(tag) === key(genre));
}
