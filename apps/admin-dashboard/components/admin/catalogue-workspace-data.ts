import { database } from "../../lib/supabase";
import { projectBook, projectCopy, type ReplacementBook, type ReplacementCopy } from "./dashboard-data";

export const inventoryStatuses = ["In-Shelf", "With Reader", "In Return Cart", "On Hold", "Damaged"] as const;
export const statusLabel = (status: string) => ({
  IN_SHELF: "In Shelf", WITH_READER: "With Reader", RETURN_CART: "Return Cart",
  "In-Shelf": "In Shelf", "In Return Cart": "Return Cart",
})[status] ?? status;
export const statusStyle = (status: string) => ({
  "In Shelf": "border-emerald-200 bg-emerald-50 text-emerald-700",
  "With Reader": "border-amber-200 bg-amber-50 text-amber-800",
  "Return Cart": "border-orange-200 bg-orange-50 text-orange-800",
  Damaged: "border-rose-200 bg-rose-50 text-rose-700",
  "On Hold": "border-violet-200 bg-violet-50 text-violet-700",
})[status] ?? "border-stone-200 bg-stone-50 text-stone-700";

export const catalogueViews = {
  catalog: "Catalog",
  inventory: "Physical Inventory",
  attention: "Needs Attention",
};
export type CatalogueView = keyof typeof catalogueViews;
export const emptyFilters = { genre: "", status: "", condition: "", shelf: "", registered: "" };
export type CatalogueFilters = typeof emptyFilters;

type GroupRow = {
  kind: "group"; id: string; title: string; author: string; cover: string | null;
  volumes: number; copies: number; statuses: Record<string, number>;
};
export type CopyRow = ReplacementCopy & {
  kind: "copy"; id: string; title: string; author: string; volume: number | null;
};
type UnregisteredRow = { kind: "unregistered"; id: string; title: string; author: string; book_id: number; group_id: string };
export type CatalogueRow = GroupRow | CopyRow | UnregisteredRow;
export type CatalogueSummary = {
  titles: number; volumes: number; copies: number; returns: number; damaged: number;
  unregistered: number; genres: string[]; shelves: string[];
};
export type PageResult<T> = { count: number; rows: T[] };
export type VolumeDetail = {
  book: ReturnType<typeof projectBook>; copies: number; reads: number; number: number | null;
  contributors: string | null; format: string | null;
};

const db = () => database().schema("sora_v2");
const copyFields = "copy_id,book_id,copy_number,barcode,copy_status,shelf_location,condition_notes";

export async function readCatalogueSummary(signal: AbortSignal) {
  const { data, error } = await db().rpc("admin_catalogue_summary").abortSignal(signal);
  if (error) throw error;
  return data as CatalogueSummary;
}

export async function readCataloguePage(options: {
  view: CatalogueView; query?: string; filters?: CatalogueFilters; sort?: string;
  page: number; size: number; bookId?: number; signal: AbortSignal;
}) {
  const filters = options.filters ?? emptyFilters;
  const { data, error } = await db().rpc("admin_catalogue_page", {
    p_view: options.view, p_query: options.query ?? "", p_genre: filters.genre,
    p_status: filters.status, p_condition: filters.condition, p_shelf: filters.shelf,
    p_registered: filters.registered, p_sort: options.sort ?? "title",
    p_page: options.page, p_size: options.size, p_book: options.bookId ?? null,
  }).abortSignal(options.signal);
  if (error) throw error;
  return data as PageResult<CatalogueRow>;
}

export async function readCatalogueVolumes(groupId: string, page: number, signal: AbortSignal, bookId?: number) {
  const { data, error } = await db().rpc("admin_catalogue_volumes", { p_group: groupId, p_page: page, p_book: bookId ?? null }).abortSignal(signal);
  if (error) throw error;
  const result = data as PageResult<ReplacementBook & {
    copies: number; reads: number; display_volume: number | null; contributors: string | null; format: string | null;
  }>;
  return {
    count: result.count,
    rows: result.rows.map(row => ({
      book: projectBook(row), copies: row.copies, reads: row.reads, number: row.display_volume,
      contributors: row.contributors, format: row.format,
    })),
  };
}

export async function readReturnCart(signal: AbortSignal) {
  const copies = [];
  const titles = new Map<number, string>();
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db().from("book_copies").select(`${copyFields},books(title)`)
      .eq("copy_status", "In Return Cart").order("copy_id").range(offset, offset + 499).abortSignal(signal);
    if (error) throw error;
    for (const row of data as unknown as (ReplacementCopy & { books: { title: string } | null })[]) {
      copies.push(projectCopy(row));
      if (row.books) titles.set(row.book_id, row.books.title);
    }
    if (data.length < 500) return { copies, titles };
  }
}

export async function readVolumeCopies(bookId: number, signal: AbortSignal) {
  const copies = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db().from("book_copies").select(copyFields)
      .eq("book_id", bookId).order("copy_number").range(offset, offset + 499).abortSignal(signal);
    if (error) throw error;
    copies.push(...data.map(projectCopy));
    if (data.length < 500) return copies;
  }
}
