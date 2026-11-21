export interface LocatedCopy {
  copyId: number;
  status: string;
  shelfLocation: string | null;
}

export const MAIN_HALL_SHELVES = ['Shelf A1', 'Shelf A2', 'Shelf A3', 'Shelf A4', 'Shelf A5'];

export function shelfMessage(copy: LocatedCopy): string {
  switch (copy.status) {
    case 'In-Shelf': case 'In Shelf': case 'IN_SHELF':
      return copy.shelfLocation?.trim()
        ? `Main Reading Hall — ${copy.shelfLocation}`
        : 'Shelf location data missing — Please ask library staff for assistance.';
    case 'With Reader': case 'WITH_READER':
      return 'Currently With Reader (Not on shelf)';
    case 'On Hold': case 'Reserved': case 'ON_HOLD': case 'RESERVED':
      return 'Reserved — Located at the Hold Shelf (Ask Staff)';
    case 'In Return Cart': case 'Return Cart': case 'RETURN_CART':
      return 'Return Cart — Awaiting staff inspection (Not on shelf)';
    case 'Damaged': case 'DAMAGED':
      return 'Damaged — Removed from circulation (Ask Staff)';
    default:
      return 'Location unavailable — Please ask library staff for assistance.';
  }
}
