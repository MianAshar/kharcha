export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'food',          name: 'Food & Dining',    icon: '🍽️',  color: '#FF6B6B' },
  { id: 'transport',     name: 'Transport',         icon: '🚗',  color: '#4ECDC4' },
  { id: 'groceries',     name: 'Groceries',         icon: '🛒',  color: '#45B7D1' },
  { id: 'shopping',      name: 'Shopping',          icon: '🛍️',  color: '#96CEB4' },
  { id: 'utilities',     name: 'Utilities',         icon: '💡',  color: '#FFEAA7' },
  { id: 'health',        name: 'Health',            icon: '💊',  color: '#DDA0DD' },
  { id: 'entertainment', name: 'Entertainment',     icon: '🎬',  color: '#F0E68C' },
  { id: 'education',     name: 'Education',         icon: '📚',  color: '#98FB98' },
  { id: 'fuel',          name: 'Fuel',              icon: '⛽',  color: '#FFB347' },
  { id: 'rent',          name: 'Rent & Housing',    icon: '🏠',  color: '#87CEEB' },
  { id: 'mobile',        name: 'Mobile & Internet', icon: '📱',  color: '#DEB887' },
  { id: 'travel',        name: 'Travel',            icon: '✈️',  color: '#20B2AA' },
  { id: 'clothing',      name: 'Clothing',          icon: '👗',  color: '#FF69B4' },
  { id: 'coffee',        name: 'Cafe & Coffee',     icon: '☕',  color: '#A0522D' },
  { id: 'other',         name: 'Other',             icon: '📦',  color: '#B0B0B0' },
];

export const CATEGORY_MAP = Object.fromEntries(
  DEFAULT_CATEGORIES.map((c) => [c.id, c])
);
