import type { Commission, NavItem } from '../types/library';

export const commissions: Commission[] = [
{
  id: 'daily-log',
  track: 'daily',
  name: 'Log a reading session',
  detail: 'Record any session of 20 minutes or more in the archive ledger.',
  seal: 'Lantern mark',
  xp: 60,
  coins: 40,
  progress: 100,
  participants: 312
},
{
  id: 'daily-return',
  track: 'daily',
  name: 'Return a borrowed volume',
  detail: 'Send one volume back to the stacks before the lanterns dim.',
  seal: 'Tidy Shelf mark',
  xp: 45,
  coins: 25,
  progress: 50,
  participants: 208
},
{
  id: 'daily-scout',
  track: 'daily',
  name: 'Scout three new titles',
  detail: 'Open three catalog entries you have never borrowed.',
  seal: 'Scout mark',
  xp: 40,
  coins: 20,
  progress: 100,
  participants: 411
},
{
  id: 'shonen-five',
  track: 'weekly',
  name: 'Read 5 shonen volumes',
  detail: 'Finish any five shonen titles before the weekly reset.',
  seal: 'Shonen Master seal',
  xp: 220,
  coins: 150,
  progress: 60,
  participants: 24
},
{
  id: 'genre-explorer',
  track: 'weekly',
  name: 'Genre explorer',
  detail: 'Log volumes from three different genres this week.',
  seal: 'Explorer seal',
  xp: 180,
  coins: 120,
  progress: 33,
  participants: 18
},
{
  id: 'speed-reader',
  track: 'weekly',
  name: 'Speed reader',
  detail: 'Finish a single volume in under two hours.',
  seal: 'Swift Page seal',
  xp: 200,
  coins: 130,
  progress: 100,
  participants: 42
},
{
  id: 'season-archivist',
  track: 'seasonal',
  name: 'Archivist of the Amber Season',
  detail: 'Clear 25 volumes across the season to earn the amber cloak frame.',
  seal: 'Amber Cloak frame',
  xp: 900,
  coins: 600,
  progress: 72,
  participants: 1284
},
{
  id: 'season-club',
  track: 'seasonal',
  name: 'Voice of the club',
  detail: 'Complete four reading goals during the season.',
  seal: 'Orator title',
  xp: 640,
  coins: 400,
  progress: 25,
  participants: 502
}];


export const seasonTrack = [
{ level: 1, reward: '200 coins', at: 0 },
{ level: 2, reward: 'Amber page marker', at: 20 },
{ level: 3, reward: 'Season banner dye', at: 40 },
{ level: 4, reward: 'Rare volume pull', at: 60 },
{ level: 5, reward: 'Amber cloak frame', at: 85 }];


export const navItems: NavItem[] = [
{ id: 'archive', label: 'Archive', hint: 'Your reading hall', shortcut: '1' },
{ id: 'catalog', label: 'Browse Books', hint: '247 titles', shortcut: '2' },
{ id: 'shelf', label: 'My Shelf', hint: 'Borrowed volumes', shortcut: '3' },
{ id: 'commissions', label: 'View Quests', hint: 'Quest board', shortcut: '4' },
{ id: 'guide', label: 'View Available Seats', hint: 'Study space availability', shortcut: '5' }];
