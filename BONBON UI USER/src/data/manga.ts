import type { Volume } from '../types/library';

export const genres = [
'All',
'Shonen',
'Seinen',
'Adventure',
'Romance',
'Action',
'Comedy',
'Fantasy',
'Sports'];


export const volumes: Volume[] = [
{
  id: 'one-piece',
  title: 'One Piece',
  author: 'Eiichiro Oda',
  genre: 'Shonen',
  volume: 104,
  chapters: 11,
  rating: 4.9,
  rarity: 5,
  copies: 3,
  synopsis:
  'The Straw Hats push deeper into Wano as old alliances break and the sea itself seems to take a side.',
  plate: ['ONE', 'PIECE'],
  plateColor: '#953410',
  plateInk: '#f3d793'
},
{
  id: 'chainsaw-man',
  title: 'Chainsaw Man',
  author: 'Tatsuki Fujimoto',
  genre: 'Seinen',
  volume: 15,
  chapters: 9,
  rating: 4.8,
  rarity: 5,
  copies: 1,
  synopsis:
  'Devil hunting gets personal. A quiet arc that turns loud in the last forty pages.',
  plate: ['CHAINSAW', 'MAN'],
  plateColor: '#543822',
  plateInk: '#f9d219'
},
{
  id: 'spy-x-family',
  title: 'Spy x Family',
  author: 'Tatsuya Endo',
  genre: 'Comedy',
  volume: 12,
  chapters: 8,
  rating: 4.9,
  rarity: 4,
  copies: 5,
  synopsis:
  'The Forgers take on a school festival, a rival family, and one very suspicious dog.',
  plate: ['SPY x', 'FAMILY'],
  plateColor: '#c4800c',
  plateInk: '#543822'
},
{
  id: 'jujutsu-kaisen',
  title: 'Jujutsu Kaisen',
  author: 'Gege Akutami',
  genre: 'Action',
  volume: 25,
  chapters: 10,
  rating: 4.8,
  rarity: 5,
  copies: 2,
  synopsis:
  'The Culling Game tightens. Cursed technique reveals land one after another with no room to breathe.',
  plate: ['JUJUTSU', 'KAISEN'],
  plateColor: '#543822',
  plateInk: '#f3d793'
},
{
  id: 'my-hero-academia',
  title: 'My Hero Academia',
  author: 'Kohei Horikoshi',
  genre: 'Shonen',
  volume: 39,
  chapters: 9,
  rating: 4.7,
  rarity: 4,
  copies: 4,
  synopsis:
  'The final war arc splits across three fronts, and every class 1-A student gets their moment.',
  plate: ['MY HERO', 'ACADEMIA'],
  plateColor: '#f9d219',
  plateInk: '#543822'
},
{
  id: 'demon-slayer',
  title: 'Demon Slayer',
  author: 'Koyoharu Gotouge',
  genre: 'Action',
  volume: 23,
  chapters: 8,
  rating: 4.9,
  rarity: 5,
  copies: 0,
  synopsis:
  'The last stand against Muzan, drawn with the series at the absolute height of its craft.',
  plate: ['DEMON', 'SLAYER'],
  plateColor: '#953410',
  plateInk: '#f9d219'
},
{
  id: 'frieren',
  title: 'Frieren',
  author: 'Kanehito Yamada',
  genre: 'Fantasy',
  volume: 12,
  chapters: 10,
  rating: 4.9,
  rarity: 5,
  copies: 2,
  synopsis:
  'A slow walk north through a world that keeps outliving the people who shaped it.',
  plate: ['FRIEREN'],
  plateColor: '#efce8e',
  plateInk: '#543822'
},
{
  id: 'blue-lock',
  title: 'Blue Lock',
  author: 'Muneyuki Kaneshiro',
  genre: 'Sports',
  volume: 26,
  chapters: 9,
  rating: 4.8,
  rarity: 3,
  copies: 6,
  synopsis:
  'The neo-egoist league raises the stakes again as strikers rebuild their instincts mid-match.',
  plate: ['BLUE', 'LOCK'],
  plateColor: '#c4800c',
  plateInk: '#fefefd'
},
{
  id: 'vinland-saga',
  title: 'Vinland Saga',
  author: 'Makoto Yukimura',
  genre: 'Seinen',
  volume: 27,
  chapters: 7,
  rating: 4.9,
  rarity: 5,
  copies: 2,
  synopsis:
  'Thorfinn keeps choosing the harder peace while the world keeps offering him a sword.',
  plate: ['VINLAND', 'SAGA'],
  plateColor: '#543822',
  plateInk: '#efce8e'
},
{
  id: 'kaguya-sama',
  title: 'Kaguya-sama',
  author: 'Aka Akasaka',
  genre: 'Romance',
  volume: 28,
  chapters: 10,
  rating: 4.7,
  rarity: 4,
  copies: 3,
  synopsis:
  'The student council war of confessions reaches its most ridiculous and most sincere chapter yet.',
  plate: ['KAGUYA', 'SAMA'],
  plateColor: '#953410',
  plateInk: '#efce8e'
},
{
  id: 'dungeon-meshi',
  title: 'Dungeon Meshi',
  author: 'Ryoko Kui',
  genre: 'Adventure',
  volume: 14,
  chapters: 8,
  rating: 4.9,
  rarity: 5,
  copies: 1,
  synopsis:
  'Cooking, dungeon ecology, and a party that argues about both in equal measure.',
  plate: ['DUNGEON', 'MESHI'],
  plateColor: '#c4800c',
  plateInk: '#543822'
},
{
  id: 'haikyu',
  title: 'Haikyu!!',
  author: 'Haruichi Furudate',
  genre: 'Sports',
  volume: 45,
  chapters: 9,
  rating: 4.8,
  rarity: 4,
  copies: 4,
  synopsis:
  'The nationals arc lands its final serve with the best paced volleyball on paper.',
  plate: ['HAIKYU!!'],
  plateColor: '#f9d219',
  plateInk: '#953410'
}];


export function volumeById(id: string): Volume | undefined {
  return volumes.find((volume) => volume.id === id);
}