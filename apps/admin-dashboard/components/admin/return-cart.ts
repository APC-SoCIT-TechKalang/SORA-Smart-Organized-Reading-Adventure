import type { Copy } from "./dashboard-data";

export type ReturnTab = "all" | "recent";

export function returnTime(value: string | null, now = Date.now()) {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) && time <= now ? time : null;
}

export function isRecentlyReturned(copy: Copy, now = Date.now()) {
  const time = returnTime(copy.returned_to_cart_at, now);
  return time !== null && now - time < 24 * 60 * 60 * 1000;
}

export function returnedAgo(value: string | null, now = Date.now()) {
  const time = returnTime(value, now);
  if (time === null) return "Return time unavailable";
  const minutes = Math.floor((now - time) / 60_000);
  if (minutes < 1) return "Returned just now";
  if (minutes < 60) return `Returned ${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Returned ${hours} hour${hours === 1 ? "" : "s"} ago`;
  if (hours < 48) return "Returned yesterday";
  const days = Math.floor(hours / 24);
  return `Returned ${days} days ago`;
}

export function selectReturnCopies(copies: Copy[], tab: ReturnTab, shelf: string, now = Date.now()) {
  return copies.filter(copy => copy.status === "RETURN_CART"
    && (tab === "all" || isRecentlyReturned(copy, now))
    && (shelf === "" || (copy.shelf_location?.trim() || "Unassigned") === shelf))
    .sort((a, b) => (returnTime(b.returned_to_cart_at, now) ?? -1)
      - (returnTime(a.returned_to_cart_at, now) ?? -1) || b.copy_id - a.copy_id);
}

export function findReturnCopyByBarcode(copies: Copy[], barcode: string) {
  const normalized = barcode.trim().toLocaleUpperCase();
  return normalized ? copies.find(copy => copy.status === "RETURN_CART"
    && copy.identifier_value.trim().toLocaleUpperCase() === normalized) : undefined;
}

export function selectShelvableReturnCopies(copies: Copy[]) {
  return copies.filter(copy => copy.status === "RETURN_CART" && Boolean(copy.shelf_location?.trim()))
    .sort((a, b) => a.shelf_location!.trim().localeCompare(b.shelf_location!.trim(), undefined, { numeric: true })
      || a.copy_id - b.copy_id);
}
