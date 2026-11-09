// Reusable presets: canvas sizes, adjustment looks and text styles (built-in + user-saved in localStorage)
import type { Adjustments } from './adjustments';

export interface SizePreset {
  name: string;
  w: number;
  h: number;
  group: string;
  custom?: boolean;
}

export const SIZE_PRESETS: SizePreset[] = [
  { group: 'Social', name: 'Instagram Post', w: 1080, h: 1080 },
  { group: 'Social', name: 'Instagram Portrait', w: 1080, h: 1350 },
  { group: 'Social', name: 'Instagram / TikTok Story', w: 1080, h: 1920 },
  { group: 'Social', name: 'Facebook Post', w: 1200, h: 630 },
  { group: 'Social', name: 'X / Twitter Post', w: 1600, h: 900 },
  { group: 'Social', name: 'X / Twitter Header', w: 1500, h: 500 },
  { group: 'Social', name: 'LinkedIn Banner', w: 1584, h: 396 },
  { group: 'Social', name: 'YouTube Thumbnail', w: 1280, h: 720 },
  { group: 'Social', name: 'Pinterest Pin', w: 1000, h: 1500 },
  { group: 'Screen', name: 'HD 720p', w: 1280, h: 720 },
  { group: 'Screen', name: 'Full HD 1080p', w: 1920, h: 1080 },
  { group: 'Screen', name: '4K UHD', w: 3840, h: 2160 },
  { group: 'Screen', name: 'Desktop Wallpaper', w: 2560, h: 1440 },
  { group: 'Screen', name: 'Phone Wallpaper', w: 1170, h: 2532 },
  { group: 'Print (300dpi)', name: 'A4 Portrait', w: 2480, h: 3508 },
  { group: 'Print (300dpi)', name: 'US Letter', w: 2550, h: 3300 },
  { group: 'Print (300dpi)', name: '4×6 Photo', w: 1200, h: 1800 },
  { group: 'Print (300dpi)', name: 'Business Card', w: 1050, h: 600 },
  { group: 'Other', name: 'Presentation 16:9', w: 1920, h: 1080 },
  { group: 'Other', name: 'Square Icon', w: 512, h: 512 },
  { group: 'Other', name: 'Favicon', w: 64, h: 64 },
];

function load<T>(key: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch {
    return [];
  }
}
function save<T>(key: string, v: T[]) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage full / blocked */
  }
}

export const customSizes = {
  list: () => load<SizePreset>('pm.sizes').map((p) => ({ ...p, custom: true, group: 'My presets' })),
  add: (p: SizePreset) => save('pm.sizes', [...load<SizePreset>('pm.sizes').filter((x) => x.name !== p.name), p]),
  remove: (name: string) => save('pm.sizes', load<SizePreset>('pm.sizes').filter((x) => x.name !== name)),
};

export const customLooks = {
  list: () => load<{ name: string; adjust: Partial<Adjustments> }>('pm.looks'),
  add: (name: string, adjust: Partial<Adjustments>) =>
    save('pm.looks', [...customLooks.list().filter((x) => x.name !== name), { name, adjust }]),
  remove: (name: string) => save('pm.looks', customLooks.list().filter((x) => x.name !== name)),
};

export const customTextStyles = {
  list: () => load<{ name: string; props: Record<string, unknown> }>('pm.textStyles'),
  add: (name: string, props: Record<string, unknown>) =>
    save('pm.textStyles', [...customTextStyles.list().filter((x) => x.name !== name), { name, props }]),
  remove: (name: string) => save('pm.textStyles', customTextStyles.list().filter((x) => x.name !== name)),
};

export interface BatchRecipe {
  name: string;
  recipe: Record<string, unknown>;
}
export const batchRecipes = {
  list: () => load<BatchRecipe>('pm.batch'),
  add: (r: BatchRecipe) => save('pm.batch', [...batchRecipes.list().filter((x) => x.name !== r.name), r]),
  remove: (name: string) => save('pm.batch', batchRecipes.list().filter((x) => x.name !== name)),
};
