import type { NavItem } from '../types/library';

// Navigation is static; all library content and counts come from Supabase.
export const navItems: NavItem[] = [
  { id: 'archive', label: 'Archive', hint: 'Your reading hall', shortcut: '1' },
  { id: 'guide', label: 'View Seats', hint: 'Study space availability', shortcut: '2' },
  { id: 'catalog', label: 'Browse Books', hint: 'Catalog', shortcut: '3' },
  { id: 'shelf', label: 'My Shelf', hint: 'Reading activity', shortcut: '4' },
  { id: 'commissions', label: 'View Quests', hint: 'Quest board', shortcut: '5' },
];
