// Non-destructive image adjustments → Fabric filter stacks
import { filters, FabricImage } from 'fabric';

export interface Adjustments {
  brightness: number; // -100..100
  contrast: number; // -100..100
  saturation: number; // -100..100
  vibrance: number; // -100..100
  hue: number; // -180..180
  temperature: number; // -100..100
  tint: number; // -100..100
  exposure: number; // -100..100 (gamma)
  sharpness: number; // 0..100
  blur: number; // 0..100
  noise: number; // 0..100
  pixelate: number; // 0..50
  grayscale: boolean;
  sepia: boolean;
  invert: boolean;
  vintage: boolean;
}

export const DEFAULT_ADJUST: Adjustments = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  vibrance: 0,
  hue: 0,
  temperature: 0,
  tint: 0,
  exposure: 0,
  sharpness: 0,
  blur: 0,
  noise: 0,
  pixelate: 0,
  grayscale: false,
  sepia: false,
  invert: false,
  vintage: false,
};

export const ADJUST_PRESETS: { name: string; adjust: Partial<Adjustments> }[] = [
  { name: 'Original', adjust: {} },
  { name: 'Vivid', adjust: { saturation: 30, vibrance: 25, contrast: 12 } },
  { name: 'Warm', adjust: { temperature: 35, saturation: 8 } },
  { name: 'Cool', adjust: { temperature: -35, tint: -5 } },
  { name: 'B&W', adjust: { grayscale: true, contrast: 15 } },
  { name: 'Noir', adjust: { grayscale: true, contrast: 45, brightness: -8 } },
  { name: 'Vintage', adjust: { vintage: true, contrast: -6 } },
  { name: 'Sepia', adjust: { sepia: true } },
  { name: 'Fade', adjust: { contrast: -25, brightness: 8, saturation: -20 } },
  { name: 'Dramatic', adjust: { contrast: 35, saturation: -10, sharpness: 30, exposure: -10 } },
  { name: 'Crisp', adjust: { sharpness: 45, contrast: 8 } },
  { name: 'Sunset', adjust: { temperature: 45, tint: 15, saturation: 15 } },
];

export function normalizeAdjust(a?: Partial<Adjustments> | null): Adjustments {
  return { ...DEFAULT_ADJUST, ...(a || {}) };
}

export function isDefaultAdjust(a?: Partial<Adjustments> | null) {
  const n = normalizeAdjust(a);
  return (Object.keys(DEFAULT_ADJUST) as (keyof Adjustments)[]).every((k) => n[k] === DEFAULT_ADJUST[k]);
}

export function buildFilters(a: Adjustments) {
  const out: filters.BaseFilter<string, any>[] = [];
  if (a.exposure) {
    const g = Math.pow(2, -a.exposure / 100);
    out.push(new filters.Gamma({ gamma: [g, g, g] }));
  }
  if (a.brightness) out.push(new filters.Brightness({ brightness: a.brightness / 200 }));
  if (a.contrast) out.push(new filters.Contrast({ contrast: a.contrast / 150 }));
  if (a.saturation) out.push(new filters.Saturation({ saturation: a.saturation / 100 }));
  if (a.vibrance) out.push(new filters.Vibrance({ vibrance: a.vibrance / 100 }));
  if (a.hue) out.push(new filters.HueRotation({ rotation: a.hue / 180 }));
  if (a.temperature || a.tint) {
    const t = a.temperature / 100;
    const n = a.tint / 100;
    // warm: +red -blue, tint: +magenta(-green)
    out.push(
      new filters.ColorMatrix({
        matrix: [
          1, 0, 0, 0, t * 0.12 + n * 0.03,
          0, 1, 0, 0, t * 0.02 - n * 0.08,
          0, 0, 1, 0, -t * 0.12 + n * 0.03,
          0, 0, 0, 1, 0,
        ],
        colorsOnly: true,
      }),
    );
  }
  if (a.grayscale) out.push(new filters.Grayscale());
  if (a.sepia) out.push(new filters.Sepia());
  if (a.vintage) out.push(new filters.Vintage());
  if (a.invert) out.push(new filters.Invert());
  if (a.sharpness > 0) {
    const s = (a.sharpness / 100) * 1.2;
    out.push(new filters.Convolute({ matrix: [0, -s, 0, -s, 1 + 4 * s, -s, 0, -s, 0] }));
  }
  if (a.blur > 0) out.push(new filters.Blur({ blur: a.blur / 200 }));
  if (a.noise > 0) out.push(new filters.Noise({ noise: a.noise * 3 }));
  if (a.pixelate > 1) out.push(new filters.Pixelate({ blocksize: Math.round(a.pixelate) }));
  return out;
}

export function applyAdjustments(img: FabricImage, adjust: Partial<Adjustments>) {
  const a = normalizeAdjust(adjust);
  (img as any).adjust = a;
  img.filters = buildFilters(a);
  img.applyFilters();
}
