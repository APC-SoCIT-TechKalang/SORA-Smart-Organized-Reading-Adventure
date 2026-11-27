// Pure edition formatting shared by lookup and catalog forms. No AI translation.
export function standardCatalogTitle(title: string, series: string, volume: string | number, bookType: string) {
  const name = series.trim();
  const number = String(volume).trim();
  if (!/manga|light novel/i.test(bookType) || !name || /[\u3040-\u30ff\u3400-\u9fff]/u.test(name) ||
      !/^\d+$/.test(number) || /omnibus|deluxe|collector|edition|\d+\s*[-–]\s*\d+|\d+\s*-in-\s*\d+/i.test(`${title} ${name}`)) return title;
  return `${name.replace(/[,\s]+$/, "")}, Volume ${Number(number)}`;
}

export function updateCatalogIdentity<T extends {title:string;series_name:string;volume_number:string;book_type:string}>(current:T, key:keyof T, value:T[keyof T]):T {
  const next = {...current, [key]:value};
  if (key !== "series_name" && key !== "volume_number") return next;
  // A title typed independently by the librarian stays an intentional override.
  const generated = standardCatalogTitle("", current.series_name, current.volume_number, current.book_type);
  const rawSeries = current.series_name.trim();
  const suffix = current.title.toLowerCase().startsWith(rawSeries.toLowerCase()) ? current.title.slice(rawSeries.length).trim() : "override";
  const providerTitle = rawSeries && (/^[, :.-]*(?:vol(?:ume)?\.?\s*|book\s*)?\d+$/i.test(suffix) || current.title === rawSeries);
  if (!current.title || current.title === generated || providerTitle)
    next.title = standardCatalogTitle(next.title, next.series_name, next.volume_number, next.book_type);
  return next;
}
