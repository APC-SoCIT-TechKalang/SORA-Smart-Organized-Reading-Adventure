export type RewardCategory = 'Snacks' | 'Drinks' | 'Noodles' | 'Korean Picks' | 'Filipino Picks' | 'Energy Drinks';

export interface DisplayReward {
  id: string;
  name: string;
  points: number | null;
  image: string | null;
  categories: RewardCategory[];
  illustrative: boolean;
}

// Locally stored, transparent package images from the product manufacturers.
export const verifiedRewardImages: Record<string, string> = {
  'nova': '/rewards/nova.png',
  'milo ready-to-drink': '/rewards/milo-ready-to-drink.png',
  'samyang buldak original': '/rewards/buldak-original.png',
};

export const featuredRewardNames = ['Nova', 'Milo Ready-to-Drink', 'Samyang Buldak Original'];

export function rewardImage(name: string, supplied: string | null): string | null {
  return verifiedRewardImages[rewardIdentity(name)] ?? supplied;
}

const names: Array<[string, RewardCategory[]]> = [
  ['Nova', ['Snacks', 'Filipino Picks']], ['Oishi Prawn Crackers', ['Snacks', 'Filipino Picks']],
  ['Chippy', ['Snacks', 'Filipino Picks']], ['Piattos', ['Snacks', 'Filipino Picks']],
  ['Mr. Chips', ['Snacks', 'Filipino Picks']], ['Moby', ['Snacks', 'Filipino Picks']],
  ['V-Cut', ['Snacks', 'Filipino Picks']], ['Roller Coaster', ['Snacks', 'Filipino Picks']],
  ['Mang Juan', ['Snacks', 'Filipino Picks']], ['Boy Bawang', ['Snacks', 'Filipino Picks']],
  ['Clover Chips', ['Snacks', 'Filipino Picks']], ['Nagaraya', ['Snacks', 'Filipino Picks']],
  ['SkyFlakes', ['Snacks', 'Filipino Picks']], ['Fita', ['Snacks', 'Filipino Picks']],
  ['Rebisco Crackers', ['Snacks', 'Filipino Picks']], ['Cream-O', ['Snacks', 'Filipino Picks']],
  ['Dewberry', ['Snacks', 'Filipino Picks']], ['Choco Mucho', ['Snacks', 'Filipino Picks']],
  ['Flat Tops', ['Snacks', 'Filipino Picks']], ['Cloud 9', ['Snacks', 'Filipino Picks']],
  ['Bottled Water', ['Drinks']], ['C2 Green Tea', ['Drinks', 'Filipino Picks']],
  ['Milo Ready-to-Drink', ['Drinks']], ['Kopiko Lucky Day Coffee', ['Drinks', 'Filipino Picks']],
  ['Coca-Cola Original', ['Drinks']], ['Coca-Cola Zero Sugar', ['Drinks']],
  ['Sprite', ['Drinks']], ['Royal Tru-Orange', ['Drinks', 'Filipino Picks']],
  ['Zesto', ['Drinks', 'Filipino Picks']], ['Chuckie', ['Drinks', 'Filipino Picks']],
  ['Dutch Mill', ['Drinks']], ['Yakult', ['Drinks']], ['Pocari Sweat', ['Drinks']],
  ['Samyang Buldak Original', ['Noodles', 'Korean Picks']],
  ['Samyang Buldak Carbonara', ['Noodles', 'Korean Picks']],
  ['Samyang Buldak Cheese', ['Noodles', 'Korean Picks']],
  ['Nongshim Shin Ramyun', ['Noodles', 'Korean Picks']],
  ['Nongshim Chapagetti', ['Noodles', 'Korean Picks']],
  ['Ottogi Jin Ramen', ['Noodles', 'Korean Picks']],
  ['Nongshim Neoguri', ['Noodles', 'Korean Picks']],
  ['Lucky Me! Pancit Canton Original', ['Noodles', 'Filipino Picks']],
  ['Lucky Me! Pancit Canton Chilimansi', ['Noodles', 'Filipino Picks']],
  ['Lucky Me! Pancit Canton Sweet and Spicy', ['Noodles', 'Filipino Picks']],
  ['Lucky Me! Cup Noodles', ['Noodles', 'Filipino Picks']],
  ['Lotte Milkis', ['Drinks', 'Korean Picks']], ['Binggrae Banana Milk', ['Drinks', 'Korean Picks']],
  ['Lotte Chilsung Cider', ['Drinks', 'Korean Picks']], ['Lotte Let’s Be Coffee', ['Drinks', 'Korean Picks']],
  ['Haitai Grape Bong Bong', ['Drinks', 'Korean Picks']], ['OKF Aloe Vera Drink', ['Drinks', 'Korean Picks']],
  ['Monster Energy Original', ['Drinks', 'Energy Drinks']], ['Monster Ultra', ['Drinks', 'Energy Drinks']],
  ['Red Bull', ['Drinks', 'Energy Drinks']], ['Sting', ['Drinks', 'Energy Drinks', 'Filipino Picks']],
  ['Cobra Energy Drink', ['Drinks', 'Energy Drinks', 'Filipino Picks']],
];

export const demonstrationRewards: DisplayReward[] = names.map(([name, categories], index) => ({
  id: `demo-${index}`, name, points: null, image: null, categories, illustrative: true,
}));

export function rewardIdentity(name: string): string {
  const normalized = name.trim().toLocaleLowerCase();
  return normalized === 'c2 drink' ? 'c2 green tea' : normalized;
}

export function categoriesForReward(name: string, category: string): RewardCategory[] {
  const match = names.find(([item]) => rewardIdentity(item) === rewardIdentity(name));
  return match?.[1] ?? (category === 'Drinks' ? ['Drinks'] : ['Snacks']);
}
