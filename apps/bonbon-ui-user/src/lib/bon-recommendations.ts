/** Catalog-only retrieval for BON. A missing field is unknown, never a negative fact. */
export interface BonBook {
  id: string; title: string; seriesName?: string | null; author: string;
  genre: string; themes?: string | null; synopsis: string;
  bookType?: string | null; volume?: number | null; availableCopies: number;
}

export interface BookPreference { key: string; label: string; terms: string[]; firm: boolean; negative?: boolean; field?: 'format' | 'availability' | 'series' }
export interface RecommendationState { constraints: BookPreference[]; referenceTitle?: string; seenIds: string[]; conflict?: string }
export interface RankedBook { book: BonBook; score: number; matched: BookPreference[]; missing: BookPreference[] }

const dictionary: Array<[string, string, RegExp, string[]]> = [
  ['cooking', 'cooking and food', /\b(cook(?:ing)?|food|culinary|chef|baking|recipes?)\b/i, ['cook', 'cooking', 'food', 'culinary', 'chef', 'baking', 'recipe']],
  ['sports', 'sports', /\b(sports?|football|soccer|basketball|volleyball|baseball|athlet\w*)\b/i, ['sport', 'football', 'soccer', 'basketball', 'volleyball', 'baseball', 'athlet']],
  ['romance', 'romance', /\b(romanc\w*|love story|falling in love)\b/i, ['romance', 'romantic', 'love']],
  ['fantasy', 'fantasy', /\b(fantasy|magic|magical|isekai)\b/i, ['fantasy', 'magic', 'isekai']],
  ['mystery', 'mystery', /\b(mystery|detective|whodunnit|investigation)\b/i, ['mystery', 'detective', 'investigat']],
  ['comedy', 'funny or comedic', /\b(funny|humou?r|comedy|comedic|hilarious)\b/i, ['funny', 'humor', 'humour', 'comedy', 'comedic', 'hilarious']],
  ['family', 'family', /\b(family|families|parent|siblings?)\b/i, ['family', 'families', 'parent', 'sibling']],
  ['friendship', 'friendship', /\b(friendship|friends?|found family)\b/i, ['friend', 'friendship', 'found family']],
  ['friendship-focus', 'friendship over competition', /\b(friendship more than competition|focus(?:es|ed)? on friendship|friendship over competition)\b/i, ['friendship over competition', 'focuses on friendship', 'friendship more than competition']],
  ['low-stakes', 'low-stakes or cozy', /\b(low[ -]?stakes|cozy|cosy|gentle|relaxing|slice of life)\b/i, ['low-stakes', 'cozy', 'cosy', 'gentle', 'slice of life', 'relaxing']],
  ['dark', 'dark tone', /\b(dark|grim|intense|violent|gory)\b/i, ['dark', 'grim', 'intense', 'violent', 'gory']],
  ['female-lead', 'female main character', /\b(female|woman|women|girl)\s+(?:main character|protagonist|lead|hero(?:ine)?)\b|\b(?:main character|protagonist|lead)\s+(?:is\s+)?(?:a\s+)?(?:woman|female|girl)\b/i, ['female protagonist', 'female main character', 'woman protagonist', 'woman lead', 'girl protagonist', 'girl lead', 'heroine']],
  ['women-romance', 'romance between women', /\b(two women|women|girls|lesbians?|sapphic|yuri)\s+(?:falling in love|in love|romance|relationship)|\b(lesbian|sapphic|yuri)\b/i, ['two women', 'women in love', 'girls in love', 'lesbian', 'sapphic', 'yuri']],
  ['clever-lead', 'clever main character', /\b(clever|smart|intelligent|witty)\s+(?:main character|protagonist|lead|hero)\b/i, ['clever protagonist', 'smart protagonist', 'intelligent protagonist', 'witty protagonist', 'clever lead', 'smart lead']],
  ['adult-characters', 'adult characters', /\b(adult|grown[ -]?up|mature)\s+(?:characters?|protagonists?|leads?|romance)\b/i, ['adult characters', 'adult protagonists', 'adult romance', 'grown-up characters']],
  ['little-violence', 'little violence', /\b(little|low|minimal|no|less)\s+(?:violence|gore|blood)\b/i, ['little violence', 'low violence', 'minimal violence', 'no violence', 'little gore']],
  ['no-triangle', 'no love triangle', /\b(no|without|avoid|not)\s+(?:a\s+)?love triangle\b/i, ['no love triangle', 'without a love triangle']],
  ['short', 'short read', /\b(short|quick|one[ -]?shot|in an hour|only an hour)\b/i, ['short read', 'one-shot', 'quick read', 'under an hour']],
  ['completed', 'completed series', /\b(completed|complete|finished)\s+(?:fantasy\s+)?series\b/i, ['completed series', 'complete series', 'finished series']],
];

const normalize = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const titleKey = (book: BonBook) => normalize(book.seriesName || book.title.replace(/(?:,?\s+(?:vol(?:ume)?\.?|#)\s*\d+|\s+\d+)$/i, ''));
const searchable = (book: BonBook) => normalize([book.title, book.seriesName, book.author, book.genre, book.themes, book.synopsis].filter(Boolean).join(' '));
function oneEditApart(left: string, right: string) {
  if (Math.abs(left.length - right.length) > 1) return false;
  let a = 0, b = 0, edits = 0;
  while (a < left.length && b < right.length) {
    if (left[a] === right[b]) { a++; b++; continue; }
    if (++edits > 1) return false;
    if (left.length >= right.length) a++;
    if (right.length >= left.length) b++;
  }
  return edits + Number(a < left.length || b < right.length) <= 1;
}
const isFirm = (text: string, key: string) => ['female-lead', 'women-romance', 'no-triangle', 'little-violence', 'completed', 'friendship-focus'].includes(key) || new RegExp(`\\b(?:must|need|require|only)\\b.{0,24}\\b${key}\\b`, 'i').test(text);

export function updateRecommendationState(message: string, previous: RecommendationState = { constraints: [], seenIds: [] }, titles: string[] = []): RecommendationState {
  const text = normalize(message);
  const reset = /\b(reset|start over|forget (?:that|my preferences)|new search)\b/i.test(message);
  if (reset) return { constraints: [], seenIds: [] };
  const followUp = /\b(only|more like|less|darker|lighter|which of those|second one|third one|first one|instead|make it|available)\b/i.test(message);
  const constraints = followUp ? [...previous.constraints] : [];
  const removal = /^remove\s+(.+)$/i.exec(message)?.[1]?.trim().toLowerCase();
  if (removal) return { ...previous, constraints: previous.constraints.filter(item => item.label.toLowerCase() !== removal && item.key.toLowerCase() !== removal), seenIds: [] };
  const put = (item: BookPreference) => { const index = constraints.findIndex(value => value.key === item.key); if (index >= 0) constraints.splice(index, 1); constraints.push(item); };
  const wantsManga = /\b(manga|mangas)\b/i.test(message);
  const wantsNovel = /\b(light novels?|ranobe)\b/i.test(message);
  if (wantsManga) put({ key: 'format', label: 'manga', terms: ['manga', 'adult manga'], firm: !/\b(prefer|ideally)\b/i.test(message), field: 'format' });
  if (wantsNovel) put({ key: 'format', label: 'light novel', terms: ['light novel'], firm: !/\b(prefer|ideally)\b/i.test(message), field: 'format' });
  if (/\b(available|in stock|on shelf|start today)\b/i.test(message)) put({ key: 'availability', label: 'available now', terms: [], firm: /\b(only|must|need|start today|which of those)\b/i.test(message), field: 'availability' });
  if (/\b(less dark|lighter|less violent)\b/i.test(message)) { const i = constraints.findIndex(c => c.key === 'dark'); if (i >= 0) constraints.splice(i, 1); put({ key: 'dark', label: 'lighter tone', terms: ['lighthearted', 'gentle', 'cozy', 'comedy', 'slice of life'], firm: false, negative: false }); }
  else if (/\b(more dark|darker)\b/i.test(message)) put({ key: 'dark', label: 'dark tone', terms: ['dark', 'grim', 'intense'], firm: false });
  for (const [key, label, pattern, terms] of dictionary) {
    const fuzzy = terms.some(term => /^[a-z]{5,}$/.test(term) && text.split(' ').some(word => oneEditApart(word, term)));
    if ((!pattern.test(message) && !fuzzy) || (key === 'dark' && /\b(less dark|lighter)\b/i.test(message))) continue;
    put({ key, label, terms, firm: isFirm(message, key) });
  }
  if (/\b(no|without|avoid)\s+(?:dark|violence|gore)\b/i.test(message)) put({ key: 'dark', label: 'less dark', terms: ['dark', 'violent', 'gore', 'grim'], firm: true, negative: true });
  const mentionedTitle = titles.filter(title => title.length > 2 && text.includes(normalize(title))).sort((a, b) => b.length - a.length)[0];
  const known = new Set(constraints.flatMap(item => item.terms.flatMap(term => normalize(term).split(' '))));
  const titleWords = new Set(normalize(mentionedTitle || '').split(' '));
  const stop = new Set('about after also and any are available book books can character characters could falling find first for from have hour just like liked looking main make more must novel novels only please prefer reader read recommend reset second series should show some something start story suggest than that the them there these third those today want what when which with women would your into might else enjoy little short less'.split(' '));
  for (const word of text.split(' ').filter(word => word.length >= 4 && !stop.has(word) && !known.has(word) && !titleWords.has(word)).slice(0, 3)) {
    put({ key: `topic:${word}`, label: word, terms: [word], firm: isFirm(message, word) });
  }
  const ordinal = /\b(first|second|third) one\b/i.exec(message)?.[1]?.toLowerCase();
  const ordinalIndex = ordinal === 'first' ? 0 : ordinal === 'second' ? 1 : ordinal === 'third' ? 2 : -1;
  return { constraints, referenceTitle: mentionedTitle || (ordinalIndex >= 0 ? titles[ordinalIndex] : followUp ? previous.referenceTitle : undefined), seenIds: /\b(more like|show more)\b/i.test(message) ? previous.seenIds : [], conflict: wantsManga && wantsNovel && /\b(only|must|need)\b/i.test(message) ? 'A book cannot be both manga and a light novel.' : undefined };
}

function evidence(book: BonBook, constraint: BookPreference) {
  if (constraint.field === 'format') return constraint.terms.some(term => normalize(book.bookType || '') === term);
  if (constraint.field === 'availability') return book.availableCopies > 0;
  const text = normalize([book.genre, book.themes, book.synopsis].filter(Boolean).join(' '));
  const found = constraint.terms.some(term => text.includes(normalize(term)));
  return constraint.negative ? /\b(no|without|little|low|minimal)\s+(?:violence|gore|dark)/i.test(`${book.themes} ${book.synopsis}`) : found;
}

export function rankCatalogBooks(books: BonBook[], state: RecommendationState): RankedBook[] {
  const reference = state.referenceTitle ? books.find(book => normalize(book.title) === normalize(state.referenceTitle!) || titleKey(book) === normalize(state.referenceTitle!)) : undefined;
  const referenceGenre = reference ? normalize(`${reference.genre} ${reference.themes || ''}`) : '';
  return books.map(book => {
    const matched = state.constraints.filter(item => evidence(book, item));
    const missing = state.constraints.filter(item => !evidence(book, item));
    const hardMisses = missing.filter(item => item.firm).length;
    const sameReference = reference && (book.id === reference.id || titleKey(book) === titleKey(reference));
    const common = referenceGenre ? referenceGenre.split(' ').filter(term => term.length > 3 && searchable(book).includes(term)).length : 0;
    const score = matched.reduce((total, item) => total + (item.firm ? 12 : 7), 0) - hardMisses * 25 - missing.length * 5 + Math.min(common, 3) * 3 + (book.availableCopies > 0 ? 1 : 0) - (sameReference ? 30 : 0) - (state.seenIds.includes(book.id) ? 20 : 0);
    return { book, score, matched, missing };
  }).sort((a, b) => a.missing.filter(item => item.firm).length - b.missing.filter(item => item.firm).length || b.score - a.score || (a.book.volume || Infinity) - (b.book.volume || Infinity) || a.book.title.localeCompare(b.book.title) || a.book.id.localeCompare(b.book.id));
}

export function chooseRecommendations(books: BonBook[], state: RecommendationState, limit = 4) {
  if (state.conflict) return { selected: [] as RankedBook[], exact: false };
  const ranked = rankCatalogBooks(books, state);
  const exact = ranked.filter(item => item.missing.length === 0 && (state.constraints.length === 0 || item.matched.length || item.score > 0));
  const pool = exact.length ? exact : ranked.filter(item => item.matched.length || state.constraints.length === 0);
  const seen = new Set<string>();
  const selected = pool.filter(item => { const key = `${titleKey(item.book)}|${normalize(item.book.author)}|${normalize(item.book.bookType || '')}`; if (seen.has(key) || (state.seenIds.includes(item.book.id) && pool.length > limit)) return false; seen.add(key); return true; }).slice(0, limit);
  return { selected, exact: exact.length > 0 };
}

export function shortlistCatalogBooks(books: BonBook[], state: RecommendationState, limit = 50): BonBook[] {
  if (state.conflict) return [];
  const seen = new Set<string>();
  const reference = state.referenceTitle ? books.find(book => normalize(book.title) === normalize(state.referenceTitle!) || titleKey(book) === normalize(state.referenceTitle!)) : undefined;
  const ranked = rankCatalogBooks(books, state).filter(item => {
    const key = `${titleKey(item.book)}|${normalize(item.book.author)}|${normalize(item.book.bookType || '')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(item => item.book);
  return reference ? [reference, ...ranked.filter(book => book.id !== reference.id)].slice(0, limit) : ranked.slice(0, limit);
}

export function recommendationReason(item: RankedBook): string {
  const matches = item.matched.filter(part => part.field !== 'availability').map(part => part.label);
  const facts = matches.length ? `Catalog metadata supports ${matches.slice(0, 3).join(', ')}.` : item.book.synopsis && item.book.synopsis !== 'No description recorded.' ? 'Its catalog description may be worth a look.' : 'This title is in the library catalog.';
  const missing = item.missing.map(part => part.label);
  return missing.length ? `${facts} I cannot verify ${missing.slice(0, 3).join(', ')} from the catalog.` : facts;
}
