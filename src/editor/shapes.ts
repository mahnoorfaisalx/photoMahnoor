// Vector shape path definitions in a 100x100 unit box
export const SHAPE_PATHS: Record<string, string> = {
  star: 'M50 2 L61.8 35.4 L97.6 35.4 L68.8 56.6 L79.4 90.4 L50 70 L20.6 90.4 L31.2 56.6 L2.4 35.4 L38.2 35.4 Z',
  triangle: 'M50 2 L98 98 L2 98 Z',
  polygon: 'M50 2 L91.6 26 L91.6 74 L50 98 L8.4 74 L8.4 26 Z',
  diamond: 'M50 2 L98 50 L50 98 L2 50 Z',
  bubble:
    'M12 4 H88 Q98 4 98 14 V62 Q98 72 88 72 H40 L22 94 L26 72 H12 Q2 72 2 62 V14 Q2 4 12 4 Z',
  heart:
    'M50 92 C20 70 2 52 2 30 C2 14 14 4 28 4 C38 4 46 10 50 18 C54 10 62 4 72 4 C86 4 98 14 98 30 C98 52 80 70 50 92 Z',
};

export const FONT_LIST: { name: string; google?: boolean }[] = [
  { name: 'Inter', google: true },
  { name: 'Roboto', google: true },
  { name: 'Open Sans', google: true },
  { name: 'Montserrat', google: true },
  { name: 'Poppins', google: true },
  { name: 'Lato', google: true },
  { name: 'Nunito', google: true },
  { name: 'Raleway', google: true },
  { name: 'Rubik', google: true },
  { name: 'Oswald', google: true },
  { name: 'Anton', google: true },
  { name: 'Bebas Neue', google: true },
  { name: 'Playfair Display', google: true },
  { name: 'Merriweather', google: true },
  { name: 'Lobster', google: true },
  { name: 'Pacifico', google: true },
  { name: 'Dancing Script', google: true },
  { name: 'Caveat', google: true },
  { name: 'Permanent Marker', google: true },
  { name: 'Source Code Pro', google: true },
  { name: 'Arial' },
  { name: 'Helvetica' },
  { name: 'Georgia' },
  { name: 'Times New Roman' },
  { name: 'Courier New' },
  { name: 'Verdana' },
  { name: 'Impact' },
  { name: 'Trebuchet MS' },
  { name: 'Comic Sans MS' },
  { name: 'system-ui' },
];

const loadedFonts = new Set<string>();

/** Load a Google font (best-effort; falls back silently when offline). */
export async function ensureFont(name: string, weight: string | number = 'normal', style = 'normal'): Promise<void> {
  const f = FONT_LIST.find((x) => x.name === name);
  if (f?.google && !loadedFonts.has(name)) {
    loadedFonts.add(name);
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name).replace(/%20/g, '+')}:ital,wght@0,400;0,700;1,400;1,700&display=swap`;
    document.head.appendChild(link);
    await new Promise<void>((res) => {
      link.onload = () => res();
      link.onerror = () => res();
      setTimeout(res, 4000);
    });
  }
  try {
    await Promise.race([
      document.fonts.load(`${style} ${weight === 'bold' ? 700 : weight} 32px "${name}"`),
      new Promise((r) => setTimeout(r, 3000)),
    ]);
  } catch {
    /* ignore */
  }
}

export const TEXT_STYLES: { name: string; props: Record<string, unknown> }[] = [
  { name: 'Heading', props: { fontFamily: 'Montserrat', fontWeight: 'bold', fontSize: 96, fill: '#111111' } },
  { name: 'Subheading', props: { fontFamily: 'Montserrat', fontWeight: 'normal', fontSize: 48, fill: '#333333' } },
  { name: 'Body', props: { fontFamily: 'Inter', fontWeight: 'normal', fontSize: 32, fill: '#222222' } },
  {
    name: 'Meme',
    props: { fontFamily: 'Anton', fontSize: 88, fill: '#ffffff', stroke: '#000000', strokeWidth: 4, paintFirst: 'stroke' },
  },
  {
    name: 'Neon',
    props: {
      fontFamily: 'Pacifico',
      fontSize: 80,
      fill: '#ff4fd8',
      shadow: { color: '#ff4fd8', blur: 30, offsetX: 0, offsetY: 0 },
    },
  },
  {
    name: 'Label',
    props: { fontFamily: 'Inter', fontWeight: 'bold', fontSize: 28, fill: '#ffffff', backgroundColor: '#ff3b30' },
  },
  { name: 'Handwritten', props: { fontFamily: 'Caveat', fontSize: 64, fill: '#1d4ed8' } },
  { name: 'Code', props: { fontFamily: 'Source Code Pro', fontSize: 28, fill: '#10b981', backgroundColor: '#111827' } },
];
